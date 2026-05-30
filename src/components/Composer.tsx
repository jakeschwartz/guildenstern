import { useState } from "react";

type Props = {
  onSend: (body: string) => void;
  placeholder?: string;
};

// Composer is the last flex-column item in the thread view, in normal flow.
// Body is shrunk by KeyboardResize.Body when the keyboard opens, so PhoneFrame
// shrinks, so the composer rides up automatically.
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
      className="border-t border-rule bg-paper py-2.5 flex items-end gap-2 shrink-0 w-full max-w-full min-w-0"
      style={{
        paddingLeft: 20,
        paddingRight: 20,
        paddingBottom: "calc(10px + var(--safe-b, 34px))",
      }}
    >
      <textarea
        value={value}
        cols={1}
        onFocus={() => {
          // Single scroll after the keyboard finishes animating in.
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
