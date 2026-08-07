// Admin Wallet — File d'attente des retraits + remboursements
// Onglets pending / approved / paid / refused (retraits), et onglet remboursements.
// Actions : approuver, refuser, marquer processing/payé.

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
import { adminWalletApi, AdminWithdrawal } from "@/src/wallet/admin";
import { PROVIDER_META, statusColor, statusLabel } from "@/src/wallet/api";

type Tab = "withdrawals" | "refunds";
type WdrStatus = "pending" | "approved" | "processing" | "paid" | "refused" | "cancelled" | "failed" | "all";

const WDR_STATUS_FILTERS: { key: WdrStatus; label: string }[] = [
  { key: "pending", label: "En attente" },
  { key: "approved", label: "Approuvés" },
  { key: "processing", label: "En cours" },
  { key: "paid", label: "Payés" },
  { key: "refused", label: "Refusés" },
  { key: "all", label: "Tous" },
];

type WdrAction = "approve" | "reject" | "mark_processing" | "mark_paid" | null;

export default function AdminWithdrawalsQueue() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "refunds" ? "refunds" : "withdrawals");
  const [status, setStatus] = useState<WdrStatus>("pending");
  const [rows, setRows] = useState<AdminWithdrawal[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<AdminWithdrawal | null>(null);
  const [action, setAction] = useState<WdrAction>(null);
  const [notes, setNotes] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      if (tab === "withdrawals") {
        const list = await adminWalletApi.listWithdrawals({
          status: status === "all" ? undefined : status,
          limit: 200,
        });
        setRows(list || []);
      } else {
        const list = await adminWalletApi.listRefunds({ limit: 100 });
        setRefunds(list || []);
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Chargement impossible.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, status]);

  useEffect(() => { load(); }, [load]);

  const closeAction = () => {
    setAction(null);
    setNotes("");
    setRef("");
    setBusy(false);
  };

  const runAction = async () => {
    if (!detail || !action) return;
    if ((action === "reject" || action === "mark_paid") && notes.trim().length < 3 && action === "reject") {
      Alert.alert("Motif requis", "Merci de saisir un motif de refus.");
      return;
    }
    if (action === "mark_paid" && ref.trim().length === 0) {
      Alert.alert("Référence requise", "Merci de saisir la référence du paiement chez le prestataire (Wave/OM/banque).");
      return;
    }
    setBusy(true);
    try {
      const result = await adminWalletApi.decideWithdrawal(detail.id, {
        action,
        admin_notes: notes.trim() || undefined,
        external_ref: action === "mark_paid" ? ref.trim() : undefined,
      });
      setDetail(result);
      closeAction();
      await load();
      Alert.alert("Succès", "L'opération a été appliquée.");
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Décision refusée.");
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Retraits & remboursements</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TabBtn label="Retraits" active={tab === "withdrawals"} onPress={() => setTab("withdrawals")} />
        <TabBtn label="Remboursements" active={tab === "refunds"} onPress={() => setTab("refunds")} />
      </View>

      {/* Filters — only for withdrawals */}
      {tab === "withdrawals" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: 6, paddingVertical: spacing.sm }}>
          {WDR_STATUS_FILTERS.map((f) => (
            <FilterPill key={f.key} label={f.label} active={status === f.key} onPress={() => setStatus(f.key)} />
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.turquoise} />
          </View>
        ) : tab === "withdrawals" ? (
          rows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-done-circle" size={40} color={colors.textMuted} />
              <Txt weight="700" style={{ marginTop: 10 }}>Rien à traiter</Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
                Aucun retrait ne correspond à ce filtre.
              </Txt>
            </View>
          ) : (
            rows.map((w) => (
              <WithdrawalRow key={w.id} row={w} onPress={() => setDetail(w)} />
            ))
          )
        ) : refunds.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="return-up-back" size={40} color={colors.textMuted} />
            <Txt weight="700" style={{ marginTop: 10 }}>Aucun remboursement</Txt>
          </View>
        ) : (
          refunds.map((r) => <RefundRow key={r.id || r._id} row={r} />)
        )}
      </ScrollView>

      {/* Detail modal */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
        {detail ? (
          <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <SafeAreaView edges={["top"]} style={styles.header}>
              <Pressable onPress={() => setDetail(null)} style={styles.back} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.midnight} />
              </Pressable>
              <Txt size="lg" weight="700">Retrait #{detail.id.slice(0, 8)}</Txt>
              <View style={{ width: 40 }} />
            </SafeAreaView>

            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom, gap: spacing.md }}>
              <View style={styles.hero}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Txt size="xs" weight="600" color="rgba(255,255,255,0.7)" style={{ letterSpacing: 1.5 }}>
                    MONTANT NET
                  </Txt>
                  <View style={[styles.statusPill, { backgroundColor: statusColor(detail.status).bg }]}>
                    <Txt size="xxs" weight="700" color={statusColor(detail.status).fg}>{statusLabel(detail.status)}</Txt>
                  </View>
                </View>
                <Txt size="hero" weight="800" color={colors.white} style={{ marginTop: 6, fontVariant: ["tabular-nums"] as any }}>
                  {formatXof(detail.amount_net_xof)}
                </Txt>
                <View style={{ flexDirection: "row", gap: spacing.md, marginTop: 8 }}>
                  <Txt size="xs" color="rgba(255,255,255,0.7)">Brut : {formatXof(detail.amount_gross_xof)}</Txt>
                  <Txt size="xs" color="rgba(255,255,255,0.7)">Frais : {formatXof(detail.amount_fee_xof)}</Txt>
                </View>
              </View>

              <View style={styles.card}>
                <Txt size="xs" weight="700" color={colors.textMuted} style={{ letterSpacing: 1 }}>DESTINATION</Txt>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 }}>
                  <Txt size="lg">{PROVIDER_META[detail.method as keyof typeof PROVIDER_META]?.emoji || "💳"}</Txt>
                  <Txt size="sm" weight="700">
                    {PROVIDER_META[detail.method as keyof typeof PROVIDER_META]?.label || detail.method}
                  </Txt>
                </View>
                {detail.destination.phone && (
                  <InfoRow icon="call" label="Téléphone" value={detail.destination.phone} />
                )}
                {detail.destination.iban && (
                  <InfoRow icon="business" label="IBAN" value={detail.destination.iban} mono />
                )}
                {detail.destination.bank_name && (
                  <InfoRow icon="briefcase" label="Banque" value={detail.destination.bank_name} />
                )}
                {detail.destination.holder_name && (
                  <InfoRow icon="person" label="Titulaire" value={detail.destination.holder_name} />
                )}
              </View>

              <View style={styles.card}>
                <InfoRow icon="key" label="User ID" value={detail.user_id} mono />
                <InfoRow icon="calendar" label="Créé le" value={new Date(detail.created_at).toLocaleString("fr-FR")} />
                <InfoRow icon="time" label="Modifié le" value={new Date(detail.updated_at).toLocaleString("fr-FR")} />
                {detail.external_ref ? <InfoRow icon="link" label="Réf externe" value={detail.external_ref} mono /> : null}
                {detail.admin_notes ? <InfoRow icon="clipboard" label="Notes admin" value={detail.admin_notes} /> : null}
              </View>

              {detail.audit_trail && detail.audit_trail.length > 0 ? (
                <View style={styles.card}>
                  <Txt size="xs" weight="700" color={colors.textMuted} style={{ letterSpacing: 1 }}>HISTORIQUE</Txt>
                  {detail.audit_trail.map((a: any, i: number) => (
                    <View key={i} style={styles.auditRow}>
                      <View style={styles.auditDot} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Txt size="xs" weight="700">{a.action || a.status}</Txt>
                        {a.by ? <Txt size="xxs" color={colors.textMuted}>par {a.by}</Txt> : null}
                        {a.notes ? <Txt size="xxs" color={colors.textMuted}>{a.notes}</Txt> : null}
                      </View>
                      {a.at ? (
                        <Txt size="xxs" color={colors.textMuted}>
                          {new Date(a.at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </Txt>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>

            {/* Sticky actions */}
            {(detail.status === "pending" || detail.status === "approved" || detail.status === "processing") ? (
              <View style={[styles.stickyActions, { paddingBottom: 12 + insets.bottom }]}>
                {detail.status === "pending" ? (
                  <>
                    <Pressable onPress={() => setAction("reject")} style={[styles.sBtn, { backgroundColor: "#FEE2E2" }]}>
                      <Ionicons name="close-circle" size={16} color="#DC2626" />
                      <Txt size="sm" weight="700" color="#DC2626" style={{ marginLeft: 6 }}>Refuser</Txt>
                    </Pressable>
                    <Pressable onPress={() => setAction("approve")} style={[styles.sBtn, { backgroundColor: colors.turquoise, flex: 1 }]}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.white} />
                      <Txt size="sm" weight="700" color={colors.white} style={{ marginLeft: 6 }}>Approuver</Txt>
                    </Pressable>
                  </>
                ) : detail.status === "approved" ? (
                  <Pressable onPress={() => setAction("mark_processing")} style={[styles.sBtn, { backgroundColor: colors.info, flex: 1 }]}>
                    <Ionicons name="hourglass" size={16} color={colors.white} />
                    <Txt size="sm" weight="700" color={colors.white} style={{ marginLeft: 6 }}>Marquer en cours</Txt>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setAction("mark_paid")} style={[styles.sBtn, { backgroundColor: "#1F7A3F", flex: 1 }]}>
                    <Ionicons name="checkmark-done" size={16} color={colors.white} />
                    <Txt size="sm" weight="700" color={colors.white} style={{ marginLeft: 6 }}>Marquer payé</Txt>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        ) : null}
      </Modal>

      {/* Action confirm modal */}
      <Modal visible={!!action} transparent animationType="fade" onRequestClose={closeAction}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Txt size="lg" weight="800">
              {action === "approve" ? "Approuver le retrait ?"
                : action === "reject" ? "Refuser le retrait"
                : action === "mark_processing" ? "Passer en cours de traitement"
                : "Marquer comme payé"}
            </Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
              {action === "approve"
                ? "Le solde du prestataire restera verrouillé jusqu'au paiement effectif."
                : action === "reject"
                ? "Le solde sera restauré au prestataire et une notification lui sera envoyée."
                : action === "mark_processing"
                ? "Signale que le virement est en cours d'exécution chez le PSP."
                : "Confirmez le paiement effectif avec la référence bancaire."}
            </Txt>

            {(action === "reject" || action === "mark_paid" || action === "mark_processing") && (
              <>
                <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>
                  {action === "reject" ? "MOTIF (obligatoire)" : "NOTES ADMIN"}
                </Txt>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={action === "reject" ? "Ex : compte non vérifié" : "Optionnel"}
                  placeholderTextColor={colors.textSubtle}
                  multiline
                  style={[styles.input, { minHeight: 70, textAlignVertical: "top" as any }]}
                />
              </>
            )}

            {action === "mark_paid" && (
              <>
                <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>
                  RÉFÉRENCE EXTERNE (obligatoire)
                </Txt>
                <TextInput
                  value={ref}
                  onChangeText={setRef}
                  placeholder="Ex : WV-TX-9812378"
                  placeholderTextColor={colors.textSubtle}
                  style={styles.input}
                  autoCapitalize="none"
                />
              </>
            )}

            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.lg }}>
              <Pressable onPress={closeAction} style={[styles.modalBtn, { backgroundColor: colors.surface2, flex: 1 }]}>
                <Txt weight="700">Annuler</Txt>
              </Pressable>
              <Btn title="Confirmer" onPress={runAction} loading={busy} variant="primary" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Subcomponents ───

function WithdrawalRow({ row, onPress }: { row: AdminWithdrawal; onPress: () => void }) {
  const c = statusColor(row.status);
  const meta = PROVIDER_META[row.method as keyof typeof PROVIDER_META];
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`admin-wdr-row-${row.id.slice(0, 8)}`}>
      <View style={styles.rowIcon}>
        <Txt size="lg">{meta?.emoji || "💳"}</Txt>
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Txt size="sm" weight="700" numberOfLines={1}>{meta?.label || row.method}</Txt>
        <Txt size="xxs" color={colors.textMuted} numberOfLines={1} style={{ marginTop: 2 }}>
          {row.destination.phone || row.destination.iban || row.destination.holder_name || row.user_id.slice(0, 12) + "…"}
        </Txt>
        <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
          {new Date(row.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Txt size="sm" weight="800" style={{ fontVariant: ["tabular-nums"] as any }}>{formatXof(row.amount_net_xof)}</Txt>
        <View style={[styles.pillLight, { backgroundColor: c.bg, marginTop: 4 }]}>
          <Txt size="xxs" weight="700" color={c.fg}>{statusLabel(row.status)}</Txt>
        </View>
      </View>
    </Pressable>
  );
}

function RefundRow({ row }: { row: any }) {
  const c = statusColor(row.status || "pending");
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: "#E6F4FF" }]}>
        <Ionicons name="return-up-back" size={18} color={colors.info} />
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Txt size="sm" weight="700" numberOfLines={1}>
          Remb. #{(row.id || row._id || "").slice(0, 8)}
        </Txt>
        <Txt size="xxs" color={colors.textMuted} numberOfLines={1} style={{ marginTop: 2 }}>
          {row.reason || row.booking_id || "—"}
        </Txt>
        <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
          {row.created_at ? new Date(row.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short" }) : "—"}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Txt size="sm" weight="800" style={{ fontVariant: ["tabular-nums"] as any }}>{formatXof(row.amount_xof || row.amount || 0)}</Txt>
        <View style={[styles.pillLight, { backgroundColor: c.bg, marginTop: 4 }]}>
          <Txt size="xxs" weight="700" color={c.fg}>{statusLabel(row.status || "pending")}</Txt>
        </View>
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Txt size="xs" color={colors.textMuted} style={{ width: 100, marginLeft: 8 }}>{label}</Txt>
      <Txt
        size="sm"
        weight="600"
        style={[{ flex: 1 }, mono ? { fontVariant: ["tabular-nums"] as any } as any : null]}
        numberOfLines={2}
      >
        {value}
      </Txt>
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

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Txt size="sm" weight="700" color={active ? colors.midnight : colors.textMuted}>{label}</Txt>
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
  tabs: { flexDirection: "row", backgroundColor: colors.surface, paddingHorizontal: spacing.xl, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.turquoise },
  pill: {
    paddingHorizontal: 12, height: 32, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  pillActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadow.soft,
  },
  rowIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  pillLight: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  emptyCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, ...shadow.soft },
  hero: {
    backgroundColor: colors.midnight,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.card,
  },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
  infoRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  auditRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  auditDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.turquoise },
  stickyActions: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 8,
    paddingHorizontal: spacing.xl, paddingTop: 12,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  sBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 16, height: 48, borderRadius: 999,
  },
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
