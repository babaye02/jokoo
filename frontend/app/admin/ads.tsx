// Admin — CRUD publicités.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Switch, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Ad, ServiceItem } from "@/src/api";
import { Btn, Card, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type EditingAd = Partial<Ad> & { _new?: boolean };

const FORMATS: { key: any; label: string; icon: any }[] = [
  { key: "banner", label: "Bannière", icon: "tablet-landscape-outline" },
  { key: "image", label: "Image", icon: "image-outline" },
  { key: "carousel", label: "Carrousel", icon: "images-outline" },
];

const PLACEMENTS: { key: string; label: string }[] = [
  { key: "home", label: "Accueil" },
  { key: "between_lists", label: "Entre listes" },
  { key: "category", label: "Catégorie" },
];

export default function AdminAds() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Ad[]>([]);
  const [cats, setCats] = useState<ServiceItem[]>([]);
  const [editing, setEditing] = useState<EditingAd | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.get<Ad[]>("/admin/ads")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); api.get<ServiceItem[]>("/services").then(setCats).catch(() => {}); }, [load]));

  const openNew = () => setEditing({
    _new: true, format: "banner", title: "", description: "", button_label: "Voir",
    link: "", images: [], placements: ["home"], category_key: null, active: true,
  });

  const remove = (a: Ad) => {
    Alert.alert("Supprimer", `Supprimer "${a.title}" ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        await api.del(`/admin/ads/${a.id}`);
        load();
      } },
    ]);
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.title?.trim()) return Alert.alert("Titre requis");
    if (!editing.images || editing.images.length === 0 || !editing.images[0]) {
      return Alert.alert("Image requise", "Ajoutez au moins une image (URL).");
    }
    setSaving(true);
    try {
      const payload = {
        format: editing.format || "banner",
        title: editing.title,
        description: editing.description || "",
        button_label: editing.button_label || "Voir",
        link: editing.link || null,
        images: editing.images.filter(Boolean),
        placements: editing.placements || ["home"],
        category_key: editing.category_key || null,
        start_at: editing.start_at || null,
        end_at: editing.end_at || null,
        active: editing.active !== false,
      };
      if (editing._new) await api.post("/admin/ads", payload);
      else await api.patch(`/admin/ads/${editing.id}`, payload);
      setEditing(null);
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setSaving(false);
    }
  };

  const togglePlacement = (k: string) => {
    if (!editing) return;
    const cur = editing.placements || [];
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    setEditing({ ...editing, placements: next });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="ads-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Publicités</Txt>
        <Pressable onPress={openNew} style={styles.addBtn} testID="ads-add">
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        {items.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
              <Ionicons name="megaphone-outline" size={44} color={colors.textSubtle} />
              <Txt size="md" weight="600" style={{ marginTop: spacing.md }}>Aucune publicité</Txt>
              <Btn title="Créer une publicité" onPress={openNew} style={{ marginTop: spacing.md }} />
            </View>
          </Card>
        ) : items.map((a) => (
          <Card key={a.id} style={{ padding: 0, overflow: "hidden" }}>
            {a.images?.[0] ? (
              <Image source={{ uri: a.images[0] }} style={{ width: "100%", height: 120 }} contentFit="cover" />
            ) : null}
            <View style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt weight="700" numberOfLines={1} style={{ flex: 1 }}>{a.title}</Txt>
                <View style={[styles.pill, { backgroundColor: a.active ? "#DCFCE7" : colors.surface2 }]}>
                  <Txt size="xxs" weight="700" color={a.active ? colors.success : colors.textMuted}>
                    {a.active ? "ACTIVE" : "INACTIVE"}
                  </Txt>
                </View>
              </View>
              <Txt size="xs" color={colors.textMuted} numberOfLines={2} style={{ marginTop: 4 }}>{a.description || "—"}</Txt>
              <View style={{ flexDirection: "row", marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                {a.placements.map((p) => (
                  <View key={p} style={styles.chipMini}><Txt size="xxs" weight="600" color={colors.midnight}>{p}</Txt></View>
                ))}
              </View>
              <View style={{ flexDirection: "row", marginTop: 12, gap: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="eye" size={14} color={colors.textMuted} />
                  <Txt size="xs" style={{ marginLeft: 4 }}>{a.impressions || 0}</Txt>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="hand-left" size={14} color={colors.textMuted} />
                  <Txt size="xs" style={{ marginLeft: 4 }}>{a.clicks || 0}</Txt>
                </View>
              </View>
            </View>
            <View style={styles.rowActions}>
              <Pressable onPress={() => setEditing({ ...a })} style={styles.action} testID={`ad-edit-${a.id}`}>
                <Ionicons name="create-outline" size={16} color={colors.midnight} />
                <Txt size="xs" weight="600" style={{ marginLeft: 6 }}>Modifier</Txt>
              </Pressable>
              <View style={{ width: 1, backgroundColor: colors.divider }} />
              <Pressable onPress={() => remove(a)} style={styles.action} testID={`ad-delete-${a.id}`}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Txt size="xs" weight="600" color={colors.danger} style={{ marginLeft: 6 }}>Supprimer</Txt>
              </Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>

      {editing ? (
        <View style={styles.overlay}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <SafeAreaView edges={["top"]} style={styles.header}>
              <Pressable onPress={() => setEditing(null)} style={styles.back}>
                <Ionicons name="close" size={22} color={colors.midnight} />
              </Pressable>
              <Txt size="lg" weight="700">{editing._new ? "Nouvelle publicité" : "Modifier"}</Txt>
              <View style={{ width: 40 }} />
            </SafeAreaView>
            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
              <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Format</Txt>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md }}>
                {FORMATS.map((f) => (
                  <Pressable
                    key={f.key}
                    onPress={() => setEditing({ ...editing, format: f.key })}
                    style={[styles.ptBtn, editing.format === f.key && styles.ptBtnActive]}
                  >
                    <Ionicons name={f.icon} size={18} color={editing.format === f.key ? colors.white : colors.midnight} />
                    <Txt size="xs" weight="700" color={editing.format === f.key ? colors.white : colors.midnight} style={{ marginTop: 4 }}>{f.label}</Txt>
                  </Pressable>
                ))}
              </View>

              <Input label="Titre" icon="pricetag-outline" placeholder="Titre de la publicité" value={editing.title || ""} onChangeText={(v) => setEditing({ ...editing, title: v })} />
              <Input label="Description" icon="document-text-outline" placeholder="Texte facultatif" value={editing.description || ""} onChangeText={(v) => setEditing({ ...editing, description: v })} multiline numberOfLines={3} style={{ height: 80, textAlignVertical: "top", paddingTop: 12 }} />
              <Input label="Texte du bouton" icon="link-outline" placeholder="Voir · Découvrir · Profiter" value={editing.button_label || ""} onChangeText={(v) => setEditing({ ...editing, button_label: v })} />
              <Input label="Lien" icon="globe-outline" placeholder="https://... ou category:plombier" autoCapitalize="none" value={editing.link || ""} onChangeText={(v) => setEditing({ ...editing, link: v })} />
              <Input label="Image (URL)" icon="image-outline" placeholder="https://..." autoCapitalize="none" value={editing.images?.[0] || ""} onChangeText={(v) => setEditing({ ...editing, images: v ? [v] : [] })} />

              <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Emplacements</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md }}>
                {PLACEMENTS.map((p) => (
                  <Pressable
                    key={p.key}
                    onPress={() => togglePlacement(p.key)}
                    style={[styles.chip, editing.placements?.includes(p.key) && styles.chipActive]}
                  >
                    <Txt weight="600" color={editing.placements?.includes(p.key) ? colors.white : colors.midnight}>{p.label}</Txt>
                  </Pressable>
                ))}
              </View>

              {editing.placements?.includes("category") ? (
                <>
                  <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Catégorie ciblée</Txt>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.md }}>
                    {cats.map((c) => (
                      <Pressable
                        key={c.key}
                        onPress={() => setEditing({ ...editing, category_key: c.key })}
                        style={[styles.chip, editing.category_key === c.key && styles.chipActive]}
                      >
                        <Txt weight="600" color={editing.category_key === c.key ? colors.white : colors.midnight}>{c.label}</Txt>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}

              <Input label="Début (ISO facultatif)" icon="calendar-outline" placeholder="2026-03-01" value={editing.start_at || ""} onChangeText={(v) => setEditing({ ...editing, start_at: v })} />
              <Input label="Fin (ISO facultatif)"   icon="calendar-outline" placeholder="2026-03-31" value={editing.end_at || ""} onChangeText={(v) => setEditing({ ...editing, end_at: v })} />

              <View style={styles.switchRow}>
                <Txt weight="600" style={{ flex: 1 }}>Publicité active</Txt>
                <Switch
                  value={editing.active !== false}
                  onValueChange={(v) => setEditing({ ...editing, active: v })}
                  trackColor={{ true: colors.turquoise, false: colors.border }}
                />
              </View>
            </ScrollView>
            <View style={[styles.editorBottom, { paddingBottom: 12 + insets.bottom }]}>
              <Btn title="Enregistrer" onPress={save} loading={saving} fullWidth size="lg" testID="ad-save" />
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
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipMini: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.brandTertiary },
  rowActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.divider },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },
  chip: { flexDirection: "row", alignItems: "center", height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexShrink: 0 },
  chipActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  ptBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  ptBtnActive: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  switchRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface2, marginBottom: spacing.md },
  editorBottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
