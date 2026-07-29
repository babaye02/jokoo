import { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Provider } from "@/src/api";
import { priceLabel } from "@/src/pricing";
import { Stars, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function Favorites() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Provider[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.get<Provider[]>("/favorites")); } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="favorites-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Favoris</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.turquoise} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 80 }}>
            <Ionicons name="heart-outline" size={56} color={colors.textSubtle} />
            <Txt size="md" weight="600" style={{ marginTop: spacing.md }}>Pas encore de favoris</Txt>
            <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6 }}>Ajoutez des pros à vos favoris</Txt>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/provider/${item.id}`)} style={styles.card}>
            <Image source={{ uri: item.photo || "https://images.unsplash.com/photo-1621905252472-943afaa20e20" }} style={styles.img} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt size="md" weight="700" style={{ flex: 1 }}>{item.name}</Txt>
                {item.verified ? <Ionicons name="checkmark-circle" size={16} color={colors.turquoise} /> : null}
              </View>
              <Txt size="xs" color={colors.textMuted}>{item.service} · {item.city}</Txt>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                <Stars value={item.rating} size={12} />
                <Txt size="xs" color={colors.textMuted} style={{ marginLeft: 6 }}>{item.rating.toFixed(1)}</Txt>
              </View>
            </View>
            <Txt weight="700" color={colors.turquoise} numberOfLines={2} style={{ textAlign: "right", maxWidth: 100 }}>{priceLabel(item)}</Txt>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, ...shadow.soft },
  img: { width: 64, height: 64, borderRadius: 16 },
});
