import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Language } from "@/src/api";
import { AGE_GROUPS, LANG_LEVEL_LABEL, LANGUAGES, LEVEL_LABEL, PROFILE_TYPE_LABEL, SERVICES, SKILLS, langMeta } from "@/src/family";
import { Btn, Card, Chip, ErrorBox, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const LEVELS = ["licence", "master", "doctorat", "prepa", "other"] as const;
const LANG_LEVELS = ["native", "fluent", "intermediate", "basic"] as const;
const PROFILE_TYPES = ["student", "teacher", "professional"] as const;

const SUGGEST_SUBJECTS = ["Mathématiques", "Français", "Anglais", "Physique", "Chimie", "SVT", "Histoire-Géo", "Philosophie", "Arabe", "Espagnol"];

export default function ProfileSetup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [bio, setBio] = useState("");
  const [profileType, setProfileType] = useState<typeof PROFILE_TYPES[number]>("student");
  const [university, setUniversity] = useState("");
  const [level, setLevel] = useState<typeof LEVELS[number]>("licence");
  const [field, setField] = useState("");
  const [city, setCity] = useState("Dakar");
  const [languages, setLanguages] = useState<Language[]>([{ code: "fr", level: "native" }]);
  const [ages, setAges] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>(["babysitting"]);
  const [tutoSubs, setTutoSubs] = useState<string[]>([]);
  const [availableToday, setAvailableToday] = useState(false);
  const [nightCare, setNightCare] = useState(false);
  const [canTravel, setCanTravel] = useState(false);
  const [rate, setRate] = useState("2500");
  const [psc1, setPsc1] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ exists: boolean; profile?: any }>("/family/profile/me");
        if (r.exists && r.profile) {
          const p = r.profile;
          setBio(p.bio || "");
          setProfileType(p.profile_type || "student");
          setUniversity(p.university || "");
          setLevel(p.level || "licence");
          setField(p.field_of_study || "");
          setCity(p.city || "Dakar");
          setLanguages(p.languages || [{ code: "fr", level: "native" }]);
          setAges(p.age_specialties || []);
          setSkills(p.skills || []);
          setServices(p.services && p.services.length > 0 ? p.services : (p.offers_babysitting ? ["babysitting"] : []));
          setTutoSubs(p.tutoring_subjects || []);
          setAvailableToday(!!p.available_today);
          setNightCare(!!p.night_care);
          setCanTravel(!!p.can_travel);
          setRate(String(p.hourly_rate_xof || 2500));
          setPsc1(!!p.psc1_certified);
        }
      } catch { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  const toggle = (arr: string[], v: string, setter: (a: string[]) => void) => {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const setLangLevel = (code: string, lv: string) => {
    setLanguages((arr) => arr.map((l) => (l.code === code ? { ...l, level: lv as any } : l)));
  };

  const toggleLang = (code: string) => {
    setLanguages((arr) => {
      if (arr.some((l) => l.code === code)) return arr.filter((l) => l.code !== code);
      return [...arr, { code, level: "fluent" }];
    });
  };

  const submit = async () => {
    setErr(null);
    if (bio.trim().length < 10) return setErr("Décrivez-vous en quelques lignes (10 caractères minimum)");
    if (!university.trim()) return setErr("Indiquez votre université / école");
    if (!city.trim()) return setErr("Ville requise");
    if (languages.length === 0) return setErr("Sélectionnez au moins une langue");
    if (ages.length === 0) return setErr("Sélectionnez au moins une tranche d'âge");
    if (services.length === 0) return setErr("Sélectionnez au moins un service");
    const rn = parseInt(rate || "0", 10);
    if (isNaN(rn) || rn < 500) return setErr("Tarif horaire invalide (min. 500 F CFA)");

    setBusy(true);
    try {
      await api.post("/family/profile", {
        bio: bio.trim(),
        profile_type: profileType,
        university: university.trim(),
        level,
        field_of_study: field.trim(),
        city: city.trim(),
        languages,
        age_specialties: ages,
        skills,
        services,
        tutoring_subjects: services.includes("tutoring") ? tutoSubs : [],
        available_today: availableToday,
        night_care: nightCare,
        can_travel: canTravel,
        hourly_rate_xof: rn,
        psc1_certified: psc1,
      });
      // Redirection immédiate — pas d'Alert.alert (bloqué sur navigateur web)
      router.replace({ pathname: "/family", params: { just_profile: "1" } });
    } catch (e: any) {
      setErr(e.message || "Erreur");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}><Txt color={colors.textMuted}>Chargement…</Txt></View>;

  const recMin = psc1 ? 2500 : 2000;
  const recMax = psc1 ? 5000 : 4000;
  const rateNum = parseInt(rate || "0", 10);
  const rateOk = rateNum >= recMin && rateNum <= recMax;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="ps-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Mon profil étudiant</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Txt weight="700" style={{ marginBottom: 6 }}>👋 Bienvenue étudiant(e)</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ lineHeight: 20 }}>
              Créez votre profil pour recevoir des missions de babysitting et de tutorat. Plus votre profil est riche, plus les parents vous font confiance.
            </Txt>
          </Card>

          <ErrorBox text={err} />

          <Section icon="person" title="À propos de vous" />
          <Input
            label="Présentation"
            placeholder="Racontez qui vous êtes, votre pédagogie, vos passions…"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
            style={{ height: 110, textAlignVertical: "top", paddingTop: 12 }}
            testID="ps-bio"
          />

          <Section icon="school-outline" title="Études" />
          <Input label="Université / École" icon="library" value={university} onChangeText={setUniversity} testID="ps-uni" />
          <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Niveau</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.md }}>
            {LEVELS.map((l) => (
              <Chip key={l} label={LEVEL_LABEL[l]} active={level === l} onPress={() => setLevel(l)} testID={`ps-lvl-${l}`} />
            ))}
          </View>
          <Input label="Domaine (optionnel)" icon="book" placeholder="Ex. Anglais, Mathématiques…" value={field} onChangeText={setField} testID="ps-field" />
          <Input label="Ville" icon="location" value={city} onChangeText={setCity} testID="ps-city" />

          <Section icon="language" title={`Langues parlées (${languages.length})`} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 8 }}>
            {LANGUAGES.map((l) => {
              const active = languages.some((x) => x.code === l.code);
              return (
                <Pressable
                  key={l.code}
                  onPress={() => toggleLang(l.code)}
                  style={[styles.langPick, active && styles.langPickActive]}
                  testID={`ps-lang-${l.code}`}
                >
                  <Txt size="md">{l.flag}</Txt>
                  <Txt size="xs" weight="600" color={active ? colors.white : colors.text} style={{ marginLeft: 6 }}>{l.label}</Txt>
                </Pressable>
              );
            })}
          </ScrollView>
          {languages.map((l) => (
            <View key={l.code} style={styles.langLevelRow}>
              <Txt style={{ marginRight: 6 }}>{langMeta(l.code).flag}</Txt>
              <Txt weight="700" style={{ flex: 1 }}>{langMeta(l.code).label}</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                {LANG_LEVELS.map((lv) => (
                  <Pressable
                    key={lv}
                    onPress={() => setLangLevel(l.code, lv)}
                    style={[styles.levelBtn, l.level === lv && styles.levelBtnActive]}
                  >
                    <Txt size="xxs" weight="600" color={l.level === lv ? colors.white : colors.midnight}>
                      {LANG_LEVEL_LABEL[lv]}
                    </Txt>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ))}

          <Section icon="happy" title="Tranches d'âge maîtrisées" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {AGE_GROUPS.map((a) => (
              <Chip key={a.code} label={`${a.icon}  ${a.label}`} active={ages.includes(a.code)} onPress={() => toggle(ages, a.code, setAges)} testID={`ps-age-${a.code}`} />
            ))}
          </View>

          <Section icon="star" title="Compétences" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SKILLS.map((s) => (
              <Chip key={s.code} label={s.label} icon={s.icon as any} active={skills.includes(s.code)} onPress={() => toggle(skills, s.code, setSkills)} testID={`ps-skill-${s.code}`} />
            ))}
          </View>

          <Section icon="person" title="Type de profil" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {PROFILE_TYPES.map((pt) => (
              <Chip
                key={pt}
                label={`${PROFILE_TYPE_LABEL[pt].emoji}  ${PROFILE_TYPE_LABEL[pt].label}`}
                active={profileType === pt}
                onPress={() => setProfileType(pt)}
                testID={`ps-pt-${pt}`}
              />
            ))}
          </View>

          <Section icon="options" title="Services proposés" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SERVICES.map((s) => (
              <Chip
                key={s.code}
                label={`${s.emoji}  ${s.label}`}
                active={services.includes(s.code)}
                onPress={() => toggle(services, s.code, setServices)}
                testID={`ps-svc-${s.code}`}
              />
            ))}
          </View>
          {services.includes("tutoring") ? (
            <>
              <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginTop: spacing.md, marginBottom: 6 }}>Matières enseignées</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {SUGGEST_SUBJECTS.map((s) => (
                  <Chip key={s} label={s} active={tutoSubs.includes(s)} onPress={() => toggle(tutoSubs, s, setTutoSubs)} testID={`ps-sub-${s}`} />
                ))}
              </View>
            </>
          ) : null}

          <Section icon="calendar" title="Disponibilité" />
          <View style={{ gap: 8 }}>
            <ToggleRow icon="📅" label="Disponible aujourd'hui" active={availableToday} onPress={() => setAvailableToday((v) => !v)} testID="ps-avail" />
            <ToggleRow icon="🌙" label="Accepte les gardes de nuit" active={nightCare} onPress={() => setNightCare((v) => !v)} testID="ps-night" />
            <ToggleRow icon="🚗" label="Peut se déplacer au domicile" active={canTravel} onPress={() => setCanTravel((v) => !v)} testID="ps-travel" />
          </View>

          <Section icon="medal" title="Certifications" />
          <Pressable onPress={() => setPsc1((v) => !v)} style={[styles.psc1, psc1 && styles.psc1Active]} testID="ps-psc1">
            <Txt size="xxxl">🥇</Txt>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Txt weight="700">PSC1 - Premiers secours</Txt>
              <Txt size="xs" color={colors.textMuted}>Cochez si vous êtes certifié(e). Badge doré + tarif recommandé supérieur.</Txt>
            </View>
            <View style={[styles.check, psc1 && styles.checkOn]}>
              {psc1 ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
            </View>
          </Pressable>

          <Section icon="cash" title="Tarif horaire" />
          <Input
            label="Définis ton tarif horaire (F CFA)"
            icon="cash-outline"
            keyboardType="numeric"
            value={rate}
            onChangeText={(v) => setRate(v.replace(/[^0-9]/g, ""))}
            testID="ps-rate"
          />
          <View style={[styles.rateHint, rateOk && styles.rateHintOk]}>
            <Ionicons name={rateOk ? "checkmark-circle" : "information-circle"} size={16} color={rateOk ? "#166534" : colors.midnight} />
            <Txt size="xs" color={rateOk ? "#166534" : colors.midnight} weight="600" style={{ marginLeft: 6, flex: 1 }}>
              Tarif recommandé par Jokoo : {recMin.toLocaleString()} à {recMax.toLocaleString()} F CFA/heure
              {psc1 ? " (bonus PSC1)" : ""}
            </Txt>
          </View>
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn title="Enregistrer mon profil" icon="save" onPress={submit} loading={busy} fullWidth size="lg" testID="ps-submit" />
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

function ToggleRow({ icon, label, active, onPress, testID }: any) {
  return (
    <Pressable onPress={onPress} style={[styles.toggleRow, active && styles.toggleRowActive]} testID={testID}>
      <Txt style={{ fontSize: 16 }}>{icon}</Txt>
      <Txt weight="700" style={{ flex: 1, marginLeft: 10 }}>{label}</Txt>
      <View style={[styles.switch, active && styles.switchOn]}>
        <View style={[styles.switchKnob, active && styles.switchKnobOn]} />
      </View>
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
  langPick: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langPickActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  langLevelRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: 6,
  },
  levelBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  levelBtnActive: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  psc1: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  psc1Active: { borderColor: "#F59E0B", backgroundColor: "#FEF3C7" },
  check: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  checkOn: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  rateHint: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: "#FEF3C7",
    marginTop: 8,
  },
  rateHintOk: { backgroundColor: "#DCFCE7" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toggleRowActive: { borderColor: colors.turquoise, backgroundColor: colors.brandTertiary },
  switch: { width: 46, height: 26, borderRadius: 13, backgroundColor: colors.borderStrong, padding: 3, justifyContent: "center" },
  switchOn: { backgroundColor: colors.turquoise },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
  switchKnobOn: { alignSelf: "flex-end" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
