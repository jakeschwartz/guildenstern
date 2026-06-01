import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

export const Sheet = ({ open, onClose, title, children }: Props) => (
  <>
    <div
      onClick={onClose}
      className={`absolute inset-0 z-30 bg-ink/30 transition-opacity duration-200 ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    />
    <div
      className={`absolute inset-x-0 bottom-0 z-40 bg-paper rounded-t-3xl border-t border-rule shadow-[0_-12px_40px_-12px_rgba(17,17,17,0.25)] transition-transform duration-200 ease-out flex flex-col ${
        open ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ maxHeight: "85%" }}
    >
      <div className="flex items-center justify-center pt-3 pb-1.5 shrink-0">
        <span className="h-1 w-10 rounded-full bg-rule" />
      </div>
      {title && (
        <div className="px-5 pb-2 text-[12px] text-muted shrink-0">
          {title}
        </div>
      )}
      <div className="px-5 pb-6 overflow-y-auto flex-1 min-h-0">{children}</div>
    </div>
  </>
);
