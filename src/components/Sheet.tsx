import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * Optional: nuke-everything escape. When provided, backdrop tap + swipe-down
   * fire this instead of onClose so a user stuck under stacked sheets can
   * always dismiss EVERYTHING in one gesture. Cancel/Done still call onClose.
   */
  onForceClose?: () => void;
  title?: string;
  children: ReactNode;
};

export const Sheet = ({
  open,
  onClose,
  onForceClose,
  title,
  children,
}: Props) => {
  const close = onForceClose ?? onClose;
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setDragY(dy);
  };
  const onTouchEnd = () => {
    if (dragY > 80) close();
    setDragY(0);
    startY.current = null;
  };

  // Belt + suspenders: if open=false, do NOT render the sheet at all. No CSS
  // transform tricks, no off-screen translate — just unmounted. Eliminates
  // any "sheet visible despite open=false" failure mode.
  if (!open) return null;

  return (
    <>
      <div
        onClick={close}
        onTouchEnd={close}
        className="absolute inset-0 z-30 bg-ink/40"
      />
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="absolute inset-x-0 z-40 bg-paper rounded-t-3xl border-t border-rule shadow-[0_-12px_40px_-12px_rgba(17,17,17,0.25)] ease-out flex flex-col"
        style={{
          // Sit above the iOS keyboard when it's up. --kbd-h is tracked from
          // Capacitor Keyboard plugin events in src/lib/keyboard.ts. Without
          // this, focusing an input inside the sheet pushes the input under
          // the keyboard with no way to see what you're typing.
          bottom: "var(--kbd-h, 0px)",
          maxHeight: "85%",
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 ? "none" : "transform 200ms ease-out",
        }}
      >
        <div className="flex items-center justify-center pt-3 pb-1.5 shrink-0">
          <span className="h-1.5 w-12 rounded-full bg-rule" />
        </div>
        {title && (
          <div className="px-5 pb-2 text-[12px] text-muted shrink-0">
            {title}
          </div>
        )}
        <div className="px-5 pb-6 overflow-y-auto flex-1 min-h-0">
          {children}
        </div>
      </div>
    </>
  );
};
