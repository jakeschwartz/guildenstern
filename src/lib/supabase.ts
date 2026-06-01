import { createClient } from "@supabase/supabase-js";

// Falls back to placeholders when env is missing so the bundle loads cleanly
// in dev-preview / sketch contexts that don't need a real backend. Any actual
// API call against placeholder creds will fail loudly at request time — that
// failure is appropriate; what we want to avoid is a module-load throw that
// blanks the whole page when you just wanted to look at the UI.
const url = import.meta.env.VITE_SUPABASE_URL ?? "http://localhost:54321";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "dev-placeholder";

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn(
    "[guildenstern] VITE_SUPABASE_URL not set — running with placeholder creds. Auth + DB calls will fail. Use #preview-* hash routes for UI iteration without a backend.",
  );
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
