-- Guildenstern v0 schema.
-- Scope: partnership thread dogfood (Jake + Jenny). Other thread kinds deferred.

-- =====================================================================
-- PROFILES
-- Mirrors auth.users with display data the app needs.
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  initials text not null,
  created_at timestamptz default now()
);

-- Auto-create profile row on signup. Apple gives us name on first sign-in only,
-- so we capture it then; subsequent updates go through the app.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
as $$
begin
  insert into public.profiles (id, name, initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Friend'),
    upper(substr(coalesce(new.raw_user_meta_data->>'name', 'F'), 1, 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- PARTNERSHIPS  (two-person container of scoped threads)
-- =====================================================================
create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table public.partnership_members (
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (partnership_id, user_id)
);

create index on public.partnership_members (user_id);

-- =====================================================================
-- INVITES  (Jake creates partnership, sends Jenny a code)
-- =====================================================================
create table public.partnership_invites (
  code text primary key,
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  redeemed_by uuid references public.profiles(id),
  redeemed_at timestamptz,
  created_at timestamptz default now()
);

-- =====================================================================
-- THREADS  (partnership scoped threads + per-user personal "home" thread)
-- =====================================================================
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('partnership','personal')),
  partnership_id uuid references public.partnerships(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  is_default boolean default false,
  agent_active boolean default true,
  created_at timestamptz default now(),
  last_activity_at timestamptz default now(),
  check (
    (kind = 'partnership' and partnership_id is not null and owner_id is null)
    or
    (kind = 'personal' and owner_id is not null and partnership_id is null)
  )
);

create index on public.threads (partnership_id);
create index on public.threads (owner_id);

-- =====================================================================
-- MESSAGES
-- =====================================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  author_kind text not null check (author_kind in ('human','agent')),
  author_user_id uuid references public.profiles(id),
  body text not null,
  briefing jsonb,
  fold_group_id text,
  fold_summary text,
  created_at timestamptz default now(),
  check (
    (author_kind = 'human' and author_user_id is not null)
    or
    (author_kind = 'agent' and author_user_id is null)
  )
);

create index on public.messages (thread_id, created_at);

-- Bump thread.last_activity_at on new message
create or replace function public.bump_thread_activity()
returns trigger language plpgsql
as $$
begin
  update public.threads set last_activity_at = new.created_at where id = new.thread_id;
  return new;
end;
$$;

create trigger on_message_insert
  after insert on public.messages
  for each row execute function public.bump_thread_activity();

-- =====================================================================
-- OPS CARDS  (partnership-thread artifact: tasks extracted from messages)
-- =====================================================================
create table public.ops_cards (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete set null,
  source_user_id uuid references public.profiles(id),
  title text not null,
  subtitle text,
  owner_id uuid not null references public.profiles(id),
  when_label text not null,
  bucket text not null check (bucket in ('today','week','ongoing','long')),
  status text not null default 'pending' check (status in ('pending','done','deferred')),
  created_at timestamptz default now()
);

create index on public.ops_cards (thread_id);

-- =====================================================================
-- RLS
-- Core rule: you can only see partnerships you're a member of, and threads
-- inside them. Personal threads are visible only to their owner.
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.partnerships enable row level security;
alter table public.partnership_members enable row level security;
alter table public.partnership_invites enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.ops_cards enable row level security;

-- Helper: is the current user a member of this partnership?
create or replace function public.is_partnership_member(p_partnership_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.partnership_members
    where partnership_id = p_partnership_id and user_id = auth.uid()
  );
$$;

-- Helper: does the current user have access to this thread?
create or replace function public.can_access_thread(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.threads t
    where t.id = p_thread_id
      and (
        (t.kind = 'personal' and t.owner_id = auth.uid())
        or
        (t.kind = 'partnership' and public.is_partnership_member(t.partnership_id))
      )
  );
$$;

-- Profiles: everyone can read profiles of people who share a partnership with them,
-- plus their own. Updates only on own row.
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());
create policy "read partner profiles" on public.profiles
  for select using (
    exists (
      select 1
      from public.partnership_members me
      join public.partnership_members them on them.partnership_id = me.partnership_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );
create policy "update own profile" on public.profiles
  for update using (id = auth.uid());

-- Partnerships: visible to members. Insert allowed by any authenticated user
-- (creating one) — they must then add themselves as a member.
create policy "read own partnerships" on public.partnerships
  for select using (public.is_partnership_member(id));
create policy "create partnership" on public.partnerships
  for insert with check (auth.uid() is not null);

-- Partnership members: visible to members of the same partnership.
create policy "read membership" on public.partnership_members
  for select using (public.is_partnership_member(partnership_id));
create policy "join partnership self" on public.partnership_members
  for insert with check (user_id = auth.uid());

-- Invites: creator can read/insert; redeemer can read by code (for redeem flow,
-- we'll use a security-definer RPC so anon-but-authenticated users can look up
-- a code without seeing all invites).
create policy "creator reads invite" on public.partnership_invites
  for select using (invited_by = auth.uid());
create policy "creator makes invite" on public.partnership_invites
  for insert with check (invited_by = auth.uid());

-- Threads
create policy "read accessible threads" on public.threads
  for select using (
    (kind = 'personal' and owner_id = auth.uid())
    or
    (kind = 'partnership' and public.is_partnership_member(partnership_id))
  );
create policy "create own personal thread" on public.threads
  for insert with check (
    (kind = 'personal' and owner_id = auth.uid())
    or
    (kind = 'partnership' and public.is_partnership_member(partnership_id))
  );

-- Messages
create policy "read messages in accessible threads" on public.messages
  for select using (public.can_access_thread(thread_id));
create policy "send messages as self" on public.messages
  for insert with check (
    public.can_access_thread(thread_id)
    and author_kind = 'human'
    and author_user_id = auth.uid()
  );
-- (Agent messages are inserted by the Edge Function under the service role,
--  which bypasses RLS. Do not allow client-side agent inserts.)

-- Ops cards
create policy "read ops cards in accessible threads" on public.ops_cards
  for select using (public.can_access_thread(thread_id));
create policy "update ops cards in accessible threads" on public.ops_cards
  for update using (public.can_access_thread(thread_id));

-- =====================================================================
-- REALTIME
-- Publish the tables we want to stream from.
-- =====================================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.ops_cards;
alter publication supabase_realtime add table public.threads;
