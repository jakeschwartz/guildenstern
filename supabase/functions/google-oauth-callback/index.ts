// google-oauth-callback: receives Google's OAuth redirect with ?code=,
// exchanges for tokens, and upserts the row in google_oauth_tokens. Returns
// a simple HTML page telling the user they can close the tab and return to
// the app — the client knows the connection is live via realtime.
//
// Env required:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI  (same as in google-oauth-start)
//
// Auto-injected:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const successHtml = (msg: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guildenstern · Google connected</title>
<style>
  body { font: 15px/1.5 -apple-system,system-ui,sans-serif; padding: 4rem 1.5rem; text-align:center; color:#222; background:#fafaf7; }
  .card { max-width: 360px; margin: 0 auto; padding: 1.5rem; border-radius: 12px; background:#fff; box-shadow: 0 8px 32px rgba(0,0,0,0.06); }
  h1 { font-size: 18px; margin: 0 0 .5rem; }
  p { color: #555; margin: 0; }
</style>
</head><body><div class="card"><h1>${msg}</h1><p>You can close this tab and return to Guildenstern.</p></div></body></html>`;

const errorHtml = (msg: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Guildenstern · error</title></head>
<body style="font:15px -apple-system,system-ui;padding:2rem;color:#b00"><strong>Couldn't connect Google.</strong><br>${msg}</body></html>`;

Deno.serve(async (req) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    return new Response(
      errorHtml("Server config missing GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI"),
      { status: 500, headers: { "content-type": "text/html" } },
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const oauthErr = url.searchParams.get("error");

  if (oauthErr) {
    return new Response(errorHtml(`Google returned: ${oauthErr}`), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (!code || !stateRaw) {
    return new Response(errorHtml("Missing code or state from Google"), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let userId: string;
  try {
    const decoded = JSON.parse(atob(stateRaw));
    userId = decoded.user_id;
    if (!userId) throw new Error("no user_id in state");
  } catch {
    return new Response(errorHtml("Couldn't decode state"), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Exchange code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    console.error("[google-oauth-callback] token exchange failed", t);
    return new Response(errorHtml(`Token exchange failed: ${t}`), {
      status: 502,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const tok = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  // refresh_token only comes back the FIRST time the user grants. If we're
  // re-OAuthing (incremental authorization), Google may omit it. Keep the
  // existing refresh_token in that case.
  let refreshToken = tok.refresh_token;
  if (!refreshToken) {
    const { data: existing } = await supabase
      .from("google_oauth_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    refreshToken = existing?.refresh_token;
  }
  if (!refreshToken) {
    return new Response(
      errorHtml(
        "Google didn't return a refresh_token. Try revoking the app at myaccount.google.com/permissions and reconnecting.",
      ),
      { status: 500, headers: { "content-type": "text/html" } },
    );
  }

  const expiresAt = new Date(
    Date.now() + (tok.expires_in - 60) * 1000,
  ).toISOString();

  const { error: upsertErr } = await supabase
    .from("google_oauth_tokens")
    .upsert(
      {
        user_id: userId,
        access_token: tok.access_token,
        refresh_token: refreshToken,
        scope: tok.scope,
        expires_at: expiresAt,
      },
      { onConflict: "user_id" },
    );
  if (upsertErr) {
    console.error("[google-oauth-callback] upsert failed", upsertErr);
    return new Response(errorHtml(`DB error: ${upsertErr.message}`), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(successHtml("Google connected"), {
    status: 200,
    headers: { "content-type": "text/html" },
  });
});
