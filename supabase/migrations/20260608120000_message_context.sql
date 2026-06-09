-- Add a context column to messages so the same thread can hold parallel
-- conversations. v1 uses two:
--   'main'      — the chat between the two partners. The default.
--   'otis_chat' — the "talk to Otis" conversation that lives behind the
--                 synthesis pane (left swipe in a spoke). Both partners see
--                 it; Otis answers questions about the topic, can update the
--                 synthesis above. Keeps the main partnership chat clean.

alter table public.messages
  add column if not exists context text not null default 'main'
  check (context in ('main', 'otis_chat'));

create index if not exists messages_thread_context_idx
  on public.messages (thread_id, context, created_at desc);
