// Thin API client for the Jokoo backend. Reads token from secure storage.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API = `${BASE}/api`;
export const TOKEN_KEY = "jokoo_token";

// Timeout par défaut : 25 s. Assez long pour tolérer une 3G lente au Sénégal
// mais suffisamment court pour ne pas geler l'UI indéfiniment. Configurable
// par requête via `request(path, { signal }, ...)` si besoin.
const DEFAULT_TIMEOUT_MS = 25_000;

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
    // Timeout via AbortController — protège contre les fetch qui ne
    // reviennent jamais (proxy silencieux, réseau qui coupe pendant l'upload).
    // Si l'appelant a déjà passé son propre `signal`, on le respecte.
    let controller: AbortController | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let signal = init.signal;
    if (!signal) {
      controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => controller!.abort(), DEFAULT_TIMEOUT_MS);
    }
    try {
      return await fetch(`${API}${path}`, { ...init, headers, signal });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  let res: Response;
  try {
    res = await doFetch(false);
  } catch (e: any) {
    // Traduction des erreurs bas-niveau (timeout, réseau coupé, DNS) en
    // messages français cohérents pour l'utilisateur.
    if (e?.name === "AbortError") {
      throw { status: 0, message: "La requête a mis trop de temps. Vérifiez votre connexion." } as ApiError;
    }
    throw { status: 0, message: e?.message || "Connexion impossible. Vérifiez votre réseau." } as ApiError;
  }
  // Retry ONCE : si 401 sur une route protégée, on force la relecture du token
  // (peut se déclencher après un hot-reload qui a vidé la mémoire mais pas le storage).
  if (res.status === 401 && auth) {
    try { res = await doFetch(true); } catch { /* on retombera sur le throw ci-dessous */ }
  }
  // Auto-retry sur 429 (rate limit) — jusqu'à 2 tentatives supplémentaires,
  // avec backoff exponentiel court (150ms, 400ms). Après quoi on remonte
  // l'erreur avec un message convivial en français.
  if (res.status === 429) {
    for (let i = 0; i < 2; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 150 : 400));
      try {
        res = await doFetch(false);
        if (res.status !== 429) break;
      } catch { break; }
    }
  }

  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    let message =
      (body && (body.detail || body.message)) || `HTTP ${res.status}`;
    // Message convivial pour 429 (au cas où le auto-retry ci-dessus n'a pas suffi)
    if (res.status === 429) {
      message = typeof message === "string" && message.startsWith("HTTP ")
        ? "Trop d'activité, patientez quelques secondes."
        : message;
    }
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
  put: <T = any>(p: string, body?: any, auth = true) =>
    request<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined }, auth),
  del: <T = any>(p: string, auth = true) => request<T>(p, { method: "DELETE" }, auth),
  // Escape-hatch : ré-expose le request bas-niveau pour les cas rares (uploads FormData,
  // méthodes exotiques). Toujours préférer get/post/patch/put/del quand c'est possible.
  request: <T = any>(p: string, init: RequestInit = {}, auth = true) => request<T>(p, init, auth),
};

// Types
export type StaffRole = "super_admin" | "admin" | "marketing" | "support" | "operator" | "tech";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "client" | "prestataire";
  roles?: ("client" | "prestataire")[];
  active_role?: "client" | "prestataire";
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

export type PromoCodeStatus = "applicable" | "available" | "coming_soon" | "not_applicable" | "expired" | "used_up" | "not_found";

export type PromoCode = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_amount_xof?: number | null;
  max_discount_xof?: number | null;
  category?: string | null;    // "all" | "family" | "provider" | "mobility"
  starts_at?: string | null;
  ends_at?: string | null;
  usage_limit?: number | null;
  usage_per_user?: number;
  first_booking_only?: boolean;
  active: boolean;
  // Computed per-user fields (returned by /promo-codes and /promo-codes/validate)
  status?: PromoCodeStatus;
  reason?: string | null;
  discount?: number;
  final_amount?: number;
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
  status: "pending" | "pending_payment" | "approved" | "rejected" | "active" | "expired";
  starts_at?: string | null;
  ends_at?: string | null;
  activated_at?: string | null;
  paid?: boolean;
  payment_provider?: "card" | "wave" | "orange" | "admin_gift" | null;
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
  // --- Partage de position temporaire (kind === "location") ---
  lat?: number | null;
  lng?: number | null;
  accuracy_m?: number | null;
  landmark?: string | null;
  expires_at?: string | null;
  expires_in_minutes?: number;
  /** true quand la durée de partage est écoulée : les coordonnées ne sont plus renvoyées. */
  location_expired?: boolean;
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
  archived?: boolean;
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
