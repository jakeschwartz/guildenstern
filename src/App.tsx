import { useState } from "react";
import { PhoneFrame } from "./components/PhoneFrame";
import { UserSwitcher } from "./components/UserSwitcher";
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
};

const ThreadRoute = ({
  threadId,
  onBack,
  onOpenSpoke,
  onOpenVentSpoke,
  onOpenReviewNew,
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
  const [route, setRoute] = useState<Route>({ name: "threads" });

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-center gap-5 py-6">
      <PhoneFrame>
        {route.name === "threads" && (
          <ThreadList
            onOpen={(threadId) => setRoute({ name: "thread", threadId })}
            onShowMyCode={() => setRoute({ name: "connect-show" })}
            onScan={() => setRoute({ name: "connect-scan" })}
          />
        )}
        {route.name === "connect-show" && (
          <ConnectShow onBack={() => setRoute({ name: "threads" })} />
        )}
        {route.name === "connect-scan" && (
          <ConnectScan
            onBack={() => setRoute({ name: "threads" })}
            onOpenThread={(threadId) => setRoute({ name: "thread", threadId })}
          />
        )}
        {route.name === "review-new" && (
          <ReviewNewContacts
            onBack={() => setRoute({ name: "threads" })}
            onOpenThread={(threadId) => setRoute({ name: "thread", threadId })}
          />
        )}
        {route.name === "thread" && (
          <ThreadRoute
            threadId={route.threadId}
            onBack={() => setRoute({ name: "threads" })}
            onOpenSpoke={() =>
              setRoute({ name: "spoke", threadId: route.threadId })
            }
            onOpenVentSpoke={() =>
              setRoute({ name: "vent-spoke", threadId: route.threadId })
            }
            onOpenReviewNew={() => setRoute({ name: "review-new" })}
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
      </PhoneFrame>
      <UserSwitcher />
    </div>
  );
};
