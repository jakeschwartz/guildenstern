-- Otis off-topic → suggest-a-thread support.

-- 1. thread_suggestion jsonb on messages. Carries Otis's "move this to its own
--    thread" proposal in client shape:
--      { suggestedTitle, reason, sourceMessageIds: [uuid], status: 'open' }
--    so the client can render the actionable callout under his message.
alter table public.messages
  add column if not exists thread_suggestion jsonb;

-- 2. Allow a partnership member to relocate a message between threads they can
--    access. Accepting Otis's suggestion moves the triggering message into the
--    newly created thread; either partner may accept (not just the author), so
--    this isn't scoped to author_user_id. USING checks the source thread is
--    accessible; WITH CHECK checks the destination thread is too. Both threads
--    belong to the same partnership the caller is a member of.
create policy "move messages within accessible threads" on public.messages
  for update using (public.can_access_thread(thread_id))
  with check (public.can_access_thread(thread_id));
