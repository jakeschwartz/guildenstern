// Human-message renderer. Agent messages use Voice (rule + coded header,
// not a bubble). PersonalThread renders Mira's voice directly; this file's
// agent branch is hit only from PartnershipThread, where the agent is
// Otis (the scribe in shared rooms) per UX_SPEC §1. Mira never appears
// here — she's private-only.

import type { Message, User } from "../types";
import { formatClock } from "../lib/time";
import { Voice } from "./Voice";

type Props = {
  message: Message;
  author: User | null;
  isSelf: boolean;
};

export const MessageBubble = ({ message, author, isSelf }: Props) => {
  if (message.author.kind === "agent") {
    return (
      <Voice
        voice="otis"
        name="Otis"
        role="scribe"
        body={message.body}
        timestamp={formatClock(message.createdAt)}
      />
    );
  }

  const name = author?.name ?? "Unknown";

  if (isSelf) {
    return (
      <div className="flex flex-col items-end gap-1 max-w-[84%] ml-auto">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-muted">
            {formatClock(message.createdAt)}
          </span>
          <span className="text-[12px] font-semibold text-ink">{name}</span>
        </div>
        <div className="bg-ink text-paper rounded-2xl rounded-br-md px-3.5 py-2 text-[14.5px] leading-snug">
          {message.body}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 max-w-[92%]">
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-semibold text-ink">{name}</span>
        <span className="text-[11px] text-muted">
          {formatClock(message.createdAt)}
        </span>
      </div>
      <div className="bg-card text-ink rounded-2xl rounded-bl-md px-3.5 py-2 text-[14.5px] leading-snug">
        {message.body}
      </div>
    </div>
  );
};
