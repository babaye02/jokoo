// Wallet History — ledger paginé avec filtres par type de transaction.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { formatXof } from "@/src/pricing";
import {
  LedgerEntry,
  TRANSACTION_ICON,
  formatXofSigned,
  walletApi,
} from "@/src/wallet/api";

type FilterKey = "all" | "recharge" | "cash_commission" | "withdrawal" | "bonus" | "refund" | "jokoo_pro_charge";

const FILTERS: { key: FilterKey; label: string; server?: string }[] = [
  { key: "all", label: "Tout" },
  { key: "recharge", label: "Recharges", server: "recharge" },
  { key: "cash_commission", label: "Commissions", server: "cash_commission" },
  { key: "withdrawal", label: "Retraits", server: "withdrawal" },
  { key: "bonus", label: "Bonus", server: "bonus,manual_adjust_credit" },
  { key: "refund", label: "Remboursements", server: "refund" },
  { key: "jokoo_pro_charge", label: "Jokoo Pro", server: "jokoo_pro_charge" },
];

export default function WalletHistory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ focus?: string }>();
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [error, setError] = useState<string | null>(null);

  const currentFilter = useMemo(() => FILTERS.find((f) => f.key === filter), [filter]);

  const load = useCallback(
    async (opts: { append?: boolean; before?: string } = {}) => {
      try {
        setError(null);
        if (opts.append) setLoadingMore(true);
        const params = { limit: 30, kinds: currentFilter?.server, before: opts.before };
        const p = await walletApi.history(params as any);
        setItems((prev) => (opts.append ? [...prev, ...p.items] : p.items));
        setCursor(p.cursor);
        setHasMore(p.has_more);
      } catch (e: any) {
        setError(e?.message || "Impossible de charger l'historique.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [currentFilter]
  );

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const onEndReached = () => {
    if (!loadingMore && hasMore && cursor) {
      load({ append: true, before: cursor });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Txt size="lg" weight="700">Historique</Txt>
        <View style={styles.headerBtn} />
      </View>

      {/* Filter chips */}
      <FlatList
        data={FILTERS}
        keyExtractor={(f) => f.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const active = item.key === filter;
          return (
            <Pressable
              onPress={() => setFilter(item.key)}
              style={[styles.chip, active ? styles.chipActive : null]}
            >
              <Txt
                size="sm"
                weight="600"
                color={active ? colors.white : colors.text}
              >
                {item.label}
              </Txt>
            </Pressable>
          );
        }}
      />

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.turquoise} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Txt color={colors.danger}>{error}</Txt>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
          <Txt size="sm" color={colors.textMuted} style={{ marginTop: spacing.md, textAlign: "center" }}>
            Aucune opération dans cette catégorie.
          </Txt>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, paddingHorizontal: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => <FullLedgerRow entry={item} highlighted={item.id === params.focus} />}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ padding: spacing.lg }}>
                <ActivityIndicator size="small" color={colors.turquoise} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function FullLedgerRow({ entry, highlighted }: { entry: LedgerEntry; highlighted?: boolean }) {
  const iconName = (TRANSACTION_ICON[entry.transaction_type] || "swap-horizontal") as keyof typeof Ionicons.glyphMap;
  const isCredit = entry.kind === "credit";
  const dt = new Date(entry.at);
  const dateStr = dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={[styles.card, highlighted ? styles.cardHighlighted : null]}>
      <View style={styles.rowTop}>
        <View style={[styles.iconWrap, { backgroundColor: isCredit ? "#E9F9EF" : "#FDECEC" }]}>
          <Ionicons name={iconName} size={18} color={isCredit ? "#1F7A3F" : "#B33131"} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Txt size="md" weight="700" numberOfLines={2}>
            {entry.label}
          </Txt>
          <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
            {dateStr} · {timeStr}
          </Txt>
        </View>
        <Txt size="md" weight="800" color={isCredit ? "#1F7A3F" : "#B33131"}>
          {formatXofSigned(entry.amount_xof, entry.kind)}
        </Txt>
      </View>
      {entry.balance_after_xof != null && (
        <View style={styles.rowBottom}>
          <Txt size="xs" color={colors.textMuted}>
            Solde après opération
          </Txt>
          <Txt size="xs" weight="600" color={colors.text}>
            {formatXof(entry.balance_after_xof)}
          </Txt>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  headerBtn: { padding: 4, width: 40 },
  filterRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 8 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  cardHighlighted: {
    borderWidth: 2,
    borderColor: colors.turquoise,
  },
  rowTop: { flexDirection: "row", alignItems: "center" },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});
