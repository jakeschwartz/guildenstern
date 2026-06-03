// Always-visible debug overlay. Build-7+ diagnostic only — to be removed
// once we resolve the "stuck on sheet, taps don't work" mystery.
//
// Renders fixed at top of screen, very high z-index. Shows:
//   - session / status / sheet state
//   - last 3 errors caught by window.onerror or unhandledrejection
// Tap it to copy to clipboard.

import { useEffect, useState } from "react";
import { useStore } from "../state/store";

type ErrLog = { ts: number; msg: string };

const errs: ErrLog[] = [];
let listeners: Array<() => void> = [];
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    errs.unshift({
      ts: Date.now(),
      msg: `${e.message} @ ${e.filename}:${e.lineno}`,
    });
    if (errs.length > 5) errs.length = 5;
    notify();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    const m =
      r instanceof Error
        ? r.message
        : typeof r === "string"
          ? r
          : JSON.stringify(r);
    errs.unshift({ ts: Date.now(), msg: `unhandledrejection: ${m}` });
    if (errs.length > 5) errs.length = 5;
    notify();
  });
}

type Props = {
  session: unknown;
  menuOpen: boolean;
  inviteOpen: boolean;
  joinOpen: boolean;
};

export const DebugOverlay = ({
  session,
  menuOpen,
  inviteOpen,
  joinOpen,
}: Props) => {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const userId = useStore((s) => s.currentUserId);
  const partnerships = useStore((s) => s.partnerships);
  const threads = useStore((s) => s.threads);

  const sessionStr =
    session === "loading"
      ? "loading"
      : session === null
        ? "null"
        : "active";

  const lines = [
    `sess=${sessionStr} st=${status} uid=${userId?.slice(0, 8) ?? "—"}`,
    `parts=${partnerships.length} thr=${threads.length} m=${+menuOpen} i=${+inviteOpen} j=${+joinOpen}`,
    error ? `ERR: ${error.slice(0, 80)}` : null,
    ...errs.slice(0, 2).map((e) => `${e.msg.slice(0, 90)}`),
  ].filter(Boolean) as string[];

  const copy = () => {
    const txt = lines.join("\n");
    navigator.clipboard?.writeText(txt).catch(() => {});
  };

  return (
    <div
      onClick={copy}
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 0px)",
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "rgba(255, 200, 0, 0.92)",
        color: "#111",
        padding: "4px 6px",
        fontSize: "9px",
        fontFamily: "ui-monospace, Menlo, monospace",
        lineHeight: 1.2,
        pointerEvents: "auto",
        maxHeight: "30vh",
        overflow: "auto",
      }}
    >
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
};
