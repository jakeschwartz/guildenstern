import type { MutualIntent } from "../types";
import { IntentLedger } from "./IntentLedger";

type Props = {
  intents: MutualIntent[];
  contactName: string;
  expanded: boolean;
  onToggle: () => void;
};

type Summary = {
  dot: string;
  label: string;
  tone: string;
};

const summarize = (intents: MutualIntent[]): Summary => {
  const waitingYou = intents.filter((i) => i.status === "awaiting-you");
  const waitingThem = intents.filter((i) => i.status === "awaiting-them");
  const ratified = intents.filter((i) => i.status === "ratified");

  if (waitingYou.length > 0) {
    const lead = waitingYou[0]!.body;
    return {
      dot: "bg-attention",
      label:
        waitingYou.length === 1
          ? `Waiting on you · ${lead}`
          : `${waitingYou.length} waiting on you`,
      tone: "text-attention",
    };
  }
  if (waitingThem.length > 0) {
    return {
      dot: "bg-muted",
      label:
        waitingThem.length === 1
          ? `Waiting on them · ${waitingThem[0]!.body}`
          : `${waitingThem.length} waiting on them`,
      tone: "text-muted",
    };
  }
  return {
    dot: "bg-agent",
    label: `All ${ratified.length} ratified`,
    tone: "text-agent",
  };
};

export const LedgerPill = ({
  intents,
  contactName,
  expanded,
  onToggle,
}: Props) => {
  const s = summarize(intents);
  return (
    <div className="border-b border-rule">
      <button
        onClick={onToggle}
        className="w-full h-11 px-4 flex items-center gap-2.5 text-left hover:bg-card/40 transition-colors"
      >
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.dot}`} />
        <span
          className={`text-[13px] font-semibold ${s.tone} truncate flex-1`}
        >
          {s.label}
        </span>
        <span className="text-muted text-[12px] leading-none shrink-0">
          {expanded ? "⌃" : "⌄"}
        </span>
      </button>
      {expanded && (
        <IntentLedger intents={intents} contactName={contactName} />
      )}
    </div>
  );
};
