import { useState } from "react";
import { createRelationshipThread, useStore } from "../state/store";
import { Sheet } from "../components/Sheet";
import type { RelationshipCard } from "../types";

type Props = {
  onBack: () => void;
  onOpenThread: (threadId: string) => void;
};

// Hardcoded "scan result" for the prototype.
const DEMO_CONTACT: RelationshipCard = {
  name: "Priya Shah",
  role: "Developer Relations",
  company: "Vercel",
  metWhere: "SF Tech Week",
  metWhen: Date.now(),
};

export const ConnectScan = ({ onBack, onOpenThread }: Props) => {
  const currentUserId = useStore((s) => s.currentUserId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [metWhere, setMetWhere] = useState(DEMO_CONTACT.metWhere);

  const onScan = () => {
    setMetWhere(DEMO_CONTACT.metWhere);
    setConfirmOpen(true);
  };

  const onDone = () => {
    const id = createRelationshipThread(currentUserId, {
      ...DEMO_CONTACT,
      metWhere,
      metWhen: Date.now(),
    });
    setConfirmOpen(false);
    onOpenThread(id);
  };

  return (
    <div className="flex flex-col h-full bg-paper">
      <header className="pl-2 pr-5 pt-11 pb-2 flex items-center justify-between">
        <button
          onClick={onBack}
          className="h-11 w-11 flex items-center justify-center text-muted hover:text-ink"
          aria-label="Back"
        >
          <span className="text-[18px] leading-none">←</span>
        </button>
        <span className="text-[12px] text-muted">Scan a code</span>
        <span className="h-11 w-11" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
        <div className="text-[11.5px] text-muted uppercase tracking-wide text-center">
          Aim at their code
        </div>

        {/* Viewfinder mock */}
        <div className="relative w-[240px] h-[240px]">
          <div className="absolute inset-0 border border-rule rounded-2xl bg-card/40" />
          {/* Corner brackets */}
          <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-agent rounded-tl-lg" />
          <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-agent rounded-tr-lg" />
          <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-agent rounded-bl-lg" />
          <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-agent rounded-br-lg" />
        </div>

        <div className="text-[12px] text-muted text-center leading-relaxed max-w-[260px]">
          We don't have camera access in this prototype. Tap below to simulate
          a scan.
        </div>

        <button
          onClick={onScan}
          className="text-[12.5px] font-semibold text-agent border border-agent rounded-full px-4 h-10 hover:bg-agent hover:text-paper transition-colors"
        >
          Scan Priya's code (demo)
        </button>
      </div>

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Connected"
      >
        <div className="text-[12.5px] text-muted">You just met</div>
        <h3 className="text-[24px] font-semibold leading-tight text-ink tracking-tight mt-1">
          {DEMO_CONTACT.name}
        </h3>
        <div className="text-[14px] text-ink mt-1">{DEMO_CONTACT.role}</div>
        <div className="text-[13px] text-muted mt-0.5">
          {DEMO_CONTACT.company}
        </div>

        <div className="mt-5">
          <label className="text-[11.5px] text-muted uppercase tracking-wide block mb-1.5">
            Met at
          </label>
          <input
            type="text"
            value={metWhere}
            onChange={(e) => setMetWhere(e.target.value)}
            className="w-full bg-card ring-1 ring-rule rounded-xl px-3.5 h-11 text-[14px] text-ink focus:outline-none focus:ring-ink"
          />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => setConfirmOpen(false)}
            className="flex-1 h-11 rounded-full border border-rule text-[13px] font-medium text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={onDone}
            className="flex-1 h-11 rounded-full bg-agent text-paper text-[13px] font-semibold hover:opacity-90"
          >
            Done
          </button>
        </div>

        <div className="text-[11.5px] text-muted text-center mt-4 leading-relaxed">
          The thread is created on both sides. {DEMO_CONTACT.name.split(" ")[0]}{" "}
          will see a follow-up from your agent next.
        </div>
      </Sheet>
    </div>
  );
};
