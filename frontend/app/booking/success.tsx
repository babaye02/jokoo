import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Method = "card" | "wave" | "orange" | "cash";

export default function BookingSuccess() {
  const { bookingId, amount, priceType } = useLocalSearchParams<{ bookingId: string; amount: string; priceType?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [method, setMethod] = useState<Method>("card");
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);

  const isQuote = priceType === "quote" || !amount;
  const amountNum = parseInt(amount || "0", 10) || 0;

  const pay = async () => {
    setLoading(true);
    try {
      if (method === "cash") { setPaid(true); return; }
      const endpoint =
        method === "card" ? "/payments/checkout/booking" :
        method === "wave" ? "/payments/wave/checkout/booking" :
        "/payments/orange/checkout/booking";
      const r = await api.post<{ url: string }>(endpoint, {
        booking_id: bookingId,
        amount_xof: Math.max(500, amountNum),
      });
      if (Platform.OS === "web") window.location.assign(r.url);
      else await WebBrowser.openBrowserAsync(r.url);
      setPaid(true);
    } catch (e: any) {
      Alert.alert("Paiement indisponible", e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.replace("/(tabs)")} style={styles.back} testID="success-close">
          <Ionicons name="close" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Confirmation</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom }}>
        <View style={styles.successBox}>
          <View style={styles.check}>
            <Ionicons
              name={paid ? "checkmark" : isQuote ? "mail-open" : "calendar"}
              size={40}
              color={colors.white}
            />
          </View>
          <Txt size="xxl" weight="700" style={{ marginTop: spacing.md, textAlign: "center" }}>
            {paid ? "Paiement confirmé !" : isQuote ? "Demande envoyée" : "Réservation confirmée"}
          </Txt>
          <Txt size="md" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center", lineHeight: 22 }}>
            {paid
              ? "Merci ! Votre prestataire va vous contacter."
              : isQuote
              ? "Le prestataire va étudier votre demande et vous envoyer un devis personnalisé dans la messagerie."
              : "Le prestataire recevra votre demande. Vous pouvez régler dès maintenant pour bloquer le créneau."}
          </Txt>

          {!isQuote ? (
            <View style={styles.amountBox}>
              <Txt size="sm" color={colors.textMuted}>Montant à régler</Txt>
              <Txt size="xxl" weight="700" color={colors.turquoise}>{formatXof(amountNum)} CFA</Txt>
            </View>
          ) : (
            <View style={[styles.amountBox, { borderTopWidth: 0, paddingTop: spacing.md }]}>
              <View style={styles.quotePill}>
                <Ionicons name="document-text-outline" size={14} color={colors.midnight} />
                <Txt size="sm" weight="700" color={colors.midnight} style={{ marginLeft: 6 }}>
                  Devis en attente
                </Txt>
              </View>
            </View>
          )}
        </View>

        {!isQuote && !paid ? (
          <>
            <Txt size="lg" weight="700" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
              Moyen de paiement
            </Txt>
            <PayOption id="card"   title="Carte bancaire"        subtitle="Visa · Mastercard (Stripe)" icon="card"             active={method === "card"}   onPress={() => setMethod("card")} />
            <PayOption id="wave"   title="Wave"                  subtitle="Paiement mobile"            icon="phone-portrait"   active={method === "wave"}   onPress={() => setMethod("wave")} />
            <PayOption id="orange" title="Orange Money"          subtitle="Paiement mobile"            icon="wallet"           active={method === "orange"} onPress={() => setMethod("orange")} />
            <PayOption id="cash"   title="Payer à la prestation" subtitle="Espèces sur place"          icon="cash"             active={method === "cash"}   onPress={() => setMethod("cash")} />
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
        {paid || isQuote ? (
          <Btn
            title={isQuote ? "Ouvrir la messagerie" : "Voir mes réservations"}
            onPress={() => router.replace(isQuote ? "/(tabs)/messages" : "/(tabs)/profile")}
            fullWidth
            size="lg"
          />
        ) : (
          <Btn
            title={`Payer ${formatXof(amountNum)}`}
            onPress={pay}
            loading={loading}
            fullWidth
            size="lg"
            icon="lock-closed"
            testID="pay-submit"
          />
        )}
      </View>
    </View>
  );
}

function PayOption({ id, title, subtitle, icon, active, onPress }: any) {
  return (
    <Pressable onPress={onPress} style={[styles.pay, active && styles.payActive]} testID={`pay-${id}`}>
      <View style={[styles.payIcon, { backgroundColor: active ? colors.brandTertiary : colors.surface2 }]}>
        <Ionicons name={icon} size={22} color={active ? colors.turquoise : colors.midnight} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt weight="700">{title}</Txt>
        <Txt size="xs" color={colors.textMuted}>{subtitle}</Txt>
      </View>
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  successBox: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  check: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  amountBox: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center", width: "100%" },
  quotePill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.brandTertiary },
  pay: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  payActive: { borderColor: colors.turquoise, backgroundColor: "#F0FBF8" },
  payIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.turquoise },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.turquoise },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
