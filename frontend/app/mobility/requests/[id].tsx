// Détail d'une demande de trajet
// - Vue passager : ses offres reçues avec accept/refuse
// - Vue conducteur : bouton "Proposer ce trajet" → modal (choisir trajet ou inline)

import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator, Alert, Modal, TextInput, Image } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { rideRequestsApi, RideRequest, RideOffer, formatDateShort, formatDateTime, offerStatusColor, offerStatusLabel, relativeTime, requestStatusColor, requestStatusLabel } from "@/src/mobility/rideRequests";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

export default function RequestDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [req, setReq] = useState<RideRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await rideRequestsApi.get(id);
      setReq(d);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Demande introuvable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOwner = !!(user && req && user.id === req.passenger_id);
  const canOffer = !!(user && req && user.id !== req.passenger_id && (req.status === "open" || req.status === "matched"));

  const decide = (offerId: string, action: "accept" | "refuse") => {
    Alert.alert(
      action === "accept" ? "Accepter cette offre ?" : "Refuser cette offre ?",
      action === "accept" ? "Le conducteur sera notifié et les autres offres seront automatiquement retirées." : "",
      [
        { text: "Retour", style: "cancel" },
        {
          text: action === "accept" ? "Accepter" : "Refuser",
          style: action === "accept" ? "default" : "destructive",
          onPress: async () => {
            try {
              await rideRequestsApi.decideOffer(offerId, action);
              load();
            } catch (e: any) {
              Alert.alert("Erreur", e?.message || "Action refusée.");
            }
          },
        },
      ]
    );
  };

  if (!id) return null;
  if (loading) return (
    <SafeAreaView style={styles.centerScreen}>
      <ActivityIndicator color={colors.turquoise} />
    </SafeAreaView>
  );
  if (!req) return null;

  const c = requestStatusColor(req.status);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, marginLeft: 8 }}>Demande de trajet</Txt>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />}
      >
        {/* Passager */}
        <View style={styles.passenger}>
          {req.passenger_avatar ? (
            <Image source={{ uri: req.passenger_avatar }} style={styles.avatarLg} />
          ) : (
            <View style={styles.avatarLg}><Ionicons name="person" size={22} color={colors.turquoise} /></View>
          )}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt size="sm" weight="800">{req.passenger_name || "Passager"}</Txt>
            <Txt size="xxs" color={colors.textMuted}>publié {relativeTime(req.created_at)}</Txt>
          </View>
          <View style={[styles.badge, { backgroundColor: c.bg }]}>
            <Txt size="xxs" weight="700" color={c.fg}>{requestStatusLabel(req.status)}</Txt>
          </View>
        </View>

        {/* Route */}
        <View style={styles.card}>
          <View style={styles.routeRow}>
            <View style={styles.routeDot}><View style={styles.routeDotInner} /></View>
            <View style={{ flex: 1 }}>
              <Txt size="lg" weight="800">{req.from_city}</Txt>
              {req.from_address ? <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>{req.from_address}</Txt> : null}
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: "#F97316" }]}><Ionicons name="location" size={11} color={colors.white} /></View>
            <View style={{ flex: 1 }}>
              <Txt size="lg" weight="800">{req.to_city}</Txt>
              {req.to_address ? <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>{req.to_address}</Txt> : null}
            </View>
          </View>
        </View>

        {/* Meta */}
        <View style={styles.card}>
          <InfoRow icon="calendar" label="Date" value={formatDateShort(req.date)} />
          <InfoRow icon="time" label="Horaire" value={`${req.time_from}${req.time_to ? ` – ${req.time_to}` : ""}`} />
          <InfoRow icon="people" label="Passagers" value={`${req.seats}`} />
          {req.budget_xof ? <InfoRow icon="cash" label="Budget max" value={`${req.budget_xof.toLocaleString("fr-FR")} F CFA`} /> : null}
          <InfoRow icon="hourglass" label="Expire" value={formatDateTime(req.expires_at)} last />
        </View>

        {req.notes ? (
          <View style={styles.card}>
            <Txt size="xxs" weight="700" color={colors.textMuted} style={{ letterSpacing: 1, marginBottom: 4 }}>COMMENTAIRE</Txt>
            <Txt size="sm">{req.notes}</Txt>
          </View>
        ) : null}

        {/* Offres */}
        {req.offers && req.offers.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Txt size="lg" weight="800">Offres reçues ({req.offers.length})</Txt>
            </View>
            {req.offers.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                canDecide={isOwner && o.status === "pending"}
                onDecide={(action) => decide(o.id, action)}
              />
            ))}
          </>
        ) : isOwner ? (
          <View style={styles.emptyOffers}>
            <Ionicons name="hourglass" size={32} color={colors.textMuted} />
            <Txt weight="700" style={{ marginTop: 10 }}>En attente d&apos;offres</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
              Nous notifions les conducteurs sur cet axe. Vous recevrez une notification dès qu&apos;une offre arrive.
            </Txt>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky CTA — conducteur : Proposer ce trajet */}
      {canOffer ? (
        <View style={[styles.stickyBar, { paddingBottom: 12 + insets.bottom }]}>
          <Btn
            title="Proposer ce trajet"
            onPress={() => setShowOfferModal(true)}
            variant="primary"
            fullWidth
            icon="paper-plane"
            testID="req-detail-propose"
          />
        </View>
      ) : null}

      <OfferModal
        visible={showOfferModal}
        request={req}
        onClose={() => setShowOfferModal(false)}
        onSuccess={() => { setShowOfferModal(false); load(); }}
      />
    </View>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────

function OfferCard({ offer, canDecide, onDecide }: { offer: RideOffer; canDecide: boolean; onDecide: (action: "accept" | "refuse") => void }) {
  const c = offerStatusColor(offer.status);
  return (
    <View style={styles.offerCard}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {offer.driver_avatar ? (
          <Image source={{ uri: offer.driver_avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}><Ionicons name="person" size={16} color={colors.turquoise} /></View>
        )}
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Txt size="sm" weight="800">{offer.driver_name || "Conducteur"}</Txt>
            {offer.driver_verified ? <Ionicons name="checkmark-circle" size={12} color={colors.turquoise} /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            {offer.driver_rating != null ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="star" size={11} color="#F59E0B" />
                <Txt size="xxs" style={{ marginLeft: 2 }}>{offer.driver_rating.toFixed(1)}</Txt>
              </View>
            ) : null}
            <Txt size="xxs" color={colors.textMuted}>{offer.driver_completed_rides ?? 0} trajet{(offer.driver_completed_rides ?? 0) > 1 ? "s" : ""}</Txt>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt size="md" weight="800" style={{ fontVariant: ["tabular-nums"] as any }}>{offer.price_xof.toLocaleString("fr-FR")} F</Txt>
          <View style={[styles.badge, { backgroundColor: c.bg, marginTop: 4 }]}>
            <Txt size="xxs" weight="700" color={c.fg}>{offerStatusLabel(offer.status)}</Txt>
          </View>
        </View>
      </View>

      {offer.ride_summary ? (
        <View style={styles.rideSummary}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {offer.ride_summary.vehicle_model ? <Chip icon="car" label={offer.ride_summary.vehicle_model} /> : null}
            {offer.ride_summary.time ? <Chip icon="time" label={offer.ride_summary.time} /> : null}
            {offer.ride_summary.seats_available ? <Chip icon="people" label={`${offer.ride_summary.seats_available} places`} /> : null}
            {offer.ride_summary.verified ? <Chip icon="shield-checkmark" label="Vérifié Jokoo" tint="#7C3AED" /> : null}
          </View>
        </View>
      ) : null}

      {offer.message ? (
        <View style={styles.msgBox}>
          <Txt size="xs" color={colors.textSecondary}>&quot;{offer.message}&quot;</Txt>
        </View>
      ) : null}

      {canDecide ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Pressable onPress={() => onDecide("refuse")} style={[styles.decideBtn, { backgroundColor: "#FEE2E2", flex: 1 }]} testID={`offer-refuse-${offer.id.slice(0, 8)}`}>
            <Ionicons name="close-circle" size={14} color="#DC2626" />
            <Txt size="xs" weight="700" color="#DC2626" style={{ marginLeft: 6 }}>Refuser</Txt>
          </Pressable>
          <Pressable onPress={() => onDecide("accept")} style={[styles.decideBtn, { backgroundColor: colors.turquoise, flex: 1 }]} testID={`offer-accept-${offer.id.slice(0, 8)}`}>
            <Ionicons name="checkmark-circle" size={14} color={colors.white} />
            <Txt size="xs" weight="700" color={colors.white} style={{ marginLeft: 6 }}>Accepter</Txt>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ icon, label, tint }: { icon: any; label: string; tint?: string }) {
  return (
    <View style={[styles.chip, tint ? { backgroundColor: `${tint}18` } : null]}>
      <Ionicons name={icon} size={11} color={tint || colors.textMuted} />
      <Txt size="xxs" color={tint || colors.textSecondary} weight="600" style={{ marginLeft: 4 }}>{label}</Txt>
    </View>
  );
}

function InfoRow({ icon, label, value, last }: { icon: any; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Txt size="xs" color={colors.textMuted} style={{ width: 100, marginLeft: 8 }}>{label}</Txt>
      <Txt size="sm" weight="700" style={{ flex: 1 }}>{value}</Txt>
    </View>
  );
}

// ─── Offer modal (driver side) ───────────────────────────────────

function OfferModal({ visible, request, onClose, onSuccess }: { visible: boolean; request: RideRequest; onClose: () => void; onSuccess: () => void }) {
  const [tab, setTab] = useState<"existing" | "inline">("inline");
  const [rides, setRides] = useState<any[]>([]);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [price, setPrice] = useState(request.budget_xof ? String(request.budget_xof) : "");
  const [message, setMessage] = useState("");
  // Inline fields
  const [time, setTime] = useState(request.time_from);
  const [seats, setSeats] = useState(String(request.seats));
  const [vehicle, setVehicle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Load current user's rides for existing-mode selector
    api.get<any[]>("/rides/mine").then((r) => setRides(r || [])).catch(() => setRides([]));
  }, [visible]);

  const submit = async () => {
    const p = parseInt(price.replace(/\s/g, ""), 10);
    if (!Number.isFinite(p) || p < 0) {
      Alert.alert("Prix invalide", "Merci de saisir un prix en F CFA (>= 0).");
      return;
    }
    setBusy(true);
    try {
      if (tab === "existing" && selectedRideId) {
        await rideRequestsApi.createOffer(request.id, {
          ride_id: selectedRideId,
          price_xof: p,
          message: message.trim() || undefined,
        });
      } else {
        await rideRequestsApi.createOffer(request.id, {
          price_xof: p,
          message: message.trim() || undefined,
          from_city: request.from_city,
          to_city: request.to_city,
          date: request.date,
          time: time.trim() || request.time_from,
          seats_available: parseInt(seats, 10) || 1,
          vehicle_model: vehicle.trim() || undefined,
        });
      }
      Alert.alert("Offre envoyée", "Le passager a été notifié.");
      onSuccess();
    } catch (e: any) {
      Alert.alert("Envoi impossible", e?.message || "Merci de réessayer.");
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Txt size="xl" weight="800">Proposer ce trajet</Txt>
          <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
            {request.from_city} → {request.to_city} · {formatDateShort(request.date)} · {request.seats} pass.
          </Txt>

          {/* Tabs */}
          <View style={styles.modalTabs}>
            <Pressable onPress={() => setTab("inline")} style={[styles.modalTab, tab === "inline" && styles.modalTabActive]} testID="offer-tab-inline">
              <Txt size="xs" weight="700" color={tab === "inline" ? colors.midnight : colors.textMuted}>Proposer directement</Txt>
            </Pressable>
            <Pressable onPress={() => setTab("existing")} style={[styles.modalTab, tab === "existing" && styles.modalTabActive]} testID="offer-tab-existing">
              <Txt size="xs" weight="700" color={tab === "existing" ? colors.midnight : colors.textMuted}>
                Trajet publié ({rides.length})
              </Txt>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {tab === "inline" ? (
              <>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Txt size="xxs" weight="700" color={colors.textMuted} style={{ marginTop: 12 }}>HEURE DE DÉPART</Txt>
                    <TextInput value={time} onChangeText={setTime} placeholder="08:00" placeholderTextColor={colors.textSubtle} style={styles.input} testID="offer-inline-time" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt size="xxs" weight="700" color={colors.textMuted} style={{ marginTop: 12 }}>PLACES DISPO</Txt>
                    <TextInput value={seats} onChangeText={(v) => setSeats(v.replace(/[^\d]/g, ""))} keyboardType="numeric" placeholder="2" placeholderTextColor={colors.textSubtle} style={styles.input} />
                  </View>
                </View>
                <Txt size="xxs" weight="700" color={colors.textMuted} style={{ marginTop: 12 }}>VÉHICULE (OPTIONNEL)</Txt>
                <TextInput value={vehicle} onChangeText={setVehicle} placeholder="Toyota Corolla blanche" placeholderTextColor={colors.textSubtle} style={styles.input} />
              </>
            ) : (
              <>
                {rides.length === 0 ? (
                  <Txt size="sm" color={colors.textMuted} style={{ marginTop: 12, textAlign: "center" }}>
                    Aucun trajet publié. Utilisez l&apos;onglet &quot;Proposer directement&quot;.
                  </Txt>
                ) : (
                  <View style={{ marginTop: 8, gap: 6 }}>
                    {rides.slice(0, 10).map((r) => (
                      <Pressable
                        key={r.id}
                        onPress={() => setSelectedRideId(r.id)}
                        style={[styles.rideOpt, selectedRideId === r.id && styles.rideOptActive]}
                        testID={`offer-ride-${r.id.slice(0, 8)}`}
                      >
                        <View style={{ flex: 1 }}>
                          <Txt size="sm" weight="700" numberOfLines={1}>{r.from_city} → {r.to_city}</Txt>
                          <Txt size="xxs" color={colors.textMuted}>{formatDateShort(r.date)} · {r.time} · {r.seats_available}/{r.seats_total} places</Txt>
                        </View>
                        {selectedRideId === r.id ? <Ionicons name="checkmark-circle" size={18} color={colors.turquoise} /> : null}
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            <Txt size="xxs" weight="700" color={colors.textMuted} style={{ marginTop: 16 }}>PRIX PROPOSÉ (F CFA)</Txt>
            <TextInput
              value={price}
              onChangeText={(v) => setPrice(v.replace(/[^\d]/g, ""))}
              keyboardType="numeric"
              placeholder={request.budget_xof ? String(request.budget_xof) : "3000"}
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
              testID="offer-price"
            />
            {request.budget_xof ? (
              <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 4 }}>
                Budget max du passager : {request.budget_xof.toLocaleString("fr-FR")} F CFA
              </Txt>
            ) : null}

            <Txt size="xxs" weight="700" color={colors.textMuted} style={{ marginTop: 12 }}>MESSAGE (OPTIONNEL)</Txt>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Ex : Je passe par le Plateau vers 8h30…"
              placeholderTextColor={colors.textSubtle}
              multiline
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" as any }]}
              testID="offer-message"
            />
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.surface2, flex: 1 }]}>
              <Txt weight="700">Annuler</Txt>
            </Pressable>
            <Btn title="Envoyer l'offre" onPress={submit} loading={busy} variant="primary" testID="offer-submit" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  passenger: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow.soft },
  avatarLg: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  routeDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  routeDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: 8, marginLeft: 34 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  sectionHeader: { marginTop: spacing.md, marginBottom: 6 },
  offerCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft, gap: 8 },
  rideSummary: { paddingVertical: 6 },
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surface2 },
  msgBox: { padding: 8, borderRadius: radius.md, backgroundColor: colors.surface2 },
  decideBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, height: 40, borderRadius: 999 },
  emptyOffers: { padding: spacing.xl, alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "88%" },
  modalHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 12 },
  modalTabs: { flexDirection: "row", gap: 6, marginTop: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTab: { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 2, borderBottomColor: "transparent" },
  modalTabActive: { borderBottomColor: colors.turquoise },
  input: { marginTop: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.midnight, backgroundColor: colors.surface },
  rideOpt: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rideOptActive: { borderColor: colors.turquoise, backgroundColor: colors.brandTertiary },
  modalBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, height: 46, borderRadius: 999 },
});
