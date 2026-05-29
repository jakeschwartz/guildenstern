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

    const setHeight = (px: number) => {
      document.documentElement.style.setProperty("--kbd-h", `${px}px`);
    };
    setHeight(0);

    Keyboard.addListener("keyboardWillShow", (info) => {
      setHeight(info.keyboardHeight);
    });
    Keyboard.addListener("keyboardWillHide", () => {
      setHeight(0);
    });
    Keyboard.addListener("keyboardDidShow", (info) => {
      setHeight(info.keyboardHeight);
    });
  } catch (e) {
    console.warn("[guildenstern] keyboard init failed", e);
  }
}
