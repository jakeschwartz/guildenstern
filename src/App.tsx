import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PhoneFrame } from "./components/PhoneFrame";
import { Sheet } from "./components/Sheet";
import { ThreadList } from "./views/ThreadList";
import { PartnershipThread } from "./views/PartnershipThread";
import { PersonalThread } from "./views/PersonalThread";
import { Login } from "./views/Login";
import { InvitePartner } from "./views/InvitePartner";
import { JoinPartnership } from "./views/JoinPartnership";
import { OpenSpoke } from "./views/OpenSpoke";
import {
  hydrate,
  seedDevState,
  useStore,
  useHydrateFromSession,
} from "./state/store";
import { useSession, signOut } from "./lib/auth";
import { registerPushIfNative } from "./lib/push";
import { getTheme, toggleTheme } from "./lib/theme";
import { supabase } from "./lib/supabase";
import * as db from "./lib/db";
import {
  connectGoogle,
  getGoogleConnectionStatus,
  subscribeToGoogleTokens,
} from "./lib/google";
import {
  previewState,
  previewStateSolo,
  PREVIEW_PARTNERSHIP_THREAD_ID,
} from "./dev/previewSeed";

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

// Dev preview hash routes. Read once at module init; we seed the store before
// any component mounts so useStore selectors get the mocked data on first render.
const previewHash =
  typeof window !== "undefined" && window.location.hash.startsWith("#preview-")
    ? window.location.hash.slice("#preview-".length)
    : null;

if (previewHash === "ops" || previewHash === "app") {
  seedDevState(previewState);
} else if (previewHash === "inbox-solo") {
  seedDevState(previewStateSolo);
}

// Fully navigable demo shell against seeded data — for screen-share demos.
// Inbox → tap a thread → real working Back button → tap another. No auth,
// no Supabase; the agent won't respond live (seeded data only).
const PreviewApp = () => {
  const threads = useStore((s) => s.threads);
  const currentUserId = useStore((s) => s.currentUserId);
  const [route, setRoute] = useState<Route>({ name: "inbox" });

  const open = (threadId: string) => {
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
      {route.name === "inbox" && (
        <ThreadList
          onOpen={open}
          onNew={() => {}}
          onFilter={() => {}}
          onMenu={() => {}}
        />
      )}
      {route.name === "personal" && (
        <PersonalThread
          threadId={route.threadId}
          onBack={goInbox}
          onOpenThread={open}
        />
      )}
      {route.name === "partnership" && (
        <PartnershipThread threadId={route.threadId} onBack={goInbox} />
      )}
    </Frame>
  );
};

export const App = () => {
  // Hash route: fully navigable demo (inbox ↔ threads, working back button).
  if (previewHash === "app") {
    return <PreviewApp />;
  }
  // Hash route: render the partnership thread against seeded mock data.
  // Bypasses auth + hydration. Useful for UI iteration on this machine
  // without a real Supabase session (or in the Claude preview tool).
  if (previewHash === "ops") {
    return (
      <Frame>
        <PartnershipThread
          threadId={PREVIEW_PARTNERSHIP_THREAD_ID}
          onBack={() => {}}
        />
      </Frame>
    );
  }
  // Hash route: render the inbox with a solo (no-partnership) seed so we can
  // see Mira-only state + the "No partnerships yet" empty hint.
  if (previewHash === "inbox-solo") {
    return (
      <Frame>
        <ThreadList
          onOpen={() => {}}
          onNew={() => {}}
          onFilter={() => {}}
          onMenu={() => {}}
        />
      </Frame>
    );
  }

  const session = useSession();
  useHydrateFromSession(session);
  useEffect(() => {
    if (session && session !== "loading") registerPushIfNative();
  }, [session]);

  const status = useStore((s) => s.status);
  const errorMsg = useStore((s) => s.error);
  const threads = useStore((s) => s.threads);
  const partnerships = useStore((s) => s.partnerships);
  const currentUserId = useStore((s) => s.currentUserId);

  // Poll for partner-joined when we have any partnership with only ourselves
  // in it (i.e. invite sent, not yet redeemed). When the second member shows
  // up, rehydrate so the inbox reflects the new state. Idle when no such
  // partnership exists — costs nothing in steady state.
  const hasPendingInvite = partnerships.some(
    (p) => p.participantIds[1] === currentUserId,
  );
  useEffect(() => {
    if (!hasPendingInvite) return;
    const interval = setInterval(async () => {
      try {
        for (const p of partnerships) {
          const members = await db.getPartnershipMembers(p.id);
          if (members.length >= 2) {
            const { data } = await supabase.auth.getSession();
            if (data.session) await hydrate(data.session);
            return;
          }
        }
      } catch {
        // transient network error; try again next tick
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [hasPendingInvite, partnerships]);

  const [route, setRoute] = useState<Route>({ name: "inbox" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [spokeOpen, setSpokeOpen] = useState(false);
  const [themeIndicator, setThemeIndicator] = useState(getTheme());
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleScopes, setGoogleScopes] = useState<string[]>([]);

  // Load Google connection status on session change; subscribe to realtime
  // so the menu flips from "Connect" → "Connected" the moment the OAuth
  // callback writes the tokens row from the Safari View Controller.
  useEffect(() => {
    if (!session || session === "loading") return;
    let alive = true;
    void getGoogleConnectionStatus().then((s) => {
      if (!alive) return;
      setGoogleConnected(s.connected);
      setGoogleScopes(s.scopes);
    });
    const unsub = subscribeToGoogleTokens((s) => {
      setGoogleConnected(s.connected);
      setGoogleScopes(s.scopes);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [session]);
  // Helper so menu item handlers don't leave a previously-open sheet behind
  // when they open a different one (otherwise three sheets can stack).
  const closeAllSheets = () => {
    setMenuOpen(false);
    setInviteOpen(false);
    setJoinOpen(false);
    setSpokeOpen(false);
  };

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

      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onForceClose={closeAllSheets}
      >
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
                closeAllSheets();
                setInviteOpen(true);
              }}
              className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors"
            >
              <div className="text-[15px] font-semibold text-ink tracking-tight">
                Invite a partner
              </div>
              <div className="text-[12.5px] text-muted mt-0.5">
                Get a code to share
              </div>
            </button>
          </li>
          <li>
            <button
              onClick={() => {
                closeAllSheets();
                setJoinOpen(true);
              }}
              className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors"
            >
              <div className="text-[15px] font-semibold text-ink tracking-tight">
                Enter an invite code
              </div>
              <div className="text-[12.5px] text-muted mt-0.5">
                Join a partnership with someone else's code
              </div>
            </button>
          </li>
          {partnerships.length > 0 && (
            <li>
              <button
                onClick={() => {
                  closeAllSheets();
                  setSpokeOpen(true);
                }}
                className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors"
              >
                <div className="text-[15px] font-semibold text-ink tracking-tight">
                  Open a focused thread
                </div>
                <div className="text-[12.5px] text-muted mt-0.5">
                  Side channel for one topic
                </div>
              </button>
            </li>
          )}
          <li>
            <button
              onClick={() => {
                setMenuOpen(false);
                void connectGoogle(["calendar.readonly"]);
              }}
              className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors flex items-center justify-between gap-3"
            >
              <div>
                <div className="text-[15px] font-semibold text-ink tracking-tight">
                  Google Calendar
                </div>
                <div className="text-[12.5px] text-muted mt-0.5">
                  {googleConnected
                    ? googleScopes.some((s) =>
                        s.includes("calendar.readonly"),
                      )
                      ? "Connected"
                      : "Reconnect to add Calendar scope"
                    : "Connect to surface events"}
                </div>
              </div>
              <span className="text-[12px] text-otis">
                {googleConnected &&
                googleScopes.some((s) => s.includes("calendar.readonly"))
                  ? "✓"
                  : "→"}
              </span>
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

      <Sheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onForceClose={closeAllSheets}
      >
        <InvitePartner onClose={closeAllSheets} />
      </Sheet>

      <Sheet
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onForceClose={closeAllSheets}
      >
        <JoinPartnership variant="sheet" onDone={closeAllSheets} />
      </Sheet>

      <Sheet
        open={spokeOpen}
        onClose={() => setSpokeOpen(false)}
        onForceClose={closeAllSheets}
      >
        <OpenSpoke
          partnershipId={partnerships[0]?.id ?? ""}
          onCreated={(threadId) => {
            setRoute({ name: "partnership", threadId });
            closeAllSheets();
          }}
          onCancel={closeAllSheets}
        />
      </Sheet>
    </Frame>
  );
};
