import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jakeschwartz.guildenstern",
  appName: "Guildenstern",
  webDir: "dist",
  ios: {
    // Edge-to-edge: WebView extends into the safe areas. Our dark paper bg
    // fills the whole device. PhoneFrame pads by safe-area-inset-* so actual
    // content sits inside the safe area.
    contentInset: "never",
    // CRITICAL: disable the WebView's native scroll so iOS can't
    // auto-scroll the focused input into view (which was pushing our
    // header off the top of the screen). HTML overflow-y-auto on the
    // messages container still works for content scrolling.
    scrollEnabled: false,
  },
  plugins: {
    Keyboard: {
      // none: iOS does NOT shrink body or auto-adjust anything. WebView
      // stays at full device size always (no oscillation between
      // 440×956 and 398×866). We track --kbd-h from plugin events and
      // position:fixed the composer with bottom: calc(--kbd-h + --safe-b).
      resize: "none",
      style: "DARK",
      resizeOnFullScreen: false,
    },
  },
};

export default config;
