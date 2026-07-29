// Admin — gestion des membres du staff (super_admin uniquement).
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform, Switch } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, User, StaffRole } from "@/src/api";
import { ROLE_ICON, ROLE_LABEL } from "@/src/perms";
import { Btn, Card, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const ALL_ROLES: StaffRole[] = ["super_admin", "admin", "marketing", "support", "operator", "tech"];

type Editing = Partial<User> & { _new?: boolean; password?: string };

export default function AdminStaff() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<User[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.get<User[]>("/admin/staff")); } catch (e: any) { Alert.alert("Erreur", e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => setEditing({ _new: true, staff_role: "admin", name: "", email: "", password: "", active: true });

  const remove = (u: User) => {
    Alert.alert("Supprimer", `Supprimer "${u.name}" ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        try { await api.del(`/admin/staff/${u.id}`); load(); }
        catch (e: any) { Alert.alert("Erreur", e.message); }
      } },
    ]);
  };

  const save = async () => {
    if (!editing) return;
    if (editing._new) {
      if (!editing.email || !editing.name || !editing.password || editing.password.length < 6) {
        return Alert.alert("Champs requis", "Nom, email et mot de passe (6+ caractères) sont requis.");
      }
      setSaving(true);
      try {
        await api.post("/admin/staff", {
          email: editing.email,
          password: editing.password,
          name: editing.name,
          staff_role: editing.staff_role,
          permissions: editing.permissions || [],
          phone: editing.phone || null,
        });
        setEditing(null); load();
      } catch (e: any) { Alert.alert("Erreur", e.message); }
      finally { setSaving(false); }
    } else {
      setSaving(true);
      try {
        await api.patch(`/admin/staff/${editing.id}`, {
          name: editing.name,
          staff_role: editing.staff_role,
          permissions: editing.permissions || [],
          active: editing.active !== false,
        });
        setEditing(null); load();
      } catch (e: any) { Alert.alert("Erreur", e.message); }
      finally { setSaving(false); }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="staff-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Équipe & rôles</Txt>
        <Pressable onPress={openNew} style={styles.addBtn} testID="staff-add">
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        {items.map((u) => {
          const role = (u.staff_role || (u.is_admin ? "super_admin" : "admin")) as StaffRole;
          return (
            <Card key={u.id} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[styles.avatar, { backgroundColor: colors.brandTertiary }]}>
                  <Ionicons name={ROLE_ICON[role]} size={20} color={colors.turquoise} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Txt weight="700">{u.name}</Txt>
                  <Txt size="xs" color={colors.textMuted}>{u.email}</Txt>
                  <View style={styles.pill}>
                    <Txt size="xxs" weight="700" color={colors.midnight}>{ROLE_LABEL[role]}</Txt>
                  </View>
                </View>
                {u.active === false ? (
                  <View style={[styles.pill, { backgroundColor: "#FEE2E2" }]}>
                    <Txt size="xxs" weight="700" color={colors.danger}>INACTIF</Txt>
                  </View>
                ) : null}
              </View>
              <View style={styles.rowActions}>
                <Pressable onPress={() => setEditing({ ...u })} style={styles.action} testID={`staff-edit-${u.id}`}>
                  <Ionicons name="create-outline" size={16} color={colors.midnight} />
                  <Txt size="xs" weight="600" style={{ marginLeft: 6 }}>Modifier</Txt>
                </Pressable>
                <View style={{ width: 1, backgroundColor: colors.divider }} />
                <Pressable onPress={() => remove(u)} style={styles.action} testID={`staff-delete-${u.id}`}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Txt size="xs" weight="600" color={colors.danger} style={{ marginLeft: 6 }}>Supprimer</Txt>
                </Pressable>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      {editing ? (
        <View style={styles.overlay}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <SafeAreaView edges={["top"]} style={styles.header}>
              <Pressable onPress={() => setEditing(null)} style={styles.back}>
                <Ionicons name="close" size={22} color={colors.midnight} />
              </Pressable>
              <Txt size="lg" weight="700">{editing._new ? "Nouveau membre" : "Modifier"}</Txt>
              <View style={{ width: 40 }} />
            </SafeAreaView>
            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
              <Input label="Nom complet" icon="person-outline" placeholder="Prénom Nom" value={editing.name || ""} onChangeText={(v) => setEditing({ ...editing, name: v })} testID="staff-name" />
              {editing._new ? (
                <>
                  <Input label="Email" icon="mail-outline" placeholder="employe@jokoo.sn" autoCapitalize="none" keyboardType="email-address" value={editing.email || ""} onChangeText={(v) => setEditing({ ...editing, email: v })} testID="staff-email" />
                  <Input label="Mot de passe temporaire" icon="lock-closed-outline" secureTextEntry placeholder="6 caractères min." value={editing.password || ""} onChangeText={(v) => setEditing({ ...editing, password: v })} testID="staff-password" />
                </>
              ) : (
                <Input label="Email" icon="mail-outline" editable={false} value={editing.email || ""} />
              )}
              <Input label="Téléphone (facultatif)" icon="call-outline" placeholder="+221 77 000 00 00" keyboardType="phone-pad" value={editing.phone || ""} onChangeText={(v) => setEditing({ ...editing, phone: v })} />

              <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6, marginTop: 4 }}>Rôle</Txt>
              <View style={{ gap: 8, marginBottom: spacing.md }}>
                {ALL_ROLES.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setEditing({ ...editing, staff_role: r })}
                    style={[styles.roleRow, editing.staff_role === r && styles.roleRowActive]}
                    testID={`staff-role-${r}`}
                  >
                    <View style={[styles.roleIcon, { backgroundColor: editing.staff_role === r ? colors.brandTertiary : colors.surface2 }]}>
                      <Ionicons name={ROLE_ICON[r]} size={18} color={editing.staff_role === r ? colors.turquoise : colors.midnight} />
                    </View>
                    <Txt weight="700" style={{ flex: 1, marginLeft: 10 }}>{ROLE_LABEL[r]}</Txt>
                    <View style={[styles.radio, editing.staff_role === r && styles.radioActive]}>
                      {editing.staff_role === r ? <View style={styles.radioDot} /> : null}
                    </View>
                  </Pressable>
                ))}
              </View>

              {!editing._new ? (
                <View style={styles.switchRow}>
                  <Txt weight="600" style={{ flex: 1 }}>Compte actif</Txt>
                  <Switch value={editing.active !== false} onValueChange={(v) => setEditing({ ...editing, active: v })} trackColor={{ true: colors.turquoise, false: colors.border }} />
                </View>
              ) : null}
            </ScrollView>
            <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
              <Btn title="Enregistrer" onPress={save} loading={saving} fullWidth size="lg" testID="staff-save" />
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
  avatar: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pill: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.brandTertiary },
  rowActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 12 },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },
  roleRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  roleRowActive: { borderColor: colors.turquoise, backgroundColor: "#F0FBF8" },
  roleIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.turquoise },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.turquoise },
  switchRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface2, marginBottom: spacing.md },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
