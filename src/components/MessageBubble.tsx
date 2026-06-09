// Human-message renderer. Agent messages use Voice (rule + coded header,
// not a bubble). PersonalThread renders Mira's voice directly; this file's
// agent branch is hit only from PartnershipThread, where the agent is
// Otis (the scribe in shared rooms) per UX_SPEC §1. Mira never appears
// here — she's private-only.

import { useState } from "react";
import type { Attachment, Message, User } from "../types";
import { formatClock } from "../lib/time";
import { attachmentUrl } from "../lib/attachments";
import { Voice } from "./Voice";
import { PhotoViewer } from "./PhotoViewer";

type Props = {
  message: Message;
  author: User | null;
  isSelf: boolean;
};

// One image preview in a message bubble. Aspect-correct sizing so the
// layout doesn't jump when the image loads. Capped to a reasonable
// max-width / max-height so a tall photo doesn't dominate the chat.
const AttachmentImage = ({
  attachment,
  onOpen,
}: {
  attachment: Attachment;
  onOpen: () => void;
}) => {
  const url = attachmentUrl(attachment);
  const aspect = attachment.width / Math.max(1, attachment.height);
  return (
    <button
      onClick={onOpen}
      className="block rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-ink"
      style={{
        aspectRatio: `${aspect}`,
        width: "min(260px, 70vw)",
        maxHeight: "320px",
      }}
    >
      <img
        src={url}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </button>
  );
};

export const MessageBubble = ({ message, author, isSelf }: Props) => {
  const [viewing, setViewing] = useState<Attachment | null>(null);

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
  const attachments = message.attachments ?? [];
  const hasText = message.body.trim().length > 0;

  const bubble = (
    <div className={isSelf ? "ml-auto" : ""}>
      {attachments.length > 0 && (
        <div className={`flex flex-col gap-1.5 ${isSelf ? "items-end" : "items-start"} ${hasText ? "mb-1.5" : ""}`}>
          {attachments.map((a, i) => (
            <AttachmentImage
              key={i}
              attachment={a}
              onOpen={() => setViewing(a)}
            />
          ))}
        </div>
      )}
      {hasText && (
        <div
          className={`${
            isSelf
              ? "bg-ink text-paper rounded-2xl rounded-br-md"
              : "bg-card text-ink rounded-2xl rounded-bl-md"
          } px-4 py-2.5 text-[17px] leading-snug ${isSelf ? "ml-auto" : ""}`}
        >
          {message.body}
        </div>
      )}
    </div>
  );

  if (isSelf) {
    return (
      <>
        <div className="flex flex-col items-end gap-1 max-w-[84%] ml-auto">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] text-muted">
              {formatClock(message.createdAt)}
            </span>
            <span className="text-[13px] font-semibold text-ink">{name}</span>
          </div>
          {bubble}
        </div>
        {viewing && (
          <PhotoViewer
            attachment={viewing}
            onClose={() => setViewing(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1 max-w-[92%]">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-ink">{name}</span>
          <span className="text-[12px] text-muted">
            {formatClock(message.createdAt)}
          </span>
        </div>
        {bubble}
      </div>
      {viewing && (
        <PhotoViewer
          attachment={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
};
