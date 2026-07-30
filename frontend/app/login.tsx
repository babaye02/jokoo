import { useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { Btn, ErrorBox, Input, Txt } from "@/src/components/ui";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { colors, radius, spacing } from "@/src/theme";

type Mode = "email" | "phone";

export default function Login() {
  const router = useRouter();
  const { signIn, signInWithOtp, requestOtp } = useAuth();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("+221");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submitEmail = async () => {
    setErr(null); setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (e: any) { setErr(e.message || "Connexion impossible"); }
    finally { setLoading(false); }
  };

  const askOtp = async () => {
    setErr(null); setLoading(true);
    try {
      const r = await requestOtp(phone.trim());
      setOtpSent(true);
      if (r.otp_dev_only) {
        Alert.alert("Code envoyé (dev)", `Votre code : ${r.otp_dev_only}\n\nEn production ce code est envoyé par SMS.`);
      }
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const submitOtp = async () => {
    setErr(null); setLoading(true);
    try {
      await signInWithOtp(phone.trim(), otp.trim());
      router.replace("/(tabs)");
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
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

          <View style={styles.tabs}>
            {(["email", "phone"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => { setMode(m); setErr(null); setOtpSent(false); }}
                style={[styles.tab, mode === m && styles.tabActive]}
                testID={`login-tab-${m}`}
              >
                <Ionicons name={m === "email" ? "mail-outline" : "call-outline"} size={16} color={mode === m ? colors.white : colors.midnight} />
                <Txt weight="700" color={mode === m ? colors.white : colors.midnight} style={{ marginLeft: 6 }}>
                  {m === "email" ? "Email" : "Téléphone"}
                </Txt>
              </Pressable>
            ))}
          </View>

          <ErrorBox text={err} />

          {mode === "email" ? (
            <>
              <Input label="Adresse email" icon="mail-outline" placeholder="votre@email.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} testID="login-email" />
              <Input label="Mot de passe" icon="lock-closed-outline" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} testID="login-password" />
              <Pressable style={{ alignSelf: "flex-end", marginBottom: spacing.lg }}>
                <Txt size="sm" weight="600" color={colors.turquoise}>Mot de passe oublié ?</Txt>
              </Pressable>
              <Btn title="Se connecter" onPress={submitEmail} loading={loading} fullWidth size="lg" testID="login-submit" />
              <OrDivider />
              <AppleSignInButton mode="signIn" />

              <View style={{ flexDirection: "row", justifyContent: "center", marginTop: spacing.xl }}>
                <Txt size="xxs" color={colors.textMuted}>
                  En continuant, vous acceptez nos{" "}
                  <Txt size="xxs" weight="700" color={colors.turquoise} onPress={() => router.push("/legal/cgu")}>CGU</Txt>
                  {" & "}
                  <Txt size="xxs" weight="700" color={colors.turquoise} onPress={() => router.push("/legal/privacy")}>Politique de confidentialité</Txt>.
                </Txt>
              </View>
            </>
          ) : (
            <>
              <Input label="Numéro de téléphone" icon="call-outline" placeholder="+221 77 000 00 00" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="login-phone" />
              {!otpSent ? (
                <Btn title="Recevoir le code" onPress={askOtp} loading={loading} fullWidth size="lg" icon="paper-plane-outline" testID="otp-request" />
              ) : (
                <>
                  <Input label="Code OTP à 6 chiffres" icon="keypad-outline" placeholder="000000" keyboardType="number-pad" value={otp} onChangeText={setOtp} testID="otp-code" />
                  <Btn title="Vérifier et se connecter" onPress={submitOtp} loading={loading} fullWidth size="lg" icon="checkmark-circle-outline" testID="otp-submit" />
                  <Pressable onPress={askOtp} style={{ marginTop: 12, alignSelf: "center" }}>
                    <Txt size="sm" weight="600" color={colors.turquoise}>Renvoyer le code</Txt>
                  </Pressable>
                </>
              )}
            </>
          )}

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
  tabs: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg },
  tab: { flex: 1, height: 44, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: colors.midnight },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  divider: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
});

function OrDivider() {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Txt size="xxs" color={colors.textMuted} weight="600" style={{ marginHorizontal: 10 }}>OU</Txt>
      <View style={styles.dividerLine} />
    </View>
  );
}
