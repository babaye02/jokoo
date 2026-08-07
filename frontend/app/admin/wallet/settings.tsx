// Admin Wallet — Paramètres plateforme & règles de commission
// - Onglet Paramètres : édite les settings (recharge min/max, frais, prix Jokoo Pro, planchers…)
// - Onglet Commissions : gère les règles par catégorie (upsert, delete, activer/désactiver)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import {
  adminWalletApi,
  CommissionRule,
  PlatformSetting,
  SETTING_META,
} from "@/src/wallet/admin";

type Tab = "settings" | "commissions";

export default function AdminSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("settings");
  const [settings, setSettings] = useState<Record<string, PlatformSetting>>({});
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ key: string; setting: PlatformSetting } | null>(null);
  const [ruleModal, setRuleModal] = useState<Partial<CommissionRule> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        adminWalletApi.getSettings(),
        adminWalletApi.listCommissionRules(),
      ]);
      setSettings(s || {});
      setRules(r || []);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Chargement impossible.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const g: Record<string, [string, PlatformSetting][]> = {};
    Object.entries(settings).forEach(([key, s]) => {
      const meta = SETTING_META[key];
      const grpName = meta?.group || "Autres";
      g[grpName] = g[grpName] || [];
      g[grpName].push([key, s]);
    });
    return g;
  }, [settings]);

  const openEdit = (key: string, s: PlatformSetting) => {
    setEditing({ key, setting: s });
  };
  const openRule = (r?: CommissionRule) => {
    setRuleModal(
      r
        ? { ...r }
        : {
            category_key: "",
            commission_percent: 15,
            min_commission_xof: 0,
            max_commission_xof: null,
            active: true,
            notes: "",
          }
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Paramètres finances</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TabBtn label="Paramètres" active={tab === "settings"} onPress={() => setTab("settings")} />
        <TabBtn label="Commissions" active={tab === "commissions"} onPress={() => setTab("commissions")} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.turquoise} />
          </View>
        ) : tab === "settings" ? (
          Object.entries(groups).map(([grp, items]) => (
            <View key={grp}>
              <Txt size="xs" weight="700" color={colors.textMuted} style={{ letterSpacing: 1.5, marginBottom: 6 }}>
                {grp.toUpperCase()}
              </Txt>
              <View style={styles.card}>
                {items.map(([key, s]) => {
                  const meta = SETTING_META[key];
                  const displayValue = formatSettingValue(s.value, meta);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => openEdit(key, s)}
                      style={styles.settingRow}
                      testID={`setting-${key}`}
                    >
                      <View style={{ flex: 1 }}>
                        <Txt size="sm" weight="700">{meta?.label || key}</Txt>
                        {meta?.help ? (
                          <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>{meta.help}</Txt>
                        ) : null}
                        {s.is_default ? (
                          <View style={styles.defaultBadge}>
                            <Txt size="xxs" weight="700" color={colors.textMuted}>défaut</Txt>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Txt size="md" weight="800" style={{ fontVariant: ["tabular-nums"] as any }}>
                          {displayValue}
                        </Txt>
                        <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} style={{ marginTop: 2 }} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        ) : (
          <>
            <View style={styles.helpCard}>
              <Ionicons name="information-circle" size={18} color={colors.info} />
              <Txt size="xs" color={colors.textSecondary} style={{ flex: 1, marginLeft: 8, lineHeight: 18 }}>
                Une règle par catégorie remplace la commission par défaut. Le taux s&apos;applique sur le montant brut de la réservation, plafonné/plancheré selon vos bornes.
              </Txt>
            </View>

            <Pressable onPress={() => openRule()} style={styles.addBtn} testID="add-commission-rule">
              <Ionicons name="add-circle" size={20} color={colors.turquoise} />
              <Txt weight="700" color={colors.turquoise} style={{ marginLeft: 8 }}>Nouvelle règle de commission</Txt>
            </Pressable>

            {rules.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="pricetags-outline" size={40} color={colors.textMuted} />
                <Txt weight="700" style={{ marginTop: 10 }}>Aucune règle personnalisée</Txt>
                <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
                  Le taux par défaut ({settings.commission_default_percent?.value ?? "—"}%) s&apos;applique à toutes les catégories.
                </Txt>
              </View>
            ) : (
              <View style={styles.card}>
                {rules.map((r) => (
                  <Pressable
                    key={r.id || r.category_key}
                    onPress={() => openRule(r)}
                    style={styles.settingRow}
                    testID={`rule-${r.category_key}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Txt size="sm" weight="700">{r.category_key}</Txt>
                      {r.notes ? <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>{r.notes}</Txt> : null}
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                        {r.active ? (
                          <View style={[styles.tag, { backgroundColor: "#E9F9EF" }]}>
                            <Txt size="xxs" weight="700" color="#1F7A3F">Actif</Txt>
                          </View>
                        ) : (
                          <View style={[styles.tag, { backgroundColor: "#F2F2F2" }]}>
                            <Txt size="xxs" weight="700" color={colors.textMuted}>Inactif</Txt>
                          </View>
                        )}
                        {r.min_commission_xof > 0 ? (
                          <View style={[styles.tag, { backgroundColor: colors.surface2 }]}>
                            <Txt size="xxs" weight="700">min {r.min_commission_xof} F</Txt>
                          </View>
                        ) : null}
                        {r.max_commission_xof ? (
                          <View style={[styles.tag, { backgroundColor: colors.surface2 }]}>
                            <Txt size="xxs" weight="700">max {r.max_commission_xof} F</Txt>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Txt size="lg" weight="800" style={{ fontVariant: ["tabular-nums"] as any }}>
                        {r.commission_percent}%
                      </Txt>
                      <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} style={{ marginTop: 2 }} />
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Setting edit modal */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        {editing ? (
          <SettingEditor
            editing={editing}
            busy={busy}
            onClose={() => { setEditing(null); setBusy(false); }}
            onSave={async (v) => {
              setBusy(true);
              try {
                await adminWalletApi.setSetting(editing.key, v);
                await load();
                setEditing(null);
              } catch (e: any) {
                Alert.alert("Erreur", e?.message || "Mise à jour refusée.");
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : null}
      </Modal>

      {/* Commission rule modal */}
      <Modal visible={!!ruleModal} transparent animationType="fade" onRequestClose={() => setRuleModal(null)}>
        {ruleModal ? (
          <RuleEditor
            rule={ruleModal}
            busy={busy}
            onDelete={
              ruleModal.category_key && rules.some((x) => x.category_key === ruleModal.category_key)
                ? async () => {
                    if (!ruleModal.category_key) return;
                    Alert.alert(
                      "Supprimer la règle ?",
                      `La commission par défaut s'appliquera de nouveau pour "${ruleModal.category_key}".`,
                      [
                        { text: "Annuler", style: "cancel" },
                        {
                          text: "Supprimer",
                          style: "destructive",
                          onPress: async () => {
                            setBusy(true);
                            try {
                              await adminWalletApi.deleteCommissionRule(ruleModal.category_key!);
                              await load();
                              setRuleModal(null);
                            } catch (e: any) {
                              Alert.alert("Erreur", e?.message || "Suppression refusée.");
                            } finally {
                              setBusy(false);
                            }
                          },
                        },
                      ]
                    );
                  }
                : null
            }
            onClose={() => { setRuleModal(null); setBusy(false); }}
            onSave={async (body) => {
              if (!body.category_key || body.category_key.trim().length === 0) {
                Alert.alert("Clé obligatoire", "Saisissez une clé de catégorie (ex : plomberie).");
                return;
              }
              setBusy(true);
              try {
                await adminWalletApi.upsertCommissionRule({
                  category_key: body.category_key,
                  commission_percent: body.commission_percent ?? 0,
                  min_commission_xof: body.min_commission_xof ?? 0,
                  max_commission_xof: body.max_commission_xof ?? null,
                  active: body.active ?? true,
                  notes: body.notes || undefined,
                });
                await load();
                setRuleModal(null);
              } catch (e: any) {
                Alert.alert("Erreur", e?.message || "Enregistrement refusé.");
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : null}
      </Modal>
    </View>
  );
}

// ─── Editors ───

function SettingEditor({
  editing,
  busy,
  onClose,
  onSave,
}: {
  editing: { key: string; setting: PlatformSetting };
  busy: boolean;
  onClose: () => void;
  onSave: (value: any) => Promise<void>;
}) {
  const meta = SETTING_META[editing.key];
  const kind = meta?.kind || "int";
  const [text, setText] = useState<string>(String(editing.setting.value ?? ""));
  const [boolean_, setBoolean] = useState<boolean>(!!editing.setting.value);

  const submit = async () => {
    let value: any;
    if (kind === "bool") {
      value = boolean_;
    } else if (kind === "float") {
      value = parseFloat(text.replace(",", "."));
      if (!Number.isFinite(value)) return Alert.alert("Valeur invalide");
    } else {
      value = parseInt(text.replace(/[^\d-]/g, ""), 10);
      if (!Number.isFinite(value)) return Alert.alert("Valeur invalide");
    }
    await onSave(value);
  };

  return (
    <View style={styles.modalBackdrop}>
      <View style={styles.modalCard}>
        <Txt size="lg" weight="800">{meta?.label || editing.key}</Txt>
        {meta?.help ? (
          <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>{meta.help}</Txt>
        ) : null}
        <Txt size="xxs" color={colors.textSubtle} style={{ marginTop: 8 }}>
          Défaut : {String(editing.setting.default)}
          {editing.setting.updated_by ? ` · dernière MAJ par ${editing.setting.updated_by.slice(0, 8)}…` : ""}
        </Txt>

        {kind === "bool" ? (
          <View style={styles.switchRow}>
            <Txt size="sm" weight="700">Activé</Txt>
            <Switch
              value={boolean_}
              onValueChange={setBoolean}
              trackColor={{ true: colors.turquoise, false: colors.borderStrong }}
            />
          </View>
        ) : (
          <>
            <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>
              VALEUR ({meta?.unit || (kind === "float" ? "décimal" : "entier")})
            </Txt>
            <TextInput
              value={text}
              onChangeText={setText}
              keyboardType={kind === "float" ? "decimal-pad" : "numbers-and-punctuation"}
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textSubtle}
              autoFocus
            />
          </>
        )}

        <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.lg }}>
          <Pressable onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.surface2, flex: 1 }]}>
            <Txt weight="700">Annuler</Txt>
          </Pressable>
          <Btn title="Enregistrer" onPress={submit} loading={busy} variant="primary" />
        </View>
      </View>
    </View>
  );
}

function RuleEditor({
  rule,
  busy,
  onSave,
  onClose,
  onDelete,
}: {
  rule: Partial<CommissionRule>;
  busy: boolean;
  onSave: (body: Partial<CommissionRule>) => Promise<void>;
  onClose: () => void;
  onDelete: (() => Promise<void>) | null;
}) {
  const [catKey, setCatKey] = useState(rule.category_key || "");
  const [percent, setPercent] = useState(String(rule.commission_percent ?? 15));
  const [minC, setMinC] = useState(String(rule.min_commission_xof ?? 0));
  const [maxC, setMaxC] = useState(rule.max_commission_xof != null ? String(rule.max_commission_xof) : "");
  const [active, setActive] = useState<boolean>(rule.active !== false);
  const [notes, setNotes] = useState(rule.notes || "");

  const isEdit = !!rule.id;

  const submit = async () => {
    const pct = parseFloat(percent.replace(",", "."));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return Alert.alert("Taux invalide", "Entre 0 et 100 %.");
    const min = parseInt(minC.replace(/[^\d]/g, ""), 10) || 0;
    const max = maxC.trim().length === 0 ? null : parseInt(maxC.replace(/[^\d]/g, ""), 10);
    await onSave({
      category_key: catKey.trim().toLowerCase(),
      commission_percent: pct,
      min_commission_xof: min,
      max_commission_xof: max ?? null,
      active,
      notes: notes.trim(),
    });
  };

  return (
    <View style={styles.modalBackdrop}>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.modalCard}>
          <Txt size="lg" weight="800">{isEdit ? `Règle : ${rule.category_key}` : "Nouvelle règle"}</Txt>

          <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>CLÉ DE CATÉGORIE</Txt>
          <TextInput
            value={catKey}
            onChangeText={setCatKey}
            placeholder="plomberie"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            editable={!isEdit}
            style={[styles.input, isEdit && { opacity: 0.5 }]}
          />

          <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>TAUX (%)</Txt>
          <TextInput
            value={percent}
            onChangeText={setPercent}
            keyboardType="decimal-pad"
            placeholder="15"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
          />

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>MIN (F CFA)</Txt>
              <TextInput
                value={minC}
                onChangeText={setMinC}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>MAX (F CFA, vide = illimité)</Txt>
              <TextInput
                value={maxC}
                onChangeText={setMaxC}
                keyboardType="numeric"
                placeholder="illimité"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
              />
            </View>
          </View>

          <Txt size="xs" weight="700" style={{ marginTop: spacing.md, color: colors.textMuted }}>NOTES (optionnel)</Txt>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Justification, contexte…"
            placeholderTextColor={colors.textSubtle}
            multiline
            style={[styles.input, { minHeight: 60, textAlignVertical: "top" as any }]}
          />

          <View style={styles.switchRow}>
            <Txt size="sm" weight="700">Règle active</Txt>
            <Switch
              value={active}
              onValueChange={setActive}
              trackColor={{ true: colors.turquoise, false: colors.borderStrong }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.lg }}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.surface2 }]}>
              <Txt weight="700">Annuler</Txt>
            </Pressable>
            {onDelete ? (
              <Pressable onPress={onDelete} style={[styles.modalBtn, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="trash" size={14} color="#DC2626" />
                <Txt weight="700" color="#DC2626" style={{ marginLeft: 4 }}>Supprimer</Txt>
              </Pressable>
            ) : null}
            <Btn title="Enregistrer" onPress={submit} loading={busy} variant="primary" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Helpers ───

function formatSettingValue(value: any, meta?: { unit?: string; kind?: string }): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") {
    const formatted = new Intl.NumberFormat("fr-FR").format(value);
    if (meta?.unit === "%") return `${value}%`;
    if (meta?.unit === "F CFA") return `${formatted} F`;
    return formatted;
  }
  return String(value);
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
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow.soft },
  settingRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  defaultBadge: {
    alignSelf: "flex-start",
    marginTop: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
    backgroundColor: colors.surface2,
  },
  helpCard: {
    flexDirection: "row", alignItems: "flex-start",
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: "#EBF1FD",
  },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1, borderColor: colors.turquoise, borderStyle: "dashed",
  },
  emptyCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, ...shadow.soft },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalCard: { width: "100%", maxWidth: 480, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 20 },
  input: {
    marginTop: 6, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 14, color: colors.midnight,
  },
  switchRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: spacing.md, paddingVertical: 8,
  },
  modalBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 16, height: 46, borderRadius: 999,
  },
});
