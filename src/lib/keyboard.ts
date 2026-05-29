// Programmatic keyboard config. capacitor.config.ts sets defaults but we also
// call setResizeMode at boot as belt-and-suspenders (and to debug keyboard
// events when things don't feel right).

import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

export async function initKeyboardIfNative() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
    await Keyboard.setStyle({ style: KeyboardStyle.Dark });
    await Keyboard.setAccessoryBarVisible({ isVisible: false });

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
