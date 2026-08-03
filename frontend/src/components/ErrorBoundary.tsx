// ErrorBoundary — catches React render errors so users never see a white screen.
// Displays a graceful recovery UI with a retry button + optional link to support.
//
// Wired at the root _layout so it catches everything downstream.
// Errors are logged to console for dev / Sentry later.

import React from "react";
import { View, StyleSheet, Text, Pressable, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: Error };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn("[ErrorBoundary]", error, info?.componentStack);
    // TODO: forward to Sentry / Crashlytics when instrumented.
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  contactSupport = () => {
    const subject = encodeURIComponent("Jokoo — Bug rencontré dans l'app");
    const body = encodeURIComponent(
      `Bonjour,\n\nJ'ai rencontré un problème inattendu dans l'application.\n\nMessage : ${this.state.error?.message || "inconnu"}\n\nMerci de m'aider.`
    );
    Linking.openURL(`mailto:support@jokooservices.com?subject=${subject}&body=${body}`).catch(() => {});
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.wrap}>
        <View style={styles.iconCircle}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.turquoise} />
        </View>
        <Text style={styles.title}>Un problème est survenu</Text>
        <Text style={styles.subtitle}>
          Rassure-toi, tes données sont en sécurité. Réessaie ou contacte-nous si le problème persiste.
        </Text>
        {__DEV__ && this.state.error?.message ? (
          <Text style={styles.devMsg} numberOfLines={4}>
            {this.state.error.message}
          </Text>
        ) : null}
        <Pressable onPress={this.reset} style={styles.primaryBtn}>
          <Ionicons name="refresh" size={16} color={colors.white} />
          <Text style={styles.primaryTxt}>Réessayer</Text>
        </Pressable>
        <Pressable onPress={this.contactSupport} style={styles.secondaryBtn}>
          <Ionicons name="mail-outline" size={16} color={colors.text} />
          <Text style={styles.secondaryTxt}>Contacter le support</Text>
        </Pressable>
      </View>
    );
  }
}

export default ErrorBoundary;

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.3,
    ...(Platform.OS !== "web" ? { fontFamily: "InstrumentSerif" } : {}),
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 20,
    maxWidth: 300,
  },
  devMsg: {
    fontSize: 11,
    color: "#B91C1C",
    backgroundColor: "#FEE2E2",
    padding: 10,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    maxWidth: 320,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.turquoise,
    paddingHorizontal: 22,
    height: 48,
    borderRadius: 999,
    marginBottom: 12,
  },
  primaryTxt: { color: colors.white, fontWeight: "700", fontSize: 15, marginLeft: 4 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    height: 44,
  },
  secondaryTxt: { color: colors.text, fontWeight: "600", fontSize: 14, marginLeft: 4 },
});
