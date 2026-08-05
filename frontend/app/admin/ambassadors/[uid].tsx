import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, RefreshControl, Share, Modal, TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Card, Txt, Avatar, Badge, Btn, ErrorBox, ScreenHeader } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

interface AmbDetail {
  user_id: string;
  name?: string | null;
  avatar?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  active: boolean;
  code: string;
  slug: string;
  tier: string;
  badge: string;
  monthly_goal: number;
  verified_count: number;
  pending_count: number;
  custom_bio?: string | null;
  joined_at?: string;
  links?: { web?: string; web_slug?: string; app?: string; share_text?: string };
}

interface Commission {
  id: string;
  ambassador_id: string;
  booking_id: string;
  amount_xof: number;
  rate: number;
  tier_snapshot: string;
  status: "pending" | "approved" | "paid" | "cancelled";
  created_at: string;
  paid_at?: string | null;
}

interface CommissionsListResp {
  total: number;
  items: Commission[];
}

const TIER_COLORS: Record<string, string> = {
  starter: "#94A3B8",
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#F5B301",
  diamond: "#22D3EE",
  elite: "#7C3AED",
};

const COMMISSION_FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "pending", label: "En attente" },
  { key: "approved", label: "Approuvées" },
  { key: "paid", label: "Payées" },
  { key: "cancelled", label: "Annulées" },
] as const;

function statusMeta(s: string) {
  if (s === "paid") return { tone: "success", label: "Payée" } as const;
  if (s === "approved") return { tone: "info", label: "Approuvée" } as const;
  if (s === "cancelled") return { tone: "danger", label: "Annulée" } as const;
  return { tone: "warn", label: "En attente" } as const;
}

function xof(n: number) { return `${(n || 0).toLocaleString("fr-FR")} F`; }

export default function AdminAmbassadorDetail() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [amb, setAmb] = useState<AmbDetail | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [commissionFilter, setCommissionFilter] = useState<typeof COMMISSION_FILTERS[number]["key"]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const statusParam = commissionFilter !== "all" ? `&status=${commissionFilter}` : "";
      const [detail, cms] = await Promise.all([
        api.get<AmbDetail>(`/admin/ambassadors/${encodeURIComponent(String(uid))}`),
        api
          .get<CommissionsListResp | Commission[]>(
            `/admin/ambassadors/commissions?user_id=${encodeURIComponent(String(uid))}${statusParam}`
          )
          .catch(() => ({ total: 0, items: [] as Commission[] })),
      ]);
      setAmb(detail);
      const items = Array.isArray(cms) ? cms : (cms?.items || []);
      setCommissions(items);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }, [uid, commissionFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleActive = async () => {
    if (!amb) return;
    const willBeActive = !amb.active;
    Alert.alert(
      willBeActive ? "Réactiver ?" : "Désactiver ?",
      willBeActive
        ? "L'ambassadeur pourra à nouveau générer des filleuls et commissions."
        : "Ses filleuls et commissions restent intacts, mais les nouveaux liens ne fonctionneront plus.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: willBeActive ? "Réactiver" : "Désactiver",
          style: willBeActive ? "default" : "destructive",
          onPress: async () => {
            setBusy("toggle");
            try {
              await api.post(`/admin/users/${amb.user_id}/ambassador`, { active: willBeActive });
              await load();
            } catch (e: any) {
              Alert.alert("Erreur", e?.message || "Échec.");
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const updateCommissionStatus = async (cid: string, status: string, label: string) => {
    Alert.alert(
      "Confirmer",
      `Marquer cette commission comme "${label}" ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: async () => {
            setBusy(cid);
            try {
              await api.patch(`/admin/ambassadors/commissions/${cid}?status=${status}`, {});
              await load();
            } catch (e: any) {
              Alert.alert("Erreur", e?.message || "Échec.");
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const shareInvite = async () => {
    if (!amb?.links) return;
    try {
      await Share.share({
        message: amb.links.share_text || `Rejoins Jokoo avec le code ${amb.code} — ${amb.links.web_slug}`,
      });
    } catch {}
  };

  if (loading && !amb) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <ScreenHeader title="Ambassadeur" onBack={() => router.back()} />
        <View style={styles.center}><Txt color={colors.textMuted}>Chargement…</Txt></View>
      </SafeAreaView>
    );
  }
  if (error || !amb) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <ScreenHeader title="Ambassadeur" onBack={() => router.back()} />
        <View style={styles.center}>
          <ErrorBox text={error || "Ambassadeur introuvable"} />
          <Btn title="Retour" onPress={() => router.back()} style={{ marginTop: spacing.md }} />
        </View>
      </SafeAreaView>
    );
  }

  const tierColor = TIER_COLORS[amb.tier] || colors.turquoise;
  const totalPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount_xof, 0);
  const totalApproved = commissions.filter((c) => c.status === "approved").reduce((s, c) => s + c.amount_xof, 0);
  const totalPaid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount_xof, 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader title={amb.name || "Ambassadeur"} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: tierColor + "22", borderColor: tierColor + "55" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Avatar uri={amb.avatar || undefined} name={amb.name || undefined} size={56} />
            <View style={{ flex: 1 }}>
              <Txt weight="800" size="lg" numberOfLines={1}>{amb.name || "—"}</Txt>
              <Txt size="xs" color={colors.textMuted} numberOfLines={1}>
                {amb.email || amb.phone || "—"} · {amb.role || "user"}
              </Txt>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Txt size="sm" weight="700" color={tierColor}>{amb.badge}</Txt>
                {!amb.active ? <Badge label="Inactif" tone="danger" size="sm" /> : null}
              </View>
            </View>
          </View>
          {amb.custom_bio ? (
            <Txt size="sm" color={colors.midnight} style={{ marginTop: spacing.md }}>
              {amb.custom_bio}
            </Txt>
          ) : null}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatBox label="Vérifiés" value={amb.verified_count} icon="checkmark-circle-outline" />
          <StatBox label="En attente" value={amb.pending_count} icon="hourglass-outline" />
          <StatBox label="Objectif" value={amb.monthly_goal} icon="flag-outline" />
        </View>

        {/* Commissions summary */}
        <View style={styles.statsRow}>
          <MoneyBox label="En attente" value={totalPending} tone="warn" />
          <MoneyBox label="Approuvées" value={totalApproved} tone="info" />
          <MoneyBox label="Payées" value={totalPaid} tone="success" />
        </View>

        {/* Links */}
        <Card style={{ padding: spacing.md, marginTop: spacing.md }}>
          <Txt weight="800" size="md">🔗 Liens de parrainage</Txt>
          <View style={{ marginTop: spacing.sm, gap: 6 }}>
            <LinkRow label="Web" value={amb.links?.web} />
            <LinkRow label="URL courte" value={amb.links?.web_slug} />
            <LinkRow label="App scheme" value={amb.links?.app} />
          </View>
          <Btn title="Partager l'invitation" icon="share-social-outline" variant="secondary" onPress={shareInvite} style={{ marginTop: spacing.md }} />
        </Card>

        {/* Actions */}
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Btn
            title="Modifier"
            variant="secondary"
            icon="create-outline"
            onPress={() => setShowEdit(true)}
            style={{ flex: 1 }}
          />
          <Btn
            title={amb.active ? "Désactiver" : "Réactiver"}
            variant={amb.active ? "secondary" : "primary"}
            icon={amb.active ? "close-circle-outline" : "checkmark-circle-outline"}
            onPress={toggleActive}
            disabled={busy === "toggle"}
            style={{ flex: 1 }}
          />
        </View>

        {/* Commissions filter */}
        <View style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
            <Txt weight="800" size="md">💰 Commissions</Txt>
            <Txt size="xs" color={colors.textMuted}>{commissions.length} affichée(s)</Txt>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginBottom: spacing.sm }}>
            {COMMISSION_FILTERS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setCommissionFilter(f.key)}
                style={[
                  styles.filterChip,
                  commissionFilter === f.key && { backgroundColor: colors.midnight, borderColor: colors.midnight },
                ]}
              >
                <Txt size="xs" weight="700" color={commissionFilter === f.key ? colors.white : colors.midnight}>
                  {f.label}
                </Txt>
              </Pressable>
            ))}
          </ScrollView>

          {commissions.length === 0 ? (
            <Txt color={colors.textMuted} size="sm" style={{ padding: spacing.md, textAlign: "center" }}>
              Aucune commission dans ce filtre.
            </Txt>
          ) : (
            commissions.slice(0, 50).map((c) => {
              const m = statusMeta(c.status);
              const nextAction: { status: string; label: string; color: string } | null =
                c.status === "pending"
                  ? { status: "approved", label: "Approuver", color: colors.info }
                  : c.status === "approved"
                    ? { status: "paid", label: "Marquer payée", color: colors.turquoise }
                    : null;
              return (
                <Card key={c.id} style={{ padding: spacing.md, marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Txt weight="800" size="md">{xof(c.amount_xof)}</Txt>
                    <Badge label={m.label} tone={m.tone} size="sm" />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                    <Txt size="xxs" color={colors.textMuted}>
                      Tier {c.tier_snapshot} · {Math.round(c.rate * 100)}%
                    </Txt>
                    <Txt size="xxs" color={colors.textMuted}>
                      {new Date(c.created_at).toLocaleDateString("fr-FR")}
                    </Txt>
                  </View>
                  {nextAction ? (
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                      <Pressable
                        onPress={() => updateCommissionStatus(c.id, nextAction.status, nextAction.label)}
                        disabled={busy === c.id}
                        style={[styles.miniBtn, { backgroundColor: nextAction.color }]}
                      >
                        <Txt size="xs" weight="700" color={colors.white}>{nextAction.label}</Txt>
                      </Pressable>
                      <Pressable
                        onPress={() => updateCommissionStatus(c.id, "cancelled", "Annulée")}
                        disabled={busy === c.id}
                        style={[styles.miniBtn, { backgroundColor: colors.surfaceWarm }]}
                      >
                        <Txt size="xs" weight="700" color={colors.danger}>Annuler</Txt>
                      </Pressable>
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>

      <EditAmbassadorModal
        visible={showEdit}
        ambassador={amb}
        onClose={() => setShowEdit(false)}
        onSaved={() => { setShowEdit(false); load(); }}
      />
    </SafeAreaView>
  );
}

function StatBox({ label, value, icon }: { label: string; value: number; icon: any }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={18} color={colors.turquoise} />
      <Txt size="xl" weight="800" style={{ marginTop: 2 }}>{value}</Txt>
      <Txt size="xxs" color={colors.textMuted}>{label}</Txt>
    </View>
  );
}

function MoneyBox({ label, value, tone }: { label: string; value: number; tone: "warn" | "info" | "success" }) {
  const bg = tone === "warn" ? "#FEF3C7" : tone === "info" ? "#E0F2FE" : "#DCFCE7";
  const color = tone === "warn" ? "#B45309" : tone === "info" ? "#0369A1" : "#166534";
  return (
    <View style={[styles.statBox, { backgroundColor: bg, borderColor: bg }]}>
      <Txt size="md" weight="800" color={color}>{xof(value)}</Txt>
      <Txt size="xxs" color={color} style={{ marginTop: 2 }}>{label}</Txt>
    </View>
  );
}

function LinkRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Txt size="xs" color={colors.textMuted} weight="700">{label}</Txt>
      <Txt size="xs" style={{ flex: 1, marginLeft: 8, textAlign: "right" }} numberOfLines={1}>
        {value || "—"}
      </Txt>
    </View>
  );
}

function EditAmbassadorModal({
  visible,
  ambassador,
  onClose,
  onSaved,
}: {
  visible: boolean;
  ambassador: AmbDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [goal, setGoal] = useState(String(ambassador.monthly_goal || 500));
  const [slug, setSlug] = useState(ambassador.slug || "");
  const [bio, setBio] = useState(ambassador.custom_bio || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setGoal(String(ambassador.monthly_goal || 500));
      setSlug(ambassador.slug || "");
      setBio(ambassador.custom_bio || "");
    }
  }, [visible, ambassador]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/ambassadors/${ambassador.user_id}`, {
        active: ambassador.active,
        monthly_goal: Math.max(0, parseInt(goal, 10) || 0),
        custom_slug: slug.trim(),
        custom_bio: bio.trim(),
      });
      onSaved();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible d'enregistrer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Txt weight="800" size="lg">Modifier l&apos;ambassadeur</Txt>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.midnight} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
            <Txt weight="600" size="sm" style={styles.label}>Objectif mensuel (filleuls vérifiés)</Txt>
            <TextInput
              value={goal}
              onChangeText={setGoal}
              keyboardType="number-pad"
              style={styles.input}
            />

            <Txt weight="600" size="sm" style={styles.label}>Slug personnalisé (URL courte)</Txt>
            <TextInput
              value={slug}
              onChangeText={setSlug}
              autoCapitalize="none"
              placeholder="racky"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Txt size="xxs" color={colors.textMuted}>
              https://jokooservices.com/{slug || "slug"}
            </Txt>

            <Txt weight="600" size="sm" style={styles.label}>Bio (facultatif)</Txt>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Ambassadeur régional Dakar…"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { height: 72 }]}
              maxLength={280}
            />

            <Btn
              title={saving ? "Enregistrement…" : "Enregistrer"}
              onPress={save}
              disabled={saving}
              style={{ marginTop: spacing.lg }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statBox: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.sm,
  },
  miniBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  label: {
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.midnight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
