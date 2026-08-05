import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY, User, setAuthToken } from "@/src/api";
import { registerForPush } from "@/src/push/register";
import { clearAmbassadorCache } from "@/src/hooks/useAmbassadorStatus";

// Clé SecureStore commune (miroir de app/invite/[code].tsx pour éviter cycle d'import)
const REFERRAL_STORAGE_KEY = "jokoo_referral_code";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signInWithOtp: (phone: string, code: string) => Promise<User>;
  requestOtp: (phone: string) => Promise<{ ok: boolean; otp_dev_only?: string }>;
  signUp: (payload: { email: string; password: string; name: string; role: "client" | "prestataire"; phone?: string; city?: string; referral_code?: string }) => Promise<User>;
  signInWithApple: (identityToken: string, name?: string, email?: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  switchRole: () => Promise<User>;
  activateRole: (role: "client" | "prestataire") => Promise<User>;
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

  // Register push token on every successful login / restored session.
  // registerForPush est idempotent + safe sur web (retourne "unsupported").
  useEffect(() => {
    if (!user?.id) return;
    registerForPush(user.id).catch(() => {});
  }, [user?.id]);

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
    // Injecte automatiquement le code de parrainage stocké depuis le deep link
    // (`/invite/[code]`), si aucun n'est déjà fourni dans le payload.
    if (!payload?.referral_code) {
      try {
        const stored = await storage.secureGet<string>(REFERRAL_STORAGE_KEY, "");
        if (stored) payload.referral_code = stored;
      } catch {}
    }
    const r = await api.post<{ token: string; user: User }>("/auth/register", payload, false);
    setAuthToken(r.token);
    await storage.secureSet(TOKEN_KEY, r.token);
    setToken(r.token);
    setUser(r.user);
    // Consomme le code de parrainage — évite un double rattachement futur
    try {
      await storage.secureRemove(REFERRAL_STORAGE_KEY);
    } catch {}
    return r.user;
  };

  const signInWithApple = async (identityToken: string, name?: string, email?: string) => {
    // Récupère le code de parrainage en attente pour le passer à l'API
    let referral_code: string | undefined;
    try {
      const stored = await storage.secureGet<string>(REFERRAL_STORAGE_KEY, "");
      if (stored) referral_code = stored;
    } catch {}
    const r = await api.post<{ token: string; user: User }>("/auth/apple", {
      identity_token: identityToken,
      name: name || null,
      email: email || null,
      referral_code,
    }, false);
    setAuthToken(r.token);
    await storage.secureSet(TOKEN_KEY, r.token);
    setToken(r.token);
    setUser(r.user);
    // Purge le code une fois utilisé (empêche re-attach futur silencieux)
    if (referral_code) {
      try { await storage.secureRemove(REFERRAL_STORAGE_KEY); } catch {}
    }
    return r.user;
  };

  const signOut = async () => {
    setAuthToken(null);
    await storage.secureRemove(TOKEN_KEY);
    setToken(null);
    setUser(null);
    // Purge caches liés à l'identité pour éviter fuite d'état inter-comptes
    try { clearAmbassadorCache(); } catch {}
  };

  const refresh = async () => {
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch {}
  };

  const switchRole = async () => {
    const r = await api.post<{ user: User }>("/auth/switch-role", {});
    setUser(r.user);
    return r.user;
  };

  const activateRole = async (role: "client" | "prestataire") => {
    const r = await api.post<{ user: User }>("/auth/activate-role", { role });
    setUser(r.user);
    return r.user;
  };

  return (
    <Ctx.Provider value={{ user, token, loading, signIn, signInWithOtp, requestOtp, signUp, signInWithApple, signOut, refresh, switchRole, activateRole }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
