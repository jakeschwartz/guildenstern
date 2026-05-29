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

    // Keyboard height tracking is handled by lib/safe-area via the
    // window.visualViewport API (more accurate than the plugin which
    // misses the predictive-text bar). We just consume Keyboard events
    // for logging.
    Keyboard.addListener("keyboardWillShow", (info) => {
      console.log("[guildenstern] keyboardWillShow", info);
    });
    Keyboard.addListener("keyboardWillHide", () => {
      console.log("[guildenstern] keyboardWillHide");
    });
  } catch (e) {
    console.warn("[guildenstern] keyboard init failed", e);
  }
}
