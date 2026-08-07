// Wallet Dashboard — écran principal (Airbnb / Wise / Wave inspired).
// Balance héroïque, boutons rapides (recharger / retirer / historique),
// alertes (solde bas, wallet frozen), 5 dernières entrées du ledger.

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { formatXof } from "@/src/pricing";
import {
  LedgerEntry,
  TRANSACTION_ICON,
  WalletSnapshot,
  formatXofSigned,
  walletApi,
} from "@/src/wallet/api";

export default function WalletDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [w, h] = await Promise.all([
        walletApi.me(),
        walletApi.history({ limit: 5 }).catch(() => ({ items: [], cursor: null, has_more: false })),
      ]);
      setWallet(w);
      setLedger(h.items || []);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger le portefeuille.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const isProvider = wallet?.kind === "prestataire";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ───────────────────────────────── */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Txt size="lg" weight="700">Portefeuille</Txt>
          <Pressable onPress={() => router.push("/wallet/history")} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="time-outline" size={22} color={colors.text} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.turquoise} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Txt color={colors.danger}>{error}</Txt>
            <Btn title="Réessayer" onPress={load} style={{ marginTop: spacing.md }} />
          </View>
        ) : wallet ? (
          <>
            {/* ── HERO Balance card ─────────────────── */}
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <Txt size="xs" weight="600" color="rgba(255,255,255,0.7)" style={{ letterSpacing: 1.5 }}>
                  SOLDE DISPONIBLE
                </Txt>
                <View style={styles.badge}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.turquoise} />
                  <Txt size="xs" weight="700" color={colors.turquoise} style={{ marginLeft: 4 }}>
                    Sécurisé
                  </Txt>
                </View>
              </View>
              <Txt
                size="hero"
                weight="800"
                color={wallet.balance_available_xof < 0 ? "#FF9EAB" : "#FFFFFF"}
                style={styles.balanceValue}
              >
                {formatXof(wallet.balance_available_xof)}
              </Txt>
              <View style={styles.heroMeta}>
                {wallet.balance_locked_xof > 0 && (
                  <View style={styles.chip}>
                    <Ionicons name="lock-closed" size={11} color="#FFC97A" />
                    <Txt size="xs" color="rgba(255,255,255,0.85)" style={{ marginLeft: 4 }}>
                      {formatXof(wallet.balance_locked_xof)} verrouillés
                    </Txt>
                  </View>
                )}
                {wallet.balance_pending_xof > 0 && (
                  <View style={styles.chip}>
                    <Ionicons name="time" size={11} color="#A0E3D4" />
                    <Txt size="xs" color="rgba(255,255,255,0.85)" style={{ marginLeft: 4 }}>
                      {formatXof(wallet.balance_pending_xof)} en attente
                    </Txt>
                  </View>
                )}
              </View>
            </View>

            {/* ── ALERT strip ────────────────────────── */}
            {wallet.status === "frozen" && (
              <AlertStrip
                tone="danger"
                icon="lock-closed"
                title="Wallet gelé"
                body="Contactez le support pour réactiver votre portefeuille."
              />
            )}
            {wallet.balance_available_xof < 0 && (
              <AlertStrip
                tone="danger"
                icon="alert-circle"
                title="Solde négatif"
                body={`Vous devez ${formatXof(-wallet.balance_available_xof)} à Jokoo. Rechargez pour continuer à recevoir des réservations.`}
              />
            )}
            {wallet.low_balance_warning && wallet.balance_available_xof >= 0 && (
              <AlertStrip
                tone="warning"
                icon="battery-half"
                title="Solde faible"
                body="Rechargez pour éviter toute interruption de service."
              />
            )}
            {!wallet.can_receive_bookings && isProvider && (
              <AlertStrip
                tone="danger"
                icon="ban"
                title="Réservations suspendues"
                body="Votre solde ne permet plus de recevoir de nouvelles réservations."
              />
            )}

            {/* ── QUICK ACTIONS ─────────────────────── */}
            <View style={styles.actionRow}>
              <ActionCircle
                icon="arrow-down"
                label="Recharger"
                tint={colors.turquoise}
                bg={colors.brandTertiary}
                onPress={() => router.push("/wallet/recharge")}
              />
              <ActionCircle
                icon="arrow-up"
                label="Retirer"
                tint="#B47F00"
                bg="#FFF7E6"
                disabled={wallet.balance_available_xof <= 0}
                onPress={() => router.push("/wallet/withdraw")}
              />
              <ActionCircle
                icon="time"
                label="Historique"
                tint="#4A4A4A"
                bg="#F2F2F2"
                onPress={() => router.push("/wallet/history")}
              />
              {isProvider && (
                <ActionCircle
                  icon="star"
                  label="Jokoo Pro"
                  tint="#7C3AED"
                  bg="#EDE9FE"
                  onPress={() => router.push("/wallet/jokoo-pro")}
                />
              )}
            </View>

            {/* ── STATS row ─────────────────────────── */}
            <View style={styles.statsRow}>
              <StatBlock
                label="Rechargé"
                value={formatXof(wallet.stats.total_recharged_xof)}
                icon="arrow-down-circle-outline"
                iconTint={colors.turquoise}
              />
              <View style={styles.statsDivider} />
              <StatBlock
                label={isProvider ? "Commissions" : "Retiré"}
                value={formatXof(
                  isProvider ? wallet.stats.total_commissions_paid_xof : wallet.stats.total_withdrawn_xof
                )}
                icon={isProvider ? "trending-down-outline" : "arrow-up-circle-outline"}
                iconTint="#B47F00"
              />
            </View>

            {/* ── RECENT ledger ─────────────────────── */}
            <View style={styles.sectionHeader}>
              <Txt size="lg" weight="700">Activité récente</Txt>
              <Pressable onPress={() => router.push("/wallet/history")}>
                <Txt size="sm" weight="600" color={colors.turquoise}>
                  Tout voir
                </Txt>
              </Pressable>
            </View>

            {ledger.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="wallet-outline" size={36} color={colors.textMuted} />
                <Txt size="sm" color={colors.textMuted} style={{ marginTop: spacing.sm, textAlign: "center" }}>
                  Aucune opération pour le moment.{"\n"}Rechargez votre portefeuille pour commencer.
                </Txt>
              </Card>
            ) : (
              <View style={styles.ledgerList}>
                {ledger.map((e) => (
                  <LedgerRow
                    key={e.id}
                    entry={e}
                    onPress={() => router.push({ pathname: "/wallet/history", params: { focus: e.id } })}
                  />
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Subcomponents ─────────────────────────────────────────

function AlertStrip({
  tone,
  icon,
  title,
  body,
}: {
  tone: "warning" | "danger" | "info";
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"
      ? { bg: "#FDECEC", fg: "#B33131", accent: "#F5B5B5" }
      : tone === "warning"
      ? { bg: "#FFF7E6", fg: "#B47F00", accent: "#F1D492" }
      : { bg: "#E6F4FF", fg: "#0057A0", accent: "#B0D8FA" };
  return (
    <View style={[styles.alert, { backgroundColor: palette.bg, borderColor: palette.accent }]}>
      <Ionicons name={icon} size={20} color={palette.fg} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Txt size="sm" weight="700" color={palette.fg}>
          {title}
        </Txt>
        <Txt size="xs" color={palette.fg} style={{ marginTop: 2, opacity: 0.9 }}>
          {body}
        </Txt>
      </View>
    </View>
  );
}

function ActionCircle({
  icon,
  label,
  tint,
  bg,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
  bg: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.action,
        pressed && !disabled ? { opacity: 0.7 } : null,
        disabled ? { opacity: 0.35 } : null,
      ]}
      hitSlop={8}
    >
      <View style={[styles.actionCircle, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Txt size="xs" weight="600" style={{ marginTop: 6 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

function StatBlock({
  label,
  value,
  icon,
  iconTint,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconTint: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: "flex-start" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name={icon} size={14} color={iconTint} />
        <Txt size="xs" color={colors.textMuted} weight="600" style={{ marginLeft: 4, letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </Txt>
      </View>
      <Txt size="lg" weight="700" style={{ marginTop: 4 }}>
        {value}
      </Txt>
    </View>
  );
}

export function LedgerRow({ entry, onPress }: { entry: LedgerEntry; onPress?: () => void }) {
  const iconName = (TRANSACTION_ICON[entry.transaction_type] || "swap-horizontal") as keyof typeof Ionicons.glyphMap;
  const isCredit = entry.kind === "credit";
  const dt = new Date(entry.at);
  const dateStr = dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const timeStr = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ledgerRow, pressed ? { backgroundColor: "#F7F5F0" } : null]}
    >
      <View style={[styles.ledgerIcon, { backgroundColor: isCredit ? "#E9F9EF" : "#FDECEC" }]}>
        <Ionicons name={iconName} size={18} color={isCredit ? "#1F7A3F" : "#B33131"} />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Txt size="sm" weight="600" numberOfLines={1}>
          {entry.label}
        </Txt>
        <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>
          {dateStr} · {timeStr}
        </Txt>
      </View>
      <Txt size="sm" weight="700" color={isCredit ? "#1F7A3F" : "#B33131"}>
        {formatXofSigned(entry.amount_xof, entry.kind)}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerBtn: { padding: 4, width: 40 },
  center: { paddingVertical: spacing.xl * 2, alignItems: "center", justifyContent: "center" },

  hero: {
    backgroundColor: colors.midnight,
    borderRadius: radius.xl,
    padding: spacing.xl,
    paddingVertical: spacing.xl + 4,
    ...shadow.md,
    marginBottom: spacing.lg,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  balanceValue: { marginTop: spacing.xs, fontVariant: ["tabular-nums"] as any },
  heroMeta: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginRight: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(24,198,163,0.15)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },

  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },

  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: spacing.lg,
    paddingHorizontal: 4,
  },
  action: { alignItems: "center", minWidth: 68 },
  actionCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },

  statsRow: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  statsDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },

  emptyCard: { padding: spacing.xl, alignItems: "center" },

  ledgerList: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  ledgerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
