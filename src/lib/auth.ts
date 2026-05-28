// Auth helpers wrapping Supabase. The session is reactive — components use
// useSession() to get the current session and re-render on sign in/out.
//
// On web: browser OAuth redirect via Supabase + Services ID.
// On native iOS (inside Capacitor): Apple's native Sign in with Apple sheet
// via the community plugin; we exchange the identity token with Supabase via
// signInWithIdToken().

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import { supabase } from "./supabase";

const APPLE_BUNDLE_ID = "com.jakeschwartz.guildenstern";
const SUPABASE_CALLBACK =
  "https://psthqrdqggqgekqbansb.supabase.co/auth/v1/callback";

export const useSession = (): Session | null | "loading" => {
  const [session, setSession] = useState<Session | null | "loading">("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return session;
};

export async function signInWithApple(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Native iOS path: Apple's sheet, identity token, hand to Supabase.
    const res = await SignInWithApple.authorize({
      clientId: APPLE_BUNDLE_ID,
      redirectURI: SUPABASE_CALLBACK,
      scopes: "email name",
      state: "init",
      nonce: crypto.randomUUID(),
    });
    const idToken = res.response.identityToken;
    if (!idToken) throw new Error("Apple returned no identity token");
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: idToken,
    });
    if (error) throw error;
    return;
  }

  // Web path: full-page OAuth redirect via Supabase + Services ID.
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
