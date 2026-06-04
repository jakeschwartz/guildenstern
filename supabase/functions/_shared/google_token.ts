// Shared helper: get a valid Google access_token for a user, refreshing it
// if expired. Imported by any edge function that calls Google APIs.
//
// Caller's responsibility: pass a Supabase client created with the service
// role (so it can read the tokens table and update on refresh).

// deno-lint-ignore-file no-explicit-any
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

export type GoogleTokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_at: string;
};

export async function getValidGoogleAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ access_token: string; scope: string } | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google client creds not configured");
  }

  const { data: row, error } = await supabase
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const tokenRow = row as GoogleTokenRow;

  // 30-second buffer before actual expiry so we don't hit a 401 in flight.
  const expired =
    new Date(tokenRow.expires_at).getTime() - 30_000 < Date.now();
  if (!expired) {
    return {
      access_token: tokenRow.access_token,
      scope: tokenRow.scope,
    };
  }

  // Refresh.
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google token refresh failed: ${t}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };

  const newExpiresAt = new Date(
    Date.now() + (tok.expires_in - 60) * 1000,
  ).toISOString();

  await supabase
    .from("google_oauth_tokens")
    .update({
      access_token: tok.access_token,
      expires_at: newExpiresAt,
      // Google may return a refreshed scope string; keep ours if unchanged.
      scope: tok.scope ?? tokenRow.scope,
    })
    .eq("user_id", userId);

  return {
    access_token: tok.access_token,
    scope: tok.scope ?? tokenRow.scope,
  };
}
