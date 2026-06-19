-- Ops-card clarification: "?" on a card you don't understand → Otis relays a
-- clarifying question into the thread, and the card shows "waiting on
-- clarification" until either partner marks it resolved.

-- 1. clarification jsonb on ops_cards. Client shape:
--      { note: text, askedByUserId: uuid, askedAt: bigint (ms epoch),
--        status: 'open' | 'resolved' }
--    Marking it resolved is a plain UPDATE (covered by the existing
--    "update ops cards in accessible threads" policy), so only the ask needs an
--    RPC — clients can't author the *agent* message that the relay produces.
alter table public.ops_cards
  add column if not exists clarification jsonb;

-- 2. clarify_ops_card: security-definer relay. Authenticated clients can't
--    insert agent-authored messages (RLS only lets them send as themselves), so
--    this function inserts the Otis message on their behalf and stamps the
--    card's clarification jsonb in one shot. Realtime then reconciles both
--    partners: the new agent message arrives via the messages channel, the
--    clarification via the ops_cards UPDATE channel.
--
--    The relayed body is byte-for-byte identical to the client's optimistic
--    message (same curly quotes, same "they" first-name fallback, same default
--    question) so the asker's realtime handler replaces its optimistic row
--    instead of showing the question twice.
create or replace function public.clarify_ops_card(p_card_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_card public.ops_cards%rowtype;
  v_name text;
  v_first text;
  v_note text;
  v_body text;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_card from public.ops_cards where id = p_card_id;
  if not found then
    raise exception 'Card not found';
  end if;

  -- Security definer bypasses RLS, so re-check thread access explicitly.
  if not public.can_access_thread(v_card.thread_id) then
    raise exception 'Not authorized';
  end if;

  -- Asker's first name, mirroring the client's firstName() helper:
  -- name.split(" ")[0] || "they".
  select name into v_name from public.profiles where id = v_user;
  v_first := split_part(coalesce(v_name, ''), ' ', 1);
  if v_first = '' then
    v_first := 'they';
  end if;

  v_note := btrim(coalesce(p_note, ''));
  v_body := 'Quick one from ' || v_first || ' on “' || v_card.title || '”: '
    || case
         when v_note <> '' then v_note
         else 'could you clarify what''s needed here?'
       end;

  -- Otis (agent) message relayed into the card's thread.
  insert into public.messages (thread_id, author_kind, author_user_id, body)
  values (v_card.thread_id, 'agent', null, v_body);

  -- Stamp the card's clarification in client shape.
  update public.ops_cards
  set clarification = jsonb_build_object(
    'note', v_note,
    'askedByUserId', v_user,
    'askedAt', (extract(epoch from now()) * 1000)::bigint,
    'status', 'open'
  )
  where id = p_card_id;
end;
$$;

grant execute on function public.clarify_ops_card(uuid, text) to authenticated;
