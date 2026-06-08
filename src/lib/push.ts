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
