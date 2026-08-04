/**
 * Senegal cities → approximate coordinates (lat, lng).
 *
 * Utilisé pour afficher rapidement une carte centrée sur la ville de départ
 * ou d'arrivée d'un trajet Mobility, sans nécessiter d'appel à une API de
 * géocodage (Google Geocoding, Nominatim, etc.).
 *
 * Ces coordonnées sont des centres approximatifs de villes (~1 km de précision),
 * suffisants pour un aperçu carte MVP. Pour un tracking précis, il faudra
 * ajouter un appel de géocodage à l'adresse complète.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

// Centres approximatifs des villes principales du Sénégal (source: OSM)
const SENEGAL_CITIES: Record<string, LatLng> = {
  // Grand Dakar
  dakar: { latitude: 14.7167, longitude: -17.4677 },
  pikine: { latitude: 14.7554, longitude: -17.3906 },
  guediawaye: { latitude: 14.7691, longitude: -17.4104 },
  rufisque: { latitude: 14.7167, longitude: -17.2667 },
  bargny: { latitude: 14.6928, longitude: -17.2131 },
  yeumbeul: { latitude: 14.7833, longitude: -17.3833 },
  keurmassar: { latitude: 14.7833, longitude: -17.3333 },
  parcelles: { latitude: 14.7667, longitude: -17.4333 },

  // Petite Côte / Ouest
  saly: { latitude: 14.4419, longitude: -16.9781 },
  mbour: { latitude: 14.4198, longitude: -16.9646 },
  thies: { latitude: 14.7907, longitude: -16.9256 },
  "thiès": { latitude: 14.7907, longitude: -16.9256 },
  popenguine: { latitude: 14.5497, longitude: -17.1069 },
  toubab: { latitude: 14.5297, longitude: -17.0817 },
  joal: { latitude: 14.1667, longitude: -16.8333 },
  fadiouth: { latitude: 14.1483, longitude: -16.8272 },

  // Nord
  "saint-louis": { latitude: 16.0181, longitude: -16.4894 },
  saintlouis: { latitude: 16.0181, longitude: -16.4894 },
  louga: { latitude: 15.6136, longitude: -16.2286 },
  richardtoll: { latitude: 16.4625, longitude: -15.7003 },
  "richard-toll": { latitude: 16.4625, longitude: -15.7003 },
  matam: { latitude: 15.6558, longitude: -13.2554 },
  podor: { latitude: 16.65, longitude: -14.9667 },

  // Centre
  diourbel: { latitude: 14.6553, longitude: -16.2306 },
  touba: { latitude: 14.85, longitude: -15.8833 },
  mbake: { latitude: 14.7906, longitude: -15.9075 },
  mbacke: { latitude: 14.7906, longitude: -15.9075 },
  kaolack: { latitude: 14.1522, longitude: -16.0728 },
  fatick: { latitude: 14.3392, longitude: -16.4142 },
  gossas: { latitude: 14.4867, longitude: -16.0664 },

  // Sud
  ziguinchor: { latitude: 12.5833, longitude: -16.2667 },
  kolda: { latitude: 12.8944, longitude: -14.9406 },
  tambacounda: { latitude: 13.7708, longitude: -13.6672 },
  kedougou: { latitude: 12.5556, longitude: -12.1747 },
  "kédougou": { latitude: 12.5556, longitude: -12.1747 },
  sedhiou: { latitude: 12.7081, longitude: -15.5569 },
  bignona: { latitude: 12.8106, longitude: -16.2244 },
  velingara: { latitude: 13.1497, longitude: -14.1197 },
  bakel: { latitude: 14.9006, longitude: -12.4581 },
  goudomp: { latitude: 12.5833, longitude: -15.85 },
};

/**
 * Normalise un nom de ville et retourne les coordonnées si connues.
 * Pas d'accents, minuscules, espaces retirés.
 */
export function geocodeCitySN(cityName: string | null | undefined): LatLng | null {
  if (!cityName) return null;
  const key = cityName
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s'-]/g, "");
  return SENEGAL_CITIES[key] ?? null;
}

/**
 * Retourne une région "englobante" qui contient les deux points, avec un
 * padding de 30 %.
 */
export function regionForCoordinates(a: LatLng, b: LatLng) {
  const latDelta = Math.max(Math.abs(a.latitude - b.latitude) * 1.6, 0.05);
  const lngDelta = Math.max(Math.abs(a.longitude - b.longitude) * 1.6, 0.05);
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

/**
 * Retourne une région centrée sur un seul point.
 */
export function regionForPoint(p: LatLng, zoom: number = 0.05) {
  return {
    latitude: p.latitude,
    longitude: p.longitude,
    latitudeDelta: zoom,
    longitudeDelta: zoom,
  };
}

/**
 * Calcule la distance à vol d'oiseau en km entre 2 points (formule haversine).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
