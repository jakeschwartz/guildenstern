-- Actionable rundown push: instrumentation, snooze, and the service-role
-- RPC the card-action edge function calls. Deploy this migration BEFORE the
-- edge functions that write to these tables.
--
-- Rollback (manual, after functions have been rolled back):
--   drop function if exists public.apply_card_push_action(uuid, uuid, uuid, text);
--   drop function if exists public.note_card_action_attempt(uuid);
--   drop function if exists public.record_card_status_changed();
--   drop table if exists public.card_action_attempts;
--   drop table if exists public.card_action_receipts;
--   drop table if exists public.push_delivery;
--   drop table if exists public.card_nudged;
--   drop table if exists public.card_status_changed;
--   alter table public.push_log drop column if exists card_id;
--   alter table public.ops_cards drop column if exists snoozed_until;
-- Does not drop data in ops_cards or push_log otherwise. Never run this on
-- production without a backup.

-- 1. Snooze and the card a push was about.
alter table public.ops_cards
  add column if not exists snoozed_until timestamptz;

create index if not exists ops_cards_snoozed_until_idx
  on public.ops_cards (owner_id, snoozed_until)
  where snoozed_until is not null;

alter table public.push_log
  add column if not exists card_id uuid references public.ops_cards(id) on delete set null;

create index if not exists push_log_card_id_idx
  on public.push_log (card_id)
  where card_id is not null;

-- 2. Instrumentation tables. RLS on from the first migration. Client roles
--    may only SELECT (and only through the policies below). Writes go
--    through triggers or the service role.
create table if not exists public.card_status_changed (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.ops_cards(id) on delete cascade,
  partnership_id uuid references public.partnerships(id) on delete set null,
  from_status text not null,
  to_status text not null,
  acted_by uuid references public.profiles(id) on delete set null,
  surface text not null default 'app'
    check (surface in ('app', 'push_action', 'rundown', 'mcp', 'server')),
  push_id uuid references public.push_log(id) on delete set null,
  at timestamptz not null default now()
);

create index if not exists card_status_changed_card_idx
  on public.card_status_changed (card_id, at desc);
create index if not exists card_status_changed_push_idx
  on public.card_status_changed (push_id)
  where push_id is not null;

create table if not exists public.card_nudged (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.ops_cards(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('push', 'rundown', 'otis_message')),
  push_id uuid references public.push_log(id) on delete set null,
  at timestamptz not null default now()
);

create index if not exists card_nudged_card_idx
  on public.card_nudged (card_id, at desc);
create index if not exists card_nudged_user_idx
  on public.card_nudged (to_user_id, at desc);

create table if not exists public.push_delivery (
  id uuid primary key default gen_random_uuid(),
  push_id uuid not null references public.push_log(id) on delete cascade,
  apns_status int not null,
  apns_reason text,
  at timestamptz not null default now()
);

create index if not exists push_delivery_push_idx
  on public.push_delivery (push_id, at desc);

-- Idempotency for lock-screen actions (one result per push per action).
create table if not exists public.card_action_receipts (
  push_id uuid not null references public.push_log(id) on delete cascade,
  action text not null check (action in ('done', 'tomorrow', 'pass')),
  card_id uuid not null references public.ops_cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (push_id, action)
);

-- Rate-limit log for the card-action endpoint.
create table if not exists public.card_action_attempts (
  id uuid primary key default gen_random_uuid(),
  push_id uuid,
  at timestamptz not null default now()
);

create index if not exists card_action_attempts_push_idx
  on public.card_action_attempts (push_id, at desc);

alter table public.card_status_changed enable row level security;
alter table public.card_nudged enable row level security;
alter table public.push_delivery enable row level security;
alter table public.card_action_receipts enable row level security;
alter table public.card_action_attempts enable row level security;

revoke all on public.card_status_changed from public, anon, authenticated;
revoke all on public.card_nudged from public, anon, authenticated;
revoke all on public.push_delivery from public, anon, authenticated;
revoke all on public.card_action_receipts from public, anon, authenticated;
revoke all on public.card_action_attempts from public, anon, authenticated;

grant select on public.card_status_changed to authenticated;
grant select on public.card_nudged to authenticated;
grant select on public.push_delivery to authenticated;

create policy "read card status changes in accessible threads"
  on public.card_status_changed
  for select
  using (
    exists (
      select 1
      from public.ops_cards c
      where c.id = card_status_changed.card_id
        and public.can_access_thread(c.thread_id)
    )
  );

create policy "read own card nudges"
  on public.card_nudged
  for select
  using (to_user_id = auth.uid());

create policy "read own push delivery"
  on public.push_delivery
  for select
  using (
    exists (
      select 1
      from public.push_log l
      where l.id = push_delivery.push_id
        and l.user_id = auth.uid()
    )
  );

-- 3. Record status / owner changes. Endpoints can set (transaction-local):
--      guildenstern.card_surface   (app|push_action|rundown|mcp|server)
--      guildenstern.card_push_id   (uuid text)
--      guildenstern.acted_by       (uuid text)
--    Defaults: surface = 'app', acted_by = auth.uid().
create or replace function public.record_card_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_surface text;
  v_push uuid;
  v_acted uuid;
  v_partnership uuid;
begin
  if not (
    new.status is distinct from old.status
    or new.owner_id is distinct from old.owner_id
  ) then
    return new;
  end if;

  v_surface := nullif(current_setting('guildenstern.card_surface', true), '');
  if v_surface is null or v_surface not in ('app', 'push_action', 'rundown', 'mcp', 'server') then
    v_surface := 'app';
  end if;

  begin
    v_push := nullif(current_setting('guildenstern.card_push_id', true), '')::uuid;
  exception when invalid_text_representation then
    v_push := null;
  end;

  begin
    v_acted := nullif(current_setting('guildenstern.acted_by', true), '')::uuid;
  exception when invalid_text_representation then
    v_acted := null;
  end;
  if v_acted is null then
    v_acted := auth.uid();
  end if;

  select t.partnership_id into v_partnership
  from public.threads t
  where t.id = new.thread_id;

  insert into public.card_status_changed (
    card_id, partnership_id, from_status, to_status, acted_by, surface, push_id
  ) values (
    new.id, v_partnership, old.status, new.status, v_acted, v_surface, v_push
  );

  return new;
end;
$$;

drop trigger if exists record_card_status_changed on public.ops_cards;
create trigger record_card_status_changed
  after update on public.ops_cards
  for each row execute function public.record_card_status_changed();

revoke all on function public.record_card_status_changed() from public, anon, authenticated;

-- 4. MCP updates should be attributed as surface=mcp.
create or replace function public.mcp_update_item(
  p_user uuid,
  p_card uuid,
  p_status text,
  p_owner uuid
)
returns void
language plpgsql
security definer
set search_path = ''
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
  perform set_config('guildenstern.card_surface', 'mcp', true);
  perform set_config('guildenstern.acted_by', p_user::text, true);
  update public.ops_cards
  set status = coalesce(p_status, status),
      owner_id = coalesce(p_owner, owner_id)
  where id = p_card;
end;
$$;

revoke all on function public.mcp_update_item(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.mcp_update_item(uuid, uuid, text, uuid) to service_role;

-- 5. Rate-limit helper and the lock-screen action RPC (service role only).
create or replace function public.note_card_action_attempt(p_push_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.card_action_attempts (push_id) values (p_push_id);
  select count(*)::integer into v_count
  from public.card_action_attempts
  where push_id is not distinct from p_push_id
    and at > now() - interval '10 minutes';
  return v_count;
end;
$$;

revoke all on function public.note_card_action_attempt(uuid) from public, anon, authenticated;
grant execute on function public.note_card_action_attempt(uuid) to service_role;

create or replace function public.apply_card_push_action(
  p_push_id uuid,
  p_card_id uuid,
  p_user_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted boolean;
  v_card public.ops_cards%rowtype;
  v_partner uuid;
  v_tz text;
  v_until timestamptz;
  v_partnership uuid;
begin
  if p_action not in ('done', 'tomorrow', 'pass') then
    raise exception 'invalid action';
  end if;

  insert into public.card_action_receipts (push_id, action, card_id)
  values (p_push_id, p_action, p_card_id)
  on conflict (push_id, action) do nothing
  returning true into v_inserted;

  if v_inserted is not true then
    return jsonb_build_object('ok', true, 'idempotent', true, 'action', p_action, 'card_id', p_card_id);
  end if;

  select * into v_card from public.ops_cards where id = p_card_id;
  if v_card.id is null then
    raise exception 'card not found';
  end if;
  if v_card.owner_id is distinct from p_user_id then
    raise exception 'not the owner';
  end if;
  if v_card.status not in ('pending', 'accepted') then
    raise exception 'card is not open';
  end if;

  perform set_config('guildenstern.card_surface', 'push_action', true);
  perform set_config('guildenstern.card_push_id', p_push_id::text, true);
  perform set_config('guildenstern.acted_by', p_user_id::text, true);

  if p_action = 'done' then
    update public.ops_cards set status = 'done' where id = p_card_id;
  elsif p_action = 'pass' then
    select t.partnership_id into v_partnership
    from public.threads t
    where t.id = v_card.thread_id;
    select pm.user_id into v_partner
    from public.partnership_members pm
    where pm.partnership_id = v_partnership
      and pm.user_id is distinct from p_user_id
    limit 1;
    if v_partner is null then
      raise exception 'no partner to pass to';
    end if;
    -- Same shape as the in-app Pass path: new owner, status reset to pending.
    -- notify_otis_on_card_status_change fires on the owner change.
    update public.ops_cards
    set owner_id = v_partner, status = 'pending'
    where id = p_card_id;
  elsif p_action = 'tomorrow' then
    -- Snooze only. Do not change status or owner, so Otis does not announce.
    select coalesce(nullif(btrim(timezone), ''), 'America/New_York')
      into v_tz
    from public.profiles
    where id = p_user_id;
    if v_tz is null then
      v_tz := 'America/New_York';
    end if;
    -- 08:00 local tomorrow (the start of the morning rundown slot).
    v_until := ((timezone(v_tz, now()))::date + 1 + time '08:00') at time zone v_tz;
    update public.ops_cards
    set snoozed_until = v_until
    where id = p_card_id;

    select t.partnership_id into v_partnership
    from public.threads t
    where t.id = v_card.thread_id;

    insert into public.card_status_changed (
      card_id, partnership_id, from_status, to_status, acted_by, surface, push_id
    ) values (
      p_card_id, v_partnership, v_card.status, v_card.status, p_user_id, 'push_action', p_push_id
    );
  end if;

  return jsonb_build_object('ok', true, 'idempotent', false, 'action', p_action, 'card_id', p_card_id);
end;
$$;

revoke all on function public.apply_card_push_action(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.apply_card_push_action(uuid, uuid, uuid, text) to service_role;
