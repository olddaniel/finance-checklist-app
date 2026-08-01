import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

// session === undefined → still resolving; null → signed out; object → signed in
export function useAuth() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession()
      .then(({ data }) => { if (alive) setSession(data.session ?? null); })
      .catch(() => { if (alive) setSession(null); });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (alive) setSession(next ?? null);
    });

    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  return session;
}
