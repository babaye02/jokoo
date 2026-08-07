// Trajets « Jokoo Vérifié » (anti-ghost) — Spec Covoiturage #9.
// L'admin publie des trajets officiels sur des axes réels pour peupler la
// marketplace au lancement : création unitaire, publication en masse, annulation.
import { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { hasPerm, isStaff, isSuperAdmin } from "@/src/perms";
import { Card, Txt } from "@/src/components/ui";
import { ConfirmDialog } from "@/src/components/ActionSheet";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

type GhostRide = {
  id: string; from_city: string; to_city: string; date: string; time: string;
  seats_total: number; seats_available: number; price_xof: number;
  status: "active" | "cancelled" | "completed"; bookings_count: number;
};

// Axes populaires pré-configurés pour la publication en masse (aller + retour).
const PRESET_ROUTES: { from: string; to: string; price: number }[] = [
  { from: "Dakar", to: "Thiès", price: 2000 },
  { from: "Thiès", to: "Dakar", price: 2000 },
  { from: "Dakar", to: "Mbour", price: 2500 },
  { from: "Mbour", to: "Dakar", price: 2500 },
  { from: "Dakar", to: "Saint-Louis", price: 5000 },
  { from: "Saint-Louis", to: "Dakar", price: 5000 },
  { from: "Dakar", to: "Touba", price: 4000 },
  { from: "Touba", to: "Dakar", price: 4000 },
  { from: "Dakar", to: "Kaolack", price: 4000 },
  { from: "Kaolack", to: "Dakar", price: 4000 },
  { from: "Dakar", to: "Ziguinchor", price: 10000 },
];

const tomorrowIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export default function GhostRides() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [rides, setRides] = useState<GhostRide[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  // Création unitaire
  const [showForm, setShowForm] = useState(false);
  const [fFrom, setFFrom] = useState("Dakar");
  const [fTo, setFTo] = useState("");
  const [fDate, setFDate] = useState(tomorrowIso());
  const [fTime, setFTime] = useState("07:30");
  const [fPrice, setFPrice] = useState("2000");
  const [fSeats, setFSeats] = useState(4);
  // Publication en masse
  const [showBulk, setShowBulk] = useState(false);
  const [selRoutes, setSelRoutes] = useState<number[]>([0, 1]);
  const [bulkDays, setBulkDays] = useState(7);

  const canManage = isSuperAdmin(user) || hasPerm(user, "mobility:manage");

  const load = useCallback(async () => {
    try {
      setRides(await api.get<GhostRide[]>("/admin/mobility/ghost-rides"));
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Chargement impossible.");
    }
  }, []);
  useFocusEffect(useCallback(() => { if (canManage) load(); }, [canManage, load]));

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const createOne = async () => {
    if (busy) return;
    if (!fFrom.trim() || !fTo.trim() || !fDate.trim() || !fTime.trim()) {
      setErr("Renseignez départ, arrivée, date et heure."); return;
    }
    setBusy(true); setErr(null);
    try {
      await api.post("/admin/mobility/ghost-rides", {
        from_city: fFrom.trim(), to_city: fTo.trim(),
        date: fDate.trim(), time: fTime.trim(),
        seats_total: fSeats, price_xof: parseInt(fPrice, 10) || 0,
      });
      setShowForm(false); setFTo("");
      flash("Trajet Jokoo Vérifié publié ✅");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Publication impossible.");
    } finally { setBusy(false); }
  };

  const publishBulk = async () => {
    if (busy || selRoutes.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const res = await api.post<{ created: number; skipped: number }>("/admin/mobility/ghost-rides/bulk", {
        routes: selRoutes.map((i) => ({
          from_city: PRESET_ROUTES[i].from, to_city: PRESET_ROUTES[i].to, price_xof: PRESET_ROUTES[i].price,
        })),
        days: bulkDays,
        times: ["07:30", "16:00"],
        seats_total: 4,
      });
      setShowBulk(false);
      flash(`${res.created} trajet(s) publié(s)${res.skipped ? ` · ${res.skipped} doublon(s) ignoré(s)` : ""} ✅`);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Publication en masse impossible.");
    } finally { setBusy(false); }
  };

  const doCancel = async () => {
    if (!cancelId) return;
    try {
      await api.del(`/admin/mobility/ghost-rides/${cancelId}`);
      flash("Trajet annulé.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Annulation impossible.");
    } finally { setCancelId(null); }
  };

  const active = useMemo(() => rides.filter((r) => r.status === "active"), [rides]);
  const past = useMemo(() => rides.filter((r) => r.status !== "active"), [rides]);
  const bulkTotal = selRoutes.length * bulkDays * 2;

  if (!isStaff(user) || !canManage) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="lock-closed" size={48} color={colors.textSubtle} />
        <Txt size="md" color={colors.textMuted} style={{ marginTop: spacing.md }}>Accès administrateur requis</Txt>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="ghost-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Trajets Jokoo Vérifié</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {toast ? <View style={styles.toast}><Txt size="sm" weight="700" color={colors.white}>{toast}</Txt></View> : null}
        {err ? <Card><Txt color={colors.danger} testID="ghost-error">{err}</Txt></Card> : null}

        {/* Actions */}
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Pressable onPress={() => { setShowForm((v) => !v); setShowBulk(false); }} style={[styles.actionBtn, { backgroundColor: colors.turquoise }]} testID="ghost-new">
            <Ionicons name="add" size={18} color={colors.white} />
            <Txt size="sm" weight="700" color={colors.white} style={{ marginLeft: 6 }}>Nouveau trajet</Txt>
          </Pressable>
          <Pressable onPress={() => { setShowBulk((v) => !v); setShowForm(false); }} style={[styles.actionBtn, { backgroundColor: colors.midnight }]} testID="ghost-bulk">
            <Ionicons name="layers" size={16} color={colors.white} />
            <Txt size="sm" weight="700" color={colors.white} style={{ marginLeft: 6 }}>En masse</Txt>
          </Pressable>
        </View>

        {/* Formulaire unitaire */}
        {showForm ? (
          <Card>
            <Txt weight="700">Publier un trajet officiel</Txt>
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
              <Field label="Départ" value={fFrom} onChange={setFFrom} placeholder="Dakar" testID="ghost-from" />
              <Field label="Arrivée" value={fTo} onChange={setFTo} placeholder="Thiès" testID="ghost-to" />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
              <Field label="Date" value={fDate} onChange={setFDate} placeholder="YYYY-MM-DD" testID="ghost-date" />
              <Field label="Heure" value={fTime} onChange={setFTime} placeholder="07:30" testID="ghost-time" />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm, alignItems: "flex-end" }}>
              <Field label="Prix / place (F CFA)" value={fPrice} onChange={setFPrice} placeholder="2000" keyboardType="numeric" testID="ghost-price" />
              <View style={{ flex: 1 }}>
                <Txt size="xs" weight="600" color={colors.textMuted}>Places</Txt>
                <View style={styles.stepper}>
                  <Pressable onPress={() => setFSeats((s) => Math.max(1, s - 1))} style={styles.stepBtn}><Txt size="lg" weight="700">−</Txt></Pressable>
                  <Txt size="md" weight="700" testID="ghost-seats">{fSeats}</Txt>
                  <Pressable onPress={() => setFSeats((s) => Math.min(8, s + 1))} style={styles.stepBtn}><Txt size="lg" weight="700">+</Txt></Pressable>
                </View>
              </View>
            </View>
            <Pressable onPress={createOne} disabled={busy} style={[styles.submit, busy && { opacity: 0.5 }]} testID="ghost-submit">
              {busy ? <ActivityIndicator color={colors.white} size="small" /> : (
                <Txt weight="700" color={colors.white}>Publier avec le badge Jokoo Vérifié</Txt>
              )}
            </Pressable>
          </Card>
        ) : null}

        {/* Publication en masse */}
        {showBulk ? (
          <Card>
            <Txt weight="700">Publication en masse</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>
              2 départs/jour (07:30 & 16:00) sur {bulkDays} jour(s) · {bulkTotal} trajet(s) au total
            </Txt>
            <Txt size="xs" weight="600" color={colors.textMuted} style={{ marginTop: spacing.md }}>Axes</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {PRESET_ROUTES.map((r, i) => {
                const on = selRoutes.includes(i);
                return (
                  <Pressable
                    key={`${r.from}-${r.to}`}
                    onPress={() => setSelRoutes((s) => (on ? s.filter((x) => x !== i) : [...s, i]))}
                    style={[styles.chip, on && styles.chipOn]}
                    testID={`ghost-route-${i}`}
                  >
                    <Txt size="xs" weight="600" color={on ? colors.white : colors.text}>
                      {r.from} → {r.to} · {r.price.toLocaleString("fr-FR")} F
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <Txt size="xs" weight="600" color={colors.textMuted} style={{ marginTop: spacing.md }}>Durée</Txt>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {[3, 7, 14].map((d) => (
                <Pressable key={d} onPress={() => setBulkDays(d)} style={[styles.chip, bulkDays === d && styles.chipOn]} testID={`ghost-days-${d}`}>
                  <Txt size="xs" weight="700" color={bulkDays === d ? colors.white : colors.text}>{d} jours</Txt>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={publishBulk} disabled={busy || selRoutes.length === 0} style={[styles.submit, (busy || selRoutes.length === 0) && { opacity: 0.5 }]} testID="ghost-bulk-submit">
              {busy ? <ActivityIndicator color={colors.white} size="small" /> : (
                <Txt weight="700" color={colors.white}>Publier {bulkTotal} trajet(s)</Txt>
              )}
            </Pressable>
          </Card>
        ) : null}

        {/* Liste des trajets actifs */}
        <Txt size="sm" weight="700" color={colors.textMuted}>ACTIFS ({active.length})</Txt>
        {active.length === 0 ? (
          <Card><Txt size="sm" color={colors.textMuted}>Aucun trajet officiel actif. Publiez-en pour peupler la marketplace.</Txt></Card>
        ) : (
          active.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.badge}>
                  <Ionicons name="shield-checkmark" size={11} color={colors.white} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Txt size="sm" weight="700">{r.from_city} → {r.to_city}</Txt>
                  <Txt size="xxs" color={colors.textMuted}>
                    {r.date} · {r.time} · {r.seats_available}/{r.seats_total} places · {r.price_xof.toLocaleString("fr-FR")} F
                    {r.bookings_count > 0 ? ` · ${r.bookings_count} résa` : ""}
                  </Txt>
                </View>
                <Pressable onPress={() => setCancelId(r.id)} style={styles.cancelBtn} testID={`ghost-cancel-${r.id}`} hitSlop={6}>
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </Pressable>
              </View>
            </Card>
          ))
        )}

        {past.length > 0 ? (
          <>
            <Txt size="sm" weight="700" color={colors.textMuted} style={{ marginTop: spacing.sm }}>TERMINÉS / ANNULÉS ({past.length})</Txt>
            {past.slice(0, 20).map((r) => (
              <Card key={r.id}>
                <Txt size="sm" weight="600" color={colors.textMuted}>{r.from_city} → {r.to_city} · {r.date} {r.time} · {r.status === "cancelled" ? "Annulé" : "Terminé"}</Txt>
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={!!cancelId}
        title="Annuler ce trajet ?"
        message="Les passagers déjà réservés seront prévenus et leur réservation annulée."
        confirmLabel="Annuler le trajet"
        destructive
        onConfirm={doCancel}
        onClose={() => setCancelId(null)}
      />
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, testID }: any) {
  return (
    <View style={{ flex: 1 }}>
      <Txt size="xs" weight="600" color={colors.textMuted}>{label}</Txt>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        keyboardType={keyboardType}
        autoCapitalize="none"
        style={styles.input}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  toast: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.turquoise },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", height: 46, borderRadius: radius.md },
  input: { height: 44, marginTop: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, fontSize: fs.sm, color: colors.text, backgroundColor: colors.surface2 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 44, marginTop: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 8, backgroundColor: colors.surface2 },
  stepBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  submit: { height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.turquoise, marginTop: spacing.md },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.divider },
  chipOn: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.turquoise },
  cancelBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${"#EF4444"}12` },
});
