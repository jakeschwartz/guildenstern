import type { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";

type Props = { children: ReactNode };

// On real iOS (inside Capacitor): fill the device. We rely on h-[100dvh]
// for the (dynamic) viewport height and pad the bottom by the safe-area
// inset so the composer / menu button don't sit under the home indicator.
// Top padding stays inside individual views (pt-11/12 already accounts for
// the notch).
//
// On web (desktop browser preview): show a 393x760 phone-shaped container
// centered on the page — useful when sketching the UI from a laptop.
export const PhoneFrame = ({ children }: Props) => {
  if (Capacitor.isNativePlatform()) {
    return (
      <div
        className="bg-paper relative overflow-hidden flex flex-col w-full"
        style={{
          height: "100dvh",
          paddingBottom: "env(safe-area-inset-bottom)",
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
