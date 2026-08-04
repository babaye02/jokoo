// Landing page after a cancelled/failed payment redirect.
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function BookingCancelled() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { provider } = useLocalSearchParams<{ provider?: string }>();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.replace("/(tabs)")} style={styles.back} testID="cancelled-close">
          <Ionicons name="close" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Paiement annulé</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom }}>
        <View style={styles.box}>
          <View style={styles.iconWrap}>
            <Ionicons name="close" size={40} color={colors.white} />
          </View>
          <Txt size="xxl" weight="700" style={{ marginTop: spacing.md, textAlign: "center" }}>
            Paiement annulé
          </Txt>
          <Txt size="md" color={colors.textMuted} style={{ marginTop: 8, textAlign: "center", lineHeight: 22 }}>
            {"Votre paiement n'a pas été finalisé. Votre réservation est conservée, vous pouvez réessayer à tout moment depuis « Mes réservations »."}
          </Txt>
          {provider ? (
            <View style={styles.pill}>
              <Ionicons name="information-circle" size={14} color={colors.midnight} />
              <Txt size="xs" weight="700" color={colors.midnight} style={{ marginLeft: 6 }}>
                {provider === "wave" ? "Wave" : provider === "orange" ? "Orange Money" : "Carte bancaire"} · annulé
              </Txt>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
        <Btn
          title="Voir mes réservations"
          onPress={() => router.replace("/(tabs)/profile")}
          fullWidth
          size="lg"
          icon="arrow-forward"
          testID="cancelled-goto"
        />
      </View>
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
  box: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  iconWrap: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.danger, alignItems: "center", justifyContent: "center",
  },
  pill: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, backgroundColor: colors.brandTertiary,
    marginTop: spacing.md,
  },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.xl, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
});
