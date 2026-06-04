-- Generic Google OAuth token store. One row per user; the scope column holds
-- the union of all scopes the user has granted (incremental authorization).
-- Today: calendar.readonly. Later: gmail.readonly, drive.readonly, etc. —
-- all ride on this same row with merged scopes.

create table if not exists public.google_oauth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  scope text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_tokens enable row level security;

-- User can read their own token row (so the client can detect "I'm connected"
-- via realtime). Inserts/updates happen via the service-role edge function
-- (google-oauth-callback) — the user can't write directly because the row
-- contains a refresh_token, which is a high-value secret.
drop policy if exists "users read own google tokens" on public.google_oauth_tokens;
create policy "users read own google tokens"
  on public.google_oauth_tokens
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Bump updated_at on every UPDATE so the client realtime sees a change even
-- when only one field flips.
create or replace function public.bump_google_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists google_tokens_updated_at on public.google_oauth_tokens;
create trigger google_tokens_updated_at
  before update on public.google_oauth_tokens
  for each row execute function public.bump_google_tokens_updated_at();
