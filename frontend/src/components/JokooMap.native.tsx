import React, { useMemo } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { Txt } from "@/src/components/ui";
import {
  geocodeCitySN,
  haversineKm,
  LatLng,
  regionForCoordinates,
} from "@/src/utils/geo";
import { buildLeafletHtml } from "@/src/utils/leafletHtml";
import type { JokooMapProps, JokooMapPoint } from "./JokooMap";

/**
 * Jokoo — Composant carte réutilisable (version native iOS/Android).
 *
 * IMPLÉMENTATION : WebView + Leaflet + OpenStreetMap.
 * → 100 % gratuit, aucune clé API, aucune dépendance native lourde.
 * → Fonctionne dans Expo Go, dev build et build prod sans configuration.
 *
 * Metro remplace automatiquement ce fichier par `JokooMap.web.tsx` sur Web.
 */

const DAKAR_FALLBACK: LatLng = { latitude: 14.7167, longitude: -17.4677 };

function resolveCoords(p?: JokooMapPoint | null): LatLng | null {
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
  const from = useMemo(() => resolveCoords(origin), [origin]);
  const to = useMemo(() => resolveCoords(destination), [destination]);
  const wps = useMemo(
    () => waypoints.map(resolveCoords).filter((c): c is LatLng => !!c),
    [waypoints]
  );

  const distanceKm = from && to ? haversineKm(from, to) : null;

  const html = useMemo(
    () =>
      buildLeafletHtml({
        origin: from ?? undefined,
        destination: to ?? undefined,
        waypoints: wps,
        fallbackCenter: DAKAR_FALLBACK,
        static: !interactive,
      }),
    [from, to, wps, interactive]
  );

  const noPoints = !from && !to;

  const openExternal = () => {
    if (onOpenExternal) return onOpenExternal();
    if (!to) return;
    const dest = `${to.latitude},${to.longitude}`;
    const orig = from ? `${from.latitude},${from.longitude}` : "";
    const url = Platform.select({
      ios: `http://maps.apple.com/?saddr=${orig}&daddr=${dest}&dirflg=d`,
      android: `google.navigation:q=${dest}`,
      default: `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}`,
    }) as string;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}`).catch(() => {});
    });
  };

  // Si aucun point géocodable → UI "carte indisponible" plutôt que WebView vide.
  if (noPoints) {
    return (
      <Pressable
        onPress={openExternal}
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
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={StyleSheet.absoluteFillObject}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit
        scrollEnabled={interactive}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        androidLayerType="hardware"
        // Sur iOS, on désactive la sélection texte pour un feeling app natif.
        allowsBackForwardNavigationGestures={false}
        // Réglage important : on ne veut pas que la WebView bloque les gestures
        // du ScrollView parent quand `interactive` est faux.
        pointerEvents={interactive ? "auto" : "none"}
      />

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

      <Pressable
        onPress={openExternal}
        style={styles.externalBtn}
        hitSlop={10}
        testID="map-open-external"
      >
        <Ionicons name="open-outline" size={14} color={colors.midnight} />
      </Pressable>

      {/* Overlay transparent : capture les taps quand !interactive pour éviter
          que la WebView vole le tap et permettre onPress parent. */}
      {!interactive && onPress ? (
        <Pressable
          onPress={onPress}
          style={StyleSheet.absoluteFillObject}
          testID="map-tap-overlay"
        />
      ) : null}
    </Wrapper>
  );
}

// Region calculée pour un futur usage (map plein-écran interactif) — évite
// dead code élimination si tree-shaking agressif.
export const _debugRegionHelper = regionForCoordinates;

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: colors.surfaceWarm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.sm,
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
