// Admin — validation des suggestions de métiers proposées par les prestataires.
// Endpoints: GET /admin/service-suggestions?status_filter=...
//            PATCH /admin/service-suggestions/{id}
import { useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, ServiceCategory, ServiceSuggestion } from "@/src/api";
import { useAuth } from "@/src/auth";
import { isStaff } from "@/src/perms";
import { Btn, Card, Txt } from "@/src/components/ui";
import { ConfirmDialog } from "@/src/components/ActionSheet";
import { colors, radius, shadow, spacing } from "@/src/theme";

type FilterKey = "pending" | "approved" | "rejected";

const FILTERS: { key: FilterKey; label: string; icon: any; color: string }[] = [
  { key: "pending", label: "En attente", icon: "time-outline", color: colors.warning },
  { key: "approved", label: "Validées", icon: "checkmark-circle", color: colors.success },
  { key: "rejected", label: "Refusées", icon: "close-circle", color: colors.danger },
];

export default function AdminServiceSuggestions() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [filter, setFilter] = useState<FilterKey>("pending");
  const [items, setItems] = useState<ServiceSuggestion[]>([]);
  const [categories, setCategories] = useState<Record<string, ServiceCategory>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Confirm approve
  const [approveTarget, setApproveTarget] = useState<ServiceSuggestion | null>(null);
  // Reject with note
  const [rejectTarget, setRejectTarget] = useState<ServiceSuggestion | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, cats] = await Promise.all([
        api.get<ServiceSuggestion[]>(`/admin/service-suggestions?status_filter=${filter}`),
        api.get<{ categories: ServiceCategory[] }>("/services/categories").catch(() => ({ categories: [] })),
      ]);
      setItems(rows || []);
      const map: Record<string, ServiceCategory> = {};
      for (const c of cats.categories || []) map[c.key] = c;
      setCategories(map);
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "err");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approve = async (s: ServiceSuggestion) => {
    setBusyId(s.id);
    try {
      await api.patch(`/admin/service-suggestions/${s.id}`, { action: "approve" });
      showToast(`« ${s.label} » validé`);
      load();
    } catch (e: any) {
      showToast(e?.message || "Erreur", "err");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (s: ServiceSuggestion, note: string) => {
    setBusyId(s.id);
    try {
      await api.patch(`/admin/service-suggestions/${s.id}`, {
        action: "reject",
        admin_note: note.trim() || null,
      });
      showToast(`« ${s.label} » refusé`);
      load();
    } catch (e: any) {
      showToast(e?.message || "Erreur", "err");
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => ({ current: items.length }), [items]);

  if (!isStaff(user)) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <Ionicons name="lock-closed" size={48} color={colors.textSubtle} />
        <Txt size="md" color={colors.textMuted} style={{ marginTop: spacing.md }}>Accès administrateur requis</Txt>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="suggestions-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Txt size="lg" weight="700">Suggestions de métiers</Txt>
          <Txt size="xxs" color={colors.textMuted}>Proposées par les prestataires</Txt>
        </View>
        <Pressable onPress={load} style={styles.back} testID="suggestions-refresh">
          <Ionicons name="refresh" size={20} color={colors.midnight} />
        </Pressable>
      </SafeAreaView>

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.tab, active && { backgroundColor: `${f.color}18`, borderColor: f.color }]}
              testID={`filter-${f.key}`}
            >
              <Ionicons name={f.icon} size={14} color={active ? f.color : colors.textMuted} />
              <Txt size="xs" weight={active ? "700" : "600"} color={active ? f.color : colors.textMuted} style={{ marginLeft: 6 }}>
                {f.label}
              </Txt>
              {active ? (
                <View style={[styles.badge, { backgroundColor: f.color }]}>
                  <Txt size="xxs" weight="700" color={colors.white}>{counts.current}</Txt>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        {loading ? (
          <Card><Txt color={colors.textMuted}>Chargement…</Txt></Card>
        ) : items.length === 0 ? (
          <Card style={{ alignItems: "center", padding: spacing.xl }}>
            <Ionicons name="file-tray-outline" size={40} color={colors.textSubtle} />
            <Txt weight="700" style={{ marginTop: 8 }}>Aucune suggestion {filter === "pending" ? "en attente" : filter === "approved" ? "validée" : "refusée"}</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4, textAlign: "center" }}>
              {filter === "pending"
                ? "Les nouvelles suggestions de métiers apparaîtront ici."
                : "Rien à afficher pour ce filtre."}
            </Txt>
          </Card>
        ) : (
          items.map((s) => {
            const cat = categories[s.category || ""];
            return (
              <Card key={s.id} style={{ padding: spacing.md }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Txt weight="700" size="md">{s.label}</Txt>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, flexWrap: "wrap", gap: 6 }}>
                      {cat ? (
                        <View style={[styles.catPill, { backgroundColor: `${cat.color}22` }]}>
                          <Txt size="xxs" weight="700" color={cat.color}>{cat.emoji} {cat.label}</Txt>
                        </View>
                      ) : s.category ? (
                        <View style={styles.catPill}>
                          <Txt size="xxs" weight="700" color={colors.textMuted}>{s.category}</Txt>
                        </View>
                      ) : null}
                      <Txt size="xxs" color={colors.textMuted}>
                        Par {s.suggested_by_name || "prestataire"}
                      </Txt>
                    </View>
                    {s.description ? (
                      <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, lineHeight: 18 }}>
                        {s.description}
                      </Txt>
                    ) : null}
                    <Txt size="xxs" color={colors.textSubtle} style={{ marginTop: 6 }}>
                      Soumis le {formatDate(s.created_at)}
                    </Txt>
                  </View>
                  <StatusPill status={s.status} />
                </View>

                {s.status === "approved" && s.generated_key ? (
                  <View style={{ marginTop: 10, padding: 8, backgroundColor: colors.brandTertiary, borderRadius: radius.sm }}>
                    <Txt size="xxs" color={colors.midnight}>
                      Clé publique : <Txt size="xxs" weight="700">{s.generated_key}</Txt>
                    </Txt>
                  </View>
                ) : null}

                {s.status === "rejected" && s.admin_note ? (
                  <View style={{ marginTop: 10, padding: 8, backgroundColor: "#FEE2E2", borderRadius: radius.sm }}>
                    <Txt size="xxs" color={colors.danger} weight="700">Motif du refus</Txt>
                    <Txt size="xs" color={colors.danger} style={{ marginTop: 2 }}>{s.admin_note}</Txt>
                  </View>
                ) : null}

                {s.status === "pending" ? (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Btn
                        title="Refuser"
                        variant="secondary"
                        onPress={() => { setRejectNote(""); setRejectTarget(s); }}
                        disabled={busyId === s.id}
                        testID={`sug-reject-${s.id}`}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Btn
                        title="Valider"
                        onPress={() => setApproveTarget(s)}
                        disabled={busyId === s.id}
                        testID={`sug-approve-${s.id}`}
                      />
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Toast */}
      {toast ? (
        <View
          pointerEvents="none"
          style={[
            styles.toast,
            { bottom: 30 + insets.bottom, backgroundColor: toast.kind === "ok" ? colors.midnight : colors.danger },
          ]}
        >
          <Ionicons
            name={toast.kind === "ok" ? "checkmark-circle" : "alert-circle"}
            size={18}
            color={colors.white}
          />
          <Txt size="sm" weight="600" color={colors.white} style={{ marginLeft: 8 }}>
            {toast.msg}
          </Txt>
        </View>
      ) : null}

      {/* Approve confirmation */}
      <ConfirmDialog
        visible={!!approveTarget}
        title="Valider ce métier ?"
        message={
          approveTarget
            ? `« ${approveTarget.label} » sera ajouté au catalogue public. Le prestataire sera notifié.`
            : ""
        }
        confirmLabel="Valider"
        onClose={() => setApproveTarget(null)}
        onConfirm={() => {
          const s = approveTarget;
          setApproveTarget(null);
          if (s) approve(s);
        }}
        testID="approve-dialog"
      />

      {/* Reject modal with note */}
      <Modal
        visible={!!rejectTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.rejectOverlay}
        >
          <Pressable style={styles.rejectOverlayInner} onPress={() => setRejectTarget(null)}>
            <Pressable style={styles.rejectCard} onPress={() => {}}>
              <View style={[styles.iconWrap, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="warning" size={22} color={colors.danger} />
              </View>
              <Txt size="lg" weight="700" style={{ textAlign: "center", marginTop: 10 }}>
                Refuser cette suggestion
              </Txt>
              {rejectTarget ? (
                <Txt size="sm" color={colors.textMuted} style={{ textAlign: "center", marginTop: 4 }}>
                  « {rejectTarget.label} »
                </Txt>
              ) : null}
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: spacing.md, marginBottom: 6 }}>
                Motif (optionnel — envoyé au prestataire)
              </Txt>
              <TextInput
                value={rejectNote}
                onChangeText={setRejectNote}
                multiline
                placeholder="Ex. Métier déjà présent, hors périmètre Jokoo…"
                placeholderTextColor={colors.textSubtle}
                style={styles.rejectInput}
                testID="reject-note"
              />
              <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md, width: "100%" }}>
                <View style={{ flex: 1 }}>
                  <Btn
                    title="Annuler"
                    variant="secondary"
                    onPress={() => setRejectTarget(null)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Btn
                    title="Refuser"
                    onPress={() => {
                      const s = rejectTarget;
                      const n = rejectNote;
                      setRejectTarget(null);
                      if (s) reject(s, n);
                    }}
                    testID="reject-confirm"
                  />
                </View>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: "En attente", color: colors.warning },
    approved: { label: "Validée", color: colors.success },
    rejected: { label: "Refusée", color: colors.danger },
  };
  const s = map[status] || map.pending;
  return (
    <View style={[styles.pill, { backgroundColor: `${s.color}22` }]}>
      <Txt size="xxs" weight="700" color={s.color}>{s.label}</Txt>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface2,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  catPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surface2,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  toast: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    ...shadow.card,
  },
  rejectOverlay: { flex: 1 },
  rejectOverlayInner: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  rejectCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectInput: {
    width: "100%",
    minHeight: 90,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface2,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: "top",
  },
});
