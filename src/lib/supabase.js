import { createClient } from "@supabase/supabase-js";

// The publishable key is meant to ship in the client bundle — row level security
// on every table is what actually protects the data, not the secrecy of this key.
export const SUPABASE_URL = "https://nvclbavggphskqvpwylm.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_538-rt-agq2IHavy6DKYSA_cuKCL4QE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Signing in on one device should not disturb the other; keep this separate
    // from the app's own storage key.
    storageKey: "finance-tracker-auth",
  },
});
