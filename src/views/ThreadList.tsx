// v4 Inbox per spec §5. Mira pinned at the top (plum tint + plum dot +
// PINNED). Group/partnership threads with squircle avatars, no chevron,
// pending dot when something needs you.

import { useStore } from "../state/store";
import type { PartnershipThread, PersonalThread, User } from "../types";
import { formatRelative } from "../lib/time";
import { InboxHeader } from "../components/InboxHeader";
import { ListRow } from "../components/ListRow";

type Props = {
  onOpen: (threadId: string) => void;
  onNew?: () => void;
  onFilter?: () => void;
  onMenu?: () => void;
};

const lastActivity = (t: PartnershipThread | PersonalThread): number => {
  const m = t.messages[t.messages.length - 1];
  return m?.createdAt ?? t.createdAt;
};

const previewText = (
  t: PartnershipThread | PersonalThread,
  usersById: Map<string, User>,
): string => {
  const m = t.messages[t.messages.length - 1];
  if (!m) return "Quiet";
  if (m.author.kind === "agent") return m.body.split("\n")[0]!;
  const name = usersById.get(m.author.userId)?.name ?? "—";
  return `${name}: ${m.body}`;
};

export const ThreadList = ({ onOpen, onNew, onFilter, onMenu }: Props) => {
  const threads = useStore((s) => s.threads);
  const partnerships = useStore((s) => s.partnerships);
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const usersById = new Map(users.map((u) => [u.id, u]));

  const partnerNameFor = (partnershipId: string): string | null => {
    const p = partnerships.find((pp) => pp.id === partnershipId);
    if (!p) return null;
    const partnerId =
      p.participantIds[0] === currentUserId
        ? p.participantIds[1]
        : p.participantIds[0];
    return usersById.get(partnerId)?.name ?? null;
  };

  const personalThread = threads.find(
    (t): t is PersonalThread =>
      t.kind === "personal" && t.ownerId === currentUserId,
  );

  const partnershipThreads = threads
    .filter((t): t is PartnershipThread => t.kind === "partnership")
    .sort((a, b) => lastActivity(b) - lastActivity(a));

  return (
    <div className="flex flex-col h-full">
      <InboxHeader onFilter={onFilter} onNew={onNew} onMenu={onMenu} />

      <div className="flex-1 overflow-y-auto">
        {personalThread && (
          <ListRow
            initials="M"
            title="Mira"
            preview={previewText(personalThread, usersById)}
            timestamp={formatRelative(lastActivity(personalThread))}
            pinned
            voice="mira"
            onOpen={() => onOpen(personalThread.id)}
          />
        )}
        {partnershipThreads.map((t) => {
          const partnerName = partnerNameFor(t.partnershipId);
          const partner = partnerships.find((p) => p.id === t.partnershipId);
          const partnerId =
            partner?.participantIds[0] === currentUserId
              ? partner.participantIds[1]
              : partner?.participantIds[0];
          const partnerProfile = partnerId
            ? usersById.get(partnerId)
            : undefined;
          const yours = t.opsCards.filter(
            (c) => c.status === "pending" && c.owner === currentUserId,
          ).length;
          return (
            <ListRow
              key={t.id}
              initials={partnerProfile?.initials ?? "·"}
              title={partnerName ?? t.title}
              preview={previewText(t, usersById)}
              timestamp={formatRelative(lastActivity(t))}
              pending={yours > 0}
              onOpen={() => onOpen(t.id)}
            />
          );
        })}
        {partnershipThreads.length === 0 && !personalThread && (
          <div className="px-5 py-10 text-center text-[12.5px] text-muted">
            No threads yet.
          </div>
        )}
      </div>
    </div>
  );
};
