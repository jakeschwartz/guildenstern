-- The same note with its key words wrapped in **…**, so the rundown can bold
-- what matters ("**School closed** tomorrow **until 1**"). note stays plain
-- for older app builds and for Otis's chat messages.
alter table public.calendar_notes add column if not exists note_marked text;
