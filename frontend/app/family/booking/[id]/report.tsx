import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert, Image } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api";
import { MOOD_META } from "@/src/family";
import { Btn, ErrorBox, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const MOODS = ["happy", "calm", "tired", "upset"] as const;

export default function SubmitReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activities, setActivities] = useState("");
  const [meals, setMeals] = useState("");
  const [mood, setMood] = useState<typeof MOODS[number]>("happy");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission requise", "Autorisez l'accès à la galerie pour joindre une photo.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true, allowsEditing: true });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      const b64 = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      setPhoto(b64);
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
          <Txt size="sm" color={colors.textMuted} style={{ marginBottom: spacing.md, lineHeight: 20 }}>
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
});
