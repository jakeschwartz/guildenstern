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

export async function registerPushIfNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (registered) return;
  registered = true;

  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      console.warn("[guildenstern] push permission denied:", perm.receive);
      return;
    }

    // When the token arrives, upsert it into push_tokens.
    await PushNotifications.addListener("registration", async (token) => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
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
        console.error("[guildenstern] failed to save push token", error);
      } else {
        console.log("[guildenstern] push token saved");
      }
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.error("[guildenstern] push registrationError", err);
    });

    await PushNotifications.register();
  } catch (e) {
    console.error("[guildenstern] push registration failed", e);
  }
}
