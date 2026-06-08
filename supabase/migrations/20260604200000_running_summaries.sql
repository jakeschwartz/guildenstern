-- Otis summaries become "living" messages that update in place over time,
-- rather than fresh batches every 30s. Same actor + thread + verb writes to
-- the same message until 24h of inactivity passes; after that, a new line
-- starts.
--
-- "Jake's got: vaccine, sneakers" + 5h later → same message becomes
-- "Jake's got: vaccine, sneakers, camp deposit". The line stays in its
-- chronological position; realtime UPDATE pushes the new body to anyone
-- looking.
--
-- Pass cancels Accept: if Jake later passes vaccine to Jenny, vaccine
-- drops from the Accept summary and appears in the Pass summary. Done
-- doesn't cancel Accept — the line "Jake's got" is the historical record
-- of what was committed to; Done is the separate record of completion.

alter table public.messages
  add column if not exists summary_key text,
  add column if not exists summary_titles text[],
  add column if not exists summary_to_user_id uuid;

create index if not exists messages_summary_key_idx
  on public.messages (thread_id, summary_key, created_at desc)
  where summary_key is not null;

-- Helper: remove specific titles from an actor's open summary for a verb.
-- If the resulting summary is empty, the message is deleted entirely
-- (no stub "Jake's got: " line left lying around).
create or replace function public.remove_titles_from_summary(
  p_user_id uuid,
  p_thread_id uuid,
  p_verb text,
  p_titles_to_remove text[],
  p_actor_first text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m_id uuid;
  m_titles text[];
  new_titles text[];
  new_body text;
  summary_window interval := interval '24 hours';
  s_key text;
begin
  s_key := p_user_id::text || ':' || p_thread_id::text || ':' || p_verb;

  select id, coalesce(summary_titles, '{}'::text[])
  into m_id, m_titles
  from public.messages
  where thread_id = p_thread_id
    and summary_key = s_key
    and created_at > now() - summary_window
  order by created_at desc
  limit 1;

  if m_id is null then return; end if;

  -- Filter out titles being removed, preserving original order.
  new_titles := array(
    select t from unnest(m_titles) as t
    where not (t = any(p_titles_to_remove))
  );

  if new_titles is null or array_length(new_titles, 1) is null then
    delete from public.messages where id = m_id;
    return;
  end if;

  if p_verb = 'accepted' then
    new_body := p_actor_first || '''s got: ' || array_to_string(new_titles, ', ');
  elsif p_verb = 'done' then
    new_body := p_actor_first || ' done: ' || array_to_string(new_titles, ', ');
  else
    return;
  end if;

  update public.messages
  set body = new_body, summary_titles = new_titles
  where id = m_id;
end;
$$;

-- Replace drain with find-or-update semantics.
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

    -- Clean up processed pending rows.
    delete from public.pending_announcements
    where user_id = grp.user_id and thread_id = grp.thread_id
      and verb = grp.verb and scheduled_at <= now();
  end loop;
end;
$$;
