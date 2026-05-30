import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PhoneFrame } from "./components/PhoneFrame";
import { DebugOverlay } from "./components/DebugOverlay";
import { Sheet } from "./components/Sheet";
import { ThreadList } from "./views/ThreadList";
import { PartnershipThread } from "./views/PartnershipThread";
import { PersonalThread } from "./views/PersonalThread";
import { Login } from "./views/Login";
import { Onboarding } from "./views/Onboarding";
import { useStore, useHydrateFromSession } from "./state/store";
import { useSession, signOut } from "./lib/auth";
import { registerPushIfNative } from "./lib/push";
import { getTheme, toggleTheme } from "./lib/theme";

// Home is now the inbox per v4 spec §0. Tapping into Mira's pinned row opens
// the personal thread; tapping a partnership row opens that.

type Route =
  | { name: "inbox" }
  | { name: "personal"; threadId: string }
  | { name: "partnership"; threadId: string };

// On native: zero outer padding, app fills the device. On web: center the
// 393x760 phone-shaped frame on the page for desktop preview.
const Frame = ({ children }: { children: React.ReactNode }) => {
  if (Capacitor.isNativePlatform()) {
    return <PhoneFrame>{children}</PhoneFrame>;
  }
  return (
    <div className="min-h-full w-full flex items-center justify-center py-6">
      <PhoneFrame>{children}</PhoneFrame>
    </div>
  );
};

export const App = () => {
  const session = useSession();
  useHydrateFromSession(session);
  useEffect(() => {
    if (session && session !== "loading") registerPushIfNative();
  }, [session]);

  const status = useStore((s) => s.status);
  const errorMsg = useStore((s) => s.error);
  const threads = useStore((s) => s.threads);
  const currentUserId = useStore((s) => s.currentUserId);

  const [route, setRoute] = useState<Route>({ name: "inbox" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeIndicator, setThemeIndicator] = useState(getTheme());

  // --- gates ---
  if (session === "loading") {
    return <Frame><div className="h-full w-full" /></Frame>;
  }
  if (session === null) {
    return <Frame><Login /></Frame>;
  }
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
  if (status === "no_partnership") {
    return <Frame><Onboarding /></Frame>;
  }

  // --- main routing ---
  const openThread = (threadId: string) => {
    const t = threads.find((tt) => tt.id === threadId);
    if (!t) return;
    if (t.kind === "personal" && t.ownerId === currentUserId) {
      setRoute({ name: "personal", threadId });
    } else if (t.kind === "partnership") {
      setRoute({ name: "partnership", threadId });
    }
  };
  const goInbox = () => setRoute({ name: "inbox" });

  return (
    <Frame>
      <DebugOverlay />
      {route.name === "inbox" && (
        <ThreadList
          onOpen={openThread}
          onNew={() => {}}
          onFilter={() => {}}
          onMenu={() => setMenuOpen(true)}
        />
      )}
      {route.name === "personal" && (
        <PersonalThread
          threadId={route.threadId}
          onBack={goInbox}
          onOpenThread={openThread}
        />
      )}
      {route.name === "partnership" && (
        <PartnershipThread threadId={route.threadId} onBack={goInbox} />
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <ul className="divide-y divide-rule border-y border-rule -mx-5">
          <li>
            <button
              onClick={() => {
                setMenuOpen(false);
                setRoute({ name: "inbox" });
              }}
              className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors"
            >
              <div className="text-[15px] font-semibold text-ink tracking-tight">
                Inbox
              </div>
            </button>
          </li>
          <li>
            <button
              onClick={() => {
                setThemeIndicator(toggleTheme());
              }}
              className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors flex items-center justify-between gap-3"
            >
              <div>
                <div className="text-[15px] font-semibold text-ink tracking-tight">
                  Theme
                </div>
                <div className="text-[12.5px] text-muted mt-0.5">
                  Currently {themeIndicator}
                </div>
              </div>
              <span className="text-[12px] text-muted">
                {themeIndicator === "dark" ? "→ light" : "→ dark"}
              </span>
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
