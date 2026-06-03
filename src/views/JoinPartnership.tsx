// Code-redeem form. Used both inside Onboarding (when a fresh user is
// arriving via someone else's invite) and inside the hamburger sheet (when
// an existing user needs to join an additional partnership — for instance
// because their partner accidentally created their own).

import { useState } from "react";
import { hydrate, redeemInviteCode } from "../state/store";
import { supabase } from "../lib/supabase";

const fmtErr = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    try {
      return JSON.stringify(o);
    } catch {
      return "Unknown error";
    }
  }
  return String(e);
};

type Props = {
  // Variant tunes the chrome: "page" inside Onboarding (full-screen flow with
  // Back button), "sheet" inside the hamburger sheet (compact, Done at end).
  variant?: "page" | "sheet";
  onDone: () => void;
  onBack?: () => void;
};

export const JoinPartnership = ({
  variant = "sheet",
  onDone,
  onBack,
}: Props) => {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await redeemInviteCode(code.trim().toUpperCase());
      const { data } = await supabase.auth.getSession();
      if (data.session) await hydrate(data.session);
      onDone();
    } catch (e) {
      setError(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  if (variant === "page") {
    return (
      <div className="h-full w-full flex flex-col px-6 py-12 bg-paper text-ink">
        <div className="flex-1 flex flex-col justify-center max-w-[300px] mx-auto">
          <div className="text-[20px] font-semibold tracking-tight leading-tight text-center">
            Enter your invite code
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={12}
            autoFocus
            placeholder="ABCD1234"
            className="mt-6 h-14 rounded-xl border border-rule px-4 text-center text-[24px] font-semibold tracking-[0.3em] text-ink bg-paper focus:outline-none focus:border-ink"
          />
          <p className="mt-3 text-[12.5px] text-muted text-center leading-relaxed">
            The person who invited you shared this with you. It's 8 characters
            long.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={submit}
            disabled={busy || code.trim().length < 4}
            className="h-12 rounded-xl bg-ink text-paper font-semibold text-[15px] tracking-tight disabled:opacity-50 transition-opacity"
          >
            {busy ? "Joining…" : "Join"}
          </button>
          {error && (
            <div className="text-[12.5px] text-attention text-center">
              {error}
            </div>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="text-[13px] text-muted hover:text-ink"
            >
              Back
            </button>
          )}
        </div>
      </div>
    );
  }

  // Sheet variant — compact form for hamburger use.
  return (
    <div className="px-2 pb-2">
      <div className="text-[15px] font-semibold text-ink tracking-tight">
        Enter an invite code
      </div>
      <div className="text-[12.5px] text-muted mt-1 leading-relaxed">
        If someone shared a partnership code with you, paste it here. You'll
        join their partnership thread.
      </div>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={12}
        autoFocus
        placeholder="ABCD1234"
        className="mt-5 w-full h-12 rounded-xl border border-rule px-4 text-center text-[20px] font-semibold tracking-[0.3em] text-ink bg-paper focus:outline-none focus:border-ink"
      />

      <button
        onClick={submit}
        disabled={busy || code.trim().length < 4}
        className="mt-4 w-full h-11 rounded-xl bg-ink text-paper text-[14px] font-semibold tracking-tight disabled:opacity-50 transition-opacity"
      >
        {busy ? "Joining…" : "Join partnership"}
      </button>

      {error && (
        <div className="mt-3 text-[12.5px] text-attention text-center">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onDone}
        className="mt-4 w-full h-11 rounded-xl border border-rule text-[14px] font-semibold text-ink hover:bg-card/60 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
};
