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
      // resize=none → iOS does NOT auto-adjust. We handle it manually in
      // lib/keyboard.ts by tracking the keyboard height in a CSS variable.
      resize: "none",
      style: "DARK",
      resizeOnFullScreen: false,
    },
  },
};

export default config;
