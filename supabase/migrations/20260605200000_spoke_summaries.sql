-- Cached "Where we are" synthesis for spoke threads (non-default partnership
-- threads). Otis writes one per spoke; the client reads it for the
-- swipe-left pane. Topic-aware sections (the labels are chosen by Otis based
-- on what the conversation is actually about — "Invite list", "Venue",
-- "Dates" for a party; "Destination", "Flights" for a trip; etc).

create table if not exists public.spoke_summaries (
  thread_id uuid primary key references public.threads(id) on delete cascade,
  summary text not null,
  -- jsonb array of {label: string, items: [{text: string, status: string}]}.
  -- Status is one of: 'done' (✓), 'open' (·), 'maybe' (?), 'action' (→),
  -- 'flagged' (⚠). Renderer maps to glyphs.
  sections jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.spoke_summaries enable row level security;

-- Anyone who can read messages from the thread can read its summary.
-- partnership_members → threads → spoke_summaries.
drop policy if exists "read spoke summary if member" on public.spoke_summaries;
create policy "read spoke summary if member"
  on public.spoke_summaries
  for select
  to authenticated
  using (
    exists (
      select 1 from public.threads t
      join public.partnership_members pm on pm.partnership_id = t.partnership_id
      where t.id = spoke_summaries.thread_id
        and pm.user_id = (select auth.uid())
    )
  );

-- No insert/update policy — only the service-role synthesize-spoke edge
-- function writes here. (RLS denies by default with no policy for the verb.)
