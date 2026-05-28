-- Fire the agent-respond edge function on every human-author message insert.
-- Uses pg_net (enabled by default on Supabase) for an async HTTP POST so the
-- INSERT isn't blocked waiting for Claude.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_agent_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.author_kind = 'human' then
    perform net.http_post(
      url := 'https://psthqrdqggqgekqbansb.supabase.co/functions/v1/agent-respond',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'messages',
        'record', row_to_json(new)
      )
    );
  end if;
  return new;
end;
$$;

create trigger on_human_message_for_agent
  after insert on public.messages
  for each row execute function public.notify_agent_on_message();
