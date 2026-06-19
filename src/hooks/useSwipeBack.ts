import { useEffect } from "react";

// Edge-swipe-back gesture. The app routes via React state inside a single
// WebView (no native nav stack), so iOS's interactive pop gesture doesn't
// exist for us — a swipe-right just sat there doing nothing (or, before we
// clipped overflow-x, panned the message list around). This restores the
// expectation: drag from the left edge toward the right to go "back".
//
// Edge-only start (within EDGE px of the left edge) keeps it from fighting
// taps, vertical scroll, or horizontal interactions inside content. We decide
// on touchend so we never preventDefault mid-scroll.

const EDGE = 28; // px from the left edge where a back-swipe may begin
const DISTANCE = 64; // px of rightward travel required to fire
const SLOPE = 0.75; // |dy| must stay under dx * SLOPE (mostly-horizontal)

export const useSwipeBack = (onBack: () => void, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = e.touches[0]!;
      tracking = t.clientX <= EDGE;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (dx >= DISTANCE && Math.abs(dy) <= dx * SLOPE) {
        onBack();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onBack, enabled]);
};
