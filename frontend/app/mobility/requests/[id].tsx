// Détail d'une demande de trajet — Marketplace Covoiturage v2
// - Passager (owner) : vue COMPARAISON PREMIUM avec sort + badges (meilleur prix / meilleure note / vérifié).
//   Actions : Accepter / Refuser / Poser une question (→ chat).
//   Après acceptation → booking auto-créé, redirection vers écran de paiement.
// - Conducteur : bouton "Proposer ce trajet" → modal (inline ou trajet publié).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import {
  rideRequestsApi,
  RideRequest,
  RideOffer,
  formatDateShort,
  formatDateTime,
  offerStatusColor,
  offerStatusLabel,
  relativeTime,
  requestStatusColor,
  requestStatusLabel,
} from "@/src/mobility/rideRequests";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

type SortMode = "recent" | "price" | "rating" | "trips";

export default function RequestDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [req, setReq] = useState<RideRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [sort, setSort] = useState<SortMode>("recent");
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);

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
  const canOffer = !!(
    user && req && user.id !== req.passenger_id && (req.status === "open" || req.status === "matched")
  );

  // ─── Best-offer computation ──────────────────────────────
  const { sortedOffers, bestPriceId, bestRatingId, bestTripsId } = useMemo(() => {
    const offers = req?.offers || [];
    if (offers.length === 0) return { sortedOffers: [], bestPriceId: null, bestRatingId: null, bestTripsId: null };
    const pending = offers.filter(o => o.status === "pending");
    const others = offers.filter(o => o.status !== "pending");
    const source = pending.length > 0 ? pending : offers;
    // Determine best-per-criterion across pending offers only
    let bp = source[0], br: RideOffer | null = null, bt: RideOffer | null = null;
    for (const o of source) {
      if (o.price_xof < bp.price_xof) bp = o;
      if (o.driver_rating != null && (br === null || (o.driver_rating || 0) > (br.driver_rating || 0))) br = o;
      const t = o.driver_completed_rides || 0;
      if (bt === null || t > (bt.driver_completed_rides || 0)) bt = t > 0 ? o : bt;
    }
    // Sort based on user selection
    const sortFn: Record<SortMode, (a: RideOffer, b: RideOffer) => number> = {
      recent: (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      price: (a, b) => a.price_xof - b.price_xof,
      rating: (a, b) => (b.driver_rating || 0) - (a.driver_rating || 0),
      trips: (a, b) => (b.driver_completed_rides || 0) - (a.driver_completed_rides || 0),
    };
    const sortedPending = [...pending].sort(sortFn[sort]);
    const combined = [...sortedPending, ...others];
    return {
      sortedOffers: combined,
      bestPriceId: bp?.id || null,
      bestRatingId: br?.id || null,
      bestTripsId: bt?.id || null,
    };
  }, [req?.offers, sort]);

  const pendingCount = sortedOffers.filter(o => o.status === "pending").length;

  // ─── Decision handler ───────────────────────────────────
  const decide = (offerId: string, action: "accept" | "refuse") => {
    Alert.alert(
      action === "accept" ? "Accepter cette offre ?" : "Refuser cette offre ?",
      action === "accept"
        ? "Une réservation sera créée automatiquement. Les autres conducteurs seront informés que la demande a trouvé preneur."
        : "Le conducteur sera informé.",
      [
        { text: "Retour", style: "cancel" },
        {
          text: action === "accept" ? "Accepter" : "Refuser",
          style: action === "accept" ? "default" : "destructive",
          onPress: async () => {
            setBusyOfferId(offerId);
            try {
              const res = await rideRequestsApi.decideOffer(offerId, action);
              if (action === "accept" && res.booking?.id) {
                // Recharge la vue pour afficher l'état "booked" puis propose le paiement
                await load();
                Alert.alert(
                  "Réservation confirmée 🎉",
                  "Votre trajet est réservé. Souhaitez-vous procéder au paiement maintenant ?",
                  [
                    { text: "Plus tard", style: "cancel" },
                    {
                      text: "Payer maintenant",
                      onPress: () => {
                        router.push({
                          pathname: "/booking/detail/[id]",
                          params: { id: res.booking.id },
                        });
                      },
                    },
                  ]
                );
              } else {
                load();
              }
            } catch (e: any) {
              Alert.alert("Erreur", e?.message || "Action refusée.");
            } finally {
              setBusyOfferId(null);
            }
          },
        },
      ]
    );
  };

  const askQuestion = (driverId: string) => {
    // Ouvre la conversation avec le conducteur (route existante /chat/[id])
    router.push({ pathname: "/chat/[id]", params: { id: driverId } });
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
        <Txt size="lg" weight="700" style={{ flex: 1, marginLeft: 8 }}>
          {isOwner ? "Ma demande" : "Demande de trajet"}
        </Txt>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 + insets.bottom, gap: spacing.md }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.turquoise} />
        }
      >
        {/* Passenger */}
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

        {/* Republier si expirée / annulée */}
        {isOwner && (req.status === "expired" || req.status === "cancelled") ? (
          <View style={styles.republishCard}>
            <View style={{ flex: 1 }}>
              <Txt size="sm" weight="800" color={colors.midnight}>
                {req.status === "expired" ? "Cette demande a expiré" : "Demande annulée"}
              </Txt>
              <Txt size="xxs" color={colors.textSecondary} style={{ marginTop: 2 }}>
                Vous pouvez la republier en un clic. Les conducteurs seront à nouveau notifiés.
              </Txt>
            </View>
            <Pressable
              onPress={async () => {
                try {
                  await rideRequestsApi.republish(req.id);
                  load();
                } catch (e: any) {
                  Alert.alert("Erreur", e?.message || "Impossible de republier.");
                }
              }}
              style={styles.republishBtn}
              testID="republish-inline"
            >
              <Ionicons name="refresh" size={16} color={colors.white} />
              <Txt weight="700" color={colors.white} style={{ marginLeft: 6 }}>Republier</Txt>
            </Pressable>
          </View>
        ) : null}

        {/* ─── VUE COMPARAISON PREMIUM (owner + offres présentes) ─── */}
        {isOwner && sortedOffers.length > 0 ? (
          <>
            <View style={styles.compareHeader}>
              <View>
                <Txt size="xl" weight="800">Comparez les offres</Txt>
                <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                  {pendingCount} offre{pendingCount !== 1 ? "s" : ""} en attente · {sortedOffers.length} au total
                </Txt>
              </View>
              {req.status === "booked" ? (
                <View style={[styles.badge, { backgroundColor: "#E9F9EF" }]}>
                  <Ionicons name="checkmark-circle" size={12} color="#1F7A3F" />
                  <Txt size="xxs" weight="700" color="#1F7A3F" style={{ marginLeft: 4 }}>Réservation confirmée</Txt>
                </View>
              ) : null}
            </View>

            {/* Sort chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
              <SortChip label="Récentes" active={sort === "recent"} icon="time" onPress={() => setSort("recent")} />
              <SortChip label="Meilleur prix" active={sort === "price"} icon="cash" onPress={() => setSort("price")} />
              <SortChip label="Meilleure note" active={sort === "rating"} icon="star" onPress={() => setSort("rating")} />
              <SortChip label="Plus expérimentés" active={sort === "trips"} icon="ribbon" onPress={() => setSort("trips")} />
            </ScrollView>

            {sortedOffers.map((o) => (
              <PremiumOfferCard
                key={o.id}
                offer={o}
                canDecide={isOwner && o.status === "pending" && req.status !== "booked"}
                isBestPrice={o.id === bestPriceId && o.status === "pending"}
                isBestRating={o.id === bestRatingId && o.status === "pending"}
                isBestTrips={o.id === bestTripsId && o.status === "pending"}
                busy={busyOfferId === o.id}
                onDecide={(a) => decide(o.id, a)}
                onAsk={() => askQuestion(o.driver_id)}
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

        {/* Vue conducteur (non-owner): résumé simplifié des autres offres */}
        {!isOwner && (req.offers || []).length > 0 ? (
          <View style={styles.card}>
            <Txt size="xs" weight="700" color={colors.textMuted}>
              {req.offers!.length} propositions déjà envoyées · à partir de {Math.min(...req.offers!.map(o => o.price_xof)).toLocaleString("fr-FR")} F CFA
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

function SortChip({ label, active, icon, onPress }: { label: string; active: boolean; icon: any; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.sortChip, active && styles.sortChipActive]}>
      <Ionicons name={icon} size={12} color={active ? colors.white : colors.textMuted} />
      <Txt size="xxs" weight="700" color={active ? colors.white : colors.midnight} style={{ marginLeft: 5 }}>{label}</Txt>
    </Pressable>
  );
}

function PremiumOfferCard({
  offer,
  canDecide,
  isBestPrice,
  isBestRating,
  isBestTrips,
  busy,
  onDecide,
  onAsk,
}: {
  offer: RideOffer;
  canDecide: boolean;
  isBestPrice: boolean;
  isBestRating: boolean;
  isBestTrips: boolean;
  busy: boolean;
  onDecide: (a: "accept" | "refuse") => void;
  onAsk: () => void;
}) {
  const c = offerStatusColor(offer.status);
  const highlighted = isBestPrice || isBestRating || isBestTrips;
  return (
    <View style={[styles.offerCard, highlighted && styles.offerCardHighlight]}>
      {/* Best-of badges row */}
      {(isBestPrice || isBestRating || isBestTrips || offer.driver_verified) ? (
        <View style={styles.bestBadges}>
          {isBestPrice ? <BestBadge icon="pricetag" label="Meilleur prix" tint="#059669" /> : null}
          {isBestRating ? <BestBadge icon="star" label="Meilleure note" tint="#F59E0B" /> : null}
          {isBestTrips ? <BestBadge icon="ribbon" label="Expérimenté" tint="#7C3AED" /> : null}
          {offer.driver_verified ? <BestBadge icon="shield-checkmark" label="Vérifié Jokoo" tint="#0EA5E9" /> : null}
        </View>
      ) : null}

      {/* Driver + price header */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {offer.driver_avatar ? (
          <Image source={{ uri: offer.driver_avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}><Ionicons name="person" size={18} color={colors.turquoise} /></View>
        )}
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Txt size="sm" weight="800">{offer.driver_name || "Conducteur"}</Txt>
            {offer.driver_verified ? <Ionicons name="checkmark-circle" size={12} color={colors.turquoise} /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
            {offer.driver_rating != null ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="star" size={11} color="#F59E0B" />
                <Txt size="xxs" weight="700" style={{ marginLeft: 3 }}>{offer.driver_rating.toFixed(1)}</Txt>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="car-sport" size={11} color={colors.textMuted} />
              <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 3 }}>
                {offer.driver_completed_rides ?? 0} trajet{(offer.driver_completed_rides ?? 0) > 1 ? "s" : ""}
              </Txt>
            </View>
            <Txt size="xxs" color={colors.textSubtle}>· {relativeTime(offer.created_at)}</Txt>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt size="lg" weight="800" style={{ fontVariant: ["tabular-nums"] as any }}>{offer.price_xof.toLocaleString("fr-FR")} F</Txt>
          <View style={[styles.badge, { backgroundColor: c.bg, marginTop: 4 }]}>
            <Txt size="xxs" weight="700" color={c.fg}>{offerStatusLabel(offer.status)}</Txt>
          </View>
        </View>
      </View>

      {/* Ride summary */}
      {offer.ride_summary ? (
        <View style={styles.rideSummary}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {offer.ride_summary.vehicle_model ? <Chip icon="car" label={offer.ride_summary.vehicle_model} /> : null}
            {offer.ride_summary.time ? <Chip icon="time" label={offer.ride_summary.time} /> : null}
            {offer.ride_summary.seats_available ? (
              <Chip
                icon="people"
                label={`${offer.ride_summary.seats_available} place${offer.ride_summary.seats_available > 1 ? "s" : ""}`}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {offer.message ? (
        <View style={styles.msgBox}>
          <Txt size="xs" color={colors.textSecondary}>&quot;{offer.message}&quot;</Txt>
        </View>
      ) : null}

      {/* Actions */}
      {canDecide ? (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
          <Pressable onPress={onAsk} style={[styles.decideBtn, { backgroundColor: colors.surface2 }]} testID={`offer-ask-${offer.id.slice(0, 8)}`}>
            <Ionicons name="chatbubble-ellipses" size={14} color={colors.midnight} />
            <Txt size="xs" weight="700" style={{ marginLeft: 4 }}>Question</Txt>
          </Pressable>
          <Pressable
            onPress={() => onDecide("refuse")}
            style={[styles.decideBtn, { backgroundColor: "#FEE2E2", flex: 1 }]}
            testID={`offer-refuse-${offer.id.slice(0, 8)}`}
            disabled={busy}
          >
            <Ionicons name="close-circle" size={14} color="#DC2626" />
            <Txt size="xs" weight="700" color="#DC2626" style={{ marginLeft: 6 }}>Refuser</Txt>
          </Pressable>
          <Pressable
            onPress={() => onDecide("accept")}
            style={[styles.decideBtn, { backgroundColor: colors.turquoise, flex: 1.2 }]}
            testID={`offer-accept-${offer.id.slice(0, 8)}`}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={14} color={colors.white} />
                <Txt size="xs" weight="700" color={colors.white} style={{ marginLeft: 6 }}>Accepter</Txt>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function BestBadge({ icon, label, tint }: { icon: any; label: string; tint: string }) {
  return (
    <View style={[styles.bestBadge, { backgroundColor: `${tint}18`, borderColor: `${tint}55` }]}>
      <Ionicons name={icon} size={11} color={tint} />
      <Txt size="xxs" weight="800" color={tint} style={{ marginLeft: 3, letterSpacing: 0.2 }}>{label}</Txt>
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

function OfferModal({
  visible,
  request,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  request: RideRequest;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<"existing" | "inline">("inline");
  const [rides, setRides] = useState<any[]>([]);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [price, setPrice] = useState(request.budget_xof ? String(request.budget_xof) : "");
  const [message, setMessage] = useState("");
  const [time, setTime] = useState(request.time_from);
  const [seats, setSeats] = useState(String(request.seats));
  const [vehicle, setVehicle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
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
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  badge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  routeDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  routeDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: 8, marginLeft: 34 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  compareHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: spacing.md },
  sortChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sortChipActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  offerCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft, gap: 8 },
  offerCardHighlight: { borderWidth: 2, borderColor: colors.turquoise },
  bestBadges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  bestBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  rideSummary: { paddingVertical: 2 },
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surface2 },
  msgBox: { padding: 8, borderRadius: radius.md, backgroundColor: colors.surface2 },
  decideBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 10, height: 40, borderRadius: 999 },
  emptyOffers: { padding: spacing.xl, alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
  republishCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md, borderRadius: radius.lg, backgroundColor: "#FEF3C7" },
  republishBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 40, borderRadius: 999, backgroundColor: colors.turquoise },
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
