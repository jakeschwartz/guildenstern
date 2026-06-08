-- Batch / debounce Otis announcements. Was: one chat line per status flip,
-- which got noisy fast ("Jake's got: A", "Jake's got: B", "Jake's got: C"...
-- five lines for one triage session). New model: every actor's activity in
-- the same thread+verb collapses into one summary line per quiet window.
--
-- Mechanism:
--   1. Trigger on ops_cards.UPDATE writes to pending_announcements instead
--      of firing an HTTP call directly. New activity extends the window
--      on already-pending rows in the same actor+thread+verb group.
--   2. One row per card_id (latest state supersedes). Accept → Pass cancels
--      the Accept; Accept → Done collapses to Done.
--   3. pg_cron job runs every 30 seconds: finds groups whose window has
--      passed AND no future-scheduled rows remain (i.e. activity actually
--      went quiet), composes a single Otis message ("Jake's got: A, B, C"),
--      posts it, deletes the rows.

create extension if not exists pg_cron with schema extensions;

create table if not exists public.pending_announcements (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null unique references public.ops_cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  verb text not null check (verb in ('accepted', 'done', 'passed')),
  card_title text not null,
  to_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  scheduled_at timestamptz not null
);

create index if not exists pending_announcements_due_idx
  on public.pending_announcements (scheduled_at);

-- Replace the immediate-HTTP trigger with the queue version.
create or replace function public.notify_otis_on_card_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  this_verb text;
  this_user_id uuid;
  this_to_user_id uuid;
  debounce_window interval := interval '30 seconds';
begin
  -- Decide which verb (if any) this UPDATE represents.
  if new.status is distinct from old.status
     and new.status in ('accepted', 'done') then
    this_verb := new.status;
    this_user_id := new.owner_id;
    this_to_user_id := null;
  elsif new.owner_id is distinct from old.owner_id then
    this_verb := 'passed';
    this_user_id := old.owner_id;
    this_to_user_id := new.owner_id;
  else
    return new;
  end if;

  -- Latest state per card wins. Drop any prior pending for this card so
  -- accept-then-done collapses to one "done" line.
  delete from public.pending_announcements where card_id = new.id;

  -- Insert the new pending row.
  insert into public.pending_announcements
    (card_id, user_id, thread_id, verb, card_title, to_user_id, scheduled_at)
  values
    (new.id, this_user_id, new.thread_id, this_verb, new.title,
     this_to_user_id, now() + debounce_window);

  -- Extend the window for already-pending rows in the same group, so a
  -- burst of activity batches into one announcement.
  update public.pending_announcements
  set scheduled_at = now() + debounce_window
  where user_id = this_user_id
    and thread_id = new.thread_id
    and verb = this_verb
    and scheduled_at > now()
    and card_id != new.id;

  return new;
end;
$$;

-- Drain function: composes + posts agent messages for ready groups.
create or replace function public.drain_pending_announcements()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  grp record;
  actor_first text;
  to_first text;
  titles_csv text;
  line text;
  to_ids uuid[];
begin
  for grp in
    select distinct user_id, thread_id, verb
    from public.pending_announcements
    where scheduled_at <= now()
  loop
    -- If any row for this group is still future-scheduled, activity is
    -- ongoing — let it batch more. Don't process this group yet.
    if exists (
      select 1 from public.pending_announcements
      where user_id = grp.user_id
        and thread_id = grp.thread_id
        and verb = grp.verb
        and scheduled_at > now()
    ) then
      continue;
    end if;

    -- Concatenate the titles for this group, oldest-first.
    select string_agg(card_title, ', ' order by created_at)
    into titles_csv
    from public.pending_announcements
    where user_id = grp.user_id
      and thread_id = grp.thread_id
      and verb = grp.verb
      and scheduled_at <= now();

    -- Actor's first name.
    select coalesce(nullif(split_part(name, ' ', 1), ''), 'Your partner')
    into actor_first
    from public.profiles
    where id = grp.user_id;
    actor_first := coalesce(actor_first, 'Your partner');

    if grp.verb = 'accepted' then
      line := actor_first || '''s got: ' || titles_csv;
    elsif grp.verb = 'done' then
      line := actor_first || ' done: ' || titles_csv;
    elsif grp.verb = 'passed' then
      -- All passes in this batch could share the same recipient or differ.
      select array_agg(distinct to_user_id)
      into to_ids
      from public.pending_announcements
      where user_id = grp.user_id
        and thread_id = grp.thread_id
        and verb = 'passed'
        and scheduled_at <= now();

      if array_length(to_ids, 1) = 1 and to_ids[1] is not null then
        select coalesce(nullif(split_part(name, ' ', 1), ''), 'their partner')
        into to_first
        from public.profiles
        where id = to_ids[1];
        to_first := coalesce(to_first, 'their partner');
        line := actor_first || ' passed ' || titles_csv || ' to ' || to_first;
      else
        line := actor_first || ' passed: ' || titles_csv;
      end if;
    else
      continue;
    end if;

    -- Post the agent message.
    insert into public.messages (thread_id, author_kind, author_user_id, body)
    values (grp.thread_id, 'agent', null, line);

    -- Clean up processed rows for this group.
    delete from public.pending_announcements
    where user_id = grp.user_id
      and thread_id = grp.thread_id
      and verb = grp.verb
      and scheduled_at <= now();
  end loop;
end;
$$;

-- Schedule the drain to run every 30 seconds. Supabase's pg_cron supports
-- sub-minute via the natural-language interval string.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'drain-pending-announcements') then
    perform cron.unschedule('drain-pending-announcements');
  end if;
  perform cron.schedule(
    'drain-pending-announcements',
    '30 seconds',
    'select public.drain_pending_announcements();'
  );
end $$;
