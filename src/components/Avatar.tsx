type Props = {
  initials: string;
  size?: "sm" | "md";
  tone?: "ink" | "agent";
};

export const Avatar = ({ initials, size = "md", tone = "ink" }: Props) => {
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-[11px]";
  const palette =
    tone === "agent"
      ? "bg-agent text-paper"
      : "bg-card text-ink ring-1 ring-rule";
  return (
    <div
      className={`${dim} ${palette} rounded-full flex items-center justify-center font-medium tracking-wide uppercase`}
    >
      {initials}
    </div>
  );
};
