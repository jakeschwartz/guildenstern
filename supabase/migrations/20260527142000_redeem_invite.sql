-- redeem_invite: security-definer RPC so an authenticated user can redeem an
-- invite by code without needing RLS read access to the partnership_invites
-- table. On success, joins them to the partnership and returns the partnership id.

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.partnership_invites%rowtype;
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite from public.partnership_invites where code = p_code;
  if not found then
    raise exception 'Invalid invite code';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'Invite expired';
  end if;

  if v_invite.redeemed_by is not null then
    raise exception 'Invite already redeemed';
  end if;

  -- Don't let the inviter redeem their own invite.
  if v_invite.invited_by = v_user then
    raise exception 'Cannot redeem your own invite';
  end if;

  -- Join the partnership (idempotent).
  insert into public.partnership_members (partnership_id, user_id)
  values (v_invite.partnership_id, v_user)
  on conflict do nothing;

  -- Mark invite as redeemed.
  update public.partnership_invites
  set redeemed_by = v_user, redeemed_at = now()
  where code = p_code;

  return v_invite.partnership_id;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;
