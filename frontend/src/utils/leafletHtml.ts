/**
 * Générateur HTML Leaflet + OpenStreetMap pour Jokoo.
 *
 * Retourne une string HTML autonome à charger dans une WebView (iOS/Android)
 * ou une iframe (Web) — sans dépendance npm, sans clé API, sans backend.
 *
 * OpenStreetMap est 100 % gratuit et open-source. Merci de respecter leur
 * "Tile Usage Policy" : max ~1 requête/seconde/utilisateur, User-Agent clair.
 * Pour un usage massif, envisager un tile server auto-hébergé ou MapTiler.
 */

import type { LatLng } from "./geo";

export interface LeafletBuildParams {
  origin?: LatLng | null;
  destination?: LatLng | null;
  waypoints?: LatLng[];
  /** Couleur principale (marker origin + polyline). */
  originColor?: string;
  /** Couleur du marker destination. */
  destinationColor?: string;
  /** Centre par défaut si aucun point n'est fourni (Dakar). */
  fallbackCenter?: LatLng;
  /** Bloque interactions (drag / zoom / double-tap). Défaut : true (preview). */
  static?: boolean;
}

const DEFAULT_FALLBACK: LatLng = { latitude: 14.7167, longitude: -17.4677 };

export function buildLeafletHtml(params: LeafletBuildParams = {}): string {
  const {
    origin,
    destination,
    waypoints = [],
    originColor = "#18C6A3",
    destinationColor = "#1F1F1F",
    fallbackCenter = DEFAULT_FALLBACK,
    static: isStatic = true,
  } = params;

  const points: { lat: number; lng: number; color: string; label: string; type: "start" | "wp" | "end" }[] = [];
  if (origin) points.push({ lat: origin.latitude, lng: origin.longitude, color: originColor, label: "Départ", type: "start" });
  waypoints.forEach((w, i) => points.push({ lat: w.latitude, lng: w.longitude, color: "#8A8A8A", label: `Arrêt ${i + 1}`, type: "wp" }));
  if (destination) points.push({ lat: destination.latitude, lng: destination.longitude, color: destinationColor, label: "Arrivée", type: "end" });

  const boundsJson = JSON.stringify(points.map((p) => [p.lat, p.lng]));
  const pointsJson = JSON.stringify(points);
  const centerJson = JSON.stringify([fallbackCenter.latitude, fallbackCenter.longitude]);
  const interactions = isStatic
    ? `{ dragging: false, zoomControl: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, touchZoom: false }`
    : `{ zoomControl: true }`;

  // Note: on utilise Leaflet 1.9.4 en CDN (unpkg) — stable, ~40 KB gzippé.
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #FAF9F7; }
    #map { touch-action: manipulation; }
    .jokoo-marker {
      background: #18C6A3;
      width: 22px; height: 22px; border-radius: 11px;
      border: 3px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-weight: 700; font-size: 11px; font-family: -apple-system, system-ui, sans-serif;
    }
    .jokoo-marker.end { background: #1F1F1F; }
    .jokoo-marker.wp { background: #8A8A8A; width: 14px; height: 14px; border-radius: 7px; border-width: 2px; }
    .leaflet-container { background: #F5F3EE !important; }
    .leaflet-control-attribution { font-size: 9px !important; background: rgba(255,255,255,0.75) !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
    (function() {
      const points = ${pointsJson};
      const bounds = ${boundsJson};
      const map = L.map('map', ${interactions}).setView(${centerJson}, 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap',
        subdomains: 'abc',
      }).addTo(map);

      const markers = points.map((p) => {
        const icon = L.divIcon({
          className: '',
          html: '<div class="jokoo-marker ' + (p.type === 'end' ? 'end' : p.type === 'wp' ? 'wp' : '') + '"></div>',
          iconSize: p.type === 'wp' ? [14, 14] : [22, 22],
          iconAnchor: p.type === 'wp' ? [7, 7] : [11, 11],
        });
        return L.marker([p.lat, p.lng], { icon: icon, title: p.label }).addTo(map);
      });

      if (points.length >= 2) {
        const line = L.polyline(bounds, {
          color: '${originColor}',
          weight: 3,
          opacity: 0.9,
          dashArray: '6, 4',
        }).addTo(map);
      }

      if (bounds.length === 1) {
        map.setView(bounds[0], 13);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
      }

      // Signale au host RN que la carte est prête
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'map_ready', points: points.length }));
      }
    })();
  </script>
</body>
</html>`;
}
