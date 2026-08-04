// Admin CRM Push — Dashboard + Campagnes + Templates.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Dashboard = {
  counts: {
    total_users: number; clients: number; prestataires: number; devices: number;
    campaigns_total: number; campaigns_sent: number; campaigns_scheduled: number;
  };
  totals: { sent: number; failed: number; targeted: number };
  rates: { delivered_pct: number; opened_pct: number };
  recent_campaigns: any[];
};

export default function AdminPushHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Dashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Dashboard>("/admin/push/dashboard");
      setData(r);
    } catch { /* silent */ }
    finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const c = data?.counts;
  const t = data?.totals;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="crm-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">CRM · Notifications</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* KPIs */}
        <View style={styles.grid}>
          <Kpi icon="people" label="Utilisateurs" value={c?.total_users ?? "…"} tint={colors.turquoise} />
          <Kpi icon="phone-portrait" label="Appareils" value={c?.devices ?? "…"} tint={colors.midnight} />
          <Kpi icon="paper-plane" label="Envoyées" value={t?.sent ?? "…"} tint={colors.success} />
          <Kpi icon="alert-circle" label="Échecs" value={t?.failed ?? "…"} tint={colors.danger} />
        </View>

        <Card style={{ padding: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Txt weight="700">Taux global</Txt>
            <Txt size="xs" color={colors.textMuted}>Phase 2 pour livrés/ouverts réels</Txt>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Stat label="Livraison" value={`${data?.rates.delivered_pct ?? 0}%`} />
            <Stat label="Ouverture" value={`${data?.rates.opened_pct ?? 0}%`} />
            <Stat label="Ciblés" value={String(t?.targeted ?? 0)} />
          </View>
        </Card>

        {/* Actions */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Btn title="Créer une campagne" icon="add-circle" onPress={() => router.push("/admin/push/create")} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <Btn title="Modèles" icon="albums" variant="secondary" onPress={() => router.push("/admin/push/templates")} fullWidth />
          </View>
        </View>

        {/* Campagnes récentes */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md }}>
          <Txt weight="700">Campagnes récentes</Txt>
          <Pressable onPress={() => router.push("/admin/push/campaigns")}><Txt size="xs" color={colors.turquoise}>Tout voir →</Txt></Pressable>
        </View>
        {(data?.recent_campaigns || []).length === 0 ? (
          <Card><Txt color={colors.textMuted}>Aucune campagne pour le moment. Lancez votre 1ère.</Txt></Card>
        ) : (data?.recent_campaigns || []).map((cmp: any) => (
          <Pressable key={cmp.id} onPress={() => router.push(`/admin/push/campaign/${cmp.id}` as any)}>
            <Card style={{ padding: spacing.md, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Txt weight="700" numberOfLines={1} style={{ flex: 1 }}>{cmp.title}</Txt>
                <StatusPill status={cmp.status} />
              </View>
              <Txt size="xs" color={colors.textMuted} numberOfLines={2}>{cmp.message}</Txt>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <Chip label={segmentLabel(cmp.segment)} />
                {cmp.stats?.sent > 0 ? <Chip label={`${cmp.stats.sent} envoyées`} /> : null}
                {cmp.scheduled_at ? <Chip label={`⏰ ${cmp.scheduled_at.slice(0,16).replace('T',' ')}`} /> : null}
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function segmentLabel(seg: any): string {
  const map: Record<string, string> = {
    all: "Tous", clients: "Clients", prestataires: "Prestataires",
    verified: "Vérifiés", unverified: "Non-vérifiés",
    category: `Métier: ${seg?.params?.category || seg?.params?.value || "?"}`,
    city: `Ville: ${seg?.params?.city || seg?.params?.value || "?"}`,
    new_signups: "Nouveaux inscrits", inactive: "Inactifs",
    manual: `${(seg?.params?.user_ids || []).length} manuels`,
  };
  return map[seg?.type] || seg?.type || "Segment";
}

function Kpi({ icon, label, value, tint }: any) {
  return (
    <View style={[styles.kpi, { backgroundColor: colors.surface }]}>
      <View style={[styles.kpiIcon, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Txt size="xxl" weight="700" style={{ marginTop: 6 }}>{String(value)}</Txt>
      <Txt size="xxs" color={colors.textMuted}>{label}</Txt>
    </View>
  );
}

function Stat({ label, value }: any) {
  return (
    <View style={{ flex: 1, alignItems: "center", padding: 10, borderRadius: 12, backgroundColor: colors.surface2 }}>
      <Txt size="lg" weight="700">{value}</Txt>
      <Txt size="xxs" color={colors.textMuted}>{label}</Txt>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const colorFor: Record<string, string> = {
    draft: colors.textMuted, scheduled: colors.warning, sending: colors.turquoise,
    sent: colors.success, failed: colors.danger,
  };
  const label: Record<string, string> = {
    draft: "Brouillon", scheduled: "Programmée", sending: "Envoi…", sent: "Envoyée", failed: "Échec",
  };
  const tint = colorFor[status] || colors.textMuted;
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: `${tint}22` }}>
      <Txt size="xxs" weight="700" color={tint}>{label[status] || status}</Txt>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}><Txt size="xxs" color={colors.textMuted}>{label}</Txt></View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpi: { flexBasis: "48%", flexGrow: 1, padding: spacing.md, borderRadius: radius.lg, ...shadow.soft },
  kpiIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
});
