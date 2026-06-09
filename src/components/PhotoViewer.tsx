// Fullscreen photo viewer. Triggered by tapping an image bubble in chat.
// Black backdrop, image centered, tap or X to dismiss.

import { useEffect } from "react";
import type { Attachment } from "../types";
import { attachmentUrl } from "../lib/attachments";

type Props = {
  attachment: Attachment;
  onClose: () => void;
};

export const PhotoViewer = ({ attachment, onClose }: Props) => {
  // ESC closes on web; on iOS the user can tap the backdrop or the X.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const url = attachmentUrl(attachment);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <img
        src={url}
        alt=""
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-12 right-5 h-9 w-9 rounded-full bg-white/15 text-white flex items-center justify-center text-[18px]"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        ×
      </button>
    </div>
  );
};
