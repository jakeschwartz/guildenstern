import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { pickPhoto, uploadAttachment } from "../lib/attachments";
import type { Attachment } from "../types";

type Props = {
  onSend: (body: string, attachments?: Attachment[]) => void;
  placeholder?: string;
  // For uploading attachments — they live under <threadId>/ in storage.
  threadId?: string;
  // Distinguishes multiple composers on the same thread (main chat vs
  // otis_chat). Defaults to threadId.
  stagingKey?: string;
};

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

// ---------------------------------------------------------------------------
// Module-level staging store.
//
// CRITICAL: opening the native photo picker / camera backgrounds the app and
// resizes the WebView, which can flip the carousel's paneIndex and UNMOUNT
// the Composer. Component-local staged state died with it — the upload kept
// running (closure) but the thumbnail never re-appeared, so the user had
// nothing to send. (That's why orphaned uploads were landing in storage with
// no message row.) Keeping the staging state here means a remounted Composer
// picks up exactly where it left off, including uploads that finished while
// it was unmounted.
// ---------------------------------------------------------------------------

type StageState = { staged: StagedPhoto[]; sendQueued: boolean };
const EMPTY_STAGE: StageState = { staged: [], sendQueued: false };
const stageStates = new Map<string, StageState>();
const stageListeners = new Set<() => void>();

const getStage = (key: string): StageState =>
  stageStates.get(key) ?? EMPTY_STAGE;

const updateStage = (
  key: string,
  updater: (s: StageState) => StageState,
): void => {
  stageStates.set(key, updater(getStage(key)));
  stageListeners.forEach((l) => l());
};

const subscribeStage = (l: () => void): (() => void) => {
  stageListeners.add(l);
  return () => stageListeners.delete(l);
};

// Max textarea height in px — roughly 5 lines at 16px text.
const MAX_COMPOSER_TEXT_HEIGHT = 120;

export const Composer = ({
  onSend,
  placeholder = "Message",
  threadId,
  stagingKey,
}: Props) => {
  const key = stagingKey ?? threadId ?? "default";
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const stage = useSyncExternalStore(subscribeStage, () => getStage(key));
  const { staged, sendQueued } = stage;
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
    updateStage(key, (s) => ({
      ...s,
      staged: s.staged.map((p) =>
        p.key === entry.key
          ? { ...p, status: "uploading", error: undefined }
          : p,
      ),
    }));
    uploadAttachment(threadId, {
      dataUrl: entry.dataUrl,
      format: entry.format,
      width: entry.width,
      height: entry.height,
    })
      .then((attachment) => {
        updateStage(key, (s) => ({
          ...s,
          staged: s.staged.map((p) =>
            p.key === entry.key ? { ...p, status: "ready", attachment } : p,
          ),
        }));
      })
      .catch((e) => {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "object" && e !== null && "message" in e
              ? String((e as { message: unknown }).message)
              : String(e);
        updateStage(key, (s) => ({
          ...s,
          staged: s.staged.map((p) =>
            p.key === entry.key ? { ...p, status: "error", error: msg } : p,
          ),
        }));
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
    updateStage(key, (s) => ({ ...s, staged: [...s.staged, entry] }));
    startUpload(entry);
  };

  const removeStaged = (photoKey: string) => {
    updateStage(key, (s) => ({
      ...s,
      staged: s.staged.filter((p) => p.key !== photoKey),
    }));
  };

  const anyUploading = staged.some((s) => s.status === "uploading");
  const firstError = staged.find((s) => s.status === "error")?.error;
  // Sendable the moment there's text or any staged photo (even still
  // uploading — submit queues until the upload lands).
  const hasContent =
    value.trim().length > 0 || staged.some((s) => s.status !== "error");

  const fireSend = () => {
    const current = getStage(key);
    const trimmed = value.trim();
    const atts = current.staged
      .filter((s) => s.status === "ready" && s.attachment)
      .map((s) => s.attachment as Attachment);
    if (!trimmed && atts.length === 0) return;
    onSend(trimmed, atts.length > 0 ? atts : undefined);
    setValue("");
    // Failed photos stay staged (visible + retryable).
    updateStage(key, (s) => ({
      ...s,
      staged: s.staged.filter((p) => p.status === "error"),
    }));
    keepKeyboardOpen();
  };

  const submit = () => {
    if (!hasContent) return;
    if (anyUploading) {
      updateStage(key, (s) => ({ ...s, sendQueued: true }));
      return;
    }
    fireSend();
  };

  // Queued send fires as soon as the last upload settles — including the
  // case where the Composer was remounted in between (effect runs on mount
  // and sees the persisted queue flag).
  useEffect(() => {
    if (!sendQueued || anyUploading) return;
    updateStage(key, (s) => ({ ...s, sendQueued: false }));
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
      {/* Anchored attach menu, iMessage/Signal-style. */}
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

        {/* The input bubble. iMessage-style: staged photo thumbnails live
            INSIDE the bubble, above the text — unmissable, and visually one
            unit with what you're about to send. */}
        <div className="flex-1 min-w-0 bg-card ring-1 ring-rule rounded-2xl px-3 py-2 flex flex-col gap-2 focus-within:ring-ink transition-shadow">
          {staged.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pt-1">
              {staged.map((s) => (
                <div key={s.key} className="relative shrink-0">
                  <img
                    src={s.dataUrl}
                    alt=""
                    className={`h-20 w-20 rounded-xl object-cover ${
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
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-ink text-paper flex items-center justify-center text-[11px] font-semibold shadow"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
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
            className="w-full resize-none bg-transparent text-[16px] leading-snug text-ink placeholder:text-muted focus:outline-none overflow-y-auto"
          />
        </div>

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
