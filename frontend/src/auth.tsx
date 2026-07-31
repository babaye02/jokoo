import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY, User, setAuthToken } from "@/src/api";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signInWithOtp: (phone: string, code: string) => Promise<User>;
  requestOtp: (phone: string) => Promise<{ ok: boolean; otp_dev_only?: string }>;
  signUp: (payload: { email: string; password: string; name: string; role: "client" | "prestataire"; phone?: string; city?: string }) => Promise<User>;
  signInWithApple: (identityToken: string, name?: string, email?: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const t = await storage.secureGet<string>(TOKEN_KEY, "");
    if (t) {
      setToken(t);
      setAuthToken(t); // sync in-memory cache utilisé par api.ts pour toutes les requêtes
      try {
        const me = await api.get<User>("/auth/me");
        setUser(me);
      } catch {
        await storage.secureRemove(TOKEN_KEY);
        setToken(null);
        setAuthToken(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const signIn = async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: User }>("/auth/login", { email, password }, false);
    setAuthToken(r.token); // 1) sync immédiat en mémoire (évite race avec SecureStore)
    await storage.secureSet(TOKEN_KEY, r.token); // 2) persistance
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const signInWithOtp = async (phone: string, code: string) => {
    const r = await api.post<{ token: string; user: User }>("/auth/otp/verify", { phone, code }, false);
    setAuthToken(r.token);
    await storage.secureSet(TOKEN_KEY, r.token);
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const requestOtp = async (phone: string) => {
    return api.post<{ ok: boolean; otp_dev_only?: string }>("/auth/otp/request", { phone }, false);
  };

  const signUp = async (payload: any) => {
    const r = await api.post<{ token: string; user: User }>("/auth/register", payload, false);
    setAuthToken(r.token);
    await storage.secureSet(TOKEN_KEY, r.token);
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const signInWithApple = async (identityToken: string, name?: string, email?: string) => {
    const r = await api.post<{ token: string; user: User }>("/auth/apple", {
      identity_token: identityToken,
      name: name || null,
      email: email || null,
    }, false);
    setAuthToken(r.token);
    await storage.secureSet(TOKEN_KEY, r.token);
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const signOut = async () => {
    setAuthToken(null);
    await storage.secureRemove(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const refresh = async () => {
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch {}
  };

  return (
    <Ctx.Provider value={{ user, token, loading, signIn, signInWithOtp, requestOtp, signUp, signInWithApple, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
