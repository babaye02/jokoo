import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert, Image, Text } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { pickImageFromLibrary, uploadToCloudinary } from "@/src/media/cloudinary";
import { api, FamilyBooking } from "@/src/api";
import { MOOD_META } from "@/src/family";
import { Btn, ErrorBox, Input, Txt, Avatar } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const MOODS = ["happy", "calm", "tired", "upset"] as const;

function frDate(iso: string): string {
  try {
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}

export default function SubmitReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [booking, setBooking] = useState<FamilyBooking | null>(null);
  const [activities, setActivities] = useState("");
  const [meals, setMeals] = useState("");
  const [mood, setMood] = useState<typeof MOODS[number]>("happy");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try { setBooking(await api.get<FamilyBooking>(`/family/bookings/${id}`)); }
      catch { /* silent */ }
    })();
  }, [id]);

  const pickImage = async () => {
    try {
      const picked = await pickImageFromLibrary({ allowsEditing: true, quality: 0.85 });
      if (!picked) return;
      const uploaded = await uploadToCloudinary(picked, "reports");
      setPhoto(uploaded.secure_url);
    } catch (e: any) {
      Alert.alert("Upload impossible", e?.message || "Réessayez plus tard.");
    }
  };

  const submit = async () => {
    setErr(null);
    if (activities.trim().length < 3) return setErr("Décrivez brièvement les activités");
    setBusy(true);
    try {
      await api.post(`/family/bookings/${id}/report`, {
        activities: activities.trim(),
        meals: meals.trim(),
        mood,
        notes: notes.trim(),
        photo,
      });
      // Redirection immédiate (Alert.alert avec callback bloqué sur navigateur web)
      router.replace({ pathname: `/family/booking/${id}` as any, params: { just_reported: "1" } });
    } catch (e: any) {
      setErr(e.message || "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="rep-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Carnet de session</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled">
          <ErrorBox text={err} />

          {/* ── MISSION SUMMARY (tappable) ── */}
          {booking ? (
            <Pressable
              onPress={() => router.push({ pathname: "/family/booking/[id]", params: { id: id! } })}
              style={styles.summaryCard}
              testID="rep-summary"
            >
              <View style={styles.summaryHeader}>
                <Avatar name={booking.parent_name} size={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.summaryOverline}>Détails de la mission</Text>
                  <Text style={styles.summaryName} numberOfLines={1}>{booking.parent_name}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCell}>
                  <Ionicons name="calendar-outline" size={13} color="#0EA5E9" />
                  <Text style={styles.summaryCellTxt} numberOfLines={1}>{frDate(booking.date)}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Ionicons name="time-outline" size={13} color="#7C3AED" />
                  <Text style={styles.summaryCellTxt} numberOfLines={1}>{booking.time_start} – {booking.time_end}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Ionicons name="hourglass-outline" size={13} color="#D97706" />
                  <Text style={styles.summaryCellTxt} numberOfLines={1}>{booking.duration_hours} h</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Ionicons name="people-outline" size={13} color="#EC4899" />
                  <Text style={styles.summaryCellTxt} numberOfLines={1}>
                    {booking.kids.length} enfant{booking.kids.length > 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.summaryCell}>
                  <Ionicons name="location-outline" size={13} color="#DC2626" />
                  <Text style={styles.summaryCellTxt} numberOfLines={1}>{booking.city}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Ionicons name="chatbubble-ellipses-outline" size={13} color="#059669" />
                  <Text style={styles.summaryCellTxt} numberOfLines={1}>Voir consignes</Text>
                </View>
              </View>
              {booking.kids && booking.kids.length > 0 ? (
                <View style={styles.kidsRow}>
                  {booking.kids.slice(0, 3).map((k, i) => (
                    <View key={i} style={styles.kidChip}>
                      <Text style={styles.kidChipTxt} numberOfLines={1}>
                        {k.name} · {k.age} an{k.age > 1 ? "s" : ""}
                      </Text>
                    </View>
                  ))}
                  {booking.kids.length > 3 ? (
                    <View style={styles.kidChip}>
                      <Text style={styles.kidChipTxt}>+{booking.kids.length - 3}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          ) : null}

          <Txt size="sm" color={colors.textMuted} style={{ marginTop: spacing.md, marginBottom: spacing.md, lineHeight: 20 }}>
            Racontez au parent comment s&apos;est déroulée la session. Un moment mémorable ? Une nouvelle chanson ? Le parent adorera lire ces détails !
          </Txt>

          <Section icon="sparkles" title="Humeur de l'enfant" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {MOODS.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMood(m)}
                style={[styles.moodBtn, mood === m && { backgroundColor: MOOD_META[m].color, borderColor: MOOD_META[m].color }]}
                testID={`mood-${m}`}
              >
                <Txt size="xxl">{MOOD_META[m].emoji}</Txt>
                <Txt size="xxs" weight="700" color={mood === m ? colors.white : colors.midnight} style={{ marginTop: 4 }}>
                  {MOOD_META[m].label}
                </Txt>
              </Pressable>
            ))}
          </View>

          <Section icon="star" title="Activités réalisées" />
          <Input
            placeholder="Ex. Lecture d'un conte en anglais, dessin, comptines, jeu de cartes…"
            value={activities}
            onChangeText={setActivities}
            multiline
            numberOfLines={4}
            style={{ height: 110, textAlignVertical: "top", paddingTop: 12 }}
            testID="rep-activities"
          />

          <Section icon="restaurant" title="Repas & goûters" />
          <Input
            placeholder="Ex. Goûter à 16h (fruits + biscuit), a bien mangé…"
            value={meals}
            onChangeText={setMeals}
            multiline
            numberOfLines={3}
            style={{ height: 90, textAlignVertical: "top", paddingTop: 12 }}
            testID="rep-meals"
          />

          <Section icon="chatbox-ellipses" title="Notes complémentaires (optionnel)" />
          <Input
            placeholder="Anecdotes, apprentissages, remarques pour le parent…"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            style={{ height: 90, textAlignVertical: "top", paddingTop: 12 }}
            testID="rep-notes"
          />

          <Section icon="camera" title="Photo souvenir (optionnel)" />
          {photo ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: photo }} style={styles.photo} />
              <Pressable onPress={() => setPhoto(null)} style={styles.removePhoto}>
                <Ionicons name="close" size={16} color={colors.white} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={pickImage} style={styles.photoBtn} testID="rep-photo">
              <Ionicons name="image" size={20} color={colors.turquoise} />
              <Txt weight="600" color={colors.turquoise} style={{ marginLeft: 8 }}>Ajouter une photo</Txt>
            </Pressable>
          )}
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn title="Envoyer le carnet & terminer" icon="send" onPress={submit} loading={busy} fullWidth size="lg" testID="rep-submit" />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Section({ icon, title }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.md }}>
      <Ionicons name={icon} size={16} color={colors.turquoise} />
      <Txt size="md" weight="700" style={{ marginLeft: 8 }}>{title}</Txt>
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
  moodBtn: {
    flex: 1,
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.turquoise,
    backgroundColor: colors.brandTertiary,
  },
  photoWrap: { position: "relative", alignSelf: "flex-start" },
  photo: { width: 140, height: 140, borderRadius: radius.md, backgroundColor: colors.surface3 },
  removePhoto: { position: "absolute", top: -6, right: -6, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },

  // Mission summary
  summaryCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.hairline,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryOverline: {
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  summaryName: {
    fontFamily: "InstrumentSerif",
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: colors.text,
    marginTop: 2,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryCell: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#FAFAFA",
    gap: 6,
  },
  summaryCellTxt: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
    letterSpacing: -0.1,
  },
  kidsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  kidChip: {
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#FCE7F3",
    justifyContent: "center",
  },
  kidChipTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9F1239",
    letterSpacing: -0.1,
  },
});
