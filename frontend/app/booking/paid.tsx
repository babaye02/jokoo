// Landing page after a successful payment redirect (Stripe / Wave / Orange).
// Poll the /payments/status endpoint for Stripe sessions, or accept a redirect-only signal
// for Wave/OM (final paid state is confirmed by their webhooks).
import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function BookingPaid() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session_id, booking_id, kind, provider } = useLocalSearchParams<{
    session_id?: string;
    booking_id?: string;
    kind?: string;
    provider?: string;
  }>();
  const isSubscription = kind === "sub";
  const [status, setStatus] = useState<"verifying" | "paid" | "pending" | "unknown">("verifying");

  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer: any;

    async function poll() {
      // Stripe : GET /payments/status/{session_id} confirme le statut.
      if (session_id) {
        try {
          const r = await api.get<{ paid: boolean; status: string }>(`/payments/status/${session_id}`);
          if (!alive) return;
          if (r.paid) { setStatus("paid"); return; }
          if (tries++ < 6) { timer = setTimeout(poll, 1500); return; }
          setStatus("pending");
          return;
        } catch {
          if (!alive) return;
          if (tries++ < 6) { timer = setTimeout(poll, 1500); return; }
          setStatus("unknown");
          return;
        }
      }
      // Wave / Orange : le webhook marque le booking paid côté serveur.
      // Ici on affiche juste une confirmation optimiste ; l'utilisateur
      // reverra le statut réel dans "Mes réservations".
      setStatus("paid");
    }

    poll();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [session_id]);

  const goto = () => {
    if (isSubscription) {
      router.replace("/(tabs)/profile");
    } else {
      router.replace("/(tabs)/profile");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.replace("/(tabs)")} style={styles.back} testID="paid-close">
          <Ionicons name="close" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Confirmation</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom }}>
        <View style={styles.box}>
          <View style={[styles.check, status === "paid" ? styles.checkOk : styles.checkPending]}>
            <Ionicons
              name={status === "paid" ? "checkmark" : status === "verifying" ? "hourglass" : "time-outline"}
              size={40}
              color={colors.white}
            />
          </View>
          <Txt size="xxl" weight="700" style={{ marginTop: spacing.md, textAlign: "center" }}>
            {status === "paid" ? "Paiement confirmé !"
              : status === "verifying" ? "Vérification en cours…"
              : status === "pending" ? "Paiement en attente"
              : "Confirmation reçue"}
          </Txt>
          <Txt size="md" color={colors.textMuted} style={{ marginTop: 8, textAlign: "center", lineHeight: 22 }}>
            {status === "paid"
              ? (isSubscription
                  ? "Votre abonnement Jokoo Pro est actif pour 30 jours."
                  : "Le prestataire a été notifié. Vous pouvez suivre l'avancement dans « Mes réservations »." )
              : status === "verifying"
              ? "Merci de patienter quelques secondes pendant que nous vérifions votre paiement…"
              : status === "pending"
              ? "Votre paiement est en cours de traitement. Il apparaîtra sous quelques minutes dans vos réservations."
              : "Merci ! Nous vous confirmerons le paiement dès qu'il sera validé."}
          </Txt>
          {provider ? (
            <View style={styles.pill}>
              <Ionicons name="card" size={14} color={colors.midnight} />
              <Txt size="xs" weight="700" color={colors.midnight} style={{ marginLeft: 6 }}>
                via {provider === "wave" ? "Wave" : provider === "orange" ? "Orange Money" : "Carte bancaire"}
              </Txt>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
        <Btn
          title={isSubscription ? "Retour à mon profil" : "Voir mes réservations"}
          onPress={goto}
          fullWidth
          size="lg"
          icon="arrow-forward"
          testID="paid-goto"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  box: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  check: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  checkOk: { backgroundColor: colors.turquoise },
  checkPending: { backgroundColor: "#F59E0B" },
  pill: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, backgroundColor: colors.brandTertiary,
    marginTop: spacing.md,
  },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.xl, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
});
