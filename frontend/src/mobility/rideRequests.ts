// Client API — Marketplace covoiturage v2 (rides_v2)

import { api } from "@/src/api";

export type RideRequestStatus = "open" | "matched" | "booked" | "expired" | "cancelled";
export type RideOfferStatus = "pending" | "accepted" | "refused" | "withdrawn" | "expired";

export interface RideRequest {
  id: string;
  passenger_id: string;
  passenger_name?: string;
  passenger_avatar?: string;
  passenger_role?: string;
  from_city: string;
  from_city_norm: string;
  from_address?: string;
  to_city: string;
  to_city_norm: string;
  to_address?: string;
  date: string;
  time_from: string;
  time_to?: string | null;
  seats: number;
  budget_xof?: number | null;
  notes?: string;
  status: RideRequestStatus;
  offers_count: number;
  matched_offer_ids: string[];
  accepted_offer_id?: string | null;
  expires_at: string;
  expiration_reminded?: boolean;
  created_at: string;
  updated_at: string;
  matches_count?: number;
  offers?: RideOffer[];
}

export interface RideOffer {
  id: string;
  request_id: string;
  passenger_id: string;
  driver_id: string;
  driver_name?: string;
  driver_avatar?: string;
  driver_rating?: number | null;
  driver_completed_rides?: number;
  driver_verified?: boolean;
  ride_id?: string | null;
  ride_summary?: {
    id?: string | null;
    from_city?: string;
    to_city?: string;
    date?: string;
    time?: string;
    seats_available?: number;
    vehicle_model?: string;
    vehicle_color?: string;
    vehicle_plate?: string;
    verified?: boolean;
  };
  price_xof: number;
  message?: string;
  status: RideOfferStatus;
  passenger_message?: string;
  created_at: string;
  updated_at: string;
}

export interface City {
  canonical: string;
  label: string;
  aliases: string[];
}

export interface HotRoute {
  from_city: string;
  to_city: string;
  from_label: string;
  to_label: string;
  count: number;
  next_date?: string;
}

export interface MobilityStats {
  requests_open: number;
  requests_last_24h: number;
  rides_active: number;
  offers_pending: number;
  bookings_last_7d: number;
  hot_routes: HotRoute[];
}

// ─── Cities ────────────────────────────────────────────────

export const rideRequestsApi = {
  cities: () => api.get<{ cities: City[] }>(`/mobility/cities`, false),
  resolveCity: (q: string) =>
    api.get<{ input: string; canonical: string; label: string }>(
      `/mobility/cities/resolve?q=${encodeURIComponent(q)}`,
      false
    ),

  // ─── Stats ────────────────────────────────────────────────
  stats: () => api.get<MobilityStats>(`/mobility/stats`, false),

  // ─── Requests ─────────────────────────────────────────────
  create: (body: {
    from_city: string;
    to_city: string;
    date: string;
    time_from: string;
    time_to?: string;
    seats?: number;
    budget_xof?: number | null;
    notes?: string;
    from_address?: string;
    to_address?: string;
  }) => api.post<RideRequest>(`/mobility/requests`, body),

  list: (params?: { from_city?: string; to_city?: string; date?: string; status?: string; exclude_self?: boolean; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.from_city) qs.set("from_city", params.from_city);
    if (params?.to_city) qs.set("to_city", params.to_city);
    if (params?.date) qs.set("date", params.date);
    if (params?.status) qs.set("status", params.status);
    if (params?.exclude_self === false) qs.set("exclude_self", "false");
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return api.get<RideRequest[]>(`/mobility/requests${q ? `?${q}` : ""}`);
  },

  mine: () => api.get<RideRequest[]>(`/mobility/requests/mine`),

  get: (id: string) => api.get<RideRequest>(`/mobility/requests/${id}`),

  update: (id: string, patch: Partial<RideRequest>) =>
    api.patch<RideRequest>(`/mobility/requests/${id}`, patch),

  cancel: (id: string) =>
    api.patch<RideRequest>(`/mobility/requests/${id}`, { status: "cancelled" }),

  republish: (id: string) =>
    api.post<RideRequest>(`/mobility/requests/${id}/republish`, {}),

  delete: (id: string) => api.del<{ status: string }>(`/mobility/requests/${id}`),

  // ─── Offers ────────────────────────────────────────────────
  createOffer: (
    requestId: string,
    body: {
      ride_id?: string;
      price_xof: number;
      message?: string;
      from_city?: string;
      to_city?: string;
      date?: string;
      time?: string;
      seats_available?: number;
      vehicle_model?: string;
    }
  ) => api.post<RideOffer>(`/mobility/requests/${requestId}/offers`, body),

  listOffers: (requestId: string) => api.get<RideOffer[]>(`/mobility/requests/${requestId}/offers`),

  decideOffer: (offerId: string, action: "accept" | "refuse", message?: string) =>
    api.post<{ offer: RideOffer; booking?: any; losing_offers_count?: number }>(
      `/mobility/offers/${offerId}/decision`,
      { action, message }
    ),

  withdrawOffer: (offerId: string) =>
    api.post<RideOffer>(`/mobility/offers/${offerId}/withdraw`, {}),

  offersSent: () => api.get<RideOffer[]>(`/mobility/offers/sent`),
  offersReceived: () => api.get<RideOffer[]>(`/mobility/offers/received`),

  // Matching helpers
  matchingRidesForRequest: (requestId: string) =>
    api.get<any[]>(`/mobility/requests/${requestId}/rides`),

  matchingRequestsForRide: (rideId: string) =>
    api.get<RideRequest[]>(`/mobility/rides/${rideId}/matches`),
};

// ─── UI helpers ─────────────────────────────────────────────

export function requestStatusLabel(s: RideRequestStatus): string {
  const M: Record<RideRequestStatus, string> = {
    open: "Ouverte",
    matched: "Offres reçues",
    booked: "Confirmée",
    expired: "Expirée",
    cancelled: "Annulée",
  };
  return M[s] || s;
}

export function requestStatusColor(s: RideRequestStatus): { bg: string; fg: string } {
  const M: Record<RideRequestStatus, { bg: string; fg: string }> = {
    open: { bg: "#DBEAFE", fg: "#1E3A8A" },
    matched: { bg: "#FEF3C7", fg: "#B47F00" },
    booked: { bg: "#E9F9EF", fg: "#1F7A3F" },
    expired: { bg: "#F2F2F2", fg: "#4A4A4A" },
    cancelled: { bg: "#FDECEC", fg: "#B33131" },
  };
  return M[s] || { bg: "#F2F2F2", fg: "#4A4A4A" };
}

export function offerStatusLabel(s: RideOfferStatus): string {
  const M: Record<RideOfferStatus, string> = {
    pending: "En attente",
    accepted: "Acceptée",
    refused: "Refusée",
    withdrawn: "Retirée",
    expired: "Expirée",
  };
  return M[s] || s;
}

export function offerStatusColor(s: RideOfferStatus): { bg: string; fg: string } {
  const M: Record<RideOfferStatus, { bg: string; fg: string }> = {
    pending: { bg: "#FEF3C7", fg: "#B47F00" },
    accepted: { bg: "#E9F9EF", fg: "#1F7A3F" },
    refused: { bg: "#FDECEC", fg: "#B33131" },
    withdrawn: { bg: "#F2F2F2", fg: "#4A4A4A" },
    expired: { bg: "#F2F2F2", fg: "#4A4A4A" },
  };
  return M[s] || { bg: "#F2F2F2", fg: "#4A4A4A" };
}

export function formatRoute(from: string, to: string): string {
  return `${from} → ${to}`;
}

export function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function relativeTime(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    const now = Date.now();
    const diff = d - now;
    const abs = Math.abs(diff);
    const mins = Math.floor(abs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (abs < 60000) return "à l'instant";
    if (mins < 60) return diff > 0 ? `dans ${mins} min` : `il y a ${mins} min`;
    if (hours < 24) return diff > 0 ? `dans ${hours}h` : `il y a ${hours}h`;
    return diff > 0 ? `dans ${days}j` : `il y a ${days}j`;
  } catch {
    return "";
  }
}
