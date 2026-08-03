import { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Notif } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

// Icône et couleur selon le type de notif — visuel plus riche pour aider l'utilisateur à scanner rapidement.
const META: Record<string, { icon: any; tint: string }> = {
  booking_new:        { icon: "calendar",              tint: "#00C2A8" },
  booking_accepted:   { icon: "checkmark-circle",      tint: "#16A34A" },
  booking_completed:  { icon: "trophy",                tint: "#F59E0B" },
  booking_paid:       { icon: "card",                  tint: "#0EA5E9" },
  booking_completion_requested: { icon: "hourglass",   tint: "#D97706" },
  review_received:    { icon: "star",                  tint: "#F59E0B" },
  message:            { icon: "chatbubble-ellipses",   tint: "#7C3AED" },
  babysitting_new:    { icon: "people",                tint: "#EC4899" },
  babysitting_confirmed: { icon: "shield-checkmark",   tint: "#16A34A" },
  babysitting_report: { icon: "clipboard",             tint: "#0EA5E9" },
  babysitting_sos:    { icon: "warning",               tint: "#EF4444" },
  parcel_new:         { icon: "cube",                  tint: "#F97316" },
  ride_new:           { icon: "car",                   tint: "#0EA5E9" },
  ride_accepted:      { icon: "checkmark-circle",      tint: "#16A34A" },
  payment_received:   { icon: "cash",                  tint: "#16A34A" },
  commission_due:     { icon: "wallet",                 tint: "#F59E0B" },
  commission_paid:    { icon: "checkmark-done",         tint: "#16A34A" },
  wallet_debt_warning:{ icon: "alert-circle",           tint: "#EF4444" },
  account_blocked:    { icon: "lock-closed",            tint: "#EF4444" },
  account_reactivated:{ icon: "lock-open",              tint: "#16A34A" },
  report_status:      { icon: "flag",                   tint: "#F97316" },
  report_confirmed:   { icon: "shield-checkmark",       tint: "#16A34A" },
  report_reopened:    { icon: "refresh",                tint: "#F97316" },
  report_awaiting_confirm: { icon: "hourglass",         tint: "#D97706" },
  admin_action:       { icon: "megaphone",              tint: "#7C3AED" },
};

function metaFor(t: string) {
  if (META[t]) return META[t];
  // Fallback heuristique basé sur le préfixe (compatible anciens types).
  if (t.startsWith("booking")) return META.booking_new;
  if (t.startsWith("babysitting")) return META.babysitting_new;
  if (t.startsWith("ride")) return META.ride_new;
  if (t.startsWith("parcel")) return META.parcel_new;
  if (t.startsWith("payment")) return META.payment_received;
  if (t === "message") return META.message;
  return { icon: "notifications", tint: colors.turquoise };
}

/**
 * Détermine la destination d'une notification :
 * on ouvre l'écran contextualisé (réservation, chat, colis, etc.).
 * @param currentUserId — id de l'utilisateur connecté (pour router les avis reçus
 *   vers son propre profil public afin d'y consulter la liste complète).
 */
function routeForNotif(
  n: Notif & { booking_id?: string; ride_id?: string; parcel_id?: string; peer_id?: string; family_booking_id?: string; report_id?: string; provider_id?: string; babysitter_id?: string },
  currentUserId?: string
): { pathname: string; params?: any } | null {
  const t = n.type || "";
  if (t.startsWith("babysitting")) {
    // Priorité au booking cible s'il est disponible, sinon fallback vers la liste des missions.
    const fid = n.family_booking_id || n.booking_id;
    if (fid) return { pathname: `/family/booking/${fid}` };
    return { pathname: "/family/mine" };
  }
  if (t === "review_received") {
    // Le prestataire/baby-sitter tape sur la notif → sa propre fiche publique,
    // section "Avis clients" auto-scrollée (voir provider/babysitter [id].tsx).
    if (n.babysitter_id) {
      return { pathname: `/family/babysitter/${n.babysitter_id}`, params: { focus: "reviews" } };
    }
    const providerId = n.provider_id || currentUserId;
    if (providerId) {
      return { pathname: `/provider/${providerId}`, params: { focus: "reviews" } };
    }
    return { pathname: "/(tabs)/profile" };
  }
  if (t.startsWith("booking") && n.booking_id) {
    return { pathname: `/booking/detail/${n.booking_id}` };
  }
  if (t.startsWith("ride")) {
    if (n.ride_id) return { pathname: `/mobility/rides/${n.ride_id}` };
    return { pathname: "/mobility/rides/mine" };
  }
  if (t.startsWith("parcel")) {
    return { pathname: "/mobility/delivery/mine" };
  }
  if (t === "message" && n.peer_id) {
    return { pathname: `/chat/${n.peer_id}` };
  }
  if (t === "payment_received" || t.startsWith("payment")) {
    if (n.booking_id) return { pathname: `/booking/detail/${n.booking_id}` };
    return { pathname: "/profile/payments" };
  }
  // Commissions & wallet (prestataire)
  if (t === "commission_due" || t === "commission_paid" || t === "wallet_debt_warning") {
    return { pathname: "/profile/payments" };
  }
  // Blocage / réactivation compte
  if (t === "account_blocked" || t === "account_reactivated") {
    return { pathname: "/profile/payments" };
  }
  // Signalements
  if (t === "report_status" || t === "report_confirmed" || t === "report_reopened" || t === "report_awaiting_confirm") {
    if ((n as any).report_id) return { pathname: `/report/${(n as any).report_id}` };
    return { pathname: "/(tabs)/notifications" };
  }
  if (t === "admin_action") {
    return { pathname: "/(tabs)/notifications" };
  }
  return null;
}

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.get<Notif[]>("/notifications");
      setItems(list);
    } catch { /* noop */ }
  }, []);

  const markAll = useCallback(async () => {
    await api.post("/notifications/read-all");
    load();
  }, [load]);

  const onTap = async (n: Notif) => {
    // Marquage lu optimiste + navigation contextuelle.
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    api.post(`/notifications/${n.id}/read`).catch(() => {});
    const dest = routeForNotif(n as any, user?.id);
    if (dest) {
      router.push(dest as any);
    } else {
      // Aucune destination contextuelle : on ouvre la vue de détails (ici, un fallback discret).
      // On garde l'utilisateur sur la liste (déjà marquée lue).
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt size="xxl" weight="700">Notifications</Txt>
          <Pressable onPress={markAll} testID="notif-mark-read" hitSlop={8}>
            <Txt size="sm" weight="600" color={colors.turquoise}>Tout lire</Txt>
          </Pressable>
        </View>
      </SafeAreaView>

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.turquoise} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 80 }}>
            <Ionicons name="notifications-off-outline" size={56} color={colors.textSubtle} />
            <Txt size="md" weight="600" style={{ marginTop: spacing.md }}>Aucune notification</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>{"Vos alertes apparaîtront ici."}</Txt>
          </View>
        }
        renderItem={({ item }) => {
          const m = metaFor(item.type);
          const canOpen = routeForNotif(item as any, user?.id) !== null;
          return (
            <Pressable
              onPress={() => onTap(item)}
              android_ripple={{ color: colors.divider }}
              style={({ pressed }) => [
                styles.item,
                !item.read && { backgroundColor: "#F0FBF8", borderColor: colors.brandTertiary },
                pressed && { opacity: 0.85 },
              ]}
              testID={`notif-${item.id}`}
            >
              <View style={[styles.icon, { backgroundColor: item.read ? colors.surface2 : m.tint + "22" }]}>
                <Ionicons name={m.icon} size={20} color={item.read ? colors.textMuted : m.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="600">{item.title}</Txt>
                <Txt size="sm" color={colors.textMuted} style={{ marginTop: 2 }} numberOfLines={3}>{item.body}</Txt>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                  {canOpen ? (
                    <>
                      <Ionicons name="chevron-forward" size={12} color={colors.turquoise} />
                      <Txt size="xxs" color={colors.turquoise} weight="700" style={{ marginLeft: 2 }}>Voir</Txt>
                    </>
                  ) : null}
                  <Txt size="xxs" color={colors.textSubtle} style={{ marginLeft: canOpen ? 8 : 0 }}>
                    {timeAgo(item.created_at)}
                  </Txt>
                </View>
              </View>
              {!item.read ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function timeAgo(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const s = Math.round((now - then) / 1000);
    if (s < 60) return `à l'instant`;
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`;
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  } catch { return ""; }
}

const styles = StyleSheet.create({
  item: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.turquoise, marginLeft: 8 },
});
