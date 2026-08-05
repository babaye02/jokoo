import { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, TextInput, RefreshControl, Modal } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { isSuperAdmin } from "@/src/perms";
import { Txt, Avatar, Badge, Btn, ErrorBox, ScreenHeader } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

/**
 * 🤝 Admin — Jokoo Partners (Ambassadeurs).
 *
 * Trois zones :
 *   1. Résumé + config (tiers, taux, objectif mensuel)
 *   2. Liste des ambassadeurs actifs / inactifs
 *   3. Ajout : sélectionner un user et l'activer comme ambassadeur
 */

interface AmbassadorRow {
  user_id: string;
  name?: string | null;
  avatar?: string | null;
  role?: string | null;
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
  links?: {
    web?: string;
    web_slug?: string;
    app?: string;
    share_text?: string;
  };
}

interface ConfigResp {
  thresholds: Record<string, number>;
  commissions: Record<string, number>;
  monthly_goal: number;
}

interface UserSuggestion {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
}

const TIER_LABELS: Record<string, string> = {
  starter: "🤝 Jokoo Partner",
  bronze: "🥉 Bronze",
  silver: "🥈 Silver",
  gold: "🥇 Gold",
  diamond: "💎 Diamond",
  elite: "👑 Elite",
};

const TIER_COLORS: Record<string, string> = {
  starter: "#94A3B8",
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#F5B301",
  diamond: "#22D3EE",
  elite: "#7C3AED",
};

export default function AdminAmbassadors() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [rows, setRows] = useState<AmbassadorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [config, setConfig] = useState<ConfigResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const allowed = isSuperAdmin(user);

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      const [ambsRes, cfg] = await Promise.all([
        api.get<{ total: number; items: AmbassadorRow[] } | AmbassadorRow[]>(
          `/admin/ambassadors?limit=200${searchDebounced ? `&q=${encodeURIComponent(searchDebounced)}` : ""}`
        ),
        api.get<ConfigResp>("/admin/ambassadors/config"),
      ]);
      // Rétro-compat : ancien format = array, nouveau = {total, items}
      const ambs = Array.isArray(ambsRes) ? ambsRes : (ambsRes?.items || []);
      setTotal(Array.isArray(ambsRes) ? ambs.length : (ambsRes?.total ?? ambs.length));
      setRows(ambs);
      setConfig(cfg);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [allowed, searchDebounced]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = useMemo(() => {
    if (filter === "active") return rows.filter((r) => r.active);
    if (filter === "inactive") return rows.filter((r) => !r.active);
    return rows;
  }, [rows, filter]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.active).length;
    const totalVerified = rows.reduce((s, r) => s + (r.verified_count || 0), 0);
    const totalPending = rows.reduce((s, r) => s + (r.pending_count || 0), 0);
    return { active, totalVerified, totalPending, all: total || rows.length };
  }, [rows, total]);

  if (!allowed) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <ScreenHeader title="Jokoo Partners" onBack={() => router.back()} />
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
          <Txt weight="700" style={{ marginTop: spacing.md }}>Accès super-admin requis</Txt>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader title="Jokoo Partners" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? <ErrorBox text={error} /> : null}

        {/* Summary */}
        <View style={styles.summaryRow}>
          <StatTile label="Ambassadeurs" value={totals.active} icon="people-outline" />
          <StatTile label="Vérifiés" value={totals.totalVerified} icon="checkmark-circle-outline" />
          <StatTile label="En attente" value={totals.totalPending} icon="hourglass-outline" />
        </View>

        {/* Config CTA */}
        <Pressable onPress={() => setShowConfig(true)} style={styles.configRow}>
          <Ionicons name="options-outline" size={20} color={colors.midnight} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt weight="700">Tiers & commissions</Txt>
            <Txt size="xs" color={colors.textMuted}>
              {config
                ? `Objectif ${config.monthly_goal}/mois · Bronze ${config.thresholds.bronze} · Silver ${config.thresholds.silver} · Gold ${config.thresholds.gold} · Diamond ${config.thresholds.diamond} · Elite ${config.thresholds.elite}`
                : "Chargement…"}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher par nom, e-mail, code ou slug…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={12}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter tabs */}
        <View style={styles.tabs}>
          {(["all", "active", "inactive"] as const).map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.tab, filter === f && styles.tabActive]}>
              <Txt weight="700" size="sm" color={filter === f ? colors.midnight : colors.textMuted}>
                {f === "all" ? "Tous" : f === "active" ? "Actifs" : "Inactifs"}
              </Txt>
            </Pressable>
          ))}
        </View>

        {/* Add ambassador */}
        <Btn
          title="Nommer un nouvel ambassadeur"
          icon="person-add-outline"
          onPress={() => setShowAdd(true)}
          style={{ marginBottom: spacing.md }}
        />

        {/* Ambassador list */}
        {loading ? (
          <Txt color={colors.textMuted} style={{ textAlign: "center", padding: spacing.xl }}>
            Chargement…
          </Txt>
        ) : filtered.length === 0 ? (
          <View style={[styles.center, { padding: spacing.xl }]}>
            <Ionicons name="people-outline" size={40} color={colors.textMuted} />
            <Txt color={colors.textMuted} style={{ marginTop: 8, textAlign: "center" }}>
              {filter === "all"
                ? "Aucun ambassadeur nommé."
                : filter === "active"
                  ? "Aucun ambassadeur actif."
                  : "Aucun ambassadeur inactif."}
            </Txt>
          </View>
        ) : (
          filtered.map((a) => (
            <Pressable
              key={a.user_id}
              onPress={() => router.push({ pathname: "/admin/ambassadors/[uid]", params: { uid: a.user_id } })}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
            >
              <Avatar uri={a.avatar || undefined} name={a.name || undefined} size={44} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Txt weight="700" numberOfLines={1}>{a.name || "—"}</Txt>
                  {!a.active ? <Badge label="Inactif" tone="danger" size="sm" /> : null}
                </View>
                <Txt size="xs" color={colors.textMuted}>
                  {a.code} · {a.slug} · {TIER_LABELS[a.tier] || a.tier}
                </Txt>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Txt weight="800" size="md" color={TIER_COLORS[a.tier] || colors.midnight}>
                  {a.verified_count}
                </Txt>
                <Txt size="xxs" color={colors.textMuted}>
                  {a.pending_count} en att.
                </Txt>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Modals */}
      <ActivateModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onDone={() => { setShowAdd(false); load(); }}
      />
      <ConfigModal
        visible={showConfig}
        onClose={() => setShowConfig(false)}
        config={config}
        onSaved={(cfg) => { setConfig(cfg); setShowConfig(false); }}
      />
    </SafeAreaView>
  );
}

// ---------------- Sub-components ----------------

function StatTile({ label, value, icon }: { label: string; value: number; icon: any }) {
  return (
    <View style={styles.statTile}>
      <Ionicons name={icon} size={20} color={colors.turquoise} />
      <Txt size="xl" weight="800" style={{ marginTop: 4 }}>{value}</Txt>
      <Txt size="xxs" color={colors.textMuted}>{label}</Txt>
    </View>
  );
}

// Helper : slugify sans accents (miroir du backend `_slugify`)
function suggestSlug(name: string): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")[0] || "";
}

// Modal — Activate a user as ambassador
function ActivateModal({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [selected, setSelected] = useState<UserSuggestion | null>(null);
  const [monthlyGoal, setMonthlyGoal] = useState("500");
  const [customSlug, setCustomSlug] = useState("");
  const [customBio, setCustomBio] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get<{ total: number; items: any[] }>(
          `/admin/crm/users?q=${encodeURIComponent(query)}&limit=8`
        );
        setSuggestions(
          (res.items || []).map((u: any) => ({
            id: u.id,
            name: u.name || u.email,
            email: u.email,
            role: u.role || "client",
            avatar: u.avatar,
          }))
        );
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!visible) {
      setQuery(""); setSuggestions([]); setSelected(null);
      setMonthlyGoal("500"); setCustomSlug(""); setCustomBio(""); setSaving(false);
    }
  }, [visible]);

  const doActivate = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/admin/users/${selected.id}/ambassador`, {
        active: true,
        monthly_goal: Math.max(0, parseInt(monthlyGoal, 10) || 500),
        custom_slug: customSlug.trim() || undefined,
        custom_bio: customBio.trim() || undefined,
      });
      Alert.alert("✅ Ambassadeur activé", `${selected.name} est maintenant Jokoo Partner.`);
      onDone();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible d'activer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Txt weight="800" size="lg">Nommer un ambassadeur</Txt>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.midnight} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
            {!selected ? (
              <>
                <Txt weight="600" size="sm" style={styles.label}>Chercher un utilisateur</Txt>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Nom ou e-mail…"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  autoCapitalize="none"
                />
                {suggestions.map((u) => (
                  <Pressable key={u.id} onPress={() => { setSelected(u); setCustomSlug(suggestSlug(u.name)); }} style={styles.suggestion}>
                    <Avatar uri={u.avatar || undefined} name={u.name} size={36} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Txt weight="700" numberOfLines={1}>{u.name}</Txt>
                      <Txt size="xs" color={colors.textMuted}>{u.email} · {u.role}</Txt>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ))}
                {query.length >= 2 && suggestions.length === 0 ? (
                  <Txt color={colors.textMuted} size="xs" style={{ padding: spacing.md, textAlign: "center" }}>
                    Aucun utilisateur trouvé.
                  </Txt>
                ) : null}
              </>
            ) : (
              <>
                <View style={styles.selectedRow}>
                  <Avatar uri={selected.avatar || undefined} name={selected.name} size={44} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Txt weight="700" numberOfLines={1}>{selected.name}</Txt>
                    <Txt size="xs" color={colors.textMuted}>{selected.email}</Txt>
                  </View>
                  <Pressable onPress={() => setSelected(null)}>
                    <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>

                <Txt weight="600" size="sm" style={styles.label}>Objectif mensuel (filleuls vérifiés)</Txt>
                <TextInput
                  value={monthlyGoal}
                  onChangeText={setMonthlyGoal}
                  keyboardType="number-pad"
                  style={styles.input}
                />

                <Txt weight="600" size="sm" style={styles.label}>Slug personnalisé (URL courte)</Txt>
                <TextInput
                  value={customSlug}
                  onChangeText={setCustomSlug}
                  placeholder="racky"
                  autoCapitalize="none"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <Txt size="xxs" color={colors.textMuted}>
                  Sera utilisé pour https://jokoo.com/{customSlug || "slug"}
                </Txt>

                <Txt weight="600" size="sm" style={styles.label}>Bio (facultatif)</Txt>
                <TextInput
                  value={customBio}
                  onChangeText={setCustomBio}
                  placeholder="Ambassadeur régional Dakar…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={[styles.input, { height: 72 }]}
                />

                <Btn
                  title={saving ? "Activation…" : "Activer comme ambassadeur"}
                  onPress={doActivate}
                  disabled={saving}
                  style={{ marginTop: spacing.lg }}
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Modal — Edit config (thresholds, commissions, monthly goal)
function ConfigModal({
  visible, onClose, config, onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  config: ConfigResp | null;
  onSaved: (c: ConfigResp) => void;
}) {
  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  const [commissions, setCommissions] = useState<Record<string, string>>({});
  const [monthlyGoal, setMonthlyGoal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setThresholds(Object.fromEntries(Object.entries(config.thresholds).map(([k, v]) => [k, String(v)])));
      setCommissions(Object.fromEntries(Object.entries(config.commissions).map(([k, v]) => [k, String(Math.round(v * 100))])));
      setMonthlyGoal(String(config.monthly_goal));
    }
  }, [config, visible]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        thresholds: Object.fromEntries(Object.entries(thresholds).map(([k, v]) => [k, parseInt(v, 10) || 0])),
        commissions: Object.fromEntries(Object.entries(commissions).map(([k, v]) => [k, (parseFloat(v) || 0) / 100])),
        monthly_goal: parseInt(monthlyGoal, 10) || 500,
      };
      const res = await api.put<ConfigResp>("/admin/ambassadors/config", payload);
      onSaved(res);
      Alert.alert("✅ Configuration mise à jour");
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de sauvegarder.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Txt weight="800" size="lg">Tiers & commissions</Txt>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.midnight} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
            <Txt weight="600" size="sm" style={styles.label}>Objectif mensuel par ambassadeur (filleuls vérifiés)</Txt>
            <TextInput
              value={monthlyGoal}
              onChangeText={setMonthlyGoal}
              keyboardType="number-pad"
              style={styles.input}
            />

            <Txt weight="700" size="sm" style={[styles.label, { marginTop: spacing.md }]}>
              Seuils des tiers (filleuls vérifiés requis)
            </Txt>
            {["bronze", "silver", "gold", "diamond", "elite"].map((tier) => (
              <View key={tier} style={styles.tierRow}>
                <Txt weight="600" style={{ width: 100 }}>
                  {TIER_LABELS[tier]}
                </Txt>
                <TextInput
                  value={thresholds[tier] || ""}
                  onChangeText={(v) => setThresholds({ ...thresholds, [tier]: v })}
                  keyboardType="number-pad"
                  style={[styles.input, { flex: 1, marginTop: 0 }]}
                />
              </View>
            ))}

            <Txt weight="700" size="sm" style={[styles.label, { marginTop: spacing.md }]}>
              Commissions par tier (%)
            </Txt>
            {["starter", "bronze", "silver", "gold", "diamond", "elite"].map((tier) => (
              <View key={tier} style={styles.tierRow}>
                <Txt weight="600" style={{ width: 100 }}>
                  {TIER_LABELS[tier]}
                </Txt>
                <TextInput
                  value={commissions[tier] || ""}
                  onChangeText={(v) => setCommissions({ ...commissions, [tier]: v })}
                  keyboardType="decimal-pad"
                  style={[styles.input, { flex: 1, marginTop: 0 }]}
                />
                <Txt style={{ marginLeft: 6 }} color={colors.textMuted}>%</Txt>
              </View>
            ))}

            <Btn
              title={saving ? "Sauvegarde…" : "Sauvegarder la configuration"}
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

// ---------------- Styles ----------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statTile: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.sm,
  },
  configRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.midnight,
    paddingVertical: 6,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surfaceWarm,
    padding: 4,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: colors.card,
    ...shadow.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
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
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: radius.md,
    marginTop: 6,
    backgroundColor: colors.surfaceWarm,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7C3AED22",
    borderColor: "#7C3AED55",
    borderWidth: 1,
    padding: 10,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
});
