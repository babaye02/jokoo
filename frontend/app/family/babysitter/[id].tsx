import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Image } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Babysitter } from "@/src/api";
import { LANG_LEVEL_LABEL, LEVEL_LABEL, PROFILE_TYPE_LABEL, ageMeta, langMeta, serviceMeta, skillMeta } from "@/src/family";
import { formatXof } from "@/src/pricing";
import { Btn, Card, Txt } from "@/src/components/ui";
import { TrustBadges, AvailabilityChips } from "@/src/components/family-badges";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function BabysitterDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [b, setB] = useState<Babysitter | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<Babysitter>(`/family/babysitters/${id}`).then(setB).catch(() => setB(null));
  }, [id]);

  if (!b) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}>
        <Txt color={colors.textMuted}>Chargement…</Txt>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="sitter-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Profil étudiant</Txt>
        <Pressable onPress={() => router.push(`/chat/${b.user_id}`)} style={styles.back} testID="sitter-chat">
          <Ionicons name="chatbubble-ellipses" size={20} color={colors.midnight} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160 + insets.bottom }}>
        {/* Hero card */}
        <Card>
          <View style={{ flexDirection: "row" }}>
            {b.avatar ? (
              <Image source={{ uri: b.avatar }} style={styles.avatarBig} />
            ) : (
              <View style={[styles.avatarBig, { backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }]}>
                <Txt size="xxxl">👤</Txt>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: spacing.md, justifyContent: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt size="xl" weight="700" style={{ flex: 1 }} numberOfLines={1}>{b.name}</Txt>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                <Txt style={{ fontSize: 12 }}>{PROFILE_TYPE_LABEL[b.profile_type || "student"]?.emoji}</Txt>
                <Txt size="sm" color={colors.textMuted} style={{ marginLeft: 4 }}>
                  {PROFILE_TYPE_LABEL[b.profile_type || "student"]?.label} · {LEVEL_LABEL[b.level] || b.level}
                </Txt>
              </View>
              <Txt size="xs" color={colors.textSubtle}>{b.university}{b.field_of_study ? ` · ${b.field_of_study}` : ""}</Txt>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Txt size="xs" weight="700" style={{ marginLeft: 4 }}>{(b.rating || 0).toFixed(1)}</Txt>
                <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 4 }}>({b.reviews_count} avis)</Txt>
                <Ionicons name="location-outline" size={12} color={colors.textMuted} style={{ marginLeft: 10 }} />
                <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 3 }}>{b.city}</Txt>
              </View>
            </View>
          </View>

          <View style={{ marginTop: spacing.md }}>
            <TrustBadges b={b} />
          </View>
          <View style={{ marginTop: 8 }}>
            <AvailabilityChips b={b} />
          </View>
        </Card>

        {/* Services offerts */}
        {b.services && b.services.length > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <Txt size="sm" weight="700" style={{ marginBottom: spacing.sm }}>Services proposés</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {b.services.map((s) => {
                  const meta = serviceMeta(s);
                  return (
                    <View key={s} style={styles.serviceCard}>
                      <Txt size="lg">{meta?.emoji}</Txt>
                      <Txt size="xs" weight="700" style={{ marginTop: 4 }}>{meta?.label || s}</Txt>
                    </View>
                  );
                })}
              </View>
            </Card>
          </View>
        ) : null}

        {/* Bio */}
        <View style={{ marginTop: spacing.md }}>
          <Card>
            <Txt size="sm" weight="700" style={{ marginBottom: 6 }}>À propos</Txt>
            <Txt size="sm" color={colors.text} style={{ lineHeight: 20 }}>{b.bio}</Txt>
          </Card>
        </View>

        {/* Languages */}
        <View style={{ marginTop: spacing.md }}>
          <Card>
            <Txt size="sm" weight="700" style={{ marginBottom: spacing.sm }}>Langues parlées</Txt>
            <View style={{ gap: 8 }}>
              {b.languages.map((l) => (
                <View key={l.code} style={styles.langRow}>
                  <Txt size="lg">{langMeta(l.code).flag}</Txt>
                  <Txt size="sm" weight="700" style={{ marginLeft: 10, flex: 1 }}>{langMeta(l.code).label}</Txt>
                  <View style={styles.levelPill}>
                    <Txt size="xxs" weight="700" color={colors.midnight}>{LANG_LEVEL_LABEL[l.level] || l.level}</Txt>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* Age groups */}
        <View style={{ marginTop: spacing.md }}>
          <Card>
            <Txt size="sm" weight="700" style={{ marginBottom: spacing.sm }}>Tranches d&apos;âge maîtrisées</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {b.age_specialties.map((a) => (
                <View key={a} style={styles.pillOutline}>
                  <Txt>{ageMeta(a)?.icon}</Txt>
                  <Txt size="xs" weight="600" style={{ marginLeft: 4 }}>{ageMeta(a)?.label}</Txt>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* Skills */}
        {b.skills?.length ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <Txt size="sm" weight="700" style={{ marginBottom: spacing.sm }}>Compétences</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {b.skills.map((s) => {
                  const m = skillMeta(s);
                  return (
                    <View key={s} style={styles.pillOutline}>
                      <Ionicons name={(m?.icon || "star") as any} size={12} color={colors.turquoise} />
                      <Txt size="xs" weight="600" style={{ marginLeft: 4 }}>{m?.label || s}</Txt>
                    </View>
                  );
                })}
              </View>
            </Card>
          </View>
        ) : null}

        {/* Tutoring subjects */}
        {b.offers_tutoring && b.tutoring_subjects?.length ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <Txt size="sm" weight="700" style={{ marginBottom: spacing.sm }}>Matières enseignées</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {b.tutoring_subjects.map((t) => (
                  <View key={t} style={[styles.pillOutline, { backgroundColor: "#DBEAFE", borderColor: "#DBEAFE" }]}>
                    <Ionicons name="school" size={11} color="#1E40AF" />
                    <Txt size="xs" weight="600" color="#1E40AF" style={{ marginLeft: 4 }}>{t}</Txt>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom booking bar */}
      <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
        <View style={{ flex: 1 }}>
          <Txt size="xxs" color={colors.textMuted}>Tarif</Txt>
          <Txt size="xl" weight="700" color={colors.turquoise}>{formatXof(b.hourly_rate_xof)}</Txt>
          <Txt size="xxs" color={colors.textSubtle}>/ heure</Txt>
        </View>
        <View style={{ flex: 1.4 }}>
          <Btn title="Réserver" icon="calendar" onPress={() => router.push(`/family/book/${b.id}`)} fullWidth testID="sitter-book" />
        </View>
      </View>
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
  avatarBig: { width: 92, height: 92, borderRadius: radius.md, backgroundColor: colors.surface3 },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
  },
  levelPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.brandTertiary },
  pillOutline: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  serviceCard: {
    width: "30%",
    alignItems: "center",
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tag: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bottom: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
