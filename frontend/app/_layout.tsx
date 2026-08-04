import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, StatusBar, Platform, Linking } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useEditorialFonts } from "@/src/hooks/use-editorial-fonts";
import { AuthProvider } from "@/src/auth";
import { registerUnauthorizedHandler } from "@/src/api";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

// ─── PUSH NOTIFICATIONS — module scope (Emergent-managed SuprSend) ─────────
// Ces appels DOIVENT être au niveau module (jamais dans une fonction) pour être
// enregistrés avant qu'une notification n'arrive. Web est explicitement ignoré.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Notifications Jokoo",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#14b8a6",
  }).catch(() => {});
}

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

function PushTapHandler() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === "web") return;

    // Warm tap — utilisateur ouvre l'app depuis une notification pendant qu'elle tourne
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response.notification.request.content.data || {};
      const url: string | undefined = data.deeplink || data.action_url;
      if (!url) return;
      try {
        if (url.startsWith("http")) Linking.openURL(url).catch(() => {});
        else router.push(url as any);
      } catch {}
    });

    // Cold-start tap — utilisateur avait fermé l'app, l'a rouverte via une notif
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data: any = response.notification.request.content.data || {};
      const url: string | undefined = data.deeplink || data.action_url;
      if (!url) return;
      try {
        if (url.startsWith("http")) Linking.openURL(url).catch(() => {});
        else router.push(url as any);
      } catch {}
    }).catch(() => {});

    // Nudge hebdomadaire si l'utilisateur a refusé les notifs et bloqué la re-demande
    (async () => {
      try {
        const perm = await Notifications.getPermissionsAsync();
        if (perm.status !== "denied" || perm.canAskAgain) return;
        const last = await AsyncStorage.getItem("pushNudgeAt");
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (last && Date.now() - Number(last) <= oneWeek) return;
        await AsyncStorage.setItem("pushNudgeAt", String(Date.now()));
        // Nudge non-intrusif : nous n'affichons pas de dialog global ici
        // (le composant Auth peut décider d'afficher un banner "Activer les notifications").
      } catch {}
    })();

    return () => { sub.remove(); };
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
            <PushTapHandler />
            <StatusBar barStyle="dark-content" />
            <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
          </AuthProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
