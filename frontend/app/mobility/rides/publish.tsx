import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, RideStop } from "@/src/api";
import { Btn, Chip, ErrorBox, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const WEEKDAYS = [
  { key: "mon", label: "Lun" },
  { key: "tue", label: "Mar" },
  { key: "wed", label: "Mer" },
  { key: "thu", label: "Jeu" },
  { key: "fri", label: "Ven" },
  { key: "sat", label: "Sam" },
  { key: "sun", label: "Dim" },
];

function todayDays(n = 30) {
  const arr: { label: string; day: string; iso: string }[] = [];
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    arr.push({ label: `${d.getDate()}`, day: days[d.getDay()], iso: d.toISOString().slice(0, 10) });
  }
  return arr;
}

const HOURS = ["05:00", "06:00", "06:30", "07:00", "07:30", "08:00", "09:00", "10:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

export default function PublishRide() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const days = todayDays();

  const [fromCity, setFromCity] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [toCity, setToCity] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [stops, setStops] = useState<RideStop[]>([]);
  const [newStop, setNewStop] = useState("");
  const [dateIdx, setDateIdx] = useState(1);
  const [time, setTime] = useState("07:30");
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState("2500");
  const [distanceType, setDistanceType] = useState<"short" | "long">("long");
  const [recurrence, setRecurrence] = useState<"none" | "weekly">("none");
  const [recDays, setRecDays] = useState<string[]>([]);
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addStop = () => {
    const t = newStop.trim();
    if (!t) return;
    setStops((s) => [...s, { city: t }]);
    setNewStop("");
  };

  const toggleRecDay = (key: string) => {
    setRecDays((d) => (d.includes(key) ? d.filter((x) => x !== key) : [...d, key]));
  };

  const submit = async () => {
    setErr(null);
    if (!fromCity.trim() || !toCity.trim()) return setErr("Veuillez indiquer une ville de départ et une destination");
    const pn = parseInt(price || "0", 10);
    if (isNaN(pn) || pn < 0) return setErr("Prix invalide");
    if (recurrence === "weekly" && recDays.length === 0) return setErr("Sélectionnez au moins un jour de la semaine");
    setLoading(true);
    try {
      const body = {
        from_city: fromCity.trim(),
        from_address: fromAddress.trim(),
        to_city: toCity.trim(),
        to_address: toAddress.trim(),
        stops,
        date: days[dateIdx].iso,
        time,
        seats_total: seats,
        price_xof: pn,
        distance_type: distanceType,
        recurrence,
        recurrence_days: recurrence === "weekly" ? recDays : [],
        vehicle_model: vehicleModel.trim(),
        vehicle_plate: vehiclePlate.trim(),
        vehicle_color: vehicleColor.trim(),
        notes: notes.trim(),
      };
      const r = await api.post<{ id: string }>("/rides", body);
      router.replace(`/mobility/rides/${r.id}`);
    } catch (e: any) {
      setErr(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="publish-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Publier un trajet</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160 + insets.bottom }} keyboardShouldPersistTaps="handled">
          <ErrorBox text={err} />

          <SectionTitle icon="location" label="Itinéraire" />
          <Input label="Ville de départ" icon="pin" placeholder="Ex. Dakar" value={fromCity} onChangeText={setFromCity} testID="pub-from-city" />
          <Input label="Adresse / point précis (facultatif)" icon="navigate" placeholder="Ex. Plateau, Marché Sandaga" value={fromAddress} onChangeText={setFromAddress} testID="pub-from-addr" />
          <Input label="Destination" icon="flag" placeholder="Ex. Thiès" value={toCity} onChangeText={setToCity} testID="pub-to-city" />
          <Input label="Adresse d'arrivée (facultatif)" icon="location" placeholder="Ex. Randoulène" value={toAddress} onChangeText={setToAddress} testID="pub-to-addr" />

          <SectionTitle icon="git-branch" label="Étapes intermédiaires" />
          {stops.map((s, i) => (
            <View key={i} style={styles.stopRow}>
              <Ionicons name="ellipse" size={10} color={colors.turquoise} />
              <Txt style={{ flex: 1, marginLeft: 10 }} weight="600">{s.city}</Txt>
              <Pressable onPress={() => setStops((arr) => arr.filter((_, j) => j !== i))}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Input placeholder="Ajouter une étape (ex. Rufisque)" value={newStop} onChangeText={setNewStop} icon="add-circle-outline" testID="pub-new-stop" />
            </View>
            <Pressable onPress={addStop} style={styles.addBtn} testID="pub-add-stop">
              <Ionicons name="add" size={20} color={colors.white} />
            </Pressable>
          </View>

          <SectionTitle icon="calendar" label="Date & heure" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d, i) => (
              <Pressable
                key={d.iso}
                onPress={() => setDateIdx(i)}
                style={[styles.dayBtn, i === dateIdx && styles.dayBtnActive]}
                testID={`pub-day-${i}`}
              >
                <Txt size="xxs" color={i === dateIdx ? colors.white : colors.textMuted} weight="600">{d.day}</Txt>
                <Txt size="lg" weight="700" color={i === dateIdx ? colors.white : colors.text}>{d.label}</Txt>
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ marginTop: spacing.md }}>
            <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Heure de départ</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {HOURS.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => setTime(h)}
                  style={[styles.timeBtn, h === time && styles.timeBtnActive]}
                  testID={`pub-time-${h}`}
                >
                  <Txt weight="600" color={h === time ? colors.white : colors.midnight}>{h}</Txt>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <SectionTitle icon="options" label="Options du trajet" />
          <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.md }}>
            <Chip label="Courte distance" icon="pin" active={distanceType === "short"} onPress={() => setDistanceType("short")} testID="pub-short" />
            <Chip label="Longue distance" icon="navigate" active={distanceType === "long"} onPress={() => setDistanceType("long")} testID="pub-long" />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="Trajet unique" icon="ellipse-outline" active={recurrence === "none"} onPress={() => setRecurrence("none")} testID="pub-unique" />
            <Chip label="Récurrent" icon="repeat" active={recurrence === "weekly"} onPress={() => setRecurrence("weekly")} testID="pub-recurrent" />
          </View>

          {recurrence === "weekly" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md }}>
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d.key}
                  label={d.label}
                  active={recDays.includes(d.key)}
                  onPress={() => toggleRecDay(d.key)}
                  testID={`pub-day-${d.key}`}
                />
              ))}
            </View>
          ) : null}

          <SectionTitle icon="people" label="Places & prix" />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Places disponibles</Txt>
              <View style={styles.stepper}>
                <Pressable onPress={() => setSeats(Math.max(1, seats - 1))} style={styles.stepBtn} testID="pub-seats-minus">
                  <Ionicons name="remove" size={18} color={colors.midnight} />
                </Pressable>
                <Txt size="lg" weight="700" style={{ marginHorizontal: 14 }}>{seats}</Txt>
                <Pressable onPress={() => setSeats(Math.min(8, seats + 1))} style={styles.stepBtn} testID="pub-seats-plus">
                  <Ionicons name="add" size={18} color={colors.midnight} />
                </Pressable>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Prix / passager (F CFA)"
                icon="cash-outline"
                keyboardType="numeric"
                value={price}
                onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))}
                testID="pub-price"
              />
            </View>
          </View>

          <SectionTitle icon="car" label="Véhicule (facultatif)" />
          <Input label="Modèle" placeholder="Ex. Toyota Yaris" icon="car" value={vehicleModel} onChangeText={setVehicleModel} testID="pub-veh-model" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input label="Immatriculation" placeholder="DK 1234 A" value={vehiclePlate} onChangeText={setVehiclePlate} testID="pub-veh-plate" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Couleur" placeholder="Blanc" value={vehicleColor} onChangeText={setVehicleColor} testID="pub-veh-color" />
            </View>
          </View>

          <SectionTitle icon="chatbox-ellipses" label="Notes pour les passagers" />
          <Input
            placeholder="Ex. Départ ponctuel — climatisation dispo — bagage limité…"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            style={{ height: 110, textAlignVertical: "top", paddingTop: 12 }}
            testID="pub-notes"
          />
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn title="Publier le trajet" onPress={submit} loading={loading} fullWidth size="lg" testID="pub-submit" />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SectionTitle({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.md }}>
      <Ionicons name={icon} size={16} color={colors.turquoise} />
      <Txt size="md" weight="700" style={{ marginLeft: 8 }}>{label}</Txt>
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
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addBtn: { height: 52, width: 52, borderRadius: radius.md, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  dayBtn: { width: 58, height: 68, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  dayBtnActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  timeBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  timeBtnActive: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface2, borderRadius: 999, padding: 4, alignSelf: "flex-start" },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
