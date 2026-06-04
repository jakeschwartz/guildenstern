// google-oauth-start: redirects the user to Google's OAuth consent screen
// with the requested scopes. State carries the authenticated user_id so the
// callback function knows which row to write.
//
// Client opens this URL in Safari View Controller (or a regular tab on web)
// with the user's JWT in a query param so we can resolve their user_id
// server-side without trusting a client-passed value.
//
// Env required (set via `supabase secrets set ...`):
//   GOOGLE_CLIENT_ID
//   GOOGLE_REDIRECT_URI   - must exactly match the URI registered in
//                           console.cloud.google.com → Credentials → Web Client.
//                           e.g. https://psthqrdqggqgekqbansb.supabase.co/functions/v1/google-oauth-callback
//
// Auto-injected by Supabase:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// Map our short scope aliases to full Google scope URLs. Client passes
// short names; server expands them. Lets us add new APIs without code
// changes on the client.
const SCOPE_MAP: Record<string, string> = {
  "calendar.readonly":
    "https://www.googleapis.com/auth/calendar.readonly",
  "gmail.readonly": "https://www.googleapis.com/auth/gmail.readonly",
  "gmail.send": "https://www.googleapis.com/auth/gmail.send",
};

Deno.serve(async (req) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    return new Response(
      "Google OAuth not configured (missing GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI)",
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  // The client passes the user's access_token (Supabase JWT) so we can
  // resolve their user_id without trusting query-string spoofing.
  const accessToken = url.searchParams.get("access_token");
  if (!accessToken) {
    return new Response("missing access_token", { status: 400 });
  }
  const { data: userData, error: userErr } =
    await supabase.auth.getUser(accessToken);
  if (userErr || !userData.user) {
    return new Response("auth failed", { status: 401 });
  }
  const userId = userData.user.id;

  // Scopes the client wants to request, comma-separated short names.
  const requestedScopes = (url.searchParams.get("scopes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (requestedScopes.length === 0) {
    return new Response("missing scopes", { status: 400 });
  }
  const expandedScopes = requestedScopes
    .map((s) => SCOPE_MAP[s])
    .filter((s): s is string => Boolean(s));
  if (expandedScopes.length === 0) {
    return new Response("unknown scopes", { status: 400 });
  }

  // Merge with already-granted scopes so re-OAuthing doesn't strip prior
  // grants. Google's incremental authorization respects this when we pass
  // include_granted_scopes=true.
  const { data: existing } = await supabase
    .from("google_oauth_tokens")
    .select("scope")
    .eq("user_id", userId)
    .maybeSingle();
  const priorScopes = existing?.scope
    ? existing.scope.split(" ").filter(Boolean)
    : [];
  const scopeSet = new Set<string>([...priorScopes, ...expandedScopes]);
  const scopeParam = Array.from(scopeSet).join(" ");

  // State = the user_id (encoded). Callback reads it to write the row.
  // (Refresh-token-flow doesn't need PKCE for confidential clients.)
  const state = btoa(JSON.stringify({ user_id: userId }));

  const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  oauthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  oauthUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("scope", scopeParam);
  oauthUrl.searchParams.set("access_type", "offline");
  oauthUrl.searchParams.set("prompt", "consent");
  oauthUrl.searchParams.set("include_granted_scopes", "true");
  oauthUrl.searchParams.set("state", state);

  return Response.redirect(oauthUrl.toString(), 302);
});
