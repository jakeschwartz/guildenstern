import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jakeschwartz.guildenstern",
  appName: "Guildenstern",
  webDir: "dist",
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
