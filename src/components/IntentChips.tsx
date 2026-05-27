type ChipDef = {
  body: string;
  hint?: string;
};

export const DEFAULT_CHIPS: ChipDef[] = [
  { body: "30-min call within 2 weeks" },
  { body: "Trade notes async" },
  { body: "Send them something" },
  { body: "Make an intro" },
  { body: "Stay in touch" },
];

type Props = {
  chips?: ChipDef[];
  usedBodies: Set<string>;
  onPick: (body: string) => void;
  onSkip?: () => void;
};

export const IntentChips = ({
  chips = DEFAULT_CHIPS,
  usedBodies,
  onPick,
  onSkip,
}: Props) => {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const used = usedBodies.has(chip.body);
        return (
          <button
            key={chip.body}
            onClick={() => onPick(chip.body)}
            disabled={used}
            className={`h-9 px-3 rounded-full text-[12.5px] font-medium border transition-colors ${
              used
                ? "bg-agent-tint border-agent/40 text-agent"
                : "bg-card border-rule text-ink hover:border-ink"
            }`}
          >
            {used && <span className="mr-1.5">✓</span>}
            {chip.body}
          </button>
        );
      })}
      {onSkip && (
        <button
          onClick={onSkip}
          className="h-9 px-3 rounded-full text-[12.5px] font-medium border border-transparent text-muted hover:text-ink"
        >
          Skip for now
        </button>
      )}
    </div>
  );
};
