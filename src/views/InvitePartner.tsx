import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import * as db from "../lib/db";

type Props = {
  onClose: () => void;
};

// Reuse-an-existing OR create-new invite for the user's first partnership.
// For v0 we assume one partnership per user.
export const InvitePartner = ({ onClose }: Props) => {
  const partnerships = useStore((s) => s.partnerships);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (partnerships.length === 0) {
      setError("No partnership yet — create one from Onboarding first.");
      return;
    }
    db.getOrCreateInvite(partnerships[0]!.id)
      .then((inv) => setCode(inv.code))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [partnerships]);

  const onCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="px-2 pb-2">
      <div className="text-[15px] font-semibold text-ink tracking-tight">
        Invite a partner
      </div>
      <div className="text-[12.5px] text-muted mt-1 leading-relaxed">
        Share this code with the person you want to use Guildenstern with.
        They'll sign in, tap <span className="text-ink">Enter an invite code</span>,
        and type it in.
      </div>

      {error && (
        <div className="mt-4 text-[12.5px] text-attention">{error}</div>
      )}

      {code && (
        <>
          <div className="mt-5 mb-4 text-[36px] font-semibold tracking-[0.15em] text-ink text-center select-all">
            {code}
          </div>
          <button
            onClick={onCopy}
            className="w-full h-11 rounded-xl border border-rule text-ink text-[14px] font-semibold tracking-tight hover:bg-card/60 transition-colors"
          >
            {copied ? "Copied" : "Copy code"}
          </button>
          <div className="text-[11.5px] text-muted text-center mt-3">
            Code expires in 7 days. A fresh one is generated when needed.
          </div>
        </>
      )}

      <button
        onClick={onClose}
        className="mt-5 w-full text-[13px] text-muted hover:text-ink"
      >
        Done
      </button>
    </div>
  );
};
