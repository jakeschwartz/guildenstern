import type { ReactNode } from "react";

type Props = {
  onBack: () => void;
  onExpand: () => void;
  children: ReactNode;
};

export const ThreadAnchor = ({ onBack, onExpand, children }: Props) => (
  <div className="w-full pt-11 pb-2 pl-1 pr-2 flex items-center gap-1 border-b border-rule bg-paper">
    <button
      onClick={onBack}
      className="h-11 w-11 flex items-center justify-center text-muted hover:text-ink shrink-0"
      aria-label="Back"
    >
      <span className="text-[18px] leading-none">←</span>
    </button>
    <button
      onClick={onExpand}
      className="flex-1 min-w-0 h-11 flex items-center gap-2 text-left pr-2"
    >
      {children}
      <span className="text-muted text-[14px] leading-none shrink-0 ml-auto">
        ›
      </span>
    </button>
  </div>
);
