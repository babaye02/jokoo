// Admin — File d'attente KYC (Know Your Customer).
// Liste les demandes de vérification d'identité des prestataires, filtre par status,
// permet d'approuver ou de refuser (avec motif) chaque dossier.

import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput, Modal, Alert, Text } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Txt } from "@/src/components/ui";
import { CompatibleImage } from "@/src/components/CompatibleImage";
import { colors, radius, shadow, spacing } from "@/src/theme";

type KycStatus = "pending" | "approved" | "rejected" | "more_info";

type KycRow = {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  id_type: "cni" | "passport" | "drivers_licence";
  doc_front: string;
  doc_back?: string | null;
  selfie: string;
  status: KycStatus;
  rejection_reason?: string | null;
  version?: number;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by_name?: string | null;
};

type KycStats = { pending: number; approved: number; rejected: number; more_info: number; total: number };

const FILTERS: { key: KycStatus | "all"; label: string; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap }[] = [
  { key: "pending", label: "En attente", icon: "hourglass-outline" },
  { key: "approved", label: "Vérifiés", icon: "checkmark-done" },
  { key: "rejected", label: "Refusés", icon: "close-circle-outline" },
  { key: "all", label: "Tous", icon: "layers-outline" },
];

const ID_LABELS: Record<KycRow["id_type"], string> = {
  cni: "CNI",
  passport: "Passeport",
  drivers_licence: "Permis",
};

export default function AdminKycQueue() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<KycRow[]>([]);
  const [stats, setStats] = useState<KycStats | null>(null);
  const [filter, setFilter] = useState<KycStatus | "all">("pending");
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<KycRow | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        api.get<KycRow[]>(`/admin/kyc-requests${filter !== "all" ? `?status=${filter}` : ""}${q.trim() ? `${filter !== "all" ? "&" : "?"}q=${encodeURIComponent(q.trim())}` : ""}`),
        api.get<KycStats>("/admin/kyc-requests/stats"),
      ]);
      setRows(list || []);
      setStats(s);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Chargement impossible.");
    }
  }, [filter, q]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const approve = async (row: KycRow) => {
    setBusy(true);
    try {
      await api.post(`/admin/kyc-requests/${row.id}/approve`, {});
      setDetail(null);
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Approbation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    if (!detail) return;
    if (reason.trim().length < 5) {
      Alert.alert("Motif requis", "Merci de saisir un motif d'au moins 5 caractères.");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/admin/kyc-requests/${detail.id}/reject`, { reason: reason.trim() });
      setRejectOpen(false);
      setReason("");
      setDetail(null);
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Refus impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, marginHorizontal: 8 }}>Vérifications KYC</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher par nom ou email"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={() => load()}
        />
        {q ? (
          <Pressable onPress={() => setQ("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: 6 }}>
        {FILTERS.map((f) => {
          const count = stats ? (f.key === "all" ? stats.total : stats[f.key as KycStatus] || 0) : 0;
          const active = filter === f.key;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.pill, active && styles.pillActive]}>
              <Ionicons name={f.icon} size={13} color={active ? colors.white : colors.midnight} />
              <Text style={[styles.pillTxt, active && { color: colors.white }]}>{f.label}</Text>
              <View style={[styles.pillBadge, active && { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <Text style={[styles.pillBadgeTxt, active && { color: colors.white }]}>{count}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 80 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="shield-checkmark-outline" size={40} color={colors.textMuted} />
            <Txt weight="700" style={{ marginTop: 10 }}>Aucune demande</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
              Aucune vérification correspondant à ce filtre pour l&apos;instant.
            </Txt>
          </View>
        ) : (
          rows.map((r) => (
            <Pressable key={r.id} onPress={() => setDetail(r)} style={styles.row}>
              <CompatibleImage uri={r.selfie} style={styles.avatar as any} transform={{ thumbnail: true, face: true, width: 120, height: 120 }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.midnight, letterSpacing: -0.1 }} numberOfLines={1}>
                  {r.user_name || "Prestataire"}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{r.user_email}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
                  <View style={styles.tagLight}>
                    <Text style={styles.tagLightTxt}>{ID_LABELS[r.id_type]}</Text>
                  </View>
                  <StatusPill status={r.status} />
                  {r.version && r.version > 1 ? (
                    <View style={styles.tagLight}>
                      <Text style={styles.tagLightTxt}>v{r.version}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))
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
              <Txt size="lg" weight="700" style={{ flex: 1, marginHorizontal: 8 }}>Dossier de {detail.user_name}</Txt>
              <View style={{ width: 40 }} />
            </SafeAreaView>
            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <StatusPill status={detail.status} large />
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  Soumis le {new Date(detail.submitted_at).toLocaleString("fr-FR")}
                </Text>
              </View>
              {detail.rejection_reason ? (
                <View style={styles.reasonCard}>
                  <Ionicons name="information-circle" size={16} color="#DC2626" />
                  <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, color: "#7F1D1D", lineHeight: 17 }}>
                    Motif précédent : {detail.rejection_reason}
                  </Text>
                </View>
              ) : null}

              <View style={{ marginTop: spacing.xl }}>
                <Text style={styles.detailLbl}>Type de pièce</Text>
                <Text style={styles.detailVal}>{ID_LABELS[detail.id_type]}</Text>
              </View>

              <View style={{ marginTop: spacing.xl }}>
                <Text style={styles.detailLbl}>Recto</Text>
                <CompatibleImage uri={detail.doc_front} style={styles.docLarge as any} transform={{ width: 800 }} />
              </View>
              {detail.doc_back ? (
                <View style={{ marginTop: spacing.md }}>
                  <Text style={styles.detailLbl}>Verso</Text>
                  <CompatibleImage uri={detail.doc_back} style={styles.docLarge as any} transform={{ width: 800 }} />
                </View>
              ) : null}
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.detailLbl}>Selfie</Text>
                <CompatibleImage uri={detail.selfie} style={styles.docLarge as any} transform={{ width: 800, face: true }} />
              </View>
            </ScrollView>

            {/* Sticky actions */}
            {detail.status === "pending" || detail.status === "more_info" ? (
              <View style={[styles.stickyActions, { paddingBottom: 12 + insets.bottom }]}>
                <Pressable
                  onPress={() => setRejectOpen(true)}
                  style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}
                  disabled={busy}
                >
                  <Ionicons name="close-circle" size={16} color="#DC2626" />
                  <Text style={{ color: "#DC2626", fontWeight: "800", fontSize: 14, marginLeft: 6 }}>Refuser</Text>
                </Pressable>
                <Pressable
                  onPress={() => approve(detail)}
                  style={[styles.actionBtn, { backgroundColor: colors.turquoise, flex: 1 }]}
                  disabled={busy}
                >
                  <Ionicons name="checkmark-circle" size={16} color={colors.white} />
                  <Text style={{ color: colors.white, fontWeight: "800", fontSize: 14, marginLeft: 6 }}>
                    {busy ? "…" : "Approuver"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </Modal>

      {/* Reject reason modal */}
      <Modal visible={rejectOpen} animationType="fade" transparent onRequestClose={() => setRejectOpen(false)}>
        <View style={styles.rejectBackdrop}>
          <View style={styles.rejectCard}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.midnight, letterSpacing: -0.2 }}>Motif du refus</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
              Ce motif sera envoyé au prestataire dans sa notification.
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Ex : les documents sont flous, merci de renvoyer une photo nette."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              style={styles.reasonInput}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <Pressable onPress={() => { setRejectOpen(false); setReason(""); }} style={[styles.rejectBtn, { backgroundColor: colors.surface2 }]}>
                <Text style={{ color: colors.midnight, fontWeight: "700", fontSize: 13 }}>Annuler</Text>
              </Pressable>
              <Btn title="Envoyer le refus" icon="send" variant="primary" size="sm" onPress={submitReject} loading={busy} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatusPill({ status, large = false }: { status: KycStatus; large?: boolean }) {
  const cfg: Record<KycStatus, { bg: string; fg: string; label: string; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap }> = {
    pending: { bg: "#FEF3C7", fg: "#B45309", label: "En attente", icon: "hourglass-outline" },
    approved: { bg: "#DCFCE7", fg: "#166534", label: "Vérifié", icon: "checkmark-done" },
    rejected: { bg: "#FEE2E2", fg: "#B91C1C", label: "Refusé", icon: "close-circle-outline" },
    more_info: { bg: "#DBEAFE", fg: "#1E40AF", label: "Compléments", icon: "help-circle-outline" },
  };
  const c = cfg[status];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.bg, paddingHorizontal: large ? 10 : 8, paddingVertical: large ? 6 : 3, borderRadius: 999 }}>
      <Ionicons name={c.icon} size={large ? 14 : 11} color={c.fg} />
      <Text style={{ color: c.fg, fontWeight: "700", fontSize: large ? 12 : 10, letterSpacing: -0.1 }}>{c.label}</Text>
    </View>
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
    marginHorizontal: spacing.xl, marginTop: 12,
    paddingHorizontal: 14, height: 42, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.midnight, paddingVertical: 0 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, height: 32, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  pillTxt: { fontSize: 12, fontWeight: "700", color: colors.midnight, letterSpacing: -0.1 },
  pillBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.surface2 },
  pillBadgeTxt: { fontSize: 10, fontWeight: "800", color: colors.midnight },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 12, marginBottom: 10, ...shadow.soft,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface2 },
  tagLight: { backgroundColor: colors.surface2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagLightTxt: { fontSize: 10, fontWeight: "700", color: colors.midnight },
  emptyCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, ...shadow.soft },
  detailLbl: { fontSize: 11, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  detailVal: { fontSize: 14, fontWeight: "700", color: colors.midnight, marginTop: 4 },
  docLarge: { width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.surface2, marginTop: 8 },
  reasonCard: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: "#FEE2E2", borderRadius: radius.md, padding: 12, marginTop: 12,
  },
  stickyActions: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 8,
    paddingHorizontal: spacing.xl, paddingTop: 12,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 16, height: 48, borderRadius: 999,
  },
  rejectBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 16 },
  rejectCard: { width: "100%", maxWidth: 400, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 20 },
  reasonInput: {
    marginTop: 14, minHeight: 90, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, fontSize: 13, color: colors.midnight,
    textAlignVertical: "top",
  },
  rejectBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 16, height: 40, borderRadius: 999,
  },
});
