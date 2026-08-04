// +not-found route — catches unmatched deep links / navigations.
// Kept minimal and premium: friendly icon, apology copy, single CTA back home.

import React from "react";
import { View, StyleSheet, Text, Pressable, Platform } from "react-native";
import { useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "@/src/theme";

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: "Introuvable", headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="compass-outline" size={44} color={colors.turquoise} />
        </View>
        <Text style={styles.title}>Page introuvable</Text>
        <Text style={styles.subtitle}>
          Cette page n&apos;existe pas ou a été déplacée. Revenez à l&apos;accueil pour continuer.
        </Text>
        <Pressable style={styles.btn} onPress={() => router.replace("/(tabs)")}>
          <Ionicons name="home" size={16} color={colors.white} />
          <Text style={styles.btnTxt}>Retour à l&apos;accueil</Text>
        </Pressable>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: spacing.xl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
    letterSpacing: -0.3,
    ...(Platform.OS !== "web" ? { fontFamily: "InstrumentSerif" } : {}),
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: spacing.xl,
    maxWidth: 300,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.turquoise,
    paddingHorizontal: 22,
    height: 48,
    borderRadius: 999,
  },
  btnTxt: { color: colors.white, fontWeight: "700", fontSize: 15, marginLeft: 6 },
});
