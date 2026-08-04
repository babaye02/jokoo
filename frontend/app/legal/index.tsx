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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get<LegalDoc[]>("/legal/documents");
      setDocs(Array.isArray(r) ? r : []);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les documents juridiques.");
    } finally {
      setLoading(false);
    }
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
        {loading && docs.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
            <Txt color={colors.textMuted} style={{ marginTop: 12 }}>Chargement…</Txt>
          </View>
        ) : error && docs.length === 0 ? (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.turquoise} />
            <Txt weight="700" style={{ marginTop: 8 }}>Documents indisponibles</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center", lineHeight: 18 }}>
              {error}
            </Txt>
            <Pressable onPress={load} style={styles.retryBtn}>
              <Ionicons name="refresh" size={14} color={colors.white} />
              <Txt size="xs" weight="700" color={colors.white} style={{ marginLeft: 6 }}>Réessayer</Txt>
            </Pressable>
          </View>
        ) : docs.length === 0 ? (
          <View style={styles.errorCard}>
            <Ionicons name="folder-open-outline" size={32} color={colors.textMuted} />
            <Txt weight="700" style={{ marginTop: 8 }}>Aucun document publié</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center", lineHeight: 18 }}>
              Les documents juridiques seront bientôt disponibles.
            </Txt>
          </View>
        ) : Object.entries(CATEGORIES).map(([key, meta]) => {
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
  errorCard: {
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.xl,
    ...shadow.soft,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.turquoise,
    marginTop: 14,
  },
  footerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    marginTop: spacing.md,
  },
});
