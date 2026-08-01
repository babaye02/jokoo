// Écran Paiements — historique des transactions Stripe/Wave/OM + moyens de paiement.
// Les moyens de paiement sont enregistrés côté fournisseur (Stripe Checkout, Wave, OM),
// donc on n'affiche pas de PAN ici. On liste les paiements de bookings passés.
import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Payment = {
  id: string;
  amount_xof: number;
  provider: "stripe" | "wave" | "orange_money" | string;
  status: string;
  created_at: string;
  booking_id?: string | null;
  title?: string | null;
};

export default function PaymentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Payment[]>("/payments/mine");
      setItems(Array.isArray(r) ? r : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="pay-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Paiements</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        <Card>
          <Txt size="sm" weight="700">Moyens de paiement acceptés</Txt>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <View style={styles.method}>
              <Ionicons name="card" size={18} color={colors.turquoise} />
              <Txt size="xs" weight="700" style={{ marginLeft: 6 }}>Stripe</Txt>
            </View>
            <View style={styles.method}>
              <Ionicons name="phone-portrait" size={18} color="#00BAFF" />
              <Txt size="xs" weight="700" style={{ marginLeft: 6 }}>Wave</Txt>
            </View>
            <View style={styles.method}>
              <Ionicons name="phone-portrait" size={18} color="#FF6600" />
              <Txt size="xs" weight="700" style={{ marginLeft: 6 }}>Orange Money</Txt>
            </View>
            <View style={styles.method}>
              <Ionicons name="cash" size={18} color={colors.textMuted} />
              <Txt size="xs" weight="700" style={{ marginLeft: 6 }}>Espèces</Txt>
            </View>
          </View>
          <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 10 }}>
            {"Vos moyens de paiement sont stockés de façon sécurisée chez nos partenaires (Stripe, Wave, Orange Money). Jokoo ne conserve jamais votre numéro de carte."}
          </Txt>
        </Card>

        <Txt size="md" weight="700" style={{ marginTop: 4 }}>Historique</Txt>

        {loading ? (
          <Card><Txt size="sm" color={colors.textMuted}>Chargement…</Txt></Card>
        ) : items.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", padding: spacing.md }}>
              <Ionicons name="receipt-outline" size={40} color={colors.textSubtle} />
              <Txt size="sm" weight="600" style={{ marginTop: 10 }}>Aucun paiement pour l&apos;instant</Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4, textAlign: "center" }}>
                Vos paiements apparaîtront ici après vos premières réservations.
              </Txt>
            </View>
          </Card>
        ) : items.map((p) => (
          <Card key={p.id}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.iconBox}>
                <Ionicons
                  name={p.provider === "wave" ? "phone-portrait" : p.provider === "orange_money" ? "phone-portrait" : p.provider === "stripe" ? "card" : "cash"}
                  size={18}
                  color={colors.turquoise}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Txt weight="700">{p.title || `Paiement ${p.provider}`}</Txt>
                <Txt size="xxs" color={colors.textMuted}>
                  {new Date(p.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })} · {p.status}
                </Txt>
              </View>
              <Txt weight="700">{formatXof(p.amount_xof)}</Txt>
            </View>
          </Card>
        ))}

        <Btn
          title="Voir mes réservations"
          variant="secondary"
          fullWidth
          icon="arrow-forward"
          onPress={() => router.push("/(tabs)/profile")}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
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
  method: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface2, borderRadius: 999 },
  iconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
});
