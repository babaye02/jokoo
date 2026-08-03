import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, FlatList, Text } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { api, Provider, ServiceCategory, ServiceItem } from "@/src/api";
import { getCategoryPhoto } from "@/src/utils/categoryAssets";
import { getCategoryMeta } from "@/src/utils/categoryMeta";
import { priceLabel } from "@/src/pricing";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function TradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { key, trade } = useLocalSearchParams<{ key: string; trade: string }>();
  const meta = getCategoryMeta(key || "other");
  const [service, setService] = useState<ServiceItem | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [sort, setSort] = useState<"rating" | "price">("rating");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!trade) return;
    try {
      const [catsResp, provs] = await Promise.all([
        api.get<{ categories: ServiceCategory[] }>("/services/categories"),
        api.get<Provider[]>(`/providers?trade=${encodeURIComponent(trade)}&sort=${sort}&limit=50`),
      ]);
      const cat = catsResp.categories.find((c) => c.key === key);
      const svc = cat?.services.find((s) => s.key === trade) || null;
      setService(svc);
      setProviders(provs || []);
    } catch {
      setService(null);
      setProviders([]);
    }
  }, [trade, key, sort]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const title = service?.label || (trade || "Métier");
  const icon = (service?.icon || "briefcase-outline") as any;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Compact hero */}
      <View style={styles.hero}>
        <Image source={getCategoryPhoto(key || "other")} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient
          colors={["rgba(0,0,0,0.25)", meta.gradient[0], meta.gradient[1]]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView edges={["top"]} style={styles.heroBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="trade-back">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: "/(tabs)/search", params: { category: key || "", trade: trade || "" } })} style={styles.iconBtn} testID="trade-search">
            <Ionicons name="search" size={20} color={colors.text} />
          </Pressable>
        </SafeAreaView>
        <View style={styles.heroContent}>
          <Pressable onPress={() => router.push({ pathname: "/category/[key]", params: { key: key || "" } })} hitSlop={8} testID="trade-parent">
            <Text style={{ fontSize: 11, letterSpacing: 1.6, color: "rgba(255,255,255,0.82)", fontWeight: "700", textTransform: "uppercase" }}>
              {meta.label} ›
            </Text>
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
            <View style={[styles.heroIcon, { backgroundColor: `${meta.accent}CC` }]}>
              <Ionicons name={icon} size={22} color={colors.white} />
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
          </View>
          <View style={{ marginTop: spacing.md }}>
            <View style={styles.heroBadge}>
              <Ionicons name="people" size={13} color={meta.accent} style={{ marginRight: 5 }} />
              <Text style={styles.heroBadgeText}>{providers.length} prestataire{providers.length > 1 ? "s" : ""} disponible{providers.length > 1 ? "s" : ""}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Sort tabs */}
      <View style={styles.sortBar}>
        <Pressable
          onPress={() => setSort("rating")}
          style={[styles.sortChip, sort === "rating" && { backgroundColor: colors.midnight, borderColor: colors.midnight }]}
          testID="trade-sort-rating"
        >
          <Ionicons name="star" size={13} color={sort === "rating" ? colors.white : colors.text} />
          <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: "700", color: sort === "rating" ? colors.white : colors.text }}>Les mieux notés</Text>
        </Pressable>
        <Pressable
          onPress={() => setSort("price")}
          style={[styles.sortChip, sort === "price" && { backgroundColor: colors.midnight, borderColor: colors.midnight }]}
          testID="trade-sort-price"
        >
          <Ionicons name="pricetag" size={13} color={sort === "price" ? colors.white : colors.text} />
          <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: "700", color: sort === "price" ? colors.white : colors.text }}>Prix croissant</Text>
        </Pressable>
      </View>

      <FlatList
        data={providers}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={meta.accent} />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={48} color={colors.textSubtle} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 12 }}>Aucun prestataire pour ce métier</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, textAlign: "center" }}>Explorez la catégorie entière ou revenez plus tard.</Text>
            <Pressable onPress={() => router.back()} style={[styles.emptyCta, { backgroundColor: meta.accent }]}>
              <Text style={{ color: colors.white, fontWeight: "700", fontSize: 13 }}>Retour à la catégorie</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item: p }) => (
          <Pressable onPress={() => router.push(`/provider/${p.id}`)} style={styles.card} testID={`trade-prov-${p.id}`}>
            <View style={{ position: "relative" }}>
              <Image
                source={{ uri: p.photo || "https://images.unsplash.com/photo-1621905252472-943afaa20e20" }}
                style={styles.img}
                contentFit="cover"
              />
              {p.verified ? (
                <View style={styles.verifiedDot}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.white} />
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ fontFamily: "InstrumentSerif", fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: colors.text }} numberOfLines={1}>{p.name}</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{p.service} · {p.city}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginLeft: 4 }}>{p.rating.toFixed(1)}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: 4 }}>· {p.reviews_count} avis</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", justifyContent: "space-between", height: 80 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }} numberOfLines={1}>{priceLabel(p)}</Text>
              <View style={[styles.rowCta, { backgroundColor: meta.accent }]}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.white }}>Réserver</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 220, position: "relative", justifyContent: "space-between" },
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
    paddingTop: spacing.lg,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  heroTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.8,
    color: colors.white,
    flex: 1,
  },
  heroBadge: {
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.1,
  },
  sortBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: 8,
    backgroundColor: colors.bg,
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 14,
    ...shadow.card,
  },
  img: { width: 80, height: 80, borderRadius: 20 },
  verifiedDot: {
    position: "absolute",
    bottom: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.card,
  },
  rowCta: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
  },
  emptyCta: {
    marginTop: spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
});
