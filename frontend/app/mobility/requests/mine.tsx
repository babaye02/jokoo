// Mes demandes de trajet — Passager
// Liste avec actions : republier, annuler, voir détail

import React, { useCallback, useState } from "react";
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { rideRequestsApi, RideRequest, formatDateShort, requestStatusColor, requestStatusLabel } from "@/src/mobility/rideRequests";

export default function MyRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await rideRequestsApi.mine();
      setRows(list || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cancel = (id: string) => {
    Alert.alert("Annuler cette demande ?", "Vous pourrez la republier plus tard.", [
      { text: "Retour", style: "cancel" },
      {
        text: "Annuler la demande",
        style: "destructive",
        onPress: async () => {
          try {
            await rideRequestsApi.cancel(id);
            load();
          } catch (e: any) {
            Alert.alert("Erreur", e?.message || "Impossible d'annuler.");
          }
        },
      },
    ]);
  };

  const republish = async (id: string) => {
    try {
      await rideRequestsApi.republish(id);
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de republier.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, marginLeft: 8 }}>Mes demandes</Txt>
        <Pressable onPress={() => router.push("/mobility/requests/publish")} style={styles.addBtn}>
          <Ionicons name="add" size={20} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={colors.turquoise} /></View>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="hand-right-outline" size={40} color={colors.textMuted} />
            <Txt weight="700" style={{ marginTop: 10 }}>Aucune demande publiée</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>Publiez votre première demande pour recevoir des offres de conducteurs.</Txt>
            <Pressable onPress={() => router.push("/mobility/requests/publish")} style={styles.emptyBtn}>
              <Ionicons name="add-circle" size={18} color={colors.white} />
              <Txt weight="700" color={colors.white} style={{ marginLeft: 6 }}>Publier une demande</Txt>
            </Pressable>
          </View>
        ) : (
          rows.map((r) => {
            const c = requestStatusColor(r.status);
            const canCancel = r.status === "open" || r.status === "matched";
            const canRepublish = r.status === "expired" || r.status === "cancelled";
            return (
              <View key={r.id} style={styles.card}>
                <Pressable onPress={() => router.push({ pathname: "/mobility/requests/[id]", params: { id: r.id } })}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Txt size="md" weight="800">{r.from_city} → {r.to_city}</Txt>
                      <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                        {formatDateShort(r.date)} · {r.time_from}{r.time_to ? `–${r.time_to}` : ""} · {r.seats} pass.
                      </Txt>
                    </View>
                    <View style={[styles.badge, { backgroundColor: c.bg }]}>
                      <Txt size="xxs" weight="700" color={c.fg}>{requestStatusLabel(r.status)}</Txt>
                    </View>
                  </View>
                  {r.offers_count > 0 ? (
                    <View style={styles.offersHint}>
                      <Ionicons name="mail" size={12} color={colors.turquoise} />
                      <Txt size="xxs" weight="700" color={colors.turquoise} style={{ marginLeft: 4 }}>
                        {r.offers_count} offre{r.offers_count > 1 ? "s" : ""} reçue{r.offers_count > 1 ? "s" : ""} · Voir les détails
                      </Txt>
                    </View>
                  ) : null}
                </Pressable>

                <View style={styles.actions}>
                  {canRepublish ? (
                    <Pressable onPress={() => republish(r.id)} style={[styles.actBtn, { backgroundColor: colors.turquoise }]} testID={`req-mine-republish-${r.id.slice(0, 8)}`}>
                      <Ionicons name="refresh" size={14} color={colors.white} />
                      <Txt size="xs" weight="700" color={colors.white} style={{ marginLeft: 4 }}>Republier</Txt>
                    </Pressable>
                  ) : null}
                  {canCancel ? (
                    <Pressable onPress={() => cancel(r.id)} style={[styles.actBtn, { backgroundColor: "#FDECEC" }]} testID={`req-mine-cancel-${r.id.slice(0, 8)}`}>
                      <Ionicons name="close-circle" size={14} color="#B33131" />
                      <Txt size="xs" weight="700" color="#B33131" style={{ marginLeft: 4 }}>Annuler</Txt>
                    </Pressable>
                  ) : null}
                </View>
              </View>
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
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft, gap: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  offersHint: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.brandTertiary, marginTop: 8 },
  actions: { flexDirection: "row", gap: 6, marginTop: 4 },
  actBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  empty: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
  emptyBtn: { marginTop: spacing.lg, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, height: 44, borderRadius: 999, backgroundColor: colors.turquoise },
});
