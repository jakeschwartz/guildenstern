import { useState } from "react";
import { signInWithApple } from "../lib/auth";

// TODO(native): when we run inside Capacitor on iOS, detect via Capacitor's
// `isNativePlatform()` and call the native Sign in with Apple plugin instead
// of signInWithOAuth. The native flow returns an identity token that we hand
// to supabase.auth.signInWithIdToken({ provider: 'apple', token }).

export const Login = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithApple();
      // Browser redirects out to Apple; we don't unset busy here.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-between px-6 py-12 bg-paper text-ink">
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-[300px]">
        <div className="text-[28px] font-semibold tracking-tight leading-tight">
          Guildenstern
        </div>
        <div className="mt-3 text-[14px] text-muted leading-relaxed">
          An inbox where your agent works for you.
        </div>
      </div>

      <div className="w-full flex flex-col items-stretch gap-3">
        <button
          onClick={onSignIn}
          disabled={busy}
          className="h-12 rounded-xl bg-ink text-paper font-semibold tracking-tight text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
        >
          <span aria-hidden></span>
          <span>{busy ? "Opening Apple…" : "Sign in with Apple"}</span>
        </button>
        {error && (
          <div className="text-[12.5px] text-attention text-center px-2">
            {error}
          </div>
        )}
        <div className="text-[11.5px] text-muted text-center leading-relaxed mt-2">
          By signing in you agree to let the agent act on your behalf in
          threads you create or accept.
        </div>
      </div>
    </div>
  );
};
