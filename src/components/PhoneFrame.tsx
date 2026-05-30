import type { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";

type Props = { children: ReactNode };

// Native: fill the viewport, top padding = safe-area-top so content sits
// below the Dynamic Island. Composer (fixed at viewport bottom) handles
// its own keyboard / safe-area-bottom offset.
//
// Web (desktop preview): 393x760 phone-shaped centered container.
export const PhoneFrame = ({ children }: Props) => {
  if (Capacitor.isNativePlatform()) {
    return (
      <div
        className="bg-paper relative overflow-hidden flex flex-col w-full h-full max-w-full"
        style={{
          // Hardcoded for iPhone 17 Pro Max while debugging — bypassing the
          // safe-area CSS var which may not be applying in time.
          paddingTop: "59px",
          paddingLeft: "0px",
          paddingRight: "0px",
        }}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className="bg-paper relative overflow-hidden rounded-[44px] ring-1 ring-rule shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] flex flex-col"
      style={{ width: 393, height: 760 }}
    >
      {children}
    </div>
  );
};
