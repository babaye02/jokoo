import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Provider } from "@/src/api";
import { priceLabel } from "@/src/pricing";
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
  const { providerId, serviceId } = useLocalSearchParams<{ providerId: string; serviceId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<Provider | null>(null);
  const [dateIdx, setDateIdx] = useState(1);
  const [time, setTime] = useState("10:00");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const days = nextDays();

  useEffect(() => {
    if (providerId) api.get<Provider>(`/providers/${providerId}`).then(setP);
  }, [providerId]);

  // Résout la prestation sélectionnée (si serviceId fourni) — sinon retombe sur le profil.
  const selectedSvc = serviceId && p?.services ? p.services.find((s) => s.id === serviceId) : null;
  const priceSource = selectedSvc || p;
  const isQuote = !priceSource || priceSource.price_type === "quote" || priceSource.price_amount == null;

  const submit = async () => {
    setErr(null);
    if (!address.trim()) return setErr("Veuillez indiquer une adresse");
    if (!description.trim()) return setErr("Décrivez votre besoin pour permettre au prestataire de répondre");
    setLoading(true);
    try {
      const b = await api.post<any>("/bookings", {
        provider_id: providerId,
        service_id: serviceId || null,
        date: days[dateIdx].iso,
        time,
        address,
        description,
      });
      router.replace({
        pathname: "/booking/success",
        params: {
          bookingId: b.id,
          amount: String(b.price ?? ""),
          priceType: priceSource?.price_type || "quote",
        },
      });
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
                {selectedSvc ? (
                  <Txt size="xs" weight="600" color={colors.turquoise} style={{ marginTop: 2 }} numberOfLines={1}>
                    {selectedSvc.name}
                  </Txt>
                ) : null}
              </View>
              <Txt weight="700" color={colors.turquoise} numberOfLines={2} style={{ textAlign: "right", maxWidth: 110 }}>
                {priceLabel(priceSource || p)}
              </Txt>
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
              placeholder="Décrivez précisément votre besoin (matériel, surface, urgence…)"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              style={{ height: 110, textAlignVertical: "top", paddingTop: 12 }}
              testID="booking-description"
            />
          </View>

          <View style={styles.summary}>
            <Txt size="md" weight="700">Tarification</Txt>
            {isQuote ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 10 }}>
                  <Ionicons name="document-text" size={18} color={colors.turquoise} style={{ marginTop: 2 }} />
                  <Txt size="sm" color={colors.text} style={{ flex: 1, marginLeft: 8, lineHeight: 20 }}>
                    {"Le prestataire étudiera votre demande puis vous enverra un devis personnalisé dans le chat. Vous pourrez l'accepter et payer directement dans l'application."}
                  </Txt>
                </View>
                <View style={styles.quotePill} testID="quote-pill">
                  <Ionicons name="mail-open-outline" size={14} color={colors.midnight} />
                  <Txt size="sm" weight="700" color={colors.midnight} style={{ marginLeft: 6 }}>
                    Devis sur demande
                  </Txt>
                </View>
              </>
            ) : (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
                  <Txt color={colors.textMuted}>
                    {priceSource?.price_type === "from" ? "Prix de départ" : "Prix fixe"}
                  </Txt>
                  <Txt weight="700" size="xl" color={colors.turquoise}>{priceLabel(priceSource || p)}</Txt>
                </View>
                {priceSource?.price_type === "from" ? (
                  <Txt size="xs" color={colors.textMuted} style={{ marginTop: 8 }}>
                    Le montant final peut varier après visite / échange avec le prestataire.
                  </Txt>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn
            title={isQuote ? "Envoyer ma demande" : "Confirmer la réservation"}
            onPress={submit}
            loading={loading}
            fullWidth
            size="lg"
            testID="booking-submit"
          />
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
  quotePill: {
    alignSelf: "flex-start",
    marginTop: 12,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill, backgroundColor: colors.brandTertiary,
  },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
