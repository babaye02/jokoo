import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Babysitter, BabyKid } from "@/src/api";
import { langMeta } from "@/src/family";
import { formatXof } from "@/src/pricing";
import { Btn, Card, Chip, ErrorBox, Input, Txt } from "@/src/components/ui";
import BookingWizardStepper from "@/src/components/BookingWizardStepper";
import { colors, radius, shadow, spacing } from "@/src/theme";

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

const HOURS = ["08:00", "09:00", "10:00", "12:00", "14:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];

export default function BookFamily() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const days = useMemo(() => todayDays(), []);
  const [b, setB] = useState<Babysitter | null>(null);

  const [service, setService] = useState<"babysitting" | "tutoring" | "both">("babysitting");
  const [dateIdx, setDateIdx] = useState(1);
  const [tStart, setTStart] = useState("18:00");
  const [tEnd, setTEnd] = useState("22:00");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [kids, setKids] = useState<BabyKid[]>([{ name: "", age: 5, special_needs: "" }]);
  const [langFocus, setLangFocus] = useState<string>("");
  const [tutorSubs, setTutorSubs] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [ecName, setEcName] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<Babysitter>(`/family/babysitters/${id}`).then((s) => {
      setB(s);
      setCity(s.city);
      if (!s.offers_babysitting && s.offers_tutoring) setService("tutoring");
    }).catch(() => setB(null));
  }, [id]);

  const durationHours = useMemo(() => {
    const toMin = (t: string) => { const [h, m] = t.split(":").map((x) => parseInt(x, 10)); return h * 60 + m; };
    let d = toMin(tEnd) - toMin(tStart);
    if (d <= 0) d += 24 * 60;
    return d / 60;
  }, [tStart, tEnd]);

  const total = Math.round((b?.hourly_rate_xof || 0) * durationHours);

  // ── Booking Wizard : 4-step progress detection ────────────────────────────
  // Step 1 (Service)   : always started (service defaults to "babysitting")
  // Step 2 (Planning)  : active as soon as user picks a date/time (default day 1)
  // Step 3 (Détails)   : active when address AND kid name(s) are filled
  // Step 4 (Confirmer) : active when emergency contact is filled
  const currentStep = useMemo(() => {
    const hasSchedule = dateIdx >= 0 && !!tStart && !!tEnd;
    const hasAddr = address.trim().length >= 3 && city.trim().length >= 2;
    const hasKids = kids.length > 0 && kids.every((k) => k.name.trim().length >= 2);
    const hasEc = ecName.trim().length >= 2 && ecPhone.trim().length >= 6;
    if (hasSchedule && hasAddr && hasKids && hasEc) return 4;
    if (hasSchedule && hasAddr && hasKids) return 3;
    if (hasSchedule) return 2;
    return 1;
  }, [dateIdx, tStart, tEnd, address, city, kids, ecName, ecPhone]);

  const WIZARD_STEPS = [
    { label: "Service" },
    { label: "Planning" },
    { label: "Détails" },
    { label: "Confirmer" },
  ];

  if (!b) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}>
        <Txt color={colors.textMuted}>Chargement…</Txt>
      </View>
    );
  }

  const toggleSub = (s: string) => setTutorSubs((arr) => (arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s]));

  const addKid = () => setKids((k) => [...k, { name: "", age: 5, special_needs: "" }]);
  const removeKid = (i: number) => setKids((k) => k.filter((_, j) => j !== i));

  const submit = async () => {
    setErr(null);
    if (!address.trim()) return setErr("Adresse requise");
    if (!city.trim()) return setErr("Ville requise");
    if (kids.some((k) => !k.name.trim())) return setErr("Chaque enfant doit avoir un prénom");
    if (!ecName.trim() || !ecPhone.trim()) return setErr("Contact d'urgence requis");
    if (durationHours < 0.5) return setErr("Durée trop courte");

    setBusy(true);
    try {
      const body = {
        babysitter_id: b.id,
        service_type: service,
        address: address.trim(),
        city: city.trim(),
        date: days[dateIdx].iso,
        time_start: tStart,
        time_end: tEnd,
        kids: kids.map((k) => ({ name: k.name.trim(), age: Number(k.age) || 0, special_needs: (k.special_needs || "").trim() })),
        language_focus: langFocus || null,
        tutoring_subjects: service === "tutoring" || service === "both" ? tutorSubs : [],
        notes: notes.trim(),
        emergency_contact: { name: ecName.trim(), phone: ecPhone.trim() },
      };
      await api.post("/family/bookings", body);
      // Redirection immédiate — pas d'Alert.alert (bloqué sur certains navigateurs web)
      router.replace({ pathname: "/family/mine", params: { just_booked: "1" } });
    } catch (e: any) {
      setErr(e.message || "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="book-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Réserver</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Wizard progress indicator — 4 steps */}
      <View style={styles.stepperWrap}>
        <BookingWizardStepper steps={WIZARD_STEPS} currentStep={currentStep} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 200 + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Txt weight="700">{b.name}</Txt>
            <Txt size="xs" color={colors.textMuted}>{b.university} · {b.city}</Txt>
            <Txt size="xs" color={colors.turquoise} weight="700" style={{ marginTop: 4 }}>{formatXof(b.hourly_rate_xof)} / heure</Txt>
          </Card>

          <ErrorBox text={err} />

          {/* Service */}
          <Section icon="options" title="Type de service" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {b.offers_babysitting ? (
              <Chip label="Baby-sitting" icon="happy" active={service === "babysitting"} onPress={() => setService("babysitting")} testID="svc-baby" />
            ) : null}
            {b.offers_tutoring ? (
              <Chip label="Tutorat" icon="school" active={service === "tutoring"} onPress={() => setService("tutoring")} testID="svc-tuto" />
            ) : null}
            {b.offers_babysitting && b.offers_tutoring ? (
              <Chip label="Les deux" icon="sparkles" active={service === "both"} onPress={() => setService("both")} testID="svc-both" />
            ) : null}
          </View>

          {/* Tutoring subjects */}
          {(service === "tutoring" || service === "both") && b.tutoring_subjects?.length ? (
            <>
              <Section icon="school" title="Matière(s)" />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {b.tutoring_subjects.map((s) => (
                  <Chip key={s} label={s} active={tutorSubs.includes(s)} onPress={() => toggleSub(s)} testID={`sub-${s}`} />
                ))}
              </View>
            </>
          ) : null}

          {/* Date */}
          <Section icon="calendar" title="Date" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d, i) => (
              <Pressable
                key={d.iso}
                onPress={() => setDateIdx(i)}
                style={[styles.dayBtn, i === dateIdx && styles.dayBtnActive]}
                testID={`book-day-${i}`}
              >
                <Txt size="xxs" color={i === dateIdx ? colors.white : colors.textMuted} weight="600">{d.day}</Txt>
                <Txt size="lg" weight="700" color={i === dateIdx ? colors.white : colors.text}>{d.label}</Txt>
              </Pressable>
            ))}
          </ScrollView>

          {/* Time */}
          <Section icon="time" title="Horaires" />
          <Txt size="xs" color={colors.textMuted}>Début</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 4 }}>
            {HOURS.map((h) => (
              <Pressable key={h} onPress={() => setTStart(h)} style={[styles.timeBtn, h === tStart && styles.timeBtnActive]} testID={`ts-${h}`}>
                <Txt weight="600" color={h === tStart ? colors.white : colors.midnight}>{h}</Txt>
              </Pressable>
            ))}
          </ScrollView>
          <Txt size="xs" color={colors.textMuted} style={{ marginTop: spacing.md }}>Fin</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 4 }}>
            {HOURS.map((h) => (
              <Pressable key={h} onPress={() => setTEnd(h)} style={[styles.timeBtn, h === tEnd && styles.timeBtnActive]} testID={`te-${h}`}>
                <Txt weight="600" color={h === tEnd ? colors.white : colors.midnight}>{h}</Txt>
              </Pressable>
            ))}
          </ScrollView>
          <Txt size="xs" color={colors.turquoise} weight="700" style={{ marginTop: 6 }}>
            Durée : {durationHours.toFixed(1)} h
          </Txt>

          {/* Address */}
          <Section icon="location" title="Adresse d'intervention" />
          <Input label="Ville" icon="location" value={city} onChangeText={setCity} testID="book-city" />
          <Input label="Adresse complète" icon="pin" placeholder="Ex. Sacré-Cœur 3, Villa 45" value={address} onChangeText={setAddress} testID="book-address" />

          {/* Kids */}
          <Section icon="happy" title={`Enfants (${kids.length})`} />
          {kids.map((k, i) => (
            <View key={i} style={styles.kidCard}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <Txt weight="700" style={{ flex: 1 }}>Enfant {i + 1}</Txt>
                {kids.length > 1 ? (
                  <Pressable onPress={() => removeKid(i)}><Ionicons name="close-circle" size={20} color={colors.textMuted} /></Pressable>
                ) : null}
              </View>
              <Input label="Prénom" placeholder="Ex. Aïcha" value={k.name} onChangeText={(v) => setKids((arr) => arr.map((x, j) => (j === i ? { ...x, name: v } : x)))} testID={`kid-name-${i}`} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input label="Âge" icon="calendar" keyboardType="numeric" value={String(k.age)} onChangeText={(v) => setKids((arr) => arr.map((x, j) => (j === i ? { ...x, age: parseInt(v.replace(/[^0-9]/g, "") || "0", 10) } : x)))} testID={`kid-age-${i}`} />
                </View>
                <View style={{ flex: 2 }}>
                  <Input label="Besoins particuliers (optionnel)" placeholder="Allergies, timidité…" value={k.special_needs || ""} onChangeText={(v) => setKids((arr) => arr.map((x, j) => (j === i ? { ...x, special_needs: v } : x)))} testID={`kid-needs-${i}`} />
                </View>
              </View>
            </View>
          ))}
          <Pressable onPress={addKid} style={styles.addKid} testID="add-kid">
            <Ionicons name="add-circle" size={20} color={colors.turquoise} />
            <Txt weight="700" color={colors.turquoise} style={{ marginLeft: 6 }}>Ajouter un enfant</Txt>
          </Pressable>

          {/* Language focus */}
          {service !== "tutoring" ? (
            <>
              <Section icon="language" title="Immersion linguistique (optionnel)" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Chip label="Aucune" active={langFocus === ""} onPress={() => setLangFocus("")} />
                {b.languages.map((l) => (
                  <Chip
                    key={l.code}
                    label={`${langMeta(l.code).flag}  ${langMeta(l.code).label}`}
                    active={langFocus === l.code}
                    onPress={() => setLangFocus(l.code)}
                    testID={`lang-focus-${l.code}`}
                  />
                ))}
              </ScrollView>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6 }}>
                L&apos;étudiant(e) parlera cette langue en priorité pour immerger votre enfant.
              </Txt>
            </>
          ) : null}

          {/* Notes */}
          <Section icon="chatbox-ellipses" title="Notes / consignes" />
          <Input
            placeholder="Routine, allergies, activités souhaitées…"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            style={{ height: 110, textAlignVertical: "top", paddingTop: 12 }}
            testID="book-notes"
          />

          {/* Emergency contact */}
          <Section icon="warning" title="Contact d'urgence 🚨" />
          <Txt size="xs" color={colors.textMuted} style={{ marginBottom: 8 }}>
            Personne à contacter en cas d&apos;alerte SOS pendant la session.
          </Txt>
          <Input label="Nom" icon="person" placeholder="Ex. Papa Diop" value={ecName} onChangeText={setEcName} testID="ec-name" />
          <Input label="Téléphone" icon="call" keyboardType="phone-pad" placeholder="+221771234567" value={ecPhone} onChangeText={setEcPhone} testID="ec-phone" />

          <View style={styles.summary}>
            <View>
              <Txt size="xs" color={colors.textMuted}>Total estimé</Txt>
              <Txt size="xxs" color={colors.textSubtle}>{durationHours.toFixed(1)} h × {formatXof(b.hourly_rate_xof)}</Txt>
            </View>
            <Txt size="xxl" weight="700" color={colors.turquoise}>{formatXof(total)}</Txt>
          </View>
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn title={`Réserver — ${formatXof(total)}`} onPress={submit} loading={busy} fullWidth size="lg" testID="book-submit" />
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
  stepperWrap: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  dayBtn: { width: 58, height: 68, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  dayBtnActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  timeBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  timeBtnActive: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  kidCard: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.soft },
  addKid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.turquoise,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
