import { useMemo, useState } from "react";
import { addIntentFromChip, useStore } from "../state/store";
import { IntentChips } from "../components/IntentChips";
import type { RelationshipThread, Thread } from "../types";

type Props = {
  onBack: () => void;
  onOpenThread: (threadId: string) => void;
};

const ONE_DAY = 24 * 60 * 60_000;

const isFromToday = (t: Thread): t is RelationshipThread =>
  t.kind === "relationship" && Date.now() - t.createdAt < ONE_DAY;

export const ReviewNewContacts = ({ onBack, onOpenThread }: Props) => {
  const threads = useStore((s) => s.threads);
  const currentUserId = useStore((s) => s.currentUserId);
  const todayContacts = useMemo(
    () =>
      threads
        .filter(isFromToday)
        .filter((t) => t.hostId === currentUserId)
        .sort((a, b) => a.createdAt - b.createdAt),
    [threads, currentUserId],
  );

  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  const total = todayContacts.length;
  const thread = todayContacts[index];

  if (total === 0) {
    return (
      <div className="flex flex-col h-full">
        <header className="pl-2 pr-5 pt-11 pb-2 flex items-center justify-between">
          <button
            onClick={onBack}
            className="h-11 w-11 flex items-center justify-center text-muted hover:text-ink"
            aria-label="Back"
          >
            <span className="text-[18px] leading-none">←</span>
          </button>
          <span className="text-[12px] text-muted">Today's contacts</span>
          <span className="h-11 w-11" />
        </header>
        <div className="flex-1 flex items-center justify-center px-8 text-center text-[13px] text-muted">
          No new contacts today.
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col h-full">
        <header className="pl-2 pr-5 pt-11 pb-2 flex items-center justify-between">
          <button
            onClick={onBack}
            className="h-11 w-11 flex items-center justify-center text-muted hover:text-ink"
            aria-label="Back"
          >
            <span className="text-[18px] leading-none">←</span>
          </button>
          <span className="text-[12px] text-muted">Today's contacts</span>
          <span className="h-11 w-11" />
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5">
          <div className="text-[12px] text-agent uppercase tracking-wide">
            All set
          </div>
          <h2 className="text-[24px] font-semibold leading-tight text-ink tracking-tight text-center">
            {total} draft{total === 1 ? "" : "s"} ready for review
          </h2>
          <p className="text-[13px] text-muted text-center leading-relaxed max-w-[260px]">
            I'll wait for you to approve each one before sending. Tap a contact
            to review the draft.
          </p>
          <div className="w-full max-w-[280px] flex flex-col gap-2 mt-2">
            {todayContacts.map((t) => {
              const firstName = t.contact.name.split(" ")[0];
              const intentCount = t.intents.length;
              return (
                <button
                  key={t.id}
                  onClick={() => onOpenThread(t.id)}
                  className="w-full px-4 py-3 rounded-2xl bg-card ring-1 ring-rule text-left hover:border-ink transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="text-[14px] font-semibold text-ink">
                      {t.contact.name}
                    </div>
                    <div className="text-[12px] text-muted mt-0.5">
                      {intentCount === 0
                        ? `Default note for ${firstName}`
                        : `${intentCount} intent${intentCount === 1 ? "" : "s"} captured`}
                    </div>
                  </div>
                  <span className="text-muted text-[14px]">›</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={onBack}
            className="mt-2 text-[12.5px] text-muted hover:text-ink"
          >
            Done for now
          </button>
        </div>
      </div>
    );
  }

  if (!thread) {
    return null;
  }

  const usedChipBodies = new Set(thread.intents.map((i) => i.body));
  const firstName = thread.contact.name.split(" ")[0];
  const next = () => {
    if (index + 1 >= total) setDone(true);
    else setIndex(index + 1);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="pl-2 pr-5 pt-11 pb-2 flex items-center justify-between">
        <button
          onClick={onBack}
          className="h-11 w-11 flex items-center justify-center text-muted hover:text-ink"
          aria-label="Back"
        >
          <span className="text-[18px] leading-none">←</span>
        </button>
        <span className="text-[12px] text-muted">
          {index + 1} of {total}
        </span>
        <span className="h-11 w-11" />
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-5 flex flex-col gap-5">
        <div>
          <div className="text-[12px] text-muted">You just met</div>
          <h2 className="text-[26px] font-semibold leading-tight text-ink tracking-tight mt-1">
            {thread.contact.name}
          </h2>
          <div className="text-[14px] text-ink mt-1">{thread.contact.role}</div>
          <div className="text-[13px] text-muted mt-0.5">
            {thread.contact.company}
          </div>
          <div className="text-[12px] text-muted mt-3">
            Met at {thread.contact.metWhere}
          </div>
        </div>

        <div>
          <div className="text-[12px] text-muted mb-2">
            What do you want to do?
          </div>
          <IntentChips
            usedBodies={usedChipBodies}
            onPick={(body) => addIntentFromChip(thread.id, body)}
          />
        </div>

        {thread.intents.length > 0 && (
          <div className="text-[12px] text-agent">
            ✓ {thread.intents.length} captured for {firstName}
          </div>
        )}
      </div>

      <div className="border-t border-rule px-4 py-3 flex items-center gap-3 bg-paper">
        <button
          onClick={next}
          className="flex-1 h-11 rounded-full border border-rule text-[13px] font-medium text-muted hover:text-ink"
        >
          {thread.intents.length === 0 ? "Skip" : "Skip rest"}
        </button>
        <button
          onClick={next}
          className="flex-1 h-11 rounded-full bg-agent text-paper text-[13px] font-semibold hover:opacity-90"
        >
          {index + 1 >= total ? "Done" : "Next →"}
        </button>
      </div>
    </div>
  );
};
