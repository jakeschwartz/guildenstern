-- Add 'accepted' as a status between 'pending' and 'done' on ops_cards.
-- Semantics: 'pending' = just landed, no one's claimed it. 'accepted' = the
-- owner has explicitly committed to the task ("Jake's got it"). 'done' =
-- completed. This closes the gap where the sender (Jenny) couldn't tell the
-- difference between "Jake hasn't seen it" and "Jake's committed to it."

alter table public.ops_cards
  drop constraint if exists ops_cards_status_check;

alter table public.ops_cards
  add constraint ops_cards_status_check
  check (status in ('pending','accepted','done','deferred'));

-- Trigger: when a card's status changes, fire the announce-status edge
-- function so Otis can post a chat message ("Jake's got: vaccine appt").
-- Async via pg_net so the UPDATE doesn't block on the function call.
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
  end if;
  return new;
end;
$$;

drop trigger if exists on_card_status_change_for_otis on public.ops_cards;
create trigger on_card_status_change_for_otis
  after update on public.ops_cards
  for each row execute function public.notify_otis_on_card_status_change();
