import { useEffect, useState } from "react";
import { PhoneFrame } from "./components/PhoneFrame";
import { Sheet } from "./components/Sheet";
import { ThreadList } from "./views/ThreadList";
import { PartnershipThread } from "./views/PartnershipThread";
import { PersonalThread } from "./views/PersonalThread";
import { Login } from "./views/Login";
import { Onboarding } from "./views/Onboarding";
import { useStore, useHydrateFromSession } from "./state/store";
import { useSession, signOut } from "./lib/auth";
import { registerPushIfNative } from "./lib/push";

type Route =
  | { name: "home" }
  | { name: "threads" }
  | { name: "thread"; threadId: string };

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-full w-full flex items-center justify-center py-6">
    <PhoneFrame>{children}</PhoneFrame>
  </div>
);

export const App = () => {
  const session = useSession();
  useHydrateFromSession(session);
  useEffect(() => {
    if (session && session !== "loading") {
      registerPushIfNative();
    }
  }, [session]);
  const status = useStore((s) => s.status);
  const errorMsg = useStore((s) => s.error);
  const currentUserId = useStore((s) => s.currentUserId);
  const personalThreadId = useStore(
    (s) =>
      s.threads.find(
        (t) => t.kind === "personal" && t.ownerId === currentUserId,
      )?.id,
  );
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [menuOpen, setMenuOpen] = useState(false);

  // ---- gate: auth ----
  if (session === "loading") {
    return <Frame><div className="h-full w-full" /></Frame>;
  }
  if (session === null) {
    return <Frame><Login /></Frame>;
  }

  // ---- gate: store hydration ----
  if (status === "idle" || status === "loading") {
    return (
      <Frame>
        <div className="h-full w-full flex items-center justify-center text-[12.5px] text-muted">
          Loading…
        </div>
      </Frame>
    );
  }
  if (status === "error") {
    return (
      <Frame>
        <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center gap-3">
          <div className="text-[13px] text-attention">Something went wrong</div>
          {errorMsg && (
            <pre className="text-[11px] text-muted whitespace-pre-wrap max-w-full overflow-auto">
              {errorMsg}
            </pre>
          )}
          <button
            onClick={() => signOut()}
            className="text-[12.5px] text-muted underline"
          >
            Sign out and try again
          </button>
        </div>
      </Frame>
    );
  }

  // ---- gate: needs partnership ----
  if (status === "no_partnership") {
    return <Frame><Onboarding /></Frame>;
  }

  // ---- main app ----
  const goHome = () => setRoute({ name: "home" });
  const openThread = (threadId: string) =>
    setRoute({ name: "thread", threadId });

  return (
    <Frame>
      {route.name === "home" && personalThreadId && (
        <PersonalThread
          threadId={personalThreadId}
          onBack={() => setRoute({ name: "threads" })}
          onReviewNew={() => {}}
          onOpenThread={openThread}
        />
      )}
      {route.name === "threads" && (
        <ThreadList onOpen={openThread} onBack={goHome} />
      )}
      {route.name === "thread" && (
        <PartnershipThread threadId={route.threadId} onBack={goHome} />
      )}

      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Menu"
        className="absolute bottom-4 right-4 z-20 h-12 w-12 rounded-full bg-ink text-paper shadow-[0_6px_20px_-4px_rgba(0,0,0,0.65)] flex items-center justify-center hover:opacity-90 transition-opacity"
      >
        <span className="flex flex-col gap-[3px]">
          <span className="block w-[16px] h-[1.5px] bg-current rounded-full" />
          <span className="block w-[16px] h-[1.5px] bg-current rounded-full" />
          <span className="block w-[16px] h-[1.5px] bg-current rounded-full" />
        </span>
      </button>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <ul className="divide-y divide-rule border-y border-rule -mx-5">
          <li>
            <button
              onClick={() => {
                setMenuOpen(false);
                setRoute({ name: "threads" });
              }}
              className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors"
            >
              <div className="text-[15px] font-semibold text-ink tracking-tight">
                All threads
              </div>
              <div className="text-[12.5px] text-muted mt-0.5">
                The full inbox
              </div>
            </button>
          </li>
          <li>
            <button
              onClick={() => {
                setMenuOpen(false);
                signOut();
              }}
              className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors"
            >
              <div className="text-[15px] font-semibold text-ink tracking-tight">
                Sign out
              </div>
            </button>
          </li>
        </ul>
      </Sheet>
    </Frame>
  );
};
