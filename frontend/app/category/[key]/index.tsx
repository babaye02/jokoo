import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Dimensions, Text } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { api, Provider, ServiceCategory, ServiceItem } from "@/src/api";
import { getCategoryPhoto } from "@/src/utils/categoryAssets";
import { getCategoryMeta } from "@/src/utils/categoryMeta";
import { priceLabel } from "@/src/pricing";
import { Txt, BadgeRow } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const { width: SCREEN_W } = Dimensions.get("window");

export default function CategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { key } = useLocalSearchParams<{ key: string }>();
  const meta = getCategoryMeta(key || "other");
  const [cat, setCat] = useState<ServiceCategory | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      const [catsResp, provs] = await Promise.all([
        api.get<{ categories: ServiceCategory[] }>("/services/categories"),
        api.get<Provider[]>(`/providers?category=${encodeURIComponent(key)}&sort=rating&limit=20`),
      ]);
      const found = catsResp.categories.find((c) => c.key === key) || null;
      setCat(found);
      setProviders(provs || []);
    } catch {
      setCat(null);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { load(); }, [load]);

  const services: ServiceItem[] = cat?.services || [];
  const providerCount = providers.length;
  const tradeCount = services.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Image source={getCategoryPhoto(key || "other")} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(0,0,0,0.10)", "rgba(0,0,0,0.30)", meta.gradient[0], meta.gradient[1]]}
            locations={[0, 0.35, 0.75, 1]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["top"]} style={styles.heroBar}>
            <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="cat-back">
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: "/(tabs)/search", params: { category: key || "" } })} style={styles.iconBtn} testID="cat-search">
              <Ionicons name="search" size={20} color={colors.text} />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroContent}>
            <Text style={{ fontSize: 11, letterSpacing: 1.8, color: "rgba(255,255,255,0.85)", fontWeight: "700", textTransform: "uppercase" }}>
              {meta.overline}
            </Text>
            <Text style={styles.heroTitle}>{meta.label}</Text>
            <Text style={styles.heroTagline}>{meta.tagline}</Text>
            <Text style={styles.heroDesc}>{meta.description}</Text>
            <BadgeRow style={{ marginTop: spacing.md }}>
              <View style={styles.heroBadge}>
                <Ionicons name="people" size={13} color={meta.accent} style={{ marginRight: 5 }} />
                <Text style={styles.heroBadgeText}>{providerCount} prestataires</Text>
              </View>
              <View style={styles.heroBadge}>
                <Ionicons name="briefcase" size={13} color={meta.accent} style={{ marginRight: 5 }} />
                <Text style={styles.heroBadgeText}>{tradeCount} métiers</Text>
              </View>
            </BadgeRow>
          </View>
        </View>

        {/* Trades grid */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.overline}>Explorer</Text>
              <Text style={styles.sectionTitle}>Métiers de la catégorie</Text>
            </View>
            {tradeCount > 0 ? (
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textMuted }}>{tradeCount}</Text>
            ) : null}
          </View>
          {loading ? (
            <View style={{ padding: spacing.lg }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Chargement…</Text>
            </View>
          ) : services.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="briefcase-outline" size={32} color={colors.textSubtle} />
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>Aucun métier disponible</Text>
            </View>
          ) : (
            <View style={styles.tradesGrid}>
              {services.map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => router.push({ pathname: "/category/[key]/trade/[trade]", params: { key: key || "", trade: s.key } })}
                  style={styles.tradeCard}
                  testID={`trade-${s.key}`}
                >
                  <View style={[styles.tradeIcon, { backgroundColor: `${meta.accent}18` }]}>
                    <Ionicons name={(s.icon || "briefcase-outline") as any} size={20} color={meta.accent} />
                  </View>
                  <Text style={styles.tradeLabel} numberOfLines={2}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Featured providers */}
        {providers.length > 0 ? (
          <View style={[styles.section, { marginTop: spacing.xl }]}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.overline}>Les mieux notés</Text>
                <Text style={styles.sectionTitle}>Prestataires en vedette</Text>
              </View>
              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/search", params: { category: key || "" } })}
                hitSlop={8}
                testID="cat-see-all"
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: meta.accent }}>Voir tout →</Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: 4 }}
            >
              {providers.slice(0, 8).map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/provider/${p.id}`)}
                  style={styles.provCard}
                  testID={`cat-prov-${p.id}`}
                >
                  <Image
                    source={{ uri: p.photo || "https://images.unsplash.com/photo-1621905252472-943afaa20e20" }}
                    style={styles.provImg}
                    contentFit="cover"
                  />
                  <View style={{ padding: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ fontFamily: "InstrumentSerif", fontSize: 18, lineHeight: 22, color: colors.text, flex: 1, letterSpacing: -0.2 }} numberOfLines={1}>
                        {p.name}
                      </Text>
                      {p.verified ? <Ionicons name="checkmark-circle" size={14} color={colors.primary} /> : null}
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{p.service} · {p.city}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Ionicons name="star" size={12} color="#F59E0B" />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginLeft: 4 }}>{p.rating.toFixed(1)}</Text>
                        <Text style={{ fontSize: 11, color: colors.textSubtle, marginLeft: 3 }}>({p.reviews_count})</Text>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }} numberOfLines={1}>{priceLabel(p)}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* CTA see all */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
          <Pressable
            onPress={() => router.push({ pathname: "/(tabs)/search", params: { category: key || "" } })}
            style={[styles.ctaAll, { backgroundColor: meta.gradient[0] }]}
            testID="cat-see-all-btn"
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.white, letterSpacing: -0.2 }}>
                Voir tous les prestataires
              </Text>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
                {providerCount} disponibles · trier & filtrer
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={22} color={colors.white} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: SCREEN_W, minHeight: 380, position: "relative", justifyContent: "space-between" },
  heroBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: 4,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center", justifyContent: "center",
    ...shadow.hairline,
  },
  heroContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xxl,
  },
  heroTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1.2,
    color: colors.white,
    marginTop: 6,
  },
  heroTagline: {
    fontFamily: "InstrumentSerifItalic",
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
    color: "rgba(255,255,255,0.9)",
    marginTop: 4,
  },
  heroDesc: {
    fontSize: 14,
    lineHeight: 21,
    color: "rgba(255,255,255,0.82)",
    marginTop: 12,
    maxWidth: 340,
  },
  heroBadge: {
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    flexDirection: "row",
    alignItems: "center",
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.1,
  },
  section: {
    marginTop: spacing.xxl,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  overline: {
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: colors.text,
  },
  tradesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.xl,
    gap: 10,
  },
  tradeCard: {
    width: (SCREEN_W - spacing.xl * 2 - 10) / 2,
    minHeight: 96,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tradeIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tradeLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    letterSpacing: -0.1,
    lineHeight: 17,
  },
  provCard: {
    width: 240,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.card,
  },
  provImg: { width: "100%", height: 160 },
  ctaAll: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderRadius: radius.xl,
    ...shadow.card,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    marginHorizontal: spacing.xl,
  },
});
