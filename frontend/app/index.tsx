// Splash / entry screen — routes to onboarding, auth, or tabs based on state.
import { useEffect, useRef } from "react";
import { View, StyleSheet, Text, Animated, Easing } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { storage } from "@/src/utils/storage";
import { colors, fs, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth";

const ONBOARDING_KEY = "jokoo_onboarded";

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }),
    ]).start();
  }, [opacity, scale]);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const onboarded = await storage.getItem<boolean>(ONBOARDING_KEY, false);
      // give splash time to breathe
      setTimeout(() => {
        if (!onboarded) router.replace("/onboarding");
        else if (!user) router.replace("/login");
        else router.replace("/(tabs)");
      }, 900);
    })();
  }, [loading, user, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <Animated.View style={{ transform: [{ scale }], opacity, alignItems: "center" }}>
        <View style={styles.logoBox}>
          <Ionicons name="briefcase" size={40} color={colors.white} />
        </View>
        <Text style={styles.brand}>Jokoo</Text>
        <Text style={styles.tag}>Trouvez le bon professionnel.</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.midnight,
    alignItems: "center",
    justifyContent: "center",
  },
  logoBox: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: colors.turquoise,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  brand: {
    color: colors.white,
    fontSize: 44,
    fontWeight: "700",
    letterSpacing: 1,
  },
  tag: {
    marginTop: spacing.sm,
    color: "rgba(255,255,255,0.7)",
    fontSize: fs.md,
    fontWeight: "500",
  },
});
