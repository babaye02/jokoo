import { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Notif } from "@/src/api";
import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const iconFor = (t: string): any => {
  if (t.startsWith("booking")) return "calendar";
  if (t === "message") return "chatbubble-ellipses";
  if (t.includes("payment")) return "card";
  return "notifications";
};

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Notif[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.get<Notif[]>("/notifications");
      setItems(list);
    } catch {}
  }, []);

  const markAll = useCallback(async () => {
    await api.post("/notifications/read-all");
    load();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt size="xxl" weight="700">Notifications</Txt>
          <Pressable onPress={markAll} testID="notif-mark-read">
            <Txt size="sm" weight="600" color={colors.turquoise}>Tout lire</Txt>
          </Pressable>
        </View>
      </SafeAreaView>

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.turquoise} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 80 }}>
            <Ionicons name="notifications-off-outline" size={56} color={colors.textSubtle} />
            <Txt size="md" weight="600" style={{ marginTop: spacing.md }}>Aucune notification</Txt>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.item, !item.read && { backgroundColor: "#F0FBF8", borderColor: colors.brandTertiary }]}>
            <View style={[styles.icon, { backgroundColor: item.read ? colors.surface2 : colors.brandTertiary }]}>
              <Ionicons name={iconFor(item.type)} size={20} color={item.read ? colors.textMuted : colors.turquoise} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt weight="600">{item.title}</Txt>
              <Txt size="sm" color={colors.textMuted} style={{ marginTop: 2 }}>{item.body}</Txt>
            </View>
            {!item.read ? <View style={styles.dot} /> : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.turquoise, marginLeft: 8 },
});
