// Détail d'une réservation — visible par le client ET le prestataire.
// Permet à chaque partie de confirmer la fin de mission (double confirmation).
// Une fois les deux parties d'accord, l'écran propose au client de laisser un avis.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { formatXof } from "@/src/pricing";
import { Btn, Card, Txt } from "@/src/components/ui";
import { ConfirmDialog } from "@/src/components/ActionSheet";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Booking = {
  id: string;
  client_id: string;
  client_name: string;
  provider_id: string;
  provider_name: string;
  service_key?: string;
  date: string;
  time: string;
  address?: string;
  description?: string;
  price?: number;
  status: "pending" | "accepted" | "rejected" | "completed" | "cancelled";
  client_confirmed_at?: string | null;
  provider_confirmed_at?: string | null;
  completed_at?: string | null;
  paid?: boolean;
  review_id?: string | null;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending:   { label: "En attente",  color: "#D97706", bg: "#FEF3C7", icon: "hourglass" },
  accepted:  { label: "Acceptée",    color: "#0EA5E9", bg: "#E0F2FE", icon: "checkmark-circle" },
  rejected:  { label: "Refusée",     color: "#DC2626", bg: "#FEE2E2", icon: "close-circle" },
  completed: { label: "Terminée",    color: "#16A34A", bg: "#DCFCE7", icon: "trophy" },
  cancelled: { label: "Annulée",     color: "#6B7280", bg: "#F3F4F6", icon: "close" },
};

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [b, setB] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.get<Booking>(`/bookings/${id}`);
      setB(r);
    } catch { setB(null); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!b) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}>
        <Txt color={colors.textMuted}>Chargement…</Txt>
      </View>
    );
  }

  const isClient = user?.id === b.client_id;
  const isProvider = user?.id === b.provider_id;
  const meta = STATUS_META[b.status] || STATUS_META.pending;
  const myConfirmedAt = isClient ? b.client_confirmed_at : b.provider_confirmed_at;
  const peerConfirmedAt = isClient ? b.provider_confirmed_at : b.client_confirmed_at;
  const canConfirm = (b.status === "accepted" || b.status === "completed") && !myConfirmedAt;
  const canLeaveReview = isClient && b.status === "completed" && !b.review_id;

  const doConfirm = async () => {
    setBusy(true);
    try {
      await api.post(`/bookings/${b.id}/confirm-completion`, {});
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={22} color={colors.midnight} /></Pressable>
        <Txt size="lg" weight="700">Réservation</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom, gap: spacing.md }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Txt weight="700" size="lg">{isClient ? b.provider_name : b.client_name}</Txt>
            <View style={[styles.pill, { backgroundColor: meta.bg, flexDirection: "row", alignItems: "center" }]}>
              <Ionicons name={meta.icon} size={12} color={meta.color} />
              <Txt size="xxs" weight="700" color={meta.color} style={{ marginLeft: 4 }}>{meta.label}</Txt>
            </View>
          </View>
          <Row icon="calendar-outline"  label="Date"        value={`${b.date} · ${b.time}`} />
          {b.service_key ? <Row icon="briefcase-outline" label="Prestation" value={b.service_key} /> : null}
          {b.address ? <Row icon="location-outline"  label="Adresse"     value={b.address} /> : null}
          {b.description ? <Row icon="document-text-outline" label="Description" value={b.description} /> : null}
          {b.price ? <Row icon="cash-outline"      label="Montant"     value={formatXof(b.price)} /> : null}
        </Card>

        {(b.client_confirmed_at || b.provider_confirmed_at) ? (
          <Card>
            <Txt weight="700" style={{ marginBottom: 8 }}>Confirmations de fin de mission</Txt>
            <Row icon={b.client_confirmed_at ? "checkmark-circle" : "ellipse-outline"}
                 label="Client"
                 value={b.client_confirmed_at ? new Date(b.client_confirmed_at).toLocaleString("fr-FR") : "En attente"}
                 tint={b.client_confirmed_at ? colors.success : colors.textMuted} />
            <Row icon={b.provider_confirmed_at ? "checkmark-circle" : "ellipse-outline"}
                 label="Prestataire"
                 value={b.provider_confirmed_at ? new Date(b.provider_confirmed_at).toLocaleString("fr-FR") : "En attente"}
                 tint={b.provider_confirmed_at ? colors.success : colors.textMuted} />
          </Card>
        ) : null}

        {canConfirm ? (
          <Card>
            <Txt weight="700">Confirmez la fin de mission</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
              {peerConfirmedAt
                ? "L'autre partie a déjà confirmé. Votre confirmation clôture la mission."
                : "Une fois confirmée par les deux parties, la mission sera clôturée."}
            </Txt>
            <Btn
              title="Confirmer la fin de mission"
              icon="checkmark-done"
              onPress={() => setConfirming(true)}
              loading={busy}
              fullWidth
              size="lg"
              style={{ marginTop: 12 }}
              testID="confirm-completion-btn"
            />
          </Card>
        ) : null}

        {canLeaveReview ? (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="star" size={22} color="#F59E0B" />
              <Txt weight="700" style={{ marginLeft: 8 }}>Laissez un avis</Txt>
            </View>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
              Aidez la communauté en notant votre expérience avec {b.provider_name}.
            </Txt>
            <Btn
              title="Noter le prestataire"
              icon="star"
              onPress={() => router.push(`/booking/review/${b.id}` as any)}
              fullWidth
              size="lg"
              style={{ marginTop: 12 }}
              testID="leave-review-btn"
            />
          </Card>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirming}
        title="Confirmer la fin de mission ?"
        message={peerConfirmedAt
          ? "L'autre partie a déjà confirmé — votre validation clôturera définitivement la mission."
          : "L'autre partie sera notifiée. Ne confirmez que si le service a bien été rendu."}
        confirmLabel="Oui, confirmer"
        onConfirm={doConfirm}
        onClose={() => setConfirming(false)}
      />
    </View>
  );
}

function Row({ icon, label, value, tint }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 }}>
      <Ionicons name={icon} size={16} color={tint || colors.turquoise} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt size="xxs" color={colors.textMuted}>{label}</Txt>
        <Txt size="sm" weight="600" style={{ marginTop: 1 }}>{value}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
});
