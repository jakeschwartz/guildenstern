import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pickPhoto, uploadAttachment } from "../lib/attachments";
import type { Attachment } from "../types";

type Props = {
  onSend: (body: string, attachments?: Attachment[]) => void;
  placeholder?: string;
  // For uploading attachments — they live under <threadId>/ in storage.
  threadId?: string;
};

// A photo staged in the composer. Uploads EAGERLY the moment it's picked;
// failures show on the thumbnail itself (⚠ tap-to-retry) instead of a popup.
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

// Max textarea height in px — roughly 5 lines at 16px text.
const MAX_COMPOSER_TEXT_HEIGHT = 120;

export const Composer = ({
  onSend,
  placeholder = "Message",
  threadId,
}: Props) => {
  const [value, setValue] = useState("");
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  // Send was tapped while an upload was still running — fire automatically
  // the moment uploads settle. iMessage never makes you wait on the spinner.
  const [sendQueued, setSendQueued] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea; track real container height in --composer-h so
  // the chat scroll area ends above us.
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
  }, [value, staged.length, menuOpen]);

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

  const onAddPhoto = async (source: "library" | "camera") => {
    const photo = await pickPhoto(source);
    if (!photo) return; // cancelled — no fuss
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
  // Sendable the moment there's text or any staged photo (even still
  // uploading — submit queues until the upload lands).
  const hasContent =
    value.trim().length > 0 || staged.some((s) => s.status !== "error");

  const fireSend = () => {
    const trimmed = value.trim();
    const atts = staged
      .filter((s) => s.status === "ready" && s.attachment)
      .map((s) => s.attachment as Attachment);
    if (!trimmed && atts.length === 0) return;
    onSend(trimmed, atts.length > 0 ? atts : undefined);
    setValue("");
    // Failed photos stay staged (visible + retryable) — they're not silently lost.
    setStaged((curr) => curr.filter((s) => s.status === "error"));
    keepKeyboardOpen();
  };

  const submit = () => {
    if (!hasContent) return;
    if (anyUploading) {
      setSendQueued(true);
      return;
    }
    fireSend();
  };

  // Queued send fires as soon as the last upload settles.
  useEffect(() => {
    if (!sendQueued || anyUploading) return;
    setSendQueued(false);
    fireSend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendQueued, anyUploading]);

  const scrollThreadsToBottom = () => {
    document
      .querySelectorAll<HTMLElement>("[data-thread-scroll='true']")
      .forEach((el) => {
        el.scrollTop = el.scrollHeight;
      });
  };

  const chooseSource = (source: "library" | "camera") => {
    setMenuOpen(false);
    void onAddPhoto(source);
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
      {/* Anchored attach menu, iMessage/Signal-style: small sheet that pops
          up from the + button with the two sources. */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute bottom-full left-6 mb-2 z-50 bg-card ring-1 ring-rule rounded-2xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.4)] overflow-hidden min-w-[190px]">
            <button
              onClick={() => chooseSource("library")}
              className="flex items-center gap-3 px-4 py-3.5 w-full text-left text-[16px] text-ink active:bg-paper/60"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="9" cy="9" r="2" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              Photo Library
            </button>
            <div className="h-px bg-rule" />
            <button
              onClick={() => chooseSource("camera")}
              className="flex items-center gap-3 px-4 py-3.5 w-full text-left text-[16px] text-ink active:bg-paper/60"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Take Photo
            </button>
          </div>
        </>
      )}

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
      {sendQueued && anyUploading && (
        <div className="text-[11px] text-muted leading-snug">
          Sending as soon as the photo finishes uploading…
        </div>
      )}
      <div className="flex items-end gap-2">
        {threadId && (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Attach"
            className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
              menuOpen ? "text-ink rotate-45" : "text-muted hover:text-ink"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
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
              if (trimmed || staged.length > 0) {
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
          disabled={!hasContent}
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-mira text-paper disabled:bg-card disabled:text-muted transition-colors"
        >
          {sendQueued && anyUploading ? (
            <span className="h-4 w-4 rounded-full border-2 border-paper/40 border-t-paper animate-spin" />
          ) : (
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
          )}
        </button>
      </div>
    </div>
  );
};
