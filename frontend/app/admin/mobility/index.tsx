// Dashboard admin Mobilité — Spec Covoiturage #12.
// KPIs marketplace, taux de matching/acceptation, axes les plus demandés,
// demandes par ville et demandes sans conducteur (cible de l'anti-ghost).
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { hasPerm, isStaff } from "@/src/perms";
import { Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type RouteRow = { from_city: string; to_city: string; count: number };
type Dashboard = {
  kpis: {
    requests_open: number; requests_last_24h: number; rides_active: number;
    ghost_rides_active: number; offers_pending: number; bookings_last_7d: number;
    unserved_requests: number;
  };
  matching: {
    match_rate_7d: number; accept_rate_7d: number; requests_7d: number;
    requests_with_offer_7d: number; offers_7d: number; offers_accepted_7d: number;
  };
  top_request_routes: RouteRow[];
  top_ride_routes: RouteRow[];
  requests_by_city: { city: string; count: number }[];
  unserved: {
    id: string; from_city: string; to_city: string; date: string;
    time_from?: string; time_to?: string; seats?: number;
    budget_xof?: number | null; passenger_name?: string;
  }[];
};

const pct = (v: number) => `${Math.round((v || 0) * 100)}%`;
const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

export default function AdminMobility() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Dashboard>("/admin/mobility/dashboard"));
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Chargement impossible.");
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!isStaff(user) || !hasPerm(user, "stats:read")) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="lock-closed" size={48} color={colors.textSubtle} />
        <Txt size="md" color={colors.textMuted} style={{ marginTop: spacing.md }}>Accès administrateur requis</Txt>
      </SafeAreaView>
    );
  }

  const k = data?.kpis;
  const m = data?.matching;
  const maxCity = Math.max(1, ...(data?.requests_by_city || []).map((c) => c.count));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="adm-mob-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Mobilité · Dashboard</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {err ? <Card><Txt color={colors.danger}>{err}</Txt></Card> : null}

        {/* CTA anti-ghost */}
        <Pressable onPress={() => router.push("/admin/mobility/ghost-rides" as any)} style={styles.ghostCta} testID="adm-mob-ghost-cta">
          <View style={styles.ghostIcon}>
            <Ionicons name="shield-checkmark" size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt weight="700" color={colors.white}>Trajets Jokoo Vérifié</Txt>
            <Txt size="xs" color="rgba(255,255,255,0.85)">
              {k ? `${k.ghost_rides_active} actif(s) · ${k.unserved_requests} demande(s) sans conducteur` : "Publier des trajets officiels (anti-ghost)"}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.white} />
        </Pressable>

        {/* KPIs */}
        <View style={styles.grid}>
          <Kpi icon="hand-right" label="Demandes ouvertes" value={k?.requests_open} color={colors.turquoise} />
          <Kpi icon="car-sport" label="Trajets actifs" value={k?.rides_active} color={colors.midnight} />
          <Kpi icon="paper-plane" label="Offres en attente" value={k?.offers_pending} color={colors.info} />
          <Kpi icon="checkmark-done" label="Réservations 7 j" value={k?.bookings_last_7d} color={colors.success} />
          <Kpi icon="flash" label="Demandes 24 h" value={k?.requests_last_24h} color={colors.warning} />
          <Kpi icon="alert-circle" label="Sans conducteur" value={k?.unserved_requests} color={colors.danger} />
        </View>

        {/* Matching */}
        <Card>
          <Txt weight="700">Performance du matching (7 jours)</Txt>
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
            <RateBox label="Taux de matching" value={m ? pct(m.match_rate_7d) : "—"} sub={m ? `${m.requests_with_offer_7d}/${m.requests_7d} demandes avec offre` : ""} />
            <RateBox label="Taux d'acceptation" value={m ? pct(m.accept_rate_7d) : "—"} sub={m ? `${m.offers_accepted_7d}/${m.offers_7d} offres acceptées` : ""} />
          </View>
        </Card>

        {/* Demandes sans conducteur */}
        <Card>
          <Txt weight="700">Demandes sans conducteur</Txt>
          <Txt size="xs" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
            Publiez un trajet Jokoo Vérifié sur ces axes pour les servir.
          </Txt>
          {(data?.unserved || []).length === 0 ? (
            <Txt size="sm" color={colors.textMuted}>Aucune demande en attente 🎉</Txt>
          ) : (
            (data?.unserved || []).map((r) => (
              <View key={r.id} style={styles.row}>
                <Ionicons name="navigate" size={16} color={colors.turquoise} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Txt size="sm" weight="700">{cap(r.from_city)} → {cap(r.to_city)}</Txt>
                  <Txt size="xxs" color={colors.textMuted}>
                    {r.date} · {r.time_from}{r.time_to ? `–${r.time_to}` : ""} · {r.seats || 1} place(s)
                    {r.budget_xof ? ` · budget ${r.budget_xof.toLocaleString("fr-FR")} F` : ""}
                  </Txt>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* Axes les plus demandés */}
        <Card>
          <Txt weight="700">Axes les plus demandés (30 j)</Txt>
          {(data?.top_request_routes || []).length === 0 ? (
            <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6 }}>Pas encore de données.</Txt>
          ) : (
            (data?.top_request_routes || []).map((r, i) => (
              <View key={`${r.from_city}-${r.to_city}-${i}`} style={styles.row}>
                <Txt size="xs" weight="700" color={colors.textSubtle} style={{ width: 20 }}>{i + 1}</Txt>
                <Txt size="sm" weight="600" style={{ flex: 1 }}>{cap(r.from_city)} → {cap(r.to_city)}</Txt>
                <View style={styles.countPill}><Txt size="xxs" weight="700" color={colors.turquoise}>{r.count}</Txt></View>
              </View>
            ))
          )}
        </Card>

        {/* Demandes par ville */}
        <Card>
          <Txt weight="700">Demandes par ville (30 j)</Txt>
          {(data?.requests_by_city || []).length === 0 ? (
            <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6 }}>Pas encore de données.</Txt>
          ) : (
            (data?.requests_by_city || []).map((c) => (
              <View key={c.city} style={{ marginTop: spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Txt size="sm" weight="600">{cap(c.city)}</Txt>
                  <Txt size="xs" color={colors.textMuted}>{c.count}</Txt>
                </View>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${Math.max(6, (c.count / maxCity) * 100)}%` }]} />
                </View>
              </View>
            ))
          )}
        </Card>

        {/* Offre conducteurs */}
        <Card>
          <Txt weight="700">Trajets actifs par axe</Txt>
          {(data?.top_ride_routes || []).length === 0 ? (
            <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6 }}>Aucun trajet actif.</Txt>
          ) : (
            (data?.top_ride_routes || []).map((r, i) => (
              <View key={`${r.from_city}-${r.to_city}-${i}`} style={styles.row}>
                <Ionicons name="car-outline" size={15} color={colors.textMuted} />
                <Txt size="sm" weight="600" style={{ flex: 1, marginLeft: 10 }}>{cap(r.from_city)} → {cap(r.to_city)}</Txt>
                <View style={styles.countPill}><Txt size="xxs" weight="700" color={colors.turquoise}>{r.count}</Txt></View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

function Kpi({ icon, label, value, color }: { icon: any; label: string; value?: number; color: string }) {
  return (
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Txt size="lg" weight="700" style={{ marginTop: 6 }}>{value ?? "—"}</Txt>
      <Txt size="xxs" color={colors.textMuted}>{label}</Txt>
    </View>
  );
}

function RateBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.rate}>
      <Txt size="xl" weight="800" color={colors.turquoise}>{value}</Txt>
      <Txt size="xs" weight="600" style={{ marginTop: 2 }}>{label}</Txt>
      {sub ? <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>{sub}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  ghostCta: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.midnight, ...shadow.card },
  ghostIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpi: { width: "31%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
  kpiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rate: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  countPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: `${"#18C6A3"}18` },
  barBg: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, marginTop: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3, backgroundColor: colors.turquoise },
});
