// Hub espace administrateur — statistiques et raccourcis vers gestion des publicités
// et sponsorisations.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type AdStats = {
  total_ads: number;
  active_ads: number;
  total_impressions: number;
  total_clicks: number;
};

export default function AdminHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [stats, setStats] = useState<AdStats | null>(null);
  const [pendingSponsor, setPendingSponsor] = useState(0);

  const load = useCallback(async () => {
    try {
      const [s, sp] = await Promise.all([
        api.get<AdStats>("/admin/ads/stats"),
        api.get<any[]>("/admin/sponsorships"),
      ]);
      setStats(s);
      setPendingSponsor(sp.filter((x) => x.status === "pending").length);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <Ionicons name="lock-closed" size={48} color={colors.textSubtle} />
        <Txt size="md" color={colors.textMuted} style={{ marginTop: spacing.md }}>Accès administrateur requis</Txt>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="admin-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Espace admin</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        <View style={styles.hero}>
          <Ionicons name="shield-checkmark" size={26} color={colors.white} />
          <Txt size="xl" weight="700" color={colors.white} style={{ marginTop: 8 }}>Panneau administrateur</Txt>
          <Txt size="sm" color="rgba(255,255,255,0.85)" style={{ marginTop: 4 }}>
            Gérez les publicités et les campagnes sponsorisées.
          </Txt>
        </View>

        {/* Ad stats */}
        <View style={styles.grid}>
          <StatBox icon="megaphone" label="Publicités" value={String(stats?.total_ads ?? 0)} color={colors.turquoise} />
          <StatBox icon="eye" label="Vues" value={String(stats?.total_impressions ?? 0)} color={colors.midnight} />
          <StatBox icon="hand-left" label="Clics" value={String(stats?.total_clicks ?? 0)} color={colors.info} />
          <StatBox icon="checkmark-done" label="Actives" value={String(stats?.active_ads ?? 0)} color={colors.success} />
        </View>

        <Pressable onPress={() => router.push("/admin/ads")} style={styles.nav} testID="admin-ads">
          <View style={styles.navIcon}>
            <Ionicons name="megaphone-outline" size={22} color={colors.turquoise} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt weight="700">Gérer les publicités</Txt>
            <Txt size="xs" color={colors.textMuted}>Créer, programmer et suivre les campagnes</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
        </Pressable>

        <Pressable onPress={() => router.push("/admin/sponsorships")} style={styles.nav} testID="admin-sponsors">
          <View style={styles.navIcon}>
            <Ionicons name="rocket-outline" size={22} color={colors.turquoise} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt weight="700">Sponsorisations</Txt>
            <Txt size="xs" color={colors.textMuted}>
              {pendingSponsor > 0 ? `${pendingSponsor} en attente de validation` : "Historique et validation"}
            </Txt>
          </View>
          {pendingSponsor > 0 ? (
            <View style={styles.badge}><Txt size="xxs" weight="700" color={colors.white}>{pendingSponsor}</Txt></View>
          ) : (
            <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
          )}
        </Pressable>

        {stats && stats.total_ads === 0 ? (
          <Card><Txt color={colors.textMuted}>{"Aucune publicité pour l'instant."}</Txt></Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function StatBox({ icon, label, value, color }: any) {
  return (
    <View style={styles.statBox}>
      <View style={[styles.statIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Txt size="lg" weight="700" style={{ marginTop: 8 }}>{value}</Txt>
      <Txt size="xs" color={colors.textMuted}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  hero: { padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.midnight, ...shadow.card },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statBox: { width: "48%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nav: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow.soft },
  navIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  badge: { minWidth: 24, height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
});
