// Google OAuth handoff from the client. Opens the Safari View Controller
// (or new tab on web) to our google-oauth-start function, which redirects
// to Google's consent screen. The user grants, Google redirects back to
// google-oauth-callback, which writes the row in google_oauth_tokens.
//
// We don't try to detect the redirect back into the app — there's no deep
// link wired up. Instead the client subscribes to the tokens table via
// realtime and flips its UI to "Connected" when the row appears.

import { Browser } from "@capacitor/browser";
import { supabase } from "./supabase";
import type { CalendarEvent } from "../types";

const SUPABASE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export type GoogleScope = "calendar.readonly" | "gmail.readonly" | "gmail.send";

export async function connectGoogle(scopes: GoogleScope[]): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const url = new URL(`${SUPABASE_FN_URL}/google-oauth-start`);
  url.searchParams.set("scopes", scopes.join(","));
  url.searchParams.set("access_token", token);

  // On native, open Safari View Controller (in-app browser sheet). On web,
  // open in a new tab. Either way the OAuth flow happens out of our process.
  await Browser.open({ url: url.toString(), presentationStyle: "popover" });
}

// Convenience: check whether the current user has connected Google with a
// given scope. Returns { connected, scopes }.
export async function getGoogleConnectionStatus(): Promise<{
  connected: boolean;
  scopes: string[];
}> {
  const { data, error } = await supabase
    .from("google_oauth_tokens")
    .select("scope")
    .single();
  if (error || !data) return { connected: false, scopes: [] };
  return {
    connected: true,
    scopes: data.scope.split(" ").filter(Boolean),
  };
}

// Fetch the user's primary Google Calendar events in a date range. Defaults
// to now → +7 days. Returns [] if the user isn't connected (rather than an
// error), so callers can render the empty state cleanly without a try/catch.
export async function fetchCalendarEvents(opts?: {
  timeMin?: Date;
  timeMax?: Date;
}): Promise<CalendarEvent[]> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return [];

  const url = new URL(`${SUPABASE_FN_URL}/fetch-google-events`);
  if (opts?.timeMin) url.searchParams.set("timeMin", opts.timeMin.toISOString());
  if (opts?.timeMax) url.searchParams.set("timeMax", opts.timeMax.toISOString());

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error("[fetchCalendarEvents] failed", res.status, await res.text());
    return [];
  }
  const json = (await res.json()) as {
    events: CalendarEvent[];
    connected: boolean;
  };
  return json.events ?? [];
}

// Realtime subscription so the menu UI flips to "Connected" the moment the
// callback function inserts/updates the row.
export function subscribeToGoogleTokens(
  onChange: (status: { connected: boolean; scopes: string[] }) => void,
): () => void {
  const channel = supabase
    .channel("google_oauth_tokens:me")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "google_oauth_tokens",
      },
      (payload) => {
        const row = payload.new as { scope?: string } | null;
        if (row?.scope) {
          onChange({
            connected: true,
            scopes: row.scope.split(" ").filter(Boolean),
          });
        } else {
          onChange({ connected: false, scopes: [] });
        }
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
