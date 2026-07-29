import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Conversation } from "@/src/api";
import { Avatar, Txt } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";

function timeAgo(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString("fr-FR");
}

export default function Messages() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.get<Conversation[]>("/chat/conversations");
      setItems(list);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
        <Txt size="xxl" weight="700">Messages</Txt>
        <Txt size="sm" color={colors.textMuted} style={{ marginTop: 4 }}>Vos discussions avec les pros</Txt>
      </SafeAreaView>

      <FlatList
        data={items}
        keyExtractor={(c) => c.peer_id}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.turquoise} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.divider, marginLeft: 70 }} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 80 }}>
            <Ionicons name="chatbubbles-outline" size={56} color={colors.textSubtle} />
            <Txt size="md" weight="600" style={{ marginTop: spacing.md }}>Aucun message</Txt>
            <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6 }}>Contactez un pro depuis sa fiche</Txt>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.peer_id, name: item.peer_name } })}
            style={styles.row}
            testID={`conv-${item.peer_id}`}
          >
            <Avatar uri={item.peer_avatar} name={item.peer_name} size={54} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Txt size="md" weight="700" numberOfLines={1} style={{ flex: 1 }}>{item.peer_name}</Txt>
                <Txt size="xxs" color={colors.textSubtle}>{timeAgo(item.last_at)}</Txt>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                <Txt size="sm" color={item.unread ? colors.text : colors.textMuted} numberOfLines={1} style={{ flex: 1 }} weight={item.unread ? "600" : "400"}>
                  {item.last_message}
                </Txt>
                {item.unread ? (
                  <View style={styles.badge}>
                    <Txt size="xxs" color={colors.white} weight="700">{item.unread}</Txt>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  badge: {
    minWidth: 20, height: 20, paddingHorizontal: 6,
    borderRadius: radius.pill, backgroundColor: colors.turquoise,
    alignItems: "center", justifyContent: "center", marginLeft: 8,
  },
});
