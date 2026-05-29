import { useState } from "react";

type Props = {
  onSend: (body: string) => void;
  placeholder?: string;
};

export const Composer = ({ onSend, placeholder = "Message" }: Props) => {
  const [value, setValue] = useState("");
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };
  return (
    <div className="border-t border-rule px-3 py-2.5 flex items-end gap-2 bg-paper">
      <textarea
        value={value}
        onChange={(e) => {
          // iOS WebView fires onChange (not onKeyDown) when the "send" key is
          // pressed on the soft keyboard with enterkeyhint="send". Detect a
          // newline insertion and treat it as a submit.
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
          // Hardware/desktop keyboard path: Enter (no shift) = submit.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        enterKeyHint="send"
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none bg-card ring-1 ring-rule rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug text-ink placeholder:text-muted focus:outline-none focus:ring-ink"
      />
      <button
        onClick={submit}
        className="text-[13px] font-semibold text-ink px-3 py-2 disabled:text-muted"
        disabled={!value.trim()}
      >
        Send
      </button>
    </div>
  );
};
