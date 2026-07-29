// Opérateur — inscription assistée d'un client/prestataire depuis l'agence.
import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, ErrorBox, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function AssistedRegister() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<"client" | "prestataire">("client");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+221");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("Dakar");
  const [tempPwd, setTempPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ user: any; temp_password_or_otp: string } | null>(null);

  const submit = async () => {
    setErr(null);
    if (!name.trim() || !phone.trim()) return setErr("Nom et téléphone requis");
    setLoading(true);
    try {
      const r = await api.post<any>("/admin/assisted-register", {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        role,
        city,
        temp_password: tempPwd.trim() || undefined,
      });
      setResult(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="ar-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Inscription assistée</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Ionicons name="person-add" size={24} color={colors.white} />
            <Txt size="md" weight="700" color={colors.white} style={{ marginTop: 8 }}>Enregistrer un client ou un prestataire</Txt>
            <Txt size="xs" color="rgba(255,255,255,0.85)" style={{ marginTop: 4, lineHeight: 18 }}>
              {"L'utilisateur pourra ensuite se connecter avec son numéro et un code OTP."}
            </Txt>
          </View>

          {result ? (
            <View style={styles.success} testID="ar-success">
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Ionicons name="checkmark-circle" size={22} color={colors.turquoise} />
                <Txt weight="700" color={colors.midnight} style={{ marginLeft: 8 }}>Compte créé</Txt>
              </View>
              <Txt size="sm" color={colors.text}>{"Communiquez ces informations à l'utilisateur :"}</Txt>
              <View style={styles.info}>
                <Txt size="xs" color={colors.textMuted}>Téléphone</Txt>
                <Txt weight="700" style={{ marginTop: 2 }}>{result.user.phone}</Txt>
              </View>
              <View style={styles.info}>
                <Txt size="xs" color={colors.textMuted}>Mot de passe / OTP</Txt>
                <Txt weight="700" style={{ marginTop: 2, fontSize: 22, letterSpacing: 3 }}>{result.temp_password_or_otp}</Txt>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Btn title="Nouveau" variant="secondary" onPress={() => { setResult(null); setName(""); setPhone("+221"); setEmail(""); setTempPwd(""); }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Btn title="Terminé" onPress={() => router.back()} />
                </View>
              </View>
            </View>
          ) : (
            <>
              <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginTop: spacing.lg, marginBottom: 6 }}>Type de compte</Txt>
              <View style={styles.roleWrap}>
                {(["client", "prestataire"] as const).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    style={[styles.roleBtn, role === r && styles.roleActive]}
                    testID={`ar-role-${r}`}
                  >
                    <Ionicons name={r === "client" ? "person-outline" : "briefcase-outline"} size={18} color={role === r ? colors.white : colors.midnight} />
                    <Txt weight="600" color={role === r ? colors.white : colors.midnight} style={{ marginLeft: 8 }}>
                      {r === "client" ? "Client" : "Prestataire"}
                    </Txt>
                  </Pressable>
                ))}
              </View>

              <ErrorBox text={err} />

              <Input label="Nom complet" icon="person-outline" placeholder="Prénom Nom" value={name} onChangeText={setName} testID="ar-name" />
              <Input label="Téléphone (obligatoire)" icon="call-outline" placeholder="+221 77 000 00 00" keyboardType="phone-pad" value={phone} onChangeText={setPhone} testID="ar-phone" />
              <Input label="Email (facultatif)" icon="mail-outline" placeholder="—" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
              <Input label="Ville" icon="location-outline" value={city} onChangeText={setCity} />
              <Input label="Mot de passe temporaire (facultatif)" icon="lock-closed-outline" placeholder="Laissez vide pour générer un OTP" value={tempPwd} onChangeText={setTempPwd} />

              <Btn title="Créer le compte" onPress={submit} loading={loading} fullWidth size="lg" style={{ marginTop: spacing.md }} testID="ar-submit" />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  hero: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.midnight },
  roleWrap: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: 999, padding: 4, marginBottom: spacing.md },
  roleBtn: { flex: 1, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  roleActive: { backgroundColor: colors.midnight },
  success: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: "#F0FBF8", borderWidth: 1, borderColor: colors.brandTertiary, marginTop: spacing.md },
  info: { padding: 12, backgroundColor: colors.surface, borderRadius: radius.md, marginTop: 10 },
});
