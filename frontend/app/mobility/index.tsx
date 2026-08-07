// Mobility Hub — Jokoo (v2 marketplace)
// - Dual CTA : Publier un trajet (conducteur) / Publier une demande (passager)
// - Stats live : trajets actifs, demandes ouvertes, dernières 24h
// - Hot routes : axes les plus demandés (empty-state intelligent)
// - Accès rapides : mes trajets, mes demandes, colis, offres

import React, { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Txt, Badge } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { rideRequestsApi, MobilityStats, HotRoute } from "@/src/mobility/rideRequests";

export default function MobilityHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<MobilityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await rideRequestsApi.stats();
      setStats(s);
    } catch {
      // silent — home reste utilisable
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="mobility-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Txt size="xs" weight="700" color={colors.primary} style={{ letterSpacing: 1.6 }}>
            JOKOO MOBILITÉ
          </Txt>
          <Txt size="hero" weight="800" color={colors.text} style={{ letterSpacing: -0.5, marginTop: 2 }}>
            Bougez malin.
          </Txt>
        </View>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.turquoise}
          />
        }
      >
        {/* Live stats banner */}
        {loading && !stats ? (
          <View style={styles.statsBanner}>
            <ActivityIndicator color={colors.turquoise} />
          </View>
        ) : stats ? (
          <View style={styles.statsBanner}>
            <StatChip icon="car" label="Trajets actifs" value={stats.rides_active} tint="#0EA5E9" />
            <StatChip icon="hand-right" label="Demandes ouvertes" value={stats.requests_open} tint="#F97316" />
            <StatChip icon="pulse" label="Dernières 24h" value={stats.requests_last_24h} tint="#10B981" />
          </View>
        ) : null}

        <Txt size="xl" weight="800" style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
          Que souhaitez-vous faire ?
        </Txt>

        {/* Dual CTA — Publier trajet OU demande */}
        <View style={styles.dualCta}>
          <Pressable
            onPress={() => router.push("/mobility/rides/publish")}
            style={[styles.ctaCard]}
            testID="cta-publish-ride"
          >
            <LinearGradient colors={["#0B1F3A", "#123058"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.ctaInner}>
              <View style={styles.ctaEmoji}><Txt size="xxl">🚗</Txt></View>
              <Txt size="md" weight="800" color={colors.white} style={{ marginTop: 8 }}>Publier un trajet</Txt>
              <Txt size="xxs" color="rgba(255,255,255,0.75)" style={{ marginTop: 4, textAlign: "center" }}>
                Je conduis · Je propose mes places
              </Txt>
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push("/mobility/requests/publish")}
            style={styles.ctaCard}
            testID="cta-publish-request"
          >
            <LinearGradient colors={["#F97316", "#DC2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.ctaInner}>
              <View style={styles.ctaEmoji}><Txt size="xxl">🙋</Txt></View>
              <Txt size="md" weight="800" color={colors.white} style={{ marginTop: 8 }}>Publier une demande</Txt>
              <Txt size="xxs" color="rgba(255,255,255,0.85)" style={{ marginTop: 4, textAlign: "center" }}>
                Je cherche un trajet
              </Txt>
            </View>
          </Pressable>
        </View>

        {/* Hot routes */}
        {stats?.hot_routes && stats.hot_routes.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Txt size="lg" weight="700">Axes les plus demandés</Txt>
              <Badge tone="warning" icon="flame" label="chaud" size="sm" />
            </View>
            <View style={{ gap: 10 }}>
              {stats.hot_routes.slice(0, 5).map((r, i) => (
                <HotRouteRow key={`${r.from_city}-${r.to_city}-${i}`} route={r} onPress={() => {
                  router.push({
                    pathname: "/mobility/rides/publish",
                    params: { from: r.from_label, to: r.to_label },
                  });
                }} />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.emptyRoutes}>
            <Ionicons name="map-outline" size={30} color={colors.textMuted} />
            <Txt weight="700" style={{ marginTop: 8, textAlign: "center" }}>Soyez le premier à publier</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4, textAlign: "center", maxWidth: 240 }}>
              Aucune tendance encore. Lancez le mouvement en publiant une demande ou un trajet.
            </Txt>
          </View>
        )}

        {/* Livraison card */}
        <Pressable
          onPress={() => router.push("/mobility/delivery")}
          style={[styles.deliveryCard, shadow.card]}
          testID="mobility-livraison"
        >
          <LinearGradient colors={["#00C2A8", "#0EA5E9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.deliveryInner}>
            <View style={styles.emojiCircle}><Txt size="xxxl">📦</Txt></View>
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <Badge tone="top" icon="sparkles" label="Nouveau" size="sm" />
              <Txt size="lg" weight="800" color={colors.white} style={{ marginTop: 4 }}>Livraison de colis</Txt>
              <Txt size="xxs" color="rgba(255,255,255,0.85)" style={{ marginTop: 4 }} numberOfLines={2}>
                Longue distance via conducteurs covoiturage
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.white} />
          </View>
        </Pressable>

        {/* Quick actions grid */}
        <Txt size="lg" weight="700" style={{ marginTop: spacing.xxl, marginBottom: spacing.md }}>Mon activité</Txt>
        <View style={styles.qaGrid}>
          <QuickAction icon="car" label="Rechercher un trajet" hint="Passager" onPress={() => router.push("/mobility/rides")} testID="qa-search-rides" />
          <QuickAction icon="pin" label="Voir les demandes" hint="Conducteur" onPress={() => router.push("/mobility/requests")} testID="qa-see-requests" badge={stats?.requests_open} />
          <QuickAction icon="list" label="Mes trajets" hint="Publiés" onPress={() => router.push("/mobility/rides/mine")} testID="qa-my-rides" />
          <QuickAction icon="heart" label="Mes demandes" hint="Publiées" onPress={() => router.push("/mobility/requests/mine")} testID="qa-my-requests" />
          <QuickAction icon="paper-plane" label="Offres envoyées" hint="Conducteur" onPress={() => router.push("/mobility/offers/sent")} testID="qa-offers-sent" />
          <QuickAction icon="mail" label="Offres reçues" hint="Passager" onPress={() => router.push("/mobility/offers/received")} testID="qa-offers-received" badge={stats?.offers_pending} />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Subcomponents ───────────────────────────────────────────

function StatChip({ icon, label, value, tint }: { icon: any; label: string; value: number; tint: string }) {
  return (
    <View style={styles.statChip}>
      <View style={[styles.statIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Txt size="xxs" color={colors.textMuted} weight="700" style={{ letterSpacing: 0.5, marginTop: 6 }}>{label.toUpperCase()}</Txt>
      <Txt size="lg" weight="800" style={{ marginTop: 2, fontVariant: ["tabular-nums"] as any }}>{value}</Txt>
    </View>
  );
}

function HotRouteRow({ route, onPress }: { route: HotRoute; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.hotRow} testID={`hot-${route.from_city}-${route.to_city}`}>
      <View style={styles.hotBadge}>
        <Ionicons name="flame" size={14} color="#F97316" />
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Txt size="sm" weight="700">{route.from_label} → {route.to_label}</Txt>
        <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
          {route.count} demande{route.count > 1 ? "s" : ""}{route.next_date ? ` · dès le ${new Date(route.next_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}` : ""}
        </Txt>
      </View>
      <View style={styles.hotCta}>
        <Txt size="xxs" weight="800" color={colors.turquoise}>Publier ce trajet</Txt>
        <Ionicons name="chevron-forward" size={12} color={colors.turquoise} />
      </View>
    </Pressable>
  );
}

function QuickAction({ icon, label, hint, onPress, testID, badge }: { icon: any; label: string; hint: string; onPress: () => void; testID: string; badge?: number }) {
  return (
    <Pressable onPress={onPress} style={styles.qa} testID={testID}>
      <View style={styles.qaIcon}>
        <Ionicons name={icon} size={22} color={colors.turquoise} />
        {badge && badge > 0 ? (
          <View style={styles.qaBadge}>
            <Txt size="xxs" weight="800" color={colors.white}>{badge}</Txt>
          </View>
        ) : null}
      </View>
      <Txt size="sm" weight="700" style={{ marginTop: 8 }}>{label}</Txt>
      <Txt size="xxs" color={colors.textSubtle}>{hint}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  statsBanner: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    marginBottom: spacing.md,
  },
  statChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.soft,
  },
  statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  dualCta: { flexDirection: "row", gap: 12, marginBottom: spacing.xl },
  ctaCard: {
    flex: 1,
    height: 150,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.card,
  },
  ctaInner: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md },
  ctaEmoji: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.md },
  hotRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  hotBadge: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" },
  hotCta: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.brandTertiary },
  emptyRoutes: { padding: spacing.xl, alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
  deliveryCard: { height: 130, borderRadius: radius.lg, overflow: "hidden", marginTop: spacing.xl },
  deliveryInner: { flex: 1, flexDirection: "row", alignItems: "center", padding: spacing.lg },
  emojiCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  qaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  qa: {
    width: "47.5%",
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  qaIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  qaBadge: { position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: "#F97316", alignItems: "center", justifyContent: "center" },
});
