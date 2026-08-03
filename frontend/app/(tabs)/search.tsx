// Search — Premium redesign inspired by Airbnb / Uber / Booking.com
// - Editorial header (overline + Instrument Serif title)
// - Segmented sort tabs (Top notés / Prix ↑ / Populaires / Plus proches)
// - Filter chip that opens a bottom-sheet with advanced filters
//   (verified only, price range, min rating, languages)
// - Category/trade chips + result list preserved

import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, TextInput, FlatList, Pressable, ScrollView, Text, Modal } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Provider, ServiceCategory } from "@/src/api";
import { priceLabel } from "@/src/pricing";
import { Chip, Txt } from "@/src/components/ui";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

type SortKey = "" | "rating" | "price" | "reviews" | "nearest";

const SORT_TABS: { key: SortKey; label: string; icon: any }[] = [
  { key: "rating",   label: "Top notés",     icon: "star" },
  { key: "price",    label: "Prix ↑",         icon: "cash-outline" },
  { key: "reviews",  label: "Populaires",     icon: "flame" },
  { key: "nearest",  label: "Plus proches",   icon: "location" },
];

const LANG_OPTIONS: { code: string; label: string; flag: string }[] = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "Anglais",  flag: "🇬🇧" },
  { code: "wo", label: "Wolof",    flag: "🇸🇳" },
  { code: "ar", label: "Arabe",    flag: "🇸🇦" },
  { code: "es", label: "Espagnol", flag: "🇪🇸" },
];

export default function Search() {
  const params = useLocalSearchParams<{ q?: string; service?: string; category?: string; trade?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState<string>(params.q || "");
  const [category, setCategory] = useState<string>(params.category || "");
  const [trade, setTrade] = useState<string>(params.trade || params.service || "");
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [items, setItems] = useState<Provider[]>([]);
  const [sort, setSort] = useState<SortKey>("rating");
  const [loading, setLoading] = useState(false);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState<number>(0); // 0 = no cap
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);

  // Count of active advanced filters
  const activeFilterCount = useMemo(
    () => (verifiedOnly ? 1 : 0) + (minRating > 0 ? 1 : 0) + (maxPrice > 0 ? 1 : 0) + selectedLangs.length,
    [verifiedOnly, minRating, maxPrice, selectedLangs],
  );

  useEffect(() => {
    api.get<{ categories: ServiceCategory[] }>("/services/categories")
      .then((r) => setCats(r.categories || []))
      .catch(() => {});
  }, []);

  useEffect(() => { if (typeof params.category === "string") setCategory(params.category); }, [params.category]);
  useEffect(() => {
    const s = typeof params.trade === "string" ? params.trade : typeof params.service === "string" ? params.service : "";
    if (s) setTrade(s);
  }, [params.trade, params.service]);
  useEffect(() => { const qp = typeof params.q === "string" ? params.q : ""; if (qp) setQ(qp); }, [params.q]);

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
        if (verifiedOnly) qs.set("verified", "true");
        if (minRating > 0) qs.set("min_rating", String(minRating));
        if (maxPrice > 0) qs.set("max_price", String(maxPrice));
        if (selectedLangs.length > 0) qs.set("languages", selectedLangs.join(","));
        const list = await api.get<Provider[]>(`/providers?${qs.toString()}`);
        setItems(list);
      } finally { setLoading(false); }
    },
    [q, category, trade, sort, verifiedOnly, minRating, maxPrice, selectedLangs],
  );

  useEffect(() => { doSearch(); }, [doSearch]);

  const resetFilters = () => { setVerifiedOnly(false); setMinRating(0); setMaxPrice(0); setSelectedLangs([]); };
  const toggleLang = (c: string) => setSelectedLangs((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg }}>
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, paddingTop: 4 }}>
          <Text style={styles.overline}>Explorer</Text>
          <Text style={styles.title}>Recherche</Text>

          {/* Search bar */}
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
              <Pressable onPress={() => setQ("")} testID="search-clear" hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
              </Pressable>
            ) : null}
          </View>

          {/* Breadcrumb category */}
          {category ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md }}>
              <Pressable onPress={() => { setCategory(""); setTrade(""); }} style={styles.crumbBtn} testID="search-clear-cat">
                <Ionicons name="chevron-back" size={14} color={colors.text} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginLeft: 4 }}>Catégories</Text>
              </Pressable>
              <Text style={styles.crumbLabel} numberOfLines={1}>{currentCat ? currentCat.label : category}</Text>
            </View>
          ) : null}

          {/* Category or Trade chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: spacing.xl, gap: 8, paddingTop: spacing.md }}>
            {category ? (
              <>
                <Chip label="Tous les métiers" active={!trade} onPress={() => setTrade("")} testID="chip-all-trades" />
                {(currentCat?.services || []).map((s) => (
                  <Chip key={s.key} label={s.label} active={trade === s.key} icon={s.icon as any}
                    onPress={() => setTrade(trade === s.key ? "" : s.key)} testID={`chip-trade-${s.key}`} />
                ))}
              </>
            ) : (
              <>
                <Chip label="Toutes" active={!category} onPress={() => setCategory("")} testID="chip-all-cats" />
                {cats.map((c) => (
                  <Chip key={c.key} label={`${c.emoji}  ${c.label}`} active={category === c.key}
                    onPress={() => setCategory(c.key)} testID={`chip-cat-${c.key}`} />
                ))}
              </>
            )}
          </ScrollView>

          {/* Sort tabs + Filter button */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
              {SORT_TABS.map((t) => {
                const active = sort === t.key;
                return (
                  <Pressable key={t.key} onPress={() => setSort(active ? "" : t.key)}
                    style={[styles.sortChip, active && styles.sortChipActive]}
                    testID={`sort-${t.key}`}>
                    <Ionicons name={t.icon} size={13} color={active ? colors.white : colors.text} />
                    <Text style={[styles.sortLabel, active && { color: colors.white }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setShowFilters(true)} style={styles.filterBtn} testID="open-filters">
              <Ionicons name="options-outline" size={16} color={colors.text} />
              {activeFilterCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeTxt}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* Category browse (no category selected) */}
      {!category ? (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom }}>
          <Txt size="sm" weight="700" style={{ marginBottom: spacing.md }}>Parcourir par catégorie</Txt>
          <View style={styles.catGrid}>
            {cats.filter((c) => c.count > 0).map((c) => (
              <Pressable key={c.key} onPress={() => setCategory(c.key)} style={styles.catTile} testID={`cat-tile-${c.key}`}>
                <Txt size="xxl">{c.emoji}</Txt>
                <Txt size="sm" weight="700" style={{ marginTop: 6 }} numberOfLines={2}>{c.label}</Txt>
                <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>{c.count} métiers</Txt>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom, gap: spacing.md }}
          ListHeaderComponent={
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>
                {loading ? "Recherche…" : `${items.length} résultat${items.length > 1 ? "s" : ""}`}
              </Text>
              {activeFilterCount > 0 ? (
                <Pressable onPress={resetFilters} hitSlop={6}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.danger }}>Réinitialiser</Text>
                </Pressable>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="search-outline" size={40} color={colors.textSubtle} />
                </View>
                <Text style={styles.emptyTitle}>Aucun résultat</Text>
                <Text style={styles.emptyHint}>Essayez d&apos;élargir vos critères ou de retirer certains filtres.</Text>
                {activeFilterCount > 0 ? (
                  <Pressable onPress={resetFilters} style={styles.emptyCta}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.white }}>Réinitialiser les filtres</Text>
                  </Pressable>
                ) : null}
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

      {/* ── Filters bottom sheet ── */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFilters(false)} />
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filtres</Text>
              <Pressable onPress={resetFilters} hitSlop={8}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.danger }}>Réinitialiser</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
              {/* Verified only */}
              <Pressable onPress={() => setVerifiedOnly((v) => !v)} style={styles.rowToggle} testID="filter-verified">
                <View style={styles.rowToggleIcon}>
                  <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowToggleTitle}>Prestataires vérifiés</Text>
                  <Text style={styles.rowToggleSub}>Identité et documents contrôlés</Text>
                </View>
                <View style={[styles.toggle, verifiedOnly && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, verifiedOnly && { transform: [{ translateX: 20 }] }]} />
                </View>
              </Pressable>

              {/* Min rating */}
              <View>
                <Text style={styles.sectionLbl}>Note minimale</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  {[0, 3, 4, 4.5].map((v) => {
                    const active = minRating === v;
                    return (
                      <Pressable key={v} onPress={() => setMinRating(v)} style={[styles.chipPill, active && styles.chipPillActive]} testID={`filter-rating-${v}`}>
                        <Ionicons name="star" size={12} color={active ? colors.white : "#F59E0B"} />
                        <Text style={[styles.chipPillTxt, active && { color: colors.white }]}>{v === 0 ? "Toutes" : `${v}+`}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Max price */}
              <View>
                <Text style={styles.sectionLbl}>Prix maximum</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {[
                    { v: 0, l: "Tous" },
                    { v: 5000, l: "≤ 5 000 F" },
                    { v: 15000, l: "≤ 15 000 F" },
                    { v: 30000, l: "≤ 30 000 F" },
                    { v: 50000, l: "≤ 50 000 F" },
                  ].map((o) => {
                    const active = maxPrice === o.v;
                    return (
                      <Pressable key={o.v} onPress={() => setMaxPrice(o.v)} style={[styles.chipPill, active && styles.chipPillActive]} testID={`filter-price-${o.v}`}>
                        <Text style={[styles.chipPillTxt, active && { color: colors.white }]}>{o.l}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Languages */}
              <View>
                <Text style={styles.sectionLbl}>Langues parlées</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {LANG_OPTIONS.map((l) => {
                    const active = selectedLangs.includes(l.code);
                    return (
                      <Pressable key={l.code} onPress={() => toggleLang(l.code)} style={[styles.chipPill, active && styles.chipPillActive]} testID={`filter-lang-${l.code}`}>
                        <Text style={{ fontSize: 13 }}>{l.flag}</Text>
                        <Text style={[styles.chipPillTxt, active && { color: colors.white }]}>{l.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <Pressable onPress={() => setShowFilters(false)} style={styles.applyBtn} testID="apply-filters">
                <Text style={styles.applyBtnTxt}>
                  Voir {items.length} résultat{items.length > 1 ? "s" : ""}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overline: { fontSize: 11, letterSpacing: 1.6, color: colors.primary, fontWeight: "700", textTransform: "uppercase" },
  title: { fontFamily: "InstrumentSerif", fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: colors.text, marginTop: 4 },

  searchWrap: {
    marginTop: spacing.lg, height: 60, borderRadius: radius.pill,
    backgroundColor: colors.card, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 22, borderWidth: 1, borderColor: colors.border, ...shadow.hairline,
  },
  searchInput: { flex: 1, marginLeft: 12, fontSize: fs.md, color: colors.text, height: "100%" },

  crumbBtn: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  crumbLabel: { fontFamily: "InstrumentSerif", fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: colors.text, marginLeft: 10, flex: 1 },

  sortChip: {
    flexDirection: "row", alignItems: "center",
    height: 34, paddingHorizontal: 13, borderRadius: 999,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  sortChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  sortLabel: { fontSize: 12, fontWeight: "700", color: colors.text, marginLeft: 5, letterSpacing: -0.1 },

  filterBtn: {
    width: 40, height: 34, borderRadius: 999,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  filterBadge: {
    position: "absolute", top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, alignItems: "center", justifyContent: "center",
  },
  filterBadgeTxt: { fontSize: 10, fontWeight: "800", color: colors.white },

  // Cards
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: radius.xl, padding: 14, ...shadow.card },
  img: { width: 80, height: 80, borderRadius: 20 },
  verifiedDot: {
    position: "absolute", bottom: 4, right: 4, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.card,
  },
  rowCta: { backgroundColor: colors.text, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },

  // Cat grid
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  catTile: {
    width: "48%", padding: 14, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, ...shadow.soft,
  },

  // Empty
  emptyBox: { alignItems: "center", marginTop: 60, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 76, height: 76, borderRadius: 24,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontFamily: "InstrumentSerif", fontSize: 22, lineHeight: 26, color: colors.text, marginTop: 16, letterSpacing: -0.3 },
  emptyHint: { fontSize: 13, color: colors.textMuted, marginTop: 4, textAlign: "center" },
  emptyCta: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: colors.text },

  // Bottom sheet
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "88%" },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 10 },
  sheetHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  sheetTitle: { fontFamily: "InstrumentSerif", fontSize: 28, letterSpacing: -0.4, color: colors.text },

  sectionLbl: { fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase" },

  rowToggle: {
    flexDirection: "row", alignItems: "center",
    padding: 14, borderRadius: 18, backgroundColor: "#FAFAFA",
    borderWidth: 1, borderColor: colors.border,
  },
  rowToggleIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#E0F2FE", alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  rowToggleTitle: { fontSize: 14, fontWeight: "700", color: colors.text, letterSpacing: -0.2 },
  rowToggleSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  toggle: {
    width: 44, height: 26, borderRadius: 999,
    backgroundColor: "#E5E7EB", padding: 3, justifyContent: "center",
  },
  toggleOn: { backgroundColor: colors.primary },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },

  chipPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    height: 34, paddingHorizontal: 13, borderRadius: 999,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  chipPillActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipPillTxt: { fontSize: 12, fontWeight: "700", color: colors.text, letterSpacing: -0.1 },

  sheetFooter: { padding: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  applyBtn: { height: 52, borderRadius: 16, backgroundColor: colors.text, alignItems: "center", justifyContent: "center" },
  applyBtnTxt: { fontSize: 14, fontWeight: "700", color: colors.white, letterSpacing: -0.1 },
});
