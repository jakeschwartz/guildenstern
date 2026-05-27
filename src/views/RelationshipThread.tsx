import { useMemo, useState } from "react";
import {
  addIntentFromChip,
  proposeDraftForThread,
  sendDraft,
  useStore,
} from "../state/store";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import { IntentLedger } from "../components/IntentLedger";
import { LedgerPill } from "../components/LedgerPill";
import { ChannelToggle, type Channel } from "../components/ChannelToggle";
import { ThreadAnchor } from "../components/ThreadAnchor";
import { Sheet } from "../components/Sheet";
import { Avatar } from "../components/Avatar";
import { IntentChips } from "../components/IntentChips";
import type { User } from "../types";

type Props = {
  threadId: string;
  onBack: () => void;
};

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const formatMetWhen = (ts: number): string => {
  const days = Math.round((Date.now() - ts) / (24 * 60 * 60_000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} wk ago`;
  if (days < 365) return `${Math.round(days / 30)} mo ago`;
  return `${Math.round(days / 365)} yr ago`;
};

export const RelationshipThread = ({ threadId, onBack }: Props) => {
  const thread = useStore((s) =>
    s.threads.find((t) => t.id === threadId && t.kind === "relationship"),
  );
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const usersById = useMemo(
    () => new Map<string, User>(users.map((u) => [u.id, u])),
    [users],
  );
  const [channel, setChannel] = useState<Channel>("private");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!thread || thread.kind !== "relationship") {
    return (
      <div className="p-6 text-muted">
        Thread not found.{" "}
        <button onClick={onBack} className="underline">
          Back
        </button>
      </div>
    );
  }

  const isYou = thread.hostId === currentUserId;
  const messages =
    channel === "private" ? thread.privateWithAgent : thread.outbound;
  const firstName = thread.contact.name.split(" ")[0];
  const usedChipBodies = new Set(thread.intents.map((i) => i.body));
  const firstAgentMessage = thread.privateWithAgent.find(
    (m) => m.author.kind === "agent",
  );

  return (
    <div className="flex flex-col h-full">
      <ThreadAnchor onBack={onBack} onExpand={() => setSheetOpen(true)}>
        <Avatar initials={initialsOf(thread.contact.name)} size="sm" />
        <span className="text-[17px] font-semibold text-ink truncate tracking-tight">
          {thread.contact.name}
        </span>
        <span className="text-[12px] text-muted truncate">
          · {thread.contact.company}
        </span>
      </ThreadAnchor>

      <LedgerPill
        intents={thread.intents}
        contactName={thread.contact.name}
        expanded={ledgerOpen}
        onToggle={() => setLedgerOpen((o) => !o)}
      />

      <ChannelToggle
        value={channel}
        onChange={setChannel}
        contactName={thread.contact.name}
      />

      <div
        className={`flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 ${
          channel === "private" ? "bg-agent-tint/20" : "bg-paper"
        }`}
      >
        {channel === "outbound" && messages.length === 0 && (
          <div className="text-[13px] text-muted italic mt-6 text-center">
            No draft yet. Add an intent or tap Propose draft below.
          </div>
        )}
        {channel === "private" && messages.length === 0 && (
          <div className="text-[13px] text-muted italic mt-6 text-center">
            Nothing here yet.
          </div>
        )}
        {messages.map((m) => {
          const author =
            m.author.kind === "human"
              ? usersById.get(m.author.userId) ?? null
              : null;
          const isSelf =
            m.author.kind === "human" && m.author.userId === currentUserId;
          const isFirstAgent =
            channel === "private" &&
            firstAgentMessage &&
            m.id === firstAgentMessage.id;
          const isDraft = channel === "outbound" && m.draft;
          return (
            <div key={m.id} className="flex flex-col gap-3">
              {isDraft && (
                <div className="text-[11px] text-attention tracking-wide">
                  Draft — review before sending
                </div>
              )}
              <MessageBubble message={m} author={author} isSelf={isSelf} />
              {isDraft && (
                <div className="pl-3.5 flex items-center gap-2">
                  <button
                    onClick={() => sendDraft(thread.id, m.id)}
                    className="h-9 px-4 rounded-full bg-agent text-paper text-[12.5px] font-semibold hover:opacity-90"
                  >
                    Send
                  </button>
                  <span className="text-[11.5px] text-muted">
                    will be sent to {firstName}
                  </span>
                </div>
              )}
              {isFirstAgent && (
                <div className="pl-3.5">
                  <IntentChips
                    usedBodies={usedChipBodies}
                    onPick={(body) => addIntentFromChip(thread.id, body)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {channel === "private" && (
        <Composer
          onSend={(body) => {
            console.log("send to private", body);
          }}
          placeholder={isYou ? "Message Agent" : "Read-only as another viewer"}
        />
      )}
      {channel === "outbound" && (
        <div className="border-t border-rule px-4 h-14 flex items-center justify-between bg-paper">
          <div className="text-[12px] text-muted">
            Agent drafts; you review.
          </div>
          <button
            onClick={() => proposeDraftForThread(thread.id)}
            className="text-[12px] font-medium text-ink border border-rule rounded-full px-3 h-9 hover:border-ink transition-colors"
          >
            {thread.outbound.some((m) => m.draft)
              ? "Re-draft"
              : "Propose draft"}
          </button>
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Contact"
      >
        <div className="flex items-start gap-3">
          <Avatar initials={initialsOf(thread.contact.name)} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[24px] font-semibold leading-tight text-ink tracking-tight">
              {thread.contact.name}
            </h3>
            <div className="text-[14px] text-ink mt-1">
              {thread.contact.role}
            </div>
            <div className="text-[13px] text-muted mt-0.5">
              {thread.contact.company}
            </div>
            <div className="text-[12.5px] text-muted mt-3">
              Met at {thread.contact.metWhere}
              <span className="text-rule mx-2">·</span>
              {formatMetWhen(thread.contact.metWhen)}
            </div>
          </div>
        </div>
        <div className="mt-5 border-t border-rule pt-4">
          <div className="text-[12px] text-muted mb-2">Full ledger</div>
          <IntentLedger
            intents={thread.intents}
            contactName={thread.contact.name}
          />
        </div>
      </Sheet>
    </div>
  );
};
