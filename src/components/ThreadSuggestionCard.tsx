// An agent's "let's give this its own thread" proposal, rendered as a callout
// beneath its message. Suggest-then-confirm: nothing is created until the user
// taps Start. On accept it collapses to a tappable link into the new thread.
// Tinted to the speaking agent (Otis green in partnership threads, Mira plum
// in personal threads) — this is the agent being helpful, not flagging a
// problem, so never attention-orange.

import type { ThreadSuggestion } from "../types";

type Props = {
  suggestion: ThreadSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  onOpenCreated: (threadId: string) => void;
  // Which agent is speaking — drives the tint. Defaults to Otis (the original
  // off-topic-move producer); PersonalThread passes "mira".
  voice?: "otis" | "mira";
};

export const ThreadSuggestionCard = ({
  suggestion,
  onAccept,
  onDismiss,
  onOpenCreated,
  voice = "otis",
}: Props) => {
  if (suggestion.status === "dismissed") return null;

  // Tint tokens per voice. Kept as whole class strings so Tailwind's content
  // scanner sees them literally.
  const tint =
    voice === "mira"
      ? {
          border: "border-mira/30",
          bg: "bg-mira-tint/40",
          bgHover: "hover:bg-mira-tint/60",
          arrow: "text-mira",
        }
      : {
          border: "border-otis/30",
          bg: "bg-otis-tint/40",
          bgHover: "hover:bg-otis-tint/60",
          arrow: "text-otis",
        };

  if (suggestion.status === "accepted" && suggestion.createdThreadId) {
    const id = suggestion.createdThreadId;
    // "Moved to" when messages were relocated into it (Otis); "Opened" when the
    // agent created a fresh thread on request (Mira).
    const verb = suggestion.sourceMessageIds.length > 0 ? "Moved to" : "Opened";
    return (
      <button
        onClick={() => onOpenCreated(id)}
        className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border ${tint.border} ${tint.bg} px-3 py-2 text-left ${tint.bgHover} transition-colors`}
      >
        <span className="text-[12.5px] font-semibold text-ink">
          {verb} {suggestion.suggestedTitle}
        </span>
        <span aria-hidden className={`${tint.arrow} text-[13px] leading-none`}>
          →
        </span>
      </button>
    );
  }

  return (
    <div
      className={`mt-2 rounded-lg border ${tint.border} ${tint.bg} px-3 py-2.5`}
    >
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
