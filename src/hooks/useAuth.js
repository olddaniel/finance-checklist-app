import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

// A recovery link arrives as #access_token=…&type=recovery. supabase-js consumes
// the hash while it initialises, which can happen before the listener below is
// attached, so the link is also read straight from the URL.
function openedFromRecoveryLink() {
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("type") === "recovery") return true;
    return new URLSearchParams(window.location.search).get("type") === "recovery";
  } catch {
    return false;
  }
}

/**
 * session === undefined → still resolving; null → signed out; object → signed in.
 *
 * `recovering` is true from the moment a recovery link is opened until the new
 * password is saved. It matters because that link signs the person in: without
 * it the app would drop straight into the data and never ask for the password
 * they came to change.
 */
export function useAuth() {
  const [session, setSession] = useState(undefined);
  const [recovering, setRecovering] = useState(openedFromRecoveryLink);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession()
      .then(({ data }) => { if (alive) setSession(data.session ?? null); })
      .catch(() => { if (alive) setSession(null); });

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
      setSession(next ?? null);
    });

    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  const endRecovery = useCallback(() => setRecovering(false), []);

  return { session, recovering, endRecovery };
}
