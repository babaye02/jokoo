// Admin CRM Push — Bibliothèque de modèles (10 pré-remplis + custom).
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Card, Txt } from "@/src/components/ui";
import { colors, shadow, spacing } from "@/src/theme";

const CATEGORY_ICONS: Record<string, string> = {
  onboarding: "hand-right-outline", fete: "gift-outline", marketing: "megaphone-outline",
  reminder: "alarm-outline", system: "settings-outline", custom: "brush-outline",
};

export default function AdminPushTemplates() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.get<any[]>("/admin/push/templates")); }
    catch { /* silent */ }
    finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const use = (tpl: any) => {
    router.push(`/admin/push/create?template=${encodeURIComponent(tpl.key)}` as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Modèles ({items.length})</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {items.length === 0 ? (
          <Card><Txt color={colors.textMuted}>Aucun modèle. Rafraîchissez pour recharger.</Txt></Card>
        ) : items.map((t) => (
          <Pressable key={t.id} onPress={() => use(t)}>
            <Card style={{ padding: spacing.md, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.icon}>
                  <Ionicons name={(CATEGORY_ICONS[t.category] || "document-text-outline") as any} size={18} color={colors.turquoise} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt weight="700">{t.title_template}</Txt>
                  <Txt size="xxs" color={colors.textMuted}>{t.category} · {t.is_default ? "Modèle Jokoo" : "Personnalisé"}</Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </View>
              <Txt size="xs" color={colors.textMuted} numberOfLines={2}>{t.message_template}</Txt>
              {t.deep_link ? <Txt size="xxs" color={colors.turquoise}>🔗 {t.deep_link}</Txt> : null}
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: `${colors.turquoise}15`, alignItems: "center", justifyContent: "center" },
});
