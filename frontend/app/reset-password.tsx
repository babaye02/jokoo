// Écran "Réinitialiser mot de passe" — reçoit un token via query param.
import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Card, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function ResetPassword() {
  const { token: initialToken } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Token conservé UNIQUEMENT en mémoire — jamais affiché dans l'UI.
  const [token] = useState((initialToken as string) || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!token.trim()) return setErr("Lien invalide ou expiré. Redemandez un email de réinitialisation.");
    if (password.length < 8) return setErr("Le mot de passe doit contenir au moins 8 caractères");
    if (password !== confirm) return setErr("La confirmation ne correspond pas");
    setSaving(true);
    try {
      await api.post("/auth/reset-password", { token: token.trim(), new_password: password }, false);
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || "Réinitialisation impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={22} color={colors.midnight} /></Pressable>
        <Txt size="lg" weight="700">Nouveau mot de passe</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          {done ? (
            <Card>
              <View style={{ alignItems: "center", padding: spacing.md }}>
                <View style={styles.iconOk}>
                  <Ionicons name="checkmark-circle" size={30} color={colors.success} />
                </View>
                <Txt size="xl" weight="700" style={{ marginTop: spacing.md }}>Mot de passe mis à jour</Txt>
                <Txt size="sm" color={colors.textMuted} style={{ textAlign: "center", marginTop: 8 }}>
                  Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
                </Txt>
                <Btn title="Se connecter" onPress={() => router.replace("/login")} fullWidth size="lg" style={{ marginTop: spacing.lg }} testID="reset-goto-login" />
              </View>
            </Card>
          ) : (
            <Card>
              <Txt size="sm" color={colors.textMuted} style={{ marginBottom: 12 }}>
                Choisissez un nouveau mot de passe pour votre compte Jokoo.
              </Txt>
              <Input label="Nouveau mot de passe (8+ caractères)" icon="lock-closed-outline" secureTextEntry value={password} onChangeText={setPassword} testID="reset-password" />
              <Input label="Confirmer" icon="lock-closed-outline" secureTextEntry value={confirm} onChangeText={setConfirm} testID="reset-confirm" />
              {!token ? (
                <View style={styles.errBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Txt size="xs" color={colors.danger} style={{ marginLeft: 6, flex: 1 }}>
                    Lien invalide ou expiré. Redemandez un email de réinitialisation.
                  </Txt>
                </View>
              ) : null}
              {err ? (
                <View style={styles.errBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Txt size="xs" color={colors.danger} style={{ marginLeft: 6, flex: 1 }}>{err}</Txt>
                </View>
              ) : null}
              <Btn title="Enregistrer le nouveau mot de passe" onPress={submit} loading={saving} disabled={!password || !confirm || !token || saving} fullWidth size="lg" style={{ marginTop: spacing.md }} testID="reset-submit" />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  errBox: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: radius.md, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", marginTop: spacing.md },
  iconOk: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center" },
});
