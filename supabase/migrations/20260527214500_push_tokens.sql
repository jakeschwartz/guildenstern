-- Push notification device tokens. One row per (user, device-token).
-- The edge function `send-push` reads from here to fan out APNs notifications
-- to the recipient(s) on new messages.

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  -- Whether this token is for production APNs (App Store / TestFlight) or
  -- sandbox APNs (Xcode debug build). Set on register based on Capacitor build.
  apns_env text check (apns_env in ('production', 'sandbox')),
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

create index on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "read own tokens" on public.push_tokens
  for select using (user_id = auth.uid());
create policy "insert own tokens" on public.push_tokens
  for insert with check (user_id = auth.uid());
create policy "update own tokens" on public.push_tokens
  for update using (user_id = auth.uid());
create policy "delete own tokens" on public.push_tokens
  for delete using (user_id = auth.uid());

-- Extend the existing message trigger to also fire send-push.
create or replace function public.notify_send_push_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Push for every new message (human or agent). Filter recipients in the
  -- edge function so the sender doesn't get their own.
  perform net.http_post(
    url := 'https://psthqrdqggqgekqbansb.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'messages',
      'record', row_to_json(new)
    )
  );
  return new;
end;
$$;

create trigger on_message_for_push
  after insert on public.messages
  for each row execute function public.notify_send_push_on_message();
