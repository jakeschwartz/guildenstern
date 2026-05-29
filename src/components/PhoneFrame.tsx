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
    // Position: fixed so iOS WebView's native auto-scroll-into-view (which
    // fires on input focus) can't shift us — header and composer stay put.
    // bottom: var(--kbd-h) physically anchors the frame above the keyboard.
    return (
      <div
        className="bg-paper overflow-hidden flex flex-col max-w-full"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: "var(--kbd-h, 0px)",
          paddingTop: "var(--safe-t, 0px)",
          paddingBottom: "var(--safe-b, 0px)",
          paddingLeft: "var(--safe-l, 0px)",
          paddingRight: "var(--safe-r, 0px)",
          transition: "bottom 0.2s ease, padding-bottom 0.2s ease",
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
