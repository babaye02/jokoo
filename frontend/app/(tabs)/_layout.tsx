import { useCallback, useEffect, useState } from "react";
import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { Txt } from "@/src/components/ui";
import { colors } from "@/src/theme";

// Petit hook réutilisable qui interroge périodiquement les compteurs de non-lus.
function useUnreadCounts() {
  const [msg, setMsg] = useState(0);
  const [notif, setNotif] = useState(0);

  const load = useCallback(async () => {
    try {
      const [convs, notifs] = await Promise.all([
        api.get<any[]>("/chat/conversations").catch(() => []),
        api.get<any[]>("/notifications").catch(() => []),
      ]);
      const totalMsg = (Array.isArray(convs) ? convs : []).reduce(
        (s, c) => s + (typeof c?.unread === "number" ? c.unread : 0),
        0,
      );
      setMsg(totalMsg);
      const totalNotif = (Array.isArray(notifs) ? notifs : []).filter((n) => n && !n.read).length;
      setNotif(totalNotif);
    } catch { /* ignore transient */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return { msg, notif };
}

function Badge({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  return (
    <View
      style={{
        position: "absolute",
        top: -4, right: -10,
        minWidth: 18, height: 18, borderRadius: 9,
        backgroundColor: colors.danger,
        alignItems: "center", justifyContent: "center",
        paddingHorizontal: 4,
      }}
    >
      <Txt size="xxs" weight="700" color={colors.white}>
        {count > 99 ? "99+" : count}
      </Txt>
    </View>
  );
}

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const { msg, notif } = useUnreadCounts();

  if (loading) return null;
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.turquoise,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: -2 },
        tabBarStyle: {
          position: "absolute",
          borderTopWidth: 0,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
          backgroundColor: Platform.OS === "ios" ? "transparent" : "rgba(255,255,255,0.98)",
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView tint="light" intensity={80} style={{ flex: 1, borderTopWidth: 1, borderTopColor: colors.divider }} />
          ) : (
            <View style={{ flex: 1, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider }} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Recherche",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "search" : "search-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, focused }) => (
            <View>
              <Ionicons name={focused ? "chatbubble" : "chatbubble-outline"} size={22} color={color} />
              <Badge count={msg} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color, focused }) => (
            <View>
              <Ionicons name={focused ? "notifications" : "notifications-outline"} size={22} color={color} />
              <Badge count={notif} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
