-- Gmail sync: Mira reads your inbox for household logistics (bills due,
-- appointments, school, contractors, deliveries that need someone home) and
-- surfaces each as a SUGGESTION in your private rundown. Nothing reaches the
-- shared list, or your partner, until you tap "Add". Your inbox stays yours;
-- you choose what crosses into the shared space.
--
-- scan-gmail (edge function, every 30 min + right after connecting) writes
-- one row per scanned message, actionable or not, so nothing is re-read or
-- re-sent to the model. Only the sender name, subject and the extracted item
-- are stored; the email body is never persisted.

create table if not exists public.email_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  from_name text,
  subject text,
  received_at timestamptz,
  -- false = scanned, nothing to do (kept only for dedupe).
  actionable boolean not null default false,
  title text,
  subtitle text,
  due_at timestamptz,
  due_has_time boolean not null default false,
  status text not null default 'new'
    check (status in ('new', 'added', 'dismissed')),
  ops_card_id uuid references public.ops_cards(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, gmail_message_id)
);

create index if not exists email_items_open_idx
  on public.email_items (user_id, created_at desc)
  where actionable and status = 'new';

alter table public.email_items enable row level security;

drop policy if exists "read own email items" on public.email_items;
create policy "read own email items" on public.email_items
  for select using (user_id = auth.uid());
-- No client insert/update policies: writes go through scan-gmail (service
-- role) and the two RPCs below.

alter publication supabase_realtime add table public.email_items;

-- Per-person scan bookkeeping. last_scanned_at doubles as a rate limit (the
-- scheduled trigger is unauthenticated, like send-rundown's).
create table if not exists public.gmail_scan_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_scanned_at timestamptz,
  last_error text
);
alter table public.gmail_scan_state enable row level security;
drop policy if exists "read own scan state" on public.gmail_scan_state;
create policy "read own scan state" on public.gmail_scan_state
  for select using (user_id = auth.uid());

-- Promote a suggestion onto the shared list in your main partnership thread.
-- p_owner = who it's for (you or your partner). Inserting with owner !=
-- source fires the existing "✅ Jake put something on your list" push.
create or replace function public.add_email_item_to_list(
  p_item_id uuid,
  p_owner uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_item public.email_items;
  v_thread uuid;
  v_card uuid;
  v_bucket text;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select * into v_item from public.email_items
  where id = p_item_id and user_id = v_user
  for update;
  if not found then
    raise exception 'email item not found';
  end if;
  if v_item.status = 'added' then
    return v_item.ops_card_id;
  end if;

  -- Your main (default) partnership thread, and the owner must be in it.
  select t.id into v_thread
  from public.threads t
  join public.partnership_members me
    on me.partnership_id = t.partnership_id and me.user_id = v_user
  join public.partnership_members owner
    on owner.partnership_id = t.partnership_id and owner.user_id = p_owner
  where t.kind = 'partnership' and t.is_default
  order by t.created_at
  limit 1;
  if v_thread is null then
    raise exception 'no shared thread with that person';
  end if;

  v_bucket := case
    when v_item.due_at is null then 'week'
    when v_item.due_at < now() + interval '2 days' then 'today'
    when v_item.due_at < now() + interval '7 days' then 'week'
    else 'long'
  end;

  insert into public.ops_cards (
    thread_id, source_message_id, source_user_id, title, subtitle,
    owner_id, when_label, bucket, due_at, due_has_time
  ) values (
    v_thread, null, v_user, v_item.title,
    coalesce(v_item.subtitle, 'From email: ' || coalesce(v_item.from_name, 'inbox')),
    p_owner, 'from email', v_bucket, v_item.due_at, v_item.due_has_time
  )
  returning id into v_card;

  update public.email_items
  set status = 'added', ops_card_id = v_card
  where id = p_item_id;

  return v_card;
end;
$$;
grant execute on function public.add_email_item_to_list(uuid, uuid) to authenticated;

create or replace function public.dismiss_email_item(p_item_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.email_items
  set status = 'dismissed'
  where id = p_item_id and user_id = auth.uid() and status = 'new';
$$;
grant execute on function public.dismiss_email_item(uuid) to authenticated;

-- Scan every 30 minutes. Only people who granted gmail.readonly are touched.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'scan-gmail') then
    perform cron.unschedule('scan-gmail');
  end if;
  perform cron.schedule(
    'scan-gmail',
    '7,37 * * * *',
    $cron$
      select net.http_post(
        url := 'https://psthqrdqggqgekqbansb.supabase.co/functions/v1/scan-gmail',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  );
end $$;
