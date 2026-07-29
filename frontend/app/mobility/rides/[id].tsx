import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Ride } from "@/src/api";
import { useAuth } from "@/src/auth";
import { formatXof } from "@/src/pricing";
import { Txt, Btn, Avatar, ErrorBox, Card } from "@/src/components/ui";
import { colors, shadow, spacing } from "@/src/theme";

const WEEKDAY_FR: Record<string, string> = { mon: "Lun", tue: "Mar", wed: "Mer", thu: "Jeu", fri: "Ven", sat: "Sam", sun: "Dim" };

export default function RideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [ride, setRide] = useState<Ride | null>(null);
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<Ride>(`/rides/${id}`).then(setRide).catch(() => setRide(null));
  }, [id]);

  if (!ride) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}>
        <Txt color={colors.textMuted}>Chargement…</Txt>
      </View>
    );
  }

  const isMine = user?.id === ride.driver_id;
  const isFull = ride.seats_available <= 0;
  const total = seats * ride.price_xof;

  const book = async () => {
    setErr(null);
    if (isMine) return setErr("Vous êtes le conducteur de ce trajet");
    if (seats > ride.seats_available) return setErr("Plus assez de places disponibles");
    setBusy(true);
    try {
      await api.post(`/rides/${ride.id}/book`, { seats });
      Alert.alert("Réservation confirmée", `${seats} place(s) réservée(s) — ${formatXof(total)}`, [
        { text: "OK", onPress: () => router.replace("/mobility/rides/mine") },
      ]);
    } catch (e: any) {
      setErr(e.message || "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const contactDriver = () => {
    router.push(`/chat/${ride.driver_id}`);
  };

  const cancelRide = async () => {
    Alert.alert("Annuler le trajet ?", "Les passagers seront prévenus.", [
      { text: "Non", style: "cancel" },
      {
        text: "Oui",
        style: "destructive",
        onPress: async () => {
          try {
            await api.patch(`/rides/${ride.id}`, { status: "cancelled" });
            router.back();
          } catch (e: any) {
            setErr(e.message || "Erreur");
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="ride-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Détail du trajet</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 180 + insets.bottom }}>
        {/* Route card */}
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
            <View style={styles.tagBig}>
              <Ionicons name="calendar" size={12} color={colors.midnight} />
              <Txt size="xs" weight="700" color={colors.midnight} style={{ marginLeft: 4 }}>
                {ride.date} · {ride.time}
              </Txt>
            </View>
            {ride.recurrence === "weekly" ? (
              <View style={[styles.tagBig, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="repeat" size={12} color="#92400E" />
                <Txt size="xs" weight="700" color="#92400E" style={{ marginLeft: 4 }}>Récurrent</Txt>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: "row" }}>
            <View style={{ alignItems: "center", width: 20, marginRight: 14, paddingTop: 6 }}>
              <View style={[styles.dot, { backgroundColor: colors.turquoise }]} />
              <View style={styles.line} />
              {ride.stops?.map((s, i) => (
                <View key={i} style={{ alignItems: "center", marginTop: 12 }}>
                  <View style={[styles.dot, { backgroundColor: colors.textSubtle, width: 8, height: 8, borderRadius: 4 }]} />
                  <View style={[styles.line, { height: 20 }]} />
                </View>
              ))}
              <View style={[styles.dot, { backgroundColor: colors.midnight, marginTop: 12 }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt size="lg" weight="700">{ride.from_city}</Txt>
              {ride.from_address ? <Txt size="xs" color={colors.textMuted}>{ride.from_address}</Txt> : null}
              {ride.stops?.map((s, i) => (
                <View key={i} style={{ marginTop: 18 }}>
                  <Txt size="sm" weight="600">{s.city}</Txt>
                  {s.address ? <Txt size="xxs" color={colors.textMuted}>{s.address}</Txt> : null}
                </View>
              ))}
              <View style={{ height: 18 }} />
              <Txt size="lg" weight="700">{ride.to_city}</Txt>
              {ride.to_address ? <Txt size="xs" color={colors.textMuted}>{ride.to_address}</Txt> : null}
            </View>
          </View>

          {ride.recurrence === "weekly" && ride.recurrence_days?.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.md }}>
              {ride.recurrence_days.map((d) => (
                <View key={d} style={styles.dayChip}>
                  <Txt size="xxs" weight="700" color={colors.midnight}>{WEEKDAY_FR[d]}</Txt>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        {/* Driver */}
        <View style={{ marginTop: spacing.md }}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Avatar uri={ride.driver_avatar || undefined} name={ride.driver_name} size={54} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Txt size="md" weight="700" style={{ flex: 1 }}>{ride.driver_name}</Txt>
                  {ride.driver_verified ? <Ionicons name="checkmark-circle" size={16} color={colors.turquoise} /> : null}
                </View>
                <Txt size="xs" color={colors.textMuted}>
                  {ride.driver_city || "Sénégal"}
                  {ride.driver_rating ? ` · ⭐ ${ride.driver_rating.toFixed(1)}` : ""}
                </Txt>
                {ride.vehicle_model ? (
                  <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>
                    🚗 {ride.vehicle_model}
                    {ride.vehicle_color ? ` · ${ride.vehicle_color}` : ""}
                  </Txt>
                ) : null}
              </View>
              {!isMine ? (
                <Pressable onPress={contactDriver} style={styles.chatBtn} testID="ride-contact">
                  <Ionicons name="chatbubble-ellipses" size={20} color={colors.turquoise} />
                </Pressable>
              ) : null}
            </View>
          </Card>
        </View>

        {/* Notes */}
        {ride.notes ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <Txt size="sm" weight="700">Informations du conducteur</Txt>
              <Txt size="sm" color={colors.text} style={{ marginTop: 6, lineHeight: 20 }}>{ride.notes}</Txt>
            </Card>
          </View>
        ) : null}

        {/* Booking */}
        {!isMine ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <Txt size="md" weight="700">Réservation</Txt>
              <ErrorBox text={err} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md }}>
                <Txt color={colors.textMuted}>Nombre de places</Txt>
                <View style={styles.stepper}>
                  <Pressable onPress={() => setSeats(Math.max(1, seats - 1))} style={styles.stepBtn} testID="seats-minus">
                    <Ionicons name="remove" size={18} color={colors.midnight} />
                  </Pressable>
                  <Txt size="lg" weight="700" style={{ marginHorizontal: 14 }}>{seats}</Txt>
                  <Pressable onPress={() => setSeats(Math.min(ride.seats_available, seats + 1))} style={styles.stepBtn} testID="seats-plus">
                    <Ionicons name="add" size={18} color={colors.midnight} />
                  </Pressable>
                </View>
              </View>
              <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 6 }}>
                {ride.seats_available}/{ride.seats_total} places disponibles
              </Txt>
              <View style={styles.totalRow}>
                <Txt weight="700">Total</Txt>
                <Txt size="xl" weight="700" color={colors.turquoise}>{formatXof(total)}</Txt>
              </View>
            </Card>
          </View>
        ) : (
          <View style={{ marginTop: spacing.md, flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Btn title="Voir passagers" icon="people" variant="secondary" onPress={() => router.push("/mobility/rides/mine")} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn title="Annuler trajet" icon="close-circle" variant="ghost" onPress={cancelRide} testID="ride-cancel" />
            </View>
          </View>
        )}
      </ScrollView>

      {!isMine ? (
        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn
            title={isFull ? "Complet" : `Réserver — ${formatXof(total)}`}
            onPress={book}
            loading={busy}
            disabled={isFull}
            fullWidth
            size="lg"
            testID="ride-book"
          />
        </View>
      ) : null}
    </View>
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
  tagBig: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  line: { flex: 1, width: 2, backgroundColor: colors.borderStrong, marginVertical: 3, minHeight: 24 },
  dayChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.brandTertiary },
  chatBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface2, borderRadius: 999, padding: 4 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
