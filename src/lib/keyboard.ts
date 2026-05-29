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

    const root = document.documentElement;
    const setHeight = (px: number) => {
      root.style.setProperty("--kbd-h", `${px}px`);
      // When the keyboard is up, the home-indicator safe-area inset shouldn't
      // also push the composer up (the keyboard IS the bottom). Toggle a
      // separate var that PhoneFrame uses for paddingBottom.
      root.style.setProperty(
        "--safe-b",
        px > 0 ? "0px" : "env(safe-area-inset-bottom)",
      );
    };
    setHeight(0);

    // Find the active scrollable region (the messages container) and jump
    // it to the bottom whenever the keyboard appears, so the most recent
    // messages stay visible above the composer.
    const scrollAllToBottom = () => {
      document
        .querySelectorAll<HTMLElement>("[data-thread-scroll='true']")
        .forEach((el) => {
          el.scrollTop = el.scrollHeight;
        });
    };

    Keyboard.addListener("keyboardWillShow", (info) => {
      setHeight(info.keyboardHeight);
    });
    Keyboard.addListener("keyboardDidShow", (info) => {
      setHeight(info.keyboardHeight);
      // After the height transition settles, re-pin to bottom.
      requestAnimationFrame(() => scrollAllToBottom());
    });
    Keyboard.addListener("keyboardWillHide", () => {
      setHeight(0);
    });
  } catch (e) {
    console.warn("[guildenstern] keyboard init failed", e);
  }
}
