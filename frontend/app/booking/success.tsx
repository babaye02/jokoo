import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/src/api";
import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Method = "card" | "wave" | "orange" | "cash";

export default function BookingSuccess() {
  const { bookingId, amount } = useLocalSearchParams<{ bookingId: string; amount: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [method, setMethod] = useState<Method>("card");
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);

  const pay = async () => {
    setLoading(true);
    try {
      const amount_xof = Math.max(500, parseInt(amount || "0", 10) || 500);
      if (method === "cash") {
        // paiement à la prestation — pas de flux en ligne
        setPaid(true);
        return;
      }
      const endpoint =
        method === "card" ? "/payments/checkout/booking" :
        method === "wave" ? "/payments/wave/checkout/booking" :
        "/payments/orange/checkout/booking";
      const r = await api.post<{ url: string; session_id?: string; pay_token?: string }>(
        endpoint,
        { booking_id: bookingId, amount_xof },
      );
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
            <Ionicons name={paid ? "checkmark" : "calendar"} size={40} color={colors.white} />
          </View>
          <Txt size="xxl" weight="700" style={{ marginTop: spacing.md, textAlign: "center" }}>
            {paid ? "Paiement confirmé !" : "Demande envoyée"}
          </Txt>
          <Txt size="md" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
            {paid ? "Merci ! Votre prestataire va vous contacter." : "Votre prestataire recevra la demande."}
          </Txt>
          <View style={styles.amountBox}>
            <Txt size="sm" color={colors.textMuted}>Montant estimé</Txt>
            <Txt size="xxl" weight="700" color={colors.turquoise}>{Number(amount).toLocaleString()} F CFA</Txt>
          </View>
        </View>

        {!paid ? (
          <>
            <Txt size="lg" weight="700" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
              Choisir un moyen de paiement
            </Txt>
            <PayOption id="card" title="Carte bancaire" subtitle="Visa · Mastercard (Stripe)" icon="card" active={method === "card"} onPress={() => setMethod("card")} />
            <PayOption id="wave" title="Wave" subtitle="Paiement mobile" icon="phone-portrait" active={method === "wave"} onPress={() => setMethod("wave")} />
            <PayOption id="orange" title="Orange Money" subtitle="Paiement mobile" icon="wallet" active={method === "orange"} onPress={() => setMethod("orange")} />
            <PayOption id="cash" title="Payer à la prestation" subtitle="Espèces sur place" icon="cash" active={method === "cash"} onPress={() => setMethod("cash")} />
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
        {paid ? (
          <Btn title="Voir mes réservations" onPress={() => router.replace("/(tabs)/profile")} fullWidth size="lg" />
        ) : (
          <Btn title={`Payer ${Number(amount).toLocaleString()} F`} onPress={pay} loading={loading} fullWidth size="lg" icon="lock-closed" testID="pay-submit" />
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
  pay: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  payActive: { borderColor: colors.turquoise, backgroundColor: "#F0FBF8" },
  payIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.turquoise },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.turquoise },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
