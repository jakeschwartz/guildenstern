// OpenSpoke — sheet UI for creating a focused side-thread inside an existing
// partnership. Same two people, separate conversation. Used when a topic
// gets nagged about in the main thread and wants its own room ("Jake's
// birthday party", "summer trip planning"). Per UX_SPEC §3.05.

import { useState } from "react";
import { createPartnershipSpoke } from "../state/store";

const fmtErr = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
  }
  return "Couldn't open the thread";
};

type Props = {
  partnershipId: string;
  onCreated: (threadId: string) => void;
  onCancel: () => void;
};

export const OpenSpoke = ({ partnershipId, onCreated, onCancel }: Props) => {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createPartnershipSpoke(partnershipId, title.trim());
      onCreated(id);
    } catch (e) {
      setError(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-2 pb-2">
      <div className="text-[15px] font-semibold text-ink tracking-tight">
        Open a focused thread
      </div>
      <div className="text-[12.5px] text-muted mt-1 leading-relaxed">
        A side channel for one topic. Same partnership, separate room.
        Use it when something specific (a decision, a plan, a project)
        wants its own space.
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={60}
        autoFocus
        placeholder="What's this thread for?"
        className="mt-5 w-full h-12 rounded-xl border border-rule px-4 text-[15px] text-ink bg-paper focus:outline-none focus:border-ink"
      />

      <button
        onClick={submit}
        disabled={busy || title.trim().length < 2}
        className="mt-4 w-full h-11 rounded-xl bg-ink text-paper text-[14px] font-semibold tracking-tight disabled:opacity-50 transition-opacity"
      >
        {busy ? "Opening…" : "Open thread"}
      </button>

      {error && (
        <div className="mt-3 text-[12.5px] text-attention text-center">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="mt-4 w-full h-11 rounded-xl border border-rule text-[14px] font-semibold text-ink hover:bg-card/60 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
};
