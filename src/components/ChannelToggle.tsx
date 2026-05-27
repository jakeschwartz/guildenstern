export type Channel = "private" | "outbound";

type Props = {
  value: Channel;
  onChange: (c: Channel) => void;
  contactName: string;
};

export const ChannelToggle = ({ value, onChange, contactName }: Props) => {
  const firstName = contactName.split(" ")[0];
  const tab = (label: string, val: Channel) => {
    const active = value === val;
    return (
      <button
        onClick={() => onChange(val)}
        className={`h-11 px-4 text-[13px] font-semibold border-b-2 transition-colors ${
          active
            ? "text-ink border-ink"
            : "text-muted border-transparent hover:text-ink"
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex gap-1 px-2 border-b border-rule">
      {tab("Private", "private")}
      {tab(`Outbound to ${firstName}`, "outbound")}
    </div>
  );
};
