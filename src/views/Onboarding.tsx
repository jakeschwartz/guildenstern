import { useState } from "react";
import {
  createInviteForPartnership,
  createMyPartnership,
  hydrate,
  redeemInviteCode,
} from "../state/store";
import { signOut } from "../lib/auth";
import { supabase } from "../lib/supabase";

// Supabase errors aren't Error instances; they're plain objects with
// { message, code, details, hint }. Format them readably.
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

type Mode = "menu" | "create" | "join" | "show-code";

export const Onboarding = () => {
  const [mode, setMode] = useState<Mode>("menu");
  const [code, setCode] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) await hydrate(data.session);
  };

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const partnershipId = await createMyPartnership();
      const inviteCode = await createInviteForPartnership(partnershipId);
      setCode(inviteCode);
      setMode("show-code");
    } catch (e) {
      setError(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    if (!enteredCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await redeemInviteCode(enteredCode.trim().toUpperCase());
      await refreshSession();
    } catch (e) {
      setError(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  const onCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // ignore
    }
  };

  if (mode === "show-code") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-between px-6 py-12 bg-paper text-ink">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-[14px] text-muted">Share this code</div>
          <div className="mt-4 text-[40px] font-semibold tracking-[0.15em] text-ink select-all">
            {code}
          </div>
          <p className="mt-5 text-[13px] text-muted leading-relaxed max-w-[280px]">
            Send this to the person you want to use Guildenstern with. They open
            the app, choose <span className="text-ink">Enter a code</span>, and
            type it in. The code expires in 7 days.
          </p>
          <button
            onClick={onCopyCode}
            className="mt-6 px-4 py-2 rounded-full border border-rule text-[12.5px] text-ink hover:bg-card/60 transition-colors"
          >
            Copy code
          </button>
        </div>
        <button
          onClick={() => refreshSession()}
          className="h-12 w-full rounded-xl bg-ink text-paper font-semibold text-[15px] tracking-tight transition-opacity"
        >
          Done — open my partnership
        </button>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="h-full w-full flex flex-col px-6 py-12 bg-paper text-ink">
        <div className="flex-1 flex flex-col justify-center max-w-[300px] mx-auto text-center">
          <div className="text-[20px] font-semibold tracking-tight leading-tight">
            Start a partnership
          </div>
          <p className="mt-3 text-[13px] text-muted leading-relaxed">
            We'll create a private space for you and one other person, and give
            you a code to invite them. You can rename and add more later.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={onCreate}
            disabled={busy}
            className="h-12 rounded-xl bg-ink text-paper font-semibold text-[15px] tracking-tight disabled:opacity-50 transition-opacity"
          >
            {busy ? "Setting up…" : "Create"}
          </button>
          {error && (
            <div className="text-[12.5px] text-attention text-center">
              {error}
            </div>
          )}
          <button
            onClick={() => setMode("menu")}
            className="text-[13px] text-muted hover:text-ink"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (mode === "join") {
    return (
      <div className="h-full w-full flex flex-col px-6 py-12 bg-paper text-ink">
        <div className="flex-1 flex flex-col justify-center max-w-[300px] mx-auto">
          <div className="text-[20px] font-semibold tracking-tight leading-tight text-center">
            Enter your invite code
          </div>
          <input
            value={enteredCode}
            onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
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
            onClick={onJoin}
            disabled={busy || enteredCode.trim().length < 4}
            className="h-12 rounded-xl bg-ink text-paper font-semibold text-[15px] tracking-tight disabled:opacity-50 transition-opacity"
          >
            {busy ? "Joining…" : "Join"}
          </button>
          {error && (
            <div className="text-[12.5px] text-attention text-center">
              {error}
            </div>
          )}
          <button
            onClick={() => setMode("menu")}
            className="text-[13px] text-muted hover:text-ink"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // menu
  return (
    <div className="h-full w-full flex flex-col items-stretch justify-between px-6 py-12 bg-paper text-ink">
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-[300px] mx-auto">
        <div className="text-[28px] font-semibold tracking-tight leading-tight">
          Welcome
        </div>
        <p className="mt-3 text-[14px] text-muted leading-relaxed">
          Guildenstern works in pairs. Start a new partnership, or join one
          someone already created.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => setMode("create")}
          className="h-12 rounded-xl bg-ink text-paper font-semibold text-[15px] tracking-tight transition-opacity"
        >
          Start a new partnership
        </button>
        <button
          onClick={() => setMode("join")}
          className="h-12 rounded-xl border border-rule text-ink font-semibold text-[15px] tracking-tight hover:bg-card/60 transition-colors"
        >
          Enter an invite code
        </button>
        <button
          onClick={() => signOut()}
          className="text-[12.5px] text-muted hover:text-ink mt-3"
        >
          Sign out
        </button>
      </div>
    </div>
  );
};
