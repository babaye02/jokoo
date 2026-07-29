// Écran de gestion des prestations (prestataire).
// Liste, ajoute, modifie, désactive et supprime des prestations.
import { useCallback, useEffect, useState } from "react";
import {
  View, StyleSheet, ScrollView, Pressable, RefreshControl, Alert,
  KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, PrestationSvc, ServiceItem, PriceType } from "@/src/api";
import { priceLabel } from "@/src/pricing";
import { Btn, Card, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const PRICE_TYPES: { key: PriceType; label: string; icon: any }[] = [
  { key: "fixed", label: "Prix fixe", icon: "pricetag" },
  { key: "from",  label: "À partir de…", icon: "trending-up" },
  { key: "quote", label: "Sur devis", icon: "document-text" },
];

type EditingSvc = Partial<PrestationSvc> & { _new?: boolean };

export default function MyServices() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PrestationSvc[]>([]);
  const [cats, setCats] = useState<ServiceItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<EditingSvc | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.get<PrestationSvc[]>("/services/mine"));
    } catch {}
  }, []);

  useEffect(() => {
    api.get<ServiceItem[]>("/services").then(setCats).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => setEditing({
    _new: true,
    name: "",
    description: "",
    category_key: cats[0]?.key || "plombier",
    photos: [],
    price_type: "fixed",
    price_amount: 5000 as any,
    duration_minutes: null,
    active: true,
  });

  const openEdit = (s: PrestationSvc) => setEditing({ ...s });

  const toggleActive = async (s: PrestationSvc) => {
    try {
      await api.patch(`/services/mine/${s.id}`, { ...s, active: !s.active });
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const remove = (s: PrestationSvc) => {
    Alert.alert("Supprimer", `Supprimer "${s.name}" ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        await api.del(`/services/mine/${s.id}`);
        load();
      } },
    ]);
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim() || (editing.name.trim().length < 2)) {
      return Alert.alert("Nom requis", "Donnez un nom à votre prestation (min. 2 caractères).");
    }
    if (editing.price_type !== "quote" && (!editing.price_amount || (editing.price_amount as number) < 500)) {
      return Alert.alert("Prix invalide", "Indiquez un montant minimum de 500 F CFA.");
    }
    setSaving(true);
    try {
      const payload = {
        name: editing.name,
        description: editing.description || "",
        category_key: editing.category_key,
        photos: editing.photos || [],
        price_type: editing.price_type || "fixed",
        price_amount: editing.price_type === "quote" ? null : Number(editing.price_amount),
        duration_minutes: editing.duration_minutes ? Number(editing.duration_minutes) : null,
        active: editing.active !== false,
      };
      if (editing._new) await api.post("/services/mine", payload);
      else await api.patch(`/services/mine/${editing.id}`, payload);
      setEditing(null);
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="services-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Mes prestations</Txt>
        <Pressable onPress={openNew} style={styles.addBtn} testID="services-add">
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.turquoise} />}
      >
        {items.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
              <Ionicons name="pricetags-outline" size={44} color={colors.textSubtle} />
              <Txt size="md" weight="600" style={{ marginTop: spacing.md }}>Aucune prestation</Txt>
              <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
                Ajoutez vos prestations pour que les clients puissent réserver.
              </Txt>
              <Btn title="Ajouter une prestation" onPress={openNew} style={{ marginTop: spacing.md }} testID="services-empty-add" />
            </View>
          </Card>
        ) : items.map((s) => (
          <Card key={s.id} style={{ padding: 0, overflow: "hidden" }}>
            <View style={{ flexDirection: "row" }}>
              {s.photos?.[0] ? (
                <Image source={{ uri: s.photos[0] }} style={{ width: 84, height: 84 }} contentFit="cover" />
              ) : (
                <View style={{ width: 84, height: 84, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="briefcase" size={26} color={colors.turquoise} />
                </View>
              )}
              <View style={{ flex: 1, padding: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Txt weight="700" numberOfLines={1} style={{ flex: 1 }}>{s.name}</Txt>
                  {!s.active ? <View style={styles.inactivePill}><Txt size="xxs" weight="700" color={colors.textMuted}>DÉSACTIVÉE</Txt></View> : null}
                </View>
                <Txt size="xs" color={colors.textMuted} numberOfLines={2} style={{ marginTop: 3 }}>{s.description || "—"}</Txt>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  <Txt weight="700" color={colors.turquoise}>{priceLabel(s)}</Txt>
                  {s.duration_minutes ? (
                    <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 8 }}>· {s.duration_minutes} min</Txt>
                  ) : null}
                </View>
              </View>
            </View>
            <View style={styles.rowActions}>
              <Pressable onPress={() => toggleActive(s)} style={styles.action} testID={`svc-toggle-${s.id}`}>
                <Ionicons name={s.active ? "eye" : "eye-off"} size={16} color={colors.midnight} />
                <Txt size="xs" weight="600" style={{ marginLeft: 6 }}>{s.active ? "Désactiver" : "Activer"}</Txt>
              </Pressable>
              <View style={{ width: 1, backgroundColor: colors.divider }} />
              <Pressable onPress={() => openEdit(s)} style={styles.action} testID={`svc-edit-${s.id}`}>
                <Ionicons name="create-outline" size={16} color={colors.midnight} />
                <Txt size="xs" weight="600" style={{ marginLeft: 6 }}>Modifier</Txt>
              </Pressable>
              <View style={{ width: 1, backgroundColor: colors.divider }} />
              <Pressable onPress={() => remove(s)} style={styles.action} testID={`svc-delete-${s.id}`}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Txt size="xs" weight="600" color={colors.danger} style={{ marginLeft: 6 }}>Supprimer</Txt>
              </Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>

      {/* Modal-like editor overlay */}
      {editing ? (
        <View style={styles.overlay}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <SafeAreaView edges={["top"]} style={styles.editorHeader}>
              <Pressable onPress={() => setEditing(null)} style={styles.back} testID="svc-cancel">
                <Ionicons name="close" size={22} color={colors.midnight} />
              </Pressable>
              <Txt size="lg" weight="700">{editing._new ? "Nouvelle prestation" : "Modifier"}</Txt>
              <View style={{ width: 40 }} />
            </SafeAreaView>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
              <Input label="Nom" icon="pricetag-outline" placeholder="Ex : Tresses complètes" value={editing.name || ""} onChangeText={(v) => setEditing({ ...editing, name: v })} testID="svc-name" />
              <Input label="Description" icon="document-text-outline" placeholder="Précisez ce qui est inclus…" multiline numberOfLines={4} style={{ height: 100, textAlignVertical: "top", paddingTop: 12 }} value={editing.description || ""} onChangeText={(v) => setEditing({ ...editing, description: v })} testID="svc-description" />

              <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Catégorie</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.md }}>
                {cats.map((c) => (
                  <Pressable
                    key={c.key}
                    onPress={() => setEditing({ ...editing, category_key: c.key })}
                    style={[styles.chip, editing.category_key === c.key && styles.chipActive]}
                    testID={`svc-cat-${c.key}`}
                  >
                    <Ionicons name={c.icon as any} size={14} color={editing.category_key === c.key ? colors.white : colors.midnight} />
                    <Txt weight="600" color={editing.category_key === c.key ? colors.white : colors.midnight} style={{ marginLeft: 6 }}>{c.label}</Txt>
                  </Pressable>
                ))}
              </ScrollView>

              <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Prix</Txt>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md }}>
                {PRICE_TYPES.map((pt) => (
                  <Pressable
                    key={pt.key}
                    onPress={() => setEditing({ ...editing, price_type: pt.key })}
                    style={[styles.ptBtn, editing.price_type === pt.key && styles.ptBtnActive]}
                    testID={`svc-pt-${pt.key}`}
                  >
                    <Ionicons name={pt.icon} size={16} color={editing.price_type === pt.key ? colors.white : colors.midnight} />
                    <Txt size="xs" weight="700" color={editing.price_type === pt.key ? colors.white : colors.midnight} style={{ marginTop: 4, textAlign: "center" }}>{pt.label}</Txt>
                  </Pressable>
                ))}
              </View>

              {editing.price_type !== "quote" ? (
                <Input
                  label={editing.price_type === "from" ? "Montant de départ (F CFA)" : "Montant (F CFA)"}
                  icon="cash-outline"
                  keyboardType="numeric"
                  placeholder="Ex : 15000"
                  value={editing.price_amount != null ? String(editing.price_amount) : ""}
                  onChangeText={(v) => setEditing({ ...editing, price_amount: v ? Number(v.replace(/\D/g, "")) : (null as any) })}
                  testID="svc-price-amount"
                />
              ) : null}

              <Input
                label="Durée estimée (minutes) — facultatif"
                icon="time-outline"
                keyboardType="numeric"
                placeholder="Ex : 60"
                value={editing.duration_minutes != null ? String(editing.duration_minutes) : ""}
                onChangeText={(v) => setEditing({ ...editing, duration_minutes: v ? Number(v.replace(/\D/g, "")) : null })}
                testID="svc-duration"
              />

              <Input
                label="Photo (URL) — facultatif"
                icon="image-outline"
                placeholder="https://…"
                autoCapitalize="none"
                value={editing.photos?.[0] || ""}
                onChangeText={(v) => setEditing({ ...editing, photos: v ? [v] : [] })}
                testID="svc-photo"
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Txt weight="600">Prestation active</Txt>
                  <Txt size="xs" color={colors.textMuted}>Visible par les clients</Txt>
                </View>
                <Switch
                  value={editing.active !== false}
                  onValueChange={(v) => setEditing({ ...editing, active: v })}
                  trackColor={{ true: colors.turquoise, false: colors.border }}
                  testID="svc-active-switch"
                />
              </View>
            </ScrollView>
            <View style={[styles.editorBottom, { paddingBottom: 12 + insets.bottom }]}>
              <Btn title="Enregistrer" onPress={save} loading={saving} fullWidth size="lg" testID="svc-save" />
            </View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  rowActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  inactivePill: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.surface2 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },
  editorHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  chip: { flexDirection: "row", alignItems: "center", height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexShrink: 0 },
  chipActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  ptBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  ptBtnActive: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  switchRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface2, marginTop: spacing.md },
  editorBottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
