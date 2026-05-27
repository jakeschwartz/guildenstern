import type { Message, User } from "../types";
import { formatClock } from "../lib/time";

type Props = {
  message: Message;
  author: User | null;
  isSelf: boolean;
};

export const MessageBubble = ({ message, author, isSelf }: Props) => {
  if (message.author.kind === "agent") {
    return (
      <div className="flex flex-col gap-1 max-w-[92%]">
        <div className="flex items-baseline gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-agent shrink-0" />
          <span className="text-[12px] font-semibold text-agent">Agent</span>
          <span className="text-[11px] text-muted">
            {formatClock(message.createdAt)}
          </span>
        </div>
        <div className="text-[14.5px] leading-snug text-ink whitespace-pre-line pl-3.5">
          {message.body}
        </div>
      </div>
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
      <div className="text-[14.5px] leading-snug text-ink">{message.body}</div>
    </div>
  );
};
