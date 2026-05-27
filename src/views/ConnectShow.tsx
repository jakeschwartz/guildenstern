import QRCode from "react-qr-code";
import { useStore } from "../state/store";

type Props = {
  onBack: () => void;
};

export const ConnectShow = ({ onBack }: Props) => {
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const me = users.find((u) => u.id === currentUserId);

  if (!me) {
    return (
      <div className="p-6 text-muted">
        Not signed in.{" "}
        <button onClick={onBack} className="underline">
          Back
        </button>
      </div>
    );
  }

  // The code encodes a Guildenstern user identifier. In production this
  // would be a signed magic link that opens the consent space on scan.
  const codeValue = `guildenstern://connect?user=${me.id}`;

  return (
    <div className="flex flex-col h-full bg-agent-tint/40">
      <header className="pl-2 pr-5 pt-11 pb-2 flex items-center justify-between">
        <button
          onClick={onBack}
          className="h-11 w-11 flex items-center justify-center text-muted hover:text-ink"
          aria-label="Back"
        >
          <span className="text-[18px] leading-none">←</span>
        </button>
        <span className="text-[12px] text-agent font-medium">My code</span>
        <span className="h-11 w-11" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
        <div className="text-[11.5px] text-muted uppercase tracking-wide text-center">
          Show this to someone you just met
        </div>
        <div className="bg-ink p-5 rounded-2xl">
          <QRCode
            value={codeValue}
            size={220}
            bgColor="#F2EFE6"
            fgColor="#131318"
            level="M"
          />
        </div>
        <div className="text-center mt-2">
          <div className="text-[22px] font-semibold text-ink tracking-tight">
            {me.name}
          </div>
          <div className="text-[13px] text-muted mt-1">
            Founder · Guildenstern
          </div>
        </div>
        <div className="text-[11.5px] text-muted text-center mt-2 leading-relaxed max-w-[260px]">
          Opens a thread between your agents. Works whether or not they have
          Guildenstern yet.
        </div>
      </div>
    </div>
  );
};
