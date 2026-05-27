-- Atomic partnership creation + self-membership. Bypasses the chicken-and-egg
-- problem where the client INSERTs a partnership and then can't read the row
-- back (the SELECT policy requires membership, which hasn't been inserted yet).

create or replace function public.create_partnership_with_me()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_partnership_id uuid;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'Not authenticated'; end if;

  insert into public.partnerships default values returning id into v_partnership_id;
  insert into public.partnership_members (partnership_id, user_id)
    values (v_partnership_id, v_user);

  return v_partnership_id;
end;
$$;

grant execute on function public.create_partnership_with_me() to authenticated;
