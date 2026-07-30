// Splash / entry — routes to onboarding, auth, or tabs based on state.
// Premium animated splash: logo scale-in, brand fade-up, tagline pulse.
import { useEffect, useRef } from "react";
import { View, StyleSheet, Text, Animated, Easing, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { storage } from "@/src/utils/storage";
import { colors, fs, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth";

const ONBOARDING_KEY = "jokoo_onboarded";
const { width, height } = Dimensions.get("window");

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const logoScale = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const brandTranslate = useRef(new Animated.Value(20)).current;
  const brandOpacity = useRef(new Animated.Value(0)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const ringPulse = useRef(new Animated.Value(0)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Sequenced reveal — Airbnb-style: mask fade, logo pop, brand slide-up, tag fade
    Animated.sequence([
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(brandTranslate, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(brandOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(tagOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle infinite pulse ring
    Animated.loop(
      Animated.timing(ringPulse, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    ).start();
  }, [bgOpacity, logoScale, logoOpacity, brandTranslate, brandOpacity, tagOpacity, ringPulse]);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const onboarded = await storage.getItem<boolean>(ONBOARDING_KEY, false);
      // Total reveal ~1.6s so users feel the premium moment
      setTimeout(() => {
        if (!onboarded) router.replace("/onboarding");
        else if (!user) router.replace("/login");
        else router.replace("/(tabs)");
      }, 1700);
    })();
  }, [loading, user, router]);

  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2] });
  const ringOpacity = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={styles.container} testID="splash-screen">
      {/* Background gradient */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: bgOpacity }]}>
        <LinearGradient
          colors={[colors.midnight, "#0A1A31", "#050D1B"]}
          style={StyleSheet.absoluteFill}
        />
        {/* Subtle turquoise glow */}
        <View style={styles.glow} />
      </Animated.View>

      <View style={styles.center}>
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          {/* Pulse rings */}
          <Animated.View
            style={[
              styles.ring,
              {
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
          <Animated.View
            style={{
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
              alignItems: "center",
            }}
          >
            <View style={styles.logoBox}>
              <Ionicons name="briefcase" size={44} color={colors.midnight} />
            </View>
          </Animated.View>
        </View>

        <Animated.View
          style={{
            opacity: brandOpacity,
            transform: [{ translateY: brandTranslate }],
            alignItems: "center",
            marginTop: spacing.xl,
          }}
        >
          <Text style={styles.brand}>Jokoo</Text>
        </Animated.View>

        <Animated.View style={{ opacity: tagOpacity, marginTop: spacing.sm, alignItems: "center" }}>
          <Text style={styles.tag}>Trouvez le bon professionnel.</Text>
          <View style={styles.flagRow}>
            <Text style={styles.flag}>🇸🇳</Text>
            <Text style={styles.made}>Fabriqué au Sénégal</Text>
          </View>
        </Animated.View>
      </View>

      {/* Bottom loader */}
      <Animated.View style={[styles.bottomHint, { opacity: tagOpacity }]}>
        <View style={styles.loaderDot} />
        <View style={[styles.loaderDot, { animationDelay: "150ms" as any }]} />
        <View style={styles.loaderDot} />
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
  glow: {
    position: "absolute",
    top: height / 2 - 200,
    left: width / 2 - 200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: colors.turquoise,
    opacity: 0.08,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: colors.turquoise,
  },
  logoBox: {
    width: 108,
    height: 108,
    borderRadius: 32,
    backgroundColor: colors.turquoise,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.turquoise,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  brand: {
    color: colors.white,
    fontSize: 52,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  tag: {
    color: "rgba(255,255,255,0.7)",
    fontSize: fs.md,
    fontWeight: "500",
    marginTop: 4,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  flag: { fontSize: 14, marginRight: 6 },
  made: {
    color: "rgba(255,255,255,0.85)",
    fontSize: fs.xs,
    fontWeight: "600",
  },
  bottomHint: {
    position: "absolute",
    bottom: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  loaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.turquoise,
    marginHorizontal: 3,
    opacity: 0.6,
  },
});
