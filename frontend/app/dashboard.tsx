// Prestataire dashboard: stats, requests, subscription.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Alert, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api, Booking } from "@/src/api";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Dash = {
  total_bookings: number;
  pending: number;
  accepted: number;
  completed: number;
  revenue_xof: number;
  rating: number;
  reviews_count: number;
  subscription_active: boolean;
  subscription_until: string | null;
  recent_bookings: Booking[];
};

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [dash, setDash] = useState<Dash | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try { setDash(await api.get<Dash>("/dashboard")); } catch (e: any) { Alert.alert("Erreur", e.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const accept = async (id: string) => { await api.patch(`/bookings/${id}`, { status: "accepted" }); load(); };
  const reject = async (id: string) => { await api.patch(`/bookings/${id}`, { status: "rejected" }); load(); };
  const complete = async (id: string) => { await api.patch(`/bookings/${id}`, { status: "completed" }); load(); };

  const subscribe = async (provider: "card" | "wave" | "orange" = "card") => {
    setPaying(true);
    try {
      const endpoint =
        provider === "card" ? "/payments/checkout/subscription" :
        provider === "wave" ? "/payments/wave/checkout/subscription" :
        "/payments/orange/checkout/subscription";
      const r = await api.post<{ url: string }>(endpoint, { plan: "monthly" });
      if (Platform.OS === "web") window.location.assign(r.url);
      else await WebBrowser.openBrowserAsync(r.url);
    } catch (e: any) {
      Alert.alert("Paiement indisponible", e.message);
    } finally {
      setPaying(false);
    }
  };

  const chooseSubMethod = () => {
    Alert.alert(
      "S'abonner à Jokoo Pro",
      "15 000 F CFA / mois. Choisissez un moyen de paiement.",
      [
        { text: "Carte bancaire", onPress: () => subscribe("card") },
        { text: "Wave", onPress: () => subscribe("wave") },
        { text: "Orange Money", onPress: () => subscribe("orange") },
        { text: "Annuler", style: "cancel" },
      ],
    );
  };

  if (!dash) return <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><Txt color={colors.textMuted}>Chargement…</Txt></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="dash-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Tableau de bord</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.turquoise} />}
      >
        {/* Subscription banner */}
        <View style={[styles.sub, { backgroundColor: dash.subscription_active ? colors.turquoise : colors.midnight }]}>
          <View style={{ flex: 1 }}>
            <Txt size="sm" color="rgba(255,255,255,0.85)" weight="600">
              {dash.subscription_active ? "ABONNEMENT ACTIF" : "ABONNEMENT REQUIS"}
            </Txt>
            <Txt size="lg" weight="700" color={colors.white} style={{ marginTop: 4 }}>
              {dash.subscription_active ? "Jokoo Pro Mensuel" : "Activez Jokoo Pro"}
            </Txt>
            <Txt size="xs" color="rgba(255,255,255,0.85)" style={{ marginTop: 4 }}>
              {dash.subscription_active
                ? `Valide jusqu'au ${dash.subscription_until?.slice(0, 10)}`
                : "Recevez des demandes et débloquez toutes les fonctions"}
            </Txt>
          </View>
          {!dash.subscription_active ? (
            <Pressable onPress={chooseSubMethod} disabled={paying} style={styles.subBtn} testID="subscribe-btn">
              <Txt weight="700" color={colors.midnight}>{paying ? "…" : "15 000 F/mois"}</Txt>
            </Pressable>
          ) : (
            <Ionicons name="shield-checkmark" size={28} color={colors.white} />
          )}
        </View>

        {/* Stats grid */}
        <View style={styles.grid}>
          <StatBox icon="cash" label="Revenus" value={`${dash.revenue_xof.toLocaleString()} F`} color={colors.turquoise} />
          <StatBox icon="calendar" label="Réservations" value={String(dash.total_bookings)} color={colors.midnight} />
          <StatBox icon="hourglass" label="En attente" value={String(dash.pending)} color={colors.warning} />
          <StatBox icon="star" label="Note" value={dash.rating.toFixed(1)} color="#F59E0B" />
        </View>

        <Txt size="lg" weight="700" style={{ marginTop: spacing.md }}>Demandes récentes</Txt>
        {dash.recent_bookings.length === 0 ? (
          <Card><Txt color={colors.textMuted}>Aucune demande pour le moment.</Txt></Card>
        ) : (
          dash.recent_bookings.map((b) => (
            <Card key={b.id} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="700">{b.client_name}</Txt>
                  <Txt size="xs" color={colors.textMuted}>{b.date} · {b.time} · {b.address}</Txt>
                </View>
                <Txt weight="700" color={colors.turquoise}>{b.estimated_price.toLocaleString()} F</Txt>
              </View>
              <Txt size="sm" color={colors.text} style={{ marginTop: 8 }} numberOfLines={2}>{b.description}</Txt>
              {b.status === "pending" ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <View style={{ flex: 1 }}><Btn title="Refuser" variant="secondary" onPress={() => reject(b.id)} testID={`reject-${b.id}`} /></View>
                  <View style={{ flex: 1 }}><Btn title="Accepter" onPress={() => accept(b.id)} testID={`accept-${b.id}`} /></View>
                </View>
              ) : b.status === "accepted" ? (
                <Btn title="Marquer terminée" onPress={() => complete(b.id)} style={{ marginTop: 12 }} testID={`complete-${b.id}`} />
              ) : (
                <View style={styles.status}><Txt size="xs" weight="700" color={colors.textMuted}>{b.status.toUpperCase()}</Txt></View>
              )}
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function StatBox({ icon, label, value, color }: any) {
  return (
    <View style={styles.statBox}>
      <View style={[styles.statIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Txt size="lg" weight="700" style={{ marginTop: 8 }}>{value}</Txt>
      <Txt size="xs" color={colors.textMuted}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  sub: { padding: spacing.lg, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", ...shadow.card },
  subBtn: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.white, borderRadius: radius.pill },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statBox: { width: "48%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  status: { marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.surface2, borderRadius: radius.pill },
});
