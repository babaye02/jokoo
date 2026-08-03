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
import { colors, radius, spacing } from "@/src/theme";

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

// 5 slides — photos IA générées avec vocabulaire documentaire (Sony A7 IV).
// Direction : Airbnb × Apple × Aesop × Afrique contemporaine.
const SLIDES: Slide[] = [
  {
    key: "welcome",
    eyebrow: "Jokoo",
    title: "Tous vos services.\nEn un tap.",
    subtitle: "Le nouveau standard des services au Sénégal.",
    image: require("@/assets/onboarding/welcome.png"),
    accent: colors.primary,
    icon: "sparkles",
  },
  {
    key: "services",
    eyebrow: "Services",
    title: "Les meilleurs pros,\nà portée de main.",
    subtitle: "Coiffure, ménage, réparations, tech — vérifiés & notés.",
    image: require("@/assets/onboarding/services.png"),
    accent: colors.primary,
    icon: "construct",
  },
  {
    key: "mobility",
    eyebrow: "Mobilité",
    title: "Voyagez.\nLivrez.\nPartout.",
    subtitle: "Covoiturage et colis longue distance, avec des conducteurs vérifiés.",
    image: require("@/assets/onboarding/mobility.png"),
    accent: colors.primary,
    icon: "car-sport",
  },
  {
    key: "family",
    eyebrow: "Family",
    title: "Confiance.\nQualité.\nSérénité.",
    subtitle: "Baby-sitters vérifiées, tuteurs certifiés, SOS 24/7.",
    image: require("@/assets/onboarding/family.png"),
    accent: colors.accent,
    icon: "heart",
  },
  {
    key: "cta",
    eyebrow: "Commencez",
    title: "Rejoignez\nla nouvelle génération.",
    subtitle: "Créez votre compte en 30 secondes.",
    image: require("@/assets/onboarding/cta.png"),
    accent: colors.primary,
    icon: "arrow-forward",
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
    router.replace("/register");
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
          <AnimatedPressable
            onPress={() => router.replace("/login")}
            style={styles.ctaGhost}
            testID="onboarding-login"
            hapticStyle="selection"
          >
            <Txt style={{ color: colors.white, fontSize: 16, fontWeight: "600" }}>Se connecter</Txt>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={finish}
            style={styles.ctaPrimary}
            testID="onboarding-cta"
            hapticStyle="success"
          >
            <Txt style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Créer mon compte</Txt>
            <Ionicons name="arrow-forward" size={19} color={colors.text} style={{ marginLeft: 6 }} />
          </AnimatedPressable>
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

      {/* Scrim gradient renforcé — lecture parfaite garantie sur toutes photos */}
      <LinearGradient
        colors={[
          "rgba(11,31,58,0.65)",
          "rgba(11,31,58,0.20)",
          "rgba(11,31,58,0.85)",
          "rgba(11,31,58,0.98)",
        ]}
        locations={[0, 0.28, 0.65, 1]}
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

// Paginator ultra minimaliste — Apple/Revolut style : barres fines fluides
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
    const w = interpolate(scrollX.value, inputRange, [16, 40, 16], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.35, 1, 0.35], Extrapolation.CLAMP);
    return { width: w, opacity };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

// CTA animé — scale press + haptic
function AnimatedPressable({
  onPress,
  style,
  children,
  testID,
  hapticStyle = "selection",
}: {
  onPress: () => void;
  style?: any;
  children: React.ReactNode;
  testID?: string;
  hapticStyle?: "selection" | "medium" | "success";
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[animStyle, { flex: style?.flex, flexGrow: style?.flexGrow }]}>
      <Pressable
        onPressIn={() => {
          scale.value = 0.96;
        }}
        onPressOut={() => {
          scale.value = 1;
        }}
        onPress={() => {
          try {
            if (hapticStyle === "success")
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            else if (hapticStyle === "medium")
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            else Haptics.selectionAsync();
          } catch {}
          onPress();
        }}
        style={style}
        testID={testID}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
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
    color: colors.white,
    fontSize: 40,
    lineHeight: 46,
    fontFamily: "InstrumentSerif",
    letterSpacing: -0.8,
  },
  slideSubtitle: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    marginTop: 10,
    maxWidth: "90%",
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
    gap: 8,
  },
  dot: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.white,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ctaGhost: {
    flex: 1,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPrimary: {
    flex: 1.4,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
});
