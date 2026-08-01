// Support / Modération — gestion complète des signalements.
//
// Workflow : open → investigating → (resolved | dismissed | escalated).
// Chaque changement de statut, priorité, assignation ou note est journalisé
// dans `history[]` (visible dans la timeline de chaque signalement).
import { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, TextInput, Modal } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type ReportStatus = "open" | "investigating" | "resolved" | "dismissed" | "escalated";
type ReportPriority = "normal" | "high" | "urgent";

type HistoryEntry = {
  at: string;
  by_name?: string;
  action: "created" | "status_changed" | "priority_changed" | "assigned" | "note";
  from?: string;
  to?: string;
  note?: string;
};

type Report = {
  id: string;
  author_name: string;
  target_id?: string;
  target_type?: string;
  reason: string;
  status: ReportStatus;
  priority?: ReportPriority;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  resolved_by_name?: string;
  resolved_at?: string;
  history?: HistoryEntry[];
  created_at: string;
  updated_at?: string;
};

type Stats = {
  total: number;
  open: number;
  investigating: number;
  resolved: number;
  dismissed: number;
  escalated: number;
};

const STATUS_META: Record<ReportStatus, { label: string; color: string; bg: string; icon: any }> = {
  open:          { label: "Ouvert",       color: "#DC2626", bg: "#FEE2E2", icon: "alert-circle" },
  investigating: { label: "En cours",     color: "#D97706", bg: "#FEF3C7", icon: "hourglass" },
  resolved:      { label: "Résolu",       color: "#16A34A", bg: "#DCFCE7", icon: "checkmark-circle" },
  dismissed:     { label: "Rejeté",       color: "#6B7280", bg: "#F3F4F6", icon: "close-circle" },
  escalated:     { label: "Escaladé",     color: "#7C3AED", bg: "#EDE9FE", icon: "arrow-up-circle" },
};

const PRIORITY_META: Record<ReportPriority, { label: string; color: string; bg: string }> = {
  normal: { label: "Normal", color: "#64748B", bg: "#F1F5F9" },
  high:   { label: "Élevé",  color: "#D97706", bg: "#FEF3C7" },
  urgent: { label: "Urgent", color: "#DC2626", bg: "#FEE2E2" },
};

const FILTERS: { key: "all" | ReportStatus; label: string }[] = [
  { key: "all",           label: "Tous" },
  { key: "open",          label: "Ouverts" },
  { key: "investigating", label: "En cours" },
  { key: "escalated",     label: "Escaladés" },
  { key: "resolved",      label: "Résolus" },
  { key: "dismissed",     label: "Rejetés" },
];

export default function AdminReports() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Report[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<"all" | ReportStatus>("all");
  const [editing, setEditing] = useState<Report | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        api.get<Report[]>(`/admin/reports${filter !== "all" ? `?status_filter=${filter}` : ""}`),
        api.get<Stats>("/admin/reports/stats").catch(() => null),
      ]);
      setItems(list);
      if (s) setStats(s);
    } catch (_e) { /* noop */ }
  }, [filter]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="rep-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Txt size="lg" weight="700">Signalements</Txt>
          {stats ? (
            <Txt size="xxs" color={colors.textMuted}>
              {stats.open + stats.investigating} en cours · {stats.total} au total
            </Txt>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {stats ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
          <StatCard label="Ouverts"    value={stats.open}          tone="#DC2626" />
          <StatCard label="En cours"   value={stats.investigating} tone="#D97706" />
          <StatCard label="Escaladés"  value={stats.escalated}     tone="#7C3AED" />
          <StatCard label="Résolus"    value={stats.resolved}      tone="#16A34A" />
          <StatCard label="Rejetés"    value={stats.dismissed}     tone="#6B7280" />
        </ScrollView>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.filter, filter === f.key && styles.filterActive]}
            testID={`filter-${f.key}`}
          >
            <Txt size="xs" weight="700" color={filter === f.key ? colors.white : colors.midnight}>{f.label}</Txt>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        {items.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Ionicons name="checkmark-circle-outline" size={44} color={colors.success} />
              <Txt weight="600" style={{ marginTop: spacing.md }}>
                {filter === "all" ? "Aucun signalement" : `Aucun signalement « ${FILTERS.find(f => f.key === filter)?.label} »`}
              </Txt>
            </View>
          </Card>
        ) : items.map((r) => {
          const st = STATUS_META[r.status] || STATUS_META.open;
          const pr = PRIORITY_META[(r.priority || "normal") as ReportPriority];
          return (
            <Pressable key={r.id} onPress={() => setEditing(r)} testID={`rep-open-${r.id}`}>
              <Card style={{ padding: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Txt weight="700">{r.author_name}</Txt>
                    <Txt size="xxs" color={colors.textMuted}>
                      {r.target_type || "user"} · {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                    </Txt>
                  </View>
                  <View style={[styles.pill, { backgroundColor: pr.bg }]}>
                    <Txt size="xxs" weight="700" color={pr.color}>{pr.label.toUpperCase()}</Txt>
                  </View>
                  <View style={[styles.pill, { backgroundColor: st.bg, flexDirection: "row", alignItems: "center" }]}>
                    <Ionicons name={st.icon} size={12} color={st.color} />
                    <Txt size="xxs" weight="700" color={st.color} style={{ marginLeft: 4 }}>{st.label}</Txt>
                  </View>
                </View>
                <Txt size="sm" style={{ marginTop: 8, lineHeight: 20 }} numberOfLines={3}>{r.reason || "—"}</Txt>
                {r.assigned_to_name || r.resolved_by_name ? (
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 12 }}>
                    {r.assigned_to_name ? (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                        <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 3 }}>Assigné à {r.assigned_to_name}</Txt>
                      </View>
                    ) : null}
                    {r.resolved_by_name ? (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Ionicons name="checkmark-done" size={12} color={colors.success} />
                        <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 3 }}>par {r.resolved_by_name}</Txt>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
                  <Txt size="xxs" color={colors.textSubtle} style={{ marginLeft: 3 }}>
                    Ouvrir pour changer statut, ajouter note, voir l&apos;historique
                  </Txt>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>

      <ReportEditor
        report={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </View>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: tone }]}>
      <Txt size="lg" weight="700" color={tone}>{value}</Txt>
      <Txt size="xxs" color={colors.textMuted}>{label}</Txt>
    </View>
  );
}

function ReportEditor({ report, onClose, onSaved }: { report: Report | null; onClose: () => void; onSaved: () => void }) {
  const [newStatus, setNewStatus] = useState<ReportStatus | null>(null);
  const [newPriority, setNewPriority] = useState<ReportPriority | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useMemo(() => {
    // Reset local edits when a new report opens
    setNewStatus(null); setNewPriority(null); setNote(""); setErr(null);
  }, [report?.id]);

  if (!report) return null;

  const currentStatus = report.status;
  const currentPriority = (report.priority || "normal") as ReportPriority;
  const effStatus = newStatus || currentStatus;
  const effPriority = newPriority || currentPriority;
  const hasChanges = newStatus !== null || newPriority !== null || note.trim().length > 0;

  const save = async () => {
    if (!hasChanges) {
      setErr("Aucune modification. Changez le statut/priorité ou ajoutez une note.");
      return;
    }
    setErr(null); setSaving(true);
    try {
      const body: any = {};
      if (newStatus && newStatus !== currentStatus) body.status = newStatus;
      if (newPriority && newPriority !== currentPriority) body.priority = newPriority;
      if (note.trim()) body.note = note.trim();
      await api.patch(`/admin/reports/${report.id}`, body);
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const history = (report.history || []).slice().reverse();

  return (
    <Modal transparent={false} animationType="slide" visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <SafeAreaView edges={["top"]} style={styles.header}>
          <Pressable onPress={onClose} style={styles.back} testID="editor-close">
            <Ionicons name="close" size={22} color={colors.midnight} />
          </Pressable>
          <Txt size="lg" weight="700">Signalement</Txt>
          <View style={{ width: 40 }} />
        </SafeAreaView>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
            <Card>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="700">{report.author_name}</Txt>
                  <Txt size="xxs" color={colors.textMuted}>
                    {report.target_type || "user"} · {new Date(report.created_at).toLocaleString("fr-FR")}
                  </Txt>
                </View>
                <View style={[styles.pill, { backgroundColor: STATUS_META[currentStatus].bg }]}>
                  <Txt size="xxs" weight="700" color={STATUS_META[currentStatus].color}>
                    {STATUS_META[currentStatus].label.toUpperCase()}
                  </Txt>
                </View>
              </View>
              <Txt size="sm" style={{ marginTop: spacing.md, lineHeight: 22 }}>{report.reason || "—"}</Txt>
              {report.target_id ? (
                <Txt size="xxs" color={colors.textSubtle} style={{ marginTop: 8 }}>ID cible : {report.target_id}</Txt>
              ) : null}
            </Card>

            <Txt size="sm" weight="700" style={{ marginTop: spacing.lg, marginBottom: 8 }}>Nouveau statut</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {(Object.keys(STATUS_META) as ReportStatus[]).map((s) => {
                const active = effStatus === s;
                const meta = STATUS_META[s];
                return (
                  <Pressable
                    key={s}
                    onPress={() => setNewStatus(s === currentStatus ? null : s)}
                    style={[styles.chip, active && { backgroundColor: meta.color, borderColor: meta.color }]}
                    testID={`status-${s}`}
                  >
                    <Ionicons name={meta.icon} size={12} color={active ? colors.white : meta.color} />
                    <Txt size="xs" weight="700" color={active ? colors.white : colors.midnight} style={{ marginLeft: 4 }}>
                      {meta.label}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>

            <Txt size="sm" weight="700" style={{ marginTop: spacing.lg, marginBottom: 8 }}>Priorité</Txt>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(Object.keys(PRIORITY_META) as ReportPriority[]).map((p) => {
                const active = effPriority === p;
                const meta = PRIORITY_META[p];
                return (
                  <Pressable
                    key={p}
                    onPress={() => setNewPriority(p === currentPriority ? null : p)}
                    style={[styles.chip, active && { backgroundColor: meta.color, borderColor: meta.color }]}
                    testID={`priority-${p}`}
                  >
                    <Txt size="xs" weight="700" color={active ? colors.white : colors.midnight}>{meta.label}</Txt>
                  </Pressable>
                );
              })}
            </View>

            <Txt size="sm" weight="700" style={{ marginTop: spacing.lg, marginBottom: 8 }}>
              Ajouter une note (optionnel mais recommandé)
            </Txt>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Actions entreprises, vérifications, décision motivée…"
              placeholderTextColor={colors.textSubtle}
              multiline
              style={styles.noteInput}
              testID="report-note"
            />

            {err ? (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Txt size="xs" color={colors.danger} style={{ marginLeft: 6, flex: 1 }}>{err}</Txt>
              </View>
            ) : null}

            <Txt size="sm" weight="700" style={{ marginTop: spacing.lg, marginBottom: 8 }}>Historique</Txt>
            {history.length === 0 ? (
              <Txt size="xs" color={colors.textMuted}>{"Pas encore d'événement."}</Txt>
            ) : history.map((h, i) => (
              <View key={i} style={styles.historyItem}>
                <View style={styles.historyDot} />
                <View style={{ flex: 1 }}>
                  <Txt size="xs" weight="700">
                    {actionLabel(h)}
                  </Txt>
                  <Txt size="xxs" color={colors.textMuted}>
                    {h.by_name || "—"} · {new Date(h.at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </Txt>
                  {h.note ? <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2, fontStyle: "italic" }}>« {h.note} »</Txt> : null}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.bottom}>
            <Btn
              title="Enregistrer"
              onPress={save}
              loading={saving}
              disabled={!hasChanges || saving}
              fullWidth
              size="lg"
              testID="report-save"
            />
            {!hasChanges ? (
              <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
                {"Modifiez le statut, la priorité ou ajoutez une note pour activer l'enregistrement."}
              </Txt>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function actionLabel(h: HistoryEntry): string {
  switch (h.action) {
    case "created":          return "Signalement créé";
    case "status_changed":   return `Statut : ${labelStatus(h.from as any)} → ${labelStatus(h.to as any)}`;
    case "priority_changed": return `Priorité : ${labelPriority(h.from as any)} → ${labelPriority(h.to as any)}`;
    case "assigned":         return `Assigné à ${h.to || "—"}`;
    case "note":             return "Note ajoutée";
    default:                 return h.action;
  }
}
function labelStatus(s?: string) { return s && STATUS_META[s as ReportStatus] ? STATUS_META[s as ReportStatus].label : (s || "—"); }
function labelPriority(p?: string) { return p && PRIORITY_META[p as ReportPriority] ? PRIORITY_META[p as ReportPriority].label : (p || "—"); }

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  statsRow: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: 8 },
  statCard: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderLeftWidth: 4, minWidth: 100 },
  filterRow: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: 6, flexDirection: "row" },
  filter: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  chip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  noteInput: {
    minHeight: 100,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: 12, textAlignVertical: "top",
    fontSize: 14, color: colors.text,
    backgroundColor: colors.surface2,
  },
  errBox: {
    flexDirection: "row", alignItems: "center",
    padding: 10, borderRadius: radius.md,
    backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5",
    marginTop: spacing.md,
  },
  historyItem: { flexDirection: "row", gap: 12, marginBottom: 12 },
  historyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.turquoise, marginTop: 4 },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
});
