import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/auth";
import { registerUnauthorizedHandler } from "@/src/api";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

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
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AuthRedirector />
          <StatusBar barStyle="dark-content" />
          <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
