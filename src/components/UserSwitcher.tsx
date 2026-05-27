import { setCurrentUser, useStore } from "../state/store";

export const UserSwitcher = () => {
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const currentName =
    users.find((u) => u.id === currentUserId)?.name ?? "—";
  return (
    <div className="flex items-center gap-3 text-muted">
      <span className="text-[11px] tracking-wide">
        Simulate · viewing as{" "}
        <span className="text-ink font-medium">{currentName}</span>
      </span>
      <div className="flex items-center gap-1 bg-card ring-1 ring-rule rounded-full px-1 py-1">
        {users.map((u) => {
          const active = u.id === currentUserId;
          return (
            <button
              key={u.id}
              onClick={() => setCurrentUser(u.id)}
              title={u.name}
              className={`h-7 w-7 rounded-full text-[10.5px] font-medium uppercase tracking-wide flex items-center justify-center transition-colors ${
                active ? "bg-ink text-paper" : "text-muted hover:text-ink"
              }`}
            >
              {u.initials}
            </button>
          );
        })}
      </div>
    </div>
  );
};
