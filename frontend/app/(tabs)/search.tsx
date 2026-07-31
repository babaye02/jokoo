import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, TextInput, FlatList, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Provider, ServiceItem } from "@/src/api";
import { priceLabel } from "@/src/pricing";
import { Chip, Stars, Txt } from "@/src/components/ui";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

export default function Search() {
  const params = useLocalSearchParams<{ q?: string; service?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState<string>(params.q || "");
  const [service, setService] = useState<string>(params.service || "");
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [items, setItems] = useState<Provider[]>([]);
  const [sort, setSort] = useState<"rating" | "price" | "">("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<ServiceItem[]>("/services").then(setServices).catch(() => {});
  }, []);

  // Sync état local si l'utilisateur navigue depuis l'accueil avec un ?service=xxx
  // (le composant reste monté entre les onglets — sans ceci, le filtre ne change pas).
  useEffect(() => {
    const s = typeof params.service === "string" ? params.service : "";
    setService(s);
  }, [params.service]);

  useEffect(() => {
    const qParam = typeof params.q === "string" ? params.q : "";
    if (qParam) setQ(qParam);
  }, [params.q]);

  const doSearch = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (q) qs.set("q", q);
        if (service) qs.set("service", service);
        if (sort) qs.set("sort", sort);
        const list = await api.get<Provider[]>(`/providers?${qs.toString()}`);
        setItems(list);
      } finally {
        setLoading(false);
      }
    },
    [q, service, sort],
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

          {/* service chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: spacing.xl, gap: 8, paddingTop: spacing.md }}
          >
            <Chip label="Tous" active={!service} onPress={() => setService("")} testID="chip-all" />
            {services.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                active={service === s.key}
                icon={s.icon as any}
                onPress={() => setService(service === s.key ? "" : s.key)}
                testID={`chip-${s.key}`}
              />
            ))}
          </ScrollView>

          {/* sort */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
            <Chip label="Mieux notés" active={sort === "rating"} onPress={() => setSort(sort === "rating" ? "" : "rating")} icon="star-outline" />
            <Chip label="Prix ↑" active={sort === "price"} onPress={() => setSort(sort === "price" ? "" : "price")} icon="cash-outline" />
          </View>
        </View>
      </SafeAreaView>

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
});
