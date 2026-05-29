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
    // WebView is edge-to-edge (contentInset='never'); we pad here so the
    // header sits below the Dynamic Island and the composer above the home
    // indicator. The paper bg fills the whole device including the inset
    // strips — no iOS-grey gap below the composer.
    // When the keyboard is up, we drop the bottom inset (the keyboard IS
    // the bottom) and shrink the frame by the keyboard height.
    return (
      <div
        className="bg-paper relative overflow-hidden flex flex-col w-full max-w-full"
        style={{
          height: `calc(100dvh - var(--kbd-h, 0px))`,
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "var(--safe-b, env(safe-area-inset-bottom))",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          transition: "height 0.25s ease, padding-bottom 0.25s ease",
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
