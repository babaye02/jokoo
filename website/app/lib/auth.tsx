"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, setAuthToken, TOKEN_KEY, WebUser } from "./api";

type AuthState = {
  user: WebUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<WebUser>;
  signUp: (payload: {
    email: string;
    password: string;
    name: string;
    role: "client" | "prestataire";
    phone?: string;
    city?: string;
  }) => Promise<WebUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  switchRole: () => Promise<WebUser>;
  activateRole: (role: "client" | "prestataire") => Promise<WebUser>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<WebUser | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const t = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
      if (t) {
        setAuthToken(t);
        try {
          const me = await apiFetch.get<WebUser>("/auth/me");
          setUser(me);
        } catch {
          setAuthToken(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const signIn = async (email: string, password: string) => {
    const r = await apiFetch.post<{ token: string; user: WebUser }>(
      "/auth/login",
      { email, password },
      { auth: false }
    );
    setAuthToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const signUp = async (payload: any) => {
    const r = await apiFetch.post<{ token: string; user: WebUser }>(
      "/auth/register",
      payload,
      { auth: false }
    );
    setAuthToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const signOut = async () => {
    setAuthToken(null);
    setUser(null);
  };

  const refresh = async () => {
    try {
      const me = await apiFetch.get<WebUser>("/auth/me");
      setUser(me);
    } catch {}
  };

  const switchRole = async () => {
    const r = await apiFetch.post<{ user: WebUser }>("/auth/switch-role", {});
    setUser(r.user);
    return r.user;
  };

  const activateRole = async (role: "client" | "prestataire") => {
    const r = await apiFetch.post<{ user: WebUser }>("/auth/activate-role", { role });
    setUser(r.user);
    return r.user;
  };

  return (
    <Ctx.Provider value={{ user, loading, signIn, signUp, signOut, refresh, switchRole, activateRole }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
