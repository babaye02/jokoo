import React, { useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  StatusBar,
  Platform,
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { storage } from "@/src/utils/storage";
import { Btn, Txt } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";

const { width, height } = Dimensions.get("window");

type Slide = {
  key: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const SLIDES: Slide[] = [
  {
    key: "welcome",
    eyebrow: "Bienvenue sur Jokoo 🇸🇳",
    title: "Le marketplace qui rapproche les Sénégalais.",
    subtitle: "Services, mobilité et famille — tout dans une seule app.",
    image:
      "https://images.pexels.com/photos/2159065/pexels-photo-2159065.jpeg?auto=compress&cs=tinysrgb&w=1400",
    accent: "#00C2A8",
    icon: "sparkles",
  },
  {
    key: "services",
    eyebrow: "Services à domicile",
    title: "Trouvez le bon professionnel, près de chez vous.",
    subtitle: "Plombiers, électriciens, coiffeurs, ménage — vérifiés et notés.",
    image:
      "https://images.pexels.com/photos/8990724/pexels-photo-8990724.jpeg?auto=compress&cs=tinysrgb&w=1400",
    accent: "#00C2A8",
    icon: "construct",
  },
  {
    key: "mobility",
    eyebrow: "Jokoo Mobilité",
    title: "Covoiturez et livrez, partout au Sénégal.",
    subtitle: "Dakar, Saint-Louis, Thiès, Ziguinchor — trouvez un trajet ou envoyez un colis.",
    image:
      "https://images.pexels.com/photos/1592384/pexels-photo-1592384.jpeg?auto=compress&cs=tinysrgb&w=1400",
    accent: "#4CD9C4",
    icon: "car",
  },
  {
    key: "family",
    eyebrow: "Jokoo Family",
    title: "Baby-sitters et profs de confiance.",
    subtitle: "Profils Vérifiés+, casier judiciaire, formation premiers secours. Bouton SOS 24/7.",
    image:
      "https://images.pexels.com/photos/1128318/pexels-photo-1128318.jpeg?auto=compress&cs=tinysrgb&w=1400",
    accent: "#F59E0B",
    icon: "heart",
  },
  {
    key: "secure",
    eyebrow: "Sécurité & Confiance",
    title: "Paiements sécurisés. Support 24/7.",
    subtitle: "Stripe, Wave, Orange Money. Notre équipe basée à Dakar vous répond en français & wolof.",
    image:
      "https://images.pexels.com/photos/6693659/pexels-photo-6693659.jpeg?auto=compress&cs=tinysrgb&w=1400",
    accent: "#00C2A8",
    icon: "shield-checkmark",
  },
];

const HAPTIC = () => {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export default function Onboarding() {
  const router = useRouter();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [index, setIndexState] = React.useState(0);
  const indexRef = useRef(0);

  const updateIndex = useCallback((i: number) => {
    indexRef.current = i;
    setIndexState(i);
  }, []);

  const finish = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await storage.setItem("jokoo_onboarded", true);
    router.replace("/login");
  }, [router]);

  const goToIndex = useCallback((i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    updateIndex(i);
  }, [updateIndex]);

  const next = useCallback(() => {
    HAPTIC();
    const nextIndex = indexRef.current + 1;
    if (nextIndex >= SLIDES.length) {
      finish();
    } else {
      goToIndex(nextIndex);
    }
  }, [finish, goToIndex]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
    onMomentumEnd: (e) => {
      const i = Math.round(e.contentOffset.x / width);
      runOnJS(updateIndex)(i);
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.midnight }}>
      <StatusBar barStyle="light-content" />

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        bounces={false}
        style={StyleSheet.absoluteFill}
      >
        {SLIDES.map((slide, i) => (
          <SlideView key={slide.key} slide={slide} index={i} scrollX={scrollX} />
        ))}
      </Animated.ScrollView>

      {/* Overlay UI */}
      <SafeAreaView edges={["top", "bottom"]} style={styles.overlay} pointerEvents="box-none">
        {/* Skip */}
        <View style={styles.topBar} pointerEvents="box-none">
          <View />
          <Pressable
            onPress={() => {
              HAPTIC();
              finish();
            }}
            style={styles.skip}
            testID="onboarding-skip"
            hitSlop={12}
          >
            <Txt size="sm" weight="600" color={colors.white}>Passer</Txt>
          </Pressable>
        </View>

        {/* Bottom */}
        <View style={styles.bottom}>
          <Dots scrollX={scrollX} count={SLIDES.length} />
          <View style={{ height: spacing.md }} />
          {/* Titles per slide, tied to horizontal position */}
          <View style={{ height: 150, overflow: "hidden" }}>
            {SLIDES.map((slide, i) => (
              <SlideText key={slide.key} slide={slide} index={i} scrollX={scrollX} />
            ))}
          </View>
          <View style={{ height: spacing.lg }} />
          <NextButton isLast={index === SLIDES.length - 1} onPress={next} onFinish={finish} />
          <Pressable onPress={() => router.replace("/login")} style={{ alignSelf: "center", padding: spacing.md, marginTop: 4 }} hitSlop={10}>
            <Txt size="sm" color="rgba(255,255,255,0.75)">Déjà inscrit·e ? <Txt size="sm" weight="700" color={colors.turquoise}>Se connecter</Txt></Txt>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ------- SlideView (with parallax image + gradient overlay) -------
function SlideView({ slide, index, scrollX }: { slide: Slide; index: number; scrollX: Animated.SharedValue<number> }) {
  const imageStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    const translateX = interpolate(scrollX.value, inputRange, [width * 0.35, 0, -width * 0.35], Extrapolation.CLAMP);
    const scale = interpolate(scrollX.value, inputRange, [1.15, 1, 1.15], Extrapolation.CLAMP);
    return { transform: [{ translateX }, { scale }] };
  });

  const badgeStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    const scale = interpolate(scrollX.value, inputRange, [0.6, 1, 0.6], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0, 1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollX.value, inputRange, [40, 0, 40], Extrapolation.CLAMP);
    return { transform: [{ scale }, { translateY }], opacity };
  });

  return (
    <View style={{ width, height }}>
      <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
        <Image
          source={{ uri: slide.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
          placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7Rj~qofbHof" }}
        />
      </Animated.View>

      {/* Dark gradient for readability */}
      <LinearGradient
        colors={["rgba(11,31,58,0.15)", "rgba(11,31,58,0.55)", "rgba(11,31,58,0.95)", colors.midnight]}
        locations={[0, 0.35, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating icon badge */}
      <SafeAreaView edges={["top"]} style={styles.badgeWrap} pointerEvents="none">
        <Animated.View style={[styles.iconBadge, { backgroundColor: slide.accent }, badgeStyle]}>
          <Ionicons name={slide.icon} size={30} color={colors.midnight} />
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// ------- Animated title / subtitle per slide -------
function SlideText({ slide, index, scrollX }: { slide: Slide; index: number; scrollX: Animated.SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    const opacity = interpolate(scrollX.value, inputRange, [0, 1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollX.value, inputRange, [20, 0, 20], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Txt size="xs" weight="700" color={slide.accent} style={{ letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" }}>
        {slide.eyebrow}
      </Txt>
      <Txt size="xxl" weight="700" color={colors.white} style={{ lineHeight: 34, marginBottom: 10 }}>
        {slide.title}
      </Txt>
      <Txt size="md" color="rgba(255,255,255,0.82)" style={{ lineHeight: 22 }}>
        {slide.subtitle}
      </Txt>
    </Animated.View>
  );
}

// ------- Animated dots -------
function Dots({ scrollX, count }: { scrollX: Animated.SharedValue<number>; count: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }).map((_, i) => (
        <Dot key={i} index={i} scrollX={scrollX} />
      ))}
    </View>
  );
}

function Dot({ index, scrollX }: { index: number; scrollX: Animated.SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    const w = interpolate(scrollX.value, inputRange, [8, 28, 8], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.35, 1, 0.35], Extrapolation.CLAMP);
    return { width: w, opacity };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

// ------- CTA button (Suivant → Commencer on last slide) -------
function NextButton({ isLast, onPress, onFinish }: { isLast: boolean; onPress: () => void; onFinish: () => void }) {
  return (
    <Btn
      title={isLast ? "Commencer maintenant" : "Suivant"}
      onPress={isLast ? onFinish : onPress}
      fullWidth
      size="lg"
      testID="onboarding-next"
      icon={isLast ? "arrow-forward-circle" : "arrow-forward"}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  skip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  bottom: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: spacing.md,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginRight: 6,
    backgroundColor: "#00C2A8",
  },
  badgeWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: spacing.md,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
