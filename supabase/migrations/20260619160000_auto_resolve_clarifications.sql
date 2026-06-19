-- Auto-resolve ops-card clarifications when the person who was asked replies.
--
-- Product rule (chosen over a manual "mark clarified" button): posting any
-- human message in a thread counts as answering whatever the *other* partner
-- asked about a card there. The asker's own follow-ups don't clear their
-- question. Agent (Otis) messages — including the relayed question itself —
-- never clear anything.
--
-- This is the canonical resolver; the client also does it optimistically in
-- sendMessage so the replier's chip clears instantly. Realtime then propagates
-- the ops_cards UPDATE to the asker's device.

create or replace function public.auto_resolve_clarifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.author_kind = 'human' then
    update public.ops_cards
    set clarification = jsonb_set(clarification, '{status}', '"resolved"'::jsonb)
    where thread_id = new.thread_id
      and clarification is not null
      and clarification->>'status' = 'open'
      and (clarification->>'askedByUserId') is distinct from new.author_user_id::text;
  end if;
  return new;
end;
$$;

create trigger on_message_resolve_clarifications
  after insert on public.messages
  for each row execute function public.auto_resolve_clarifications();
