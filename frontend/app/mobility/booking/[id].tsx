// Paiement d'une réservation covoiturage (marketplace v2)
// Choix : Wallet Jokoo, Wave, Orange Money, Espèces (carte bancaire à venir).
// Backend : POST /api/mobility/bookings/{id}/pay

import React, { useCallback, useState } from "react";
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Image, Modal } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { formatDateShort } from "@/src/mobility/rideRequests";
import { api } from "@/src/api";

type Method = "wallet" | "cash" | "wave" | "orange_money" | "stripe";

interface BookingBundle {
  booking: any;
  request?: any;
  offer?: any;
  ride?: any;
  driver?: { id: string; name?: string; avatar?: string; phone?: string; rating?: number };
}

const METHODS: {
  key: Method;
  label: string;
  hint: string;
  icon: any;
  tint: string;
  disabled?: boolean;
  disabledHint?: string;
}[] = [
  { key: "wallet", label: "Wallet Jokoo", hint: "Solde disponible instantané", icon: "wallet", tint: "#00C2A8" },
  { key: "cash", label: "Espèces", hint: "À régler au conducteur au départ", icon: "cash", tint: "#0EA5E9" },
  {
    key: "wave", label: "Wave", hint: "Bientôt disponible", icon: "phone-portrait",
    tint: "#7C3AED", disabled: true, disabledHint: "Activation en cours",
  },
  {
    key: "orange_money", label: "Orange Money", hint: "Bientôt disponible", icon: "phone-portrait",
    tint: "#F97316", disabled: true, disabledHint: "Activation en cours",
  },
  {
    key: "stripe", label: "Carte bancaire", hint: "Visa · Mastercard · Amex", icon: "card",
    tint: "#1E3A8A", disabled: true, disabledHint: "Activation en cours",
  },
];

export default function RideBookingPayment() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<BookingBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<Method | null>(null);
  const [confirmModal, setConfirmModal] = useState<Method | null>(null);
  const [busy, setBusy] = useState(false);
  const [successModal, setSuccessModal] = useState<{ title: string; message: string } | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.get<BookingBundle>(`/mobility/bookings/${id}`);
      setData(r);
    } catch (e: any) {
      setErrorModal(e?.message || "Réservation introuvable");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!confirmModal || !id) return;
    setBusy(true);
    try {
      const r = await api.post<{ status: string; booking: any }>(`/mobility/bookings/${id}/pay`, { method: confirmModal });
      setConfirmModal(null);
      if (r.status === "already_paid") {
        setSuccessModal({ title: "Déjà réglée", message: "Cette réservation a déjà été payée." });
      } else if (confirmModal === "cash") {
        setSuccessModal({
          title: "Réservation confirmée",
          message: "Vous réglerez en espèces au conducteur au départ. Bonne route !",
        });
      } else if (confirmModal === "wallet") {
        setSuccessModal({
          title: "Paiement effectué",
          message: "Votre wallet Jokoo a été débité. Bonne route !",
        });
      } else {
        setSuccessModal({ title: "Paiement envoyé", message: "Vous serez notifié à la confirmation." });
      }
      load();
    } catch (e: any) {
      setConfirmModal(null);
      setErrorModal(e?.message || "Échec du paiement.");
    } finally {
      setBusy(false);
    }
  };

  const b = data?.booking;
  const req = data?.request;
  const driver = data?.driver;
  const alreadyPaid = !!b?.paid;
  const isCash = b?.payment_method === "cash";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, marginLeft: 8 }}>Paiement du trajet</Txt>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom, gap: spacing.md }}>
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.turquoise} />
          </View>
        ) : b ? (
          <>
            {/* Hero — trajet */}
            <View style={styles.hero}>
              <LinearGradient colors={["#0B1F3A", "#123058"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <View style={{ padding: spacing.xl }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Txt size="xxs" weight="600" color="rgba(255,255,255,0.7)" style={{ letterSpacing: 1.5 }}>
                    RÉSERVATION #{String(b.id).slice(0, 8).toUpperCase()}
                  </Txt>
                  {alreadyPaid ? (
                    <View style={styles.paidBadge}>
                      <Ionicons name="checkmark-circle" size={12} color="#1F7A3F" />
                      <Txt size="xxs" weight="700" color="#1F7A3F" style={{ marginLeft: 4 }}>
                        {isCash ? "Confirmée" : "Payée"}
                      </Txt>
                    </View>
                  ) : null}
                </View>
                <Txt size="hero" weight="800" color={colors.white} style={{ marginTop: 8, fontVariant: ["tabular-nums"] as any }}>
                  {Number(b.price_xof || 0).toLocaleString("fr-FR")} F CFA
                </Txt>
                <Txt size="xs" color="rgba(255,255,255,0.75)" style={{ marginTop: 4 }}>
                  {b.seats || 1} place{(b.seats || 1) > 1 ? "s" : ""} · commissions Jokoo incluses
                </Txt>
                {req ? (
                  <View style={styles.routeChips}>
                    <Ionicons name="location" size={12} color="rgba(255,255,255,0.7)" />
                    <Txt size="xs" color="rgba(255,255,255,0.85)" style={{ marginLeft: 4 }}>
                      {req.from_city} → {req.to_city}
                    </Txt>
                    <Txt size="xs" color="rgba(255,255,255,0.5)" style={{ marginHorizontal: 6 }}>·</Txt>
                    <Ionicons name="calendar" size={12} color="rgba(255,255,255,0.7)" />
                    <Txt size="xs" color="rgba(255,255,255,0.85)" style={{ marginLeft: 4 }}>
                      {formatDateShort(req.date)} · {req.time_from}
                    </Txt>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Driver */}
            {driver ? (
              <View style={styles.card}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {driver.avatar ? (
                    <Image source={{ uri: driver.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatar}><Ionicons name="person" size={20} color={colors.turquoise} /></View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Txt size="xxs" weight="700" color={colors.textMuted} style={{ letterSpacing: 1 }}>VOTRE CONDUCTEUR</Txt>
                    <Txt size="md" weight="800" style={{ marginTop: 2 }}>{driver.name || "Conducteur"}</Txt>
                    {driver.rating != null ? (
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="star" size={11} color="#F59E0B" />
                        <Txt size="xxs" weight="700" style={{ marginLeft: 3 }}>{driver.rating.toFixed(1)}</Txt>
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => router.push({ pathname: "/chat/[id]", params: { id: driver.id } })}
                    style={styles.chatBtn}
                    testID="ride-pay-chat"
                  >
                    <Ionicons name="chatbubble-ellipses" size={16} color={colors.white} />
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Payment options */}
            {alreadyPaid ? (
              <View style={styles.paidCard}>
                <View style={styles.paidIcon}>
                  <Ionicons name="checkmark-circle" size={30} color="#1F7A3F" />
                </View>
                <Txt size="lg" weight="800" style={{ marginTop: 10 }}>
                  {isCash ? "Paiement en espèces confirmé" : "Paiement effectué"}
                </Txt>
                <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
                  {isCash
                    ? "Réglez le conducteur en espèces au moment du départ."
                    : "Merci ! Votre paiement a été traité avec succès."}
                </Txt>
              </View>
            ) : (
              <>
                <Txt size="lg" weight="700" style={{ marginTop: spacing.md }}>Choisissez un mode de paiement</Txt>
                {METHODS.map((m) => (
                  <Pressable
                    key={m.key}
                    onPress={() => !m.disabled && setSelectedMethod(m.key)}
                    style={[
                      styles.methodCard,
                      selectedMethod === m.key && styles.methodCardActive,
                      m.disabled && { opacity: 0.5 },
                    ]}
                    disabled={m.disabled}
                    testID={`pay-method-${m.key}`}
                  >
                    <View style={[styles.methodIcon, { backgroundColor: `${m.tint}18` }]}>
                      <Ionicons name={m.icon} size={22} color={m.tint} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Txt size="sm" weight="800">{m.label}</Txt>
                        {m.disabled ? (
                          <View style={styles.soonBadge}>
                            <Txt size="xxs" weight="700" color="#B47F00">Bientôt</Txt>
                          </View>
                        ) : null}
                      </View>
                      <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                        {m.disabled && m.disabledHint ? m.disabledHint : m.hint}
                      </Txt>
                    </View>
                    <View style={[styles.radio, selectedMethod === m.key && styles.radioActive]}>
                      {selectedMethod === m.key ? <View style={styles.radioInner} /> : null}
                    </View>
                  </Pressable>
                ))}
              </>
            )}
          </>
        ) : (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={40} color={colors.danger} />
            <Txt weight="700" style={{ marginTop: 10 }}>Réservation introuvable</Txt>
          </View>
        )}
      </ScrollView>

      {/* Sticky pay CTA */}
      {!alreadyPaid && b && selectedMethod ? (
        <View style={[styles.stickyBar, { paddingBottom: 12 + insets.bottom }]}>
          <Pressable
            onPress={() => setConfirmModal(selectedMethod)}
            style={styles.payBtn}
            testID="ride-pay-continue"
          >
            <Txt weight="800" color={colors.white} size="md">
              {selectedMethod === "cash" ? "Confirmer le paiement en espèces" : `Payer ${Number(b.price_xof || 0).toLocaleString("fr-FR")} F CFA`}
            </Txt>
            <Ionicons name="arrow-forward" size={18} color={colors.white} style={{ marginLeft: 8 }} />
          </Pressable>
        </View>
      ) : null}

      {/* Confirmation modal */}
      <Modal visible={!!confirmModal} transparent animationType="fade" onRequestClose={() => setConfirmModal(null)}>
        <View style={styles.modalCenter}>
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons
                name={confirmModal === "wallet" ? "wallet" : confirmModal === "cash" ? "cash" : "card"}
                size={30}
                color={colors.turquoise}
              />
            </View>
            <Txt size="xl" weight="800" style={{ marginTop: 12, textAlign: "center" }}>
              {confirmModal === "cash" ? "Confirmer le paiement en espèces ?" : "Confirmer le paiement ?"}
            </Txt>
            <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center", lineHeight: 20 }}>
              {confirmModal === "wallet"
                ? `${Number(b?.price_xof || 0).toLocaleString("fr-FR")} F CFA seront débités de votre wallet Jokoo.`
                : confirmModal === "cash"
                ? `Vous réglerez ${Number(b?.price_xof || 0).toLocaleString("fr-FR")} F CFA au conducteur en espèces au moment du départ.`
                : "Confirmation nécessaire."}
            </Txt>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.lg, width: "100%" }}>
              <Pressable onPress={() => setConfirmModal(null)} style={[styles.confirmBtn, { backgroundColor: colors.surface2, flex: 1 }]}>
                <Txt weight="700">Retour</Txt>
              </Pressable>
              <Pressable onPress={submit} disabled={busy} style={[styles.confirmBtn, { flex: 1.4, backgroundColor: colors.turquoise }]} testID="ride-pay-confirm">
                {busy ? <ActivityIndicator size="small" color={colors.white} /> : (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color={colors.white} />
                    <Txt weight="800" color={colors.white} style={{ marginLeft: 6 }}>Confirmer</Txt>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success modal */}
      <Modal visible={!!successModal} transparent animationType="fade" onRequestClose={() => setSuccessModal(null)}>
        <View style={styles.modalCenter}>
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, { backgroundColor: "#E9F9EF" }]}>
              <Ionicons name="checkmark-circle" size={36} color="#1F7A3F" />
            </View>
            <Txt size="xl" weight="800" style={{ marginTop: 12, textAlign: "center" }}>{successModal?.title}</Txt>
            <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center", lineHeight: 20 }}>
              {successModal?.message}
            </Txt>
            <Pressable
              onPress={() => { setSuccessModal(null); router.replace("/mobility"); }}
              style={[styles.confirmBtn, { backgroundColor: colors.turquoise, marginTop: spacing.lg, width: "100%" }]}
            >
              <Ionicons name="home" size={16} color={colors.white} />
              <Txt weight="800" color={colors.white} style={{ marginLeft: 6 }}>Retour à l&apos;accueil</Txt>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Error modal */}
      <Modal visible={!!errorModal} transparent animationType="fade" onRequestClose={() => setErrorModal(null)}>
        <View style={styles.modalCenter}>
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="alert-circle" size={36} color="#DC2626" />
            </View>
            <Txt size="xl" weight="800" style={{ marginTop: 12, textAlign: "center" }}>Paiement impossible</Txt>
            <Txt size="sm" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center", lineHeight: 20 }}>
              {errorModal}
            </Txt>
            <Pressable
              onPress={() => setErrorModal(null)}
              style={[styles.confirmBtn, { backgroundColor: colors.turquoise, marginTop: spacing.lg, width: "100%" }]}
            >
              <Txt weight="800" color={colors.white}>Compris</Txt>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  hero: { borderRadius: radius.xl, overflow: "hidden", ...shadow.card },
  paidBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  routeChips: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 14, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", alignSelf: "flex-start" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  chatBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  methodCard: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, ...shadow.soft },
  methodCardActive: { borderColor: colors.turquoise, backgroundColor: colors.brandTertiary },
  methodIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  soonBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.turquoise },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.turquoise },
  paidCard: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft, marginTop: spacing.md },
  paidIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#E9F9EF", alignItems: "center", justifyContent: "center" },
  errorCard: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft, marginTop: spacing.md },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 52, borderRadius: 999, backgroundColor: colors.turquoise, paddingHorizontal: 16 },
  modalCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  confirmCard: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: 20, padding: 24, alignItems: "center", ...shadow.card },
  confirmIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, height: 48, borderRadius: 999 },
});
