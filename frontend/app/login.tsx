import { useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { Btn, ErrorBox, Input, Txt } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const u = await signIn(email.trim().toLowerCase(), password);
      router.replace(u.role === "prestataire" ? "/(tabs)" : "/(tabs)");
    } catch (e: any) {
      setErr(e.message || "Connexion impossible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.back} testID="login-back">
            <Ionicons name="chevron-back" size={22} color={colors.midnight} />
          </Pressable>
          <View style={styles.logoRow}>
            <View style={styles.logoDot}>
              <Ionicons name="briefcase" size={22} color={colors.white} />
            </View>
            <Txt size="xxl" weight="700">Jokoo</Txt>
          </View>

          <Txt size="xxl" weight="700" style={{ marginTop: spacing.xl }}>Bon retour !</Txt>
          <Txt size="md" color={colors.textMuted} style={{ marginBottom: spacing.xl, marginTop: 6 }}>
            Connectez-vous pour continuer.
          </Txt>

          <ErrorBox text={err} />

          <Input
            label="Adresse email"
            icon="mail-outline"
            placeholder="votre@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            testID="login-email"
          />
          <Input
            label="Mot de passe"
            icon="lock-closed-outline"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            testID="login-password"
          />

          <Pressable style={{ alignSelf: "flex-end", marginBottom: spacing.lg }}>
            <Txt size="sm" weight="600" color={colors.turquoise}>Mot de passe oublié ?</Txt>
          </Pressable>

          <Btn title="Se connecter" onPress={submit} loading={loading} fullWidth size="lg" testID="login-submit" />

          <View style={styles.divider}>
            <View style={styles.line} /><Txt size="sm" color={colors.textSubtle} style={{ marginHorizontal: 12 }}>ou</Txt><View style={styles.line} />
          </View>

          <Pressable style={styles.socialBtn}>
            <Ionicons name="logo-google" size={18} color={colors.midnight} />
            <Txt weight="600" style={{ marginLeft: 10 }}>Continuer avec Google</Txt>
          </Pressable>
          <Pressable style={styles.socialBtn}>
            <Ionicons name="logo-apple" size={20} color={colors.midnight} />
            <Txt weight="600" style={{ marginLeft: 10 }}>Continuer avec Apple</Txt>
          </Pressable>

          <View style={styles.footer}>
            <Txt color={colors.textMuted}>Nouveau sur Jokoo ? </Txt>
            <Pressable onPress={() => router.push("/register")} testID="go-register">
              <Txt weight="700" color={colors.turquoise}>Créer un compte</Txt>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoDot: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.midnight, alignItems: "center", justifyContent: "center", marginRight: 10 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: spacing.xl },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  socialBtn: { height: 52, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", flexDirection: "row", marginBottom: spacing.md, backgroundColor: colors.surface },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
});
