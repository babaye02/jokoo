// Formulaire d'avis parent → baby-sitter — accessible depuis /family/booking/{id}
// quand la mission est marquée "completed" et qu'aucun avis n'a été laissé.
import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function LeaveFamilyReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (rating < 1 || rating > 5) return setErr("Sélectionnez une note de 1 à 5 étoiles");
    setSaving(true);
    try {
      await api.post("/family/reviews", { family_booking_id: id, rating, comment: comment.trim() });
      router.replace({ pathname: `/family/booking/${id}` as any, params: { just_reviewed: "1" } });
    } catch (e: any) {
      setErr(e?.message || "Impossible d'enregistrer votre avis");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={22} color={colors.midnight} /></Pressable>
        <Txt size="lg" weight="700">Votre avis</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <Card>
          <Txt weight="700">Comment s&apos;est passée la session ?</Txt>
          <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
            Votre note aide d&apos;autres parents à choisir en confiance.
          </Txt>
          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: spacing.lg, gap: 6 }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Pressable key={s} onPress={() => setRating(s)} hitSlop={8} testID={`star-${s}`}>
                <Ionicons
                  name={s <= rating ? "star" : "star-outline"}
                  size={40}
                  color={s <= rating ? "#F59E0B" : colors.textSubtle}
                />
              </Pressable>
            ))}
          </View>
          <Txt size="sm" color={colors.textMuted} style={{ textAlign: "center", marginTop: 8 }}>
            {rating === 0 ? "Sélectionnez une note" : `${rating} étoile${rating > 1 ? "s" : ""}`}
          </Txt>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Txt weight="700" style={{ marginBottom: 8 }}>Votre commentaire (optionnel)</Txt>
          <TextInput
            value={comment}
            onChangeText={setComment}
            multiline
            placeholder="Ponctualité, attention aux enfants, communication…"
            placeholderTextColor={colors.textSubtle}
            style={styles.textarea}
            testID="review-comment"
          />
        </Card>

        {err ? (
          <View style={styles.errBox}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Txt size="xs" color={colors.danger} style={{ marginLeft: 6, flex: 1 }}>{err}</Txt>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
        <Btn
          title="Publier l'avis"
          onPress={submit}
          loading={saving}
          disabled={rating === 0 || saving}
          fullWidth
          size="lg"
          testID="review-submit"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  textarea: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, textAlignVertical: "top", fontSize: 14, color: colors.text, backgroundColor: colors.surface2 },
  errBox: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: radius.md, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", marginTop: spacing.md },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
