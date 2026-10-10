import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { api, loadToken, setToken, setUnauthorizedHandler } from "@/src/api";
import { queryClient } from "@/src/query-client";
import type { UserOut } from "@/src/types";

interface AuthState {
  user: UserOut | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    (async () => {
      const t = await loadToken();
      if (t) {
        try {
          setUser(await api.me());
        } catch {
          await setToken(null);
        }
      }
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login(email.trim().toLowerCase(), password);
    await setToken(res.access_token);
    setUser(res.user);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const res = await api.register(name.trim(), email.trim().toLowerCase(), password);
    await setToken(res.access_token);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await setToken(null);
    queryClient.clear();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, ready, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
