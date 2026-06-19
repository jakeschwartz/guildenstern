// The three coded agent voices: Mira (private), Otis (social), Specialist
// (third-party, e.g. Marlowe · bookie). Per spec §6: NOT bubbles. Render as
// left margin rule in the voice color + small caps name + role + body text.
//
// Posture shifts ("Stepping into mediator mode for a second…") are the
// first line and rendered italic. Optional `posturePrefix` carries the
// posture string when the caller knows it explicitly; otherwise we detect
// a leading italic-styled first line via the `posture` prop.

import type { ReactNode } from "react";

export type VoiceKind = "mira" | "otis" | "specialist";

type Props = {
  voice: VoiceKind;
  name: string;
  role: string;
  // Optional state suffix in the header, e.g. "(offered)", "(in room)"
  state?: string;
  // Italicized posture line that appears above the body
  posture?: string;
  body?: ReactNode;
  children?: ReactNode;
  timestamp?: string;
};

const COLORS: Record<
  VoiceKind,
  { rule: string; text: string; dot: string }
> = {
  mira: {
    rule: "border-mira",
    text: "text-mira",
    dot: "bg-mira",
  },
  otis: {
    rule: "border-otis",
    text: "text-otis",
    dot: "bg-otis",
  },
  specialist: {
    rule: "border-specialist",
    text: "text-specialist",
    dot: "bg-specialist",
  },
};

export const Voice = ({
  voice,
  name,
  role,
  state,
  posture,
  body,
  children,
  timestamp,
}: Props) => {
  const c = COLORS[voice];
  return (
    <div className={`pl-3 border-l-2 ${c.rule} flex flex-col gap-1`}>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span
          className={`smallcaps text-[10.5px] font-semibold ${c.text}`}
          aria-hidden
        >
          {name}
        </span>
        <span className="text-muted text-[10.5px]">·</span>
        <span className={`smallcaps text-[10.5px] ${c.text}`}>{role}</span>
        {state && (
          <span className="smallcaps text-[10.5px] text-muted">
            ({state})
          </span>
        )}
        {timestamp && (
          <span className="ml-auto text-[10.5px] text-muted">{timestamp}</span>
        )}
      </div>
      {posture && (
        <div className="text-[13.5px] italic text-muted leading-snug">
          {posture}
        </div>
      )}
      {body && (
        <div className="text-[14.5px] leading-snug text-ink whitespace-pre-line break-words [overflow-wrap:anywhere]">
          {body}
        </div>
      )}
      {children}
    </div>
  );
};
