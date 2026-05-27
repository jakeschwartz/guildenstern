import type { Reaction, User } from "../types";

const KIND_TONE: Record<Reaction["kind"], string> = {
  agreed: "text-agent",
  "not-quite": "text-attention",
  "sitting-with": "text-muted",
};

const KIND_DOT: Record<Reaction["kind"], string> = {
  agreed: "bg-agent",
  "not-quite": "bg-attention",
  "sitting-with": "bg-muted",
};

const KIND_LABEL: Record<Reaction["kind"], string> = {
  agreed: "agreed",
  "not-quite": "not quite",
  "sitting-with": "sitting with this",
};

type Props = {
  reactions: Reaction[];
  usersById: Map<string, User>;
};

export const ReactionStrip = ({ reactions, usersById }: Props) => {
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {reactions.map((r, i) => {
        const name = usersById.get(r.userId)?.name ?? "—";
        return (
          <span
            key={`${r.userId}-${i}`}
            className={`flex items-center gap-1.5 text-[11px] ${KIND_TONE[r.kind]}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${KIND_DOT[r.kind]}`}
            />
            <span>
              {name} {KIND_LABEL[r.kind]}
            </span>
          </span>
        );
      })}
    </div>
  );
};
