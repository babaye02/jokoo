// Hub espace administrateur — statistiques + raccourcis filtrés par permission.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { hasPerm, isStaff, isSuperAdmin, ROLE_LABEL } from "@/src/perms";
import { Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type AdStats = { total_ads: number; active_ads: number; total_impressions: number; total_clicks: number };

const NAV_ITEMS: {
  key: string; title: string; sub: string; icon: any; route: string; perm?: string; superOnly?: boolean;
}[] = [
  { key: "staff",    title: "Équipe & rôles",          sub: "Gérer les employés et permissions",          icon: "people-outline",         route: "/admin/staff",              superOnly: true },
  { key: "ads",      title: "Publicités",              sub: "Créer, programmer, suivre",                  icon: "megaphone-outline",      route: "/admin/ads",                perm: "ads:read" },
  { key: "promos",   title: "Offres promo",            sub: "Landing pages /promo/{slug}",                icon: "pricetag-outline",       route: "/admin/promos",             perm: "ads:read" },
  { key: "partners", title: "Partenaires",             sub: "Annuaire des partenaires Jokoo",             icon: "business-outline",       route: "/admin/partners",           perm: "ads:read" },
  { key: "sponsors", title: "Sponsorisations",         sub: "Valider les campagnes payantes",             icon: "rocket-outline",         route: "/admin/sponsorships",       superOnly: true },
  { key: "suggestions", title: "Suggestions de métiers", sub: "Valider les nouveaux métiers proposés",    icon: "bulb-outline",           route: "/admin/service-suggestions" },
  { key: "assist",   title: "Inscription assistée",    sub: "Créer un compte client/prestataire",         icon: "person-add-outline",     route: "/admin/assisted-register", perm: "operator:create_account" },
  { key: "reports",  title: "Signalements",            sub: "Réclamations et modération",                 icon: "flag-outline",           route: "/admin/reports",            perm: "reports:handle" },
  { key: "kyc",      title: "Vérifications KYC",       sub: "File d'attente des identités à valider",     icon: "shield-checkmark-outline", route: "/admin/kyc-requests",     perm: "kyc:read" },
  { key: "legal",    title: "Centre juridique",        sub: "Éditer les 22 documents & versions",         icon: "document-text-outline",  route: "/admin/legal" },
  { key: "company",  title: "Informations entreprise", sub: "Coordonnées, réseaux, branding (site web)",  icon: "globe-outline",          route: "/admin/company-info",       superOnly: true },
];

export default function AdminHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [stats, setStats] = useState<AdStats | null>(null);
  const [pendingSponsor, setPendingSponsor] = useState(0);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);

  const load = useCallback(async () => {
    if (hasPerm(user, "ads:read") || isSuperAdmin(user)) {
      try { setStats(await api.get<AdStats>("/admin/ads/stats")); } catch {}
    }
    if (isSuperAdmin(user)) {
      try {
        const sp = await api.get<any[]>("/admin/sponsorships");
        setPendingSponsor(sp.filter((x) => x.status === "pending").length);
      } catch {}
    }
    if (isStaff(user)) {
      try {
        const sg = await api.get<any[]>("/admin/service-suggestions?status_filter=pending");
        setPendingSuggestions((sg || []).length);
      } catch {}
    }
  }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!isStaff(user)) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <Ionicons name="lock-closed" size={48} color={colors.textSubtle} />
        <Txt size="md" color={colors.textMuted} style={{ marginTop: spacing.md }}>Accès administrateur requis</Txt>
      </SafeAreaView>
    );
  }

  const role = user?.staff_role || "super_admin";
  const items = NAV_ITEMS.filter((it) => {
    if (it.superOnly) return isSuperAdmin(user);
    if (it.perm) return hasPerm(user, it.perm);
    return true;
  });

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
          <Txt size="xl" weight="700" color={colors.white} style={{ marginTop: 8 }}>Bonjour, {user?.name?.split(" ")[0] || "Admin"}</Txt>
          <View style={styles.roleTag}>
            <Txt size="xxs" weight="700" color={colors.midnight}>{ROLE_LABEL[role as keyof typeof ROLE_LABEL] || "Staff"}</Txt>
          </View>
        </View>

        {stats ? (
          <View style={styles.grid}>
            <StatBox icon="megaphone" label="Publicités" value={String(stats.total_ads)} color={colors.turquoise} />
            <StatBox icon="eye"        label="Vues"       value={String(stats.total_impressions)} color={colors.midnight} />
            <StatBox icon="hand-left"  label="Clics"      value={String(stats.total_clicks)} color={colors.info} />
            <StatBox icon="checkmark-done" label="Actives" value={String(stats.active_ads)} color={colors.success} />
          </View>
        ) : null}

        {items.map((it) => (
          <Pressable key={it.key} onPress={() => router.push(it.route as any)} style={styles.nav} testID={`admin-nav-${it.key}`}>
            <View style={styles.navIcon}>
              <Ionicons name={it.icon} size={22} color={colors.turquoise} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Txt weight="700">{it.title}</Txt>
              <Txt size="xs" color={colors.textMuted}>{it.sub}</Txt>
            </View>
            {it.key === "sponsors" && pendingSponsor > 0 ? (
              <View style={styles.badge}><Txt size="xxs" weight="700" color={colors.white}>{pendingSponsor}</Txt></View>
            ) : it.key === "suggestions" && pendingSuggestions > 0 ? (
              <View style={styles.badge}><Txt size="xxs" weight="700" color={colors.white}>{pendingSuggestions}</Txt></View>
            ) : (
              <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
            )}
          </Pressable>
        ))}

        {items.length === 0 ? (
          <Card><Txt color={colors.textMuted}>{"Vous n'avez accès à aucune section avec votre rôle actuel."}</Txt></Card>
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
  roleTag: { marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.white },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statBox: { width: "48%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nav: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow.soft },
  navIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  badge: { minWidth: 24, height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
});
