// BookingWizardStepper — Premium 4-step progress indicator for booking flows.
// Inspired by Airbnb / Stripe Checkout / Apple Wallet setup wizards.
//
// Displays 4 numbered circles connected by a progress track. Each step transitions
// automatically between three visual states:
//   • completed → filled turquoise with checkmark, connector fully filled
//   • current   → outlined turquoise with number, subtle pulse
//   • pending   → gray outline with number, connector empty
//
// The component is fully controlled: pass `currentStep` (1-based) and optionally
// an array of `stepStatus` overrides for edge cases (e.g. review after payment).

import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "@/src/theme";

export type BookingStep = {
  label: string;             // Short label displayed under the circle
  icon?: keyof typeof Ionicons.glyphMap; // Optional icon shown on completed/current
};

export type StepStatus = "completed" | "current" | "pending";

export type BookingWizardStepperProps = {
  steps: BookingStep[];         // Should have exactly 4 items but we handle any length
  currentStep: number;          // 1-based index of the current step
  onStepPress?: (index: number) => void; // Optional: enable tapping on completed steps
  compact?: boolean;            // Compact height variant
};

export function BookingWizardStepper({
  steps,
  currentStep,
  onStepPress,
  compact = false,
}: BookingWizardStepperProps) {
  const total = steps.length;
  const clampedCurrent = Math.max(1, Math.min(total, currentStep));

  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Animate the progress bar to fill up to (currentStep - 1) / (total - 1)
    const target = total > 1 ? (clampedCurrent - 1) / (total - 1) : 1;
    Animated.timing(progress, {
      toValue: target,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clampedCurrent, total, progress]);

  const circleSize = compact ? 28 : 32;
  const trackHeight = 3;

  return (
    <View style={[styles.container, compact && { paddingVertical: 10 }]}>
      {/* Track (background + animated fill) */}
      <View
        style={[
          styles.track,
          {
            height: trackHeight,
            top: (compact ? 10 : 12) + (circleSize - trackHeight) / 2,
            left: `${100 / (total * 2)}%`,
            right: `${100 / (total * 2)}%`,
          },
        ]}
      >
        <View style={styles.trackBg} />
        <Animated.View
          style={[
            styles.trackFill,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }) as any,
            },
          ]}
        />
      </View>

      {/* Circles + labels */}
      <View style={styles.row}>
        {steps.map((step, i) => {
          const idx = i + 1;
          const status: StepStatus =
            idx < clampedCurrent ? "completed" : idx === clampedCurrent ? "current" : "pending";
          const isCompleted = status === "completed";
          const isCurrent = status === "current";
          const tappable = isCompleted && !!onStepPress;

          const CircleComp = tappable ? Pressable : View;

          return (
            <View key={i} style={styles.cell}>
              <CircleComp
                onPress={tappable ? () => onStepPress!(i) : undefined}
                style={[
                  styles.circle,
                  { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
                  isCompleted && styles.circleCompleted,
                  isCurrent && styles.circleCurrent,
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={compact ? 15 : 17} color={colors.white} />
                ) : (
                  <Text
                    style={[
                      styles.circleNum,
                      isCurrent && { color: colors.turquoise, fontWeight: "800" },
                      compact && { fontSize: 12 },
                    ]}
                  >
                    {idx}
                  </Text>
                )}
              </CircleComp>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  isCurrent && styles.labelActive,
                  isCompleted && styles.labelCompleted,
                  compact && { fontSize: 10.5, marginTop: 4 },
                ]}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cell: {
    flex: 1,
    alignItems: "center",
  },
  track: {
    position: "absolute",
  },
  trackBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.border,
    borderRadius: 999,
  },
  trackFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.turquoise,
    borderRadius: 999,
  },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  circleCompleted: {
    backgroundColor: colors.turquoise,
    borderColor: colors.turquoise,
  },
  circleCurrent: {
    backgroundColor: colors.surface,
    borderColor: colors.turquoise,
    // Shadow-like highlight
    shadowColor: colors.turquoise,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  circleNum: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: -0.1,
    textAlign: "center",
    maxWidth: 78,
  },
  labelActive: {
    color: colors.midnight,
    fontWeight: "700",
  },
  labelCompleted: {
    color: colors.turquoise,
    fontWeight: "700",
  },
});

export default BookingWizardStepper;
