-- Calendar smarts: twice a day, scan-calendar reads both partners' Google
-- calendars (their main calendar plus shared ones, like a family calendar)
-- for the next few days and writes calendar_notes:
--
--   heads_up  "Worth knowing": something out of the ordinary coming up (a
--             trip, an early start, guests, a school closure). Private to
--             each person's rundown; one row per person it's for, so each
--             can dismiss their own.
--   prep      A to-do the event needs first (buy the gift, book the sitter,
--             find the forms). Shown in the rundown with Mine / <Partner>'s
--             to put it on the shared list, like email suggestions.
--   question  A household event with no clear owner, or a clash that needs a
--             "who's handling this?". Otis asks it in the shared thread
--             (user_id null; message_id once posted).
--
-- dedupe_key keeps each note to once per event, per kind, per person, so a
-- rerun never repeats itself.

create table if not exists public.calendar_notes (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('heads_up', 'prep', 'question')),
  dedupe_key text not null unique,
  event_title text,
  event_start timestamptz,
  event_all_day boolean not null default false,
  note text not null,
  prep_title text,
  due_at timestamptz,
  due_has_time boolean not null default false,
  -- question: pending → asked (posted) | expired (event passed first)
  status text not null default 'new'
    check (status in ('new', 'added', 'dismissed', 'pending', 'asked', 'expired')),
  ops_card_id uuid references public.ops_cards(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists calendar_notes_open_idx
  on public.calendar_notes (user_id, event_start)
  where status = 'new';

alter table public.calendar_notes enable row level security;

drop policy if exists "read own calendar notes" on public.calendar_notes;
create policy "read own calendar notes" on public.calendar_notes
  for select using (
    user_id = auth.uid()
    or (user_id is null and public.is_partnership_member(partnership_id))
  );

alter publication supabase_realtime add table public.calendar_notes;

create table if not exists public.calendar_scan_state (
  partnership_id uuid primary key references public.partnerships(id) on delete cascade,
  last_scanned_at timestamptz,
  last_error text
);
alter table public.calendar_scan_state enable row level security;

-- Put a prep suggestion on the shared list (main thread), for you or your
-- partner. Owner != you fires the usual "put something on your list" push.
create or replace function public.add_calendar_prep(p_note_id uuid, p_owner uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_note public.calendar_notes;
  v_thread uuid;
  v_card uuid;
  v_bucket text;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select * into v_note from public.calendar_notes
  where id = p_note_id and user_id = v_user and kind = 'prep'
  for update;
  if not found then
    raise exception 'suggestion not found';
  end if;
  if v_note.status = 'added' then
    return v_note.ops_card_id;
  end if;

  select t.id into v_thread
  from public.threads t
  join public.partnership_members owner
    on owner.partnership_id = t.partnership_id and owner.user_id = p_owner
  where t.partnership_id = v_note.partnership_id
    and t.kind = 'partnership' and t.is_default
  order by t.created_at
  limit 1;
  if v_thread is null then
    raise exception 'no shared thread with that person';
  end if;

  v_bucket := case
    when v_note.due_at is null then 'week'
    when v_note.due_at < now() + interval '2 days' then 'today'
    when v_note.due_at < now() + interval '7 days' then 'week'
    else 'long'
  end;

  insert into public.ops_cards (
    thread_id, source_message_id, source_user_id, title, subtitle,
    owner_id, when_label, bucket, due_at, due_has_time
  ) values (
    v_thread, null, v_user, coalesce(v_note.prep_title, v_note.note),
    'For ' || coalesce(v_note.event_title, 'a calendar event'),
    p_owner, 'from calendar', v_bucket, v_note.due_at, v_note.due_has_time
  )
  returning id into v_card;

  -- Added for one person = handled for both: retire the twin row, if any.
  update public.calendar_notes
  set status = 'added', ops_card_id = v_card
  where id = p_note_id
     or (partnership_id = v_note.partnership_id and kind = 'prep'
         and status = 'new' and event_title is not distinct from v_note.event_title
         and prep_title is not distinct from v_note.prep_title);

  return v_card;
end;
$$;
grant execute on function public.add_calendar_prep(uuid, uuid) to authenticated;

create or replace function public.dismiss_calendar_note(p_note_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.calendar_notes
  set status = 'dismissed'
  where id = p_note_id and user_id = auth.uid() and status = 'new';
$$;
grant execute on function public.dismiss_calendar_note(uuid) to authenticated;
