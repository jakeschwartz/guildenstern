import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jakeschwartz.guildenstern",
  appName: "Guildenstern",
  webDir: "dist",
  ios: {
    // WKWebView default is edge-to-edge (contentInset='never') which puts our
    // content behind the status bar / Dynamic Island and lets it overflow the
    // sides. 'always' makes the native WebView always inset for the safe area
    // and also makes env(safe-area-inset-*) return the right values in CSS.
    contentInset: "always",
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
