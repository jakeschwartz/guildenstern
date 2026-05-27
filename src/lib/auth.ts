// Auth helpers wrapping Supabase. The session is reactive — components use
// useSession() to get the current session and re-render on sign in/out.

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

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
  // Web-based OAuth flow. On native iOS this will be replaced with the
  // Capacitor Sign in with Apple plugin (signInWithIdToken) once we add
  // the iOS platform — see TODO in src/views/Login.tsx.
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
