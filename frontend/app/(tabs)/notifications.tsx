// Notifications — Premium redesign inspired by Apple Wallet / Airbnb / Uber
// - Segmented filter tabs (All / Missions / Payments / Messages / System)
// - Date grouping (Today, Yesterday, Older)
// - Per-type accent color + icon
// - Swipe actions: Read/Unread, Archive, Delete (react-native-gesture-handler Swipeable)
// - Unread indicator (colored dot), refined typography and spacing

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  SectionList,
  Alert,
  Text,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { Swipeable, RectButton } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Notif } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, shadow, spacing } from "@/src/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─────────────────────────────────────────────────────────────
// TYPE → CATEGORY + ACCENT
// ─────────────────────────────────────────────────────────────

type Cat = "missions" | "payments" | "messages" | "system";

type TypeMeta = {
  icon: any;
  accent: string;         // Couleur d'accent (bordure gauche, icône, dot)
  bgTint: string;         // Fond très clair (12% de l'accent)
  cat: Cat;
};

// Palette premium — sobre, cohérente avec la marque
// Green (booking confirmed) / Blue (mission started) / Emerald (completed)
// Purple (payment) / Orange (review) / Gray (system)
const PALETTE = {
  green:    { accent: "#16A34A", bgTint: "#DCFCE7" }, // Booking confirmed
  blue:     { accent: "#0EA5E9", bgTint: "#E0F2FE" }, // Mission started
  emerald:  { accent: "#059669", bgTint: "#D1FAE5" }, // Completed
  purple:   { accent: "#7C3AED", bgTint: "#EDE9FE" }, // Payment
  orange:   { accent: "#EA580C", bgTint: "#FFEDD5" }, // Review
  gray:     { accent: "#6B7280", bgTint: "#F3F4F6" }, // System
  amber:    { accent: "#D97706", bgTint: "#FEF3C7" }, // Warning
  red:      { accent: "#DC2626", bgTint: "#FEE2E2" }, // Danger
  navy:     { accent: "#0B1F3A", bgTint: "#E5EAF2" }, // Brand
  turquoise:{ accent: "#00C2A8", bgTint: "#CCFBF1" },
};

const TYPE_META: Record<string, TypeMeta> = {
  // Bookings (Missions)
  booking_new:                  { icon: "calendar-outline",         ...PALETTE.blue,     cat: "missions" },
  booking_accepted:             { icon: "checkmark-circle-outline", ...PALETTE.green,    cat: "missions" },
  booking_completed:            { icon: "trophy-outline",           ...PALETTE.emerald,  cat: "missions" },
  booking_completion_requested: { icon: "hourglass-outline",        ...PALETTE.amber,    cat: "missions" },
  booking_paid:                 { icon: "card-outline",             ...PALETTE.purple,   cat: "payments" },

  // Reviews
  review_received:              { icon: "star-outline",             ...PALETTE.orange,   cat: "missions" },

  // Messages
  message:                      { icon: "chatbubbles-outline",      ...PALETTE.turquoise,cat: "messages" },

  // Family
  babysitting_new:              { icon: "people-outline",           ...PALETTE.blue,     cat: "missions" },
  babysitting_confirmed:        { icon: "shield-checkmark-outline", ...PALETTE.green,    cat: "missions" },
  babysitting_report:           { icon: "clipboard-outline",        ...PALETTE.blue,     cat: "missions" },
  babysitting_sos:              { icon: "warning-outline",          ...PALETTE.red,      cat: "missions" },

  // Mobility
  ride_new:                     { icon: "car-outline",              ...PALETTE.blue,     cat: "missions" },
  ride_accepted:                { icon: "checkmark-circle-outline", ...PALETTE.green,    cat: "missions" },
  parcel_new:                   { icon: "cube-outline",             ...PALETTE.orange,   cat: "missions" },

  // Payments & wallet
  payment_received:             { icon: "cash-outline",             ...PALETTE.purple,   cat: "payments" },
  commission_due:               { icon: "wallet-outline",           ...PALETTE.amber,    cat: "payments" },
  commission_paid:              { icon: "checkmark-done-outline",   ...PALETTE.emerald,  cat: "payments" },
  wallet_debt_warning:          { icon: "alert-circle-outline",     ...PALETTE.red,      cat: "payments" },

  // System / account / admin
  account_blocked:              { icon: "lock-closed-outline",      ...PALETTE.red,      cat: "system" },
  account_reactivated:          { icon: "lock-open-outline",        ...PALETTE.green,    cat: "system" },
  report_status:                { icon: "flag-outline",             ...PALETTE.orange,   cat: "system" },
  report_confirmed:             { icon: "shield-checkmark-outline", ...PALETTE.green,    cat: "system" },
  report_reopened:              { icon: "refresh-outline",          ...PALETTE.orange,   cat: "system" },
  report_awaiting_confirm:      { icon: "hourglass-outline",        ...PALETTE.amber,    cat: "system" },
  admin_action:                 { icon: "megaphone-outline",        ...PALETTE.gray,     cat: "system" },
};

function metaFor(t: string): TypeMeta {
  if (TYPE_META[t]) return TYPE_META[t];
  if (t.startsWith("booking")) return TYPE_META.booking_new;
  if (t.startsWith("babysitting")) return TYPE_META.babysitting_new;
  if (t.startsWith("ride")) return TYPE_META.ride_new;
  if (t.startsWith("parcel")) return TYPE_META.parcel_new;
  if (t.startsWith("payment") || t.startsWith("commission") || t.startsWith("wallet")) return TYPE_META.payment_received;
  if (t.startsWith("account") || t.startsWith("report") || t === "admin_action") return TYPE_META.admin_action;
  if (t === "message") return TYPE_META.message;
  return { icon: "notifications-outline", ...PALETTE.gray, cat: "system" };
}

// ─────────────────────────────────────────────────────────────
// ROUTE FOR NOTIF (unchanged behavior)
// ─────────────────────────────────────────────────────────────
function routeForNotif(
  n: Notif & { booking_id?: string; ride_id?: string; parcel_id?: string; peer_id?: string; family_booking_id?: string; report_id?: string; provider_id?: string; babysitter_id?: string },
  currentUserId?: string
): { pathname: string; params?: any } | null {
  const t = n.type || "";
  if (t.startsWith("babysitting")) {
    const fid = n.family_booking_id || n.booking_id;
    if (fid) return { pathname: `/family/booking/${fid}` };
    return { pathname: "/family/mine" };
  }
  if (t === "review_received") {
    if (n.babysitter_id) return { pathname: `/family/babysitter/${n.babysitter_id}`, params: { focus: "reviews" } };
    const pid = n.provider_id || currentUserId;
    if (pid) return { pathname: `/provider/${pid}`, params: { focus: "reviews" } };
    return { pathname: "/(tabs)/profile" };
  }
  if (t.startsWith("booking") && n.booking_id) return { pathname: `/booking/detail/${n.booking_id}` };
  if (t.startsWith("ride")) {
    if (n.ride_id) return { pathname: `/mobility/rides/${n.ride_id}` };
    return { pathname: "/mobility/rides/mine" };
  }
  if (t.startsWith("parcel")) return { pathname: "/mobility/delivery/mine" };
  if (t === "message" && n.peer_id) return { pathname: `/chat/${n.peer_id}` };
  if (t === "payment_received" || t.startsWith("payment")) {
    if (n.booking_id) return { pathname: `/booking/detail/${n.booking_id}` };
    return { pathname: "/profile/payments" };
  }
  if (t === "commission_due" || t === "commission_paid" || t === "wallet_debt_warning") {
    return { pathname: "/profile/payments" };
  }
  if (t === "account_blocked" || t === "account_reactivated") {
    return { pathname: "/profile/payments" };
  }
  if (t === "report_status" || t === "report_confirmed" || t === "report_reopened" || t === "report_awaiting_confirm") {
    if ((n as any).report_id) return { pathname: `/report/${(n as any).report_id}` };
    return { pathname: "/(tabs)/notifications" };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// TIME/DATE FORMATTING
// ─────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const s = Math.round((now - then) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 172800) return "hier";
    if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`;
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  } catch { return ""; }
}

function dayBucket(iso: string): "today" | "yesterday" | "older" {
  try {
    const d = new Date(iso);
    const today = new Date();
    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (isSameDay(d, today)) return "today";
    const yesterday = new Date(today.getTime() - 86400_000);
    if (isSameDay(d, yesterday)) return "yesterday";
    return "older";
  } catch { return "older"; }
}

// ─────────────────────────────────────────────────────────────
// FILTERS
// ─────────────────────────────────────────────────────────────
const FILTERS: { key: "all" | Cat; label: string; icon: any }[] = [
  { key: "all",      label: "Tout",     icon: "sparkles-outline" },
  { key: "missions", label: "Missions", icon: "briefcase-outline" },
  { key: "payments", label: "Paiements",icon: "card-outline" },
  { key: "messages", label: "Messages", icon: "chatbubbles-outline" },
  { key: "system",   label: "Système",  icon: "settings-outline" },
];

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | Cat>("all");
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const load = useCallback(async () => {
    try {
      const list = await api.get<Notif[]>("/notifications");
      setItems(list);
    } catch { /* noop */ }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markAll = useCallback(async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    await api.post("/notifications/read-all");
  }, []);

  const toggleRead = async (n: Notif) => {
    const nextRead = !n.read;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: nextRead } : x)));
    try {
      if (nextRead) await api.post(`/notifications/${n.id}/read`);
      else await api.post(`/notifications/${n.id}/unread`);
    } catch { /* rollback if needed */ }
    swipeableRefs.current.get(n.id)?.close();
  };

  const archive = async (n: Notif) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    try { await api.post(`/notifications/${n.id}/archive`); } catch { /* noop */ }
  };

  const del = async (n: Notif) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    try { await api.del(`/notifications/${n.id}`); } catch { /* noop */ }
  };

  const confirmDelete = (n: Notif) => {
    swipeableRefs.current.get(n.id)?.close();
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if ((globalThis as any).confirm?.("Supprimer cette notification ?")) del(n);
      return;
    }
    Alert.alert("Supprimer", "Supprimer cette notification ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => del(n) },
    ]);
  };

  const onTap = async (n: Notif) => {
    if (!n.read) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      api.post(`/notifications/${n.id}/read`).catch(() => {});
    }
    const dest = routeForNotif(n as any, user?.id);
    if (dest) router.push(dest as any);
  };

  // ── Filtering + grouping ──
  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((n) => metaFor(n.type).cat === filter);
  }, [items, filter]);

  const sections = useMemo(() => {
    const buckets: Record<string, Notif[]> = { today: [], yesterday: [], older: [] };
    for (const n of filtered) buckets[dayBucket(n.created_at)].push(n);
    const out: { title: string; data: Notif[] }[] = [];
    if (buckets.today.length)     out.push({ title: "Aujourd'hui",  data: buckets.today });
    if (buckets.yesterday.length) out.push({ title: "Hier",         data: buckets.yesterday });
    if (buckets.older.length)     out.push({ title: "Plus tôt",     data: buckets.older });
    return out;
  }, [filtered]);

  const unreadCount = items.filter((x) => !x.read).length;

  // ── Filter counts (badges) ──
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, missions: 0, payments: 0, messages: 0, system: 0 };
    for (const n of items) {
      if (!n.read) {
        c.all += 1;
        c[metaFor(n.type).cat] += 1;
      }
    }
    return c;
  }, [items]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerOverline}>Boîte de réception</Text>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 ? (
              <Text style={styles.headerSub}>{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</Text>
            ) : (
              <Text style={styles.headerSub}>Tout est à jour ✨</Text>
            )}
          </View>
          {unreadCount > 0 ? (
            <Pressable onPress={markAll} testID="notif-mark-read" hitSlop={8} style={styles.markAllBtn}>
              <Ionicons name="checkmark-done" size={14} color={colors.text} />
              <Text style={styles.markAllTxt}>Tout lire</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const badge = counts[f.key] || 0;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
                testID={`notif-filter-${f.key}`}
              >
                <Ionicons name={f.icon} size={14} color={active ? colors.white : colors.text} />
                <Text style={[styles.filterLabel, active && { color: colors.white }]}>{f.label}</Text>
                {badge > 0 ? (
                  <View style={[styles.filterBadge, active && { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                    <Text style={[styles.filterBadgeTxt, active && { color: colors.white }]}>{badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <SectionList
        sections={sections as any}
        keyExtractor={(n) => (n as Notif).id}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: 120 + insets.bottom,
        }}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.textSubtle} />
            </View>
            <Text style={styles.emptyTitle}>Aucune notification</Text>
            <Text style={styles.emptyHint}>{filter === "all"
              ? "Vos alertes apparaîtront ici."
              : "Aucune notif dans cette catégorie."}</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{(section as any).title}</Text>
        )}
        renderItem={({ item }) => (
          <NotifRow
            n={item as Notif}
            onTap={onTap}
            onToggleRead={toggleRead}
            onArchive={archive}
            onDelete={confirmDelete}
            registerRef={(id, ref) => swipeableRefs.current.set(id, ref)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// NOTIF ROW (swipeable)
// ─────────────────────────────────────────────────────────────
function NotifRow({
  n,
  onTap,
  onToggleRead,
  onArchive,
  onDelete,
  registerRef,
}: {
  n: Notif;
  onTap: (n: Notif) => void;
  onToggleRead: (n: Notif) => void;
  onArchive: (n: Notif) => void;
  onDelete: (n: Notif) => void;
  registerRef: (id: string, ref: Swipeable | null) => void;
}) {
  const meta = metaFor(n.type);

  const renderRightActions = () => (
    <View style={{ flexDirection: "row", height: "100%", paddingLeft: 8 }}>
      <RectButton style={[styles.swipeAction, { backgroundColor: "#F3F4F6" }]} onPress={() => onArchive(n)}>
        <Ionicons name="archive-outline" size={20} color={colors.text} />
        <Text style={styles.swipeLabel}>Archiver</Text>
      </RectButton>
      <RectButton style={[styles.swipeAction, { backgroundColor: "#FEE2E2", marginLeft: 6 }]} onPress={() => onDelete(n)}>
        <Ionicons name="trash-outline" size={20} color="#DC2626" />
        <Text style={[styles.swipeLabel, { color: "#DC2626" }]}>Supprimer</Text>
      </RectButton>
    </View>
  );

  const renderLeftActions = () => (
    <View style={{ flexDirection: "row", height: "100%", paddingRight: 8 }}>
      <RectButton
        style={[styles.swipeAction, { backgroundColor: n.read ? "#EEF2FF" : "#D1FAE5" }]}
        onPress={() => onToggleRead(n)}
      >
        <Ionicons
          name={n.read ? "mail-unread-outline" : "checkmark-done-outline"}
          size={20}
          color={n.read ? "#3730A3" : "#065F46"}
        />
        <Text style={[styles.swipeLabel, { color: n.read ? "#3730A3" : "#065F46" }]}>
          {n.read ? "Marquer non lu" : "Marquer lu"}
        </Text>
      </RectButton>
    </View>
  );

  return (
    <Swipeable
      ref={(ref) => registerRef(n.id, ref)}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
    >
      <Pressable
        onPress={() => onTap(n)}
        style={({ pressed }) => [
          styles.card,
          !n.read && { backgroundColor: "#FDFDFD" },
          pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
        ]}
        testID={`notif-${n.id}`}
      >
        {/* Accent left bar (only when unread) */}
        {!n.read ? <View style={[styles.leftBar, { backgroundColor: meta.accent }]} /> : null}

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: meta.bgTint }]}>
          <Ionicons name={meta.icon} size={20} color={meta.accent} />
        </View>

        {/* Body */}
        <View style={{ flex: 1, paddingRight: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.title, !n.read && { fontWeight: "700" }]} numberOfLines={1}>{n.title}</Text>
            {!n.read ? <View style={[styles.unreadDot, { backgroundColor: meta.accent }]} /> : null}
          </View>
          <Text style={styles.body} numberOfLines={2}>{n.body}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.time}>{timeAgo(n.created_at)}</Text>
            {routeForNotif(n as any) !== null ? (
              <View style={styles.viewBtn}>
                <Text style={[styles.viewBtnTxt, { color: meta.accent }]}>Voir</Text>
                <Ionicons name="chevron-forward" size={12} color={meta.accent} style={{ marginLeft: 2 }} />
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    paddingTop: 4,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 4,
  },
  headerOverline: {
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  headerTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
    color: colors.text,
    marginTop: 4,
  },
  headerSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.hairline,
  },
  markAllTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginLeft: 5,
    letterSpacing: -0.1,
  },
  filterRow: {
    gap: 8,
    marginTop: spacing.lg,
    paddingRight: spacing.xl,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginLeft: 6,
    letterSpacing: -0.1,
  },
  filterBadge: {
    marginLeft: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    paddingHorizontal: 5,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeTxt: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.white,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 18,
    marginBottom: 10,
    paddingLeft: 2,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    paddingLeft: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.hairline,
    overflow: "hidden",
  },
  leftBar: {
    position: "absolute",
    top: 0, bottom: 0, left: 0,
    width: 4,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  body: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 10,
  },
  time: {
    fontSize: 11,
    color: colors.textSubtle,
    fontWeight: "500",
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 999,
    backgroundColor: "#F9FAFB",
  },
  viewBtnTxt: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  swipeAction: {
    width: 82,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  swipeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
    marginTop: 4,
    letterSpacing: -0.1,
  },
  emptyBox: {
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 22,
    lineHeight: 26,
    color: colors.text,
    marginTop: 16,
    letterSpacing: -0.3,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
});
