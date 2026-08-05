import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Card, Txt, Avatar, ErrorBox } from "@/src/components/ui";
import { colors, shadow, spacing } from "@/src/theme";

interface Row {
  rank: number;
  name: string;
  avatar?: string | null;
  tier: string;
  badge: string;
  prestataires: number;
  clients: number;
}

const RANK_COLORS: Record<number, string> = { 1: "#F5B301", 2: "#C0C0C0", 3: "#CD7F32" };

export default function AmbassadorLeaderboard() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Row[]>("/ambassadors/leaderboard");
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
      <Stack.Screen options={{ title: "Classement Jokoo Partners", headerBackTitle: "Retour" }} />

      {error ? (
        <View style={styles.center}><ErrorBox text={error} /></View>
      ) : loading ? (
        <View style={styles.center}><Txt color={colors.textMuted}>Chargement…</Txt></View>
      ) : rows.length === 0 ? (
        <View style={[styles.center, { padding: spacing.xl }]}>
          <Ionicons name="trophy-outline" size={48} color={colors.textMuted} />
          <Txt weight="700" size="md" style={{ marginTop: spacing.md, textAlign: "center" }}>
            Le classement est vide
          </Txt>
          <Txt color={colors.textMuted} size="sm" style={{ marginTop: 6, textAlign: "center" }}>
            Les premiers partenaires vérifiés apparaîtront bientôt ici.
          </Txt>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => `${r.rank}-${r.name}`}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 + insets.bottom }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <Txt size="sm" color={colors.textMuted} style={{ marginBottom: spacing.md }}>
              {"Les partenaires les plus actifs. Aucune donnée financière n'est affichée publiquement."}
            </Txt>
          }
          renderItem={({ item, index }) => {
            const rankBg = RANK_COLORS[item.rank] || "#00000010";
            return (
              <Card style={{ padding: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={[styles.rankBadge, { backgroundColor: rankBg }]}>
                    <Txt weight="800" size="sm" color={item.rank <= 3 ? "#fff" : colors.midnight}>
                      #{item.rank}
                    </Txt>
                  </View>
                  <Avatar uri={item.avatar || undefined} size={44} name={item.name} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Txt weight="700" numberOfLines={1}>{item.name}</Txt>
                    <Txt size="xs" color={colors.textMuted}>{item.badge}</Txt>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Txt weight="800" size="md">{item.prestataires + item.clients}</Txt>
                    <Txt size="xxs" color={colors.textMuted}>
                      {item.prestataires} pro · {item.clients} clients
                    </Txt>
                  </View>
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
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
    ...shadow.sm,
  },
});
