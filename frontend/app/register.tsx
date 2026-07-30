import { useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { Btn, ErrorBox, Input, Txt } from "@/src/components/ui";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { colors, radius, spacing } from "@/src/theme";

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [role, setRole] = useState<"client" | "prestataire">("client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Dakar");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!name.trim() || !email.trim() || password.length < 6) {
      setErr("Nom, email et mot de passe (6+ caractères) requis");
      return;
    }
    setLoading(true);
    try {
      await signUp({ email: email.trim().toLowerCase(), password, name: name.trim(), role, phone, city });
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e.message || "Inscription impossible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.back} testID="register-back">
            <Ionicons name="chevron-back" size={22} color={colors.midnight} />
          </Pressable>

          <Txt size="xxl" weight="700">Créer un compte</Txt>
          <Txt size="md" color={colors.textMuted} style={{ marginTop: 6, marginBottom: spacing.xl }}>
            Rejoignez la première plateforme sénégalaise de services.
          </Txt>

          {/* Role toggle */}
          <View style={styles.roleWrap}>
            {(["client", "prestataire"] as const).map((r) => (
              <Pressable
                key={r}
                testID={`role-${r}`}
                onPress={() => setRole(r)}
                style={[styles.roleBtn, role === r && styles.roleActive]}
              >
                <Ionicons
                  name={r === "client" ? "person-outline" : "briefcase-outline"}
                  size={18}
                  color={role === r ? colors.white : colors.midnight}
                />
                <Txt weight="600" color={role === r ? colors.white : colors.midnight} style={{ marginLeft: 8 }}>
                  {r === "client" ? "Client" : "Prestataire"}
                </Txt>
              </Pressable>
            ))}
          </View>

          <ErrorBox text={err} />

          <Input label="Nom complet" icon="person-outline" placeholder="Awa Diop" value={name} onChangeText={setName} testID="register-name" />
          <Input label="Email" icon="mail-outline" placeholder="votre@email.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} testID="register-email" />
          <Input label="Téléphone" icon="call-outline" placeholder="+221 77 000 00 00" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="register-phone" />
          <Input label="Ville" icon="location-outline" placeholder="Dakar" value={city} onChangeText={setCity} testID="register-city" />
          <Input label="Mot de passe" icon="lock-closed-outline" placeholder="6 caractères minimum" secureTextEntry value={password} onChangeText={setPassword} testID="register-password" />

          <Btn title="Créer mon compte" onPress={submit} loading={loading} fullWidth size="lg" testID="register-submit" />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Txt size="xxs" color={colors.textMuted} weight="600" style={{ marginHorizontal: 10 }}>OU</Txt>
            <View style={styles.dividerLine} />
          </View>
          <AppleSignInButton mode="signUp" />

          <View style={styles.footer}>
            <Txt color={colors.textMuted}>Déjà inscrit ? </Txt>
            <Pressable onPress={() => router.replace("/login")} testID="go-login">
              <Txt weight="700" color={colors.turquoise}>Se connecter</Txt>
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
  roleWrap: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: radius.pill, padding: 4, marginBottom: spacing.xl },
  roleBtn: { flex: 1, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  roleActive: { backgroundColor: colors.midnight },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  divider: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
});
