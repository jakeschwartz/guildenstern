-- Resolve relative timing ("tomorrow", "Thursday 9am") to a real date when an
-- item is filed. Before this, when_label stored the literal word, so
-- "tomorrow" stayed "tomorrow" forever and the Today/This-week bucket never
-- moved. The client now renders the label + bucket from due_at relative to
-- the current time; when_label stays as the fallback for undated items
-- ("this week", "ongoing").
--
-- due_has_time = false means a date-only item. Those are stored at local noon
-- in the sender's timezone so the calendar day survives small tz differences
-- between partners.

alter table public.ops_cards
  add column if not exists due_at timestamptz,
  add column if not exists due_has_time boolean not null default false;

create index if not exists ops_cards_due_at_idx
  on public.ops_cards (due_at)
  where due_at is not null;
