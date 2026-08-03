import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useEditorialFonts } from "@/src/hooks/use-editorial-fonts";
import { AuthProvider } from "@/src/auth";
import { registerUnauthorizedHandler } from "@/src/api";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

// NOTE: Push notifications architecture is reserved (backend push.py + src/push/register.ts)
// but not wired into _layout.tsx yet. To enable later:
//   1. Uncomment PushTapHandler component + module-scope Notifications setup
//   2. Add <PushTapHandler /> inside <AuthProvider>
//   3. Call registerForPush(userId) after login in AuthProvider
//   4. Add expo-notifications plugin to app.json + google-services.json for Android

function AuthRedirector() {
  const router = useRouter();
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      // Session expirée -> retour à l'écran de connexion
      try { router.replace("/login"); } catch {}
    });
    return () => registerUnauthorizedHandler(null);
  }, [router]);
  return null;
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [editorialLoaded] = useEditorialFonts();
  const [fontsTimeout, setFontsTimeout] = useState(false);

  // Fallback : after 4s, render the app even if fonts didn't finish loading.
  // Avoids getting stuck on the splash when the icon CDN (jsDelivr / gstatic)
  // is slow or unreachable on the user's network (typical on Expo Go).
  useEffect(() => {
    const t = setTimeout(() => setFontsTimeout(true), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if ((iconsLoaded || iconsError || fontsTimeout) && (editorialLoaded || fontsTimeout)) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [iconsLoaded, iconsError, editorialLoaded, fontsTimeout]);

  // Render as soon as icons are ready (or errored, or timed out).
  if (!iconsLoaded && !iconsError && !fontsTimeout) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AuthProvider>
            <AuthRedirector />
            <StatusBar barStyle="dark-content" />
            <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
          </AuthProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
