// Onboarding Jokoo v2 — Design System 2026
// Full-bleed hero photo par écran + scroll parallax + fade texte + CTA sticky
// Personnes noires africaines/afro-descendantes premium, ambiance Pinterest éditoriale.
import React, { useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  StatusBar,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { storage } from "@/src/utils/storage";
import { Txt } from "@/src/components/ui";
import { colors, radius, spacing, typo } from "@/src/theme";

const { width, height } = Dimensions.get("window");

type Slide = {
  key: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  image: any;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
};

// 5 slides — photos générées par Gemini Nano Banana (IA).
// Direction : African premium, éditorial Pinterest, personnes noires africaines.
const SLIDES: Slide[] = [
  {
    key: "welcome",
    eyebrow: "Bienvenue sur Jokoo",
    title: "Le marketplace qui rapproche l'Afrique moderne.",
    subtitle:
      "Prestataires vérifiés, paiement sécurisé, une seule app pour tous vos besoins.",
    image: require("@/assets/onboarding/welcome.png"),
    accent: colors.turquoise,
    icon: "sparkles",
  },
  {
    key: "services",
    eyebrow: "Services à domicile",
    title: "Les meilleurs professionnels, à portée de main.",
    subtitle:
      "Coiffure, maquillage, plomberie, électricité, ménage — des experts sélectionnés avec soin.",
    image: require("@/assets/onboarding/services.png"),
    accent: colors.turquoise,
    icon: "construct",
  },
  {
    key: "mobility",
    eyebrow: "Jokoo Mobilité",
    title: "Voyagez et livrez, partout au Sénégal.",
    subtitle:
      "Covoiturez ou envoyez vos colis grâce à notre réseau de conducteurs vérifiés.",
    image: require("@/assets/onboarding/mobility.png"),
    accent: colors.turquoiseLight,
    icon: "car-sport",
  },
  {
    key: "family",
    eyebrow: "Jokoo Family",
    title: "La confiance pour toute la famille.",
    subtitle:
      "Baby-sitters Vérifiées+, tuteurs certifiés, bouton SOS 24/7. La sérénité en un clic.",
    image: require("@/assets/onboarding/family.png"),
    accent: "#F5A623",
    icon: "heart",
  },
  {
    key: "cta",
    eyebrow: "Prêt à commencer ?",
    title: "Rejoignez la nouvelle génération de services au Sénégal.",
    subtitle:
      "Créez votre compte en 30 secondes. Client ou prestataire — vous choisissez.",
    image: require("@/assets/onboarding/cta.png"),
    accent: colors.turquoise,
    icon: "rocket",
  },
];

const AnimatedScrollView = Animated.ScrollView;

export default function OnboardingPremium() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<any>(null);
  const scrollX = useSharedValue(0);
  const currentIndexRef = useRef(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const setIdx = useCallback((i: number) => {
    currentIndexRef.current = i;
  }, []);

  const finish = useCallback(async () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    try { await storage.setItem("onboarding_done", true); } catch {}
    router.replace("/signup");
  }, [router]);

  const skip = useCallback(async () => {
    try { await storage.setItem("onboarding_done", true); } catch {}
    router.replace("/login");
  }, [router]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Slides with scroll parallax */}
      <AnimatedScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          runOnJS(setIdx)(idx);
        }}
      >
        {SLIDES.map((slide, index) => (
          <SlideView key={slide.key} slide={slide} index={index} scrollX={scrollX} />
        ))}
      </AnimatedScrollView>

      {/* Top overlay : Skip button */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={{ flex: 1 }} />
        <Pressable onPress={skip} hitSlop={16} style={styles.skipBtn} testID="onboarding-skip">
          <Txt style={{ color: colors.white, fontSize: 13, fontWeight: "600" }}>Passer</Txt>
        </Pressable>
      </View>

      {/* Bottom overlay : paginator + CTAs */}
      <View
        style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}
        pointerEvents="box-none"
      >
        <Paginator scrollX={scrollX} count={SLIDES.length} />

        <View style={styles.ctaRow}>
          <Pressable
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              router.replace("/login");
            }}
            style={styles.ctaGhost}
            testID="onboarding-login"
          >
            <Txt style={{ color: colors.white, fontSize: 15, fontWeight: "600" }}>Se connecter</Txt>
          </Pressable>
          <Pressable onPress={finish} style={styles.ctaPrimary} testID="onboarding-cta">
            <Txt style={{ color: colors.midnight, fontSize: 15, fontWeight: "700" }}>Créer mon compte</Txt>
            <Ionicons name="arrow-forward" size={18} color={colors.midnight} style={{ marginLeft: 6 }} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Single slide with parallax
function SlideView({ slide, index, scrollX }: { slide: Slide; index: number; scrollX: any }) {
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  const imageStyle = useAnimatedStyle(() => {
    const translateX = interpolate(scrollX.value, inputRange, [width * 0.3, 0, -width * 0.3], Extrapolation.CLAMP);
    const scale = interpolate(scrollX.value, inputRange, [1.15, 1, 1.15], Extrapolation.CLAMP);
    return { transform: [{ translateX }, { scale }] };
  });

  const textStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollX.value, inputRange, [0, 1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollX.value, inputRange, [40, 0, 40], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  return (
    <View style={{ width, height }}>
      {/* Parallaxed image */}
      <Animated.View style={[StyleSheet.absoluteFillObject, imageStyle]}>
        <Image
          source={slide.image}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={400}
          cachePolicy="memory-disk"
          priority="high"
        />
      </Animated.View>

      {/* Scrim gradient (dark bottom + subtle top) */}
      <LinearGradient
        colors={[
          "rgba(11,31,58,0.35)",
          "rgba(11,31,58,0.0)",
          "rgba(11,31,58,0.55)",
          "rgba(11,31,58,0.92)",
        ]}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Text block (bottom 40%) */}
      <SafeAreaView edges={["bottom"]} style={styles.slideContent}>
        <Animated.View style={[styles.textBlock, textStyle]}>
          <View style={[styles.eyebrowRow, { backgroundColor: `${slide.accent}33` }]}>
            <Ionicons name={slide.icon} size={14} color={slide.accent} />
            <Txt style={styles.eyebrow}>{slide.eyebrow}</Txt>
          </View>
          <Txt style={styles.slideTitle}>{slide.title}</Txt>
          <Txt style={styles.slideSubtitle}>{slide.subtitle}</Txt>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// Paginator dots with progress interpolation
function Paginator({ scrollX, count }: { scrollX: any; count: number }) {
  return (
    <View style={styles.paginator}>
      {Array.from({ length: count }).map((_, i) => (
        <Dot key={i} index={i} scrollX={scrollX} />
      ))}
    </View>
  );
}

function Dot({ index, scrollX }: { index: number; scrollX: any }) {
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
  const style = useAnimatedStyle(() => {
    const w = interpolate(scrollX.value, inputRange, [8, 28, 8], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.4, 1, 0.4], Extrapolation.CLAMP);
    return { width: w, opacity };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.midnight },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },

  slideContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    paddingBottom: 180, // laisser place aux CTA en bas
  },
  textBlock: { gap: 12 },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 6,
  },
  eyebrow: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  slideTitle: {
    ...typo.display,
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
  },
  slideSubtitle: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    marginTop: 4,
  },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  paginator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ctaGhost: {
    flex: 1,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPrimary: {
    flex: 1.4,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
});
