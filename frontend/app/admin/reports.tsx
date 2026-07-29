// Support — liste des signalements (permission reports:handle).
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Report = { id: string; author_name: string; target_id?: string; target_type?: string; reason: string; status: string; created_at: string };

export default function AdminReports() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Report[]>([]);

  const load = useCallback(async () => {
    try { setItems(await api.get<Report[]>("/admin/reports")); } catch (e: any) { Alert.alert("Erreur", e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resolve = async (id: string) => {
    await api.patch(`/admin/reports/${id}`, { status: "resolved" });
    load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="rep-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Signalements</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        {items.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Ionicons name="checkmark-circle-outline" size={44} color={colors.success} />
              <Txt weight="600" style={{ marginTop: spacing.md }}>Aucun signalement en cours</Txt>
            </View>
          </Card>
        ) : items.map((r) => (
          <Card key={r.id} style={{ padding: spacing.md }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Txt weight="700">{r.author_name}</Txt>
                <Txt size="xs" color={colors.textMuted}>{r.target_type || "provider"} · {new Date(r.created_at).toLocaleDateString("fr-FR")}</Txt>
              </View>
              <View style={[styles.pill, { backgroundColor: r.status === "open" ? "#FEE2E2" : "#DCFCE7" }]}>
                <Txt size="xxs" weight="700" color={r.status === "open" ? colors.danger : colors.success}>
                  {r.status === "open" ? "OUVERT" : "RÉSOLU"}
                </Txt>
              </View>
            </View>
            <Txt size="sm" style={{ marginTop: 8, lineHeight: 20 }}>{r.reason}</Txt>
            {r.status === "open" ? (
              <Btn title="Marquer résolu" onPress={() => resolve(r.id)} style={{ marginTop: 12 }} testID={`rep-resolve-${r.id}`} />
            ) : null}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
});
