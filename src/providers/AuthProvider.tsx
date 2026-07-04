import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
});

// Garde module : une seule tentative de session invitée par lancement d'app.
let anonBootstrapAttempted = false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!session && !anonBootstrapAttempted) {
          // Guest-first : session anonyme silencieuse au premier lancement.
          anonBootstrapAttempted = true;
          try {
            const { data, error } = await supabase.auth.signInAnonymously();
            if (!error && data.session) {
              setSession(data.session);
              setLoading(false);
              return;
            }
          } catch {
            // Anonyme désactivé / réseau → fallback stack (auth)
          }
        }
        setSession(session);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
