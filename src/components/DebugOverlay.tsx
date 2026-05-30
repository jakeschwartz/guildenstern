// Visible debug overlay so I can read the actual values from a screenshot
// instead of guessing at WebView quirks. Remove once layout is sorted.

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

export const DebugOverlay = () => {
  const [state, setState] = useState({
    innerW: 0,
    innerH: 0,
    vvW: 0,
    vvH: 0,
    vvTop: 0,
    safeT: "",
    safeB: "",
    kbdH: "",
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const read = () => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      setState({
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        vvW: window.visualViewport?.width ?? 0,
        vvH: window.visualViewport?.height ?? 0,
        vvTop: window.visualViewport?.offsetTop ?? 0,
        safeT: cs.getPropertyValue("--safe-t").trim() || "?",
        safeB: cs.getPropertyValue("--safe-b").trim() || "?",
        kbdH: cs.getPropertyValue("--kbd-h").trim() || "?",
      });
    };
    read();
    const id = window.setInterval(read, 200);
    return () => window.clearInterval(id);
  }, []);

  if (!Capacitor.isNativePlatform()) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 62,
        left: 4,
        zIndex: 9999,
        background: "rgba(255, 200, 0, 0.95)",
        color: "#000",
        fontSize: 10,
        fontFamily: "ui-monospace, Menlo, monospace",
        padding: "2px 5px",
        borderRadius: 3,
        pointerEvents: "none",
        lineHeight: 1.15,
        whiteSpace: "nowrap",
      }}
    >
      in {state.innerW}×{state.innerH} | vv {Math.round(state.vvW)}×{Math.round(state.vvH)}@{Math.round(state.vvTop)} | t={state.safeT} b={state.safeB} kbd={state.kbdH}
    </div>
  );
};
