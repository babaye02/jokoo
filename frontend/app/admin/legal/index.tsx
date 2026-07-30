import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type LegalDoc = { slug: string; title: string; category: string; version: number; published: boolean; requires_acceptance: boolean; updated_at: string };

export default function AdminLegalList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setDocs(await api.get<LegalDoc[]>("/legal/documents")); } catch { /* */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Txt size="lg" weight="700">Documents juridiques</Txt>
          <Txt size="xs" color={colors.textMuted}>{docs.length} documents · Éditeur admin</Txt>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 80 + insets.bottom, gap: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {docs.map((d) => (
          <Pressable
            key={d.slug}
            onPress={() => router.push(`/admin/legal/${d.slug}`)}
            style={styles.row}
            testID={`admin-legal-${d.slug}`}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt weight="700">{d.title}</Txt>
                {!d.published ? (
                  <View style={styles.draftPill}><Txt size="xxs" weight="700" color="#92400E">Brouillon</Txt></View>
                ) : null}
                {d.requires_acceptance ? (
                  <View style={styles.reqPill}><Txt size="xxs" weight="700" color="#1E40AF">Obligatoire</Txt></View>
                ) : null}
              </View>
              <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                {d.category} · v{d.version} · MAJ {d.updated_at?.slice(0, 10)}
              </Txt>
            </View>
            <Ionicons name="create-outline" size={18} color={colors.turquoise} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft, gap: 10 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, ...shadow.soft },
  draftPill: { marginLeft: 6, backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  reqPill: { marginLeft: 6, backgroundColor: "#DBEAFE", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
});
