// env(safe-area-inset-*) sometimes returns 0 in WKWebView even with
// viewport-fit=cover (timing / WebView quirks). Read the values from a
// hidden probe div on boot and write them to --safe-t / --safe-r /
// --safe-b / --safe-l as concrete pixel numbers. Resilient against
// env-doesn't-work, and components don't have to care about the source.

import { Capacitor } from "@capacitor/core";

const HARDCODED_FALLBACKS_BY_HEIGHT: Array<{
  minH: number;
  top: number;
  bottom: number;
}> = [
  // iPhone 16/17 Pro Max-ish
  { minH: 900, top: 59, bottom: 34 },
  // iPhone 16/17 Pro-ish
  { minH: 800, top: 54, bottom: 34 },
  // Older iPhones with notch
  { minH: 700, top: 47, bottom: 34 },
  // Pre-notch (SE)
  { minH: 0, top: 20, bottom: 0 },
];

const fallbackForHeight = (h: number) =>
  HARDCODED_FALLBACKS_BY_HEIGHT.find((f) => h >= f.minH) ??
  HARDCODED_FALLBACKS_BY_HEIGHT[HARDCODED_FALLBACKS_BY_HEIGHT.length - 1];

export function measureSafeArea() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Probe div pinned to the four edges. We compute its bounding rect to read
  // env() values as concrete pixels. If env returns 0 (the bug we're working
  // around), the probe will show zero offset and we fall back to known
  // device values.
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = `
    position: fixed;
    top: env(safe-area-inset-top);
    left: env(safe-area-inset-left);
    right: env(safe-area-inset-right);
    bottom: env(safe-area-inset-bottom);
    pointer-events: none;
    visibility: hidden;
  `;
  document.body.appendChild(probe);

  // Read after a frame so the layout settles.
  requestAnimationFrame(() => {
    const rect = probe.getBoundingClientRect();
    const winH = window.innerHeight;
    const winW = window.innerWidth;

    let top = Math.max(0, rect.top);
    let right = Math.max(0, winW - rect.right);
    let bottom = Math.max(0, winH - rect.bottom);
    let left = Math.max(0, rect.left);

    // If env() returned all-zero on a native device, fall back to known values.
    if (
      Capacitor.isNativePlatform() &&
      top === 0 &&
      bottom === 0
    ) {
      const fb = fallbackForHeight(winH);
      top = fb.top;
      bottom = fb.bottom;
      console.warn(
        "[guildenstern] env(safe-area) returned 0; using device-height fallback",
        { winH, top, bottom },
      );
    }

    const root = document.documentElement;
    root.style.setProperty("--safe-t", `${top}px`);
    root.style.setProperty("--safe-r", `${right}px`);
    root.style.setProperty("--safe-l", `${left}px`);
    root.style.setProperty("--safe-b", `${bottom}px`);

    probe.remove();
  });
}
