import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jakeschwartz.guildenstern",
  appName: "Guildenstern",
  webDir: "dist",
  plugins: {
    Keyboard: {
      // Native mode = iOS's built-in keyboard-avoidance via scroll view
      // adjustment. More reliable than "body" mode in our setup.
      resize: "native",
      style: "DARK",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
