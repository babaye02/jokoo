import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api";
import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type LegalDoc = {
  slug: string;
  title: string;
  summary?: string;
  category: string;
  version: number;
  effective_date: string;
  updated_at: string;
  requires_acceptance: boolean;
};

const CATEGORIES: Record<string, { label: string; icon: any; color: string }> = {
  conditions: { label: "Conditions & Confidentialité", icon: "document-text", color: "#0B1F3A" },
  paiements: { label: "Paiements & Remboursements", icon: "card", color: "#00C2A8" },
  securite: { label: "Sécurité & Protection", icon: "shield-checkmark", color: "#EF4444" },
  communaute: { label: "Communauté & Contenus", icon: "people", color: "#7C3AED" },
  aide: { label: "Aide & Contact", icon: "help-buoy", color: "#F59E0B" },
};

export default function LegalCenter() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<LegalDoc[]>("/legal/documents");
      setDocs(r);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const grouped = docs.reduce<Record<string, LegalDoc[]>>((acc, d) => {
    (acc[d.category] = acc[d.category] || []).push(d);
    return acc;
  }, {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <LinearGradient
          colors={["#0B1F3A", "#00C2A8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.back} testID="legal-back">
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ marginTop: 8, paddingHorizontal: spacing.xl }}>
          <Txt size="xxs" weight="700" color="rgba(255,255,255,0.85)">CENTRE JURIDIQUE ⚖️</Txt>
          <Txt size="xxl" weight="800" color={colors.white} style={{ marginTop: 4 }}>
            Vos droits, notre transparence.
          </Txt>
          <Txt size="xs" color="rgba(255,255,255,0.9)" style={{ marginTop: 6, lineHeight: 18 }}>
            {docs.length} documents officiels — consultez, comprenez, gardez le contrôle.
          </Txt>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 80 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {Object.entries(CATEGORIES).map(([key, meta]) => {
          const items = grouped[key] || [];
          if (items.length === 0) return null;
          return (
            <View key={key} style={{ marginBottom: spacing.xl }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
                <View style={[styles.catIcon, { backgroundColor: `${meta.color}15` }]}>
                  <Ionicons name={meta.icon} size={16} color={meta.color} />
                </View>
                <Txt size="md" weight="800" style={{ marginLeft: 10 }}>{meta.label}</Txt>
              </View>
              <View style={styles.card}>
                {items.map((d, i) => (
                  <Pressable
                    key={d.slug}
                    onPress={() => router.push(`/legal/${d.slug}`)}
                    style={[styles.row, i < items.length - 1 && styles.rowDivider]}
                    testID={`legal-doc-${d.slug}`}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Txt weight="700">{d.title}</Txt>
                        {d.requires_acceptance ? (
                          <View style={styles.reqPill}>
                            <Txt size="xxs" weight="700" color="#92400E">Obligatoire</Txt>
                          </View>
                        ) : null}
                      </View>
                      <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                        v{d.version} · Effet {d.effective_date}
                      </Txt>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}

        <View style={styles.footerCard}>
          <Ionicons name="mail" size={20} color={colors.turquoise} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Txt weight="700">Une question juridique ?</Txt>
            <Txt size="xs" color={colors.textMuted}>Écrivez-nous à support@jokooservices.com</Txt>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: "hidden" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  catIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow.card },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  reqPill: { marginLeft: 6, backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  footerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    marginTop: spacing.md,
  },
});
