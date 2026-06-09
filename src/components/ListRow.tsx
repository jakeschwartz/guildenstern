// Inbox row per v4 spec §5: squircle avatar, no chevron, optional pinned
// treatment for Mira's row (plum tint + plum dot + PINNED label). Pending
// state surfaces an attention dot.
//
// Partnership rows get a `tag="partnership"` label (smallcaps, mirrors the
// pinned/Mira treatment) plus an `otisCorner` flag that overlays a tiny Otis
// avatar at the corner of the primary squircle — making the *mechanism*
// (Otis lives in this thread) visible at a glance from the inbox.

import { Avatar } from "./Avatar";

type Props = {
  initials: string;
  title: string;
  preview: string;
  timestamp: string;
  pending?: boolean;
  pinned?: boolean; // Mira's row at the top
  voice?: "mira" | "otis" | null;
  tag?: string; // e.g. "partnership"
  otisCorner?: boolean; // overlay tiny Otis squircle on the primary avatar
  onOpen: () => void;
};

export const ListRow = ({
  initials,
  title,
  preview,
  timestamp,
  pending = false,
  pinned = false,
  voice = null,
  tag,
  otisCorner = false,
  onOpen,
}: Props) => {
  const bg = pinned ? "bg-mira-tint" : "hover:bg-card/60";
  return (
    <button
      onClick={onOpen}
      className={`w-full text-left px-4 py-3 border-b border-rule flex items-start gap-3 transition-colors ${bg}`}
    >
      <div className="relative shrink-0">
        <Avatar initials={initials} size="md" voice={voice} />
        {otisCorner && (
          <div
            className="absolute -bottom-1 -right-1 ring-2 ring-paper rounded-squircle"
            aria-label="Otis is in this thread"
          >
            <Avatar initials="O" size="sm" voice="otis" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          {pinned && (
            <span className="h-1.5 w-1.5 rounded-full bg-mira shrink-0" />
          )}
          {pending && !pinned && (
            <span className="h-1.5 w-1.5 rounded-full bg-attention shrink-0" />
          )}
          <span className="text-[17px] font-semibold tracking-tight text-ink truncate">
            {title}
          </span>
          {pinned && (
            <span className="smallcaps text-[10.5px] text-mira ml-1 shrink-0">
              pinned
            </span>
          )}
          {tag && !pinned && (
            <span className="smallcaps text-[10.5px] text-otis ml-1 shrink-0">
              {tag}
            </span>
          )}
          <span className="ml-auto text-[13px] text-muted shrink-0">
            {timestamp}
          </span>
        </div>
        <div className="text-[14.5px] text-muted line-clamp-2 mt-0.5">
          {preview}
        </div>
      </div>
    </button>
  );
};
