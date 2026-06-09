-- Photo attachments on messages (iMessage parity, phase 1).
--
-- v1 schema: messages.attachments is a jsonb array of attachment objects.
-- Shape: [{ kind: "image", path: string, width: number, height: number }]
-- Where path is the Storage object path, e.g. "thread-id/uuid.jpg".
--
-- We use a public Storage bucket — the path includes a v4 UUID so URLs
-- are unguessable in practice, and only authenticated users can upload.
-- For higher security later we'd switch to a private bucket + signed URLs;
-- right now the v4-UUID approach is the same model iMessage/WhatsApp use
-- effectively (their CDNs serve attachments via opaque URLs).

alter table public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Create the bucket (idempotent).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  true,
  20 * 1024 * 1024, -- 20 MB cap per file
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: authenticated users can upload; reads are unrestricted
-- because the bucket is public + paths are unguessable.
drop policy if exists "authenticated upload" on storage.objects;
create policy "authenticated upload"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'message-attachments');

drop policy if exists "public read attachments" on storage.objects;
create policy "public read attachments"
  on storage.objects
  for select
  using (bucket_id = 'message-attachments');
