type Props = {
  awaiting: boolean;
  onOpenSpoke: () => void;
};

export const AgentIndicator = ({ awaiting, onOpenSpoke }: Props) => {
  const dot = awaiting ? "bg-attention" : "bg-agent";
  const tone = awaiting ? "text-attention" : "text-agent";
  const label = awaiting ? "Waiting on you" : "Agent active";
  return (
    <button
      onClick={onOpenSpoke}
      className="w-full h-11 px-4 flex items-center gap-2.5 border-b border-rule hover:bg-card/40 transition-colors"
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
      <span className={`text-[13px] font-semibold ${tone} truncate`}>
        {label}
      </span>
      <span className="ml-auto text-[13px] font-medium text-ink shrink-0">
        Talk to Agent
        <span className="text-muted ml-1.5">›</span>
      </span>
    </button>
  );
};
