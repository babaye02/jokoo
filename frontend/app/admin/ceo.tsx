// Cockpit CEO — santé de l'entreprise en 30 secondes.
// Feu tricolore global + 3 chiffres clés, puis Finance / Croissance /
// Opérations / Qualité / Mobilité. Source : GET /admin/ceo/dashboard.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { hasPerm, isStaff } from "@/src/perms";
import { Card, ErrorBox, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Health = { status: "ok" | "warn" | "crit"; reason: string };
type Dash = {
  generated_at: string;
  health: { overall: "ok" | "warn" | "crit"; domains: Record<string, Health> };
  finance: {
    gmv_30d_xof: number; revenue_30d_xof: number; take_rate: number;
    gmv_breakdown: { services: number; rides: number; parcels: number };
    revenue_breakdown: { commissions: number; jokoo_pro: number };
    wallet_float_xof: number; wallet_debt_xof: number; wallet_debtors: number;
    recharges_30d_xof: number; recharges_30d_count: number; jokoo_pro_active: number;
  };
  growth: {
    users_total: number; new_24h: number; new_7d: number; new_prev_7d: number; new_30d: number;
    signups_daily: { day: string; count: number }[];
    ambassadors_active: number; referrals_total: number;
  };
  operations: {
    bookings_7d: number; bookings_30d: number; bookings_pending: number;
    completion_rate_30d: number; providers_total: number; providers_active_30d: number;
    queues: Record<string, number>; queues_total: number;
  };
  quality: { avg_rating_30d: number | null; reviews_30d: number; cancel_rate_30d: number; contact_flags_7d: number };
  mobility: { requests_open: number; match_rate_7d: number; rides_active: number; ghost_rides_active: number };
};

const HEALTH_COLORS = { ok: "#16A34A", warn: "#F59E0B", crit: "#DC2626" } as const;
const HEALTH_LABELS = { ok: "Tout va bien", warn: "À surveiller", crit: "Action requise" } as const;
const DOMAIN_LABELS: Record<string, string> = {
  finance: "Finance", growth: "Croissance", operations: "Opérations",
  quality: "Qualité", mobility: "Mobilité",
};
const QUEUE_LABELS: Record<string, string> = {
  kyc_pending: "KYC à valider", reports_open: "Signalements", refunds_pending: "Remboursements",
  withdrawals_pending: "Retraits", service_suggestions: "Suggestions de services",
};

const F = (n?: number) => (n ?? 0).toLocaleString("fr-FR");
const pct = (v?: number) => `${Math.round((v || 0) * 100)}%`;

export default function CeoDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [d, setD] = useState<Dash | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await api.get<Dash>("/admin/ceo/dashboard"));
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

  const overall = d?.health.overall || "ok";
  const hc = HEALTH_COLORS[overall];
  const maxSignup = Math.max(1, ...(d?.growth.signups_daily || []).map((s) => s.count));
  const growthDelta = d ? d.growth.new_7d - d.growth.new_prev_7d : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="ceo-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Cockpit CEO</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <ErrorBox text={err} />

        {/* Feu tricolore global + domaines */}
        <View style={[styles.healthBanner, { backgroundColor: hc }]} testID="ceo-health">
          <Ionicons
            name={overall === "ok" ? "checkmark-circle" : overall === "warn" ? "alert-circle" : "warning"}
            size={30}
            color={colors.white}
          />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt size="lg" weight="800" color={colors.white}>{HEALTH_LABELS[overall]}</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {Object.entries(d?.health.domains || {}).map(([k, h]) => (
                <View key={k} style={styles.domainChip}>
                  <View style={[styles.dot, { backgroundColor: HEALTH_COLORS[h.status] }]} />
                  <Txt size="xxs" weight="700" color={colors.white}>{DOMAIN_LABELS[k] || k}</Txt>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Les 3 chiffres */}
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Hero label="GMV 30 j" value={`${F(d?.finance.gmv_30d_xof)} F`} />
          <Hero label="Revenu 30 j" value={`${F(d?.finance.revenue_30d_xof)} F`} sub={`take rate ${d ? (d.finance.take_rate * 100).toFixed(1) : "—"} %`} />
          <Hero
            label="Inscrits 7 j"
            value={F(d?.growth.new_7d)}
            sub={`${growthDelta >= 0 ? "+" : ""}${growthDelta} vs préc.`}
            subColor={growthDelta >= 0 ? "#BBF7D0" : "#FECACA"}
          />
        </View>

        {/* Finance */}
        <Section title="💰 Finance" reason={d?.health.domains.finance?.reason}>
          <Row label="GMV services / covoit. / colis" value={`${F(d?.finance.gmv_breakdown.services)} · ${F(d?.finance.gmv_breakdown.rides)} · ${F(d?.finance.gmv_breakdown.parcels)} F`} />
          <Row label="Commissions cash 30 j" value={`${F(d?.finance.revenue_breakdown.commissions)} F`} />
          <Row label="Abonnements Jokoo Pro" value={`${F(d?.finance.revenue_breakdown.jokoo_pro)} F · ${d?.finance.jokoo_pro_active ?? 0} actif(s)`} />
          <Row label="Float wallet (soldes positifs)" value={`${F(d?.finance.wallet_float_xof)} F`} />
          <Row label="Dette wallet" value={`${F(d?.finance.wallet_debt_xof)} F · ${d?.finance.wallet_debtors ?? 0} débiteur(s)`} warn={(d?.finance.wallet_debt_xof || 0) > 0} />
          <Row label="Recharges 30 j" value={`${F(d?.finance.recharges_30d_xof)} F (${d?.finance.recharges_30d_count ?? 0})`} />
        </Section>

        {/* Croissance */}
        <Section title="📈 Croissance" reason={d?.health.domains.growth?.reason}>
          <Row label="Utilisateurs total" value={F(d?.growth.users_total)} />
          <Row label="Nouveaux 24 h / 7 j / 30 j" value={`${F(d?.growth.new_24h)} / ${F(d?.growth.new_7d)} / ${F(d?.growth.new_30d)}`} />
          <View style={styles.sparkRow}>
            {(d?.growth.signups_daily || []).map((s) => (
              <View key={s.day} style={styles.sparkCol}>
                <View style={[styles.sparkBar, { height: Math.max(4, (s.count / maxSignup) * 48) }]} />
                <Txt size="xxs" color={colors.textSubtle} style={{ marginTop: 3 }}>{s.day}</Txt>
              </View>
            ))}
          </View>
          <Row label="Ambassadeurs actifs / filleuls" value={`${F(d?.growth.ambassadors_active)} / ${F(d?.growth.referrals_total)}`} />
        </Section>

        {/* Opérations */}
        <Section title="⚙️ Opérations" reason={d?.health.domains.operations?.reason}>
          <Row label="Réservations 7 j / 30 j" value={`${F(d?.operations.bookings_7d)} / ${F(d?.operations.bookings_30d)}`} />
          <Row label="Taux de complétion 30 j" value={pct(d?.operations.completion_rate_30d)} warn={(d?.operations.completion_rate_30d || 1) < 0.6} />
          <Row label="En attente de réponse pro" value={F(d?.operations.bookings_pending)} />
          <Row label="Prestataires actifs 30 j" value={`${F(d?.operations.providers_active_30d)} / ${F(d?.operations.providers_total)}`} />
          <Txt size="xs" weight="700" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
            FILES D&apos;ATTENTE ADMIN ({F(d?.operations.queues_total)})
          </Txt>
          {Object.entries(d?.operations.queues || {}).map(([k, v]) => (
            <Row key={k} label={QUEUE_LABELS[k] || k} value={F(v)} warn={v > 0} />
          ))}
        </Section>

        {/* Qualité */}
        <Section title="⭐ Qualité" reason={d?.health.domains.quality?.reason}>
          <Row label="Note moyenne 30 j" value={d?.quality.avg_rating_30d != null ? `${d.quality.avg_rating_30d} / 5 (${d.quality.reviews_30d} avis)` : "—"} warn={d?.quality.avg_rating_30d != null && d.quality.avg_rating_30d < 4} />
          <Row label="Taux d'annulation 30 j" value={pct(d?.quality.cancel_rate_30d)} warn={(d?.quality.cancel_rate_30d || 0) > 0.25} />
          <Row label="Tentatives de contournement 7 j" value={F(d?.quality.contact_flags_7d)} warn={(d?.quality.contact_flags_7d || 0) > 0} />
        </Section>

        {/* Mobilité */}
        <Section title="🚗 Mobilité" reason={d?.health.domains.mobility?.reason}>
          <Row label="Demandes ouvertes" value={F(d?.mobility.requests_open)} />
          <Row label="Taux de matching 7 j" value={pct(d?.mobility.match_rate_7d)} warn={(d?.mobility.match_rate_7d || 1) < 0.3} />
          <Row label="Trajets actifs (dont Jokoo Vérifié)" value={`${F(d?.mobility.rides_active)} (${F(d?.mobility.ghost_rides_active)})`} />
        </Section>

        {d ? (
          <Txt size="xxs" color={colors.textSubtle} style={{ textAlign: "center" }}>
            Généré {new Date(d.generated_at).toLocaleTimeString("fr-FR")} · tirez pour actualiser
          </Txt>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Hero({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <View style={styles.hero}>
      <Txt size="xxs" weight="700" color="rgba(255,255,255,0.7)">{label.toUpperCase()}</Txt>
      <Txt size="md" weight="800" color={colors.white} numberOfLines={1} adjustsFontSizeToFit>{value}</Txt>
      {sub ? <Txt size="xxs" color={subColor || "rgba(255,255,255,0.7)"}>{sub}</Txt> : null}
    </View>
  );
}

function Section({ title, reason, children }: { title: string; reason?: string; children: React.ReactNode }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt weight="700">{title}</Txt>
        {reason ? <Txt size="xxs" color={colors.textSubtle}>{reason}</Txt> : null}
      </View>
      <View style={{ marginTop: spacing.sm }}>{children}</View>
    </Card>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.row}>
      <Txt size="sm" color={colors.textMuted} style={{ flex: 1 }}>{label}</Txt>
      <Txt size="sm" weight="700" color={warn ? "#B45309" : colors.text}>{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  healthBanner: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderRadius: radius.lg, ...shadow.card },
  domainChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)" },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  hero: { flex: 1, backgroundColor: colors.midnight, borderRadius: radius.lg, padding: spacing.md, ...shadow.card },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  sparkRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginVertical: spacing.sm },
  sparkCol: { flex: 1, alignItems: "center" },
  sparkBar: { width: "70%", borderRadius: 4, backgroundColor: colors.turquoise },
});
