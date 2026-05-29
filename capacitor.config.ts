import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jakeschwartz.guildenstern",
  appName: "Guildenstern",
  webDir: "dist",
  plugins: {
    Keyboard: {
      // Resize the WebView (shrink the document body) instead of overlaying
      // the keyboard on top of unchanged content — stops the whole page from
      // shifting when the composer is focused.
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
