// Manual keyboard handling. We track the keyboard height in a CSS variable
// (--kbd-h) so layout containers can pad their bottom by that amount.
// Combined with capacitor.config Keyboard.resize="none" so iOS's own
// scroll-into-view behavior doesn't fight ours.

import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardStyle } from "@capacitor/keyboard";

export async function initKeyboardIfNative() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Keyboard.setStyle({ style: KeyboardStyle.Dark });
    await Keyboard.setAccessoryBarVisible({ isVisible: false });

    // Canonical Capacitor pattern: track keyboard height as a CSS variable.
    // The composer (position:fixed) uses calc(--kbd-h + --safe-b) for its
    // bottom offset, so it rides above the keyboard automatically.
    // KeyboardResize.None — we don't want iOS shrinking the body or
    // doing its own scroll-into-view since we handle everything in CSS.
    // Accessory bar is hidden above, so info.keyboardHeight is the real
    // keyboard height — no buffer needed.
    const PREDICTIVE_BAR_PX = 0;
    const root = document.documentElement;
    const scrollAll = () => {
      document
        .querySelectorAll<HTMLElement>("[data-thread-scroll='true']")
        .forEach((el) => {
          el.scrollTop = el.scrollHeight;
        });
    };
    Keyboard.addListener("keyboardWillShow", (info) => {
      const kbd = info.keyboardHeight + PREDICTIVE_BAR_PX;
      root.style.setProperty("--kbd-h", `${kbd}px`);
      root.style.setProperty("--safe-b", "0px");
    });
    Keyboard.addListener("keyboardDidShow", (info) => {
      const kbd = info.keyboardHeight + PREDICTIVE_BAR_PX;
      root.style.setProperty("--kbd-h", `${kbd}px`);
      requestAnimationFrame(scrollAll);
      setTimeout(scrollAll, 250);
    });
    Keyboard.addListener("keyboardWillHide", () => {
      root.style.setProperty("--kbd-h", "0px");
      root.style.setProperty("--safe-b", "34px");
    });
  } catch (e) {
    console.warn("[guildenstern] keyboard init failed", e);
  }
}
