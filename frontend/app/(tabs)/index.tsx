import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, RefreshControl, FlatList } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api, Provider, ServiceItem, Ad } from "@/src/api";
import { priceLabel } from "@/src/pricing";
import { Txt, Avatar, Stars, SectionHeader } from "@/src/components/ui";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [nearby, setNearby] = useState<Provider[]>([]);
  const [top, setTop] = useState<Provider[]>([]);
  const [homeAds, setHomeAds] = useState<Ad[]>([]);
  const [midAds, setMidAds] = useState<Ad[]>([]);
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [svc, near, best, ah, am] = await Promise.all([
        api.get<ServiceItem[]>("/services"),
        api.get<Provider[]>(`/providers?city=${encodeURIComponent(user?.city || "Dakar")}&limit=8`),
        api.get<Provider[]>("/providers?sort=rating&limit=6"),
        api.get<Ad[]>("/ads?placement=home"),
        api.get<Ad[]>("/ads?placement=between_lists"),
      ]);
      setServices(svc);
      setNearby(near);
      setTop(best);
      setHomeAds(ah);
      setMidAds(am);
    } catch (e) {
      // ignore
    }
  }, [user?.city]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const search = () => {
    router.push({ pathname: "/(tabs)/search", params: { q } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {/* Header */}
        <SafeAreaView edges={["top"]} style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl }}>
            <View>
              <Txt size="sm" color={colors.textMuted}>Bonjour,</Txt>
              <Txt size="xl" weight="700" testID="home-greeting">{user?.name?.split(" ")[0] || "Ami"} 👋</Txt>
            </View>
            <Pressable onPress={() => router.push("/favorites")} style={styles.iconBtn} testID="home-favorites">
              <Ionicons name="heart-outline" size={22} color={colors.midnight} />
            </Pressable>
          </View>

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              testID="home-search-input"
              placeholder="Quel service recherchez-vous ?"
              placeholderTextColor={colors.textSubtle}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={search}
              returnKeyType="search"
              style={styles.searchInput}
            />
            <Pressable onPress={search} style={styles.searchBtn} testID="home-search-submit">
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </Pressable>
          </View>
        </SafeAreaView>

        {/* Publicité principale (home) */}
        {homeAds.length > 0 ? (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.md }}>
            <AdBanner ad={homeAds[0]} testID={`ad-home-${homeAds[0].id}`} />
          </View>
        ) : null}

        {/* Categories */}
        <SectionHeader title="Services populaires" action="Tout voir" onAction={() => router.push("/(tabs)/search")} testID="section-services" />
        <FlatList
          data={services}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}
          keyExtractor={(s) => s.key}
          renderItem={({ item }) => (
            <Pressable
              testID={`service-${item.key}`}
              onPress={() => router.push({ pathname: "/(tabs)/search", params: { service: item.key } })}
              style={styles.svcCard}
            >
              <View style={[styles.svcIcon, { backgroundColor: `${item.color}22` }]}>
                <Ionicons name={item.icon as any} size={22} color={item.color} />
              </View>
              <Txt size="sm" weight="600" style={{ textAlign: "center", marginTop: 8 }} numberOfLines={2}>
                {item.label}
              </Txt>
            </Pressable>
          )}
        />

        {/* Nearby */}
        <SectionHeader title="Près de vous" action="Voir plus" onAction={() => router.push("/(tabs)/search")} />
        <FlatList
          data={nearby}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <NearbyCard p={item} onPress={() => router.push(`/provider/${item.id}`)} />}
        />

        {/* Top rated */}
        <SectionHeader title="Les mieux notés" />
        {midAds.length > 0 ? (
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
            <AdBanner ad={midAds[0]} compact testID={`ad-mid-${midAds[0].id}`} />
          </View>
        ) : null}
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
          {top.map((p) => (
            <ProviderRow key={p.id} p={p} onPress={() => router.push(`/provider/${p.id}`)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function AdBanner({ ad, compact, testID }: { ad: Ad; compact?: boolean; testID?: string }) {
  const router = useRouter();
  const onPress = () => {
    api.post(`/ads/${ad.id}/click`).catch(() => {});
    if (!ad.link) return;
    if (ad.link.startsWith("category:")) {
      const key = ad.link.split(":")[1];
      router.push({ pathname: "/(tabs)/search", params: { service: key } });
    } else if (ad.link.startsWith("provider:")) {
      const pid = ad.link.split(":")[1];
      router.push(`/provider/${pid}`);
    } else if (ad.link.startsWith("app:home")) {
      router.push("/(tabs)/search");
    }
  };
  return (
    <Pressable onPress={onPress} style={[styles.promo, compact && { height: 100 }]} testID={testID}>
      {ad.images[0] ? (
        <Image source={{ uri: ad.images[0] }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <LinearGradient
        colors={["rgba(11,31,58,0.85)", "rgba(0,194,168,0.65)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ padding: compact ? spacing.md : spacing.xl, flex: 1, justifyContent: "flex-end" }}>
        <View style={styles.adTag}>
          <Ionicons name="megaphone" size={10} color={colors.midnight} />
          <Txt size="xxs" weight="700" color={colors.midnight} style={{ marginLeft: 3 }}>Sponsorisé</Txt>
        </View>
        <Txt size={compact ? "md" : "xl"} weight="700" color={colors.white} numberOfLines={2}>{ad.title}</Txt>
        {!compact && ad.description ? (
          <Txt size="sm" color="rgba(255,255,255,0.85)" style={{ marginTop: 4 }} numberOfLines={1}>{ad.description}</Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

function NearbyCard({ p, onPress }: { p: Provider; onPress: () => void }) {
  const sponsored = p.sponsored_until && p.sponsored_until > new Date().toISOString();
  return (
    <Pressable onPress={onPress} style={styles.nearCard} testID={`nearby-${p.id}`}>
      <Image source={{ uri: p.photo || "https://images.unsplash.com/photo-1621905252472-943afaa20e20" }} style={styles.nearImg} contentFit="cover" />
      {p.verified ? (
        <View style={styles.verifiedBadge}>
          <Ionicons name="checkmark-circle" size={14} color={colors.turquoise} />
        </View>
      ) : null}
      {sponsored ? (
        <View style={styles.sponsoredBadge} testID={`sponsored-${p.id}`}>
          <Ionicons name="rocket" size={10} color={colors.white} />
          <Txt size="xxs" weight="700" color={colors.white} style={{ marginLeft: 3 }}>Sponsorisé</Txt>
        </View>
      ) : null}
      <View style={{ padding: 12 }}>
        <Txt size="md" weight="700" numberOfLines={1}>{p.name}</Txt>
        <Txt size="xs" color={colors.textMuted} numberOfLines={1}>{p.service} · {p.city}</Txt>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="star" size={12} color="#F59E0B" />
            <Txt size="xs" weight="600" style={{ marginLeft: 3 }}>{p.rating.toFixed(1)}</Txt>
            <Txt size="xs" color={colors.textSubtle}> ({p.reviews_count})</Txt>
          </View>
          <Txt size="xs" weight="700" color={colors.turquoise} numberOfLines={1}>{priceLabel(p)}</Txt>
        </View>
      </View>
    </Pressable>
  );
}

function ProviderRow({ p, onPress }: { p: Provider; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`prov-row-${p.id}`}>
      <Image source={{ uri: p.photo || "https://images.unsplash.com/photo-1621905252472-943afaa20e20" }} style={styles.rowImg} contentFit="cover" />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Txt size="md" weight="700" numberOfLines={1} style={{ flex: 1 }}>{p.name}</Txt>
          {p.verified ? <Ionicons name="checkmark-circle" size={16} color={colors.turquoise} /> : null}
        </View>
        <Txt size="xs" color={colors.textMuted} numberOfLines={1}>{p.service} · {p.city}</Txt>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
          <Stars value={p.rating} size={12} />
          <Txt size="xs" color={colors.textMuted} style={{ marginLeft: 6 }}>{p.rating.toFixed(1)} · {p.reviews_count} avis</Txt>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: 110 }}>
        <Txt size="md" weight="700" color={colors.turquoise} numberOfLines={1} style={{ textAlign: "right" }}>{priceLabel(p)}</Txt>
        <Txt size="xxs" color={colors.textSubtle}>par prestation</Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingBottom: spacing.md, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, ...shadow.soft },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  searchWrap: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.xl,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: fs.md, color: colors.text, height: "100%" },
  searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  promo: {
    height: 140,
    borderRadius: radius.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
    ...shadow.card,
  },
  svcCard: { width: 84, alignItems: "center" },
  svcIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  nearCard: { width: 200, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: "hidden", ...shadow.card },
  nearImg: { width: "100%", height: 130 },
  sponsoredBadge: {
    position: "absolute", top: 10, left: 10,
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.turquoise,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  adTag: {
    alignSelf: "flex-start",
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.white,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    marginBottom: 8,
  },
  verifiedBadge: { position: "absolute", top: 10, right: 10, backgroundColor: colors.white, borderRadius: 999, padding: 3 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, ...shadow.soft },
  rowImg: { width: 56, height: 56, borderRadius: 16 },
});
