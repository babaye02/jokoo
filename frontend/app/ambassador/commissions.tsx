import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Card, Txt, Badge, ErrorBox } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";

interface Commission {
  id: string;
  ambassador_id: string;
  booking_id: string;
  amount_xof: number;
  rate: number;
  tier_snapshot: string;
  status: "pending" | "approved" | "paid" | "cancelled";
  created_at: string;
  paid_at?: string | null;
}

function statusMeta(s: string) {
  if (s === "paid") return { tone: "success", label: "Payée" } as const;
  if (s === "approved") return { tone: "info", label: "Approuvée" } as const;
  if (s === "cancelled") return { tone: "danger", label: "Annulée" } as const;
  return { tone: "warn", label: "En attente" } as const;
}

export default function AmbassadorCommissions() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Commission[]>("/ambassadors/me/commissions");
      setRows(r);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ title: "Mes commissions", headerBackTitle: "Retour" }} />
      {error ? (
        <View style={styles.center}><ErrorBox text={error} /></View>
      ) : loading ? (
        <View style={styles.center}><Txt color={colors.textMuted}>Chargement…</Txt></View>
      ) : rows.length === 0 ? (
        <View style={[styles.center, { padding: spacing.xl }]}>
          <Ionicons name="cash-outline" size={48} color={colors.textMuted} />
          <Txt weight="700" size="md" style={{ marginTop: spacing.md, textAlign: "center" }}>
            Aucune commission encore
          </Txt>
          <Txt color={colors.textMuted} size="sm" style={{ marginTop: 6, textAlign: "center" }}>
            {"Vos commissions apparaîtront ici dès qu'un filleul terminera sa 1re réservation."}
          </Txt>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 + insets.bottom }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const m = statusMeta(item.status);
            return (
              <Card style={{ padding: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Txt weight="800" size="lg">{item.amount_xof.toLocaleString("fr-FR")} F</Txt>
                  <Badge label={m.label} tone={m.tone} size="sm" />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Txt size="xs" color={colors.textMuted}>
                    Taux {Math.round(item.rate * 100)}% · Tier {item.tier_snapshot}
                  </Txt>
                  <Txt size="xs" color={colors.textMuted}>
                    {new Date(item.created_at).toLocaleDateString("fr-FR")}
                  </Txt>
                </View>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
