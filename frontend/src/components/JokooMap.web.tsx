import React, { useMemo } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { Txt } from "@/src/components/ui";
import { geocodeCitySN, haversineKm, LatLng } from "@/src/utils/geo";
import { buildLeafletHtml } from "@/src/utils/leafletHtml";
import type { JokooMapProps, JokooMapPoint } from "./JokooMap";

/**
 * Version Web du composant JokooMap.
 *
 * On réutilise le HTML Leaflet généré par `buildLeafletHtml` mais on le
 * charge dans une <iframe srcDoc>. Résultat : même carte OpenStreetMap
 * qu'en natif, sans dépendance npm supplémentaire, sans clé API.
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

  const openExternal = () => {
    if (onOpenExternal) return onOpenExternal();
    if (!to) return;
    const dest = `${to.latitude},${to.longitude}`;
    const orig = from ? `${from.latitude},${from.longitude}` : "";
    const url = `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}`;
    Linking.openURL(url).catch(() => {});
  };

  const noPoints = !from && !to;

  if (noPoints) {
    return (
      <Pressable
        onPress={openExternal}
        style={[
          styles.container,
          {
            height,
            borderRadius,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surfaceWarm,
          },
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

  // Sur react-native-web, `View` accepte un enfant HTML natif via createElement.
  // On utilise directement une iframe React pour charger le HTML Leaflet.
  return (
    <Wrapper
      onPress={onPress}
      style={[styles.container, { height, borderRadius }]}
    >
      {React.createElement("iframe", {
        srcDoc: html,
        title: "Jokoo Map",
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          border: "none",
          pointerEvents: interactive ? "auto" : "none",
        },
        sandbox: "allow-scripts allow-same-origin",
        loading: "lazy",
        referrerPolicy: "no-referrer",
      })}

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
