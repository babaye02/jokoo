import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Share, Alert, ToastAndroid, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Card, Txt, Avatar, Btn, ErrorBox } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useAmbassadorStatus } from "@/src/hooks/useAmbassadorStatus";

const TIER_COLORS: Record<string, string> = {
  starter: "#94A3B8",
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#F5B301",
  diamond: "#22D3EE",
  elite: "#7C3AED",
};

function formatXof(n: number): string {
  return `${n.toLocaleString("fr-FR")} F`;
}

export default function AmbassadorDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, loading, error, refresh, isAmbassador } = useAmbassadorStatus();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const copy = async (text: string, label: string) => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      if (Platform.OS === "android") {
        ToastAndroid.show(`${label} copié dans le presse-papiers`, ToastAndroid.SHORT);
      } else {
        Alert.alert(label, `${text}\n\n(Copié dans le presse-papiers)`);
      }
    } catch {
      // Fallback : ouvre le Share dialog
      try { await Share.share({ message: text }); } catch {}
    }
  };

  const share = async () => {
    const amb = data?.ambassador;
    if (!amb) return;
    try {
      await Share.share({
        message:
          amb.links?.share_text ||
          `Rejoins-moi sur Jokoo 🇸🇳 avec mon code ${amb.code} — ${amb.links?.web_slug || amb.links?.web}`,
      });
    } catch {}
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.safe}><View style={styles.center}><Txt color={colors.textMuted}>Chargement…</Txt></View></SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={styles.safe}><View style={styles.center}><ErrorBox text={error} /></View></SafeAreaView>
    );
  }
  if (!isAmbassador || !data?.ambassador) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: "Jokoo Partners", headerBackTitle: "Retour" }} />
        <ScrollView contentContainerStyle={{ padding: spacing.xl, alignItems: "center" }}>
          <Ionicons name="handshake-outline" size={56} color={colors.turquoise} />
          <Txt weight="700" size="lg" style={{ marginTop: spacing.md, textAlign: "center" }}>
            Programme Jokoo Partners
          </Txt>
          <Txt color={colors.textMuted} size="sm" style={{ marginTop: 6, textAlign: "center", lineHeight: 20 }}>
            Un programme sur invitation pour parrainer clients et prestataires, débloquer des tiers (Bronze → Elite) et générer des commissions récurrentes.
          </Txt>

          {/* Bénéfices */}
          <View style={{ marginTop: spacing.xl, gap: spacing.sm, width: "100%" }}>
            {[
              { icon: "🏆", text: "6 tiers de progression avec commissions croissantes (2 % → 12 %)" },
              { icon: "🎁", text: "Récompenses et badges à chaque niveau" },
              { icon: "📊", text: "Tableau de bord temps réel de vos filleuls et gains" },
            ].map((b, i) => (
              <View key={i} style={styles.benefit}>
                <Txt size="lg" style={{ marginRight: 10 }}>{b.icon}</Txt>
                <Txt size="sm" style={{ flex: 1 }}>{b.text}</Txt>
              </View>
            ))}
          </View>

          {/* Actions */}
          <View style={{ width: "100%", marginTop: spacing.xl, gap: spacing.sm }}>
            <Btn
              title="J'ai un code d'invitation"
              icon="ticket-outline"
              variant="secondary"
              onPress={() => router.push("/invite/enter")}
            />
            <Btn
              title="En savoir plus"
              icon="information-circle-outline"
              variant="ghost"
              onPress={() => router.push("/legal/cgu")}
            />
          </View>

          <Txt size="xxs" color={colors.textMuted} style={{ marginTop: spacing.xl, textAlign: "center" }}>
            Devenez ambassadeur sur invitation de notre équipe Jokoo.
          </Txt>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const amb = data.ambassador;
  const stats = data.stats!;
  const nextTier = data.next_tier;
  const tierColor = TIER_COLORS[amb.tier] || colors.turquoise;
  const progress = Math.min(1, stats.month_progress.current / Math.max(1, stats.month_progress.goal));

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ title: "Jokoo Partners" }} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Hero card */}
        <View style={[styles.hero, { backgroundColor: tierColor + "22", borderColor: tierColor + "55" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Avatar uri={amb.avatar || undefined} size={56} name={amb.name || undefined} />
            <View style={{ flex: 1 }}>
              <Txt size="lg" weight="800">🤝 Jokoo Partner</Txt>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Txt size="sm" weight="700" color={tierColor}>{amb.badge}</Txt>
              </View>
              {amb.custom_bio ? (
                <Txt size="xs" color={colors.textMuted} style={{ marginTop: 3 }} numberOfLines={2}>
                  {amb.custom_bio}
                </Txt>
              ) : null}
            </View>
          </View>

          {/* Progress bar */}
          <View style={{ marginTop: spacing.lg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Txt size="xs" weight="700" color={colors.textMuted}>OBJECTIF DU MOIS</Txt>
              <Txt size="xs" weight="700">{stats.month_progress.current} / {stats.month_progress.goal} prestataires</Txt>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: tierColor }]} />
            </View>
          </View>

          {nextTier ? (
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
              Encore <Txt weight="800" color={colors.midnight}>{nextTier.needed}</Txt> filleul(s) vérifié(s) pour {nextTier.badge}.
            </Txt>
          ) : (
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
              👑 Vous êtes au sommet ! Merci de faire briller Jokoo.
            </Txt>
          )}
        </View>

        {/* Referral share card */}
        <Card style={{ marginTop: spacing.lg, padding: spacing.lg }}>
          <Txt weight="800" size="md">🎟️ Mon code de parrainage</Txt>
          <View style={styles.codeBox}>
            <Txt size="xl" weight="800" style={{ letterSpacing: 4 }}>{amb.code}</Txt>
          </View>
          <View style={styles.actionsRow}>
            <Pressable style={styles.actionBtn} onPress={() => copy(amb.code, "Code copié")}>
              <Ionicons name="copy-outline" size={16} color={colors.midnight} />
              <Txt size="xs" weight="700" style={{ marginLeft: 4 }}>Copier code</Txt>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => copy(amb.links?.web_slug || amb.links?.web || "", "Lien copié")}>
              <Ionicons name="link-outline" size={16} color={colors.midnight} />
              <Txt size="xs" weight="700" style={{ marginLeft: 4 }}>Copier lien</Txt>
            </Pressable>
          </View>

          <Txt size="xs" color={colors.textMuted} style={{ marginTop: spacing.sm }} numberOfLines={1}>
            🔗 {amb.links?.web_slug || amb.links?.web}
          </Txt>

          <Btn onPress={share} style={{ marginTop: spacing.md }} icon="share-social-outline" title="Partager mon invitation" />
        </Card>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard icon="people-outline" label="Prestataires" value={stats.prestataires_verified} suffix="vérifiés" />
          <StatCard icon="person-outline" label="Clients" value={stats.clients_verified} suffix="vérifiés" />
          <StatCard icon="hourglass-outline" label="En attente" value={stats.pending_total} suffix="filleuls" />
          <StatCard icon="calendar-outline" label="Réservations" value={stats.bookings_generated} suffix="générées" />
        </View>

        {/* Commissions */}
        <Card style={{ marginTop: spacing.lg, padding: spacing.lg }}>
          <Txt weight="800" size="md">💰 Mes commissions</Txt>
          <View style={{ marginTop: spacing.md, gap: 8 }}>
            <CommissionRow tone="warn" label="⏳ En attente" value={stats.commissions.pending_xof} />
            <CommissionRow tone="info" label="✔️ Approuvées" value={stats.commissions.approved_xof} />
            <CommissionRow tone="ok" label="💳 Payées" value={stats.commissions.paid_xof} />
          </View>
          <Pressable onPress={() => router.push("/ambassador/commissions")} style={{ marginTop: spacing.md }}>
            <Txt weight="700" color={colors.turquoise}>Voir toutes mes commissions →</Txt>
          </Pressable>
        </Card>

        {/* Leaderboard link */}
        <Pressable onPress={() => router.push("/ambassador/leaderboard")} style={styles.linkRow}>
          <Ionicons name="trophy-outline" size={22} color={colors.midnight} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt weight="700">Classement des partenaires</Txt>
            <Txt size="xs" color={colors.textMuted}>Voir votre position dans le leaderboard public</Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Pressable onPress={() => router.push("/ambassador/referrals")} style={styles.linkRow}>
          <Ionicons name="people-circle-outline" size={22} color={colors.midnight} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt weight="700">Mes filleuls</Txt>
            <Txt size="xs" color={colors.textMuted}>Suivre le statut de chaque personne que vous avez parrainée</Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Txt size="xxs" color={colors.textMuted} style={{ textAlign: "center", marginTop: spacing.lg }}>
          {"Programme géré par Jokoo Services SAS. Les seuils et taux sont susceptibles d'évoluer."}
        </Txt>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value, suffix }: { icon: string; label: string; value: number; suffix: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={20} color={colors.turquoise} />
      <Txt size="xxl" weight="800" style={{ marginTop: 4 }}>{value}</Txt>
      <Txt size="xxs" color={colors.textMuted}>{label} {suffix}</Txt>
    </View>
  );
}

function CommissionRow({ tone, label, value }: { tone: "warn" | "info" | "ok"; label: string; value: number }) {
  const bg = tone === "warn" ? "#FEF3C7" : tone === "info" ? "#E0F2FE" : "#DCFCE7";
  return (
    <View style={[styles.commRow, { backgroundColor: bg }]}>
      <Txt weight="600" size="sm">{label}</Txt>
      <Txt weight="800" size="md">{formatXof(value)}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#00000010",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  codeBox: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceWarm,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statsGrid: {
    marginTop: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  statCard: {
    width: "48%",
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.sm,
  },
  commRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  linkRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
