// v4: inbox uses squircle avatars (radius 10) per the spec to step off iMessage
// circles. Voice tone available for when the agent appears (rare — agent
// generally doesn't appear in the inbox row, but Mira's pinned row uses a
// plum dot, not a bubble — kept here for flexibility).

type Voice = "mira" | "otis" | "specialist";

type Props = {
  initials: string;
  size?: "sm" | "md" | "lg";
  voice?: Voice | null;
};

export const Avatar = ({ initials, size = "md", voice = null }: Props) => {
  const dim =
    size === "lg"
      ? "h-12 w-12 text-[14px]"
      : size === "sm"
        ? "h-7 w-7 text-[10px]"
        : "h-9 w-9 text-[12px]";
  const palette = voice
    ? voice === "mira"
      ? "bg-mira-tint text-mira"
      : voice === "otis"
        ? "bg-otis-tint text-otis"
        : "bg-specialist-tint text-specialist"
    : "bg-card text-ink ring-1 ring-rule";
  return (
    <div
      className={`${dim} ${palette} rounded-squircle flex items-center justify-center font-medium tracking-wide uppercase shrink-0`}
    >
      {initials}
    </div>
  );
};
