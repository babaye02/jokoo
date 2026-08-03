import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, FamilyBooking } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Txt, Btn, Avatar, Badge } from "@/src/components/ui";
import { ConfirmDialog } from "@/src/components/ActionSheet";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Tab = "parent" | "sitter";

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};

const STATUS_META: Record<string, { tone: any; icon: any }> = {
  pending:     { tone: "warning",  icon: "hourglass-outline" },
  confirmed:   { tone: "info",     icon: "checkmark-circle-outline" },
  in_progress: { tone: "info",     icon: "play-circle-outline" },
  completed:   { tone: "success",  icon: "checkmark-done-outline" },
  cancelled:   { tone: "neutral",  icon: "ban-outline" },
};

export default function MyFamilyBookings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ just_booked?: string }>();
  const [tab, setTab] = useState<Tab>("parent");
  const [mine, setMine] = useState<FamilyBooking[]>([]);
  const [assigned, setAssigned] = useState<FamilyBooking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showToast, setShowToast] = useState<boolean>(params.just_booked === "1");

  useEffect(() => {
    if (params.just_booked === "1") {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 4500);
      return () => clearTimeout(t);
    }
  }, [params.just_booked]);

  const load = useCallback(async () => {
    try {
      const [m, a] = await Promise.all([
        api.get<FamilyBooking[]>("/family/bookings/mine"),
        api.get<FamilyBooking[]>("/family/bookings/assigned"),
      ]);
      setMine(m);
      setAssigned(a);
      // Auto-sélectionne l'onglet Étudiant(e) si l'utilisateur a des missions assignées
      // (probable baby-sitter / prof), sauf s'il vient de créer une réservation en tant que parent.
      if (a.length > 0 && m.length === 0 && params.just_booked !== "1") {
        setTab("sitter");
      }
    } catch { /* ignore */ }
  }, [params.just_booked]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const [cancelId, setCancelId] = useState<string | null>(null);

  const cancel = (bid: string) => setCancelId(bid);
  const doCancel = async () => {
    if (!cancelId) return;
    try {
      await api.patch(`/family/bookings/${cancelId}`, { status: "cancelled" });
      setCancelId(null);
      await load();
    } catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  const confirm = async (bid: string) => {
    try {
      await api.patch(`/family/bookings/${bid}`, { status: "confirmed" });
      await load();
    } catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="mine-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Mes réservations</Txt>
        <Pressable onPress={() => router.push("/family")} style={[styles.back, { backgroundColor: colors.turquoise }]} testID="mine-search">
          <Ionicons name="search" size={20} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      {showToast ? (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={18} color={colors.white} />
          <Txt size="sm" weight="700" color={colors.white} style={{ marginLeft: 8, flex: 1 }}>
            Réservation envoyée ! L&apos;étudiant(e) recevra une notification.
          </Txt>
          <Pressable onPress={() => setShowToast(false)} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.white} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab("parent")} style={[styles.tabBtn, tab === "parent" && styles.tabBtnActive]} testID="tab-parent">
          <Ionicons name="people" size={16} color={tab === "parent" ? colors.white : colors.midnight} />
          <Txt weight="700" color={tab === "parent" ? colors.white : colors.midnight} style={{ marginLeft: 6 }}>
            Parent ({mine.length})
          </Txt>
        </Pressable>
        <Pressable onPress={() => setTab("sitter")} style={[styles.tabBtn, tab === "sitter" && styles.tabBtnActive]} testID="tab-sitter">
          <Ionicons name="school" size={16} color={tab === "sitter" ? colors.white : colors.midnight} />
          <Txt weight="700" color={tab === "sitter" ? colors.white : colors.midnight} style={{ marginLeft: 6 }}>
            Étudiant ({assigned.length})
          </Txt>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {tab === "parent" ? (
          mine.length === 0 ? (
            <Empty
              icon="people-outline"
              title="Aucune réservation"
              body="Réservez votre premier étudiant Jokoo Family."
              cta="Trouver un étudiant"
              onCta={() => router.push("/family")}
            />
          ) : (
            mine.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                role="parent"
                onOpen={() => router.push(`/family/booking/${b.id}`)}
                onCancel={b.status !== "completed" && b.status !== "cancelled" ? () => cancel(b.id) : undefined}
              />
            ))
          )
        ) : assigned.length === 0 ? (
          <Empty
            icon="school-outline"
            title="Aucune mission"
            body="Créez votre profil étudiant pour recevoir des missions."
            cta="Créer mon profil"
            onCta={() => router.push("/family/profile-setup")}
          />
        ) : (
          assigned.map((b) => (
            <BookingCard
              key={b.id}
              b={b}
              role="sitter"
              onOpen={() => router.push(`/family/booking/${b.id}`)}
              onConfirm={b.status === "pending" ? () => confirm(b.id) : undefined}
              onCancel={b.status === "pending" || b.status === "confirmed" ? () => cancel(b.id) : undefined}
            />
          ))
        )}
      </ScrollView>

      <ConfirmDialog
        visible={cancelId !== null}
        title="Annuler cette réservation ?"
        message="Cette action est définitive. Vous pouvez toujours contacter le prestataire pour discuter."
        confirmLabel="Oui, annuler"
        destructive
        onConfirm={doCancel}
        onClose={() => setCancelId(null)}
      />
    </View>
  );
}

function Empty({ icon, title, body, cta, onCta }: any) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={colors.textSubtle} />
      <Txt size="md" weight="700" style={{ marginTop: 10 }}>{title}</Txt>
      <Txt size="xs" color={colors.textMuted} style={{ textAlign: "center", marginTop: 4 }}>{body}</Txt>
      <View style={{ marginTop: 14 }}>
        <Btn title={cta} onPress={onCta} />
      </View>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return <Badge icon={m.icon} label={STATUS_LABEL[status] || status} tone={m.tone} size="sm" />;
}

function BookingCard({ b, role, onOpen, onCancel, onConfirm }: any) {
  return (
    <Pressable onPress={onOpen} style={styles.card}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Txt size="xs" color={colors.textMuted}>{b.date} · {b.time_start}–{b.time_end}</Txt>
        <StatusPill status={b.status} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Avatar uri={role === "parent" ? (b.babysitter_avatar || undefined) : undefined} name={role === "parent" ? b.babysitter_name : b.parent_name} size={36} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Txt weight="700">{role === "parent" ? b.babysitter_name : b.parent_name}</Txt>
          <Txt size="xxs" color={colors.textMuted}>
            {b.service_type === "tutoring" ? "Tutorat" : b.service_type === "both" ? "Baby+Tutorat" : "Baby-sitting"} · {b.kids?.length || 0} enfant(s) · {b.duration_hours}h
          </Txt>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt size="md" weight="700" color={colors.turquoise}>{formatXof(b.total_xof)}</Txt>
        </View>
      </View>
      {(onConfirm || onCancel) ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
          {onConfirm ? (
            <View style={{ flex: 1 }}>
              <Btn title="Confirmer" icon="checkmark" size="sm" onPress={onConfirm} />
            </View>
          ) : null}
          {onCancel ? (
            <View style={{ flex: 1 }}>
              <Btn title="Annuler" icon="close" variant="ghost" size="sm" onPress={onCancel} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  tabs: {
    flexDirection: "row",
    padding: 4,
    margin: spacing.xl,
    marginBottom: 0,
    backgroundColor: colors.surface,
    borderRadius: 999,
    ...shadow.soft,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 999,
  },
  tabBtnActive: { backgroundColor: colors.midnight },
  card: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, ...shadow.card },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
  toast: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: spacing.xl, marginTop: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    backgroundColor: colors.success, borderRadius: radius.md, ...shadow.soft,
  },
});
