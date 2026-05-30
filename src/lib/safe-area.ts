// Safe-area + keyboard height management.
//
// env(safe-area-inset-*) returns 0 in our WKWebView even with viewport-fit
// =cover (timing/init quirk). And @capacitor/keyboard's `keyboardHeight`
// often undercounts because it doesn't include the predictive-text bar.
//
// Workaround: hardcode safe-area values by device height (we know we're on
// iPhone 17 Pro Max for now), and use window.visualViewport to track the
// *actual* keyboard-occupied height in real time.

const DEVICE_PROFILES = [
  // iPhone 16/17 Pro Max-ish
  { minH: 900, top: 59, bottom: 34 },
  // iPhone 16/17 Pro-ish
  { minH: 800, top: 54, bottom: 34 },
  // Older iPhones with notch
  { minH: 700, top: 47, bottom: 34 },
  // Pre-notch (SE)
  { minH: 0, top: 20, bottom: 0 },
];

const profile = () => {
  const h = window.innerHeight;
  return (
    DEVICE_PROFILES.find((p) => h >= p.minH) ??
    DEVICE_PROFILES[DEVICE_PROFILES.length - 1]
  );
};

let cachedSafeBottom = "0px";

export function initSafeArea() {
  if (typeof window === "undefined") return;
  const root = document.documentElement;

  const apply = () => {
    const p = profile();
    cachedSafeBottom = `${p.bottom}px`;
    root.style.setProperty("--safe-t", `${p.top}px`);
    root.style.setProperty("--safe-b", cachedSafeBottom);
    root.style.setProperty("--safe-l", "0px");
    root.style.setProperty("--safe-r", "0px");
  };

  apply();

  // window.visualViewport reports the *visible* viewport: shrinks when the
  // soft keyboard opens (including the predictive-text bar). We track the
  // delta and write --kbd-h. When the keyboard is up, --safe-b → 0px so
  // the composer sits flush against the keyboard.
  const vv = window.visualViewport;
  if (!vv) return;

  const onViewportChange = () => {
    // iOS scrolls visualViewport up when input focuses. Always undo it —
    // we don't want iOS to shift our layout; we handle keyboard ourselves.
    if (vv.offsetTop > 0) {
      window.scrollTo(0, 0);
    }
    // visualViewport.height does NOT shrink under KeyboardResize.None, so
    // we don't use it to compute keyboard height (that's done in
    // lib/keyboard via the plugin events). vv-top tracked here only for
    // diagnostics.
    root.style.setProperty("--vv-top", `${vv.offsetTop}px`);
  };

  vv.addEventListener("resize", onViewportChange);
  vv.addEventListener("scroll", onViewportChange);
  onViewportChange();
}
