-- Notifications tuned for "I keep opening this": fewer buzzes, each one
-- meaningful, and nobody pushed about their own action.
--
-- Before: every agent message pushed BOTH partners (agent messages have no
-- author to exclude), so Jake got "Otis: Jake done: X" about his own tap. And
-- Otis's running summary lines update in place for 24h, which never fires the
-- INSERT push trigger, so only the FIRST thing done each day reached Jenny.
--
-- Now:
--   - Card events push the person they matter to, every batch:
--       done     → requester (source_user_id), active   "✓ Jake handled it"
--       accepted → requester, passive (silent, lands in Notification Center)
--       passed   → new owner, active
--     The Otis summary line still posts/updates in the thread but no longer
--     pushes (send-push skips messages with a summary_key).
--   - Nobody is pushed about their own action: card events skip whoever made
--     the change (acted_by), and agent relays skip on_behalf_of.
--   - push_log records every push and whether it was tapped, so "optimize"
--     has data behind it.

-- 1. Agent messages relayed for a person (clarify_ops_card) name that person,
--    so send-push treats the relay as sent by them: they aren't pushed, their
--    partner is (actively).
alter table public.messages
  add column if not exists on_behalf_of uuid references public.profiles(id);

-- 2. Who actually made each card change. owner_id says whose card it is, but
--    either partner can tap Done; the clicker shouldn't be pushed about it.
alter table public.pending_announcements
  add column if not exists acted_by uuid references auth.users(id) on delete set null;

-- 3. Push log: one row per (push, recipient). opened_at is stamped when the
--    recipient taps the notification (mark_push_opened).
create table if not exists public.push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  level text not null check (level in ('active', 'passive')),
  thread_id uuid references public.threads(id) on delete set null,
  sent_at timestamptz not null default now(),
  opened_at timestamptz
);

create index if not exists push_log_user_sent_idx
  on public.push_log (user_id, sent_at desc);

alter table public.push_log enable row level security;

drop policy if exists "read own push log" on public.push_log;
create policy "read own push log" on public.push_log
  for select using (user_id = auth.uid());

-- Clients only ever stamp opened_at on their own rows, so a narrow RPC instead
-- of an UPDATE policy.
create or replace function public.mark_push_opened(p_push_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_log
  set opened_at = now()
  where id = p_push_id
    and user_id = auth.uid()
    and opened_at is null;
$$;

grant execute on function public.mark_push_opened(uuid) to authenticated;

-- 4. Status trigger: same as batch_announcements, plus acted_by. auth.uid() is
--    the tapping user when the UPDATE comes through the API; null for
--    server-side changes.
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

  -- Latest state per card wins: accept-then-done collapses to one "done".
  delete from public.pending_announcements where card_id = new.id;

  insert into public.pending_announcements
    (card_id, user_id, thread_id, verb, card_title, to_user_id, scheduled_at, acted_by)
  values
    (new.id, this_user_id, new.thread_id, this_verb, new.title,
     this_to_user_id, now() + debounce_window, auth.uid());

  -- Extend the window for the rest of this group so a burst batches.
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

-- 5. Drain: same find-or-update summary logic as running_summaries, plus one
--    dedicated push per recipient for every batch.
create or replace function public.drain_pending_announcements()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  grp record;
  rcpt record;
  actor_first text;
  to_first text;
  titles_new text[];
  existing_id uuid;
  existing_titles text[];
  merged_titles text[];
  line_body text;
  s_key text;
  summary_window interval := interval '24 hours';
  uniform_to_id uuid;
  to_ids uuid[];
begin
  for grp in
    select distinct user_id, thread_id, verb
    from public.pending_announcements
    where scheduled_at <= now()
  loop
    -- Activity still in-flight for this group? Defer.
    if exists (
      select 1 from public.pending_announcements
      where user_id = grp.user_id and thread_id = grp.thread_id
        and verb = grp.verb and scheduled_at > now()
    ) then
      continue;
    end if;

    -- Titles from this batch.
    select array_agg(card_title order by created_at)
    into titles_new
    from public.pending_announcements
    where user_id = grp.user_id and thread_id = grp.thread_id
      and verb = grp.verb and scheduled_at <= now();

    -- Recipient is only meaningful for passed; uniform if single.
    uniform_to_id := null;
    if grp.verb = 'passed' then
      select array_agg(distinct to_user_id) into to_ids
      from public.pending_announcements
      where user_id = grp.user_id and thread_id = grp.thread_id
        and verb = 'passed' and scheduled_at <= now();
      if array_length(to_ids, 1) = 1 then
        uniform_to_id := to_ids[1];
      end if;
    end if;

    -- Actor first name.
    select coalesce(nullif(split_part(name, ' ', 1), ''), 'Your partner')
    into actor_first
    from public.profiles
    where id = grp.user_id;
    actor_first := coalesce(actor_first, 'Your partner');

    -- Look up existing open summary within 24h.
    s_key := grp.user_id::text || ':' || grp.thread_id::text || ':' || grp.verb;
    existing_id := null;
    existing_titles := null;
    select id, coalesce(summary_titles, '{}'::text[])
    into existing_id, existing_titles
    from public.messages
    where thread_id = grp.thread_id
      and summary_key = s_key
      and created_at > now() - summary_window
    order by created_at desc
    limit 1;

    -- Merge: keep existing order, append new titles that aren't already in.
    if existing_id is not null then
      merged_titles := existing_titles;
      for i in 1..array_length(titles_new, 1) loop
        if not (titles_new[i] = any(merged_titles)) then
          merged_titles := merged_titles || titles_new[i];
        end if;
      end loop;
    else
      merged_titles := titles_new;
    end if;

    -- Compose body.
    if grp.verb = 'accepted' then
      line_body := actor_first || '''s got: ' || array_to_string(merged_titles, ', ');
    elsif grp.verb = 'done' then
      line_body := actor_first || ' done: ' || array_to_string(merged_titles, ', ');
    elsif grp.verb = 'passed' then
      if uniform_to_id is not null then
        select coalesce(nullif(split_part(name, ' ', 1), ''), 'their partner')
        into to_first
        from public.profiles
        where id = uniform_to_id;
        to_first := coalesce(to_first, 'their partner');
        line_body := actor_first || ' passed ' || array_to_string(merged_titles, ', ') || ' to ' || to_first;
      else
        line_body := actor_first || ' passed: ' || array_to_string(merged_titles, ', ');
      end if;
    else
      continue;
    end if;

    -- Insert or Update.
    if existing_id is not null then
      update public.messages
      set body = line_body,
          summary_titles = merged_titles,
          summary_to_user_id = case
            when grp.verb = 'passed' then uniform_to_id
            else summary_to_user_id
          end
      where id = existing_id;
    else
      insert into public.messages
        (thread_id, author_kind, author_user_id, body,
         summary_key, summary_titles, summary_to_user_id)
      values
        (grp.thread_id, 'agent', null, line_body,
         s_key, merged_titles, uniform_to_id);
    end if;

    -- Pass-cancels-Accept: remove these titles from the actor's open Accept
    -- summary. Done does NOT cancel Accept — the "got" line is the record
    -- of commitment regardless of subsequent completion.
    if grp.verb = 'passed' then
      perform public.remove_titles_from_summary(
        grp.user_id, grp.thread_id, 'accepted', titles_new, actor_first
      );
    end if;

    -- Dedicated pushes, one per recipient, for just this batch's titles.
    -- done/accepted go to whoever asked for the card; passed goes to the new
    -- owner. Never to the card's owner or to whoever made the change.
    for rcpt in
      select case when grp.verb = 'passed' then p.to_user_id
                  else c.source_user_id end as user_id,
             jsonb_agg(p.card_title order by p.created_at) as titles
      from public.pending_announcements p
      join public.ops_cards c on c.id = p.card_id
      where p.user_id = grp.user_id and p.thread_id = grp.thread_id
        and p.verb = grp.verb and p.scheduled_at <= now()
        and (case when grp.verb = 'passed' then p.to_user_id
                  else c.source_user_id end) is not null
        and (case when grp.verb = 'passed' then p.to_user_id
                  else c.source_user_id end) is distinct from grp.user_id
        and (case when grp.verb = 'passed' then p.to_user_id
                  else c.source_user_id end) is distinct from p.acted_by
      group by 1
    loop
      perform net.http_post(
        url := 'https://psthqrdqggqgekqbansb.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'type', 'CARD_EVENT',
          'event', grp.verb,
          'actor_id', grp.user_id,
          'recipient_id', rcpt.user_id,
          'thread_id', grp.thread_id,
          'titles', rcpt.titles
        )
      );
    end loop;

    -- Clean up processed pending rows.
    delete from public.pending_announcements
    where user_id = grp.user_id and thread_id = grp.thread_id
      and verb = grp.verb and scheduled_at <= now();
  end loop;
end;
$$;

-- 6. clarify_ops_card: same as before, but the relayed Otis question is
--    stamped on_behalf_of the asker so only their partner gets pushed.
create or replace function public.clarify_ops_card(p_card_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_card public.ops_cards%rowtype;
  v_name text;
  v_first text;
  v_note text;
  v_body text;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_card from public.ops_cards where id = p_card_id;
  if not found then
    raise exception 'Card not found';
  end if;

  -- Security definer bypasses RLS, so re-check thread access explicitly.
  if not public.can_access_thread(v_card.thread_id) then
    raise exception 'Not authorized';
  end if;

  -- Asker's first name, mirroring the client's firstName() helper:
  -- name.split(" ")[0] || "they".
  select name into v_name from public.profiles where id = v_user;
  v_first := split_part(coalesce(v_name, ''), ' ', 1);
  if v_first = '' then
    v_first := 'they';
  end if;

  v_note := btrim(coalesce(p_note, ''));
  v_body := 'Quick one from ' || v_first || ' on “' || v_card.title || '”: '
    || case
         when v_note <> '' then v_note
         else 'could you clarify what''s needed here?'
       end;

  -- Otis (agent) message relayed into the card's thread.
  insert into public.messages (thread_id, author_kind, author_user_id, body, on_behalf_of)
  values (v_card.thread_id, 'agent', null, v_body, v_user);

  -- Stamp the card's clarification in client shape.
  update public.ops_cards
  set clarification = jsonb_build_object(
    'note', v_note,
    'askedByUserId', v_user,
    'askedAt', (extract(epoch from now()) * 1000)::bigint,
    'status', 'open'
  )
  where id = p_card_id;
end;
$$;
