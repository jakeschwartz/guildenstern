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

// Trigger fresh synthesis. Calls the edge function; updates cache; returns
// the new summary. Use when the cached version is stale or the user
// explicitly tapped Refresh.
export async function refreshSpokeSummary(
  threadId: string,
): Promise<SpokeSummary | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  const res = await fetch(`${SUPABASE_FN_URL}/synthesize-spoke`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ thread_id: threadId }),
  });
  if (!res.ok) {
    console.error(
      "[refreshSpokeSummary] failed",
      res.status,
      await res.text(),
    );
    return null;
  }
  const j = (await res.json()) as {
    summary: string;
    sections: SpokeSection[];
    updated_at: string;
  };
  return {
    threadId,
    summary: j.summary,
    sections: j.sections,
    updatedAt: new Date(j.updated_at).getTime(),
  };
}
