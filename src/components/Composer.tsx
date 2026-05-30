import { useState } from "react";

type Props = {
  onSend: (body: string) => void;
  placeholder?: string;
};

// Composer is position:fixed at the bottom of the viewport so it stays put
// regardless of body resize / iOS scroll-into-view. Bottom rises with the
// keyboard via --kbd-h, and sits above the home indicator via --safe-b
// when the keyboard is hidden.
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
      className="border-t border-rule bg-paper px-3 py-2.5 flex items-end gap-2"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "calc(var(--kbd-h, 0px) + var(--safe-b, 0px))",
        zIndex: 50,
        transition: "bottom 0.2s ease",
      }}
    >
      <textarea
        value={value}
        cols={1}
        onFocus={() => {
          scrollThreadsToBottom();
          requestAnimationFrame(scrollThreadsToBottom);
          setTimeout(scrollThreadsToBottom, 150);
          setTimeout(scrollThreadsToBottom, 350);
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
        className="flex-1 min-w-0 resize-none bg-card ring-1 ring-rule rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug text-ink placeholder:text-muted focus:outline-none focus:ring-ink"
      />
      <button
        onClick={submit}
        className="text-[13px] font-semibold text-ink px-3 py-2 disabled:text-muted shrink-0"
        disabled={!value.trim()}
      >
        Send
      </button>
    </div>
  );
};
