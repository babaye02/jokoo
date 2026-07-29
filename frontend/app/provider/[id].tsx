import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking, FlatList } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Provider, Review } from "@/src/api";
import { priceLabel } from "@/src/pricing";
import { Btn, Card, Stars, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function ProviderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<Provider | null>(null);
  const [fav, setFav] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const prov = await api.get<Provider>(`/providers/${id}`);
    setP(prov);
    const favs = await api.get<Provider[]>("/favorites").catch(() => []);
    setFav(favs.some((f) => f.id === id));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggleFav = async () => {
    if (!id) return;
    if (fav) { await api.del(`/favorites/${id}`); setFav(false); }
    else { await api.post(`/favorites/${id}`); setFav(true); }
  };

  if (!p) {
    return <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><Txt color={colors.textMuted}>Chargement…</Txt></View>;
  }

  const openChat = () => router.push({ pathname: "/chat/[id]", params: { id: p.id, name: p.name } });
  const call = () => p.phone && Linking.openURL(`tel:${p.phone}`);
  const book = () => router.push({ pathname: "/booking/[providerId]", params: { providerId: p.id } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Cover */}
        <View style={styles.cover}>
          <Image source={{ uri: p.photo || "https://images.unsplash.com/photo-1621905252472-943afaa20e20" }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(11,31,58,0.5)", "transparent"]} style={styles.coverTop} />
          <SafeAreaView edges={["top"]} style={styles.coverBar}>
            <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="provider-back">
              <Ionicons name="chevron-back" size={22} color={colors.midnight} />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={toggleFav} style={styles.iconBtn} testID="provider-fav">
                <Ionicons name={fav ? "heart" : "heart-outline"} size={22} color={fav ? colors.danger : colors.midnight} />
              </Pressable>
              <Pressable style={styles.iconBtn}>
                <Ionicons name="share-outline" size={22} color={colors.midnight} />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>

        {/* Card */}
        <View style={styles.body}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt size="xxl" weight="700">{p.name}</Txt>
                {p.verified ? <Ionicons name="checkmark-circle" size={20} color={colors.turquoise} style={{ marginLeft: 6 }} /> : null}
              </View>
              <Txt size="md" color={colors.textMuted} style={{ marginTop: 4 }}>{p.service}</Txt>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Txt size="sm" color={colors.textMuted} style={{ marginLeft: 4 }}>{p.city}</Txt>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", maxWidth: 150 }}>
              <Txt size="xl" weight="700" color={colors.turquoise} numberOfLines={2} style={{ textAlign: "right" }}>
                {priceLabel(p)}
              </Txt>
              <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2, textAlign: "right" }}>
                {p.price_type === "quote"
                  ? "Devis personnalisé"
                  : p.price_type === "from"
                  ? "Prix de départ"
                  : "Prix fixe"}
              </Txt>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.stats}>
            <Stat icon="star" label="Note" value={`${p.rating.toFixed(1)}`} color="#F59E0B" />
            <View style={styles.statDivider} />
            <Stat icon="chatbubbles-outline" label="Avis" value={`${p.reviews_count}`} color={colors.turquoise} />
            <View style={styles.statDivider} />
            <Stat icon="shield-checkmark" label="Statut" value={p.verified ? "Vérifié" : "Non vérifié"} color={colors.midnight} small />
          </View>

          {/* Description */}
          <Section title="À propos">
            <Txt size="md" color={colors.text} style={{ lineHeight: 22 }}>{p.description}</Txt>
          </Section>

          {p.hours ? (
            <Section title="Horaires">
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                <Txt style={{ marginLeft: 6 }}>{p.hours}</Txt>
              </View>
            </Section>
          ) : null}

          {p.zones && p.zones.length > 0 ? (
            <Section title="Zones d'intervention">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {p.zones.map((z) => (
                  <View key={z} style={styles.zoneChip}><Txt size="sm" weight="500">{z}</Txt></View>
                ))}
              </View>
            </Section>
          ) : null}

          {p.gallery && p.gallery.length > 0 ? (
            <Section title="Galerie">
              <FlatList
                data={p.gallery}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
                keyExtractor={(u, i) => `${u}-${i}`}
                renderItem={({ item }) => <Image source={{ uri: item }} style={styles.galleryImg} contentFit="cover" />}
              />
            </Section>
          ) : null}

          {/* Reviews */}
          <Section title={`Avis clients (${p.reviews_count})`}>
            {(p.reviews || []).slice(0, 5).map((r: Review) => (
              <Card key={r.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Txt weight="700">{r.author_name}</Txt>
                  <Stars value={r.rating} size={12} />
                </View>
                <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6, lineHeight: 20 }}>{r.comment}</Txt>
              </Card>
            ))}
            {(!p.reviews || p.reviews.length === 0) ? (
              <Txt color={colors.textMuted}>Aucun avis pour le moment.</Txt>
            ) : null}
          </Section>
        </View>
      </ScrollView>

      {/* Bottom sticky CTAs */}
      <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }]}>
        <Pressable onPress={call} style={styles.circleBtn} testID="provider-call">
          <Ionicons name="call" size={20} color={colors.midnight} />
        </Pressable>
        <Pressable onPress={openChat} style={styles.circleBtn} testID="provider-chat">
          <Ionicons name="chatbubble-ellipses" size={20} color={colors.midnight} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Btn title="Réserver" onPress={book} fullWidth icon="calendar-outline" testID="provider-book" />
        </View>
      </View>
    </View>
  );
}

function Stat({ icon, label, value, color, small }: { icon: any; label: string; value: string; color: string; small?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Ionicons name={icon} size={14} color={color} />
        <Txt size="lg" weight="700" numberOfLines={1} style={{ fontSize: small ? 15 : 18 }}>{value}</Txt>
      </View>
      <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>{label}</Txt>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Txt size="lg" weight="700" style={{ marginBottom: spacing.md }}>{title}</Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", height: 280 },
  coverTop: { position: "absolute", left: 0, right: 0, top: 0, height: 120 },
  coverBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" },
  body: {
    marginTop: -24, backgroundColor: colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: spacing.xl, ...shadow.strong,
  },
  stats: {
    marginTop: spacing.xl, flexDirection: "row",
    backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 14,
  },
  statDivider: { width: 1, backgroundColor: colors.divider },
  zoneChip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.brandTertiary, borderRadius: radius.pill },
  galleryImg: { width: 140, height: 100, borderRadius: radius.md },
  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl, paddingTop: 12,
    flexDirection: "row", alignItems: "center", gap: 10,
    ...shadow.strong,
  },
  circleBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
});
