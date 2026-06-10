import { useLayoutEffect, useRef, useState } from "react";
import { pickPhoto, uploadAttachment } from "../lib/attachments";
import type { Attachment } from "../types";

type Props = {
  onSend: (body: string, attachments?: Attachment[]) => void;
  placeholder?: string;
  // For uploading attachments — they live under <threadId>/ in storage.
  threadId?: string;
};

// A photo staged in the composer. Uploads EAGERLY the moment it's picked, so
// tapping send is instant and any failure is visible on the thumbnail itself
// (spinner → ready, or ⚠ + retry) instead of a popup at send time.
type StagedPhoto = {
  key: string;
  dataUrl: string;
  status: "uploading" | "ready" | "error";
  attachment?: Attachment;
  error?: string;
  width: number;
  height: number;
  format: string;
};

// position:fixed at the bottom of the viewport. Rides with the keyboard
// via --kbd-h (set in lib/keyboard from Keyboard plugin events).
// Max textarea height in px — roughly 5 lines at 16px text.
const MAX_COMPOSER_TEXT_HEIGHT = 120;

export const Composer = ({
  onSend,
  placeholder = "Message",
  threadId,
}: Props) => {
  const [value, setValue] = useState("");
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea with content; track real container height in
  // --composer-h so the chat scroll area ends above us.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_COMPOSER_TEXT_HEIGHT);
    el.style.height = `${next}px`;
    const c = containerRef.current;
    if (c) {
      document.documentElement.style.setProperty(
        "--composer-h",
        `${c.offsetHeight}px`,
      );
    }
    document
      .querySelectorAll<HTMLElement>("[data-thread-scroll='true']")
      .forEach((scroll) => {
        scroll.scrollTop = scroll.scrollHeight;
      });
  }, [value, staged.length]);

  const keepKeyboardOpen = () => {
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const startUpload = (entry: StagedPhoto) => {
    if (!threadId) return;
    setStaged((curr) =>
      curr.map((s) =>
        s.key === entry.key
          ? { ...s, status: "uploading", error: undefined }
          : s,
      ),
    );
    uploadAttachment(threadId, {
      dataUrl: entry.dataUrl,
      format: entry.format,
      width: entry.width,
      height: entry.height,
    })
      .then((attachment) => {
        setStaged((curr) =>
          curr.map((s) =>
            s.key === entry.key ? { ...s, status: "ready", attachment } : s,
          ),
        );
      })
      .catch((e) => {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "object" && e !== null && "message" in e
              ? String((e as { message: unknown }).message)
              : String(e);
        setStaged((curr) =>
          curr.map((s) =>
            s.key === entry.key ? { ...s, status: "error", error: msg } : s,
          ),
        );
      });
  };

  const onAddPhoto = async () => {
    const photo = await pickPhoto("prompt");
    if (!photo) return; // cancelled — no popup, no fuss
    const entry: StagedPhoto = {
      key: crypto.randomUUID(),
      dataUrl: photo.dataUrl,
      status: "uploading",
      width: photo.width,
      height: photo.height,
      format: photo.format,
    };
    setStaged((curr) => [...curr, entry]);
    startUpload(entry);
  };

  const removeStaged = (key: string) => {
    setStaged((curr) => curr.filter((s) => s.key !== key));
  };

  const anyUploading = staged.some((s) => s.status === "uploading");
  const firstError = staged.find((s) => s.status === "error")?.error;
  const readyAttachments = staged
    .filter((s) => s.status === "ready" && s.attachment)
    .map((s) => s.attachment as Attachment);
  const canSend =
    (value.trim().length > 0 || readyAttachments.length > 0) && !anyUploading;

  const submit = () => {
    const trimmed = value.trim();
    if (!canSend) return;
    onSend(trimmed, readyAttachments.length > 0 ? readyAttachments : undefined);
    setValue("");
    setStaged((curr) => curr.filter((s) => s.status === "error")); // keep failed ones visible
    keepKeyboardOpen();
  };

  const scrollThreadsToBottom = () => {
    document
      .querySelectorAll<HTMLElement>("[data-thread-scroll='true']")
      .forEach((el) => {
        el.scrollTop = el.scrollHeight;
      });
  };

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
      {staged.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto">
          {staged.map((s) => (
            <div key={s.key} className="relative shrink-0">
              <img
                src={s.dataUrl}
                alt=""
                className={`h-16 w-16 rounded-xl object-cover ring-1 ring-rule ${
                  s.status !== "ready" ? "opacity-60" : ""
                }`}
              />
              {s.status === "uploading" && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="h-5 w-5 rounded-full border-2 border-paper/40 border-t-paper animate-spin" />
                </span>
              )}
              {s.status === "error" && (
                <button
                  onClick={() => startUpload(s)}
                  aria-label="Retry upload"
                  className="absolute inset-0 flex items-center justify-center text-[18px]"
                >
                  ⚠
                </button>
              )}
              <button
                onClick={() => removeStaged(s.key)}
                aria-label="Remove photo"
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-ink text-paper flex items-center justify-center text-[11px] font-semibold"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {firstError && (
        <div className="text-[11px] text-attention leading-snug">
          Photo upload failed: {firstError} — tap ⚠ to retry.
        </div>
      )}
      <div className="flex items-end gap-2">
        {threadId && (
          <button
            onClick={() => void onAddPhoto()}
            aria-label="Add photo"
            className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-muted hover:text-ink transition-colors"
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
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <circle cx="12" cy="12" r="3.2" />
              <line x1="17.5" y1="8.5" x2="17.5" y2="8.5" strokeWidth="2.6" />
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
              if (trimmed || readyAttachments.length > 0) {
                submit();
                return;
              }
            }
            setValue(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          enterKeyHint="send"
          placeholder={placeholder}
          rows={1}
          style={{ maxHeight: MAX_COMPOSER_TEXT_HEIGHT }}
          className="flex-1 min-w-0 resize-none bg-card ring-1 ring-rule rounded-2xl px-3.5 py-2 text-[16px] leading-snug text-ink placeholder:text-muted focus:outline-none focus:ring-ink overflow-y-auto"
        />
        <button
          onClick={submit}
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
