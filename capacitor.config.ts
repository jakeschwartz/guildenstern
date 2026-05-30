import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jakeschwartz.guildenstern",
  appName: "Guildenstern",
  webDir: "dist",
  ios: {
    // Edge-to-edge: WebView extends into the safe areas. Our dark paper bg
    // fills the whole device including under the status bar and home
    // indicator (no iOS-grey gap below the composer). We then pad PhoneFrame
    // by env(safe-area-inset-*) so actual content sits inside the safe area.
    contentInset: "never",
  },
  plugins: {
    Keyboard: {
      // body: iOS shrinks document.body when the keyboard opens. Our layout
      // fills body (h-full), so PhoneFrame naturally shrinks above the
      // keyboard. No JS keyboard tracking, no translateY compensation.
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
