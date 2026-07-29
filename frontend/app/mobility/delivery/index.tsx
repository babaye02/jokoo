import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Txt, Btn } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function DeliveryHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="delivery-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Livraison</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom }}>
        <View style={styles.hero}>
          <Txt size="xxxl" style={{ textAlign: "center" }}>📦</Txt>
          <Txt size="xxl" weight="700" style={{ marginTop: spacing.md, textAlign: "center" }}>
            Bientôt disponible
          </Txt>
          <Txt size="sm" color={colors.textMuted} style={{ marginTop: 8, textAlign: "center", lineHeight: 20 }}>
            Notre service de livraison arrive très prochainement.
            {"\n"}Motos, voitures, camionnettes et camions pour tous vos besoins.
          </Txt>
        </View>

        <Txt size="lg" weight="700" style={{ marginTop: spacing.xxl, marginBottom: spacing.md }}>
          Ce qui vous attend
        </Txt>
        {[
          { icon: "bicycle", label: "Livraison locale", desc: "Colis, courses, restaurants — motos rapides." },
          { icon: "car", label: "Interurbain", desc: "D'une ville à une autre au meilleur prix." },
          { icon: "time-outline", label: "Programmée", desc: "Choisissez une date et une heure précises." },
          { icon: "shield-checkmark-outline", label: "Livreurs vérifiés", desc: "Profils validés & avis clients." },
        ].map((f) => (
          <View key={f.label} style={styles.feature}>
            <View style={styles.featureIcon}>
              <Ionicons name={f.icon as any} size={22} color={colors.turquoise} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Txt size="md" weight="700">{f.label}</Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>{f.desc}</Txt>
            </View>
          </View>
        ))}

        <View style={{ marginTop: spacing.xxl }}>
          <Btn title="Retour à la mobilité" variant="secondary" fullWidth onPress={() => router.back()} testID="delivery-back-btn" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  hero: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: "center",
    marginTop: spacing.md,
    ...shadow.card,
  },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    ...shadow.soft,
  },
  featureIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
});
