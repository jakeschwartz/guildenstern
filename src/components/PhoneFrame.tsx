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
    // Manual keyboard handling: --kbd-h is set by lib/keyboard.ts on
    // keyboardWillShow / keyboardWillHide. We shrink the available area by
    // that amount so the composer sits right above the keyboard instead of
    // iOS auto-scrolling us around.
    return (
      <div
        className="bg-paper relative overflow-hidden flex flex-col w-full"
        style={{
          height: `calc(100dvh - var(--kbd-h, 0px))`,
          paddingBottom: "env(safe-area-inset-bottom)",
          transition: "height 0.25s ease",
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
