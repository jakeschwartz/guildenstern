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
      // none: don't let iOS resize or auto-scroll. We control everything via
      // CSS variables (--kbd-h, --safe-b) and a position:fixed composer.
      resize: "none",
      style: "DARK",
      resizeOnFullScreen: false,
    },
  },
};

export default config;
