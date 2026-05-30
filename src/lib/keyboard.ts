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

    // With KeyboardResize.Body, iOS shrinks document.body — no manual
    // tracking needed. We just toggle --safe-b to 0 when keyboard is up so
    // the composer sits flush against it (no double home-indicator padding)
    // and re-pin scrollable threads to the bottom.
    const root = document.documentElement;
    Keyboard.addListener("keyboardWillShow", () => {
      root.style.setProperty("--safe-b", "0px");
    });
    Keyboard.addListener("keyboardDidShow", () => {
      requestAnimationFrame(() => {
        document
          .querySelectorAll<HTMLElement>("[data-thread-scroll='true']")
          .forEach((el) => {
            el.scrollTop = el.scrollHeight;
          });
      });
    });
    Keyboard.addListener("keyboardWillHide", () => {
      const safeB = window.innerHeight >= 900 ? "34px" : "34px";
      root.style.setProperty("--safe-b", safeB);
    });
  } catch (e) {
    console.warn("[guildenstern] keyboard init failed", e);
  }
}
