// Admin CRM Push — Liste complète des campagnes avec filtres.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, shadow, spacing } from "@/src/theme";

const FILTERS = [
  { key: "",          label: "Toutes" },
  { key: "sent",      label: "Envoyées" },
  { key: "scheduled", label: "Programmées" },
  { key: "sending",   label: "En cours" },
  { key: "draft",     label: "Brouillons" },
];

export default function AdminPushCampaigns() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = status ? `?status=${status}` : "";
      setItems(await api.get<any[]>(`/admin/push/campaigns${qs}`));
    } catch { /* silent */ }
    finally { setRefreshing(false); }
  }, [status]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Campagnes</Txt>
        <Pressable onPress={() => router.push("/admin/push/create")} style={styles.plus}>
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      <View style={{ paddingHorizontal: spacing.xl, paddingTop: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {FILTERS.map((f) => (
            <Pressable key={f.key || "all"} onPress={() => setStatus(f.key)} style={[styles.chip, status === f.key && styles.chipOn]}>
              <Txt size="xs" weight="700" color={status === f.key ? colors.white : colors.textMuted}>{f.label}</Txt>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {items.length === 0 ? (
          <Card><Txt color={colors.textMuted}>Aucune campagne dans cette catégorie.</Txt></Card>
        ) : items.map((c) => (
          <Pressable key={c.id} onPress={() => router.push(`/admin/push/campaign/${c.id}` as any)}>
            <Card style={{ padding: spacing.md, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Txt weight="700" numberOfLines={1} style={{ flex: 1, paddingRight: 8 }}>{c.title}</Txt>
                <Pill status={c.status} />
              </View>
              <Txt size="xs" color={colors.textMuted} numberOfLines={2}>{c.message}</Txt>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <Meta icon="people" text={`${c.stats?.targeted || 0} ciblés`} />
                <Meta icon="paper-plane" text={`${c.stats?.sent || 0} envoyés`} />
                {c.stats?.failed ? <Meta icon="alert-circle" text={`${c.stats.failed} échecs`} /> : null}
                {c.scheduled_at ? <Meta icon="calendar" text={c.scheduled_at.slice(0, 16).replace("T", " ")} /> : null}
              </View>
            </Card>
          </Pressable>
        ))}
        <Btn title="+ Nouvelle campagne" onPress={() => router.push("/admin/push/create")} icon="add-circle" fullWidth />
      </ScrollView>
    </View>
  );
}

function Pill({ status }: { status: string }) {
  const color: Record<string, string> = { draft: colors.textMuted, scheduled: colors.warning, sending: colors.turquoise, sent: colors.success, failed: colors.danger };
  const label: Record<string, string> = { draft: "Brouillon", scheduled: "Programmée", sending: "Envoi…", sent: "Envoyée", failed: "Échec" };
  const tint = color[status] || colors.textMuted;
  return <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: `${tint}22` }}><Txt size="xxs" weight="700" color={tint}>{label[status] || status}</Txt></View>;
}

function Meta({ icon, text }: any) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Ionicons name={icon} size={12} color={colors.textMuted} /><Txt size="xxs" color={colors.textMuted}>{text}</Txt></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  plus: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
});
