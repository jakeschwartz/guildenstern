-- Add spoke_summaries to the realtime publication. The synthesize-spoke
-- edge function does Claude work in the background and upserts here; the
-- client subscribes to the resulting UPDATE/INSERT to refresh its
-- "Where we are" pane without polling.

alter publication supabase_realtime add table public.spoke_summaries;
