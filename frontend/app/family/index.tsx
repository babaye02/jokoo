import { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Text } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, Babysitter } from "@/src/api";
import { AGE_GROUPS, LANGUAGES, SERVICES, SKILLS } from "@/src/family";
import { formatXof } from "@/src/pricing";
import { Txt, Chip, Btn, Avatar } from "@/src/components/ui";
import { TrustBadges, AvailabilityChips } from "@/src/components/family-badges";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function FamilyHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ just_profile?: string }>();
  const [lang, setLang] = useState<string>("");
  const [ageGroup, setAgeGroup] = useState<string>("");
  const [skill, setSkill] = useState<string>("");
  const [service, setService] = useState<string>("");
  const [profileType, setProfileType] = useState<string>("");
  const [availableToday, setAvailableToday] = useState(false);
  const [nightCare, setNightCare] = useState(false);
  const [canTravel, setCanTravel] = useState(false);
  const [recommended, setRecommended] = useState(false);
  const [verifiedPlus, setVerifiedPlus] = useState(false);
  const [items, setItems] = useState<Babysitter[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showToast, setShowToast] = useState<boolean>(params.just_profile === "1");

  useEffect(() => {
    if (params.just_profile === "1") {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 5000);
      return () => clearTimeout(t);
    }
  }, [params.just_profile]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (lang) qs.append("language", lang);
    if (ageGroup) qs.append("age_group", ageGroup);
    if (skill) qs.append("skill", skill);
    if (service) qs.append("service", service);
    if (profileType) qs.append("profile_type", profileType);
    if (availableToday) qs.append("available_today", "true");
    if (nightCare) qs.append("night_care", "true");
    if (canTravel) qs.append("can_travel", "true");
    if (recommended) qs.append("recommended", "true");
    if (verifiedPlus) qs.append("verified_plus", "true");
    try {
      const r = await api.get<Babysitter[]>(`/family/babysitters?${qs.toString()}`);
      setItems(r);
    } catch {
      setItems([]);
    }
  }, [lang, ageGroup, skill, service, profileType, availableToday, nightCare, canTravel, recommended, verifiedPlus]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const topLanguages = useMemo(() => LANGUAGES.slice(0, 5), []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.headerHero}>
          <LinearGradient
            colors={["#0B1F3A", "#1F1F1F"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Pressable onPress={() => router.back()} style={styles.back} testID="family-back">
              <Ionicons name="chevron-back" size={22} color={colors.white} />
            </Pressable>
            <Pressable onPress={() => router.push("/family/mine")} style={styles.back} testID="family-mine">
              <Ionicons name="briefcase-outline" size={20} color={colors.white} />
            </Pressable>
          </View>
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 11, letterSpacing: 1.6, color: colors.accent, fontWeight: "700", textTransform: "uppercase" }}>Jokoo Family</Text>
            <Text style={{ fontFamily: "InstrumentSerif", fontSize: 40, lineHeight: 44, letterSpacing: -1, color: colors.white, marginTop: 6 }}>
              Confiance.{"\n"}Sérénité.
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.82)", marginTop: 10 }}>
              Étudiants & professeurs vérifiés — partenaires de votre famille.
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: spacing.md, flexWrap: "wrap" }}>
            <Badge icon="🛡️" label="Verified+" />
            <Badge icon="🌍" label="Multilingues" />
            <Badge icon="🚨" label="Assistance 24/7" />
          </View>
        </View>
      </SafeAreaView>

      {showToast ? (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={18} color={colors.white} />
          <Txt size="sm" weight="700" color={colors.white} style={{ marginLeft: 8, flex: 1 }}>
            Profil enregistré ! Vous êtes visible dans Jokoo Family.
          </Txt>
          <Pressable onPress={() => setShowToast(false)} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.white} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {/* CTA become babysitter */}
        <Pressable onPress={() => router.push("/family/profile-setup")} style={styles.ctaBecome} testID="family-become">
          <View style={{ flex: 1 }}>
            <Txt weight="700" color={colors.midnight}>Vous êtes étudiant(e) ou professeur ?</Txt>
            <Txt size="xs" color={colors.textMuted}>Créez votre profil et rejoignez la communauté Jokoo Family.</Txt>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.midnight} />
        </Pressable>

        {/* Services */}
        <SectionTitle>Type de service</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="Tous" active={service === ""} onPress={() => setService("")} />
          {SERVICES.map((s) => (
            <Chip
              key={s.code}
              label={`${s.emoji}  ${s.label}`}
              active={service === s.code}
              onPress={() => setService(s.code)}
              testID={`family-svc-${s.code}`}
            />
          ))}
        </ScrollView>

        {/* Profile type */}
        <SectionTitle>Profil</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="Tous" active={profileType === ""} onPress={() => setProfileType("")} />
          <Chip label="🎓 Étudiants" active={profileType === "student"} onPress={() => setProfileType("student")} testID="family-pt-student" />
          <Chip label="👨‍🏫 Professeurs" active={profileType === "teacher"} onPress={() => setProfileType("teacher")} testID="family-pt-teacher" />
          <Chip label="💼 Pros" active={profileType === "professional"} onPress={() => setProfileType("professional")} testID="family-pt-pro" />
        </ScrollView>

        {/* Languages */}
        <SectionTitle>Langue souhaitée</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <FlagChip active={lang === ""} onPress={() => setLang("")} label="Toutes" flag="🌐" />
          {topLanguages.map((l) => (
            <FlagChip
              key={l.code}
              active={lang === l.code}
              onPress={() => setLang(l.code)}
              label={l.label}
              flag={l.flag}
              testID={`family-lang-${l.code}`}
            />
          ))}
        </ScrollView>

        {/* Age groups */}
        <SectionTitle>Tranche d&apos;âge</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="Tous" active={ageGroup === ""} onPress={() => setAgeGroup("")} />
          {AGE_GROUPS.map((a) => (
            <Chip key={a.code} label={`${a.icon}  ${a.label}`} active={ageGroup === a.code} onPress={() => setAgeGroup(a.code)} testID={`family-age-${a.code}`} />
          ))}
        </ScrollView>

        {/* Skills */}
        <SectionTitle>Compétence</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="Toutes" active={skill === ""} onPress={() => setSkill("")} />
          {SKILLS.map((s) => (
            <Chip key={s.code} label={s.label} icon={s.icon as any} active={skill === s.code} onPress={() => setSkill(s.code)} testID={`family-skill-${s.code}`} />
          ))}
        </ScrollView>

        {/* Availability & premium toggles */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.md, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <ToggleChip active={availableToday} onPress={() => setAvailableToday((v) => !v)} icon="📅" label="Aujourd'hui" />
          <ToggleChip active={nightCare} onPress={() => setNightCare((v) => !v)} icon="🌙" label="Garde de nuit" />
          <ToggleChip active={canTravel} onPress={() => setCanTravel((v) => !v)} icon="🚗" label="Se déplace" />
          <ToggleChip active={recommended} onPress={() => setRecommended((v) => !v)} icon="⭐" label="Recommandé Jokoo" />
          <ToggleChip active={verifiedPlus} onPress={() => setVerifiedPlus((v) => !v)} icon="🛡️" label="Verified+" />
        </View>

        {/* Results */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.md }}>
          <Txt size="md" weight="700">{items.length} profil(s) disponible(s)</Txt>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={colors.textSubtle} />
              <Txt size="md" weight="700" style={{ marginTop: 8 }}>Aucun profil trouvé</Txt>
              <Txt size="xs" color={colors.textMuted} style={{ textAlign: "center", marginTop: 4 }}>
                Réduisez vos filtres ou revenez plus tard — de nouveaux profils arrivent chaque semaine.
              </Txt>
              <View style={{ marginTop: 12 }}>
                <Btn title="Rejoindre en tant qu'étudiant" icon="school" variant="secondary" onPress={() => router.push("/family/profile-setup")} />
              </View>
            </View>
          ) : (
            items.map((b) => <SitterCard key={b.id} sitter={b} onPress={() => router.push(`/family/babysitter/${b.id}`)} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Badge({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.badge}>
      <Txt size="xxs" color={colors.white}>{icon}  </Txt>
      <Txt size="xxs" color={colors.white} weight="600">{label}</Txt>
    </View>
  );
}

function SectionTitle({ children }: any) {
  return (
    <Txt size="sm" weight="700" style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg, marginBottom: 8 }}>
      {children}
    </Txt>
  );
}

function FlagChip({ active, onPress, label, flag, testID }: any) {
  return (
    <Pressable onPress={onPress} style={[styles.flagChip, active && styles.flagChipActive]} testID={testID}>
      <Txt size="md">{flag}</Txt>
      <Txt size="xs" weight="600" color={active ? colors.white : colors.text} style={{ marginLeft: 6 }}>{label}</Txt>
    </Pressable>
  );
}

function ToggleChip({ active, onPress, icon, label }: any) {
  return (
    <Pressable onPress={onPress} style={[styles.toggle, active && styles.toggleActive]}>
      <Txt style={{ fontSize: 12 }}>{icon}</Txt>
      <Txt size="xs" weight="600" color={active ? colors.white : colors.midnight} style={{ marginLeft: 6 }}>{label}</Txt>
    </Pressable>
  );
}

function SitterCard({ sitter, onPress }: { sitter: Babysitter; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`sitter-${sitter.id}`}>
      <View style={{ flexDirection: "row" }}>
        <Avatar uri={sitter.avatar || undefined} name={sitter.name} size={62} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Txt size="md" weight="700" numberOfLines={1} style={{ flex: 1 }}>{sitter.name}</Txt>
          </View>
          <Txt size="xs" color={colors.textMuted}>{sitter.university} · {sitter.city}</Txt>
          <View style={{ marginTop: 6 }}>
            <TrustBadges b={sitter} compact />
          </View>
          <View style={{ marginTop: 6 }}>
            <AvailabilityChips b={sitter} />
          </View>
        </View>
      </View>
      <View style={styles.rowDivider} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Ionicons name="star" size={12} color="#F59E0B" />
          <Txt size="xs" weight="700" style={{ marginLeft: 4 }}>{(sitter.rating || 0).toFixed(1)}</Txt>
          <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 4 }}>({sitter.reviews_count || 0} avis)</Txt>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt size="lg" weight="700" color={colors.turquoise}>{formatXof(sitter.hourly_rate_xof)}</Txt>
          <Txt size="xxs" color={colors.textSubtle}>par heure</Txt>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerWrap: { backgroundColor: "#7C3AED" },
  headerHero: {
    marginHorizontal: 0,
    padding: spacing.xl,
    paddingBottom: 28,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: "hidden",
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  ctaBecome: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  chipRow: { paddingHorizontal: spacing.xl, gap: 8 },
  flagChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flagChipActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleActive: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  card: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, ...shadow.card },
  langMini: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  tutorTag: { flexDirection: "row", alignItems: "center", backgroundColor: "#DBEAFE", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, marginLeft: 8 },
  rowDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  empty: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
  toast: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: spacing.xl, marginTop: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    backgroundColor: colors.success, borderRadius: radius.md, ...shadow.soft,
  },
});
