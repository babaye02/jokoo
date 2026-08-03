import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, TextInput, FlatList, Pressable, ScrollView, Text } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Provider, ServiceCategory } from "@/src/api";
import { priceLabel } from "@/src/pricing";
import { Chip, Stars, Txt } from "@/src/components/ui";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

export default function Search() {
  const params = useLocalSearchParams<{ q?: string; service?: string; category?: string; trade?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState<string>(params.q || "");
  const [category, setCategory] = useState<string>(params.category || "");
  const [trade, setTrade] = useState<string>(params.trade || params.service || "");
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [items, setItems] = useState<Provider[]>([]);
  const [sort, setSort] = useState<"rating" | "price" | "">("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<{ categories: ServiceCategory[] }>("/services/categories")
      .then((r) => setCats(r.categories || []))
      .catch(() => {});
  }, []);

  // Synchro depuis les params de navigation (home, deep-links)
  useEffect(() => {
    if (typeof params.category === "string") setCategory(params.category);
  }, [params.category]);
  useEffect(() => {
    const s = typeof params.trade === "string" ? params.trade
            : typeof params.service === "string" ? params.service : "";
    if (s) setTrade(s);
  }, [params.trade, params.service]);
  useEffect(() => {
    const qParam = typeof params.q === "string" ? params.q : "";
    if (qParam) setQ(qParam);
  }, [params.q]);

  const currentCat = useMemo(() => cats.find((c) => c.key === category), [cats, category]);

  const doSearch = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (q) qs.set("q", q);
        if (category) qs.set("category", category);
        if (trade) qs.set("trade", trade);
        if (sort) qs.set("sort", sort);
        const list = await api.get<Provider[]>(`/providers?${qs.toString()}`);
        setItems(list);
      } finally {
        setLoading(false);
      }
    },
    [q, category, trade, sort],
  );

  useEffect(() => { doSearch(); }, [doSearch]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg }}>
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, paddingTop: 4 }}>
          <Text style={{ fontSize: 11, letterSpacing: 1.6, color: colors.primary, fontWeight: "700", textTransform: "uppercase" }}>
            Explorer
          </Text>
          <Text style={{ fontFamily: "InstrumentSerif", fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: colors.text, marginTop: 4 }}>
            Recherche
          </Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={19} color={colors.textMuted} />
            <TextInput
              testID="search-input"
              placeholder="Nom, service, description…"
              placeholderTextColor={colors.textSubtle}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={doSearch}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {q ? (
              <Pressable onPress={() => setQ("")} testID="search-clear">
                <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
              </Pressable>
            ) : null}
          </View>

          {/* Fil d'Ariane + bouton retour catégorie */}
          {category ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md }}>
              <Pressable
                onPress={() => { setCategory(""); setTrade(""); }}
                style={styles.crumbBtn}
                testID="search-clear-cat"
              >
                <Ionicons name="chevron-back" size={14} color={colors.text} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginLeft: 4 }}>Catégories</Text>
              </Pressable>
              <Text style={{ fontFamily: "InstrumentSerif", fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: colors.text, marginLeft: 10, flex: 1 }} numberOfLines={1}>
                {currentCat ? currentCat.label : category}
              </Text>
            </View>
          ) : null}

          {/* Chips : catégories (si aucune choisie) OU métiers de la catégorie */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: spacing.xl, gap: 8, paddingTop: spacing.md }}
          >
            {category ? (
              <>
                <Chip label="Tous les métiers" active={!trade} onPress={() => setTrade("")} testID="chip-all-trades" />
                {(currentCat?.services || []).map((s) => (
                  <Chip
                    key={s.key}
                    label={s.label}
                    active={trade === s.key}
                    icon={s.icon as any}
                    onPress={() => setTrade(trade === s.key ? "" : s.key)}
                    testID={`chip-trade-${s.key}`}
                  />
                ))}
              </>
            ) : (
              <>
                <Chip label="Toutes" active={!category} onPress={() => setCategory("")} testID="chip-all-cats" />
                {cats.map((c) => (
                  <Chip
                    key={c.key}
                    label={`${c.emoji}  ${c.label}`}
                    active={category === c.key}
                    onPress={() => setCategory(c.key)}
                    testID={`chip-cat-${c.key}`}
                  />
                ))}
              </>
            )}
          </ScrollView>

          {/* sort */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
            <Chip label="Mieux notés" active={sort === "rating"} onPress={() => setSort(sort === "rating" ? "" : "rating")} icon="star-outline" />
            <Chip label="Prix ↑" active={sort === "price"} onPress={() => setSort(sort === "price" ? "" : "price")} icon="cash-outline" />
          </View>
        </View>
      </SafeAreaView>

      {/* Si aucune catégorie choisie : grille de catégories */}
      {!category ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom }}
        >
          <Txt size="sm" weight="700" style={{ marginBottom: spacing.md }}>
            Parcourir par catégorie
          </Txt>
          <View style={styles.catGrid}>
            {cats.filter((c) => c.count > 0).map((c) => (
              <Pressable
                key={c.key}
                onPress={() => setCategory(c.key)}
                style={styles.catTile}
                testID={`cat-tile-${c.key}`}
              >
                <Txt size="xxl">{c.emoji}</Txt>
                <Txt size="sm" weight="700" style={{ marginTop: 6 }} numberOfLines={2}>
                  {c.label}
                </Txt>
                <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                  {c.count} métiers
                </Txt>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom, gap: spacing.md }}
          ListEmptyComponent={
            !loading ? (
              <View style={{ alignItems: "center", marginTop: spacing.xxxl }}>
                <Ionicons name="search-outline" size={48} color={colors.textSubtle} />
                <Txt color={colors.textMuted} style={{ marginTop: spacing.md }}>Aucun résultat</Txt>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/provider/${item.id}`)} style={styles.card} testID={`result-${item.id}`}>
              <View style={{ position: "relative" }}>
                <Image source={{ uri: item.photo || "https://images.unsplash.com/photo-1621905252472-943afaa20e20" }} style={styles.img} contentFit="cover" />
                {item.verified ? (
                  <View style={styles.verifiedDot}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.white} />
                  </View>
                ) : null}
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={{ fontFamily: "InstrumentSerif", fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: colors.text }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{item.service} · {item.city}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginLeft: 4 }}>{item.rating.toFixed(1)}</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: 4 }}>· {item.reviews_count} avis</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", justifyContent: "space-between", height: 80 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }} numberOfLines={1}>{priceLabel(item)}</Text>
                <View style={styles.rowCta}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.white }}>Réserver</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    marginTop: spacing.lg,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.hairline,
  },
  searchInput: { flex: 1, marginLeft: 12, fontSize: fs.md, color: colors.text, height: "100%" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
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
    backgroundColor: colors.text,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
  },
  crumbBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  catTile: {
    width: "48%",
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
});
