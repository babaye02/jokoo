import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Parcel } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Txt, Btn, Avatar } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Tab = "sent" | "driver";

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  picked_up: "En route",
  delivered: "Livré",
  cancelled: "Annulée",
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  pending: { bg: "#FEF3C7", fg: "#92400E" },
  accepted: { bg: "#DBEAFE", fg: "#1E40AF" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B" },
  picked_up: { bg: "#E0E7FF", fg: "#3730A3" },
  delivered: { bg: "#DCFCE7", fg: "#166534" },
  cancelled: { bg: "#F3F4F6", fg: "#4B5563" },
};

export default function MyParcels() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("sent");
  const [sent, setSent] = useState<Parcel[]>([]);
  const [received, setReceived] = useState<Parcel[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        api.get<Parcel[]>("/parcels/mine"),
        api.get<Parcel[]>("/parcels/received"),
      ]);
      setSent(s);
      setReceived(r);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const setStatus = async (id: string, status: string, confirmMsg?: string) => {
    const doIt = async () => {
      try {
        await api.patch(`/parcels/${id}`, { status });
        await load();
      } catch (e: any) {
        Alert.alert("Erreur", e.message);
      }
    };
    if (confirmMsg) {
      Alert.alert("Confirmer", confirmMsg, [
        { text: "Non", style: "cancel" },
        { text: "Oui", onPress: doIt },
      ]);
    } else {
      await doIt();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="parcels-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Mes colis</Txt>
        <Pressable onPress={() => router.push("/mobility/delivery")} style={[styles.back, { backgroundColor: colors.turquoise }]} testID="parcels-search">
          <Ionicons name="search" size={20} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab("sent")} style={[styles.tabBtn, tab === "sent" && styles.tabBtnActive]} testID="ptab-sent">
          <Ionicons name="cube" size={16} color={tab === "sent" ? colors.white : colors.midnight} />
          <Txt weight="700" color={tab === "sent" ? colors.white : colors.midnight} style={{ marginLeft: 6 }}>
            Envoyés ({sent.length})
          </Txt>
        </Pressable>
        <Pressable onPress={() => setTab("driver")} style={[styles.tabBtn, tab === "driver" && styles.tabBtnActive]} testID="ptab-driver">
          <Ionicons name="car" size={16} color={tab === "driver" ? colors.white : colors.midnight} />
          <Txt weight="700" color={tab === "driver" ? colors.white : colors.midnight} style={{ marginLeft: 6 }}>
            À livrer ({received.length})
          </Txt>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {tab === "sent" ? (
          sent.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title="Aucun colis envoyé"
              body="Trouvez un trajet longue distance pour envoyer votre premier colis."
              cta="Rechercher un trajet"
              onCta={() => router.push("/mobility/delivery")}
            />
          ) : (
            sent.map((p) => (
              <SenderCard
                key={p.id}
                parcel={p}
                onContact={() => router.push(`/chat/${p.driver_id}`)}
                onCancel={p.status !== "cancelled" && p.status !== "delivered" ? () => setStatus(p.id, "cancelled", "Annuler cet envoi ?") : undefined}
              />
            ))
          )
        ) : received.length === 0 ? (
          <EmptyState
            icon="car-outline"
            title="Aucune demande reçue"
            body="Activez l'option « J'accepte des colis » dans vos trajets longue distance pour recevoir des demandes."
            cta="Publier un trajet"
            onCta={() => router.push("/mobility/rides/publish")}
          />
        ) : (
          received.map((p) => (
            <DriverCard
              key={p.id}
              parcel={p}
              onContact={() => router.push(`/chat/${p.sender_id}`)}
              onAccept={p.status === "pending" ? () => setStatus(p.id, "accepted") : undefined}
              onReject={p.status === "pending" ? () => setStatus(p.id, "rejected", "Refuser cette demande ?") : undefined}
              onPickup={p.status === "accepted" ? () => setStatus(p.id, "picked_up") : undefined}
              onDeliver={p.status === "picked_up" ? () => setStatus(p.id, "delivered", "Confirmer la livraison ?") : undefined}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function EmptyState({ icon, title, body, cta, onCta }: any) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={colors.textSubtle} />
      <Txt size="md" weight="700" style={{ marginTop: 10 }}>{title}</Txt>
      <Txt size="xs" color={colors.textMuted} style={{ textAlign: "center", marginTop: 4 }}>{body}</Txt>
      <View style={{ marginTop: 14 }}>
        <Btn title={cta} onPress={onCta} />
      </View>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.pending;
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Txt size="xxs" weight="700" color={c.fg}>{STATUS_LABEL[status] || status}</Txt>
    </View>
  );
}

function SenderCard({ parcel, onContact, onCancel }: any) {
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Txt size="xs" color={colors.textMuted}>{parcel.date} · {parcel.time}</Txt>
        <StatusPill status={parcel.status} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Txt weight="700">{parcel.from_city}</Txt>
        <Ionicons name="arrow-forward" size={12} color={colors.textMuted} style={{ marginHorizontal: 6 }} />
        <Txt weight="700">{parcel.to_city}</Txt>
      </View>
      <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }} numberOfLines={2}>
        {parcel.description} · {parcel.weight_kg} kg
      </Txt>
      <View style={styles.rowDivider} />
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Avatar uri={parcel.driver_avatar || undefined} name={parcel.driver_name} size={32} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Txt size="sm" weight="700">{parcel.driver_name}</Txt>
          <Txt size="xxs" color={colors.textMuted}>
            {parcel.payment_mode === "app" ? "Paiement en app" : "Espèces à la livraison"} · {formatXof(parcel.price_xof)}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Btn title="Contacter" icon="chatbubble-ellipses" variant="secondary" size="sm" onPress={onContact} />
        </View>
        {onCancel ? (
          <View style={{ flex: 1 }}>
            <Btn title="Annuler" icon="close" variant="ghost" size="sm" onPress={onCancel} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DriverCard({ parcel, onContact, onAccept, onReject, onPickup, onDeliver }: any) {
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Txt size="xs" color={colors.textMuted}>{parcel.date} · {parcel.time}</Txt>
        <StatusPill status={parcel.status} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Txt weight="700">{parcel.from_city}</Txt>
        <Ionicons name="arrow-forward" size={12} color={colors.textMuted} style={{ marginHorizontal: 6 }} />
        <Txt weight="700">{parcel.to_city}</Txt>
      </View>
      <View style={styles.rowDivider} />
      <View style={{ gap: 4 }}>
        <Txt size="xs" color={colors.textMuted}>Expéditeur</Txt>
        <Txt weight="700" size="sm">{parcel.sender_name} · {parcel.sender_phone || "—"}</Txt>
        <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6 }}>Destinataire</Txt>
        <Txt weight="700" size="sm">{parcel.recipient_name} · {parcel.recipient_phone}</Txt>
        <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6 }}>Ramassage</Txt>
        <Txt size="sm">{parcel.pickup_address}</Txt>
        <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6 }}>Livraison</Txt>
        <Txt size="sm">{parcel.dropoff_address}</Txt>
        <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6 }}>Colis</Txt>
        <Txt size="sm" numberOfLines={2}>{parcel.description} · {parcel.weight_kg} kg</Txt>
        <Txt size="xs" color={colors.turquoise} weight="700" style={{ marginTop: 8 }}>
          Paiement : {parcel.payment_mode === "app" ? "en app" : "espèces"} · {formatXof(parcel.price_xof)}
        </Txt>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap" }}>
        {onAccept ? (
          <View style={{ flex: 1, minWidth: 120 }}>
            <Btn title="Accepter" icon="checkmark" size="sm" onPress={onAccept} />
          </View>
        ) : null}
        {onReject ? (
          <View style={{ flex: 1, minWidth: 120 }}>
            <Btn title="Refuser" icon="close" variant="ghost" size="sm" onPress={onReject} />
          </View>
        ) : null}
        {onPickup ? (
          <View style={{ flex: 1, minWidth: 120 }}>
            <Btn title="Marquer récupéré" icon="cube" size="sm" onPress={onPickup} />
          </View>
        ) : null}
        {onDeliver ? (
          <View style={{ flex: 1, minWidth: 120 }}>
            <Btn title="Confirmer livraison" icon="checkmark-done" size="sm" onPress={onDeliver} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 120 }}>
          <Btn title="Contacter" icon="chatbubble-ellipses" variant="secondary" size="sm" onPress={onContact} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  tabs: {
    flexDirection: "row",
    padding: 4,
    margin: spacing.xl,
    marginBottom: 0,
    backgroundColor: colors.surface,
    borderRadius: 999,
    ...shadow.soft,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 999,
  },
  tabBtnActive: { backgroundColor: colors.midnight },
  card: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, ...shadow.card },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rowDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  empty: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
});
