// Écran de sponsorisation (prestataire) — demande d'un boost pour X jours.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Sponsorship } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const PLANS: { days: 7 | 15 | 30; price: number; tag?: string }[] = [
  { days: 7, price: 5000 },
  { days: 15, price: 9000, tag: "Populaire" },
  { days: 30, price: 15000, tag: "Meilleure valeur" },
];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:  { label: "En attente validation", color: colors.warning },
  approved: { label: "Approuvé",              color: colors.turquoise },
  active:   { label: "Actif",                 color: colors.success },
  rejected: { label: "Refusé",                color: colors.danger },
  expired:  { label: "Expiré",                color: colors.textMuted },
};

export default function Sponsor() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Sponsorship[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.get<Sponsorship[]>("/sponsorships/mine")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const request = async (days: 7 | 15 | 30) => {
    setLoading(true);
    try {
      await api.post("/sponsorships", { duration_days: days });
      Alert.alert("Demande envoyée", "Un administrateur va valider votre sponsorisation.");
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
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
        {PLANS.map((pl) => (
          <Pressable
            key={pl.days}
            onPress={() => request(pl.days)}
            style={styles.plan}
            disabled={loading}
            testID={`plan-${pl.days}`}
          >
            <View style={styles.planIcon}>
              <Txt size="lg" weight="700" color={colors.white}>{pl.days}</Txt>
              <Txt size="xxs" color={colors.white}>jours</Txt>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt weight="700">{pl.days === 7 ? "Boost semaine" : pl.days === 15 ? "Boost 2 semaines" : "Boost 1 mois"}</Txt>
                {pl.tag ? (
                  <View style={styles.tag}><Txt size="xxs" weight="700" color={colors.midnight}>{pl.tag}</Txt></View>
                ) : null}
              </View>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>
                En tête pendant {pl.days} jours consécutifs
              </Txt>
              <Txt size="lg" weight="700" color={colors.turquoise} style={{ marginTop: 6 }}>{formatXof(pl.price)}</Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
          </Pressable>
        ))}

        <Txt size="lg" weight="700" style={{ marginTop: spacing.md }}>Historique</Txt>
        {items.length === 0 ? (
          <Card><Txt color={colors.textMuted}>Aucune sponsorisation. Lancez votre 1er boost !</Txt></Card>
        ) : items.map((s) => {
          const st = STATUS_LABEL[s.status] || STATUS_LABEL.pending;
          return (
            <Card key={s.id} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Txt weight="700">Boost {s.duration_days} jours</Txt>
                  <Txt size="xs" color={colors.textMuted}>{new Date(s.created_at).toLocaleDateString("fr-FR")}</Txt>
                </View>
                <View style={[styles.pill, { backgroundColor: `${st.color}22` }]}>
                  <Txt size="xxs" weight="700" color={st.color}>{st.label}</Txt>
                </View>
              </View>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6 }}>
                Montant : {formatXof(s.amount_xof)}
                {s.ends_at ? ` · Se termine le ${s.ends_at.slice(0, 10)}` : ""}
              </Txt>
            </Card>
          );
        })}
      </ScrollView>
    </View>
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
});
