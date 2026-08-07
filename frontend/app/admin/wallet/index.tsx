// Admin Wallet — Dashboard
// KPIs plateforme, solde du wallet master, agrégats crédit/débit par type,
// activité récente et raccourcis vers les autres écrans admin wallet.

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { formatXof } from "@/src/pricing";
import { adminWalletApi, AdminDashboard } from "@/src/wallet/admin";
import { TRANSACTION_ICON, statusColor, statusLabel } from "@/src/wallet/api";
import { isStaff } from "@/src/perms";
import { useAuth } from "@/src/auth";

const TX_TYPE_LABEL: Record<string, string> = {
  recharge: "Recharges",
  electronic_payment: "Paiements en ligne",
  cash_commission: "Commissions cash",
  refund: "Remboursements",
  bonus: "Bonus",
  withdrawal: "Retraits",
  jokoo_pro_charge: "Jokoo Pro",
  promotion_fee: "Sponsors",
  badge_fee: "Badges",
  ad_fee: "Publicités",
  manual_adjust_credit: "Ajustements +",
  manual_adjust_debit: "Ajustements −",
  internal_transfer: "Transferts",
};

export default function AdminWalletDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const d = await adminWalletApi.dashboard();
      setData(d);
    } catch (e: any) {
      setError(e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!isStaff(user)) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <Ionicons name="lock-closed" size={44} color={colors.textMuted} />
        <Txt size="md" color={colors.textMuted} style={{ marginTop: spacing.md }}>
          Accès administrateur requis
        </Txt>
      </SafeAreaView>
    );
  }

  const totalCredits =
    data?.platform_credits_by_type.reduce((s, r) => s + (r.total || 0), 0) || 0;
  const totalDebits =
    data?.platform_debits_by_type.reduce((s, r) => s + (r.total || 0), 0) || 0;
  const net = totalCredits - totalDebits;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Finances Jokoo</Txt>
        <Pressable onPress={() => load()} style={styles.back} hitSlop={8} testID="admin-wallet-refresh">
          <Ionicons name="refresh" size={20} color={colors.midnight} />
        </Pressable>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.turquoise} />
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={24} color={colors.danger} />
            <Txt color={colors.danger} style={{ marginTop: 6 }}>{error}</Txt>
          </View>
        ) : data ? (
          <>
            {/* Hero — Solde plateforme */}
            <View style={styles.hero}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="business" size={16} color="rgba(255,255,255,0.75)" />
                <Txt size="xs" weight="600" color="rgba(255,255,255,0.7)" style={{ letterSpacing: 1.5 }}>
                  WALLET MASTER JOKOO
                </Txt>
              </View>
              <Txt size="hero" weight="800" color={colors.white} style={{ marginTop: 8, fontVariant: ["tabular-nums"] as any }}>
                {formatXof(data.platform_wallet?.balance_available || 0)}
              </Txt>
              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                <View style={styles.heroChip}>
                  <Ionicons name="trending-up" size={12} color="#A0E3D4" />
                  <Txt size="xs" color="rgba(255,255,255,0.9)" style={{ marginLeft: 4 }}>
                    +{formatXof(totalCredits)}
                  </Txt>
                </View>
                <View style={styles.heroChip}>
                  <Ionicons name="trending-down" size={12} color="#F5B5B5" />
                  <Txt size="xs" color="rgba(255,255,255,0.9)" style={{ marginLeft: 4 }}>
                    −{formatXof(totalDebits)}
                  </Txt>
                </View>
                <View style={styles.heroChip}>
                  <Ionicons name="equalizer" size={12} color={net >= 0 ? "#A0E3D4" : "#F5B5B5"} />
                  <Txt size="xs" color="rgba(255,255,255,0.9)" style={{ marginLeft: 4 }}>
                    Net {formatXof(net)}
                  </Txt>
                </View>
              </View>
            </View>

            {/* KPI grid */}
            <View style={styles.kpiGrid}>
              <KpiCard
                icon="wallet"
                label="Wallets"
                value={String(data.counts.wallets)}
                tint={colors.turquoise}
                onPress={() => router.push("/admin/wallet/wallets")}
              />
              <KpiCard
                icon="cash"
                label="Retraits en attente"
                value={String(data.counts.pending_withdrawals)}
                tint="#B47F00"
                badge={data.counts.pending_withdrawals > 0}
                onPress={() => router.push("/admin/wallet/withdrawals")}
              />
              <KpiCard
                icon="return-up-back"
                label="Remboursements"
                value={String(data.counts.pending_refunds)}
                tint={colors.info}
                badge={data.counts.pending_refunds > 0}
                onPress={() => router.push("/admin/wallet/withdrawals?tab=refunds")}
              />
              <KpiCard
                icon="star"
                label="Jokoo Pro actifs"
                value={String(data.counts.active_jokoo_pro)}
                tint="#7C3AED"
                onPress={() => router.push("/admin/wallet/wallets?kind=prestataire")}
              />
            </View>

            {/* Shortcuts */}
            <Txt size="lg" weight="700" style={{ marginTop: spacing.md }}>
              Administration
            </Txt>
            <View style={{ gap: 10 }}>
              <NavRow
                icon="list"
                title="Tous les wallets"
                sub="Recherche, filtres, ajustements manuels"
                onPress={() => router.push("/admin/wallet/wallets")}
                testID="admin-wallet-nav-wallets"
              />
              <NavRow
                icon="cash-outline"
                title="File des retraits"
                sub="Approuver, refuser, marquer payé"
                onPress={() => router.push("/admin/wallet/withdrawals")}
                badge={data.counts.pending_withdrawals}
                testID="admin-wallet-nav-withdrawals"
              />
              <NavRow
                icon="receipt-outline"
                title="Journal global"
                sub="Toutes les transactions plateforme"
                onPress={() => router.push("/admin/wallet/ledger")}
                testID="admin-wallet-nav-ledger"
              />
              <NavRow
                icon="settings-outline"
                title="Paramètres & commissions"
                sub="Taux, seuils, règles par catégorie"
                onPress={() => router.push("/admin/wallet/settings")}
                testID="admin-wallet-nav-settings"
              />
            </View>

            {/* Répartition des crédits */}
            {data.platform_credits_by_type.length > 0 ? (
              <>
                <Txt size="lg" weight="700" style={{ marginTop: spacing.md }}>
                  Revenus plateforme
                </Txt>
                <View style={styles.breakdown}>
                  {data.platform_credits_by_type
                    .sort((a, b) => b.total - a.total)
                    .map((r) => (
                      <BreakdownRow
                        key={r._id}
                        icon={(TRANSACTION_ICON[r._id] || "cash") as any}
                        label={TX_TYPE_LABEL[r._id] || r._id}
                        count={r.n}
                        amount={r.total}
                        positive
                      />
                    ))}
                </View>
              </>
            ) : null}

            {/* Répartition des débits (remboursements etc) */}
            {data.platform_debits_by_type.length > 0 ? (
              <>
                <Txt size="lg" weight="700" style={{ marginTop: spacing.md }}>
                  Sorties plateforme
                </Txt>
                <View style={styles.breakdown}>
                  {data.platform_debits_by_type
                    .sort((a, b) => b.total - a.total)
                    .map((r) => (
                      <BreakdownRow
                        key={r._id}
                        icon={(TRANSACTION_ICON[r._id] || "return-up-back") as any}
                        label={TX_TYPE_LABEL[r._id] || r._id}
                        count={r.n}
                        amount={r.total}
                        positive={false}
                      />
                    ))}
                </View>
              </>
            ) : null}

            {/* Activité récente */}
            {data.recent_transactions.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Txt size="lg" weight="700">Activité récente</Txt>
                  <Pressable onPress={() => router.push("/admin/wallet/ledger")}>
                    <Txt size="sm" weight="600" color={colors.turquoise}>Tout voir</Txt>
                  </Pressable>
                </View>
                <View style={styles.ledgerList}>
                  {data.recent_transactions.slice(0, 10).map((t) => {
                    const c = statusColor(t.status);
                    return (
                      <View key={t.id} style={styles.txRow}>
                        <View style={[styles.txIcon, { backgroundColor: `${colors.turquoise}18` }]}>
                          <Ionicons
                            name={(TRANSACTION_ICON[t.type] || "swap-horizontal") as any}
                            size={16}
                            color={colors.turquoise}
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Txt size="sm" weight="600" numberOfLines={1}>
                            {t.label || TX_TYPE_LABEL[t.type] || t.type}
                          </Txt>
                          <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                            {new Date(t.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </Txt>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Txt size="sm" weight="700">{formatXof(t.amount)}</Txt>
                          <View style={[styles.statusBadge, { backgroundColor: c.bg }]}>
                            <Txt size="xxs" weight="700" color={c.fg}>
                              {statusLabel(t.status)}
                            </Txt>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─────────── Subcomponents ───────────

function KpiCard({
  icon,
  label,
  value,
  tint,
  badge,
  onPress,
}: {
  icon: any;
  label: string;
  value: string;
  tint: string;
  badge?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.kpi, pressed && { opacity: 0.75 }]}>
      <View style={[styles.kpiIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={18} color={tint} />
        {badge ? <View style={styles.kpiBadge} /> : null}
      </View>
      <Txt size="xxl" weight="800" style={{ marginTop: 8, fontVariant: ["tabular-nums"] as any }}>{value}</Txt>
      <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>{label}</Txt>
    </Pressable>
  );
}

function NavRow({
  icon,
  title,
  sub,
  onPress,
  badge,
  testID,
}: {
  icon: any;
  title: string;
  sub: string;
  onPress: () => void;
  badge?: number;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.navRow} testID={testID}>
      <View style={styles.navIcon}>
        <Ionicons name={icon} size={20} color={colors.turquoise} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt weight="700">{title}</Txt>
        <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>{sub}</Txt>
      </View>
      {badge && badge > 0 ? (
        <View style={styles.countBadge}>
          <Txt size="xxs" weight="800" color={colors.white}>{badge}</Txt>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      )}
    </Pressable>
  );
}

function BreakdownRow({
  icon,
  label,
  count,
  amount,
  positive,
}: {
  icon: any;
  label: string;
  count: number;
  amount: number;
  positive: boolean;
}) {
  const tint = positive ? "#1F7A3F" : "#B33131";
  const bg = positive ? "#E9F9EF" : "#FDECEC";
  return (
    <View style={styles.brRow}>
      <View style={[styles.brIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Txt size="sm" weight="600">{label}</Txt>
        <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>{count} opération{count > 1 ? "s" : ""}</Txt>
      </View>
      <Txt size="sm" weight="700" color={tint}>
        {positive ? "+" : "−"}{formatXof(amount)}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  centerScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  errorCard: { padding: spacing.xl, alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
  hero: {
    backgroundColor: colors.midnight,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.card,
  },
  heroChip: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpi: {
    width: "47.5%", backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md, ...shadow.soft,
  },
  kpiIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  kpiBadge: { position: "absolute", top: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  navRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadow.soft,
  },
  navIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  countBadge: { minWidth: 24, height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  breakdown: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg, overflow: "hidden", ...shadow.soft,
  },
  brRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  brIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  ledgerList: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow.soft },
  txRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, marginTop: 4 },
});
