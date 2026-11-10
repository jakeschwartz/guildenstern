-- Mira's rundown: a twice-daily push (about 8am and 8pm local) that gives each
-- person a reason to open the app, plus the data to learn which pushes work.
--
-- Each slot, the send-rundown edge function drafts every push variant that has
-- something real to say (a question from your partner, your list, what's new,
-- your day, what got handled, an invitation), picks one, sends it, and records
-- the run. push_log + app_opens let it favor the variants that actually get the
-- app opened.

-- 1. When each card was finished, for "Handled today" / "since yesterday".
alter table public.ops_cards
  add column if not exists done_at timestamptz;

create or replace function public.stamp_ops_card_done_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.done_at := now();
  elsif new.status is distinct from 'done' then
    new.done_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_done_at on public.ops_cards;
create trigger stamp_done_at
  before update on public.ops_cards
  for each row execute function public.stamp_ops_card_done_at();

-- 2. App opens and timezone. The app calls record_app_open on launch and on
--    returning to the foreground (throttled client-side).
alter table public.profiles
  add column if not exists timezone text,
  add column if not exists last_active_at timestamptz;

create table if not exists public.app_opens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  opened_at timestamptz not null default now()
);

create index if not exists app_opens_user_idx
  on public.app_opens (user_id, opened_at desc);

alter table public.app_opens enable row level security;

drop policy if exists "read own opens" on public.app_opens;
create policy "read own opens" on public.app_opens
  for select using (user_id = auth.uid());

create or replace function public.record_app_open(p_timezone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;
  insert into public.app_opens (user_id) values (v_user);
  update public.profiles
  set last_active_at = now(),
      timezone = coalesce(nullif(btrim(p_timezone), ''), timezone)
  where id = v_user;
end;
$$;

grant execute on function public.record_app_open(text) to authenticated;

-- 3. Which variant and slot each push was.
alter table public.push_log
  add column if not exists variant text,
  add column if not exists slot text;

-- 4. One row per person per local day per slot. Claimed before sending, so
--    overlapping runs can't double-send, and it records skips too.
create table if not exists public.rundown_runs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  slot text not null check (slot in ('am', 'pm')),
  outcome text not null default 'claimed',
  variant text,
  candidates text[],
  created_at timestamptz not null default now(),
  primary key (user_id, local_date, slot)
);

-- Service role only: no client policies.
alter table public.rundown_runs enable row level security;

-- 5. Check every 15 minutes for anyone whose slot has come up.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-rundowns') then
    perform cron.unschedule('send-rundowns');
  end if;
  perform cron.schedule(
    'send-rundowns',
    '*/15 * * * *',
    $cron$
      select net.http_post(
        url := 'https://psthqrdqggqgekqbansb.supabase.co/functions/v1/send-rundown',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cron$
  );
end $$;
