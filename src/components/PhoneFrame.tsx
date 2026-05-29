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
    // Height is h-full (= 100% of body) rather than h-[100dvh] so that the
    // Capacitor Keyboard plugin's `resize: body` actually shrinks us when
    // the soft keyboard opens. dvh ignores body resize and causes the whole
    // composer view to drift around as iOS auto-scrolls the focused input.
    return (
      <div
        className="bg-paper relative overflow-hidden flex flex-col w-full h-full"
        style={{
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
