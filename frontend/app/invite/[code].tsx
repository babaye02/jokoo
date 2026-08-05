import { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { storage } from "@/src/utils/storage";
import { Txt, Avatar, Btn } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

/**
 * Route in-app pour les liens de parrainage :
 *   - jokoo://invite/CODE     (custom scheme, in-app share)
 *   - https://jokooservices.com/i/CODE (Universal Links iOS + App Links Android)
 *
 * Comportement :
 *   1. Résout le code via l'API publique (`/ambassadors/resolve`).
 *   2. Stocke le code dans SecureStore pour ré-injection au signup.
 *   3. Si utilisateur déjà connecté → tente d'attacher via `/ambassadors/attach`
 *      (idempotent) + redirige vers l'écran d'accueil avec confirmation.
 *   4. Si utilisateur non connecté → propose "Créer un compte" ou "Se connecter"
 *      en préservant le code.
 */

interface ResolvedInvite {
  code: string;
  slug: string;
  tier: string;
  badge: string;
  inviter_name: string;
  inviter_avatar?: string | null;
}

export const REFERRAL_STORAGE_KEY = "jokoo_referral_code";

export default function InviteScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = String(raw || "").trim();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<ResolvedInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) {
      setError("Code d'invitation manquant.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // Stocke immédiatement le code pour capture au signup
        try {
          await storage.secureSet(REFERRAL_STORAGE_KEY, code);
        } catch {}
        const res = await api.post<ResolvedInvite>(
          "/ambassadors/resolve",
          { code },
          false /* no auth needed */
        );
        setInvite(res);
      } catch (e: any) {
        setError(e?.message || "Invitation introuvable ou expirée.");
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  const attachAndGo = async () => {
    if (!user || !invite) return;
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; already_attached?: boolean }>(
        "/ambassadors/attach",
        { code: invite.code }
      );
      if (res.ok) {
        Alert.alert(
          "Invitation acceptée",
          res.already_attached
            ? "Vous étiez déjà rattaché·e à ce partenaire."
            : `Vous êtes maintenant filleul·e de ${invite.inviter_name}. Merci !`,
          [{ text: "Continuer", onPress: () => router.replace("/") }]
        );
      } else {
        Alert.alert("Impossible", "Le rattachement a échoué. Réessayez plus tard.");
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible d'accepter l'invitation.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.turquoise} />
          <Txt color={colors.textMuted} style={{ marginTop: spacing.md }}>
            Chargement de l&apos;invitation…
          </Txt>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !invite) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: "Invitation" }} />
        <View style={[styles.center, { padding: spacing.xl }]}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Txt weight="700" size="md" style={{ marginTop: spacing.md, textAlign: "center" }}>
            Invitation introuvable
          </Txt>
          <Txt color={colors.textMuted} size="sm" style={{ marginTop: 6, textAlign: "center" }}>
            {error || "Le code d'invitation n'est pas valide ou a expiré."}
          </Txt>
          <Btn
            title="Retour à l'accueil"
            onPress={() => router.replace("/")}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Invitation Jokoo Partners" }} />
      <View style={styles.hero}>
        <View style={{ alignItems: "center" }}>
          <Txt size="displayLg">🤝</Txt>
          <Txt size="xl" weight="800" color={colors.white} style={{ marginTop: 4 }}>
            Jokoo Partners
          </Txt>
          <Txt size="sm" color="rgba(255,255,255,0.85)" style={{ marginTop: 4 }}>
            {"Vous avez été invité·e à rejoindre la communauté"}
          </Txt>
        </View>

        <View style={styles.inviterCard}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Avatar
              uri={invite.inviter_avatar || undefined}
              name={invite.inviter_name}
              size={56}
            />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Txt size="xs" color="rgba(255,255,255,0.8)">
                Invité·e par
              </Txt>
              <Txt size="lg" weight="800" color={colors.white}>
                {invite.inviter_name}
              </Txt>
              <Txt size="xs" color="rgba(255,255,255,0.9)" style={{ marginTop: 2 }}>
                {invite.badge}
              </Txt>
            </View>
          </View>
          <View style={styles.codeBox}>
            <Txt size="xxs" color="rgba(255,255,255,0.7)">VOTRE CODE</Txt>
            <Txt size="xxl" weight="800" color={colors.white} style={{ letterSpacing: 4 }}>
              {invite.code}
            </Txt>
          </View>
        </View>
      </View>

      <View style={{ padding: spacing.lg, flex: 1, justifyContent: "space-between" }}>
        <View style={{ gap: spacing.sm }}>
          {[
            { icon: "🏠", text: "Prestataires vérifiés près de chez vous" },
            { icon: "💰", text: "Paiement sécurisé Wave / Orange Money / espèces" },
            { icon: "🚗", text: "Covoiturage, livraison, baby-sitting, tout-en-un" },
          ].map((b, i) => (
            <View key={i} style={styles.benefit}>
              <Txt size="lg" style={{ marginRight: 10 }}>{b.icon}</Txt>
              <Txt size="sm" style={{ flex: 1 }}>{b.text}</Txt>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {user ? (
            <Btn
              title={busy ? "Rattachement…" : `Accepter l'invitation de ${invite.inviter_name.split(" ")[0]}`}
              onPress={attachAndGo}
              disabled={busy}
              icon="checkmark-circle-outline"
            />
          ) : (
            <>
              <Btn
                title="Créer un compte"
                onPress={() => router.push({ pathname: "/onboarding", params: { referral_code: invite.code } })}
                icon="person-add-outline"
              />
              <Btn
                title="J'ai déjà un compte — Se connecter"
                variant="secondary"
                onPress={() => router.push("/login")}
              />
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl + 12,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  inviterCard: {
    marginTop: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.25)",
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.card,
  },
  codeBox: {
    marginTop: spacing.md,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  benefit: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
