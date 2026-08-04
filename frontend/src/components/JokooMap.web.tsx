import React, { useMemo } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { Txt } from "@/src/components/ui";
import { geocodeCitySN, haversineKm, LatLng } from "@/src/utils/geo";
import type { JokooMapProps } from "./JokooMap";

/**
 * Version Web du composant JokooMap.
 *
 * Sur navigateur, `react-native-maps` n'est pas disponible (Metro refuse
 * les modules natifs). On propose ici une version simplifiée mais élégante :
 * un aperçu SVG stylisé avec les 2 marqueurs et un CTA "Ouvrir dans Maps"
 * qui délègue à Google Maps directions dans un nouvel onglet.
 *
 * Métro sélectionne automatiquement ce fichier lorsque `Platform.OS === 'web'`.
 */

const DAKAR_FALLBACK: LatLng = { latitude: 14.7167, longitude: -17.4677 };

function resolveCoords(p?: JokooMapProps["origin"]): LatLng | null {
  if (!p) return null;
  if (p.coords) return p.coords;
  return geocodeCitySN(p.city);
}

export function JokooMap({
  origin,
  destination,
  height = 200,
  borderRadius = radius.lg,
  hideDistance = false,
  onPress,
  onOpenExternal,
}: JokooMapProps) {
  const from = useMemo(() => resolveCoords(origin), [origin]);
  const to = useMemo(() => resolveCoords(destination), [destination]);
  const distanceKm = from && to ? haversineKm(from, to) : null;

  const openMaps = () => {
    if (onOpenExternal) return onOpenExternal();
    const o = from || DAKAR_FALLBACK;
    const d = to;
    if (!d) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${o.latitude},${o.longitude}&destination=${d.latitude},${d.longitude}`;
    Linking.openURL(url).catch(() => {});
  };

  const noPoints = !from && !to;

  if (noPoints) {
    return (
      <View
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
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress || openMaps}
      style={[
        styles.container,
        {
          height,
          borderRadius,
        },
      ]}
    >
      {/* Fond stylisé (dégradé subtil beige → turquoise pâle) */}
      <View style={StyleSheet.absoluteFillObject}>
        <View style={styles.gradA} />
        <View style={styles.gradB} />
      </View>

      {/* Contenu central */}
      <View style={styles.content}>
        <View style={styles.route}>
          {from ? (
            <View style={styles.pointRow}>
              <View style={[styles.dot, { backgroundColor: colors.turquoise }]} />
              <Txt size="sm" weight="700" numberOfLines={1} style={{ maxWidth: 180 }}>
                {origin?.city || "Départ"}
              </Txt>
            </View>
          ) : null}
          {from && to ? <View style={styles.line} /> : null}
          {to ? (
            <View style={styles.pointRow}>
              <View style={[styles.dot, { backgroundColor: colors.midnight }]} />
              <Txt size="sm" weight="700" numberOfLines={1} style={{ maxWidth: 180 }}>
                {destination?.city || "Arrivée"}
              </Txt>
            </View>
          ) : null}
        </View>

        <Pressable onPress={openMaps} style={styles.cta} hitSlop={8}>
          <Ionicons name="navigate" size={13} color={colors.white} />
          <Txt size="xs" weight="700" color={colors.white} style={{ marginLeft: 6 }}>
            Ouvrir dans Maps
          </Txt>
        </Pressable>
      </View>

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
    </Pressable>
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
  gradA: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.brandTertiary,
    opacity: 0.6,
  },
  gradB: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "40%",
    bottom: 0,
    backgroundColor: colors.surfaceWarm,
    opacity: 0.7,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  route: {
    alignItems: "flex-start",
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  line: {
    width: 2,
    height: 20,
    backgroundColor: colors.turquoise,
    marginLeft: 4,
    marginVertical: 2,
    opacity: 0.6,
  },
  cta: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.turquoise,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
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
});
