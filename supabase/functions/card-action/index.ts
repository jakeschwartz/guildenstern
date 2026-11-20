// card-action: lock-screen Done / Tomorrow / Pass. Auth is a 72h HMAC token
// bound to push_id + card_id + user_id (no session JWT). verify_jwt is off
// because the native handler has no Supabase session; the HMAC is the auth.
//
// Defense: token verify, owner check, open-card check, idempotency per
// push_id+action, and a per-push_id rate limit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { type CardActionName, handleCardAction } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("CARD_ACTION_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

const db = {
  async noteAttempt(pushId: string | null) {
    const { data, error } = await supabase.rpc("note_card_action_attempt", {
      p_push_id: pushId,
    });
    if (error) {
      console.error("[card-action] noteAttempt failed", error);
      return 0;
    }
    return Number(data ?? 0);
  },
  async getPushLog(pushId: string) {
    const { data, error } = await supabase
      .from("push_log")
      .select("id, user_id, card_id")
      .eq("id", pushId)
      .maybeSingle();
    if (error) {
      console.error("[card-action] getPushLog failed", error);
      return null;
    }
    return data as { id: string; user_id: string; card_id: string | null } | null;
  },
  async applyAction(pushId: string, cardId: string, userId: string, action: CardActionName) {
    const { data, error } = await supabase.rpc("apply_card_push_action", {
      p_push_id: pushId,
      p_card_id: cardId,
      p_user_id: userId,
      p_action: action,
    });
    if (error) throw new Error(error.message);
    return data as { ok: true; idempotent: boolean; action: string; card_id: string };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  if (!SECRET) return json({ ok: false, error: "misconfigured" }, 500);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ ok: false, error: "bad json" }, 400);
  }

  const result = await handleCardAction(input, { secret: SECRET, db });
  return json(result.body, result.status);
});
