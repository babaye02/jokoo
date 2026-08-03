// Admin — CRUD des offres promotionnelles Jokoo.
// Chaque promo est accessible via /promo/{slug} et peut être ciblée par une bannière (link_type=promo).
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Switch, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { Image } from "expo-image";
import { pickImageFromLibrary, uploadToCloudinary } from "@/src/media/cloudinary";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Promo, AdLinkType } from "@/src/api";
import { Btn, Card, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type EditingPromo = Partial<Promo> & { _new?: boolean };

export default function AdminPromos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Promo[]>([]);
  const [editing, setEditing] = useState<EditingPromo | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.get<Promo[]>("/admin/promos")); }
    catch (e: any) { Alert.alert("Erreur", e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setErr(null);
    setEditing({
      _new: true, slug: "", title: "", subtitle: "", description: "",
      cta_label: "En profiter", cta_link_type: "none", cta_link_target: null,
      image: null, discount_label: "", starts_at: "", ends_at: "", active: true,
    });
  };

  const [confirmingDel, setConfirmingDel] = useState<Promo | null>(null);
  const remove = (p: Promo) => setConfirmingDel(p);
  const executeDelete = async () => {
    if (!confirmingDel) return;
    try { await api.del(`/admin/promos/${confirmingDel.id}`); setConfirmingDel(null); load(); }
    catch (e: any) { Alert.alert("Erreur", e?.message || "Suppression impossible"); }
  };

  const pickImage = async () => {
    if (!editing) return;
    try {
      const picked = await pickImageFromLibrary({ aspect: [16, 9], allowsEditing: true, quality: 0.85 });
      if (!picked) return;
      const uploaded = await uploadToCloudinary(picked, "admin");
      setEditing({ ...editing, image: uploaded.secure_url });
    } catch (e: any) {
      Alert.alert("Upload impossible", e?.message || "Réessayez plus tard.");
    }
  };

  const slugValid = !!editing?.slug && /^[a-z0-9-]{2,40}$/.test(editing.slug);
  const titleValid = !!editing?.title?.trim();
  const formValid = slugValid && titleValid;

  const save = async () => {
    if (!editing) return;
    setErr(null);
    if (!slugValid) {
      setErr("Slug invalide : minuscules, chiffres et tirets uniquement (2 à 40 caractères).");
      return;
    }
    if (!titleValid) {
      setErr("Le titre est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        slug: editing.slug!,
        title: editing.title!.trim(),
        subtitle: editing.subtitle || "",
        description: editing.description || "",
        cta_label: editing.cta_label || "En profiter",
        cta_link_type: editing.cta_link_type || "none",
        cta_link_target: editing.cta_link_target || null,
        image: editing.image || null,
        bg_color: editing.bg_color || null,
        discount_label: editing.discount_label || null,
        starts_at: editing.starts_at || null,
        ends_at: editing.ends_at || null,
        active: editing.active !== false,
      };
      if (editing._new) await api.post("/admin/promos", payload);
      else await api.patch(`/admin/promos/${editing.id}`, payload);
      setEditing(null);
      setErr(null);
      load();
    } catch (e: any) {
      setErr(e?.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="promos-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Offres promo</Txt>
        <Pressable onPress={openNew} style={styles.addBtn} testID="promos-add">
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        {items.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
              <Ionicons name="pricetag-outline" size={44} color={colors.textSubtle} />
              <Txt size="md" weight="600" style={{ marginTop: spacing.md }}>Aucune promo</Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4, textAlign: "center" }}>
                Créez une promo, puis ciblez-la depuis une bannière (Publicités).
              </Txt>
              <Btn title="Créer une promo" onPress={openNew} style={{ marginTop: spacing.md }} />
            </View>
          </Card>
        ) : items.map((p) => (
          <Card key={p.id} style={{ padding: 0, overflow: "hidden" }}>
            {p.image ? (
              <Image source={{ uri: p.image }} style={{ width: "100%", height: 110 }} contentFit="cover" />
            ) : null}
            <View style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt weight="700" style={{ flex: 1 }} numberOfLines={1}>{p.title}</Txt>
                <View style={[styles.pill, { backgroundColor: p.active ? "#00C2A822" : "#94A3B822" }]}>
                  <Txt size="xxs" weight="700" color={p.active ? colors.turquoise : colors.textMuted}>
                    {p.active ? "ACTIVE" : "INACTIVE"}
                  </Txt>
                </View>
              </View>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 3 }}>/promo/{p.slug}</Txt>
              {p.discount_label ? (
                <View style={styles.discountPill}>
                  <Txt size="xxs" weight="700" color={colors.white}>{p.discount_label}</Txt>
                </View>
              ) : null}
            </View>
            <View style={styles.rowActions}>
              <Pressable onPress={() => setEditing({ ...p })} style={styles.action} testID={`promo-edit-${p.id}`}>
                <Ionicons name="create-outline" size={16} color={colors.midnight} />
                <Txt size="xs" weight="600" style={{ marginLeft: 6 }}>Modifier</Txt>
              </Pressable>
              <View style={{ width: 1, backgroundColor: colors.divider }} />
              <Pressable onPress={() => router.push(`/promo/${p.slug}`)} style={styles.action}>
                <Ionicons name="eye-outline" size={16} color={colors.midnight} />
                <Txt size="xs" weight="600" style={{ marginLeft: 6 }}>Aperçu</Txt>
              </Pressable>
              <View style={{ width: 1, backgroundColor: colors.divider }} />
              <Pressable onPress={() => remove(p)} style={styles.action} testID={`promo-delete-${p.id}`}>
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
              <Txt size="lg" weight="700">{editing._new ? "Nouvelle promo" : "Modifier"}</Txt>
              <View style={{ width: 40 }} />
            </SafeAreaView>
            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
              <Input
                label="Slug URL * (ex : summer-2026)"
                icon="link-outline"
                placeholder="lettres minuscules, chiffres, tirets"
                autoCapitalize="none"
                value={editing.slug || ""}
                onChangeText={(v: string) => { setEditing({ ...editing, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, "") }); if (err) setErr(null); }}
                testID="promo-slug"
              />
              <Input
                label="Titre *"
                icon="pricetag-outline"
                value={editing.title || ""}
                onChangeText={(v: string) => { setEditing({ ...editing, title: v }); if (err) setErr(null); }}
                testID="promo-title"
              />
              {err ? (
                <View style={styles.errBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Txt size="xs" color={colors.danger} style={{ marginLeft: 6, flex: 1 }}>{err}</Txt>
                </View>
              ) : null}
              <Input label="Sous-titre" icon="text-outline" value={editing.subtitle || ""} onChangeText={(v: string) => setEditing({ ...editing, subtitle: v })} />
              <Input label="Description" icon="document-text-outline" multiline numberOfLines={5} style={{ height: 120, textAlignVertical: "top", paddingTop: 12 }} value={editing.description || ""} onChangeText={(v: string) => setEditing({ ...editing, description: v })} />
              <Input label='Badge remise (ex : "-20%")' icon="cash-outline" value={editing.discount_label || ""} onChangeText={(v: string) => setEditing({ ...editing, discount_label: v })} />
              <Input label="Libellé du bouton" icon="arrow-forward-outline" value={editing.cta_label || ""} onChangeText={(v: string) => setEditing({ ...editing, cta_label: v })} />

              <Txt size="sm" weight="700" style={{ marginTop: spacing.md, marginBottom: 6 }}>Cible du bouton</Txt>
              <Txt size="xxs" color={colors.textMuted} style={{ marginBottom: 8 }}>
                Où mène le bouton principal ? Optionnel — laissez sur « Aucune » pour une page purement informative.
              </Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {(["none", "provider", "category", "partner", "external", "app_route"] as AdLinkType[]).map((t) => (
                  <Pressable key={t} onPress={() => setEditing({ ...editing, cta_link_type: t, cta_link_target: t === "none" ? null : editing.cta_link_target })} style={[styles.chip, editing.cta_link_type === t && styles.chipActive]}>
                    <Txt size="xxs" weight="700" color={editing.cta_link_type === t ? colors.white : colors.midnight}>
                      {t === "none" ? "Aucune" : t === "provider" ? "Prestataire" : t === "category" ? "Catégorie" : t === "partner" ? "Partenaire" : t === "external" ? "URL externe" : "Section app"}
                    </Txt>
                  </Pressable>
                ))}
              </View>
              {editing.cta_link_type && editing.cta_link_type !== "none" ? (
                <Input
                  label={editing.cta_link_type === "external" ? "URL (https://…)" : editing.cta_link_type === "category" ? "Clé catégorie (ex : plombier)" : editing.cta_link_type === "app_route" ? "Route (ex : /mobility)" : "ID cible"}
                  icon="options-outline"
                  autoCapitalize="none"
                  value={editing.cta_link_target || ""}
                  onChangeText={(v: string) => setEditing({ ...editing, cta_link_target: v })}
                />
              ) : null}

              <Txt size="sm" weight="700" style={{ marginTop: spacing.md, marginBottom: 6 }}>Image de couverture</Txt>
              <Pressable onPress={pickImage} style={styles.upload}>
                {editing.image ? (
                  <Image source={{ uri: editing.image }} style={{ width: "100%", height: 140, borderRadius: radius.md }} contentFit="cover" />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={22} color={colors.turquoise} />
                    <Txt size="xs" weight="700" style={{ marginTop: 4 }}>Importer une image</Txt>
                  </>
                )}
              </Pressable>

              <Input label="Début (ISO 8601 optionnel)" icon="calendar-outline" autoCapitalize="none" value={editing.starts_at || ""} onChangeText={(v: string) => setEditing({ ...editing, starts_at: v })} />
              <Input label="Fin (ISO 8601 optionnel)"   icon="calendar-outline" autoCapitalize="none" value={editing.ends_at || ""} onChangeText={(v: string) => setEditing({ ...editing, ends_at: v })} />

              <View style={styles.switchRow}>
                <Txt weight="600" style={{ flex: 1 }}>Active</Txt>
                <Switch value={editing.active !== false} onValueChange={(v) => setEditing({ ...editing, active: v })} trackColor={{ true: colors.turquoise, false: colors.border }} />
              </View>
            </ScrollView>
            <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
              <Btn
                title="Enregistrer"
                onPress={save}
                loading={saving}
                fullWidth
                size="lg"
                disabled={!formValid || saving}
                testID="promo-save"
              />
              {!formValid ? (
                <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
                  {!slugValid ? "Slug invalide (minuscules, chiffres, tirets, 2 à 40 caractères)." : "Le titre est obligatoire."}
                </Txt>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      ) : null}

      <Modal transparent visible={confirmingDel !== null} animationType="fade" onRequestClose={() => setConfirmingDel(null)}>
        <Pressable style={styles.confirmOverlay} onPress={() => setConfirmingDel(null)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <View style={styles.confirmIcon}>
              <Ionicons name="trash" size={22} color={colors.danger} />
            </View>
            <Txt size="lg" weight="700" style={{ textAlign: "center", marginTop: 12 }}>
              Supprimer cette promo ?
            </Txt>
            <Txt size="sm" color={colors.textMuted} style={{ textAlign: "center", marginTop: 6, lineHeight: 20 }}>
              {`« ${confirmingDel?.title} » sera supprimée définitivement. Cette action est irréversible.`}
            </Txt>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.lg }}>
              <Btn title="Annuler" variant="ghost" onPress={() => setConfirmingDel(null)} style={{ flex: 1 }} />
              <Btn title="Supprimer" onPress={executeDelete} style={{ flex: 1, backgroundColor: colors.danger }} testID="promo-delete-confirm" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  discountPill: {
    alignSelf: "flex-start", marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, backgroundColor: colors.turquoise,
  },
  rowActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.divider },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },
  upload: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.surface2, alignItems: "center", marginBottom: spacing.md },
  switchRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface2, marginBottom: spacing.md },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  errBox: {
    flexDirection: "row", alignItems: "center",
    padding: 10, borderRadius: radius.md,
    backgroundColor: "#FEF2F2",
    borderWidth: 1, borderColor: "#FCA5A5",
    marginBottom: spacing.md, marginTop: -6,
  },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  confirmCard: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  confirmIcon: { alignSelf: "center", width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
});
