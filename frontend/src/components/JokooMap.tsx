/**
 * JokooMap — Point d'entrée TypeScript.
 *
 * L'implémentation réelle est fournie par :
 *  - `JokooMap.native.tsx` (iOS/Android) : utilise `react-native-maps`
 *  - `JokooMap.web.tsx`    (Web)          : rendu SVG-like + CTA externe
 *
 * Metro sélectionne automatiquement le bon fichier selon la plateforme.
 * Ce fichier ne sert qu'à exposer les types partagés côté TypeScript et
 * à garantir l'import `import { JokooMap } from "@/src/components/JokooMap"`.
 */

import type { LatLng } from "@/src/utils/geo";

export interface JokooMapPoint {
  city?: string | null;
  address?: string | null;
  coords?: LatLng | null;
  label?: string;
}

export interface JokooMapProps {
  origin?: JokooMapPoint;
  destination?: JokooMapPoint;
  waypoints?: JokooMapPoint[];
  height?: number;
  borderRadius?: number;
  interactive?: boolean;
  hideDistance?: boolean;
  onPress?: () => void;
  onOpenExternal?: () => void;
}

/**
 * Fallback théorique — ce composant NE DOIT jamais être atteint en pratique
 * car Metro résout `.native` ou `.web` avant. Il existe uniquement pour
 * satisfaire TypeScript quand aucun `Platform` n'est disponible (SSR, tests).
 */
export function JokooMap(_props: JokooMapProps): React.ReactElement | null {
  return null;
}

// Re-export type pour compatibilité imports existants
export type { LatLng };
