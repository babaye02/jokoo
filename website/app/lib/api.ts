// Jokoo Web — Client API partagé avec l'app mobile (mêmes endpoints).
// Token JWT stocké en localStorage (côté client uniquement).
"use client";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
export const TOKEN_KEY = "jokoo_web_token";

let inMemoryToken: string | null = null;

function currentToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  if (typeof window !== "undefined") {
    try {
      inMemoryToken = localStorage.getItem(TOKEN_KEY);
      return inMemoryToken;
    } catch { return null; }
  }
  return null;
}

export function setAuthToken(t: string | null) {
  inMemoryToken = t;
  if (typeof window !== "undefined") {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const useAuth = init?.auth !== false;
  if (useAuth) {
    const t = currentToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const r = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      msg = typeof j?.detail === "string" ? j.detail : JSON.stringify(j?.detail || j);
    } catch {}
    throw new ApiError(r.status, msg);
  }
  if (r.status === 204) return undefined as unknown as T;
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return (await r.text()) as unknown as T;
  return r.json();
}

export const apiFetch = {
  get: <T = unknown>(path: string, opts?: { auth?: boolean }) =>
    request<T>(path, { method: "GET", auth: opts?.auth }),
  post: <T = unknown>(path: string, body?: any, opts?: { auth?: boolean }) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined, auth: opts?.auth }),
  patch: <T = unknown>(path: string, body?: any) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ---- Types partagés avec l'app mobile (versions light) ----
export type WebUser = {
  id: string;
  email: string;
  name: string;
  role: "client" | "prestataire";
  roles?: ("client" | "prestataire")[];
  active_role?: "client" | "prestataire";
  is_admin?: boolean;
  phone?: string | null;
  city?: string | null;
  avatar?: string | null;
};

// Version SSR-compatible pour les fetch depuis les Server Components (SEO).
// IMPORTANT : côté serveur (Vercel), on utilise l'URL directe du backend
// pour éviter le self-fetch `https://jokooservices.com/api/*` qui reboucle
// dans Vercel et échoue silencieusement (résultat : page vide).
// Côté client, on garde `NEXT_PUBLIC_API_URL` qui est bien géré par les rewrites.
export async function api<T = unknown>(path: string): Promise<T> {
  const isServer = typeof window === "undefined";
  const base = isServer
    ? (process.env.BACKEND_URL ||
       process.env.NEXT_PUBLIC_BACKEND_URL ||
       "https://jokoo-mobile-dev.emergent.host") + "/api"
    : (process.env.NEXT_PUBLIC_API_URL || "/api");
  try {
    const r = await fetch(`${base}${path}`, {
      next: { revalidate: 60 },
      headers: { "Accept": "application/json" },
    });
    if (!r.ok) {
      // Log server-side to help debug on Vercel logs. Never crash the page.
      if (isServer) {
        console.warn(`[api SSR] ${base}${path} → HTTP ${r.status}`);
      }
      throw new Error(await r.text());
    }
    return r.json();
  } catch (e) {
    if (isServer) console.warn(`[api SSR] ${base}${path} failed:`, e);
    throw e;
  }
}
