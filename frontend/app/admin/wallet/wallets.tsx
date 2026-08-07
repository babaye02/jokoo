// Admin Wallet — Liste des wallets
// Recherche par owner_id/nom/email, filtres kind/status, ouverture drill-down.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { formatXof } from "@/src/pricing";
import { adminWalletApi, AdminWallet } from "@/src/wallet/admin";
import { statusColor, statusLabel } from "@/src/wallet/api";

type KindFilter = "all" | "client" | "prestataire" | "platform";
type StatusFilter = "all" | "active" | "frozen" | "closed";

const KIND_LABEL: Record<string, string> = {
  client: "Client",
  prestataire: "Prestataire",
  platform: "Plateforme",
  jokoo_pro: "Jokoo Pro",
};

export default function AdminWalletsList() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; status?: string }>();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<AdminWallet[]>([]);
  const [users, setUsers] = useState<Record<string, { name?: string; email?: string; role?: string }>>({});
  const [kindF, setKindF] = useState<KindFilter>((params.kind as KindFilter) || "all");
  const [statusF, setStatusF] = useState<StatusFilter>((params.status as StatusFilter) || "all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await adminWalletApi.listWallets({
        kind: kindF === "all" ? undefined : kindF,
        status: statusF === "all" ? undefined : statusF,
        limit: 200,
      });
      setRows(list || []);
      // Hydrate user info for the top rows (avoid N+1 for lite screens)
      const toFetch = (list || []).slice(0, 30).filter((w) => w.owner_id && !users[w.owner_id] && w.kind !== "platform");
      const results = await Promise.all(
        toFetch.map((w) =>
          adminWalletApi
            .getWallet(w.owner_id)
            .then((r) => ({ id: w.owner_id, user: r.user }))
            .catch(() => ({ id: w.owner_id, user: null as any }))
        )
      );
      const next: typeof users = { ...users };
      results.forEach((r) => {
        if (r.user) next[r.id] = { name: r.user.name, email: r.user.email, role: r.user.role };
      });
      setUsers(next);
    } catch (e: any) {
      setError(e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindF, statusF]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const u = users[r.owner_id];
      return (
        r.owner_id.toLowerCase().includes(s) ||
        (u?.name || "").toLowerCase().includes(s) ||
        (u?.email || "").toLowerCase().includes(s)
      );
    });
  }, [rows, users, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Tous les wallets</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Nom, email ou ID utilisateur"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          testID="admin-wallets-search"
        />
        {q ? (
          <Pressable onPress={() => setQ("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: 6, paddingTop: spacing.sm }}>
        {(["all", "client", "prestataire", "platform"] as KindFilter[]).map((k) => (
          <FilterPill key={k} label={k === "all" ? "Tous types" : KIND_LABEL[k] || k} active={kindF === k} onPress={() => setKindF(k)} />
        ))}
        <View style={{ width: 8 }} />
        {(["all", "active", "frozen", "closed"] as StatusFilter[]).map((s) => (
          <FilterPill key={s} label={s === "all" ? "Tous statuts" : statusLabel(s)} active={statusF === s} onPress={() => setStatusF(s)} />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.turquoise} />
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={22} color={colors.danger} />
            <Txt color={colors.danger} style={{ marginTop: 6 }}>{error}</Txt>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={40} color={colors.textMuted} />
            <Txt weight="700" style={{ marginTop: 10 }}>Aucun wallet</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
              Aucun portefeuille ne correspond à ces filtres.
            </Txt>
          </View>
        ) : (
          filtered.map((w) => {
            const u = users[w.owner_id];
            const c = statusColor(w.status);
            return (
              <Pressable
                key={w.id}
                onPress={() => router.push({ pathname: "/admin/wallet/[ownerId]", params: { ownerId: w.owner_id } })}
                style={styles.walletRow}
                testID={`admin-wallet-row-${w.owner_id}`}
              >
                <View style={styles.walletAvatar}>
                  <Ionicons
                    name={w.kind === "platform" ? "business" : w.kind === "prestataire" ? "briefcase" : "person"}
                    size={18}
                    color={colors.turquoise}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Txt size="sm" weight="700" numberOfLines={1}>
                    {u?.name || (w.kind === "platform" ? "Jokoo Master" : w.owner_id.slice(0, 12) + "…")}
                  </Txt>
                  <Txt size="xxs" color={colors.textMuted} numberOfLines={1} style={{ marginTop: 2 }}>
                    {u?.email || w.owner_id}
                  </Txt>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                    <View style={styles.tagLight}>
                      <Txt size="xxs" weight="700" color={colors.midnight}>{KIND_LABEL[w.kind] || w.kind}</Txt>
                    </View>
                    <View style={[styles.tagLight, { backgroundColor: c.bg }]}>
                      <Txt size="xxs" weight="700" color={c.fg}>{statusLabel(w.status)}</Txt>
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Txt
                    size="sm"
                    weight="800"
                    color={w.balance_available < 0 ? colors.danger : colors.midnight}
                    style={{ fontVariant: ["tabular-nums"] as any }}
                  >
                    {formatXof(w.balance_available)}
                  </Txt>
                  {w.balance_locked > 0 ? (
                    <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                      🔒 {formatXof(w.balance_locked)}
                    </Txt>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Txt size="xs" weight="700" color={active ? colors.white : colors.midnight}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: spacing.xl, marginTop: spacing.md,
    paddingHorizontal: 14, height: 42, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.midnight, paddingVertical: 0 },
  pill: {
    paddingHorizontal: 12, height: 32, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  pillActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  walletRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadow.soft,
  },
  walletAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  tagLight: { backgroundColor: colors.surface2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  errorCard: { padding: spacing.xl, alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
  emptyCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, ...shadow.soft },
});
