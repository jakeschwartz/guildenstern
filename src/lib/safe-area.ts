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
    const kbd = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty("--kbd-h", `${kbd}px`);
    root.style.setProperty("--safe-b", kbd > 0 ? "0px" : cachedSafeBottom);
    if (kbd > 0) {
      // Pin any thread-scroll container to the bottom whenever the visible
      // viewport changes (keyboard show / size change).
      requestAnimationFrame(() => {
        document
          .querySelectorAll<HTMLElement>("[data-thread-scroll='true']")
          .forEach((el) => {
            el.scrollTop = el.scrollHeight;
          });
      });
    }
  };

  vv.addEventListener("resize", onViewportChange);
  vv.addEventListener("scroll", onViewportChange);
  onViewportChange();
}
