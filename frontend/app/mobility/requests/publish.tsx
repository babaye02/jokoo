// Publier une demande — Passager
// Formulaire pour créer une ride_request avec autocomplete villes + quartiers

import React, { useEffect, useState, useMemo } from "react";
import { View, ScrollView, StyleSheet, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { rideRequestsApi, City } from "@/src/mobility/rideRequests";

export default function PublishRequestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string; to?: string }>();

  const [cities, setCities] = useState<City[]>([]);
  const [fromCity, setFromCity] = useState((params.from as string) || "");
  const [toCity, setToCity] = useState((params.to as string) || "");
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [date, setDate] = useState(defaultDate());
  const [timeFrom, setTimeFrom] = useState("08:00");
  const [timeTo, setTimeTo] = useState("");
  const [seats, setSeats] = useState(1);
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [focusField, setFocusField] = useState<"from" | "to" | null>(null);

  useEffect(() => {
    rideRequestsApi.cities().then((r) => setCities(r.cities || [])).catch(() => {});
  }, []);

  const suggestions = useMemo(() => {
    const q = (focusField === "from" ? fromCity : toCity).trim().toLowerCase();
    if (!q || q.length < 1) return [] as { label: string; hint?: string; canonical: string }[];
    const out: { label: string; hint?: string; canonical: string }[] = [];
    for (const c of cities) {
      // Match sur ville canonique
      if (c.label.toLowerCase().includes(q)) {
        out.push({ label: c.label, canonical: c.canonical });
      }
      // Match sur aliases (quartiers)
      for (const a of c.aliases) {
        if (a.toLowerCase().includes(q)) {
          out.push({ label: capitalize(a), hint: c.label, canonical: c.canonical });
          if (out.length > 8) break;
        }
      }
      if (out.length > 8) break;
    }
    return out.slice(0, 8);
  }, [cities, fromCity, toCity, focusField]);

  const submit = async () => {
    if (fromCity.trim().length < 2 || toCity.trim().length < 2) {
      Alert.alert("Villes requises", "Merci d'indiquer la ville de départ et d'arrivée.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert("Date invalide", "Format attendu : YYYY-MM-DD (ex : 2026-08-15).");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(timeFrom)) {
      Alert.alert("Heure invalide", "Format attendu : HH:MM (ex : 08:00).");
      return;
    }
    setBusy(true);
    try {
      const body: any = {
        from_city: fromCity.trim(),
        to_city: toCity.trim(),
        from_address: fromAddress.trim() || undefined,
        to_address: toAddress.trim() || undefined,
        date,
        time_from: timeFrom,
        time_to: timeTo.trim() || undefined,
        seats,
        budget_xof: budget ? parseInt(budget.replace(/\s/g, ""), 10) : null,
        notes: notes.trim() || undefined,
      };
      const res = await rideRequestsApi.create(body);
      router.replace({ pathname: "/mobility/requests/[id]", params: { id: res.id } });
    } catch (e: any) {
      Alert.alert("Publication impossible", e?.message || "Merci de réessayer.");
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, marginLeft: 8 }}>Nouvelle demande</Txt>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={styles.helpBanner}>
          <Ionicons name="information-circle" size={18} color={colors.info} />
          <Txt size="xs" color={colors.textSecondary} style={{ flex: 1, marginLeft: 8, lineHeight: 18 }}>
            Décrivez votre trajet souhaité. Les conducteurs sur cet axe recevront une notification et pourront vous proposer une place.
          </Txt>
        </View>

        {/* Départ / Arrivée */}
        <FieldLabel>Trajet</FieldLabel>
        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={styles.routeDot}><View style={styles.routeDotInner} /></View>
            <View style={{ flex: 1 }}>
              <Txt size="xxs" color={colors.textMuted} weight="700" style={{ letterSpacing: 1 }}>DÉPART</Txt>
              <TextInput
                value={fromCity}
                onChangeText={setFromCity}
                onFocus={() => setFocusField("from")}
                onBlur={() => setTimeout(() => setFocusField(null), 200)}
                placeholder="Ville ou quartier (ex : Plateau, Mermoz…)"
                placeholderTextColor={colors.textSubtle}
                style={styles.routeInput}
                autoCapitalize="words"
                testID="req-from"
              />
              <TextInput
                value={fromAddress}
                onChangeText={setFromAddress}
                placeholder="Point de rencontre (optionnel)"
                placeholderTextColor={colors.textSubtle}
                style={styles.subInput}
              />
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: "#F97316" }]}><Ionicons name="location" size={12} color={colors.white} /></View>
            <View style={{ flex: 1 }}>
              <Txt size="xxs" color={colors.textMuted} weight="700" style={{ letterSpacing: 1 }}>ARRIVÉE</Txt>
              <TextInput
                value={toCity}
                onChangeText={setToCity}
                onFocus={() => setFocusField("to")}
                onBlur={() => setTimeout(() => setFocusField(null), 200)}
                placeholder="Ville ou quartier de destination"
                placeholderTextColor={colors.textSubtle}
                style={styles.routeInput}
                autoCapitalize="words"
                testID="req-to"
              />
              <TextInput
                value={toAddress}
                onChangeText={setToAddress}
                placeholder="Adresse précise (optionnel)"
                placeholderTextColor={colors.textSubtle}
                style={styles.subInput}
              />
            </View>
          </View>
        </View>

        {/* Autocomplete */}
        {focusField && suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            {suggestions.map((s, i) => (
              <Pressable
                key={`${s.label}-${i}`}
                onPress={() => {
                  const setter = focusField === "from" ? setFromCity : setToCity;
                  setter(s.hint ? `${s.label}` : s.label);
                  setFocusField(null);
                }}
                style={styles.suggestionRow}
              >
                <Ionicons name={s.hint ? "location-outline" : "map-outline"} size={14} color={colors.textMuted} />
                <Txt size="sm" style={{ flex: 1, marginLeft: 8 }}>{s.label}</Txt>
                {s.hint ? <Txt size="xxs" color={colors.textMuted}>{s.hint}</Txt> : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Date & horaires */}
        <FieldLabel>Date & horaire</FieldLabel>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Txt size="xxs" color={colors.textMuted} weight="700" style={{ letterSpacing: 1, marginBottom: 4 }}>DATE</Txt>
            <TextInput value={date} onChangeText={setDate} placeholder="2026-08-15" placeholderTextColor={colors.textSubtle} style={styles.input} autoCapitalize="none" testID="req-date" />
          </View>
        </View>
        <View style={[styles.row, { gap: 10, marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Txt size="xxs" color={colors.textMuted} weight="700" style={{ letterSpacing: 1, marginBottom: 4 }}>DE</Txt>
            <TextInput value={timeFrom} onChangeText={setTimeFrom} placeholder="08:00" placeholderTextColor={colors.textSubtle} style={styles.input} autoCapitalize="none" testID="req-time-from" />
          </View>
          <View style={{ flex: 1 }}>
            <Txt size="xxs" color={colors.textMuted} weight="700" style={{ letterSpacing: 1, marginBottom: 4 }}>À (opt.)</Txt>
            <TextInput value={timeTo} onChangeText={setTimeTo} placeholder="10:00" placeholderTextColor={colors.textSubtle} style={styles.input} autoCapitalize="none" testID="req-time-to" />
          </View>
        </View>

        {/* Sièges */}
        <FieldLabel>Nombre de passagers</FieldLabel>
        <View style={styles.stepper}>
          <Pressable onPress={() => setSeats((v) => Math.max(1, v - 1))} style={styles.stepBtn} disabled={seats <= 1}>
            <Ionicons name="remove" size={18} color={seats <= 1 ? colors.textSubtle : colors.midnight} />
          </Pressable>
          <Txt size="xxl" weight="800" style={{ flex: 1, textAlign: "center", fontVariant: ["tabular-nums"] as any }}>{seats}</Txt>
          <Pressable onPress={() => setSeats((v) => Math.min(8, v + 1))} style={styles.stepBtn} disabled={seats >= 8}>
            <Ionicons name="add" size={18} color={seats >= 8 ? colors.textSubtle : colors.midnight} />
          </Pressable>
        </View>

        {/* Budget */}
        <FieldLabel>Budget maximum par personne (optionnel)</FieldLabel>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={budget}
            onChangeText={(v) => setBudget(v.replace(/[^\d]/g, ""))}
            placeholder="Ex : 3000"
            placeholderTextColor={colors.textSubtle}
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
            testID="req-budget"
          />
          <Txt size="sm" color={colors.textMuted}>F CFA</Txt>
        </View>

        {/* Notes */}
        <FieldLabel>Commentaire (optionnel)</FieldLabel>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Détails, préférences, contraintes…"
          placeholderTextColor={colors.textSubtle}
          multiline
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" as any }]}
          testID="req-notes"
        />

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Sticky submit */}
      <View style={[styles.stickyBar, { paddingBottom: 12 + insets.bottom }]}>
        <Btn title={busy ? "Publication…" : "Publier ma demande"} onPress={submit} loading={busy} variant="primary" fullWidth testID="req-submit" />
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Helpers ───────────────────────────────────────────────

function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function capitalize(s: string): string {
  return s.split(/\s+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function FieldLabel({ children }: { children: any }) {
  return <Txt size="xs" weight="700" color={colors.textMuted} style={{ letterSpacing: 1.2, marginTop: spacing.lg, marginBottom: 8 }}>{String(children).toUpperCase()}</Txt>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  helpBanner: { flexDirection: "row", padding: spacing.md, borderRadius: radius.lg, backgroundColor: "#EBF1FD", alignItems: "flex-start" },
  routeCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  routeDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center", marginTop: 20 },
  routeDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  divider: { height: 1, backgroundColor: colors.hairline, marginLeft: 34, marginVertical: 6 },
  routeInput: { fontSize: 15, color: colors.midnight, paddingVertical: 4 },
  subInput: { fontSize: 12, color: colors.textMuted, paddingVertical: 2 },
  suggestions: { marginTop: 6, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow.soft, borderWidth: 1, borderColor: colors.border },
  suggestionRow: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  row: { flexDirection: "row" },
  input: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: colors.midnight, backgroundColor: colors.surface },
  stepper: { flexDirection: "row", alignItems: "center", padding: 8, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow.soft },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
