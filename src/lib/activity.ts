// Records app opens: on launch and whenever the app comes back to the
// foreground, at most once per 10 minutes. Mira's rundown uses them to know
// when you last looked (skip the push if you just did; what counts as "new")
// and your timezone (8am / 8pm local); app_opens is also how we'll see whether
// the rundown is turning into a habit.

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { recordAppOpen } from "./db";

const THROTTLE_MS = 10 * 60 * 1000;
let lastRecorded = 0;
let started = false;

function record() {
  const now = Date.now();
  if (now - lastRecorded < THROTTLE_MS) return;
  lastRecorded = now;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  recordAppOpen(tz).catch((e: unknown) => {
    console.warn("[activity] record_app_open failed", e instanceof Error ? e.message : e);
  });
}

export function startActivityTracking(): void {
  if (started) return;
  started = true;
  record();
  if (Capacitor.isNativePlatform()) {
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) record();
    });
  } else {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") record();
    });
  }
}
