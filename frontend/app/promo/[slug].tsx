// Landing d'une offre promotionnelle Jokoo — accessible via /promo/{slug}.
// Une bannière peut cibler cette page en choisissant `link_type=promo` + `link_target=<slug>`.
import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Promo } from "@/src/api";
import { openAdDestination } from "@/src/navigation/adDestination";
import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function PromoScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [promo, setPromo] = useState<Promo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api
      .get<Promo>(`/promos/${slug}`, false)
      .then((p) => { setPromo(p); setErr(null); })
      .catch((e: any) => setErr(e?.message || "Promo introuvable"))
      .finally(() => setLoading(false));
  }, [slug]);

  const openCta = () => {
    if (!promo) return;
    openAdDestination(
      { link_type: promo.cta_link_type, link_target: promo.cta_link_target },
      router,
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: promo?.bg_color || colors.surface }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="promo-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Offre</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.turquoise} />
        </View>
      ) : err || !promo ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
          <Ionicons name="pricetags-outline" size={40} color={colors.textMuted} />
          <Txt size="lg" weight="700" style={{ marginTop: spacing.md, textAlign: "center" }}>
            Promo introuvable
          </Txt>
          <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
            {err || "Cette offre n'est plus disponible."}
          </Txt>
          <Btn title="Retour à l'accueil" onPress={() => router.replace("/(tabs)")} style={{ marginTop: spacing.lg }} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
          {promo.image ? (
            <Image source={{ uri: promo.image }} style={styles.cover} contentFit="cover" />
          ) : (
            <View style={[styles.cover, { backgroundColor: colors.midnight }]}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="pricetags" size={54} color={colors.turquoise} />
              </View>
            </View>
          )}
          <View style={{ padding: spacing.xl }}>
            {promo.discount_label ? (
              <View style={styles.discountPill}>
                <Ionicons name="pricetag" size={12} color={colors.white} />
                <Txt size="xs" weight="700" color={colors.white} style={{ marginLeft: 4 }}>
                  {promo.discount_label}
                </Txt>
              </View>
            ) : null}
            <Txt size="xxl" weight="700" style={{ marginTop: promo.discount_label ? 12 : 0 }}>
              {promo.title}
            </Txt>
            {promo.subtitle ? (
              <Txt size="md" color={colors.textMuted} style={{ marginTop: 6 }}>
                {promo.subtitle}
              </Txt>
            ) : null}
            {promo.description ? (
              <Txt size="md" style={{ marginTop: spacing.lg, lineHeight: 24 }}>
                {promo.description}
              </Txt>
            ) : null}
            {promo.ends_at ? (
              <View style={styles.endsRow}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Txt size="xs" color={colors.textMuted} style={{ marginLeft: 4 }}>
                  {"Valable jusqu'au "}{new Date(promo.ends_at).toLocaleDateString("fr-FR")}
                </Txt>
              </View>
            ) : null}
          </View>
        </ScrollView>
      )}

      {promo && (promo.cta_link_type && promo.cta_link_target) ? (
        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn
            title={promo.cta_label || "En profiter"}
            onPress={openCta}
            fullWidth
            size="lg"
            icon="arrow-forward"
            testID="promo-cta"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", height: 220 },
  discountPill: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, backgroundColor: colors.turquoise,
  },
  endsRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.xl, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
});
