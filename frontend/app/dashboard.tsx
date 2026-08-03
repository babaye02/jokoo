// Provider Dashboard — Premium business control center
// Inspired by Stripe, Uber Driver, Airbnb Host, Revolut Business.
// Preserves ALL backend interactions (accept/reject/complete/quote/subscribe).

import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
  Platform,
  TextInput,
  Text,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { api, Booking } from "@/src/api";
import { useAuth } from "@/src/auth";
import { bookingPriceLabel, formatXof } from "@/src/pricing";
import { Btn, Card, Avatar } from "@/src/components/ui";
import { colors, shadow, spacing } from "@/src/theme";

type Dash = {
  total_bookings: number;
  pending: number;
  accepted: number;
  completed: number;
  revenue_xof: number;
  rating: number;
  reviews_count: number;
  subscription_active: boolean;
  subscription_until: string | null;
  recent_bookings: Booking[];
};

// Helpers
const isToday = (d: string) => { try { return new Date(d).toDateString() === new Date().toDateString(); } catch { return false; } };
const isWithinDays = (d: string, days: number) => { try { const t = new Date(d).getTime(); const now = Date.now(); return now - t <= days * 86400_000 && t <= now; } catch { return false; } };
const greeting = () => { const h = new Date().getHours(); if (h < 12) return "Bonjour"; if (h < 18) return "Bon après-midi"; return "Bonsoir"; };

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  try {
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 172800) return "hier";
    return `il y a ${Math.floor(s / 86400)} j`;
  } catch { return ""; }
}

const ACTIVITY_META: Record<string, { icon: any; tint: string }> = {
  mission_completed: { icon: "checkmark-done", tint: "#059669" },
  payment_received:  { icon: "cash",           tint: "#7C3AED" },
  review_received:   { icon: "star",           tint: "#F59E0B" },
  achievement:       { icon: "rocket",         tint: "#0EA5E9" },
};

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [dash, setDash] = useState<Dash | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, string>>({});
  const [showProBanner, setShowProBanner] = useState(true);
  const [online, setOnline] = useState(true);
  const [chartRange, setChartRange] = useState<"week" | "month" | "year">("week");
  const [history, setHistory] = useState<{ label: string; amount: number }[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [activity, setActivity] = useState<{ id: string; type: string; title: string; subtitle: string; amount?: number; at?: string }[]>([]);

  const load = useCallback(async () => {
    try { setDash(await api.get<Dash>("/dashboard")); }
    catch (e: any) { Alert.alert("Erreur", e.message); }
  }, []);

  const loadHistory = useCallback(async (range: "week" | "month" | "year") => {
    try {
      const r = await api.get<{ buckets: { label: string; amount: number }[]; total: number }>(`/dashboard/revenue-history?range=${range}`);
      setHistory(r.buckets || []);
      setHistoryTotal(r.total || 0);
    } catch { /* silent */ }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const r = await api.get<{ items: any[] }>("/dashboard/activity?limit=8");
      setActivity(r.items || []);
    } catch { /* silent */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); loadActivity(); loadHistory(chartRange); }, [load, loadActivity, loadHistory, chartRange]));

  const accept = async (id: string) => { await api.patch(`/bookings/${id}`, { status: "accepted" }); load(); };
  const reject = async (id: string) => { await api.patch(`/bookings/${id}`, { status: "rejected" }); load(); };
  const complete = async (id: string) => { await api.patch(`/bookings/${id}`, { status: "completed" }); load(); };
  const sendQuote = async (id: string) => {
    const amt = parseFloat(quoteDrafts[id] || "0");
    if (!amt || amt < 500) { Alert.alert("Devis invalide", "Indiquez un montant en FCFA (minimum 500 F)."); return; }
    try {
      await api.patch(`/bookings/${id}`, { quote_amount: amt, status: "accepted" });
      setQuoteDrafts((d) => ({ ...d, [id]: "" }));
      load();
      Alert.alert("Devis envoyé", `Devis de ${formatXof(amt)} envoyé au client.`);
    } catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  const subscribe = async (provider: "card" | "wave" | "orange" = "card") => {
    setPaying(true);
    try {
      const endpoint = provider === "card" ? "/payments/checkout/subscription" : provider === "wave" ? "/payments/wave/checkout/subscription" : "/payments/orange/checkout/subscription";
      const r = await api.post<{ url: string }>(endpoint, { plan: "monthly" });
      if (Platform.OS === "web") window.location.assign(r.url);
      else await WebBrowser.openBrowserAsync(r.url);
    } catch (e: any) { Alert.alert("Paiement indisponible", e.message); }
    finally { setPaying(false); }
  };

  const chooseSubMethod = () => {
    Alert.alert("S'abonner à Jokoo Pro", "15 000 F CFA / mois. Choisissez un moyen de paiement.", [
      { text: "Carte bancaire", onPress: () => subscribe("card") },
      { text: "Wave", onPress: () => subscribe("wave") },
      { text: "Orange Money", onPress: () => subscribe("orange") },
      { text: "Annuler", style: "cancel" },
    ]);
  };

  // ─── Derived metrics ───
  const metrics = useMemo(() => {
    if (!dash) return null;
    const rb = dash.recent_bookings || [];
    const completed = rb.filter((b) => b.status === "completed");
    const todayCompleted = completed.filter((b) => isToday(b.created_at));
    const weekCompleted = completed.filter((b) => isWithinDays(b.created_at, 7));
    const monthCompleted = completed.filter((b) => isWithinDays(b.created_at, 30));
    const sum = (arr: Booking[]) => arr.reduce((a, b) => a + (b.price || b.quote_amount || 0), 0);
    const upcoming = rb.filter((b) => b.status === "accepted");
    const acceptanceDenom = dash.accepted + dash.completed + dash.pending;
    const acceptRate = acceptanceDenom > 0 ? Math.round(((dash.accepted + dash.completed) / acceptanceDenom) * 100) : 100;
    // Response rate — mocked based on pending count trend
    const responseRate = dash.pending === 0 ? 100 : Math.max(80, 100 - dash.pending * 5);
    // Cancellation rate approx
    const cancelRate = Math.max(0, 100 - acceptRate);
    return {
      todayEarnings: sum(todayCompleted),
      weekEarnings: sum(weekCompleted) || dash.revenue_xof,
      monthEarnings: sum(monthCompleted) || dash.revenue_xof,
      upcomingCount: upcoming.length,
      completedCount: dash.completed,
      rating: dash.rating,
      reviewsCount: dash.reviews_count,
      acceptRate,
      responseRate,
      cancelRate,
      upcoming,
    };
  }, [dash]);

  if (!dash || !metrics) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.textMuted }}>Chargement…</Text></View>;
  }

  // Chart data (real)
  const chartMax = Math.max(1, ...history.map((h) => h.amount || 0));
  const chartBars = history.length > 0 ? history.map((h) => (h.amount || 0) / chartMax) : [0, 0, 0, 0, 0, 0, 0];
  const chartLabels = history.length > 0 ? history.map((h) => h.label) : ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Top bar */}
      <SafeAreaView edges={["top"]} style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
        <Text style={styles.topTitle}>Espace pro</Text>
        <Pressable onPress={() => router.push("/(tabs)/notifications")} style={styles.iconBtn}>
          <Ionicons name="notifications-outline" size={20} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER : greeting ── */}
        <View style={styles.hero}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Avatar uri={user?.avatar} name={user?.name} size={54} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.heroOverline}>{greeting()},</Text>
              <Text style={styles.heroTitle} numberOfLines={1}>{(user?.name || "Ami").split(" ")[0]} 👋</Text>
            </View>
            <Pressable onPress={() => setOnline((v) => !v)} style={[styles.statusPill, online ? styles.statusOn : styles.statusOff]}>
              <View style={[styles.statusDot, { backgroundColor: online ? "#22C55E" : "#6B7280" }]} />
              <Text style={[styles.statusTxt, { color: online ? "#065F46" : "#4B5563" }]}>{online ? "En ligne" : "Hors ligne"}</Text>
            </Pressable>
          </View>
        </View>

        {/* ── REVENUE HERO CARD (dark gradient) ── */}
        <View style={styles.revenueCard}>
          <LinearGradient colors={["#0B1F3A", "#1F3A5E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.revenueOverline}>Revenus aujourd&apos;hui</Text>
          <Text style={styles.revenueBig}>{formatXof(metrics.todayEarnings)}</Text>
          <View style={styles.revenueRow}>
            <View style={styles.revenueCell}>
              <Text style={styles.revenueCellLabel}>Cette semaine</Text>
              <Text style={styles.revenueCellValue}>{formatXof(metrics.weekEarnings)}</Text>
            </View>
            <View style={styles.revenueDivider} />
            <View style={styles.revenueCell}>
              <Text style={styles.revenueCellLabel}>Ce mois</Text>
              <Text style={styles.revenueCellValue}>{formatXof(metrics.monthEarnings)}</Text>
            </View>
          </View>
        </View>

        {/* ── KPI GRID (4 cards) ── */}
        <View style={styles.kpiGrid}>
          <KpiCard icon="calendar-outline" tint="#0EA5E9" label="Missions à venir" value={String(metrics.upcomingCount)} />
          <KpiCard icon="checkmark-done-outline" tint="#059669" label="Terminées" value={String(metrics.completedCount)} />
          <KpiCard icon="star" tint="#F59E0B" label="Note moyenne" value={metrics.rating.toFixed(1)} sub={`${metrics.reviewsCount} avis`} />
          <KpiCard icon="hourglass-outline" tint="#D97706" label="En attente" value={String(dash.pending)} />
        </View>

        {/* ── JOKOO PRO BANNER (compact) ── */}
        {!dash.subscription_active && showProBanner ? (
          <View style={styles.proBanner}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.proBadge}>PRO</Text>
                <Text style={styles.proTitle}>Jokoo Pro</Text>
              </View>
              <Text style={styles.proSub}>15 000 F CFA / mois · Priorité, badge vérifié, stats avancées</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
                <Pressable onPress={chooseSubMethod} disabled={paying} style={styles.proCta}>
                  <Ionicons name="rocket" size={13} color={colors.white} />
                  <Text style={styles.proCtaTxt}>{paying ? "…" : "S'abonner"}</Text>
                </Pressable>
                <Pressable onPress={() => setShowProBanner(false)} hitSlop={6}>
                  <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: "600" }}>Plus tard</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.proIcon}>
              <Text style={{ fontSize: 36 }}>✨</Text>
            </View>
          </View>
        ) : dash.subscription_active ? (
          <View style={styles.proActive}>
            <Ionicons name="shield-checkmark" size={20} color="#059669" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Jokoo Pro actif</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Valide jusqu&apos;au {dash.subscription_until?.slice(0, 10)}</Text>
            </View>
          </View>
        ) : null}

        {/* ── REVENUE CHART ── */}
        <View style={styles.chartCard}>
          <View style={styles.chartHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.overline}>Évolution</Text>
              <Text style={styles.sectionTitle}>
                {chartRange === "week" ? "Revenus · 7 jours" : chartRange === "month" ? "Revenus · 4 semaines" : "Revenus · 12 mois"}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                Total : {formatXof(historyTotal)}
              </Text>
            </View>
            <View style={styles.chartTabs}>
              {(["week", "month", "year"] as const).map((k) => (
                <Pressable key={k} onPress={() => setChartRange(k)} style={[styles.chartTab, chartRange === k && styles.chartTabActive]}>
                  <Text style={[styles.chartTabTxt, chartRange === k && { color: colors.white }]}>
                    {k === "week" ? "S" : k === "month" ? "M" : "A"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.chart}>
            {chartBars.map((v, i) => (
              <View key={i} style={styles.chartCol}>
                <View style={{ flex: 1, justifyContent: "flex-end", width: "100%", alignItems: "center" }}>
                  <View style={[styles.chartBar, { height: `${Math.max(4, Math.round(v * 100))}%` }]} />
                </View>
                <Text style={styles.chartLbl}>{chartLabels[i]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── PERFORMANCE RINGS ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.overline}>Performance</Text>
          <Text style={styles.sectionTitle}>Vos indicateurs</Text>
          <View style={styles.ringsRow}>
            <PerfRing pct={Math.min(100, Math.round(metrics.rating * 20))} label="Note" value={`${metrics.rating.toFixed(1)}/5`} tint="#F59E0B" />
            <PerfRing pct={metrics.responseRate} label="Réponse" value={`${metrics.responseRate}%`} tint="#0EA5E9" />
            <PerfRing pct={metrics.acceptRate} label="Acceptation" value={`${metrics.acceptRate}%`} tint="#059669" />
          </View>
          <View style={styles.ringsRow}>
            <StatRow icon="checkmark-done-outline" tint="#059669" label="Taux de complétion" value={`${100 - metrics.cancelRate}%`} />
            <StatRow icon="close-outline" tint="#DC2626" label="Annulations" value={`${metrics.cancelRate}%`} />
          </View>
        </View>

        {/* ── QUICK ACTIONS ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.overline}>Actions rapides</Text>
          <Text style={styles.sectionTitle}>Que faire ?</Text>
          <View style={styles.actionsGrid}>
            <ActionBtn icon="power" tint={online ? "#059669" : "#6B7280"} bg={online ? "#D1FAE5" : "#F3F4F6"} label={online ? "En ligne" : "Hors ligne"} onPress={() => setOnline((v) => !v)} />
            <ActionBtn icon="calendar" tint="#0EA5E9" bg="#E0F2FE" label="Agenda" onPress={() => router.push("/my-services")} />
            <ActionBtn icon="wallet-outline" tint="#7C3AED" bg="#EDE9FE" label="Portefeuille" onPress={() => router.push("/profile/payments")} />
            <ActionBtn icon="cash-outline" tint="#F59E0B" bg="#FEF3C7" label="Retrait" onPress={() => Alert.alert("Bientôt", "Retraits automatiques disponibles prochainement.")} />
            <ActionBtn icon="chatbubbles-outline" tint="#00C2A8" bg="#CCFBF1" label="Messages" onPress={() => router.push("/(tabs)/notifications")} />
            <ActionBtn icon="help-circle-outline" tint="#4B5563" bg="#F3F4F6" label="Support" onPress={() => router.push("/legal")} />
          </View>
        </View>

        {/* ── UPCOMING MISSIONS ── */}
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }}>
            <View>
              <Text style={styles.overline}>Agenda</Text>
              <Text style={styles.sectionTitle}>Missions à venir</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textMuted }}>{metrics.upcomingCount}</Text>
          </View>
          {metrics.upcoming.length === 0 ? (
            <View style={styles.emptyMini}>
              <Ionicons name="calendar-outline" size={28} color={colors.textSubtle} />
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 6 }}>Aucune mission à venir</Text>
            </View>
          ) : (
            metrics.upcoming.slice(0, 3).map((b) => <UpcomingCard key={b.id} b={b} onComplete={() => complete(b.id)} />)
          )}
        </View>

        {/* ── REQUESTS (existing feature preserved) ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.overline}>Demandes récentes</Text>
          <Text style={styles.sectionTitle}>Nouvelles demandes</Text>
          {dash.recent_bookings.length === 0 ? (
            <View style={styles.emptyMini}>
              <Ionicons name="inbox-outline" size={28} color={colors.textSubtle} />
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 6 }}>Aucune demande</Text>
            </View>
          ) : (
            dash.recent_bookings.slice(0, 5).map((b) => {
              const needsQuote = b.status === "pending" && (b.price_type === "quote" || (b.price == null && b.quote_amount == null));
              return (
                <Card key={b.id} style={{ padding: spacing.md, marginTop: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>{b.client_name}</Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{b.date} · {b.time} · {b.address}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary, maxWidth: 110, textAlign: "right" }} numberOfLines={2}>
                      {bookingPriceLabel(b)}
                    </Text>
                  </View>
                  {b.description ? <Text style={{ fontSize: 13, color: colors.text, marginTop: 8, lineHeight: 18 }} numberOfLines={3}>{b.description}</Text> : null}
                  {needsQuote ? (
                    <View style={styles.quoteBox}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text, marginBottom: 8 }}>Envoyer un devis (FCFA)</Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TextInput keyboardType="numeric" placeholder="Ex : 25000" placeholderTextColor={colors.textSubtle} value={quoteDrafts[b.id] || ""} onChangeText={(v) => setQuoteDrafts((d) => ({ ...d, [b.id]: v }))} style={styles.quoteInput} testID={`quote-input-${b.id}`} />
                        <Pressable onPress={() => sendQuote(b.id)} style={styles.quoteBtn} testID={`quote-send-${b.id}`}>
                          <Ionicons name="send" size={14} color={colors.white} />
                          <Text style={{ color: colors.white, fontSize: 12, fontWeight: "700", marginLeft: 6 }}>Envoyer</Text>
                        </Pressable>
                      </View>
                      <Pressable onPress={() => reject(b.id)} style={{ alignSelf: "flex-end", marginTop: 8 }}>
                        <Text style={{ fontSize: 11, color: colors.danger, fontWeight: "700" }}>Refuser</Text>
                      </Pressable>
                    </View>
                  ) : b.status === "pending" ? (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                      <View style={{ flex: 1 }}><Btn title="Refuser" variant="secondary" onPress={() => reject(b.id)} testID={`reject-${b.id}`} /></View>
                      <View style={{ flex: 1 }}><Btn title="Accepter" onPress={() => accept(b.id)} testID={`accept-${b.id}`} /></View>
                    </View>
                  ) : b.status === "accepted" ? (
                    <Btn title="Marquer terminée" onPress={() => complete(b.id)} style={{ marginTop: 12 }} testID={`complete-${b.id}`} />
                  ) : null}
                </Card>
              );
            })
          )}
        </View>

        {/* ── LATEST ACTIVITY ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.overline}>Activité</Text>
          <Text style={styles.sectionTitle}>Dernières activités</Text>
          {activity.length === 0 ? (
            <View style={styles.emptyMini}>
              <Ionicons name="pulse-outline" size={28} color={colors.textSubtle} />
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 6 }}>Pas encore d&apos;activité</Text>
            </View>
          ) : (
            <View style={{ marginTop: 12, gap: 12 }}>
              {activity.slice(0, 6).map((a) => {
                const meta = ACTIVITY_META[a.type] || ACTIVITY_META.mission_completed;
                return (
                  <ActivityRow
                    key={a.id}
                    icon={meta.icon}
                    tint={meta.tint}
                    title={a.title}
                    sub={`${a.subtitle}${a.amount ? ` · ${formatXof(a.amount)}` : ""}${a.at ? ` · ${timeAgo(a.at)}` : ""}`}
                  />
                );
              })}
            </View>
          )}
        </View>

        {/* ── ACHIEVEMENTS ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.overline}>Trophées</Text>
          <Text style={styles.sectionTitle}>Vos accomplissements</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginTop: 8, paddingRight: spacing.xl }}>
            <Achievement icon="ribbon" tint="#F59E0B" label="1re mission" unlocked />
            <Achievement icon="medal" tint="#0EA5E9" label="10 missions" unlocked={metrics.completedCount >= 10} />
            <Achievement icon="trophy" tint="#7C3AED" label="50 missions" unlocked={metrics.completedCount >= 50} />
            <Achievement icon="star" tint="#EA580C" label="5 étoiles" unlocked={metrics.rating >= 4.9} />
            <Achievement icon="flame" tint="#DC2626" label="Top pro" unlocked={metrics.acceptRate >= 95} />
          </ScrollView>
        </View>

        {/* ── TIPS FOOTER ── */}
        <View style={styles.tipsCard}>
          <View style={styles.tipsIcon}>
            <Text style={{ fontSize: 22 }}>💡</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Astuce pour gagner plus</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 }}>
              Complétez 3 missions de plus cette semaine et débloquez un bonus de 5 000 F CFA.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Building blocks ────────────────────────────────────
function KpiCard({ icon, tint, label, value, sub }: { icon: any; tint: string; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function PerfRing({ pct, label, value, tint }: { pct: number; label: string; value: string; tint: string }) {
  const clamp = Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.ringWrap}>
      <View style={styles.ringOuter}>
        <View style={[styles.ringInner, { borderColor: tint, opacity: 0.14 }]} />
        <View style={[styles.ringInner, { borderColor: tint, borderTopColor: "transparent", transform: [{ rotate: `${(clamp / 100) * 360 - 90}deg` }] }]} />
        <View style={styles.ringCenter}>
          <Text style={styles.ringValue}>{value}</Text>
        </View>
      </View>
      <Text style={styles.ringLabel}>{label}</Text>
    </View>
  );
}

function StatRow({ icon, tint, label, value }: { icon: any; tint: string; label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <View style={[styles.statIco, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={14} color={tint} />
      </View>
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={{ fontSize: 11, color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", fontWeight: "600" }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 2 }}>{value}</Text>
      </View>
    </View>
  );
}

function ActionBtn({ icon, tint, bg, label, onPress }: { icon: any; tint: string; bg: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.actionBtn}>
      <View style={[styles.actionIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function UpcomingCard({ b, onComplete }: { b: Booking; onComplete: () => void }) {
  return (
    <View style={styles.upCard}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }} numberOfLines={1}>{b.client_name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
            <Ionicons name="time-outline" size={11} color={colors.textMuted} />
            <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: 4 }}>{b.date} · {b.time}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
            <Ionicons name="location-outline" size={11} color={colors.textMuted} />
            <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: 4, flex: 1 }} numberOfLines={1}>{b.address}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }} numberOfLines={1}>{bookingPriceLabel(b)}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Pressable onPress={onComplete} style={[styles.upQuickBtn, { backgroundColor: "#059669" }]}>
          <Ionicons name="checkmark-done" size={13} color={colors.white} />
          <Text style={styles.upQuickTxt}>Terminer</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ActivityRow({ icon, tint, title, sub }: { icon: any; tint: string; title: string; sub: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={[styles.actIco, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={14} color={tint} />
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>{title}</Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{sub}</Text>
      </View>
    </View>
  );
}

function Achievement({ icon, tint, label, unlocked }: { icon: any; tint: string; label: string; unlocked?: boolean }) {
  return (
    <View style={[styles.achievement, !unlocked && { opacity: 0.4 }]}>
      <View style={[styles.achIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={24} color={tint} />
      </View>
      <Text style={styles.achLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ─── STYLES ────────────────────────────────────────────
const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, paddingTop: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  topTitle: { fontSize: 14, fontWeight: "700", color: colors.text, letterSpacing: -0.1 },

  overline: { fontSize: 11, letterSpacing: 1.6, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase" },
  sectionTitle: { fontFamily: "InstrumentSerif", fontSize: 22, lineHeight: 26, letterSpacing: -0.3, color: colors.text, marginTop: 2 },

  // Hero
  hero: {},
  heroOverline: { fontSize: 12, color: colors.textMuted },
  heroTitle: { fontFamily: "InstrumentSerif", fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: colors.text, marginTop: 2 },

  statusPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, height: 32, borderRadius: 999 },
  statusOn: { backgroundColor: "#D1FAE5" },
  statusOff: { backgroundColor: "#F3F4F6" },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusTxt: { fontSize: 11, fontWeight: "700", letterSpacing: -0.1 },

  // Revenue card
  revenueCard: { borderRadius: 24, padding: 22, overflow: "hidden", position: "relative", ...shadow.card },
  revenueOverline: { fontSize: 11, letterSpacing: 1.6, color: "rgba(255,255,255,0.72)", fontWeight: "700", textTransform: "uppercase" },
  revenueBig: { fontFamily: "InstrumentSerif", fontSize: 40, lineHeight: 44, letterSpacing: -1, color: colors.white, marginTop: 6 },
  revenueRow: { flexDirection: "row", marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)" },
  revenueCell: { flex: 1 },
  revenueCellLabel: { fontSize: 11, color: "rgba(255,255,255,0.72)", fontWeight: "600" },
  revenueCellValue: { fontSize: 14, fontWeight: "700", color: colors.white, marginTop: 3 },
  revenueDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.14)", marginHorizontal: 12 },

  // KPI grid
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: { width: "48%", backgroundColor: colors.white, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: colors.border, ...shadow.hairline },
  kpiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontFamily: "InstrumentSerif", fontSize: 26, lineHeight: 30, letterSpacing: -0.4, color: colors.text, marginTop: 8 },
  kpiLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontWeight: "600" },
  kpiSub: { fontSize: 10, color: colors.textSubtle, marginTop: 1 },

  // Pro banner
  proBanner: { flexDirection: "row", padding: 18, borderRadius: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: "#E9D5FF", ...shadow.hairline },
  proBadge: { fontSize: 10, fontWeight: "800", color: "#7C3AED", backgroundColor: "#EDE9FE", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, letterSpacing: 0.8, overflow: "hidden" },
  proTitle: { fontFamily: "InstrumentSerif", fontSize: 22, letterSpacing: -0.3, color: colors.text },
  proSub: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  proCta: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 34, borderRadius: 999, backgroundColor: colors.text },
  proCtaTxt: { fontSize: 12, fontWeight: "700", color: colors.white, marginLeft: 5, letterSpacing: -0.1 },
  proIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: "#F5F3FF", alignItems: "center", justifyContent: "center", alignSelf: "center" },
  proActive: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 20, backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: "#A7F3D0" },

  // Chart
  chartCard: { backgroundColor: colors.white, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.border, ...shadow.hairline },
  chartHead: { flexDirection: "row", alignItems: "flex-end", marginBottom: 14 },
  chartTabs: { flexDirection: "row", backgroundColor: "#F3F4F6", borderRadius: 999, padding: 3 },
  chartTab: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chartTabActive: { backgroundColor: colors.text },
  chartTabTxt: { fontSize: 11, fontWeight: "700", color: colors.text },
  chart: { height: 130, flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 4 },
  chartCol: { flex: 1, alignItems: "center", height: "100%" },
  chartBar: { width: "72%", backgroundColor: colors.primary, borderRadius: 6, minHeight: 4 },
  chartLbl: { fontSize: 10, fontWeight: "700", color: colors.textMuted, marginTop: 6 },

  // Sections
  sectionCard: { backgroundColor: colors.white, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.border, ...shadow.hairline },

  // Rings
  ringsRow: { flexDirection: "row", marginTop: 14, gap: 10 },
  ringWrap: { flex: 1, alignItems: "center" },
  ringOuter: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", position: "relative" },
  ringInner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 42, borderWidth: 6 },
  ringCenter: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  ringValue: { fontSize: 14, fontWeight: "800", color: colors.text, letterSpacing: -0.2 },
  ringLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginTop: 8, letterSpacing: -0.1 },
  statRow: { flex: 1, flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 12, backgroundColor: "#FAFAFA" },
  statIco: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  // Actions
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  actionBtn: { width: "30%", alignItems: "center" },
  actionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11, fontWeight: "700", color: colors.text, marginTop: 6, letterSpacing: -0.1 },

  // Upcoming
  upCard: { padding: 12, borderRadius: 16, backgroundColor: "#FAFAFA", marginTop: 10 },
  upQuickBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, height: 30, borderRadius: 999 },
  upQuickTxt: { fontSize: 11, fontWeight: "700", color: colors.white, marginLeft: 5, letterSpacing: -0.1 },

  emptyMini: { alignItems: "center", padding: 20 },

  // Quote box
  quoteBox: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: colors.border },
  quoteInput: { flex: 1, backgroundColor: colors.white, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, borderWidth: 1, borderColor: colors.border, color: colors.text, height: 40 },
  quoteBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.text, borderRadius: 10, paddingHorizontal: 14, height: 40 },

  // Activity
  actIco: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  // Achievements
  achievement: { width: 88, alignItems: "center", padding: 10, borderRadius: 16, backgroundColor: "#FAFAFA" },
  achIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  achLabel: { fontSize: 11, fontWeight: "700", color: colors.text, marginTop: 8, textAlign: "center", letterSpacing: -0.1 },

  // Tips
  tipsCard: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 20, backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A" },
  tipsIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
});
