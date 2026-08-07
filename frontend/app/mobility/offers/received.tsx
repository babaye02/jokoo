// Offres reçues (passager)
import React, { useCallback, useState } from "react";
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator, Image } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { rideRequestsApi, RideOffer, formatDateTime, offerStatusColor, offerStatusLabel } from "@/src/mobility/rideRequests";

export default function OffersReceived() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<RideOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await rideRequestsApi.offersReceived();
      setRows(list || []);
    } catch {} finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, marginLeft: 8 }}>Offres reçues</Txt>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={colors.turquoise} /></View>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="mail-outline" size={40} color={colors.textMuted} />
            <Txt weight="700" style={{ marginTop: 10 }}>Aucune offre reçue</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
              Publiez une demande pour recevoir des propositions de conducteurs.
            </Txt>
            <Pressable onPress={() => router.push("/mobility/requests/publish")} style={styles.cta}>
              <Ionicons name="add-circle" size={16} color={colors.white} />
              <Txt weight="700" color={colors.white} style={{ marginLeft: 6 }}>Publier une demande</Txt>
            </Pressable>
          </View>
        ) : (
          rows.map((o) => {
            const c = offerStatusColor(o.status);
            return (
              <Pressable
                key={o.id}
                onPress={() => router.push({ pathname: "/mobility/requests/[id]", params: { id: o.request_id } })}
                style={styles.card}
                testID={`offer-recv-${o.id.slice(0, 8)}`}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {o.driver_avatar ? (
                    <Image source={{ uri: o.driver_avatar }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatar}><Ionicons name="person" size={16} color={colors.turquoise} /></View>
                  )}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Txt size="sm" weight="800">{o.driver_name || "Conducteur"}</Txt>
                      {o.driver_verified ? <Ionicons name="checkmark-circle" size={12} color={colors.turquoise} /> : null}
                    </View>
                    <Txt size="xxs" color={colors.textMuted}>{formatDateTime(o.created_at)}</Txt>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Txt size="md" weight="800" style={{ fontVariant: ["tabular-nums"] as any }}>{o.price_xof.toLocaleString("fr-FR")} F</Txt>
                    <View style={[styles.badge, { backgroundColor: c.bg, marginTop: 4 }]}>
                      <Txt size="xxs" weight="700" color={c.fg}>{offerStatusLabel(o.status)}</Txt>
                    </View>
                  </View>
                </View>
                <Txt size="xxs" color={colors.textSecondary} style={{ marginTop: 8 }}>
                  {o.ride_summary?.from_city || "—"} → {o.ride_summary?.to_city || "—"}
                </Txt>
                {o.message ? <Txt size="xxs" color={colors.textSubtle} numberOfLines={2} style={{ marginTop: 4 }}>&quot;{o.message}&quot;</Txt> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
  cta: { flexDirection: "row", alignItems: "center", marginTop: 16, paddingHorizontal: 16, height: 42, borderRadius: 999, backgroundColor: colors.turquoise },
});
