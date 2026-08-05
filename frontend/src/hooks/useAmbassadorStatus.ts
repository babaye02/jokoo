import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/src/api";

/**
 * Jokoo Partners — hook léger qui expose le statut ambassadeur du user
 * courant. Interroge `/api/ambassadors/me` en cache mémoire simple pour
 * éviter les appels redondants au montage de plusieurs écrans.
 *
 * Un rafraîchissement forcé peut être déclenché après une action
 * (activation admin, etc.) via `refresh()`.
 */

export interface AmbassadorLinks {
  web?: string;
  web_slug?: string;
  app?: string;
  share_text?: string;
}

export interface AmbassadorProfile {
  user_id: string;
  name?: string | null;
  avatar?: string | null;
  role?: string | null;
  active: boolean;
  code: string;
  slug: string;
  tier: string;
  badge: string;
  monthly_goal: number;
  verified_count: number;
  pending_count: number;
  custom_bio?: string | null;
  joined_at?: string;
  links: AmbassadorLinks;
}

export interface AmbassadorStats {
  verified_total: number;
  pending_total: number;
  prestataires_verified: number;
  clients_verified: number;
  bookings_generated: number;
  commissions: {
    pending_xof: number;
    approved_xof: number;
    paid_xof: number;
    count: number;
  };
  month_progress: {
    current: number;
    goal: number;
  };
}

export interface NextTier {
  tier: string;
  badge: string;
  needed: number;
  threshold: number;
}

export interface AmbassadorMeResponse {
  is_ambassador: boolean;
  ambassador?: AmbassadorProfile;
  stats?: AmbassadorStats;
  tier?: string;
  tier_label?: string;
  next_tier?: NextTier | null;
  config?: {
    thresholds: Record<string, number>;
    commissions: Record<string, number>;
  };
}

// Cache mémoire minuscule (invalidé à chaque logout via api.setToken clear)
let _cache: AmbassadorMeResponse | null = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 30_000; // 30 s

export function useAmbassadorStatus() {
  const [data, setData] = useState<AmbassadorMeResponse | null>(_cache);
  const [loading, setLoading] = useState<boolean>(!_cache);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetch = useCallback(async (force: boolean = false) => {
    const stale = Date.now() - _cacheAt > CACHE_TTL_MS;
    if (!force && _cache && !stale) {
      setData(_cache);
      setLoading(false);
      return _cache;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<AmbassadorMeResponse>("/ambassadors/me");
      _cache = res;
      _cacheAt = Date.now();
      if (mounted.current) {
        setData(res);
        setLoading(false);
      }
      return res;
    } catch (e: any) {
      if (mounted.current) {
        setError(e?.message || "Erreur");
        setLoading(false);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    fetch(false);
  }, [fetch]);

  return {
    data,
    loading,
    error,
    isAmbassador: !!data?.is_ambassador,
    refresh: () => fetch(true),
  };
}

// Purge cache (à appeler au logout)
export function clearAmbassadorCache() {
  _cache = null;
  _cacheAt = 0;
}
