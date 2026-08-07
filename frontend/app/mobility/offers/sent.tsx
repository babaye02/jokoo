// Offres envoyées (conducteur)
import React, { useCallback, useState } from "react";
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { rideRequestsApi, RideOffer, formatDateTime, offerStatusColor, offerStatusLabel } from "@/src/mobility/rideRequests";

export default function OffersSent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<RideOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await rideRequestsApi.offersSent();
      setRows(list || []);
    } catch {} finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const withdraw = (id: string) => {
    Alert.alert("Retirer cette offre ?", "Le passager ne pourra plus l'accepter.", [
      { text: "Retour", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: async () => {
        try { await rideRequestsApi.withdrawOffer(id); load(); }
        catch (e: any) { Alert.alert("Erreur", e?.message || "Impossible."); }
      }},
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, marginLeft: 8 }}>Offres envoyées</Txt>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={colors.turquoise} /></View>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="paper-plane-outline" size={40} color={colors.textMuted} />
            <Txt weight="700" style={{ marginTop: 10 }}>Aucune offre envoyée</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
              Consultez les demandes de passagers et proposez vos trajets.
            </Txt>
            <Pressable onPress={() => router.push("/mobility/requests")} style={styles.cta}>
              <Ionicons name="search" size={16} color={colors.white} />
              <Txt weight="700" color={colors.white} style={{ marginLeft: 6 }}>Voir les demandes</Txt>
            </Pressable>
          </View>
        ) : (
          rows.map((o) => {
            const c = offerStatusColor(o.status);
            return (
              <Pressable
                key={o.id}
                onPress={() => o.request_id && router.push({ pathname: "/mobility/requests/[id]", params: { id: o.request_id } })}
                style={styles.card}
                testID={`offer-sent-${o.id.slice(0, 8)}`}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Txt size="sm" weight="800">{o.ride_summary?.from_city || "—"} → {o.ride_summary?.to_city || "—"}</Txt>
                    <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                      {formatDateTime(o.created_at)} · {o.price_xof.toLocaleString("fr-FR")} F CFA
                    </Txt>
                    {o.message ? <Txt size="xxs" color={colors.textSubtle} numberOfLines={1} style={{ marginTop: 2 }}>&quot;{o.message}&quot;</Txt> : null}
                  </View>
                  <View style={[styles.badge, { backgroundColor: c.bg }]}>
                    <Txt size="xxs" weight="700" color={c.fg}>{offerStatusLabel(o.status)}</Txt>
                  </View>
                </View>
                {o.status === "pending" ? (
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                    <Pressable onPress={() => withdraw(o.id)} style={[styles.actBtn, { backgroundColor: "#FEE2E2" }]}>
                      <Ionicons name="close" size={12} color="#DC2626" />
                      <Txt size="xxs" weight="700" color="#DC2626" style={{ marginLeft: 4 }}>Retirer</Txt>
                    </Pressable>
                  </View>
                ) : null}
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
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
  cta: { flexDirection: "row", alignItems: "center", marginTop: 16, paddingHorizontal: 16, height: 42, borderRadius: 999, backgroundColor: colors.turquoise },
  actBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
});
