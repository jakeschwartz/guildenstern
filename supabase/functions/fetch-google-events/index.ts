// fetch-google-events: returns the authenticated user's primary Google
// Calendar events within a date range. Uses the shared token helper which
// transparently refreshes expired access tokens.
//
// Client passes its Supabase JWT in Authorization (default Edge Function
// behavior with verify_jwt=true), and optionally timeMin / timeMax as ISO
// strings. Default range: now → +7 days.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { getValidGoogleAccessToken } from "../_shared/google_token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Service-role client for the token store. The user-auth check happens via
// auth.getUser on the user's JWT (passed in Authorization).
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

type GoogleEvent = {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  status: string;
};

// Normalized shape we return to the client — collapses Google's
// dateTime/date variation into one millisecond epoch + an all-day flag.
type NormalizedEvent = {
  id: string;
  title: string;
  start: number; // ms epoch
  end: number; // ms epoch
  allDay: boolean;
  location: string | null;
};

function normalize(e: GoogleEvent): NormalizedEvent | null {
  if (e.status === "cancelled") return null;
  const startMs = e.start.dateTime
    ? Date.parse(e.start.dateTime)
    : e.start.date
      ? Date.parse(e.start.date + "T00:00:00")
      : NaN;
  const endMs = e.end.dateTime
    ? Date.parse(e.end.dateTime)
    : e.end.date
      ? Date.parse(e.end.date + "T00:00:00")
      : NaN;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  return {
    id: e.id,
    title: e.summary ?? "(no title)",
    start: startMs,
    end: endMs,
    allDay: Boolean(e.start.date && !e.start.dateTime),
    location: e.location ?? null,
  };
}

// CORS: the Authorization header is NOT a CORS-safelisted header, so even a
// GET triggers a preflight. Without these headers + the OPTIONS handler, the
// WKWebView silently blocked every events fetch — the calendar pane sat
// empty since launch. (Same bug class as synthesize-spoke's "Load failed".)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Resolve user from Supabase JWT in Authorization header.
  const auth = req.headers.get("Authorization") ?? "";
  const userJwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!userJwt) {
    return new Response("missing Authorization", {
      status: 401,
      headers: corsHeaders,
    });
  }
  const { data: userData, error: userErr } =
    await supabase.auth.getUser(userJwt);
  if (userErr || !userData.user) {
    return new Response("auth failed", { status: 401, headers: corsHeaders });
  }
  const userId = userData.user.id;

  // Parse range. Default: now → +7 days.
  const url = new URL(req.url);
  const timeMin = url.searchParams.get("timeMin") ?? new Date().toISOString();
  const timeMax =
    url.searchParams.get("timeMax") ??
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  let token;
  try {
    token = await getValidGoogleAccessToken(supabase, userId);
  } catch (e) {
    console.error("[fetch-google-events] token refresh failed", e);
    return new Response(
      JSON.stringify({ error: "token_refresh_failed" }),
      { status: 500, headers: jsonHeaders },
    );
  }
  if (!token) {
    // User hasn't connected Google yet — return empty list instead of an
    // error so the client can render the empty state cleanly.
    return new Response(
      JSON.stringify({ events: [], connected: false }),
      { status: 200, headers: jsonHeaders },
    );
  }

  const calUrl = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  calUrl.searchParams.set("timeMin", timeMin);
  calUrl.searchParams.set("timeMax", timeMax);
  calUrl.searchParams.set("singleEvents", "true");
  calUrl.searchParams.set("orderBy", "startTime");
  calUrl.searchParams.set("maxResults", "100");

  const res = await fetch(calUrl.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("[fetch-google-events] Calendar API failed", res.status, txt);
    return new Response(
      JSON.stringify({ error: "calendar_api_failed", status: res.status }),
      { status: 502, headers: jsonHeaders },
    );
  }
  const json = (await res.json()) as { items: GoogleEvent[] };
  const events = (json.items ?? [])
    .map(normalize)
    .filter((e): e is NormalizedEvent => Boolean(e));

  return new Response(
    JSON.stringify({ events, connected: true }),
    { status: 200, headers: jsonHeaders },
  );
});
