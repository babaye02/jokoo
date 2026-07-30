import { useEffect, useState } from "react";
import { View, StyleSheet, Platform, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/src/auth";
import { Txt } from "@/src/components/ui";
import { colors, radius } from "@/src/theme";

/**
 * Apple Sign-In button.
 * — iOS 13+ : native AppleAuthenticationButton (App Store requirement).
 * — Web : fallback via Apple JS lib (if configured) or hidden.
 * — Android : hidden (Apple Sign-In not available natively). We still expose the
 *   auth backend for potential future web OAuth flow.
 *
 * On success, submits identityToken to POST /api/auth/apple and updates the
 * AuthProvider. The parent screen simply mounts <AppleSignInButton /> — no
 * extra logic needed.
 */
export function AppleSignInButton({ mode = "signIn", onDone }: { mode?: "signIn" | "signUp"; onDone?: () => void }) {
  const router = useRouter();
  const { signInWithApple } = useAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== "ios") {
        setAvailable(false);
        return;
      }
      try {
        const ok = await AppleAuthentication.isAvailableAsync();
        if (!cancelled) setAvailable(ok);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handlePress = async () => {
    try {
      setBusy(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const identityToken = credential.identityToken;
      if (!identityToken) throw new Error("Aucun token retourné par Apple");
      const fullName = credential.fullName;
      const nameStr = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(" ").trim() || undefined;
      const emailStr = credential.email || undefined;
      await signInWithApple(identityToken, nameStr, emailStr);
      onDone?.();
      router.replace("/(tabs)");
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED" || e?.code === "ERR_CANCELED") {
        // silent — user cancelled the native sheet
        return;
      }
      Alert.alert("Connexion Apple", e?.message || "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  // iOS native — App Store required official button
  if (available) {
    return (
      <View style={{ height: 48, marginTop: 12 }}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            mode === "signUp"
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={{ width: "100%", height: 48 }}
          onPress={handlePress}
        />
      </View>
    );
  }

  // Web fallback — a styled button. The full Apple JS OAuth flow will be wired
  // once the Apple Developer credentials (Service ID, Team ID, Key ID, private key)
  // are provided by the user. For now, this button explains the situation to the
  // user gracefully so it doesn't dead-end.
  if (Platform.OS === "web") {
    return (
      <Pressable
        onPress={() =>
          Alert.alert(
            "Bientôt disponible",
            "La connexion Apple sur le web sera activée dès l'ajout du Service ID Apple.",
          )
        }
        style={[styles.webBtn, busy && { opacity: 0.7 }]}
        testID="apple-web-btn"
      >
        <Ionicons name="logo-apple" size={20} color={colors.white} />
        <Txt weight="700" color={colors.white} style={{ marginLeft: 10 }}>
          {mode === "signUp" ? "S'inscrire avec Apple" : "Continuer avec Apple"}
        </Txt>
      </Pressable>
    );
  }

  // Android or unavailable — hide button silently to avoid confusion
  return null;
}

const styles = StyleSheet.create({
  webBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: "#000000",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
