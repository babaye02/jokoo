import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, RefreshControl, FlatList, Dimensions } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api, Provider, ServiceItem, Ad } from "@/src/api";
import { openAdDestination } from "@/src/navigation/adDestination";
import { priceLabel } from "@/src/pricing";
import { Txt, Avatar, Stars, SectionHeader } from "@/src/components/ui";
import { CategoryCard } from "@/src/components/premium";
import { getCategoryPhoto, getCategoryIcon } from "@/src/utils/categoryAssets";
import { colors, fs, radius, shadow, spacing, typo } from "@/src/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const CAT_CARD_W = SCREEN_W * 0.72;

// Catégories phares affichées sur le Home avec grandes photos immersives IA.
// Cohérent avec SERVICE_CATEGORIES backend (subset des plus populaires).
const HERO_CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: "beauty",    label: "Beauté & Coiffure",       color: "#EC4899" },
  { key: "repair",    label: "Bâtiment & Réparations",  color: "#F59E0B" },
  { key: "home",      label: "Maison & Ménage",         color: "#10B981" },
  { key: "kids",      label: "Enfants & Baby-sitting",  color: "#EC4899" },
  { key: "transport", label: "Transport & Livraison",   color: "#0B1F3A" },
  { key: "food",      label: "Restauration",            color: "#F97316" },
  { key: "tech",      label: "Tech & Digital",          color: "#6366F1" },
  { key: "education", label: "Cours & Formation",       color: "#3B82F6" },
  { key: "events",    label: "Événementiel",            color: "#8B5CF6" },
  { key: "health",    label: "Santé",                   color: "#0EA5E9" },
  { key: "laundry",   label: "Pressing & Couture",      color: "#22C55E" },
  { key: "moving",    label: "Déménagement",            color: "#F97316" },
];

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
      const audience = user?.role || "client";
      const [svc, near, best, ah, am] = await Promise.all([
        api.get<ServiceItem[]>("/services"),
        api.get<Provider[]>(`/providers?city=${encodeURIComponent(user?.city || "Dakar")}&limit=8`),
        api.get<Provider[]>("/providers?sort=rating&limit=6"),
        api.get<Ad[]>(`/ads?placement=home&audience=${audience}`),
        api.get<Ad[]>(`/ads?placement=between_lists&audience=${audience}`),
      ]);
      setServices(svc);
      setNearby(near);
      setTop(best);
      setHomeAds(ah);
      setMidAds(am);
    } catch (e) {
      // ignore
    }
  }, [user?.city, user?.role]);

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
            <AdCarousel ads={homeAds} testIDPrefix="ad-home" />
          </View>
        ) : null}

        {/* Explorer par catégorie — grandes cartes immersives (photos IA hero) */}
        <View style={{ marginTop: spacing.xl }}>
          <View style={styles.premiumHead}>
            <View style={{ flex: 1 }}>
              <Txt style={[typo.overline, { color: colors.turquoise }]}>UNIVERS JOKOO</Txt>
              <Txt style={[typo.h2, { marginTop: 4 }]}>Explorer par catégorie</Txt>
            </View>
            <Pressable
              onPress={() => router.push("/(tabs)/search")}
              hitSlop={12}
              testID="cat-all"
            >
              <Txt style={{ color: colors.turquoise, fontWeight: "700", fontSize: 13 }}>
                Tout voir →
              </Txt>
            </Pressable>
          </View>
          <FlatList
            data={HERO_CATEGORIES}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CAT_CARD_W + 12}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: 12, paddingBottom: spacing.md }}
            keyExtractor={(c) => c.key}
            renderItem={({ item }) => (
              <View style={{ width: CAT_CARD_W }}>
                <CategoryCard
                  label={item.label}
                  photo={getCategoryPhoto(item.key)}
                  icon={getCategoryIcon(item.key) as any}
                  color={item.color}
                  size="lg"
                  testID={`hero-cat-${item.key}`}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/search",
                      params: { category: item.key },
                    })
                  }
                />
              </View>
            )}
          />
        </View>

        {/* Categories (icônes compactes) */}
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

        {/* Mobilité */}
        <SectionHeader title="Mobilité" action="Explorer" onAction={() => router.push("/mobility")} testID="section-mobility" />
        <View style={{ paddingHorizontal: spacing.xl, flexDirection: "row", gap: spacing.md }}>
          <Pressable
            onPress={() => router.push("/mobility/rides")}
            style={[styles.mobCard, { backgroundColor: colors.midnight }]}
            testID="mob-covoiturage"
          >
            <View style={styles.mobEmoji}>
              <Txt size="xxl">🚗</Txt>
            </View>
            <Txt size="md" weight="700" color={colors.white} style={{ marginTop: 8 }}>Covoiturage</Txt>
            <Txt size="xxs" color="rgba(255,255,255,0.7)" numberOfLines={2}>Partagez la route, économisez</Txt>
          </Pressable>
          <Pressable
            onPress={() => router.push("/mobility/delivery")}
            style={[styles.mobCard, { backgroundColor: colors.turquoise }]}
            testID="mob-livraison"
          >
            <View style={styles.mobEmoji}>
              <Txt size="xxl">📦</Txt>
            </View>
            <Txt size="md" weight="700" color={colors.white} style={{ marginTop: 8 }}>Livraison</Txt>
            <Txt size="xxs" color="rgba(255,255,255,0.85)" numberOfLines={2}>Colis · courses · interurbain</Txt>
          </Pressable>
        </View>

        {/* Jokoo Family */}
        <SectionHeader title="Jokoo Family" action="Découvrir" onAction={() => router.push("/family")} testID="section-family" />
        <View style={{ paddingHorizontal: spacing.xl }}>
          <Pressable onPress={() => router.push("/family")} style={styles.familyCard} testID="family-card">
            <LinearGradient
              colors={["#7C3AED", "#EC4899"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.familyEmoji}>
              <Txt size="xxxl">👨‍👩‍👧</Txt>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <View style={styles.familyPill}>
                <Txt size="xxs" weight="700" color={colors.midnight}>NOUVEAU ✨</Txt>
              </View>
              <Txt size="lg" weight="800" color={colors.white} style={{ marginTop: 4 }}>Baby-sitting bilingue</Txt>
              <Txt size="xs" color="rgba(255,255,255,0.9)" style={{ marginTop: 2 }} numberOfLines={2}>
                Étudiants vérifiés · FR/EN/Wolof/Arabe · SOS 🚨
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.white} />
          </Pressable>
        </View>

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
            <AdCarousel ads={midAds} testIDPrefix="ad-mid" />
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

function AdCarousel({ ads, testIDPrefix }: { ads: Ad[]; testIDPrefix: string }) {
  // Fait défiler automatiquement les bannières. Chaque bannière peut définir
  // sa propre durée d'affichage via `display_duration_ms` (défaut : 5000 ms).
  // Le carrousel s'active dès qu'il y a plus d'une bannière ou si l'admin a
  // explicitement demandé le mode `carousel_queue`.
  const shouldRotate = ads.length > 1 || ads.some((a) => a.display_mode === "carousel_queue");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!shouldRotate || ads.length === 0) return;
    const current = ads[idx % ads.length];
    // Clamp entre 1.5s (impossible de lire plus vite) et 30s (au-delà, ce n'est plus un carrousel).
    const raw = current?.display_duration_ms;
    const duration = typeof raw === "number" && raw > 0
      ? Math.max(1500, Math.min(30000, raw))
      : 5000;
    const t = setTimeout(() => setIdx((i) => (i + 1) % ads.length), duration);
    return () => clearTimeout(t);
  }, [ads, idx, shouldRotate]);

  if (ads.length === 0) return null;
  const cur = ads[idx % ads.length];
  return (
    <View>
      <AdBanner ad={cur} testID={`${testIDPrefix}-${cur.id}`} />
      {shouldRotate ? (
        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 6 }}>
          {ads.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => setIdx(i)}
              hitSlop={6}
              accessibilityLabel={`Bannière ${i + 1} sur ${ads.length}`}
            >
              <View
                style={{
                  width: i === idx ? 16 : 6, height: 6, borderRadius: 3,
                  backgroundColor: i === idx ? colors.turquoise : colors.borderStrong,
                  marginHorizontal: 3,
                }}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AdBanner({ ad, compact, testID }: { ad: Ad; compact?: boolean; testID?: string }) {
  const router = useRouter();
  const m = ad.media?.[0];
  const player = useVideoPlayer(m?.kind === "video" ? m.url : "", (p) => { p.loop = true; p.muted = true; p.play(); });
  const onPress = () => {
    api.post(`/ads/${ad.id}/click`).catch(() => {});
    // Système de campagne : destination structurée (link_type/link_target) avec fallback legacy `link:`.
    openAdDestination(
      { link_type: ad.link_type, link_target: ad.link_target, link: ad.link },
      router,
    );
  };
  return (
    <Pressable onPress={onPress} style={[styles.promo, compact && { height: 100 }]} testID={testID}>
      {m?.kind === "video" && m.url ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      ) : m?.url ? (
        <Image source={{ uri: m.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
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
  premiumHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
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
  mobCard: {
    flex: 1,
    height: 120,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: "flex-end",
    ...shadow.card,
  },
  mobEmoji: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  familyCard: {
    flexDirection: "row",
    alignItems: "center",
    height: 100,
    borderRadius: radius.lg,
    padding: spacing.md,
    overflow: "hidden",
    ...shadow.card,
  },
  familyEmoji: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  familyPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.turquoise,
  },
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
