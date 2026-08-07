// MobilityHeroCard — Carte hero premium pour les catégories Mobilité & Livraison sur le Home.
// Conserve les dimensions/spacing exacts des anciennes `.mobCard` (flex: 1, height: 120,
// borderRadius: radius.lg, padding: spacing.md, justifyContent: "flex-end") pour ne pas
// casser la grille, mais remplace les fonds unis par de vraies photos afro-descendantes
// (expo-image avec cache mémoire+disque) + overlay dégradé pour la lisibilité du texte
// + animation ressort Reanimated + haptique légère à l'appui.
import React from "react";
import { StyleSheet, Pressable, View, Platform } from "react-native";
import { Image, ImageSource } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing, shadow } from "@/src/theme";
import { Txt } from "./ui";

export type MobilityHeroCardProps = {
  title: string;
  subtitle: string;
  emoji?: string;
  source: ImageSource | number;
  onPress: () => void;
  /** Teinte d'accent en glow bas-gauche (rgba, ex: colors.turquoise) */
  accent?: string;
  /** Couleur de fondu bas (par défaut noir profond) */
  scrimColor?: string;
  testID?: string;
};

/**
 * Composant réutilisable pour les cartes Mobilité (Covoiturage) & Livraison.
 * Utilise `require()` d'assets locaux WebP pour un chargement instantané et un cache
 * durable via expo-image (`memory-disk`).
 */
export function MobilityHeroCard({
  title,
  subtitle,
  emoji,
  source,
  onPress,
  accent = "rgba(24,198,163,0.55)", // turquoise Jokoo semi-transparent
  scrimColor = "#000000",
  testID,
}: MobilityHeroCardProps) {
  const scale = useSharedValue(1);
  const brightness = useSharedValue(1);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const imgOverlayStyle = useAnimatedStyle(() => ({
    opacity: 1 - brightness.value,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.965, { damping: 18, stiffness: 320, mass: 0.5 });
    brightness.value = withTiming(0.88, { duration: 120, easing: Easing.out(Easing.quad) });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 260, mass: 0.6 });
    brightness.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
  };
  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress();
  };

  return (
    <Animated.View style={[styles.card, shadow.card, cardStyle]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={styles.pressable}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${subtitle}`}
      >
        {/* Photo de fond premium (asset local WebP) */}
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={220}
          priority="high"
          recyclingKey={typeof source === "number" ? String(source) : (source as any)?.uri}
        />

        {/* Dark scrim pour la lisibilité du texte (bottom-heavy) */}
        <LinearGradient
          colors={[
            "rgba(0,0,0,0)",
            `${hexToRgba(scrimColor, 0.35)}`,
            `${hexToRgba(scrimColor, 0.82)}`,
          ]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Glow d'accent bas-gauche (identité de marque) */}
        <LinearGradient
          colors={[accent, "transparent"]}
          start={{ x: 0, y: 1 }}
          end={{ x: 0.9, y: 0.2 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Overlay d'assombrissement animé à l'appui (Reanimated) */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, imgOverlayStyle]}
        />

        {/* Pill emoji/icône top-right (préserve le vocabulaire visuel) */}
        {emoji ? (
          <View style={styles.pill}>
            <Txt size="xl">{emoji}</Txt>
          </View>
        ) : null}

        {/* Bloc texte (le padding & justifyContent flex-end préservent la position) */}
        <View style={styles.textWrap}>
          <Txt size="md" weight="800" color={colors.white} style={styles.title}>
            {title}
          </Txt>
          <Txt
            size="xxs"
            color="rgba(255,255,255,0.9)"
            numberOfLines={2}
            style={styles.subtitle}
          >
            {subtitle}
          </Txt>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Convertit un hex (#RRGGBB) ou nom simple vers rgba(). Permet aux consommateurs de
 * fournir "#000000" ou "#0B1F3A" et de laisser le composant appliquer l'alpha du scrim.
 */
function hexToRgba(hex: string, alpha: number): string {
  if (!hex?.startsWith?.("#")) return `rgba(0,0,0,${alpha})`;
  const clean = hex.replace("#", "");
  const bigint =
    clean.length === 3
      ? parseInt(
          clean
            .split("")
            .map((c) => c + c)
            .join(""),
          16,
        )
      : parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

const styles = StyleSheet.create({
  // Dimensions IDENTIQUES aux anciennes .mobCard (flex:1, height:120, radius.lg).
  card: {
    flex: 1,
    height: 120,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#0F0F14", // fallback en attendant le chargement de l'image
  },
  pressable: {
    flex: 1,
    padding: spacing.md,
    justifyContent: "flex-end",
  },
  pill: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { backdropFilter: "blur(10px)" as any },
      web: { backdropFilter: "blur(10px)" as any },
      default: {},
    }),
  },
  textWrap: {
    // padding hérité du pressable → la position textuelle est identique à l'ancienne carte
  },
  title: {
    letterSpacing: -0.2,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: {
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
