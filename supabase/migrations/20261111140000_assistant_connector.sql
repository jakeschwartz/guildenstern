-- Claude / ChatGPT connector (MCP). A person creates a private connector
-- link in the app and pastes it into Claude or ChatGPT; the assistant can
-- then read their list and threads and act as them (add or finish items,
-- send their partner a message).
--
-- The link carries a random token. Only its SHA-256 is stored, so the raw
-- token exists only in the link the person copied. One active token per
-- person: making a new link revokes the old one.
--
-- Writes go through the mcp_* functions below, callable by the service role
-- only (the edge function, after resolving the token). Each verifies
-- membership, then sets request.jwt.claims for the transaction so auth.uid()
-- is that person. That keeps every existing trigger honest: acted_by,
-- "nobody is pushed about their own action", and the agent pipeline all see
-- the change as made by the person, exactly as if they'd tapped in the app.

create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists mcp_tokens_user_idx on public.mcp_tokens (user_id);
alter table public.mcp_tokens enable row level security;
drop policy if exists "read own mcp tokens" on public.mcp_tokens;
create policy "read own mcp tokens" on public.mcp_tokens
  for select using (user_id = auth.uid());

-- ---------- token lifecycle (called from the app) ----------

create or replace function public.create_mcp_token()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_token text;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  update public.mcp_tokens set revoked_at = now()
  where user_id = v_user and revoked_at is null;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.mcp_tokens (user_id, token_hash)
  values (v_user, encode(digest(v_token, 'sha256'), 'hex'));
  return v_token;
end;
$$;
grant execute on function public.create_mcp_token() to authenticated;

create or replace function public.revoke_mcp_tokens()
returns void
language sql
security definer
set search_path = public
as $$
  update public.mcp_tokens set revoked_at = now()
  where user_id = auth.uid() and revoked_at is null;
$$;
grant execute on function public.revoke_mcp_tokens() to authenticated;

-- ---------- service-role helpers (called by the mcp edge function) ----------

create or replace function public.mcp_resolve_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid;
begin
  update public.mcp_tokens
  set last_used_at = now()
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
  returning user_id into v_user;
  return v_user;
end;
$$;

-- Make auth.uid() return p_user for the rest of this transaction.
create or replace function public.mcp_act_as(p_user uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
$$;

-- p_user and (if given) p_other must both belong to the thread's partnership.
create or replace function public.mcp_check_thread(
  p_user uuid,
  p_thread uuid,
  p_other uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.threads t
    join public.partnership_members m
      on m.partnership_id = t.partnership_id and m.user_id = p_user
    where t.id = p_thread and t.kind = 'partnership'
  ) then
    raise exception 'thread not found';
  end if;
  if p_other is not null and not exists (
    select 1 from public.threads t
    join public.partnership_members m
      on m.partnership_id = t.partnership_id and m.user_id = p_other
    where t.id = p_thread
  ) then
    raise exception 'that person is not in this thread';
  end if;
end;
$$;

create or replace function public.mcp_add_item(
  p_user uuid,
  p_thread uuid,
  p_owner uuid,
  p_title text,
  p_subtitle text,
  p_when_label text,
  p_bucket text,
  p_due_at timestamptz,
  p_due_has_time boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card uuid;
begin
  perform public.mcp_check_thread(p_user, p_thread, p_owner);
  perform public.mcp_act_as(p_user);
  insert into public.ops_cards (
    thread_id, source_message_id, source_user_id, title, subtitle,
    owner_id, when_label, bucket, due_at, due_has_time
  ) values (
    p_thread, null, p_user, p_title, nullif(btrim(p_subtitle), ''),
    p_owner, coalesce(nullif(btrim(p_when_label), ''), 'via assistant'),
    p_bucket, p_due_at, coalesce(p_due_has_time, false)
  )
  returning id into v_card;
  return v_card;
end;
$$;

create or replace function public.mcp_update_item(
  p_user uuid,
  p_card uuid,
  p_status text,
  p_owner uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
begin
  select thread_id into v_thread from public.ops_cards where id = p_card;
  if v_thread is null then
    raise exception 'item not found';
  end if;
  perform public.mcp_check_thread(p_user, v_thread, p_owner);
  perform public.mcp_act_as(p_user);
  update public.ops_cards
  set status = coalesce(p_status, status),
      owner_id = coalesce(p_owner, owner_id)
  where id = p_card;
end;
$$;

-- Sent as the person, into the partners' chat, exactly as if typed in the
-- app: their partner is pushed, and Otis files any items in it.
create or replace function public.mcp_send_message(
  p_user uuid,
  p_thread uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg uuid;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'empty message';
  end if;
  perform public.mcp_check_thread(p_user, p_thread);
  perform public.mcp_act_as(p_user);
  insert into public.messages (thread_id, author_kind, author_user_id, body, context)
  values (p_thread, 'human', p_user, p_body, 'main')
  returning id into v_msg;
  return v_msg;
end;
$$;

-- Service role only: none of these are for app clients.
revoke all on function public.mcp_resolve_token(text) from public, anon, authenticated;
revoke all on function public.mcp_act_as(uuid) from public, anon, authenticated;
revoke all on function public.mcp_check_thread(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.mcp_add_item(uuid, uuid, uuid, text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.mcp_update_item(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.mcp_send_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mcp_resolve_token(text) to service_role;
grant execute on function public.mcp_add_item(uuid, uuid, uuid, text, text, text, text, timestamptz, boolean) to service_role;
grant execute on function public.mcp_update_item(uuid, uuid, text, uuid) to service_role;
grant execute on function public.mcp_send_message(uuid, uuid, text) to service_role;
