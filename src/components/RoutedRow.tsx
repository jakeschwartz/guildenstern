// Routed item row used inside Mira's voice when she sorts a burst into queue
// items. Carries a re-file affordance (↻) per spec §6.

type Props = {
  label: string;
  detail?: string;
  status?: string;
  onRefile?: () => void;
  onTap?: () => void;
  done?: boolean;
};

export const RoutedRow = ({
  label,
  detail,
  status,
  onRefile,
  onTap,
  done = false,
}: Props) => {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-rule/60 last:border-b-0">
      <button
        onClick={onTap}
        className="flex-1 min-w-0 text-left flex items-baseline gap-2"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            done ? "bg-mira" : "bg-muted/60"
          }`}
        />
        <span
          className={`text-[13.5px] ${
            done ? "text-muted line-through" : "text-ink"
          } truncate`}
        >
          {label}
        </span>
        {detail && (
          <span className="text-[11.5px] text-muted truncate">{detail}</span>
        )}
        {status && (
          <span className="text-[11px] text-muted ml-auto shrink-0">
            {status}
          </span>
        )}
      </button>
      {onRefile && (
        <button
          onClick={onRefile}
          aria-label="Re-file"
          className="text-muted hover:text-ink text-[14px] leading-none shrink-0 px-1.5 py-1"
        >
          ↻
        </button>
      )}
    </div>
  );
};
