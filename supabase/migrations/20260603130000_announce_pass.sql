-- Extend notify_otis_on_card_status_change to also fire when ownership flips
-- (the "Pass" escape hatch from accepted state — "oops I actually can't do
-- this, you take it"). One trigger handles three verbs now: accepted, done,
-- passed.
--
-- Server-side actor for 'passed' = the OLD owner (the one handing it off);
-- we include to_user_id so the function can name the recipient.

create or replace function public.notify_otis_on_card_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('accepted', 'done')
  then
    perform net.http_post(
      url := 'https://psthqrdqggqgekqbansb.supabase.co/functions/v1/announce-status',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'card_id', new.id,
        'thread_id', new.thread_id,
        'actor_user_id', new.owner_id,
        'verb', new.status,
        'title', new.title
      )
    );
  elsif new.owner_id is distinct from old.owner_id then
    perform net.http_post(
      url := 'https://psthqrdqggqgekqbansb.supabase.co/functions/v1/announce-status',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'card_id', new.id,
        'thread_id', new.thread_id,
        'actor_user_id', old.owner_id,
        'verb', 'passed',
        'title', new.title,
        'to_user_id', new.owner_id
      )
    );
  end if;
  return new;
end;
$$;
