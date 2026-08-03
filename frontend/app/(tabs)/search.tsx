import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, TextInput, FlatList, Pressable, ScrollView } from "react-native";
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
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.surface, ...shadow.soft }}>
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
          <Txt size="xl" weight="700">Recherche</Txt>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
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
                <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
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
                <Ionicons name="chevron-back" size={14} color={colors.midnight} />
                <Txt size="xs" weight="700" style={{ marginLeft: 4 }}>Catégories</Txt>
              </Pressable>
              <Txt size="sm" weight="700" style={{ marginLeft: 8, flex: 1 }} numberOfLines={1}>
                {currentCat ? `${currentCat.emoji}  ${currentCat.label}` : category}
              </Txt>
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
              <Image source={{ uri: item.photo || "https://images.unsplash.com/photo-1621905252472-943afaa20e20" }} style={styles.img} contentFit="cover" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Txt size="md" weight="700" numberOfLines={1} style={{ flex: 1 }}>{item.name}</Txt>
                  {item.verified ? <Ionicons name="checkmark-circle" size={16} color={colors.turquoise} /> : null}
                </View>
                <Txt size="xs" color={colors.textMuted}>{item.service} · {item.city}</Txt>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  <Stars value={item.rating} size={12} />
                  <Txt size="xs" color={colors.textMuted} style={{ marginLeft: 6 }}>{item.rating.toFixed(1)} ({item.reviews_count})</Txt>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", maxWidth: 110 }}>
                <Txt weight="700" color={colors.turquoise} numberOfLines={1} style={{ textAlign: "right" }}>{priceLabel(item)}</Txt>
                <Txt size="xxs" color={colors.textSubtle}>par prestation</Txt>
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
    marginTop: spacing.md,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: fs.md, color: colors.text, height: "100%" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, ...shadow.soft },
  img: { width: 64, height: 64, borderRadius: 16 },
  crumbBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface2,
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
