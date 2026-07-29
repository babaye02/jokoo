// Admin — validation des sponsorisations prestataires.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Sponsorship } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:  { label: "En attente", color: colors.warning },
  approved: { label: "Approuvée", color: colors.turquoise },
  active:   { label: "Active",    color: colors.success },
  rejected: { label: "Refusée",   color: colors.danger },
  expired:  { label: "Expirée",   color: colors.textMuted },
};

export default function AdminSponsors() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Sponsorship[]>([]);

  const load = useCallback(async () => {
    try { setItems(await api.get<Sponsorship[]>("/admin/sponsorships")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approve = async (s: Sponsorship) => {
    try {
      await api.patch(`/admin/sponsorships/${s.id}`, { status: "approved" });
      Alert.alert("Approuvée", `${s.provider_name} est boosté ${s.duration_days} jours.`);
      load();
    } catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  const reject = async (s: Sponsorship) => {
    try {
      await api.patch(`/admin/sponsorships/${s.id}`, { status: "rejected" });
      load();
    } catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="sponsors-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Sponsorisations</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        {items.length === 0 ? (
          <Card><Txt color={colors.textMuted}>Aucune demande de sponsorisation.</Txt></Card>
        ) : items.map((s) => {
          const st = STATUS_LABEL[s.status] || STATUS_LABEL.pending;
          return (
            <Card key={s.id} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="700">{s.provider_name}</Txt>
                  <Txt size="xs" color={colors.textMuted}>
                    Boost {s.duration_days} jours · {formatXof(s.amount_xof)}
                  </Txt>
                  {s.ends_at ? (
                    <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 4 }}>
                      Se termine le {s.ends_at.slice(0, 10)}
                    </Txt>
                  ) : null}
                </View>
                <View style={[styles.pill, { backgroundColor: `${st.color}22` }]}>
                  <Txt size="xxs" weight="700" color={st.color}>{st.label}</Txt>
                </View>
              </View>
              {s.status === "pending" ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Btn title="Refuser" variant="secondary" onPress={() => reject(s)} testID={`sp-reject-${s.id}`} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Btn title="Approuver" onPress={() => approve(s)} testID={`sp-approve-${s.id}`} />
                  </View>
                </View>
              ) : null}
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
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
});
