import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, TextInput, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api, Message } from "@/src/api";
import { Avatar, Txt } from "@/src/components/ui";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

export default function Chat() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const list = await api.get<Message[]>(`/chat/${id}/messages`);
    setItems(list);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    if (!text.trim() || !id) return;
    const t = text.trim();
    setText("");
    try {
      const m = await api.post<Message>(`/chat/${id}/messages`, { text: t, kind: "text" });
      setItems((x) => [...x, m]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 30);
    } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="chat-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginLeft: 8 }}>
          <Avatar name={name as string || "?"} size={40} />
          <View style={{ marginLeft: 10 }}>
            <Txt weight="700">{name || "Conversation"}</Txt>
            <Txt size="xxs" color={colors.turquoise}>● en ligne</Txt>
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.xl, gap: 8, paddingBottom: 8 }}
          renderItem={({ item }) => {
            const mine = item.from_id === user?.id;
            return (
              <View style={[styles.bubbleRow, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Txt color={mine ? colors.white : colors.text}>{item.text}</Txt>
                  <Txt size="xxs" color={mine ? "rgba(255,255,255,0.7)" : colors.textSubtle} style={{ marginTop: 4, alignSelf: "flex-end" }}>
                    {new Date(item.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </Txt>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 80 }}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.textSubtle} />
              <Txt color={colors.textMuted} style={{ marginTop: spacing.md }}>Dites bonjour 👋</Txt>
            </View>
          }
        />

        <View style={[styles.inputBar, { paddingBottom: 8 + insets.bottom }]}>
          <View style={styles.inputWrap}>
            <TextInput
              testID="chat-input"
              value={text}
              onChangeText={setText}
              placeholder="Message…"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
              multiline
            />
          </View>
          <Pressable onPress={send} style={styles.sendBtn} testID="chat-send">
            <Ionicons name="paper-plane" size={18} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  bubbleRow: { flexDirection: "row" },
  bubble: { maxWidth: "78%", padding: 12, borderRadius: 18 },
  bubbleMine: { backgroundColor: colors.turquoise, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, ...shadow.soft },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  inputWrap: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: colors.surface2, paddingHorizontal: 16, justifyContent: "center" },
  input: { fontSize: fs.md, color: colors.text, paddingVertical: 10 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center", marginLeft: 8 },
});
