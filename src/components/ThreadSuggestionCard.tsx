// Otis's "this belongs in its own thread" proposal, rendered as a callout
// beneath his message. Suggest-then-confirm: nothing is created until a
// partner taps Start. On accept it collapses to a tappable link into the new
// thread. Otis-green, not attention-orange — this is him being helpful, not
// flagging a problem.

import type { ThreadSuggestion } from "../types";

type Props = {
  suggestion: ThreadSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  onOpenCreated: (threadId: string) => void;
};

export const ThreadSuggestionCard = ({
  suggestion,
  onAccept,
  onDismiss,
  onOpenCreated,
}: Props) => {
  if (suggestion.status === "dismissed") return null;

  if (suggestion.status === "accepted" && suggestion.createdThreadId) {
    const id = suggestion.createdThreadId;
    return (
      <button
        onClick={() => onOpenCreated(id)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-otis/30 bg-otis-tint/40 px-3 py-2 text-left hover:bg-otis-tint/60 transition-colors"
      >
        <span className="text-[12.5px] font-semibold text-ink">
          Moved to {suggestion.suggestedTitle}
        </span>
        <span aria-hidden className="text-otis text-[13px] leading-none">
          →
        </span>
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-otis/30 bg-otis-tint/40 px-3 py-2.5">
      <div className="text-[12.5px] text-ink leading-relaxed">
        {suggestion.reason}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          onClick={onAccept}
          className="h-7 px-2.5 rounded-md bg-ink text-paper text-[11.5px] font-semibold tracking-tight hover:opacity-90 transition-opacity"
        >
          Start &ldquo;{suggestion.suggestedTitle}&rdquo;
        </button>
        <button
          onClick={onDismiss}
          className="h-7 px-2.5 rounded-md text-muted text-[11.5px] font-semibold tracking-tight hover:text-ink transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
};
