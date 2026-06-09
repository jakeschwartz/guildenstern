import { useLayoutEffect, useRef, useState } from "react";
import {
  pickPhoto,
  uploadAttachment,
  type PickedPhoto,
} from "../lib/attachments";
import type { Attachment } from "../types";

type Props = {
  onSend: (body: string, attachments?: Attachment[]) => void;
  placeholder?: string;
  // For uploading attachments — they live under <threadId>/ in storage.
  threadId?: string;
};

// position:fixed at the bottom of the viewport. Rides with the keyboard
// via --kbd-h (set in lib/keyboard from Keyboard plugin events).
// Max textarea height in px — roughly 5 lines at 16px text. Beyond this the
// textarea scrolls internally instead of growing further, so the composer
// can't eat the entire chat.
const MAX_COMPOSER_TEXT_HEIGHT = 120;

export const Composer = ({
  onSend,
  placeholder = "Message",
  threadId,
}: Props) => {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<PickedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea with content. Resets to "auto" first so it can
  // also SHRINK when text is deleted. Writes the actual *measured* container
  // height to --composer-h on the document root so message scroll areas can
  // pad-bottom by the right amount and not hide content behind us.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_COMPOSER_TEXT_HEIGHT);
    el.style.height = `${next}px`;
    // Measure the actual container (which includes textarea + button +
    // pending-photo strip + padding + border). More reliable than deriving
    // from textarea height alone.
    const c = containerRef.current;
    if (c) {
      const h = c.offsetHeight;
      document.documentElement.style.setProperty("--composer-h", `${h}px`);
    }
    document
      .querySelectorAll<HTMLElement>("[data-thread-scroll='true']")
      .forEach((scroll) => {
        scroll.scrollTop = scroll.scrollHeight;
      });
  }, [value, pending.length]);

  // After submit, iOS dismisses the keyboard by default. Re-focus the
  // textarea so the keyboard stays open and the user can keep typing
  // (iMessage-style conversation mode).
  const keepKeyboardOpen = () => {
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed && pending.length === 0) return;
    if (uploading) return;
    let attachments: Attachment[] = [];
    if (pending.length > 0 && threadId) {
      setUploading(true);
      try {
        attachments = await Promise.all(
          pending.map((p) => uploadAttachment(threadId, p)),
        );
      } catch (e) {
        console.error("[Composer] upload failed", e);
        if (typeof window !== "undefined" && "alert" in window) {
          window.alert(
            `Couldn't upload photo: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setValue("");
    setPending([]);
    keepKeyboardOpen();
  };

  const scrollThreadsToBottom = () => {
    document
      .querySelectorAll<HTMLElement>("[data-thread-scroll='true']")
      .forEach((el) => {
        el.scrollTop = el.scrollHeight;
      });
  };

  const onAddPhoto = async () => {
    const photo = await pickPhoto("prompt");
    if (photo) setPending((curr) => [...curr, photo]);
  };

  const removePending = (idx: number) => {
    setPending((curr) => curr.filter((_, i) => i !== idx));
  };

  const canSend = (value.trim().length > 0 || pending.length > 0) && !uploading;

  return (
    <div
      ref={containerRef}
      className="border-t border-rule bg-paper flex flex-col gap-2 shrink-0"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "calc(var(--kbd-h, 0px) + var(--safe-b, 34px))",
        zIndex: 50,
        paddingLeft: 28,
        paddingRight: 28,
        paddingTop: 8,
        paddingBottom: 8,
        transition: "bottom 0.2s ease",
      }}
    >
      {pending.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto">
          {pending.map((p, i) => (
            <div key={i} className="relative shrink-0">
              <img
                src={p.dataUrl}
                alt=""
                className="h-16 w-16 rounded-xl object-cover ring-1 ring-rule"
              />
              <button
                onClick={() => removePending(i)}
                aria-label="Remove photo"
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-ink text-paper flex items-center justify-center text-[11px] font-semibold"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        {threadId && (
          <button
            onClick={onAddPhoto}
            aria-label="Add photo"
            disabled={uploading}
            className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-muted hover:text-ink disabled:opacity-50 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
        )}
        <textarea
          ref={inputRef}
          value={value}
          cols={1}
          onFocus={() => {
            setTimeout(scrollThreadsToBottom, 300);
          }}
          onChange={(e) => {
            const next = e.target.value;
            if (next.endsWith("\n") && !next.endsWith("\n\n")) {
              const trimmed = next.replace(/\n+$/, "").trim();
              if (trimmed) {
                void submit();
                return;
              }
            }
            setValue(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          enterKeyHint="send"
          placeholder={uploading ? "Uploading…" : placeholder}
          rows={1}
          disabled={uploading}
          style={{ maxHeight: MAX_COMPOSER_TEXT_HEIGHT }}
          className="flex-1 min-w-0 resize-none bg-card ring-1 ring-rule rounded-2xl px-3.5 py-2 text-[16px] leading-snug text-ink placeholder:text-muted focus:outline-none focus:ring-ink overflow-y-auto disabled:opacity-60"
        />
        <button
          onClick={() => void submit()}
          aria-label="Send"
          disabled={!canSend}
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-mira text-paper disabled:bg-card disabled:text-muted transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="6,11 12,5 18,11" />
          </svg>
        </button>
      </div>
    </div>
  );
};
