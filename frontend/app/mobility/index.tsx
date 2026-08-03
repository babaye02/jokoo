import { View, StyleSheet, ScrollView, Pressable, Text } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function MobilityHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="mobility-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 11, letterSpacing: 1.6, color: colors.primary, fontWeight: "700", textTransform: "uppercase" }}>Jokoo Mobilité</Text>
          <Text style={{ fontFamily: "InstrumentSerif", fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: colors.text, marginTop: 2 }}>Bougez malin.</Text>
        </View>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontFamily: "InstrumentSerif", fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: colors.text, marginBottom: spacing.lg }}>Que souhaitez-vous faire ?</Text>

        {/* Covoiturage */}
        <Pressable
          onPress={() => router.push("/mobility/rides")}
          style={[styles.card, shadow.card]}
          testID="mobility-covoit"
        >
          <LinearGradient
            colors={["#0B1F3A", "#123058"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardInner}>
            <View style={styles.emojiCircle}>
              <Txt size="xxxl">🚗</Txt>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <View style={styles.badge}>
                <Txt size="xxs" weight="700" color={colors.midnight}>Populaire</Txt>
              </View>
              <Txt size="xl" weight="700" color={colors.white}>Covoiturage</Txt>
              <Txt size="sm" color="rgba(255,255,255,0.75)" style={{ marginTop: 4 }} numberOfLines={2}>
                Partagez un trajet ou publiez le vôtre. Court ou long courrier.
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.white} />
          </View>
        </Pressable>

        {/* Livraison */}
        <Pressable
          onPress={() => router.push("/mobility/delivery")}
          style={[styles.card, styles.cardLight, shadow.card]}
          testID="mobility-livraison"
        >
          <LinearGradient
            colors={["#00C2A8", "#0EA5E9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardInner}>
            <View style={styles.emojiCircle}>
              <Txt size="xxxl">📦</Txt>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <View style={[styles.badge, { backgroundColor: colors.turquoise }]}>
                <Txt size="xxs" weight="700" color={colors.white}>Nouveau</Txt>
              </View>
              <Txt size="xl" weight="700" color={colors.white}>Livraison</Txt>
              <Txt size="sm" color="rgba(255,255,255,0.85)" style={{ marginTop: 4 }} numberOfLines={2}>
                Colis longue distance via conducteurs covoiturage.
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.white} />
          </View>
        </Pressable>

        {/* Quick actions */}
        <Txt size="lg" weight="700" style={{ marginTop: spacing.xxl, marginBottom: spacing.md }}>Accès rapides</Txt>
        <View style={{ flexDirection: "row", gap: spacing.md, flexWrap: "wrap" }}>
          <QuickAction
            icon="add-circle"
            label="Publier un trajet"
            hint="Conducteur"
            onPress={() => router.push("/mobility/rides/publish")}
            testID="qa-publish"
          />
          <QuickAction
            icon="list"
            label="Mes trajets"
            hint="Passager"
            onPress={() => router.push("/mobility/rides/mine")}
            testID="qa-mine"
          />
          <QuickAction
            icon="cube"
            label="Envoyer un colis"
            hint="Longue distance"
            onPress={() => router.push("/mobility/delivery")}
            testID="qa-send-parcel"
          />
          <QuickAction
            icon="cube-outline"
            label="Mes colis"
            hint="Suivi & livraisons"
            onPress={() => router.push("/mobility/delivery/mine")}
            testID="qa-my-parcels"
          />
        </View>
      </ScrollView>
    </View>
  );
}

function QuickAction({ icon, label, hint, onPress, testID }: { icon: any; label: string; hint: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} style={styles.qa} testID={testID}>
      <View style={styles.qaIcon}>
        <Ionicons name={icon} size={22} color={colors.turquoise} />
      </View>
      <Txt size="sm" weight="700" style={{ marginTop: 8 }}>{label}</Txt>
      <Txt size="xxs" color={colors.textSubtle}>{hint}</Txt>
    </Pressable>
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
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  card: {
    height: 160,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  cardLight: {},
  cardInner: { flex: 1, flexDirection: "row", alignItems: "center", padding: spacing.lg },
  emojiCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.turquoise,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 6,
  },
  qa: {
    width: "48%",
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  qaIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
});
