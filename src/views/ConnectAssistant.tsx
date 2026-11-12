import { useEffect, useState } from "react";
import * as db from "../lib/db";

type Props = {
  onClose: () => void;
};

const ago = (ms: number) => {
  const m = Math.floor((Date.now() - ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// "Connect Claude or ChatGPT": mints a private link the person pastes into
// their assistant as a custom connector. The link is shown once (only its
// hash is stored), so an existing connection offers "make a new link"
// instead of re-showing the old one.
export const ConnectAssistant = ({ onClose }: Props) => {
  const [status, setStatus] = useState<db.McpLinkStatus | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    db.getMcpLinkStatus()
      .then((s) => alive && setStatus(s))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      setLink(await db.createMcpLink());
      setStatus({ active: true, createdAt: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      await db.revokeMcpLinks();
      setLink(null);
      setStatus({ active: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // select-all on the text is the fallback
    }
  };

  const primary =
    "w-full h-11 rounded-xl bg-ink text-paper text-[14px] font-semibold tracking-tight disabled:opacity-50";
  const secondary =
    "w-full h-11 rounded-xl border border-rule text-ink text-[14px] font-semibold tracking-tight hover:bg-card/60 transition-colors disabled:opacity-50";

  return (
    <div className="px-2 pb-2">
      <div className="text-[15px] font-semibold text-ink tracking-tight">
        Connect Claude or ChatGPT
      </div>
      <div className="text-[12.5px] text-muted mt-1 leading-relaxed">
        Plan in your assistant, land it here. It can see your list and threads,
        add or finish items, and send your partner a message once you OK the text.
      </div>

      {error && <div className="mt-4 text-[12.5px] text-attention">{error}</div>}

      {link ? (
        <>
          <div className="mt-5 rounded-xl border border-rule bg-card/40 px-3 py-2.5 font-mono text-[11px] text-ink break-all select-all">
            {link}
          </div>
          <button onClick={copy} className={`${primary} mt-3`}>
            {copied ? "Copied" : "Copy link"}
          </button>
          <div className="mt-2 text-[11.5px] text-muted leading-relaxed">
            This link is your key: anyone with it can act as you. It's shown
            once. Lost it? Make a new one here.
          </div>

          <div className="mt-5 smallcaps text-[10.5px] text-muted">Claude</div>
          <ol className="mt-1.5 text-[12.5px] text-ink leading-relaxed list-decimal pl-5">
            <li>On claude.ai or the desktop app: Settings → Connectors</li>
            <li>Add custom connector, name it Guildenstern, paste the link</li>
            <li>It then works in the Claude iPhone app too</li>
          </ol>

          <div className="mt-4 smallcaps text-[10.5px] text-muted">ChatGPT</div>
          <ol className="mt-1.5 text-[12.5px] text-ink leading-relaxed list-decimal pl-5">
            <li>On chatgpt.com: Settings → Apps → Advanced → turn on Developer mode</li>
            <li>Create app, name it Guildenstern, paste the link</li>
            <li>Authentication: No authentication</li>
          </ol>

          <div className="mt-4 text-[12px] text-muted leading-relaxed">
            Try: <span className="text-ink">"What's on my plate this week in Guildenstern?"</span>
          </div>
        </>
      ) : status?.active ? (
        <>
          <div className="mt-5 text-[13px] text-ink">
            Connected
            <span className="text-muted">
              {status.lastUsedAt
                ? ` · last used ${ago(status.lastUsedAt)}`
                : " · not used yet"}
            </span>
          </div>
          <button onClick={make} disabled={busy} className={`${secondary} mt-4`}>
            Make a new link
          </button>
          <div className="mt-2 text-[11.5px] text-muted">
            The old link stops working; paste the new one into your assistant.
          </div>
          <button
            onClick={turnOff}
            disabled={busy}
            className="mt-4 w-full text-[13px] text-attention"
          >
            Turn off
          </button>
        </>
      ) : status ? (
        <button onClick={make} disabled={busy} className={`${primary} mt-5`}>
          {busy ? "Making…" : "Make my link"}
        </button>
      ) : null}

      <button onClick={onClose} className="mt-5 w-full text-[13px] text-muted hover:text-ink">
        Done
      </button>
    </div>
  );
};
