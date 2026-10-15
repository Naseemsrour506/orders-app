import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { rpc } from "./api";
import type { Me } from "./types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  join: (token: string) => Promise<Me>;
}

const Ctx = createContext<AuthState | null>(null);
const CACHE = "orders-me";

function cachedMe(): Me | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? "null");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(cachedMe);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const store = (m: Me | null) => {
    setMe(m);
    try {
      if (m) localStorage.setItem(CACHE, JSON.stringify(m));
      else localStorage.removeItem(CACHE);
    } catch {
      /* מצב פרטי */
    }
  };

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        store(null);
        return;
      }
      store(await rpc<Me | null>("whoami"));
    } catch (e) {
      // בלי קליטה ממשיכים עם מה שנשמר בטלפון.
      if (navigator.onLine) setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const join = useCallback(async (token: string) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw new Error(error.message);
    }
    const m = await rpc<Me>("claim_invite", { p_token: token });
    store(m);
    return m;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ me, loading, error, refresh, join }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}

/** המשתמש המחובר. נקרא רק במסכים שמוצגים אחרי כניסה. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error("not signed in");
  return me;
}
