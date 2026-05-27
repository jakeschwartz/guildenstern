import { useState } from "react";
import { PhoneFrame } from "./components/PhoneFrame";
import { UserSwitcher } from "./components/UserSwitcher";
import { Sheet } from "./components/Sheet";
import { ThreadList } from "./views/ThreadList";
import { GroupThread } from "./views/GroupThread";
import { Spoke } from "./views/Spoke";
import { RelationshipThread } from "./views/RelationshipThread";
import { PartnershipThread } from "./views/PartnershipThread";
import { ArbitrationThread } from "./views/ArbitrationThread";
import { ArbitrationSpoke } from "./views/ArbitrationSpoke";
import { PersonalThread } from "./views/PersonalThread";
import { ConnectShow } from "./views/ConnectShow";
import { ConnectScan } from "./views/ConnectScan";
import { ReviewNewContacts } from "./views/ReviewNewContacts";
import { useHydratedReset, useStore } from "./state/store";

type Route =
  | { name: "home" }
  | { name: "threads" }
  | { name: "thread"; threadId: string }
  | { name: "spoke"; threadId: string }
  | { name: "vent-spoke"; threadId: string }
  | { name: "connect-show" }
  | { name: "connect-scan" }
  | { name: "review-new" };

type ThreadRouteProps = {
  threadId: string;
  onBack: () => void;
  onOpenSpoke: () => void;
  onOpenVentSpoke: () => void;
  onOpenReviewNew: () => void;
  onOpenThread: (threadId: string) => void;
};

const ThreadRoute = ({
  threadId,
  onBack,
  onOpenSpoke,
  onOpenVentSpoke,
  onOpenReviewNew,
  onOpenThread,
}: ThreadRouteProps) => {
  const thread = useStore((s) => s.threads.find((t) => t.id === threadId));
  if (!thread) {
    return (
      <div className="p-6 text-muted">
        Thread not found.{" "}
        <button onClick={onBack} className="underline">
          Back
        </button>
      </div>
    );
  }
  if (thread.kind === "personal") {
    return (
      <PersonalThread
        threadId={threadId}
        onBack={onBack}
        onReviewNew={onOpenReviewNew}
        onOpenThread={onOpenThread}
      />
    );
  }
  if (thread.kind === "group") {
    return (
      <GroupThread
        threadId={threadId}
        onBack={onBack}
        onOpenSpoke={onOpenSpoke}
      />
    );
  }
  if (thread.kind === "partnership") {
    return <PartnershipThread threadId={threadId} onBack={onBack} />;
  }
  if (thread.kind === "arbitration") {
    return (
      <ArbitrationThread
        threadId={threadId}
        onBack={onBack}
        onOpenSpoke={onOpenVentSpoke}
      />
    );
  }
  return <RelationshipThread threadId={threadId} onBack={onBack} />;
};

export const App = () => {
  useHydratedReset();
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [menuView, setMenuView] = useState<"closed" | "menu" | "connect">(
    "closed",
  );
  const currentUserId = useStore((s) => s.currentUserId);
  const personalThreadId = useStore(
    (s) =>
      s.threads.find(
        (t) => t.kind === "personal" && t.ownerId === currentUserId,
      )?.id,
  );

  const goHome = () => setRoute({ name: "home" });
  const openThread = (threadId: string) =>
    setRoute({ name: "thread", threadId });

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-center gap-5 py-6">
      <PhoneFrame>
        {route.name === "home" && personalThreadId && (
          <PersonalThread
            threadId={personalThreadId}
            onBack={() => setRoute({ name: "threads" })}
            onReviewNew={() => setRoute({ name: "review-new" })}
            onOpenThread={openThread}
          />
        )}
        {route.name === "threads" && (
          <ThreadList
            onOpen={openThread}
            onBack={goHome}
          />
        )}
        {route.name === "connect-show" && (
          <ConnectShow onBack={goHome} />
        )}
        {route.name === "connect-scan" && (
          <ConnectScan
            onBack={goHome}
            onOpenThread={openThread}
          />
        )}
        {route.name === "review-new" && (
          <ReviewNewContacts
            onBack={goHome}
            onOpenThread={openThread}
          />
        )}
        {route.name === "thread" && (
          <ThreadRoute
            threadId={route.threadId}
            onBack={goHome}
            onOpenSpoke={() =>
              setRoute({ name: "spoke", threadId: route.threadId })
            }
            onOpenVentSpoke={() =>
              setRoute({ name: "vent-spoke", threadId: route.threadId })
            }
            onOpenReviewNew={() => setRoute({ name: "review-new" })}
            onOpenThread={openThread}
          />
        )}
        {route.name === "spoke" && (
          <Spoke
            threadId={route.threadId}
            onBack={() =>
              setRoute({ name: "thread", threadId: route.threadId })
            }
          />
        )}
        {route.name === "vent-spoke" && (
          <ArbitrationSpoke
            threadId={route.threadId}
            onBack={() =>
              setRoute({ name: "thread", threadId: route.threadId })
            }
          />
        )}

        {/* Global hamburger menu */}
        <button
          onClick={() => setMenuView("menu")}
          aria-label="Menu"
          className="absolute bottom-4 right-4 z-20 h-12 w-12 rounded-full bg-ink text-paper shadow-[0_6px_20px_-4px_rgba(0,0,0,0.65)] flex items-center justify-center hover:opacity-90 transition-opacity"
        >
          <span className="flex flex-col gap-[3px]">
            <span className="block w-[16px] h-[1.5px] bg-current rounded-full" />
            <span className="block w-[16px] h-[1.5px] bg-current rounded-full" />
            <span className="block w-[16px] h-[1.5px] bg-current rounded-full" />
          </span>
        </button>

        <Sheet
          open={menuView !== "closed"}
          onClose={() => setMenuView("closed")}
          title={menuView === "connect" ? "Connect" : undefined}
        >
          {menuView === "menu" && (
            <ul className="divide-y divide-rule border-y border-rule -mx-5">
              <li>
                <button
                  onClick={() => {
                    setMenuView("closed");
                    setRoute({ name: "threads" });
                  }}
                  className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-[15px] font-semibold text-ink tracking-tight">
                      All threads
                    </div>
                    <div className="text-[12.5px] text-muted mt-0.5">
                      The full inbox
                    </div>
                  </div>
                  <span className="text-muted text-[14px]">›</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => setMenuView("connect")}
                  className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-[15px] font-semibold text-ink tracking-tight">
                      Connect
                    </div>
                    <div className="text-[12.5px] text-muted mt-0.5">
                      Open a thread with someone you just met
                    </div>
                  </div>
                  <span className="text-muted text-[14px]">›</span>
                </button>
              </li>
            </ul>
          )}
          {menuView === "connect" && (
            <>
              <div className="text-[13px] text-muted mb-4 leading-relaxed">
                Show your code, or scan theirs. Either way opens a thread
                between your agents.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setMenuView("closed");
                    setRoute({ name: "connect-show" });
                  }}
                  className="aspect-square rounded-2xl border border-rule bg-card hover:bg-card/60 flex flex-col items-center justify-center gap-2 transition-colors"
                >
                  <span className="text-[24px] leading-none">▢</span>
                  <span className="text-[14px] font-semibold text-ink">
                    My code
                  </span>
                </button>
                <button
                  onClick={() => {
                    setMenuView("closed");
                    setRoute({ name: "connect-scan" });
                  }}
                  className="aspect-square rounded-2xl border border-rule bg-card hover:bg-card/60 flex flex-col items-center justify-center gap-2 transition-colors"
                >
                  <span className="text-[24px] leading-none">⌖</span>
                  <span className="text-[14px] font-semibold text-ink">
                    Scan a code
                  </span>
                </button>
              </div>
            </>
          )}
        </Sheet>
      </PhoneFrame>
      <UserSwitcher />
    </div>
  );
};
