// Écran de sponsorisation (prestataire) — sélection de durée + choix du moyen de paiement.
import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Platform, Modal, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api, Sponsorship } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Plan = { duration_days: 7 | 15 | 30; amount_xof: number };
type Method = "card" | "wave" | "orange";

const DEFAULT_PLANS: Plan[] = [
  { duration_days: 7, amount_xof: 5000 },
  { duration_days: 15, amount_xof: 10000 },
  { duration_days: 30, amount_xof: 18000 },
];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:         { label: "En attente",            color: colors.warning },
  pending_payment: { label: "Paiement en attente",   color: colors.warning },
  approved:        { label: "Approuvée",             color: colors.turquoise },
  active:          { label: "Active ",             color: colors.success },
  rejected:        { label: "Refusée",               color: colors.danger },
  expired:         { label: "Expirée",               color: colors.textMuted },
};

const PLAN_LABEL = (d: number) =>
  d === 7 ? "Boost semaine" : d === 15 ? "Boost 2 semaines" : "Boost 1 mois";
const PLAN_TAG = (d: number) =>
  d === 15 ? "Populaire" : d === 30 ? "Meilleure valeur" : undefined;

export default function Sponsor() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ paid?: string; sid?: string; provider?: string }>();
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [items, setItems] = useState<Sponsorship[]>([]);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [pickerFor, setPickerFor] = useState<Plan | null>(null);
  const [payCfg, setPayCfg] = useState<{ card: boolean; wave: boolean; orange: boolean }>({
    card: false, wave: true, orange: true,
  });
  const verifiedRef = useRef<string | null>(null);

  // Charge la configuration des paiements (Stripe désactivé en version Sénégal)
  useEffect(() => {
    api.get<any>("/payments/config").then((c) => {
      if (c && typeof c === "object") {
        setPayCfg({
          card:   !!c.card,
          wave:   c.wave !== false,
          orange: c.orange !== false,
        });
      }
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const [p, mine] = await Promise.all([
        api.get<Plan[]>("/sponsorships/prices").catch(() => DEFAULT_PLANS),
        api.get<Sponsorship[]>("/sponsorships/mine").catch(() => []),
      ]);
      if (Array.isArray(p) && p.length) setPlans(p);
      setItems(mine || []);
    } catch {
      /* silencieux */
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Retour depuis Stripe (checkout web) → on vérifie le paiement côté serveur
  useEffect(() => {
    const sid = typeof params.sid === "string" ? params.sid : "";
    const paid = params.paid === "1";
    if (!paid || !sid || verifiedRef.current === sid) return;
    verifiedRef.current = sid;
    (async () => {
      try {
        // Récupère le session_id si présent dans l'URL courante (web)
        let sessionId = "";
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const u = new URL(window.location.href);
          sessionId = u.searchParams.get("session_id") || "";
        }
        if (sessionId) {
          const r = await api.post<{ paid: boolean }>(`/sponsorships/${sid}/verify`, { session_id: sessionId });
          if (r.paid) {
            Alert.alert("Paiement confirmé", "Votre profil est désormais mis en avant 🚀");
          }
        } else if (params.provider === "wave" || params.provider === "orange") {
          Alert.alert("Paiement en cours", "Le statut sera confirmé une fois validé par l'opérateur.");
        }
      } catch {
        /* silencieux */
      } finally {
        load();
      }
    })();
  }, [params.sid, params.paid, params.provider, load]);

  const openPicker = (plan: Plan) => {
    if (paying || loading) return;
    setPickerFor(plan);
  };

  const startCheckout = async (plan: Plan, method: Method) => {
    setPaying(true);
    setPickerFor(null);
    setLoading(true);
    try {
      // 1) Créer la sponsorisation (pending_payment)
      const created = await api.post<Sponsorship>("/sponsorships", { duration_days: plan.duration_days });
      // 2) Créer la session de checkout
      const r = await api.post<{ url: string; session_id?: string; pay_token?: string }>(
        `/sponsorships/${created.id}/checkout`,
        { provider: method },
      );
      if (!r?.url) throw new Error("URL de paiement indisponible");
      // 3) Ouvrir la page de paiement
      if (Platform.OS === "web") window.location.assign(r.url);
      else await WebBrowser.openBrowserAsync(r.url);
    } catch (e: any) {
      const msg = e?.message || "Impossible de démarrer le paiement.";
      Alert.alert(
        method === "wave" ? "Wave indisponible" : method === "orange" ? "Orange Money indisponible" : "Erreur",
        msg,
      );
    } finally {
      setPaying(false);
      setLoading(false);
      load();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="sponsor-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Sponsoriser mon profil</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        <View style={styles.hero}>
          <Ionicons name="rocket" size={28} color={colors.white} />
          <Txt size="xl" weight="700" color={colors.white} style={{ marginTop: 8 }}>Boostez votre visibilité</Txt>
          <Txt size="sm" color="rgba(255,255,255,0.85)" style={{ marginTop: 4, lineHeight: 20 }}>
            Apparaissez en tête des résultats et augmentez vos réservations.
          </Txt>
        </View>

        <Txt size="lg" weight="700" style={{ marginTop: spacing.md }}>Choisissez une durée</Txt>
        {plans.map((pl) => {
          const tag = PLAN_TAG(pl.duration_days);
          return (
            <Pressable
              key={pl.duration_days}
              onPress={() => openPicker(pl)}
              style={styles.plan}
              disabled={loading || paying}
              testID={`plan-${pl.duration_days}`}
            >
              <View style={styles.planIcon}>
                <Txt size="lg" weight="700" color={colors.white}>{pl.duration_days}</Txt>
                <Txt size="xxs" color={colors.white}>jours</Txt>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Txt weight="700">{PLAN_LABEL(pl.duration_days)}</Txt>
                  {tag ? (
                    <View style={styles.tag}><Txt size="xxs" weight="700" color={colors.midnight}>{tag}</Txt></View>
                  ) : null}
                </View>
                <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>
                  En tête pendant {pl.duration_days} jours consécutifs
                </Txt>
                <Txt size="lg" weight="700" color={colors.turquoise} style={{ marginTop: 6 }}>{formatXof(pl.amount_xof)}</Txt>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
            </Pressable>
          );
        })}

        <Txt size="lg" weight="700" style={{ marginTop: spacing.md }}>Historique</Txt>
        {items.length === 0 ? (
          <Card><Txt color={colors.textMuted}>Aucune sponsorisation. Lancez votre 1er boost !</Txt></Card>
        ) : items.map((s) => {
          const st = STATUS_LABEL[s.status] || STATUS_LABEL.pending;
          return (
            <Card key={s.id} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="700">Boost {s.duration_days} jours</Txt>
                  <Txt size="xs" color={colors.textMuted}>{new Date(s.created_at).toLocaleDateString("fr-FR")}</Txt>
                </View>
                <View style={[styles.pill, { backgroundColor: `${st.color}22` }]}>
                  <Txt size="xxs" weight="700" color={st.color}>{st.label}</Txt>
                </View>
              </View>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6 }}>
                Montant : {formatXof(s.amount_xof)}
                {s.payment_provider ? ` · ${labelProvider(s.payment_provider)}` : ""}
                {s.ends_at ? ` · Se termine le ${s.ends_at.slice(0, 10)}` : ""}
              </Txt>
            </Card>
          );
        })}
      </ScrollView>

      {/* Modal choix moyen de paiement */}
      <Modal transparent visible={!!pickerFor} animationType="fade" onRequestClose={() => setPickerFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerFor(null)}>
          <Pressable style={styles.sheet} onPress={() => { /* absorb */ }}>
            <View style={styles.grabber} />
            <Txt size="lg" weight="700">Moyen de paiement</Txt>
            {pickerFor ? (
              <Txt size="sm" color={colors.textMuted} style={{ marginTop: 4 }}>
                {PLAN_LABEL(pickerFor.duration_days)} — {formatXof(pickerFor.amount_xof)}
              </Txt>
            ) : null}
            <View style={{ height: spacing.md }} />
            {payCfg.card ? (
              <PayOption
                icon="card" title="Carte bancaire" subtitle="Visa · Mastercard"
                onPress={() => pickerFor && startCheckout(pickerFor, "card")}
                testID="pay-card"
              />
            ) : null}
            {payCfg.wave ? (
              <PayOption
                icon="phone-portrait" title="Wave" subtitle="Paiement mobile"
                onPress={() => pickerFor && startCheckout(pickerFor, "wave")}
                testID="pay-wave"
              />
            ) : null}
            {payCfg.orange ? (
              <PayOption
                icon="wallet" title="Orange Money" subtitle="Paiement mobile"
                onPress={() => pickerFor && startCheckout(pickerFor, "orange")}
                testID="pay-orange"
              />
            ) : null}
            <View style={{ height: 8 }} />
            <Btn title="Annuler" variant="secondary" onPress={() => setPickerFor(null)} fullWidth />
            {paying ? (
              <View style={styles.overlay}>
                <ActivityIndicator color={colors.turquoise} size="large" />
                <Txt size="sm" color={colors.textMuted} style={{ marginTop: 8 }}>Redirection…</Txt>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function labelProvider(p: string): string {
  if (p === "card") return "Carte bancaire";
  if (p === "wave") return "Wave";
  if (p === "orange") return "Orange Money";
  if (p === "admin_gift") return "Offert par Jokoo";
  return p;
}

function PayOption({ icon, title, subtitle, onPress, testID }: any) {
  return (
    <Pressable onPress={onPress} style={styles.pay} testID={testID}>
      <View style={styles.payIcon}>
        <Ionicons name={icon} size={22} color={colors.turquoise} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt weight="700">{title}</Txt>
        <Txt size="xs" color={colors.textMuted}>{subtitle}</Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  hero: { padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.midnight, ...shadow.card },
  plan: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow.soft },
  planIcon: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  tag: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.brandTertiary },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: spacing.xl + 16 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  pay: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.lg, padding: spacing.md, marginBottom: 10 },
  payIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.85)", alignItems: "center", justifyContent: "center", borderRadius: 24 },
});
