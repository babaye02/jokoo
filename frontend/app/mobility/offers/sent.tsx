// Offres envoyées (conducteur)
import React, { useCallback, useState } from "react";
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator, Alert, Modal } from "react-native";
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

  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await rideRequestsApi.offersSent();
      setRows(list || []);
    } catch {} finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const withdraw = (id: string) => setConfirmWithdraw(id);

  const confirmWithdrawNow = async () => {
    if (!confirmWithdraw) return;
    setBusy(true);
    try {
      await rideRequestsApi.withdrawOffer(confirmWithdraw);
      setConfirmWithdraw(null);
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible.");
    } finally {
      setBusy(false);
    }
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

      <Modal visible={!!confirmWithdraw} transparent animationType="fade" onRequestClose={() => setConfirmWithdraw(null)}>
        <View style={styles.modalCenter}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons name="close-circle" size={28} color="#DC2626" />
            </View>
            <Txt size="xl" weight="800" style={{ marginTop: 12, textAlign: "center" }}>Retirer cette offre ?</Txt>
            <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
              Le passager ne pourra plus l&apos;accepter.
            </Txt>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 20, width: "100%" }}>
              <Pressable onPress={() => setConfirmWithdraw(null)} style={[styles.confirmBtn, { backgroundColor: colors.surface2, flex: 1 }]}>
                <Txt weight="700">Retour</Txt>
              </Pressable>
              <Pressable onPress={confirmWithdrawNow} disabled={busy} style={[styles.confirmBtn, { flex: 1.4, backgroundColor: "#DC2626" }]}>
                {busy ? <ActivityIndicator size="small" color={colors.white} /> : (
                  <>
                    <Ionicons name="close-circle" size={16} color={colors.white} />
                    <Txt weight="800" color={colors.white} style={{ marginLeft: 6 }}>Retirer l&apos;offre</Txt>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  modalCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  confirmCard: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: 20, padding: 24, alignItems: "center", ...shadow.card },
  confirmIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, height: 46, borderRadius: 999 },
  actBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
});
