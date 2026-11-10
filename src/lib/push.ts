// Client-side push notification registration. Only meaningful inside Capacitor
// on iOS; on web this is a no-op.
//
// Flow on iOS:
//   1. Request permission (shows the native prompt the first time)
//   2. Register with APNs (Capacitor handles APNs handshake)
//   3. Capacitor's `registration` event fires with the device token
//   4. We upsert it into push_tokens with the correct apns_env

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "./supabase";

// Detect APNs env: production for TestFlight / App Store, sandbox for Xcode
// debug builds. Capacitor doesn't expose this directly — we infer it from
// the build configuration. The cleanest signal is the `aps-environment`
// entitlement on the running app, which Capacitor doesn't surface. For v0
// we assume production unless explicitly flagged otherwise via a build-time
// constant.
const APNS_ENV: "production" | "sandbox" =
  (import.meta.env.VITE_APNS_ENV as "production" | "sandbox") ?? "production";

let registered = false;

// --- Notification taps ---
// Every push carries push_id (count the tap in push_log) and, when it's about
// a thread, thread_id (open that thread). No thread_id — Mira's rundown —
// means open the inbox, where the rundown is; the handler gets null.
// Capacitor retains a tap until a listener attaches, so a tap that
// cold-starts the app still arrives once App subscribes.
let tapListening = false;
let tapHandler: ((threadId: string | null) => void) | null = null;
let pendingTap: { threadId: string | null } | null = null;

export function onPushOpen(handler: (threadId: string | null) => void): () => void {
  tapHandler = handler;
  if (pendingTap) {
    handler(pendingTap.threadId);
    pendingTap = null;
  }
  if (Capacitor.isNativePlatform() && !tapListening) {
    tapListening = true;
    void PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = (action.notification.data ?? {}) as {
        thread_id?: string;
        push_id?: string;
      };
      if (data.push_id) {
        supabase
          .rpc("mark_push_opened", { p_push_id: data.push_id })
          .then(({ error }) => {
            if (error) console.warn("[push] mark_push_opened failed", error.message);
          });
      }
      const threadId = data.thread_id ?? null;
      if (tapHandler) tapHandler(threadId);
      else pendingTap = { threadId };
    });
  }
  return () => {
    if (tapHandler === handler) tapHandler = null;
  };
}

// Visible-on-device diagnostic. Keeps a string in window so the inbox can
// surface push state without Safari Web Inspector. Cleared once we know
// notifications work.
function setPushStatus(s: string) {
  try {
    (window as unknown as { __pushStatus?: string }).__pushStatus = s;
    window.dispatchEvent(new CustomEvent("guildenstern:push-status"));
  } catch {
    /* noop */
  }
}

export function getPushStatus(): string {
  return (
    (window as unknown as { __pushStatus?: string }).__pushStatus ??
    "not started"
  );
}

export async function registerPushIfNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    setPushStatus("web (not native)");
    return;
  }
  if (registered) return;
  registered = true;

  try {
    setPushStatus("requesting permission");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      setPushStatus(`permission ${perm.receive}`);
      return;
    }

    setPushStatus("permission granted, registering");

    await PushNotifications.addListener("registration", async (token) => {
      setPushStatus(`token received (${token.value.slice(0, 8)}…)`);
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        setPushStatus("token received, but no user");
        return;
      }
      const { error } = await supabase
        .from("push_tokens")
        .upsert(
          {
            user_id: user.id,
            token: token.value,
            platform: "ios",
            apns_env: APNS_ENV,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "token" },
        );
      if (error) {
        setPushStatus(`upsert error: ${error.message}`);
      } else {
        setPushStatus("✓ token saved");
      }
    });

    await PushNotifications.addListener("registrationError", (err) => {
      setPushStatus(
        `registrationError: ${typeof err === "string" ? err : JSON.stringify(err)}`,
      );
    });

    await PushNotifications.register();

    // If neither registration nor registrationError fires within 5s,
    // something is silently failing.
    setTimeout(() => {
      const current = getPushStatus();
      if (current === "permission granted, registering") {
        setPushStatus("silent: no registration event after 5s");
      }
    }, 5000);
  } catch (e) {
    setPushStatus(
      `exception: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// "Send me a test rundown" (menu): asks send-rundown for one, as the
// signed-in user. Logged as rundown_test, so it never counts toward the
// experiment. iOS hides pushes while the app is open, so the server answers
// right away and sends about 10 seconds later. Returns what to show.
export async function sendTestRundown(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("send-rundown", { body: {} });
  if (error) throw error;
  const r = data as { outcome: string; variant?: string; body?: string };
  if (r.outcome === "sent" && r.body) {
    return `Close the app now. Arriving in about 10 seconds (${r.variant}): ${r.body}`;
  }
  if (r.outcome === "skipped_nothing") return "Nothing to say right now, so no push.";
  return `No push sent (${r.outcome}).`;
}
