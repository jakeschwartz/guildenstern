-- Tapbacks (iMessage parity). One reaction per user per message — choosing
-- a different emoji replaces the old one (upsert on message_id+user_id);
-- choosing the same emoji removes it (client deletes).
--
-- thread_id is denormalized onto the row so realtime can filter per-thread
-- (realtime filters can't join through messages).

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists message_reactions_thread_idx
  on public.message_reactions (thread_id);

-- DELETE events need the full old row in the realtime payload (default
-- replica identity only carries the PK).
alter table public.message_reactions replica identity full;

alter table public.message_reactions enable row level security;

-- Read: anyone who can see the thread (partnership member or personal owner).
drop policy if exists "read reactions in my threads" on public.message_reactions;
create policy "read reactions in my threads"
  on public.message_reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.threads t
      left join public.partnership_members pm
        on pm.partnership_id = t.partnership_id
      where t.id = message_reactions.thread_id
        and (pm.user_id = (select auth.uid()) or t.owner_id = (select auth.uid()))
    )
  );

-- Write: own reactions only (and only in threads you can see).
drop policy if exists "insert own reactions" on public.message_reactions;
create policy "insert own reactions"
  on public.message_reactions
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.threads t
      left join public.partnership_members pm
        on pm.partnership_id = t.partnership_id
      where t.id = message_reactions.thread_id
        and (pm.user_id = (select auth.uid()) or t.owner_id = (select auth.uid()))
    )
  );

drop policy if exists "update own reactions" on public.message_reactions;
create policy "update own reactions"
  on public.message_reactions
  for update
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "delete own reactions" on public.message_reactions;
create policy "delete own reactions"
  on public.message_reactions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.message_reactions;
