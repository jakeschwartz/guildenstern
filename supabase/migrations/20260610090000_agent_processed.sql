-- "Agent read receipt": agent-respond stamps each main-context partnership
-- message after processing it. The client renders a small green dot on the
-- sender's message (a fourth delivery state: sent → delivered → read →
-- tracked). Replaces the burst echo as the sender's confirmation that Otis
-- caught what they said.

alter table public.messages
  add column if not exists agent_processed_at timestamptz;
