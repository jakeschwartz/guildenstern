import type { BriefingItem, BriefingTone } from "../types";

const TONE_DOT: Record<BriefingTone, string> = {
  attention: "bg-attention",
  agent: "bg-agent",
  deliberation: "bg-deliberation",
  muted: "bg-muted",
  neutral: "bg-transparent",
};

const TONE_TEXT: Record<BriefingTone, string> = {
  attention: "text-attention",
  agent: "text-agent",
  deliberation: "text-deliberation",
  muted: "text-muted",
  neutral: "text-ink",
};

type Props = {
  title: string;
  items: BriefingItem[];
  onTapItem: (item: BriefingItem) => void;
};

export const BriefingCard = ({ title, items, onTapItem }: Props) => (
  <div className="rounded-2xl border border-rule overflow-hidden bg-card/40">
    <div className="px-4 py-2.5 border-b border-rule">
      <span className="text-[12px] text-muted">{title}</span>
    </div>
    <ul>
      {items.map((item, i) => {
        const tone: BriefingTone = item.tone ?? "neutral";
        return (
          <li key={i} className="border-b border-rule last:border-b-0">
            <button
              onClick={() => onTapItem(item)}
              className="w-full text-left px-4 py-3 hover:bg-card transition-colors flex flex-col gap-1"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-semibold tracking-tight truncate text-ink">
                  {item.label}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {item.status && (
                    <span
                      className={`text-[11.5px] flex items-center gap-1.5 ${TONE_TEXT[tone]}`}
                    >
                      {tone !== "neutral" && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`}
                        />
                      )}
                      {item.status}
                    </span>
                  )}
                  <span className="text-muted text-[12px]">›</span>
                </div>
              </div>
              {item.detail && (
                <span className="text-[12.5px] text-muted">{item.detail}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);
