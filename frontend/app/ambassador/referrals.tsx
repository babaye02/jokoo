import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Card, Txt, Avatar, Badge, ErrorBox } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";

interface Referral {
  id: string;
  ambassador_id: string;
  referred_user_id: string;
  referred_role: string;
  status: "pending" | "verified" | "invalid";
  created_at: string;
  verified_at?: string | null;
  first_booking_at?: string | null;
  kyc_verified_at?: string | null;
  name?: string | null;
  avatar?: string | null;
  role?: string | null;
}

function statusMeta(s: string) {
  if (s === "verified") return { tone: "success", label: "Vérifié" } as const;
  if (s === "invalid") return { tone: "danger", label: "Invalide" } as const;
  return { tone: "warn", label: "En attente" } as const;
}

function roleLabel(r?: string | null) {
  if (r === "prestataire") return "Prestataire";
  if (r === "client") return "Client";
  return "Utilisateur";
}

export default function AmbassadorReferrals() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Referral[]>("/ambassadors/me/referrals");
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
      <Stack.Screen options={{ title: "Mes filleuls", headerBackTitle: "Retour" }} />
      {error ? (
        <View style={styles.center}><ErrorBox text={error} /></View>
      ) : loading ? (
        <View style={styles.center}><Txt color={colors.textMuted}>Chargement…</Txt></View>
      ) : rows.length === 0 ? (
        <View style={[styles.center, { padding: spacing.xl }]}>
          <Ionicons name="people-outline" size={48} color={colors.textMuted} />
          <Txt weight="700" size="md" style={{ marginTop: spacing.md, textAlign: "center" }}>
            {"Aucun filleul pour l'instant"}
          </Txt>
          <Txt color={colors.textMuted} size="sm" style={{ marginTop: 6, textAlign: "center" }}>
            Partagez votre code de parrainage pour inviter clients et prestataires.
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
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Avatar uri={item.avatar || undefined} size={40} name={item.name || undefined} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Txt weight="700" numberOfLines={1}>{item.name || "Utilisateur"}</Txt>
                    <Txt size="xs" color={colors.textMuted}>
                      {roleLabel(item.role)} · {new Date(item.created_at).toLocaleDateString("fr-FR")}
                    </Txt>
                  </View>
                  <Badge label={m.label} tone={m.tone} size="sm" />
                </View>
                {(item.kyc_verified_at || item.first_booking_at) ? (
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {item.kyc_verified_at ? <Badge label="KYC OK" tone="info" size="sm" icon="shield-checkmark" /> : null}
                    {item.first_booking_at ? <Badge label="1re résa" tone="info" size="sm" icon="calendar" /> : null}
                  </View>
                ) : null}
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
