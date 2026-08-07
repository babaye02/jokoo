// Wallet Jokoo Pro — abonnement pro pour prestataires.
// Debit auto via wallet ; status + auto-renew togglable.

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { formatXof } from "@/src/pricing";
import { JokooProStatus, WalletSnapshot, walletApi } from "@/src/wallet/api";

const PRO_FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: "trending-up",
    title: "Priorité dans les résultats",
    body: "Votre profil apparaît en tête sur les recherches de votre catégorie.",
  },
  {
    icon: "shield-checkmark",
    title: "Badge Pro visible",
    body: "Un signal de confiance qui rassure les clients et convertit mieux.",
  },
  {
    icon: "flash",
    title: "Notifications instantanées",
    body: "Recevez les demandes de réservation avant les prestataires standards.",
  },
  {
    icon: "bar-chart",
    title: "Statistiques avancées",
    body: "Analytics détaillés sur vos réservations, revenus et note moyenne.",
  },
  {
    icon: "chatbubble-ellipses",
    title: "Support prioritaire",
    body: "Notre équipe vous répond en priorité, 7 jours sur 7.",
  },
];

export default function JokooProScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<JokooProStatus | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, w] = await Promise.all([
        walletApi.jokooProStatus(),
        walletApi.me(),
      ]);
      setStatus(s);
      setWallet(w);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSubscribe = async () => {
    if (!status || !wallet) return;
    if (wallet.balance_available_xof < status.price_xof) {
      Alert.alert(
        "Solde insuffisant",
        `Vous avez besoin de ${formatXof(status.price_xof)} sur votre wallet. Solde actuel : ${formatXof(wallet.balance_available_xof)}.`,
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Recharger",
            onPress: () => router.push("/wallet/recharge"),
            style: "default",
          },
        ]
      );
      return;
    }
    Alert.alert(
      "Souscrire à Jokoo Pro ?",
      `${formatXof(status.price_xof)} vont être débités de votre wallet pour 30 jours d'abonnement.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: async () => {
            setSubmitting(true);
            try {
              await walletApi.jokooProSubscribe();
              await load();
              Alert.alert("🎉 Bienvenue chez Jokoo Pro !", "Votre abonnement est actif pour 30 jours.");
            } catch (e: any) {
              const msg =
                e?.data?.detail?.message ||
                e?.data?.message ||
                e?.message ||
                "Souscription impossible.";
              Alert.alert("Erreur", msg);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const onCancel = () => {
    Alert.alert(
      "Désactiver l'auto-renouvellement ?",
      "Votre abonnement restera actif jusqu'à sa date d'expiration.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          style: "destructive",
          onPress: async () => {
            try {
              await walletApi.jokooProCancel();
              await load();
            } catch {}
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={colors.turquoise} /></View>
      </SafeAreaView>
    );
  }

  const expiryDate = status?.expires_at ? new Date(status.expires_at) : null;
  const expiryStr = expiryDate?.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Txt size="lg" weight="700">Jokoo Pro</Txt>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO */}
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Ionicons name="star" size={12} color="#FFB800" />
            <Txt size="xs" weight="700" color="#FFB800" style={{ marginLeft: 4 }}>
              PRO
            </Txt>
          </View>
          <Txt size="hero" weight="800" color={colors.white} style={{ marginTop: spacing.md }}>
            {formatXof(status?.price_xof || 0)}
          </Txt>
          <Txt size="sm" color="rgba(255,255,255,0.7)">/ 30 jours</Txt>

          {status?.active && (
            <View style={styles.activePill}>
              <View style={styles.dot} />
              <Txt size="xs" weight="700" color="#3CB371" style={{ marginLeft: 6 }}>
                Actif jusqu&apos;au {expiryStr}
              </Txt>
            </View>
          )}
        </View>

        {/* FEATURES */}
        <Txt size="lg" weight="700" style={styles.sectionTitle}>
          Vos avantages Pro
        </Txt>
        <View style={styles.featuresList}>
          {PRO_FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={20} color={colors.turquoise} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Txt size="md" weight="700">
                  {f.title}
                </Txt>
                <Txt size="sm" color={colors.textMuted} style={{ marginTop: 2 }}>
                  {f.body}
                </Txt>
              </View>
            </View>
          ))}
        </View>

        {/* CTA */}
        {status?.active ? (
          <>
            <View style={styles.autoRow}>
              <View style={{ flex: 1 }}>
                <Txt size="md" weight="700">
                  Renouvellement automatique
                </Txt>
                <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>
                  {status.auto_renew
                    ? `Débit auto de ${formatXof(status.price_xof)} le ${expiryStr}.`
                    : "Désactivé. Votre abonnement expirera à échéance."}
                </Txt>
              </View>
              {status.auto_renew && (
                <Pressable onPress={onCancel} style={styles.cancelBtn}>
                  <Txt size="sm" weight="700" color={colors.danger}>
                    Désactiver
                  </Txt>
                </Pressable>
              )}
            </View>
          </>
        ) : (
          <View style={{ marginTop: spacing.xl }}>
            <Btn
              title={submitting ? "Souscription…" : `Souscrire pour ${formatXof(status?.price_xof || 15000)}`}
              onPress={onSubscribe}
              loading={submitting}
              fullWidth
            />
            <Txt size="xs" color={colors.textMuted} style={{ textAlign: "center", marginTop: spacing.sm }}>
              Débit auto depuis votre wallet — annulable à tout moment.
            </Txt>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  headerBtn: { padding: 4, width: 40 },
  scroll: { paddingHorizontal: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    backgroundColor: colors.midnight,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    marginBottom: spacing.xl,
    ...shadow.md,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,184,0,0.15)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(60,179,113,0.15)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3CB371" },

  sectionTitle: { marginBottom: spacing.md, paddingHorizontal: 4 },
  featuresList: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },

  autoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    ...shadow.sm,
  },
  cancelBtn: { paddingHorizontal: spacing.md, paddingVertical: 8 },
});
