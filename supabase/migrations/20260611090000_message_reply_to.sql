-- Reply-to-message (iMessage parity). A message can quote another message in
-- the same thread. Self-referential FK; on delete of the quoted message the
-- reply survives but the pointer clears (set null), so the reply just loses
-- its quote rather than disappearing.

alter table public.messages
  add column if not exists reply_to_message_id uuid
  references public.messages(id) on delete set null;
