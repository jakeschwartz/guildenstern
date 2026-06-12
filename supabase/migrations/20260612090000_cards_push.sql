-- "Waiting on you" push: when a burst lands items on a partner, send ONE
-- notification with the batch ("✅ Jake put 3 things on your list: …").
--
-- Statement-level trigger with a transition table so a multi-row insert
-- (one burst = one .insert(rows) call) fires a single http_post per
-- (owner, source, thread) group instead of one per card. Cards a user
-- files onto THEMSELVES don't notify (owner = source filtered out both
-- here and defensively in the function).

create or replace function public.notify_push_on_cards_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  grp record;
begin
  for grp in
    select owner_id, source_user_id, thread_id,
           jsonb_agg(title order by created_at) as titles
    from new_rows
    where owner_id is distinct from source_user_id
      and source_user_id is not null
    group by owner_id, source_user_id, thread_id
  loop
    perform net.http_post(
      url := 'https://psthqrdqggqgekqbansb.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'type', 'CARDS_ASSIGNED',
        'owner_id', grp.owner_id,
        'source_user_id', grp.source_user_id,
        'thread_id', grp.thread_id,
        'titles', grp.titles
      )
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists on_cards_insert_for_push on public.ops_cards;
create trigger on_cards_insert_for_push
  after insert on public.ops_cards
  referencing new table as new_rows
  for each statement
  execute function public.notify_push_on_cards_insert();
