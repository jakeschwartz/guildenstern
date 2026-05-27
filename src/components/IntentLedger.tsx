import type { MutualIntent, IntentStatus } from "../types";

const STATUS_STYLE: Record<
  IntentStatus,
  { dot: string; label: string; labelTone: string; bodyTone: string }
> = {
  ratified: {
    dot: "bg-agent",
    label: "Both ratified",
    labelTone: "text-agent",
    bodyTone: "text-ink",
  },
  "awaiting-them": {
    dot: "bg-muted",
    label: "Waiting on them",
    labelTone: "text-muted",
    bodyTone: "text-ink",
  },
  "awaiting-you": {
    dot: "bg-attention",
    label: "Waiting on you",
    labelTone: "text-attention",
    bodyTone: "text-ink",
  },
  expired: {
    dot: "bg-rule",
    label: "Expired",
    labelTone: "text-muted",
    bodyTone: "text-muted line-through",
  },
};

type Props = {
  contactName: string;
  intents: MutualIntent[];
};

export const IntentLedger = ({ intents }: Props) => (
  <ul className="bg-card/40">
    {intents.map((intent) => {
      const s = STATUS_STYLE[intent.status];
      const awaitingYou = intent.status === "awaiting-you";
      return (
        <li
          key={intent.id}
          className="px-4 py-3 border-t border-rule first:border-t-0 flex items-start gap-3"
        >
          <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${s.dot}`} />
          <div className="flex-1 min-w-0">
            <div className={`text-[14px] leading-snug ${s.bodyTone}`}>
              {intent.body}
            </div>
            <div
              className={`text-[11.5px] mt-1 ${s.labelTone}`}
            >
              {s.label}
            </div>
          </div>
          {awaitingYou && (
            <button className="text-[12px] font-medium text-attention border border-attention/40 rounded-full px-3 h-8 hover:bg-attention hover:text-paper transition-colors shrink-0">
              Ratify
            </button>
          )}
        </li>
      );
    })}
  </ul>
);
