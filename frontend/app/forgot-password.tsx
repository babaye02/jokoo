// Écran "Mot de passe oublié" — demande d'envoi d'un lien de réinitialisation par email.
// Le token est retourné par l'API en dev (pour test manuel) ; en prod il sera envoyé par email.
import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Card, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function ForgotPassword() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setErr("Email invalide");
    }
    setSending(true);
    try {
      const r = await api.post<{ ok: boolean; dev_token?: string }>(
        "/auth/forgot-password",
        { email: email.trim().toLowerCase() },
        false, // pas d'auth requise
      );
      setSent(true);
      if (r.dev_token) setDevToken(r.dev_token);
    } catch (e: any) {
      setErr(e?.message || "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={22} color={colors.midnight} /></Pressable>
        <Txt size="lg" weight="700">Mot de passe oublié</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 + insets.bottom }} keyboardShouldPersistTaps="handled">
          {sent ? (
            <Card>
              <View style={{ alignItems: "center", padding: spacing.md }}>
                <View style={styles.iconOk}>
                  <Ionicons name="mail" size={26} color={colors.success} />
                </View>
                <Txt size="xl" weight="700" style={{ marginTop: spacing.md, textAlign: "center" }}>
                  {"Vérifiez votre boîte mail"}
                </Txt>
                <Txt size="sm" color={colors.textMuted} style={{ marginTop: 8, textAlign: "center", lineHeight: 22 }}>
                  Si un compte existe avec {email}, vous recevrez un lien pour réinitialiser votre mot de passe (valable 60 minutes).
                </Txt>
                {devToken ? (
                  <Card style={{ marginTop: spacing.lg, backgroundColor: "#FEF3C7", borderColor: "#F59E0B", borderWidth: 1 }}>
                    <Txt size="xxs" weight="700" color="#92400E">🔧 MODE DEV — Token de test</Txt>
                    <Txt size="xxs" color="#92400E" style={{ marginTop: 4 }}>{devToken}</Txt>
                    <Btn
                      title="Utiliser ce token maintenant"
                      variant="secondary"
                      onPress={() => router.replace({ pathname: "/reset-password" as any, params: { token: devToken } })}
                      style={{ marginTop: spacing.md }}
                      testID="use-dev-token"
                    />
                  </Card>
                ) : null}
                <Btn
                  title="Retour à la connexion"
                  variant="ghost"
                  onPress={() => router.replace("/login")}
                  style={{ marginTop: spacing.md }}
                />
              </View>
            </Card>
          ) : (
            <Card>
              <Txt weight="700">Réinitialiser votre mot de passe</Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4, marginBottom: spacing.md }}>
                Renseignez l&apos;email de votre compte. Nous vous enverrons un lien sécurisé pour créer un nouveau mot de passe.
              </Txt>
              <Input
                label="Email"
                icon="mail-outline"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                testID="forgot-email"
              />
              {err ? (
                <View style={styles.errBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Txt size="xs" color={colors.danger} style={{ marginLeft: 6, flex: 1 }}>{err}</Txt>
                </View>
              ) : null}
              <Btn
                title="Envoyer le lien"
                onPress={submit}
                loading={sending}
                fullWidth
                size="lg"
                style={{ marginTop: spacing.md }}
                icon="send"
                testID="forgot-submit"
              />
              <Pressable onPress={() => router.replace("/login")} style={{ marginTop: spacing.md, alignItems: "center" }}>
                <Txt size="sm" weight="600" color={colors.turquoise}>Revenir à la connexion</Txt>
              </Pressable>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  errBox: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: radius.md, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", marginTop: spacing.md },
  iconOk: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center" },
});
