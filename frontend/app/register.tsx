import { useEffect, useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { Btn, ErrorBox, Input, Txt } from "@/src/components/ui";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { colors, radius, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";

// Miroir de la clé SecureStore stockée par `/invite/[code]` et `auth.tsx`.
const REFERRAL_STORAGE_KEY = "jokoo_referral_code";

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [role, setRole] = useState<"client" | "prestataire">("client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Dakar");
  const [password, setPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Code de parrainage — optionnel, alimenté automatiquement depuis un deep-link
  // `/invite/[code]` OU saisi manuellement par l'utilisateur.
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referralAuto, setReferralAuto] = useState(false);
  const [referralInviter, setReferralInviter] = useState<string | null>(null);
  const [referralChecking, setReferralChecking] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);

  // Au montage, on regarde s'il y a un code déjà stocké (venu de /invite/[code])
  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.secureGet<string>(REFERRAL_STORAGE_KEY, "");
        if (stored) {
          setReferralCode(stored);
          setReferralOpen(true);
          setReferralAuto(true);
          // Résolution du profil de l'inviteur pour affichage rassurant
          try {
            const info = await api.post<{ inviter_name?: string }>("/ambassadors/resolve", { code: stored }, false);
            if (info?.inviter_name) setReferralInviter(info.inviter_name);
          } catch { /* silencieux si code KO — l'utilisateur peut corriger */ }
        }
      } catch { /* SecureStore indispo — pas fatal */ }
    })();
  }, []);

  // Vérifie la validité d'un code saisi manuellement (debounce 500 ms)
  useEffect(() => {
    const code = referralCode.trim();
    if (!code || code.length < 3 || referralAuto) {
      setReferralInviter(null);
      setReferralError(null);
      return;
    }
    let cancelled = false;
    setReferralChecking(true);
    const t = setTimeout(async () => {
      try {
        const info = await api.post<{ inviter_name?: string }>("/ambassadors/resolve", { code }, false);
        if (cancelled) return;
        setReferralInviter(info?.inviter_name || null);
        setReferralError(null);
      } catch {
        if (cancelled) return;
        setReferralInviter(null);
        setReferralError("Code d'invitation introuvable.");
      } finally {
        if (!cancelled) setReferralChecking(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); setReferralChecking(false); };
  }, [referralCode, referralAuto]);

  const submit = async () => {
    setErr(null);
    if (!name.trim() || !email.trim() || password.length < 6) {
      setErr("Nom, email et mot de passe (6+ caractères) requis");
      return;
    }
    if (!acceptedLegal) {
      setErr("Vous devez accepter les Conditions d'utilisation et la Politique de confidentialité");
      return;
    }
    // Bloque si l'utilisateur a saisi un code invalide (sauf s'il l'a vidé)
    if (referralCode.trim() && referralError) {
      setErr("Corrigez le code d'invitation ou effacez-le pour continuer.");
      return;
    }
    setLoading(true);
    try {
      const payload: any = { email: email.trim().toLowerCase(), password, name: name.trim(), role, phone, city };
      const code = referralCode.trim();
      if (code) payload.referral_code = code;
      const u = await signUp(payload);
      // Record acceptances after successful signup
      try {
        await Promise.all([
          fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ""}/api/legal/acceptances`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${(u as any).__t || ""}` },
          }).catch(() => null),
        ]);
      } catch { /* not fatal */ }
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

          {/* Referral code — optionnel, s'ouvre au tap OU auto-ouvert si code déjà stocké */}
          <View style={styles.referralWrap}>
            {!referralOpen ? (
              <Pressable
                onPress={() => setReferralOpen(true)}
                style={styles.referralToggle}
                testID="register-open-referral"
              >
                <Ionicons name="ticket-outline" size={18} color={colors.turquoise} />
                <Txt weight="600" size="sm" color={colors.turquoise} style={{ marginLeft: 8, flex: 1 }}>
                  J&apos;ai un code de parrainage Jokoo Partners
                </Txt>
                <Ionicons name="chevron-forward" size={16} color={colors.turquoise} />
              </Pressable>
            ) : (
              <View>
                <View style={styles.referralHeader}>
                  <Ionicons name="ticket" size={18} color={colors.turquoise} />
                  <Txt weight="700" size="sm" style={{ marginLeft: 8, flex: 1 }}>
                    Code de parrainage
                  </Txt>
                  {!referralAuto ? (
                    <Pressable
                      onPress={() => {
                        setReferralOpen(false);
                        setReferralCode("");
                        setReferralInviter(null);
                        setReferralError(null);
                      }}
                      hitSlop={10}
                    >
                      <Txt size="xs" color={colors.textMuted}>Ignorer</Txt>
                    </Pressable>
                  ) : null}
                </View>
                <Input
                  icon="ticket-outline"
                  placeholder="EX. 5GB3EH"
                  value={referralCode}
                  onChangeText={(v: string) => {
                    setReferralAuto(false); // édition manuelle
                    setReferralCode(v.toUpperCase().slice(0, 40));
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  testID="register-referral-code"
                />
                {referralAuto ? (
                  <View style={styles.referralHint}>
                    <Ionicons name="link" size={13} color={colors.turquoise} />
                    <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 6, flex: 1 }}>
                      Code appliqué automatiquement depuis votre lien d&apos;invitation.
                    </Txt>
                  </View>
                ) : null}
                {referralChecking ? (
                  <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 4 }}>Vérification…</Txt>
                ) : referralInviter ? (
                  <View style={[styles.referralHint, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }]}>
                    <Ionicons name="checkmark-circle" size={14} color="#166534" />
                    <Txt size="xxs" weight="600" color="#166534" style={{ marginLeft: 6, flex: 1 }}>
                      Invité·e par {referralInviter}
                    </Txt>
                  </View>
                ) : referralError ? (
                  <View style={[styles.referralHint, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]}>
                    <Ionicons name="alert-circle" size={14} color={colors.danger} />
                    <Txt size="xxs" weight="600" color={colors.danger} style={{ marginLeft: 6, flex: 1 }}>
                      {referralError}
                    </Txt>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <Pressable onPress={() => setAcceptedLegal((v) => !v)} style={styles.legalRow} testID="legal-accept">
            <View style={[styles.checkbox, acceptedLegal && styles.checkboxOn]}>
              {acceptedLegal ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
            </View>
            <Txt size="xs" color={colors.textMuted} style={{ flex: 1, marginLeft: 10, lineHeight: 18 }}>
              J&apos;accepte les{" "}
              <Txt size="xs" weight="700" color={colors.turquoise} onPress={() => router.push("/legal/cgu")}>Conditions d&apos;utilisation</Txt>
              {" "}et la{" "}
              <Txt size="xs" weight="700" color={colors.turquoise} onPress={() => router.push("/legal/privacy")}>Politique de confidentialité</Txt>.
            </Txt>
          </Pressable>

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
  legalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface,
  },
  checkboxOn: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  referralWrap: { marginTop: spacing.md },
  referralToggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  referralHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  referralHint: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: radius.sm,
    marginTop: 6,
    backgroundColor: "#F0FDFA",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#99F6E4",
  },
});
