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
      // body: iOS shrinks document.body when keyboard opens. Our flex layout
      // fills body (h-full), so PhoneFrame naturally shrinks above the
      // keyboard. Composer is the last flex item; rises with body.
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
