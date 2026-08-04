import React, { useMemo, useRef } from "react";
import Constants from "expo-constants";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { Txt } from "@/src/components/ui";
import {
  geocodeCitySN,
  haversineKm,
  LatLng,
  regionForCoordinates,
  regionForPoint,
} from "@/src/utils/geo";
import type { JokooMapProps } from "./JokooMap";

// Détection : la clé Google Maps Android est-elle configurée ?
// On lit depuis expo-constants (app.json > android.config.googleMaps.apiKey).
// Si absente ou = placeholder, on retombe sur PROVIDER_DEFAULT pour éviter
// un crash silencieux au runtime (Google Maps SDK Android refuse de charger
// les tuiles sans clé valide).
function androidGoogleMapsKeyIsValid(): boolean {
  try {
    const cfg: any = (Constants.expoConfig as any) || (Constants.manifest as any);
    const key: string | undefined = cfg?.android?.config?.googleMaps?.apiKey;
    if (!key) return false;
    if (key.startsWith("REPLACE_")) return false;
    if (key.length < 20) return false; // vraie clé Google ~ 39 chars
    return true;
  } catch {
    return false;
  }
}

/**
 * Jokoo — Composant carte réutilisable (version native iOS/Android).
 *
 * Usage typique :
 *  <JokooMap
 *     origin={{ city: "Dakar", address: "Plateau" }}
 *     destination={{ city: "Thiès", address: "Centre" }}
 *     height={180}
 *  />
 *
 * Comportement :
 * - iOS : Apple Maps par défaut (aucune clé API requise).
 * - Android : Google Maps si clé configurée dans `app.json`, sinon carte grise
 *   avec fallback CTA "Ouvrir dans Maps".
 * - Ni origin ni destination géocodable → fallback UI, jamais de crash.
 * - Pas d'interaction (scrollEnabled=false par défaut) pour un usage
 *   "aperçu" à l'intérieur d'un ScrollView. Passer `interactive` pour un
 *   plein écran.
 *
 * Sur Web, Metro remplace automatiquement ce fichier par `JokooMap.web.tsx`.
 */

export interface JokooMapPoint {
  city?: string | null;
  address?: string | null;
  coords?: LatLng | null;
  label?: string;
}

const DAKAR_FALLBACK: LatLng = { latitude: 14.7167, longitude: -17.4677 };

function resolveCoords(p?: JokooMapPoint): LatLng | null {
  if (!p) return null;
  if (p.coords) return p.coords;
  return geocodeCitySN(p.city);
}

export function JokooMap({
  origin,
  destination,
  waypoints = [],
  height = 200,
  borderRadius = radius.lg,
  interactive = false,
  hideDistance = false,
  onPress,
  onOpenExternal,
}: JokooMapProps) {
  const mapRef = useRef<MapView>(null);

  const from = useMemo(() => resolveCoords(origin), [origin]);
  const to = useMemo(() => resolveCoords(destination), [destination]);
  const wps = useMemo(
    () => waypoints.map(resolveCoords).filter((c): c is LatLng => !!c),
    [waypoints]
  );

  const region = useMemo(() => {
    if (from && to) return regionForCoordinates(from, to);
    if (from) return regionForPoint(from, 0.1);
    if (to) return regionForPoint(to, 0.1);
    return regionForPoint(DAKAR_FALLBACK, 0.25);
  }, [from, to]);

  const distanceKm = from && to ? haversineKm(from, to) : null;

  // Sur iOS on utilise Apple Maps (PROVIDER_DEFAULT = pas de clé requise).
  // Sur Android, Google Maps n'est utilisé QUE si une clé valide est
  // configurée. Sinon on retombe sur PROVIDER_DEFAULT pour éviter un
  // écran gris au runtime (build ok, mais tuiles ne se chargent pas).
  const provider =
    Platform.OS === "ios"
      ? PROVIDER_DEFAULT
      : androidGoogleMapsKeyIsValid()
        ? PROVIDER_GOOGLE
        : PROVIDER_DEFAULT;

  const noPoints = !from && !to;

  // Si on n'a AUCUN point géocodable et pas de fallback, on montre une UI
  // "carte indisponible" plutôt qu'une carte vide.
  if (noPoints) {
    return (
      <Pressable
        onPress={onOpenExternal}
        style={[
          styles.container,
          { height, borderRadius, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceWarm },
        ]}
      >
        <Ionicons name="location-outline" size={28} color={colors.textMuted} />
        <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6 }}>
          Localisation non renseignée
        </Txt>
      </Pressable>
    );
  }

  const Wrapper: any = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={[styles.container, { height, borderRadius }]}
    >
      <MapView
        ref={mapRef}
        provider={provider}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsCompass={false}
        showsScale={false}
        showsMyLocationButton={false}
        loadingEnabled
        loadingBackgroundColor={colors.surfaceWarm}
        loadingIndicatorColor={colors.turquoise}
      >
        {from ? (
          <Marker
            coordinate={from}
            title={origin?.city || "Départ"}
            description={origin?.address || undefined}
            pinColor={Platform.OS === "ios" ? "#18C6A3" : undefined}
          >
            {Platform.OS === "android" ? (
              <View style={[styles.marker, { backgroundColor: colors.turquoise }]}>
                <Ionicons name="radio-button-on" size={14} color={colors.white} />
              </View>
            ) : null}
          </Marker>
        ) : null}
        {wps.map((c, i) => (
          <Marker
            key={`wp-${i}`}
            coordinate={c}
            title={waypoints[i]?.city || `Arrêt ${i + 1}`}
            description={waypoints[i]?.address || undefined}
            pinColor="gray"
          />
        ))}
        {to ? (
          <Marker
            coordinate={to}
            title={destination?.city || "Arrivée"}
            description={destination?.address || undefined}
            pinColor={Platform.OS === "ios" ? "#1F1F1F" : undefined}
          >
            {Platform.OS === "android" ? (
              <View style={[styles.marker, { backgroundColor: colors.midnight }]}>
                <Ionicons name="flag" size={12} color={colors.white} />
              </View>
            ) : null}
          </Marker>
        ) : null}
        {from && to ? (
          <Polyline
            coordinates={[from, ...wps, to]}
            strokeColor={colors.turquoise}
            strokeWidth={3}
            lineDashPattern={[6, 4]}
          />
        ) : null}
      </MapView>

      {/* Overlay footer : distance + CTA ouvrir en externe */}
      {!hideDistance && distanceKm != null ? (
        <View style={styles.footer} pointerEvents="none">
          <View style={styles.pill}>
            <Ionicons name="navigate" size={11} color={colors.midnight} />
            <Txt size="xxs" weight="700" style={{ marginLeft: 4 }}>
              {distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km
            </Txt>
          </View>
        </View>
      ) : null}

      {onOpenExternal ? (
        <Pressable
          onPress={onOpenExternal}
          style={styles.externalBtn}
          hitSlop={10}
          testID="map-open-external"
        >
          <Ionicons name="open-outline" size={14} color={colors.midnight} />
        </Pressable>
      ) : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: colors.surfaceWarm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.sm,
  },
  marker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.white,
    ...shadow.md,
  },
  footer: {
    position: "absolute",
    left: spacing.sm,
    bottom: spacing.sm,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    ...shadow.sm,
  },
  externalBtn: {
    position: "absolute",
    right: spacing.sm,
    top: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
});
