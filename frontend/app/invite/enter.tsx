import { useState } from "react";
import { View, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Txt, Btn, ErrorBox, ScreenHeader } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";

/**
 * Écran manuel pour saisir un code d'invitation Jokoo Partners.
 * Alternative au flow deep-link `/invite/[code]` : utile si l'utilisateur
 * a reçu un code (SMS, WhatsApp) sans lien direct.
 */
export default function InviteEnterScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const clean = code.trim();
    if (clean.length < 3) {
      setError("Le code doit contenir au moins 3 caractères.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (!user) {
        // Redirige vers l'écran d'invitation qui gère la résolution + storage
        router.replace({ pathname: "/invite/[code]", params: { code: clean } });
        return;
      }
      const res = await api.post<{ ok: boolean; already_attached?: boolean; ambassador_id: string }>(
        "/ambassadors/attach",
        { code: clean }
      );
      Alert.alert(
        res.already_attached ? "Déjà rattaché·e" : "Bienvenue !",
        res.already_attached
          ? "Vous étiez déjà filleul·e de ce partenaire."
          : "Vous êtes maintenant rattaché·e à ce partenaire Jokoo. Merci !",
        [{ text: "Continuer", onPress: () => router.back() }]
      );
    } catch (e: any) {
      const msg = e?.message || "Code invalide ou expiré.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScreenHeader title="Saisir un code" onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <Ionicons name="ticket-outline" size={40} color={colors.turquoise} />
          </View>
          <Txt weight="800" size="xl" style={{ textAlign: "center", marginTop: spacing.md }}>
            Code d&apos;invitation
          </Txt>
          <Txt color={colors.textMuted} size="sm" style={{ textAlign: "center", marginTop: 6 }}>
            Entrez le code partagé par votre parrain Jokoo Partners.
          </Txt>

          <View style={{ marginTop: spacing.xl }}>
            <ErrorBox text={error} />
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="EX. 5GB3EH"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={40}
              style={styles.input}
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <Btn
              title={busy ? "Vérification…" : "Valider mon invitation"}
              onPress={submit}
              loading={busy}
              disabled={busy || code.length < 3}
              style={{ marginTop: spacing.md }}
              icon="checkmark-circle-outline"
            />
          </View>

          <Txt size="xxs" color={colors.textMuted} style={{ textAlign: "center", marginTop: spacing.xl }}>
            Vous pouvez uniquement être rattaché·e à un seul parrain, une seule fois.
          </Txt>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, alignItems: "stretch" },
  iconWrap: {
    alignSelf: "center",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  input: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    letterSpacing: 4,
    textAlign: "center",
    fontWeight: "700",
    color: colors.midnight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
