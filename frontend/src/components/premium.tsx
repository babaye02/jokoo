// Composants premium Jokoo — HeroPhoto, GlassContainer, CategoryCard, SectionHeader
// À utiliser dans onboarding, home, cartes catégories, fiches prestataires.
import React, { ReactNode } from "react";
import {
  View,
  StyleSheet,
  ViewStyle,
  Pressable,
  Platform,
} from "react-native";
import { Image, ImageContentFit } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, shadow, glass, typo } from "@/src/theme";
import { Txt } from "./ui";

// ============================================================================
// HeroPhoto — Full-bleed ou containerized photo + scrim gradient automatique
// ============================================================================
export function HeroPhoto({
  source,
  height,
  aspectRatio,
  radius: r,
  overlay = "bottom",
  overlayStrength = 0.75,
  contentFit = "cover",
  children,
  style,
}: {
  source: string | { uri: string };
  height?: number;
  aspectRatio?: number;
  radius?: number;
  overlay?: "bottom" | "top" | "both" | "none";
  overlayStrength?: number; // 0-1
  contentFit?: ImageContentFit;
  children?: ReactNode;
  style?: ViewStyle;
}) {
  const uri = typeof source === "string" ? source : source.uri;
  const gradientColors =
    overlay === "top"
      ? [`rgba(11,31,58,${overlayStrength})`, "transparent"]
      : overlay === "both"
      ? [`rgba(11,31,58,${overlayStrength * 0.5})`, "transparent", "transparent", `rgba(11,31,58,${overlayStrength})`]
      : ["transparent", `rgba(11,31,58,${overlayStrength})`];

  return (
    <View
      style={[
        {
          width: "100%",
          height,
          aspectRatio,
          borderRadius: r,
          overflow: "hidden",
          backgroundColor: colors.surfaceWarm2,
        },
        style,
      ]}
    >
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFillObject}
        contentFit={contentFit}
        transition={300}
        cachePolicy="memory-disk"
      />
      {overlay !== "none" ? (
        <LinearGradient
          colors={gradientColors as any}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      ) : null}
      {children ? (
        <View style={StyleSheet.absoluteFillObject}>{children}</View>
      ) : null}
    </View>
  );
}

// ============================================================================
// GlassContainer — Fond glassmorphique cross-platform (iOS/Android/Web)
// ============================================================================
export function GlassContainer({
  intensity,
  tint = "light",
  style,
  children,
  radius: r = radius.lg,
}: {
  intensity?: number;
  tint?: "light" | "dark" | "default";
  style?: ViewStyle;
  children?: ReactNode;
  radius?: number;
}) {
  const iOS = Platform.OS === "ios";
  const eff = intensity ?? (iOS ? glass.intensityIOS : glass.intensityAndroid);
  const fallbackBg = tint === "dark" ? glass.tintDark : glass.tintBase;

  if (Platform.OS === "web") {
    // Web fallback : backdrop-filter via inline style
    return (
      <View
        style={[
          {
            borderRadius: r,
            overflow: "hidden",
            backgroundColor: fallbackBg,
            // @ts-ignore : web-only style
            backdropFilter: `blur(${eff / 5}px) saturate(1.4)`,
            WebkitBackdropFilter: `blur(${eff / 5}px) saturate(1.4)`,
          } as any,
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View style={[{ borderRadius: r, overflow: "hidden" }, style]}>
      <BlurView
        intensity={eff}
        tint={tint}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: fallbackBg }]} />
      <View>{children}</View>
    </View>
  );
}

// ============================================================================
// CategoryCard — Grande carte hero photo + icône signature + label
// Utilisée sur Home et écran de catégories.
// ============================================================================
export function CategoryCard({
  label,
  emoji,
  icon,
  photo,
  onPress,
  color = colors.turquoise,
  size = "md",
  testID,
}: {
  label: string;
  emoji?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  photo: string;
  onPress?: () => void;
  color?: string;
  size?: "sm" | "md" | "lg";
  testID?: string;
}) {
  const heights = { sm: 120, md: 180, lg: 240 };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
      testID={testID}
    >
      <HeroPhoto
        source={photo}
        height={heights[size]}
        radius={radius.xl}
        overlay="bottom"
        overlayStrength={0.7}
        style={shadow.card}
      >
        <View style={styles.catInner}>
          {icon || emoji ? (
            <View style={[styles.catIconWrap, { backgroundColor: `${color}E6` }]}>
              {icon ? (
                <Ionicons name={icon} size={18} color={colors.white} />
              ) : (
                <Txt style={{ fontSize: 20 }}>{emoji}</Txt>
              )}
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <Txt style={[typo.h3, { color: colors.white }]} numberOfLines={2}>
            {label}
          </Txt>
        </View>
      </HeroPhoto>
    </Pressable>
  );
}

// ============================================================================
// SectionHeader — Titre + sous-titre éditorial pour sections Home
// ============================================================================
export function SectionHeader({
  overline,
  title,
  subtitle,
  action,
  style,
}: {
  overline?: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.sectionHead, style]}>
      <View style={{ flex: 1 }}>
        {overline ? (
          <Txt style={[typo.overline, { color: colors.turquoise, marginBottom: 4 }]}>
            {overline}
          </Txt>
        ) : null}
        <Txt style={typo.h2} numberOfLines={2}>{title}</Txt>
        {subtitle ? (
          <Txt style={[typo.body, { marginTop: 4 }]} numberOfLines={2}>{subtitle}</Txt>
        ) : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={12}>
          <Txt style={[typo.captionBold, { color: colors.turquoise }]}>
            {action.label} →
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

// ============================================================================
// PremiumChip — Pill discret pour tags/statuts/pilules
// ============================================================================
export function PremiumChip({
  label,
  color = colors.text,
  bg = colors.surfaceWarm2,
  icon,
  size = "md",
}: {
  label: string;
  color?: string;
  bg?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? { paddingHorizontal: 8, paddingVertical: 3 } : { paddingHorizontal: 12, paddingVertical: 6 };
  const fontSize = size === "sm" ? 11 : 12;
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          borderRadius: radius.pill,
          backgroundColor: bg,
        },
        pad,
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={fontSize + 2} color={color} style={{ marginRight: 4 }} />
      ) : null}
      <Txt style={{ fontSize, color, fontWeight: "600" }}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  catInner: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  catIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    gap: spacing.md,
  },
});
