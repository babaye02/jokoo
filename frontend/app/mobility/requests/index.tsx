// Feed public des demandes de trajets — Conducteurs peuvent proposer

import React, { useCallback, useMemo, useState } from "react";
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { rideRequestsApi, RideRequest, formatDateShort, requestStatusColor, requestStatusLabel } from "@/src/mobility/rideRequests";

export default function RequestsFeed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await rideRequestsApi.list({ limit: 100 });
      setRows(list || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      r.from_city.toLowerCase().includes(s) ||
      r.to_city.toLowerCase().includes(s) ||
      (r.notes || "").toLowerCase().includes(s) ||
      (r.passenger_name || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, marginLeft: 8 }}>Demandes de trajets</Txt>
        <Pressable onPress={() => router.push("/mobility/requests/publish")} style={styles.addBtn} testID="req-feed-publish">
          <Ionicons name="add" size={20} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Ville de départ, destination…" placeholderTextColor={colors.textMuted} style={styles.searchInput} testID="req-feed-search" />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.turquoise} />
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState onPublish={() => router.push("/mobility/requests/publish")} />
        ) : (
          filtered.map((r) => <RequestCard key={r.id} req={r} onPress={() => router.push({ pathname: "/mobility/requests/[id]", params: { id: r.id } })} />)
        )}
      </ScrollView>
    </View>
  );
}

function RequestCard({ req, onPress }: { req: RideRequest; onPress: () => void }) {
  const c = requestStatusColor(req.status);
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`req-card-${req.id.slice(0, 8)}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={18} color={colors.turquoise} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt size="sm" weight="700" numberOfLines={1}>{req.passenger_name || "Passager"}</Txt>
          <Txt size="xxs" color={colors.textMuted}>{formatDateShort(req.created_at)}</Txt>
        </View>
        <View style={[styles.badge, { backgroundColor: c.bg }]}>
          <Txt size="xxs" weight="700" color={c.fg}>{requestStatusLabel(req.status)}</Txt>
        </View>
      </View>

      <View style={styles.routeRow}>
        <View style={styles.routeDot}><View style={styles.routeDotInner} /></View>
        <Txt size="md" weight="700" style={{ flex: 1, marginLeft: 8 }}>{req.from_city}</Txt>
      </View>
      <View style={[styles.routeRow, { marginTop: 2 }]}>
        <View style={[styles.routeDot, { backgroundColor: "#F97316" }]}><Ionicons name="location" size={9} color={colors.white} /></View>
        <Txt size="md" weight="700" style={{ flex: 1, marginLeft: 8 }}>{req.to_city}</Txt>
      </View>

      <View style={styles.metaRow}>
        <Meta icon="calendar" text={formatDateShort(req.date)} />
        <Meta icon="time" text={req.time_from + (req.time_to ? `–${req.time_to}` : "")} />
        <Meta icon="people" text={`${req.seats} pass.`} />
        {req.budget_xof ? <Meta icon="cash" text={`≤ ${req.budget_xof.toLocaleString("fr-FR")} F`} /> : null}
      </View>

      {req.offers_count > 0 ? (
        <View style={styles.offersHint}>
          <Ionicons name="paper-plane" size={12} color={colors.turquoise} />
          <Txt size="xxs" weight="700" color={colors.turquoise} style={{ marginLeft: 4 }}>
            {req.offers_count} offre{req.offers_count > 1 ? "s" : ""} reçue{req.offers_count > 1 ? "s" : ""}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={12} color={colors.textMuted} />
      <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 4 }}>{text}</Txt>
    </View>
  );
}

function EmptyState({ onPublish }: { onPublish: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="hand-right" size={32} color={colors.turquoise} />
      </View>
      <Txt size="lg" weight="800" style={{ marginTop: 12, textAlign: "center" }}>Aucune demande pour le moment</Txt>
      <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center", maxWidth: 280 }}>
        Soyez le premier à publier une demande. Les conducteurs sur votre axe seront notifiés.
      </Txt>
      <Pressable onPress={onPublish} style={styles.emptyBtn} testID="req-feed-empty-cta">
        <Ionicons name="add-circle" size={18} color={colors.white} />
        <Txt weight="700" color={colors.white} style={{ marginLeft: 6 }}>Publier une demande</Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.xl, marginTop: spacing.md, paddingHorizontal: 14, height: 42, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 13, color: colors.midnight, paddingVertical: 0 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft, gap: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  routeRow: { flexDirection: "row", alignItems: "center" },
  routeDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  routeDotInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  meta: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surface2 },
  offersHint: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.brandTertiary },
  empty: { paddingVertical: 40, alignItems: "center" },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  emptyBtn: { marginTop: spacing.lg, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, height: 48, borderRadius: 999, backgroundColor: colors.turquoise },
});
