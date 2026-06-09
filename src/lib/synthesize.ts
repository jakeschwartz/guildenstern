// Client helpers for spoke "Where we are" synthesis. Hits the
// synthesize-spoke edge function (writes to DB + returns fresh result),
// or reads the cached row directly when we don't need to re-synthesize.

import { supabase } from "./supabase";
import type { SpokeSection, SpokeSummary } from "../types";

const SUPABASE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const rowToSpokeSummary = (
  row: {
    thread_id: string;
    summary: string;
    sections: SpokeSection[];
    updated_at: string;
  } | null,
): SpokeSummary | null =>
  row
    ? {
        threadId: row.thread_id,
        summary: row.summary,
        sections: row.sections,
        updatedAt: new Date(row.updated_at).getTime(),
      }
    : null;

// Pull the cached summary without re-synthesizing. Returns null if Otis
// hasn't written one yet for this spoke.
export async function getCachedSpokeSummary(
  threadId: string,
): Promise<SpokeSummary | null> {
  const { data } = await supabase
    .from("spoke_summaries")
    .select("thread_id, summary, sections, updated_at")
    .eq("thread_id", threadId)
    .maybeSingle();
  return rowToSpokeSummary(data);
}

// Trigger a synthesis pass. The edge function does Claude work in the
// BACKGROUND (EdgeRuntime.waitUntil) and returns the currently-cached
// version immediately, plus a `syncing: true` flag if it just enqueued
// fresh work. Subscribe to spoke_summaries realtime to know when the
// background result lands. This sidesteps Claude's latency entirely from
// the client's perspective — no more "Load failed" from a hung Claude
// call.
export type RefreshResult =
  | { ok: true; summary: SpokeSummary | null; syncing: boolean }
  | { ok: false; error: string };

export async function refreshSpokeSummary(
  threadId: string,
  opts?: { debug?: "ping" },
): Promise<RefreshResult> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: "Not signed in" };
    const url = new URL(`${SUPABASE_FN_URL}/synthesize-spoke`);
    if (opts?.debug) url.searchParams.set("debug", opts.debug);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ thread_id: threadId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `HTTP ${res.status} ${text.slice(0, 120)}`,
      };
    }
    const j = (await res.json()) as {
      summary: string | null;
      sections: SpokeSection[];
      updated_at: string | null;
      syncing?: boolean;
    };
    const summary: SpokeSummary | null =
      j.summary && j.updated_at
        ? {
            threadId,
            summary: j.summary,
            sections: j.sections,
            updatedAt: new Date(j.updated_at).getTime(),
          }
        : null;
    return { ok: true, summary, syncing: Boolean(j.syncing) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Subscribe to realtime UPDATE/INSERT on this spoke's summary row. Fires the
// callback whenever the background synthesis lands a new version. Returns
// an unsubscribe function.
export function subscribeToSpokeSummary(
  threadId: string,
  onChange: (summary: SpokeSummary) => void,
): () => void {
  const channel = supabase
    .channel(`spoke_summaries:${threadId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "spoke_summaries",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => {
        const row = payload.new as {
          thread_id: string;
          summary: string;
          sections: SpokeSection[];
          updated_at: string;
        } | null;
        if (row?.summary && row.updated_at) {
          onChange({
            threadId: row.thread_id,
            summary: row.summary,
            sections: row.sections,
            updatedAt: new Date(row.updated_at).getTime(),
          });
        }
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
