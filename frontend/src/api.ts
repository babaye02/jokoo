// Thin API client for the Jokoo backend. Reads token from secure storage.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API = `${BASE}/api`;
export const TOKEN_KEY = "jokoo_token";

export type ApiError = { status: number; message: string };

async function request<T = any>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as any),
  };
  if (auth) {
    const t = await storage.secureGet<string>(TOKEN_KEY, "");
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const message =
      (body && (body.detail || body.message)) || `HTTP ${res.status}`;
    const err: ApiError = { status: res.status, message: String(message) };
    throw err;
  }
  return body as T;
}

export const api = {
  get: <T = any>(p: string, auth = true) => request<T>(p, {}, auth),
  post: <T = any>(p: string, body?: any, auth = true) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }, auth),
  patch: <T = any>(p: string, body?: any, auth = true) =>
    request<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }, auth),
  del: <T = any>(p: string, auth = true) => request<T>(p, { method: "DELETE" }, auth),
};

// Types
export type User = {
  id: string;
  email: string;
  name: string;
  role: "client" | "prestataire";
  is_admin?: boolean;
  phone?: string | null;
  city?: string | null;
  avatar?: string | null;
};

export type ServiceItem = {
  key: string;
  label: string;
  icon: string;
  color: string;
};

export type PriceType = "fixed" | "from" | "quote";

export type Provider = {
  id: string;
  name: string;
  service: string;
  service_key: string;
  city: string;
  price_type?: PriceType;
  price_amount?: number | null;
  rating: number;
  reviews_count: number;
  description: string;
  photo?: string;
  gallery?: string[];
  verified?: boolean;
  phone?: string;
  hours?: string;
  zones?: string[];
  reviews?: Review[];
  services?: PrestationSvc[];
  subscription_active?: boolean;
  sponsored_until?: string | null;
};

export type PrestationSvc = {
  id: string;
  provider_id: string;
  name: string;
  description: string;
  category_key: string;
  photos: string[];
  price_type: PriceType;
  price_amount: number | null;
  duration_minutes: number | null;
  active: boolean;
  created_at?: string;
};

export type Ad = {
  id: string;
  format: "banner" | "image" | "carousel";
  title: string;
  description?: string;
  button_label?: string;
  link?: string | null;
  images: string[];
  placements: string[];
  category_key?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  active: boolean;
  impressions?: number;
  clicks?: number;
};

export type Sponsorship = {
  id: string;
  provider_id: string;
  provider_name: string;
  duration_days: 7 | 15 | 30;
  amount_xof: number;
  status: "pending" | "approved" | "rejected" | "active" | "expired";
  starts_at?: string | null;
  ends_at?: string | null;
  paid?: boolean;
  created_at: string;
};

export type Review = {
  id: string;
  provider_id: string;
  author_name: string;
  rating: number;
  comment: string;
  created_at: string;
  photos?: string[];
};

export type Booking = {
  id: string;
  client_id: string;
  client_name: string;
  provider_id: string;
  provider_name: string;
  provider_service: string;
  service_id?: string | null;
  service_name?: string | null;
  date: string;
  time: string;
  address: string;
  description: string;
  price?: number | null;
  price_type?: PriceType;
  quote_amount?: number | null;
  status: "pending" | "accepted" | "rejected" | "completed" | "cancelled";
  paid?: boolean;
  created_at: string;
};

export type Message = {
  id: string;
  conv_id: string;
  from_id: string;
  from_name: string;
  to_id: string;
  text: string;
  kind: "text" | "image" | "location";
  read: boolean;
  created_at: string;
};

export type Conversation = {
  peer_id: string;
  peer_name: string;
  peer_avatar?: string | null;
  peer_role?: string;
  last_message?: string;
  last_at?: string;
  unread: number;
};

export type Notif = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  booking_id?: string;
  peer_id?: string;
  read: boolean;
  created_at: string;
};
