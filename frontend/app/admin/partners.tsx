// Admin — CRUD des partenaires commerciaux Jokoo.
// Chaque partenaire est accessible via /partner/{id} et peut être ciblé par une bannière (link_type=partner).
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Switch, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Partner } from "@/src/api";
import { Btn, Card, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type EditingPartner = Partial<Partner> & { _new?: boolean };

export default function AdminPartners() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Partner[]>([]);
  const [editing, setEditing] = useState<EditingPartner | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api.get<Partner[]>("/admin/partners")); }
    catch (e: any) { Alert.alert("Erreur", e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setErr(null);
    setEditing({
      _new: true, name: "", tagline: "", description: "",
      logo: null, cover: null, website: "", phone: "", email: "",
      city: "", category: "", active: true,
    });
  };

  const remove = (p: Partner) => Alert.alert("Supprimer", `Supprimer le partenaire « ${p.name} » ?`, [
    { text: "Annuler", style: "cancel" },
    { text: "Supprimer", style: "destructive", onPress: async () => { await api.del(`/admin/partners/${p.id}`); load(); } },
  ]);

  const pickImage = async (kind: "logo" | "cover") => {
    if (!editing) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.7, base64: true });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const data = `data:image/jpeg;base64,${res.assets[0].base64}`;
    setEditing({ ...editing, [kind]: data });
  };

  const nameValid = !!editing?.name?.trim();

  const save = async () => {
    if (!editing) return;
    setErr(null);
    if (!nameValid) {
      setErr("Le nom du partenaire est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editing.name!.trim(),
        tagline: editing.tagline || "",
        description: editing.description || "",
        logo: editing.logo || null,
        cover: editing.cover || null,
        website: editing.website || null,
        phone: editing.phone || null,
        email: editing.email || null,
        city: editing.city || null,
        category: editing.category || null,
        active: editing.active !== false,
      };
      if (editing._new) await api.post("/admin/partners", payload);
      else await api.patch(`/admin/partners/${editing.id}`, payload);
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
        <Pressable onPress={() => router.back()} style={styles.back} testID="partners-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Partenaires</Txt>
        <Pressable onPress={openNew} style={styles.addBtn} testID="partners-add">
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        {items.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
              <Ionicons name="business-outline" size={44} color={colors.textSubtle} />
              <Txt size="md" weight="600" style={{ marginTop: spacing.md }}>Aucun partenaire</Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4, textAlign: "center" }}>
                Ajoutez un partenaire puis ciblez sa fiche depuis une bannière.
              </Txt>
              <Btn title="Ajouter un partenaire" onPress={openNew} style={{ marginTop: spacing.md }} />
            </View>
          </Card>
        ) : items.map((p) => (
          <Card key={p.id} style={{ padding: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {p.logo ? (
                <Image source={{ uri: p.logo }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="business" size={22} color={colors.turquoise} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Txt weight="700" numberOfLines={1} style={{ flex: 1 }}>{p.name}</Txt>
                  <View style={[styles.pill, { backgroundColor: p.active ? "#00C2A822" : "#94A3B822" }]}>
                    <Txt size="xxs" weight="700" color={p.active ? colors.turquoise : colors.textMuted}>
                      {p.active ? "ACTIF" : "INACTIF"}
                    </Txt>
                  </View>
                </View>
                {p.tagline ? <Txt size="xs" color={colors.textMuted} numberOfLines={1}>{p.tagline}</Txt> : null}
                <Txt size="xxs" color={colors.textSubtle} style={{ marginTop: 2 }}>/partner/{p.id.slice(0, 8)}</Txt>
              </View>
            </View>
            <View style={[styles.rowActions, { marginTop: spacing.md }]}>
              <Pressable onPress={() => setEditing({ ...p })} style={styles.action}>
                <Ionicons name="create-outline" size={16} color={colors.midnight} />
                <Txt size="xs" weight="600" style={{ marginLeft: 6 }}>Modifier</Txt>
              </Pressable>
              <View style={{ width: 1, backgroundColor: colors.divider }} />
              <Pressable onPress={() => router.push(`/partner/${p.id}`)} style={styles.action}>
                <Ionicons name="eye-outline" size={16} color={colors.midnight} />
                <Txt size="xs" weight="600" style={{ marginLeft: 6 }}>Aperçu</Txt>
              </Pressable>
              <View style={{ width: 1, backgroundColor: colors.divider }} />
              <Pressable onPress={() => remove(p)} style={styles.action}>
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
              <Txt size="lg" weight="700">{editing._new ? "Nouveau partenaire" : "Modifier"}</Txt>
              <View style={{ width: 40 }} />
            </SafeAreaView>
            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
              <Input
                label="Nom *"
                icon="business-outline"
                placeholder="Ex : Sonatel Orange"
                value={editing.name || ""}
                onChangeText={(v: string) => { setEditing({ ...editing, name: v }); if (err) setErr(null); }}
                testID="partner-name"
              />
              {err ? (
                <View style={styles.errBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Txt size="xs" color={colors.danger} style={{ marginLeft: 6, flex: 1 }}>{err}</Txt>
                </View>
              ) : null}
              <Input label="Slogan / tagline" icon="text-outline" value={editing.tagline || ""} onChangeText={(v: string) => setEditing({ ...editing, tagline: v })} />
              <Input label="Description" icon="document-text-outline" multiline numberOfLines={5} style={{ height: 120, textAlignVertical: "top", paddingTop: 12 }} value={editing.description || ""} onChangeText={(v: string) => setEditing({ ...editing, description: v })} />
              <Input label="Site web" icon="globe-outline" autoCapitalize="none" keyboardType="url" value={editing.website || ""} onChangeText={(v: string) => setEditing({ ...editing, website: v })} />
              <Input label="Téléphone" icon="call-outline" keyboardType="phone-pad" value={editing.phone || ""} onChangeText={(v: string) => setEditing({ ...editing, phone: v })} />
              <Input label="Email" icon="mail-outline" autoCapitalize="none" keyboardType="email-address" value={editing.email || ""} onChangeText={(v: string) => setEditing({ ...editing, email: v })} />
              <Input label="Ville" icon="location-outline" value={editing.city || ""} onChangeText={(v: string) => setEditing({ ...editing, city: v })} />
              <Input label="Catégorie" icon="pricetag-outline" value={editing.category || ""} onChangeText={(v: string) => setEditing({ ...editing, category: v })} />

              <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
                <Pressable onPress={() => pickImage("logo")} style={[styles.upload, { flex: 1 }]}>
                  {editing.logo ? (
                    <Image source={{ uri: editing.logo }} style={{ width: 64, height: 64, borderRadius: 12 }} contentFit="cover" />
                  ) : (
                    <>
                      <Ionicons name="apps-outline" size={22} color={colors.turquoise} />
                      <Txt size="xs" weight="700" style={{ marginTop: 4 }}>Logo</Txt>
                    </>
                  )}
                </Pressable>
                <Pressable onPress={() => pickImage("cover")} style={[styles.upload, { flex: 1 }]}>
                  {editing.cover ? (
                    <Image source={{ uri: editing.cover }} style={{ width: "100%", height: 64, borderRadius: 12 }} contentFit="cover" />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={22} color={colors.turquoise} />
                      <Txt size="xs" weight="700" style={{ marginTop: 4 }}>Bannière</Txt>
                    </>
                  )}
                </Pressable>
              </View>

              <View style={styles.switchRow}>
                <Txt weight="600" style={{ flex: 1 }}>Actif</Txt>
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
                disabled={!nameValid || saving}
                testID="partner-save"
              />
              {!nameValid ? (
                <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
                  {"Remplissez le champ « Nom » pour activer l'enregistrement."}
                </Txt>
              ) : null}
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
  rowActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.divider },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },
  upload: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.surface2, alignItems: "center", marginBottom: spacing.md, justifyContent: "center", minHeight: 84 },
  switchRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface2, marginBottom: spacing.md },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  errBox: {
    flexDirection: "row", alignItems: "center",
    padding: 10, borderRadius: radius.md,
    backgroundColor: "#FEF2F2",
    borderWidth: 1, borderColor: "#FCA5A5",
    marginBottom: spacing.md, marginTop: -6,
  },
});
