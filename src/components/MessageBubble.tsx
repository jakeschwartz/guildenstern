// Human-message renderer. Agent messages use Voice (rule + coded header,
// not a bubble) and are rendered by callers directly — this file only
// handles human bubbles now.

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
    // Default voice mapping for v0: agent = Mira/concierge. When we add
    // shared rooms with Otis or specialists, the row will carry an explicit
    // voice marker (column on messages) and we'll branch here.
    return (
      <Voice
        voice="mira"
        name="Mira"
        role="concierge"
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
        <div className="bg-ink/95 text-paper rounded-2xl rounded-br-md px-3.5 py-2 text-[14.5px] leading-snug">
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
