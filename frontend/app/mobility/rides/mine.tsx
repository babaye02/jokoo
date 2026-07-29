import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Ride, RideBooking } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Txt, Btn } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Tab = "driver" | "passenger";

export default function MyRides() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("passenger");
  const [rides, setRides] = useState<Ride[]>([]);
  const [bookings, setBookings] = useState<RideBooking[]>([]);
  const [received, setReceived] = useState<RideBooking[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mine, mb, rb] = await Promise.all([
        api.get<Ride[]>("/rides/mine"),
        api.get<RideBooking[]>("/rides/bookings/mine"),
        api.get<RideBooking[]>("/rides/bookings/received"),
      ]);
      setRides(mine);
      setBookings(mb);
      setReceived(rb);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const cancelRide = (id: string) => {
    Alert.alert("Annuler ce trajet ?", "Les passagers seront prévenus.", [
      { text: "Non", style: "cancel" },
      {
        text: "Oui",
        style: "destructive",
        onPress: async () => {
          try {
            await api.patch(`/rides/${id}`, { status: "cancelled" });
            await load();
          } catch (e: any) {
            Alert.alert("Erreur", e.message);
          }
        },
      },
    ]);
  };

  const cancelBooking = (id: string) => {
    Alert.alert("Annuler la réservation ?", "", [
      { text: "Non", style: "cancel" },
      {
        text: "Oui",
        style: "destructive",
        onPress: async () => {
          try {
            await api.patch(`/rides/bookings/${id}`, { status: "cancelled" });
            await load();
          } catch (e: any) {
            Alert.alert("Erreur", e.message);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="mine-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Mes trajets</Txt>
        <Pressable onPress={() => router.push("/mobility/rides/publish")} style={[styles.back, { backgroundColor: colors.turquoise }]} testID="mine-add">
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable onPress={() => setTab("passenger")} style={[styles.tabBtn, tab === "passenger" && styles.tabBtnActive]} testID="tab-passenger">
          <Ionicons name="person" size={16} color={tab === "passenger" ? colors.white : colors.midnight} />
          <Txt weight="700" color={tab === "passenger" ? colors.white : colors.midnight} style={{ marginLeft: 6 }}>
            Passager ({bookings.length})
          </Txt>
        </Pressable>
        <Pressable onPress={() => setTab("driver")} style={[styles.tabBtn, tab === "driver" && styles.tabBtnActive]} testID="tab-driver">
          <Ionicons name="car" size={16} color={tab === "driver" ? colors.white : colors.midnight} />
          <Txt weight="700" color={tab === "driver" ? colors.white : colors.midnight} style={{ marginLeft: 6 }}>
            Conducteur ({rides.length})
          </Txt>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {tab === "passenger" ? (
          bookings.length === 0 ? (
            <EmptyState
              icon="ticket-outline"
              title="Aucune réservation"
              body="Réservez votre première place et retrouvez vos trajets ici."
              cta="Rechercher un trajet"
              onCta={() => router.push("/mobility/rides")}
            />
          ) : (
            bookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onCancel={() => cancelBooking(b.id)}
                onOpen={() => b.ride?.id && router.push(`/mobility/rides/${b.ride.id}`)}
              />
            ))
          )
        ) : rides.length === 0 ? (
          <EmptyState
            icon="car-outline"
            title="Vous n'avez pas encore publié de trajet"
            body="Devenez conducteur en publiant votre premier trajet."
            cta="Publier un trajet"
            onCta={() => router.push("/mobility/rides/publish")}
          />
        ) : (
          <>
            {received.length > 0 ? (
              <>
                <Txt size="md" weight="700">Réservations reçues</Txt>
                {received.map((rb) => (
                  <View key={rb.id} style={styles.recvCard}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={styles.avatarSm}>
                        <Ionicons name="person" size={18} color={colors.midnight} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Txt weight="700">{rb.passenger_name}</Txt>
                        <Txt size="xs" color={colors.textMuted}>{rb.seats} place(s) · {formatXof(rb.price_xof)}</Txt>
                      </View>
                      <View style={[styles.statusPill, rb.status === "cancelled" ? { backgroundColor: "#FEE2E2" } : { backgroundColor: "#DCFCE7" }]}>
                        <Txt size="xxs" weight="700" color={rb.status === "cancelled" ? colors.danger : "#166534"}>
                          {rb.status === "cancelled" ? "Annulée" : "Confirmée"}
                        </Txt>
                      </View>
                    </View>
                  </View>
                ))}
                <View style={{ height: spacing.md }} />
              </>
            ) : null}
            <Txt size="md" weight="700">Mes trajets publiés</Txt>
            {rides.map((r) => (
              <DriverCard
                key={r.id}
                ride={r}
                onOpen={() => router.push(`/mobility/rides/${r.id}`)}
                onCancel={() => cancelRide(r.id)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function EmptyState({ icon, title, body, cta, onCta }: any) {
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

function BookingCard({ booking, onOpen, onCancel }: any) {
  const r = booking.ride;
  return (
    <Pressable style={styles.card} onPress={onOpen}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Txt size="xs" color={colors.textMuted}>{r?.date} · {r?.time}</Txt>
        <View style={[styles.statusPill, booking.status === "cancelled" ? { backgroundColor: "#FEE2E2" } : { backgroundColor: "#DCFCE7" }]}>
          <Txt size="xxs" weight="700" color={booking.status === "cancelled" ? colors.danger : "#166534"}>
            {booking.status === "cancelled" ? "Annulée" : "Confirmée"}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="location" size={14} color={colors.turquoise} />
        <Txt weight="700" style={{ marginLeft: 6 }}>{r?.from_city}</Txt>
        <Ionicons name="arrow-forward" size={12} color={colors.textMuted} style={{ marginHorizontal: 6 }} />
        <Txt weight="700">{r?.to_city}</Txt>
      </View>
      <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
        Conducteur : {r?.driver_name}
      </Txt>
      <View style={styles.rowDivider} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Txt size="xs" color={colors.textMuted}>{booking.seats} place(s)</Txt>
          <Txt size="lg" weight="700" color={colors.turquoise}>{formatXof(booking.price_xof)}</Txt>
        </View>
        {booking.status !== "cancelled" ? (
          <Pressable onPress={onCancel} style={styles.ghostBtn}>
            <Txt size="xs" weight="700" color={colors.danger}>Annuler</Txt>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

function DriverCard({ ride, onOpen, onCancel }: any) {
  return (
    <Pressable style={styles.card} onPress={onOpen}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Txt size="xs" color={colors.textMuted}>{ride.date} · {ride.time}</Txt>
        <View style={[styles.statusPill, ride.status === "cancelled" ? { backgroundColor: "#FEE2E2" } : { backgroundColor: "#DCFCE7" }]}>
          <Txt size="xxs" weight="700" color={ride.status === "cancelled" ? colors.danger : "#166534"}>
            {ride.status === "cancelled" ? "Annulé" : "Actif"}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Txt weight="700">{ride.from_city}</Txt>
        <Ionicons name="arrow-forward" size={12} color={colors.textMuted} style={{ marginHorizontal: 6 }} />
        <Txt weight="700">{ride.to_city}</Txt>
      </View>
      <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
        {ride.seats_available}/{ride.seats_total} places dispo · {formatXof(ride.price_xof)}/pers.
      </Txt>
      {ride.status !== "cancelled" ? (
        <View style={styles.rowDivider} />
      ) : null}
      {ride.status !== "cancelled" ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Btn title="Voir" icon="eye" variant="secondary" size="sm" onPress={onOpen} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn title="Annuler" icon="close" variant="ghost" size="sm" onPress={onCancel} />
          </View>
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
  recvCard: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, ...shadow.soft },
  avatarSm: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rowDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  ghostBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#FEE2E2" },
  empty: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
});
