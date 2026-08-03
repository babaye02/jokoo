// Thin API client for the Jokoo backend. Reads token from secure storage.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API = `${BASE}/api`;
export const TOKEN_KEY = "jokoo_token";

export type ApiError = { status: number; message: string };

// In-memory token cache — évite les race conditions avec SecureStore/AsyncStorage.
// L'AuthProvider met à jour ce cache après login/register/hydrate/signOut.
let _memToken: string | null = null;

export function setAuthToken(token: string | null) {
  _memToken = token && token.length > 0 ? token : null;
}

export function getAuthTokenMem(): string | null {
  return _memToken;
}

// Callback pour rediriger l'utilisateur (branché par _layout au boot).
let _onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(cb: (() => void) | null) {
  _onUnauthorized = cb;
}

async function resolveToken(): Promise<string> {
  if (_memToken) return _memToken;
  try {
    const t = await storage.secureGet<string>(TOKEN_KEY, "");
    if (t) {
      _memToken = t as string;
      return t as string;
    }
  } catch {}
  return "";
}

async function request<T = any>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const doFetch = async (forceRefreshToken: boolean): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as any),
    };
    if (auth) {
      if (forceRefreshToken) _memToken = null; // force re-read
      const t = await resolveToken();
      if (t) headers["Authorization"] = `Bearer ${t}`;
    }
    return fetch(`${API}${path}`, { ...init, headers });
  };

  let res = await doFetch(false);
  // Retry ONCE : si 401 sur une route protégée, on force la relecture du token
  // (peut se déclencher après un hot-reload qui a vidé la mémoire mais pas le storage).
  if (res.status === 401 && auth) {
    res = await doFetch(true);
  }

  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const message =
      (body && (body.detail || body.message)) || `HTTP ${res.status}`;
    const err: ApiError = { status: res.status, message: String(message) };
    if (res.status === 401 && auth) {
      _memToken = null;
      try { await storage.secureRemove(TOKEN_KEY); } catch {}
      if (_onUnauthorized) {
        try { _onUnauthorized(); } catch {}
      }
    }
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
export type StaffRole = "super_admin" | "admin" | "marketing" | "support" | "operator" | "tech";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "client" | "prestataire";
  is_admin?: boolean;
  staff_role?: StaffRole | null;
  permissions?: string[];
  active?: boolean;
  phone?: string | null;
  city?: string | null;
  avatar?: string | null;
};

export type ServiceItem = {
  key: string;
  label: string;
  icon: string;
  color: string;
  category?: string;
};

export type ServiceCategory = {
  key: string;
  label: string;
  emoji: string;
  color: string;
  order?: number;
  count: number;
  services: ServiceItem[];
};

export type ServiceSuggestion = {
  id: string;
  suggested_by: string;
  suggested_by_name?: string;
  label: string;
  category?: string;
  description?: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  admin_note?: string | null;
  generated_key?: string | null;
};

export type PriceType = "fixed" | "from" | "quote";

export type Provider = {
  id: string;
  name: string;
  city: string;
  service: string;
  service_key: string;
  categories?: string[];
  trades?: string[];
  cover_photo?: string;
  service_mode?: "at_client" | "at_venue" | "both";
  venue_address?: string | null;
  venue_city?: string | null;
  travel_fee_xof?: number | null;
  weekly_availability?: Record<string, { start: string; end: string }[]>;
  unavailable_dates?: { date: string; reason?: string }[];
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

export type AdMedia = { kind: "image" | "video"; url: string; thumb?: string };

export type AdLinkType =
  | "none"
  | "provider"
  | "category"
  | "promo"
  | "partner"
  | "external"
  | "app_route";

export type Ad = {
  id: string;
  type: "image" | "banner" | "video" | "carousel";
  title: string;
  description?: string;
  button_label?: string;
  link?: string | null;
  link_type?: AdLinkType | null;
  link_target?: string | null;
  link_label?: string | null;
  media: AdMedia[];
  placements: string[];
  category_key?: string | null;
  target_audience?: "all" | "client" | "prestataire";
  display_mode?: "single" | "carousel_queue";
  display_duration_ms?: number | null;
  start_at?: string | null;
  end_at?: string | null;
  active: boolean;
  suspended?: boolean;
  impressions?: number;
  clicks?: number;
  ctr?: number;
};

export type Promo = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  cta_label?: string;
  cta_link_type?: AdLinkType | null;
  cta_link_target?: string | null;
  image?: string | null;
  bg_color?: string | null;
  discount_label?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  active: boolean;
  created_at?: string;
};

export type Partner = {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  logo?: string | null;
  cover?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  category?: string | null;
  active: boolean;
  created_at?: string;
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
  to_name?: string;
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
  family_booking_id?: string;
  ride_id?: string;
  parcel_id?: string;
  peer_id?: string;
  review_id?: string;
  provider_id?: string;
  babysitter_id?: string;
  report_id?: string;
  read: boolean;
  created_at: string;
};

// -------- Mobility · Covoiturage --------
export type RideStop = { city: string; address?: string };
export type Ride = {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_avatar?: string | null;
  driver_phone?: string | null;
  driver_city?: string | null;
  driver_rating?: number;
  driver_reviews_count?: number;
  driver_verified?: boolean;
  from_city: string;
  from_address?: string;
  to_city: string;
  to_address?: string;
  stops: RideStop[];
  date: string;
  time: string;
  seats_total: number;
  seats_available: number;
  price_xof: number;
  distance_type: "short" | "long";
  recurrence: "none" | "weekly";
  recurrence_days: string[];
  vehicle_model?: string;
  vehicle_plate?: string;
  vehicle_color?: string;
  notes?: string;
  status: "active" | "cancelled" | "completed";
  // Livraison longue distance
  accepts_parcels?: boolean;
  parcel_price_xof?: number;
  parcel_max_kg?: number;
  parcel_payment_mode?: "app_only" | "app_or_cash" | "cash_only";
  created_at: string;
};

export type RideBooking = {
  id: string;
  ride_id: string;
  passenger_id: string;
  passenger_name: string;
  passenger_phone?: string | null;
  seats: number;
  price_xof: number;
  status: "pending" | "confirmed" | "cancelled";
  paid?: boolean;
  note?: string;
  created_at: string;
  ride?: Partial<Ride>;
};

export type Parcel = {
  id: string;
  ride_id: string;
  sender_id: string;
  sender_name: string;
  sender_phone?: string | null;
  driver_id: string;
  driver_name: string;
  driver_avatar?: string | null;
  from_city: string;
  to_city: string;
  date: string;
  time: string;
  pickup_address: string;
  dropoff_address: string;
  description: string;
  weight_kg: number;
  recipient_name: string;
  recipient_phone: string;
  photo?: string | null;
  payment_mode: "app" | "cash";
  price_xof: number;
  status: "pending" | "accepted" | "rejected" | "picked_up" | "delivered" | "cancelled";
  paid?: boolean;
  created_at: string;
};

// -------- Jokoo Family (Babysitting) --------
export type LanguageLevel = "native" | "fluent" | "intermediate" | "basic";
export type BabyAgeGroup = "0-2" | "3-5" | "6-10" | "11-14";
export type BabySkill =
  | "languages" | "homework" | "music" | "art" | "sport" | "cooking" | "stories" | "outdoor"
  | "educational_games" | "baby_care" | "school_pickup" | "holiday_care";
export type StudyLevel = "licence" | "master" | "doctorat" | "prepa" | "other";
export type ProfileType = "student" | "teacher" | "professional";
export type FamilyService = "babysitting" | "tutoring" | "school_pickup" | "holiday_care" | "educational_activities";

export type Language = { code: string; level: LanguageLevel };

export type Babysitter = {
  id: string;
  user_id: string;
  name: string;
  phone?: string;
  avatar?: string | null;
  bio: string;
  profile_type?: ProfileType;
  university: string;
  level: StudyLevel;
  field_of_study?: string;
  city: string;
  languages: Language[];
  age_specialties: BabyAgeGroup[];
  skills: BabySkill[];
  services?: FamilyService[];
  offers_babysitting: boolean;
  offers_tutoring: boolean;
  tutoring_subjects: string[];
  available_today?: boolean;
  night_care?: boolean;
  can_travel?: boolean;
  hourly_rate_xof: number;
  psc1_certified: boolean;
  student_card_verified: boolean;
  identity_verified?: boolean;
  references_verified?: boolean;
  recommended_by_jokoo?: boolean;
  verified_plus?: boolean;
  rating: number;
  reviews_count: number;
  status: "active" | "inactive";
  created_at: string;
};

export type BabyKid = { name: string; age: number; special_needs?: string };

export type FamilyBooking = {
  id: string;
  parent_id: string;
  parent_name: string;
  parent_phone?: string;
  babysitter_id: string;
  babysitter_user_id: string;
  babysitter_name: string;
  babysitter_avatar?: string | null;
  service_type: "babysitting" | "tutoring" | "both";
  address: string;
  city: string;
  date: string;
  time_start: string;
  time_end: string;
  duration_hours: number;
  kids: BabyKid[];
  language_focus?: string | null;
  tutoring_subjects?: string[];
  notes?: string;
  emergency_contact: { name: string; phone: string };
  hourly_rate_xof: number;
  total_xof: number;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";
  checkin_photo?: string | null;
  sos_triggered_at?: string | null;
  report_id?: string | null;
  paid?: boolean;
  created_at: string;
};

export type SessionReport = {
  id: string;
  booking_id: string;
  activities: string;
  meals?: string;
  mood: "happy" | "calm" | "tired" | "upset";
  notes?: string;
  photo?: string | null;
  created_at: string;
};
