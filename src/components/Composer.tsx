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
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
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
