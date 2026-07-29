import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Provider } from "@/src/api";
import { Btn, ErrorBox, Input, Txt } from "@/src/components/ui";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

function nextDays(n = 7) {
  const arr: { label: string; day: string; date: Date; iso: string }[] = [];
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    arr.push({
      label: `${d.getDate()}`,
      day: days[d.getDay()],
      date: d,
      iso: d.toISOString().slice(0, 10),
    });
  }
  return arr;
}
const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

export default function BookingScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<Provider | null>(null);
  const [dateIdx, setDateIdx] = useState(1);
  const [time, setTime] = useState("10:00");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("2");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const days = nextDays();

  useEffect(() => {
    if (providerId) api.get<Provider>(`/providers/${providerId}`).then(setP);
  }, [providerId]);

  const estimated = (p?.hourly_price || 0) * Math.max(1, parseInt(hours || "1", 10) || 1);

  const submit = async () => {
    setErr(null);
    if (!address.trim()) return setErr("Veuillez indiquer une adresse");
    setLoading(true);
    try {
      const b = await api.post<any>("/bookings", {
        provider_id: providerId,
        date: days[dateIdx].iso,
        time,
        address,
        description,
        estimated_price: estimated,
      });
      router.replace({ pathname: "/booking/success", params: { bookingId: b.id, amount: String(estimated) } });
    } catch (e: any) {
      setErr(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="booking-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Réserver</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled">
          {p ? (
            <View style={styles.providerBox}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="briefcase" size={20} color={colors.turquoise} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Txt weight="700">{p.name}</Txt>
                <Txt size="xs" color={colors.textMuted}>{p.service} · {p.city}</Txt>
              </View>
              <Txt weight="700" color={colors.turquoise}>{p.hourly_price.toLocaleString()} F/h</Txt>
            </View>
          ) : null}

          <ErrorBox text={err} />

          <Txt size="md" weight="700" style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>Choisir une date</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {days.map((d, i) => (
              <Pressable
                key={d.iso}
                onPress={() => setDateIdx(i)}
                style={[styles.dayBtn, i === dateIdx && styles.dayBtnActive]}
                testID={`booking-day-${i}`}
              >
                <Txt size="xs" color={i === dateIdx ? colors.white : colors.textMuted} weight="600">{d.day}</Txt>
                <Txt size="xl" weight="700" color={i === dateIdx ? colors.white : colors.text} style={{ marginTop: 2 }}>{d.label}</Txt>
              </Pressable>
            ))}
          </ScrollView>

          <Txt size="md" weight="700" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Heure</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {HOURS.map((h) => (
              <Pressable
                key={h}
                onPress={() => setTime(h)}
                style={[styles.timeBtn, h === time && styles.timeBtnActive]}
                testID={`booking-time-${h}`}
              >
                <Txt weight="600" color={h === time ? colors.white : colors.midnight}>{h}</Txt>
              </Pressable>
            ))}
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Input label="Adresse" icon="location-outline" placeholder="Rue, quartier, ville" value={address} onChangeText={setAddress} testID="booking-address" />
            <Input
              label="Description du besoin"
              icon="document-text-outline"
              placeholder="Ex: fuite sous l'évier de la cuisine…"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              style={{ height: 100, textAlignVertical: "top", paddingTop: 12 }}
              testID="booking-description"
            />
            <Input
              label="Durée estimée (heures)"
              icon="time-outline"
              placeholder="2"
              keyboardType="numeric"
              value={hours}
              onChangeText={setHours}
              testID="booking-hours"
            />
          </View>

          <View style={styles.summary}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt color={colors.textMuted}>Tarif horaire</Txt>
              <Txt weight="600">{(p?.hourly_price || 0).toLocaleString()} F</Txt>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <Txt color={colors.textMuted}>Durée</Txt>
              <Txt weight="600">{hours || 1} h</Txt>
            </View>
            <View style={styles.line} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt size="md" weight="700">Total estimé</Txt>
              <Txt size="xl" weight="700" color={colors.turquoise}>{estimated.toLocaleString()} F</Txt>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn title="Confirmer la réservation" onPress={submit} loading={loading} fullWidth size="lg" testID="booking-submit" />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  providerBox: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: colors.surface2, borderRadius: radius.lg },
  dayBtn: { width: 64, height: 80, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  dayBtnActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  timeBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  timeBtnActive: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  summary: { marginTop: spacing.xl, backgroundColor: colors.surface2, borderRadius: radius.lg, padding: spacing.lg },
  line: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
