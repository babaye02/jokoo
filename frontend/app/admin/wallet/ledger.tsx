// Admin Wallet — Journal global des transactions
// Filtres par type et statut. Toutes les transactions v2 de la plateforme.

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { formatXof } from "@/src/pricing";
import { adminWalletApi, AdminTransaction } from "@/src/wallet/admin";
import { TRANSACTION_ICON, statusColor, statusLabel } from "@/src/wallet/api";

const TX_TYPES: { key?: string; label: string }[] = [
  { label: "Tous" },
  { key: "recharge", label: "Recharges" },
  { key: "electronic_payment", label: "Paiements" },
  { key: "cash_commission", label: "Commissions" },
  { key: "refund", label: "Remboursements" },
  { key: "withdrawal", label: "Retraits" },
  { key: "bonus", label: "Bonus" },
  { key: "jokoo_pro_charge", label: "Jokoo Pro" },
  { key: "manual_adjust_credit", label: "Ajustements +" },
  { key: "manual_adjust_debit", label: "Ajustements −" },
];

const TX_STATUS: { key?: string; label: string }[] = [
  { label: "Tous statuts" },
  { key: "pending", label: "En attente" },
  { key: "completed", label: "Terminé" },
  { key: "failed", label: "Échoué" },
];

const TX_LABEL: Record<string, string> = {
  recharge: "Recharge",
  electronic_payment: "Paiement en ligne",
  cash_commission: "Commission cash",
  refund: "Remboursement",
  bonus: "Bonus",
  withdrawal: "Retrait",
  jokoo_pro_charge: "Jokoo Pro",
  promotion_fee: "Sponsor",
  badge_fee: "Badge",
  ad_fee: "Publicité",
  manual_adjust_credit: "Ajustement +",
  manual_adjust_debit: "Ajustement −",
  internal_transfer: "Transfert",
};

export default function AdminLedgerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<AdminTransaction[]>([]);
  const [typeF, setTypeF] = useState<string | undefined>(undefined);
  const [statusF, setStatusF] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await adminWalletApi.listTransactions({
        type: typeF,
        status: statusF,
        limit: 300,
      });
      setRows(list || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeF, statusF]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Journal global</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Type filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: 6, paddingVertical: spacing.sm }}>
        {TX_TYPES.map((f, i) => (
          <FilterPill key={f.key || `all-${i}`} label={f.label} active={typeF === f.key} onPress={() => setTypeF(f.key)} />
        ))}
      </ScrollView>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: 6 }}>
        {TX_STATUS.map((f, i) => (
          <FilterPill key={f.key || `all-${i}`} label={f.label} active={statusF === f.key} onPress={() => setStatusF(f.key)} />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.turquoise} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
            <Txt weight="700" style={{ marginTop: 10 }}>Aucune transaction</Txt>
          </View>
        ) : (
          <View style={styles.list}>
            {rows.map((t) => {
              const c = statusColor(t.status);
              const iconName = (TRANSACTION_ICON[t.type] || "swap-horizontal") as any;
              return (
                <View key={t.id} style={styles.txRow}>
                  <View style={styles.txIcon}>
                    <Ionicons name={iconName} size={16} color={colors.turquoise} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Txt size="sm" weight="700" numberOfLines={1}>{t.label || TX_LABEL[t.type] || t.type}</Txt>
                    <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                      {new Date(t.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {t.provider ? ` · ${t.provider}` : ""}
                    </Txt>
                    <Txt size="xxs" color={colors.textSubtle} numberOfLines={1} style={{ marginTop: 2, fontVariant: ["tabular-nums"] as any }}>
                      {t.from_owner_id.slice(0, 10)}… → {t.to_owner_id.slice(0, 10)}…
                    </Txt>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Txt size="sm" weight="800" style={{ fontVariant: ["tabular-nums"] as any }}>{formatXof(t.amount)}</Txt>
                    <View style={[styles.badge, { backgroundColor: c.bg, marginTop: 4 }]}>
                      <Txt size="xxs" weight="700" color={c.fg}>{statusLabel(t.status)}</Txt>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
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
  pill: {
    paddingHorizontal: 12, height: 32, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  pillActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow.soft },
  txRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  txIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  emptyCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, ...shadow.soft },
});
