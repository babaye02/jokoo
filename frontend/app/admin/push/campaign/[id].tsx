// Admin CRM Push — Détail campagne + statistiques + actions.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, shadow, spacing } from "@/src/theme";

export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [c, setC] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setC(await api.get<any>(`/admin/push/campaigns/${id}`)); } catch {}
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sendNow = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>(`/admin/push/campaigns/${id}/send`, {});
      Alert.alert("Envoyée ✅", `${r.stats?.sent || 0} notifications envoyées.`);
      load();
    } catch (e: any) { Alert.alert("Erreur", e?.message || "Envoi impossible."); }
    finally { setBusy(false); }
  };

  const del = async () => {
    Alert.alert("Supprimer la campagne ?", "Cette action est irréversible.", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        try { await api.delete(`/admin/push/campaigns/${id}`); router.back(); }
        catch (e: any) { Alert.alert("Erreur", e?.message); }
      }},
    ]);
  };

  if (!c) return null;
  const st = c.live_stats || c.stats || {};

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700" numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>{c.title}</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 + insets.bottom, gap: spacing.md }}>
        {/* Aperçu comme une push */}
        <Card style={{ padding: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Ionicons name="notifications" size={14} color={colors.turquoise} />
            <Txt size="xxs" weight="700" color={colors.turquoise}>JOKOO · MAINTENANT</Txt>
          </View>
          <Txt weight="700">{c.title}</Txt>
          <Txt size="sm" color={colors.textMuted} style={{ marginTop: 2 }}>{c.message}</Txt>
          {c.deep_link ? <Txt size="xxs" color={colors.turquoise} style={{ marginTop: 6 }}>🔗 {c.deep_link}</Txt> : null}
          {c.cta_text ? <Txt size="xxs" color={colors.midnight} style={{ marginTop: 6 }}>Bouton : {c.cta_text}</Txt> : null}
        </Card>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <Stat icon="people" label="Ciblés" value={c.stats?.targeted || 0} tint={colors.midnight} />
          <Stat icon="paper-plane" label="Envoyés" value={st.sent || 0} tint={colors.success} />
          <Stat icon="checkmark-done" label="Livrés" value={st.delivered || 0} tint={colors.turquoise} />
          <Stat icon="eye" label="Ouverts" value={st.opened || 0} tint={colors.brand} />
          <Stat icon="alert-circle" label="Échecs" value={st.failed || 0} tint={colors.danger} />
        </View>

        {/* Métadonnées */}
        <Card style={{ padding: spacing.md, gap: 6 }}>
          <Row icon="calendar" label="Créée" value={new Date(c.created_at).toLocaleString("fr-FR")} />
          {c.sent_at ? <Row icon="paper-plane" label="Envoyée" value={new Date(c.sent_at).toLocaleString("fr-FR")} /> : null}
          {c.scheduled_at ? <Row icon="alarm" label="Programmée" value={new Date(c.scheduled_at).toLocaleString("fr-FR")} /> : null}
          <Row icon="people" label="Segment" value={segmentLabel(c.segment)} />
          <Row icon="pricetag" label="Statut" value={c.status} />
        </Card>

        {/* Actions */}
        {c.status !== "sent" && c.status !== "sending" ? (
          <Btn title="🚀 Envoyer maintenant" loading={busy} onPress={sendNow} fullWidth />
        ) : null}
        {c.status !== "sending" ? (
          <Btn title="🗑️ Supprimer" variant="secondary" onPress={del} fullWidth />
        ) : null}
      </ScrollView>
    </View>
  );
}

function segmentLabel(seg: any): string {
  const t = seg?.type;
  if (t === "category") return `Métier : ${seg?.params?.category || "?"}`;
  if (t === "city") return `Ville : ${seg?.params?.city || "?"}`;
  if (t === "manual") return `Manuel (${(seg?.params?.user_ids || []).length})`;
  const l: Record<string, string> = { all: "Tous", clients: "Clients", prestataires: "Prestataires", verified: "Vérifiés", unverified: "Non-vérifiés", new_signups: "Nouveaux inscrits", inactive: "Inactifs" };
  return l[t] || t || "?";
}

function Stat({ icon, label, value, tint }: any) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: `${tint}22` }]}><Ionicons name={icon} size={16} color={tint} /></View>
      <Txt size="lg" weight="700" style={{ marginTop: 4 }}>{value}</Txt>
      <Txt size="xxs" color={colors.textMuted}>{label}</Txt>
    </View>
  );
}

function Row({ icon, label, value }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Txt size="xs" color={colors.textMuted}>{label} :</Txt>
      <Txt size="xs" weight="700">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { flexBasis: "31%", flexGrow: 1, padding: 10, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", ...shadow.soft },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
