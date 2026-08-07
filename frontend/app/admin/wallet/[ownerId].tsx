// Admin Wallet — Détail d'un wallet
// Solde, stats, ledger, actions admin : ajustement, changement statut, min-balance, bonus.

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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

import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { formatXof } from "@/src/pricing";
import { adminWalletApi, AdminWallet } from "@/src/wallet/admin";
import { LedgerEntry, TRANSACTION_ICON, formatXofSigned, statusColor, statusLabel } from "@/src/wallet/api";

type ActionKind = "adjust_credit" | "adjust_debit" | "bonus" | "min_balance" | null;

export default function AdminWalletDetail() {
  const router = useRouter();
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const insets = useSafeAreaInsets();
  const [wallet, setWallet] = useState<AdminWallet | null>(null);
  const [userInfo, setUserInfo] = useState<{ name?: string; email?: string; phone?: string; role?: string } | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<ActionKind>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      const [d, hist] = await Promise.all([
        adminWalletApi.getWallet(ownerId),
        adminWalletApi.getLedger(ownerId, 100),
      ]);
      setWallet(d.wallet);
      setUserInfo(d.user);
      setLedger(hist.items || []);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de charger le wallet.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const closeAction = () => {
    setAction(null);
    setAmount("");
    setReason("");
    setLabel("");
    setBusy(false);
  };

  const runAction = async () => {
    if (!wallet || !action) return;
    const amt = parseInt(amount.replace(/\s/g, ""), 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert("Montant invalide", "Merci de saisir un montant en F CFA (> 0).");
      return;
    }
    if (reason.trim().length < 5) {
      Alert.alert("Motif requis", "Merci de saisir un motif d'au moins 5 caractères.");
      return;
    }
    setBusy(true);
    try {
      if (action === "adjust_credit") {
        await adminWalletApi.adjust(wallet.owner_id, amt, reason.trim());
      } else if (action === "adjust_debit") {
        await adminWalletApi.adjust(wallet.owner_id, -amt, reason.trim());
      } else if (action === "bonus") {
        await adminWalletApi.grantBonus({
          owner_id: wallet.owner_id,
          amount_xof: amt,
          label: label.trim() || "Bonus Jokoo",
          category: "admin_manual",
        });
      } else if (action === "min_balance") {
        // amount here is min balance (can be negative). Overload: allow negative via prefix minus in input.
        const minBal = amount.trim().startsWith("-") ? -amt : amt;
        await adminWalletApi.setMinBalance(wallet.owner_id, minBal, reason.trim());
      }
      closeAction();
      await load();
      Alert.alert("Succès", "L'opération a été appliquée.");
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Opération refusée.");
      setBusy(false);
    }
  };

  const changeStatus = async (newStatus: "active" | "frozen" | "closed") => {
    if (!wallet) return;
    Alert.alert(
      newStatus === "active" ? "Réactiver le wallet ?" : newStatus === "frozen" ? "Geler le wallet ?" : "Fermer le wallet ?",
      newStatus === "closed"
        ? "Cette action est irréversible côté opérationnel. Le solde doit être à zéro."
        : "Confirmez le changement de statut.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          style: newStatus === "closed" ? "destructive" : "default",
          onPress: async () => {
            try {
              await adminWalletApi.setStatus(wallet.owner_id, newStatus, `Statut changé via admin mobile`);
              await load();
            } catch (e: any) {
              Alert.alert("Erreur", e?.message || "Changement de statut refusé.");
            }
          },
        },
      ]
    );
  };

  if (!ownerId) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <Txt color={colors.textMuted}>ID manquant.</Txt>
      </SafeAreaView>
    );
  }

  const c = wallet ? statusColor(wallet.status) : { bg: "#F2F2F2", fg: "#4A4A4A" };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, marginHorizontal: 8 }} numberOfLines={1}>
          {userInfo?.name || (wallet?.kind === "platform" ? "Jokoo Master" : "Wallet")}
        </Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.turquoise} />
          </View>
        ) : wallet ? (
          <>
            {/* Hero */}
            <View style={styles.hero}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Txt size="xs" weight="600" color="rgba(255,255,255,0.7)" style={{ letterSpacing: 1.5 }}>
                  SOLDE DISPONIBLE
                </Txt>
                <View style={[styles.statusPill, { backgroundColor: c.bg }]}>
                  <Txt size="xxs" weight="700" color={c.fg}>{statusLabel(wallet.status)}</Txt>
                </View>
              </View>
              <Txt
                size="hero"
                weight="800"
                color={wallet.balance_available < 0 ? "#FF9EAB" : colors.white}
                style={{ marginTop: 8, fontVariant: ["tabular-nums"] as any }}
              >
                {formatXof(wallet.balance_available)}
              </Txt>
              <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap" }}>
                {wallet.balance_locked > 0 && (
                  <View style={styles.chip}>
                    <Ionicons name="lock-closed" size={11} color="#FFC97A" />
                    <Txt size="xxs" color="rgba(255,255,255,0.85)" style={{ marginLeft: 4 }}>
                      {formatXof(wallet.balance_locked)} verrouillés
                    </Txt>
                  </View>
                )}
                {wallet.balance_pending > 0 && (
                  <View style={styles.chip}>
                    <Ionicons name="time" size={11} color="#A0E3D4" />
                    <Txt size="xxs" color="rgba(255,255,255,0.85)" style={{ marginLeft: 4 }}>
                      {formatXof(wallet.balance_pending)} en attente
                    </Txt>
                  </View>
                )}
                <View style={styles.chip}>
                  <Ionicons name="git-branch" size={11} color="rgba(255,255,255,0.7)" />
                  <Txt size="xxs" color="rgba(255,255,255,0.85)" style={{ marginLeft: 4 }}>v{wallet.version}</Txt>
                </View>
              </View>
            </View>

            {/* Infos user */}
            <View style={styles.card}>
              <InfoRow icon="person" label="Utilisateur" value={userInfo?.name || (wallet.kind === "platform" ? "Jokoo Master (plateforme)" : "—")} />
              <InfoRow icon="mail" label="Email" value={userInfo?.email || "—"} />
              <InfoRow icon="call" label="Téléphone" value={userInfo?.phone || "—"} />
              <InfoRow icon="briefcase" label="Type wallet" value={wallet.kind} />
              <InfoRow icon="key" label="Owner ID" value={wallet.owner_id} mono />
              <InfoRow icon="alert-circle" label="Plancher (min balance)" value={formatXof(wallet.min_balance)} />
            </View>

            {/* Stats */}
            <View style={styles.statsGrid}>
              <StatCard icon="arrow-down-circle" tint="#1F7A3F" label="Total crédité" value={formatXof(wallet.stats.total_credited)} />
              <StatCard icon="arrow-up-circle" tint="#B33131" label="Total débité" value={formatXof(wallet.stats.total_debited)} />
              <StatCard icon="cash" tint={colors.turquoise} label="Rechargé" value={formatXof(wallet.stats.total_recharged)} />
              <StatCard icon="trending-down" tint="#B47F00" label="Retiré" value={formatXof(wallet.stats.total_withdrawn)} />
              <StatCard icon="receipt" tint="#7C3AED" label="Commissions payées" value={formatXof(wallet.stats.total_commissions_paid)} />
            </View>

            {/* Actions admin */}
            <Txt size="lg" weight="700" style={{ marginTop: spacing.sm }}>Actions</Txt>
            <View style={styles.actionRow}>
              <ActionBtn icon="add-circle" label="Créditer" tint="#1F7A3F" onPress={() => setAction("adjust_credit")} />
              <ActionBtn icon="remove-circle" label="Débiter" tint="#B33131" onPress={() => setAction("adjust_debit")} />
              <ActionBtn icon="gift" label="Bonus" tint="#7C3AED" onPress={() => setAction("bonus")} />
              <ActionBtn icon="arrow-down" label="Plancher" tint="#B47F00" onPress={() => setAction("min_balance")} />
            </View>

            <View style={styles.statusRow}>
              {wallet.status !== "active" && (
                <Pressable onPress={() => changeStatus("active")} style={[styles.stBtn, { backgroundColor: "#E9F9EF" }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#1F7A3F" />
                  <Txt size="xs" weight="700" color="#1F7A3F" style={{ marginLeft: 6 }}>Réactiver</Txt>
                </Pressable>
              )}
              {wallet.status !== "frozen" && (
                <Pressable onPress={() => changeStatus("frozen")} style={[styles.stBtn, { backgroundColor: "#FFF7E6" }]}>
                  <Ionicons name="snow" size={16} color="#B47F00" />
                  <Txt size="xs" weight="700" color="#B47F00" style={{ marginLeft: 6 }}>Geler</Txt>
                </Pressable>
              )}
              {wallet.status !== "closed" && wallet.kind !== "platform" && (
                <Pressable onPress={() => changeStatus("closed")} style={[styles.stBtn, { backgroundColor: "#FDECEC" }]}>
                  <Ionicons name="close-circle" size={16} color="#B33131" />
                  <Txt size="xs" weight="700" color="#B33131" style={{ marginLeft: 6 }}>Fermer</Txt>
                </Pressable>
              )}
            </View>

            {/* Ledger */}
            <View style={styles.sectionHeader}>
              <Txt size="lg" weight="700">Journal ({ledger.length})</Txt>
            </View>
            {ledger.length === 0 ? (
              <View style={styles.emptyCard}>
                <Txt size="sm" color={colors.textMuted}>Aucune opération.</Txt>
              </View>
            ) : (
              <View style={styles.ledgerList}>
                {ledger.map((e) => {
                  const isCredit = e.kind === "credit";
                  const iconName = (TRANSACTION_ICON[e.transaction_type] || "swap-horizontal") as any;
                  return (
                    <View key={e.id} style={styles.ledgerRow}>
                      <View style={[styles.ledgerIcon, { backgroundColor: isCredit ? "#E9F9EF" : "#FDECEC" }]}>
                        <Ionicons name={iconName} size={16} color={isCredit ? "#1F7A3F" : "#B33131"} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Txt size="sm" weight="600" numberOfLines={1}>{e.label}</Txt>
                        <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                          {new Date(e.at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </Txt>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Txt size="sm" weight="700" color={isCredit ? "#1F7A3F" : "#B33131"}>
                          {formatXofSigned(e.amount_xof, e.kind)}
                        </Txt>
                        {e.balance_after_xof !== null && (
                          <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                            = {formatXof(e.balance_after_xof)}
                          </Txt>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Action modal */}
      <Modal visible={!!action} transparent animationType="fade" onRequestClose={closeAction}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Txt size="lg" weight="800">
              {action === "adjust_credit" ? "Créditer le wallet"
                : action === "adjust_debit" ? "Débiter le wallet"
                : action === "bonus" ? "Accorder un bonus"
                : "Plancher du wallet"}
            </Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
              {action === "min_balance"
                ? "Solde minimum autorisé. Peut être négatif pour autoriser un découvert (préfixer par −)."
                : "Ce mouvement sera loggé dans le journal d'audit avec votre ID."}
            </Txt>

            <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>MONTANT (F CFA)</Txt>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^\d-]/g, ""))}
              placeholder={action === "min_balance" ? "-5000" : "10000"}
              placeholderTextColor={colors.textSubtle}
              keyboardType="numbers-and-punctuation"
              style={styles.input}
              testID="admin-action-amount"
            />

            {action === "bonus" ? (
              <>
                <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>LIBELLÉ AFFICHÉ</Txt>
                <TextInput
                  value={label}
                  onChangeText={setLabel}
                  placeholder="Bonus de bienvenue"
                  placeholderTextColor={colors.textSubtle}
                  style={styles.input}
                />
              </>
            ) : null}

            <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>MOTIF (audit)</Txt>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Ex : correction de commission mal calculée"
              placeholderTextColor={colors.textSubtle}
              multiline
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" as any }]}
              testID="admin-action-reason"
            />

            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.lg }}>
              <Pressable onPress={closeAction} style={[styles.modalBtn, { backgroundColor: colors.surface2, flex: 1 }]}>
                <Txt weight="700">Annuler</Txt>
              </Pressable>
              <Btn
                title="Confirmer"
                onPress={runAction}
                loading={busy}
                variant="primary"
                testID="admin-action-confirm"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Subcomponents ───

function InfoRow({ icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Txt size="xs" color={colors.textMuted} style={{ width: 120, marginLeft: 10 }}>{label}</Txt>
      <Txt size="sm" weight="600" style={[{ flex: 1 }, mono ? ({ fontFamily: "System" as any, fontVariant: ["tabular-nums"] as any } as any) : null]} numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

function StatCard({ icon, tint, label, value }: { icon: any; tint: string; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Txt size="xxs" color={colors.textMuted} weight="700" style={{ marginTop: 6, letterSpacing: 0.5 }}>{label.toUpperCase()}</Txt>
      <Txt size="md" weight="800" style={{ marginTop: 2, fontVariant: ["tabular-nums"] as any }}>{value}</Txt>
    </View>
  );
}

function ActionBtn({ icon, label, tint, onPress }: { icon: any; label: string; tint: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.actionBtn} testID={`admin-action-${slugifyAscii(label)}`}>
      <View style={[styles.actionIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Txt size="xxs" weight="700" style={{ marginTop: 4 }}>{label}</Txt>
    </Pressable>
  );
}

function slugifyAscii(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const styles = StyleSheet.create({
  centerScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  hero: {
    backgroundColor: colors.midnight,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.card,
  },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  chip: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadow.soft,
  },
  infoRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statCard: {
    width: "47.5%",
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadow.soft,
  },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  actionBtn: { alignItems: "center", flex: 1 },
  actionIcon: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  statusRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  stBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  ledgerList: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow.soft },
  ledgerRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  ledgerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  emptyCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, ...shadow.soft },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 460, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 20 },
  input: {
    marginTop: 6, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 14, color: colors.midnight,
  },
  modalBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, height: 46, borderRadius: 999 },
});
