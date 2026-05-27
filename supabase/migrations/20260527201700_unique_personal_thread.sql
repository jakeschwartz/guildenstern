-- Prevent the race that creates two personal threads when hydrate fires twice
-- (React strict-mode double-effect, or onboarding refresh racing with initial
-- hydrate). One personal thread per user, period.

-- 1. Collapse any existing dupes: keep the oldest per owner.
delete from public.threads t
using public.threads other
where t.kind = 'personal'
  and other.kind = 'personal'
  and t.owner_id = other.owner_id
  and t.created_at > other.created_at;

-- 2. Add a partial unique index so the race becomes an INSERT error we can
--    catch + ignore in the helper, rather than two rows.
create unique index threads_one_personal_per_owner
  on public.threads (owner_id)
  where kind = 'personal';
