import { useState } from "react";

type Props = {
  onSend: (body: string) => void;
  placeholder?: string;
};

// position:fixed at the bottom of the viewport. Rides with the keyboard
// via --kbd-h (set in lib/keyboard from Keyboard plugin events).
export const Composer = ({ onSend, placeholder = "Message" }: Props) => {
  const [value, setValue] = useState("");
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
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
      className="border-t border-rule bg-paper flex items-end gap-2 shrink-0"
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
      <textarea
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
              onSend(trimmed);
              setValue("");
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
        className="flex-1 min-w-0 resize-none bg-card ring-1 ring-rule rounded-2xl px-3.5 py-2 text-[16px] leading-snug text-ink placeholder:text-muted focus:outline-none focus:ring-ink"
      />
      <button
        onClick={submit}
        aria-label="Send"
        disabled={!value.trim()}
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
  );
};
