import { useEffect, useState } from "react";
import {
  createMyPartnership,
  hydrate,
  useStore,
} from "../state/store";
import { supabase } from "../lib/supabase";
import * as db from "../lib/db";

type Props = {
  onClose: () => void;
};

// One-tap "give me a code to share" for the partnership flow. If the user has
// no partnership yet, we auto-create one and then mint the invite — the user
// just wanted a code to send, no reason to make them confirm a separate
// "create partnership" step.
export const InvitePartner = ({ onClose }: Props) => {
  const partnerships = useStore((s) => s.partnerships);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        let partnershipId = partnerships[0]?.id;
        if (!partnershipId) {
          partnershipId = await createMyPartnership();
          // Rehydrate so the new partnership shows up in the inbox while the
          // user waits on the code screen.
          const { data } = await supabase.auth.getSession();
          if (data.session) await hydrate(data.session);
        }
        const inv = await db.getOrCreateInvite(partnershipId);
        if (!cancelled) setCode(inv.code);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
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
