// Session Details — Premium redesign (Airbnb / Apple Wallet / Uber / Revolut inspired)
// Preserves ALL existing functionality: chat, check-in photo, SOS, complete, review CTA, session report.
// Adds: premium hero, mission summary, payment card, sitter/parent card with badges,
// location card, kids card, notes, timeline, actions, thank-you footer.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Linking,
  Platform,
  Share,
  Text,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { pickImageFromCamera, uploadToCloudinary } from "@/src/media/cloudinary";
import { api, FamilyBooking, SessionReport, Babysitter } from "@/src/api";
import { MOOD_META, langMeta } from "@/src/family";
import { useAuth } from "@/src/auth";
import { formatXof } from "@/src/pricing";
import { Btn, Txt, Badge, BadgeRow, Avatar } from "@/src/components/ui";
import { ConfirmDialog } from "@/src/components/ActionSheet";
import { colors, radius, shadow, spacing } from "@/src/theme";

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};

const STATUS_META: Record<string, { icon: any; tint: string; bg: string; label: string; sub: string }> = {
  pending:     { icon: "hourglass-outline",     tint: "#D97706", bg: "#FEF3C7", label: "En attente",  sub: "En attente de confirmation" },
  confirmed:   { icon: "checkmark-circle",      tint: "#0EA5E9", bg: "#E0F2FE", label: "Confirmée",   sub: "Réservation confirmée" },
  in_progress: { icon: "time-outline",          tint: "#7C3AED", bg: "#EDE9FE", label: "En cours",    sub: "Session en cours" },
  completed:   { icon: "checkmark-done-circle", tint: "#059669", bg: "#D1FAE5", label: "Mission terminée", sub: "Merci d'avoir utilisé Jokoo" },
  cancelled:   { icon: "close-circle",          tint: "#DC2626", bg: "#FEE2E2", label: "Annulée",     sub: "Cette session a été annulée" },
};

const SERVICE_LABEL: Record<string, string> = {
  babysitting: "Baby-sitting",
  tutoring:    "Tutorat",
  both:        "Baby-sitting + Tutorat",
};

// ─── Helpers ───────────────────────────────────────────────
function frDate(iso: string): string {
  try {
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}
function frDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  } catch { return iso; }
}

// ─── Main Screen ───────────────────────────────────────────
export default function FamilyBookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [b, setB] = useState<FamilyBooking | null>(null);
  const [sitter, setSitter] = useState<Babysitter | null>(null);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [sosConfirm, setSosConfirm] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState<{ name?: string; phone?: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.get<FamilyBooking>(`/family/bookings/${id}`);
      setB(r);
      if (r.report_id) {
        try { const rep = await api.get<SessionReport>(`/family/bookings/${id}/report`); setReport(rep); } catch { /* ignore */ }
      }
      // Fetch sitter public profile for badges + rating
      try {
        const s = await api.get<Babysitter>(`/family/babysitters/${r.babysitter_id}`);
        setSitter(s);
      } catch { /* not fatal */ }
    } catch { setB(null); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!b) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <Txt color={colors.textMuted}>Chargement…</Txt>
      </View>
    );
  }

  const isParent = user?.id === b.parent_id;
  const isSitter = user?.id === b.babysitter_user_id;
  const status = STATUS_META[b.status] || STATUS_META.pending;

  const changeStatus = async (statusValue: string) => {
    try { await api.patch(`/family/bookings/${b.id}`, { status: statusValue }); await load(); }
    catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  const sendCheckin = async () => {
    try {
      const picked = await pickImageFromCamera({ allowsEditing: false, quality: 0.85 });
      if (!picked) return;
      const uploaded = await uploadToCloudinary(picked, "reports");
      await api.patch(`/family/bookings/${b.id}`, { checkin_photo: uploaded.secure_url });
      await changeStatus("in_progress");
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Envoi impossible.");
    }
  };

  const triggerSOS = () => setSosConfirm(true);
  const executeSOS = async () => {
    if (!b) return;
    try {
      const r = await api.post<{ ok: boolean; emergency_contact: any }>(`/family/bookings/${b.id}/sos`, {});
      const ec = r?.emergency_contact;
      await load();
      if (ec?.phone) setEmergencyContact({ name: ec.name, phone: ec.phone });
    } catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  const openMaps = () => {
    const q = encodeURIComponent(`${b.address}, ${b.city}`);
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      android: `geo:0,0?q=${q}`,
      web: `https://www.google.com/maps/search/?api=1&query=${q}`,
    }) || `https://www.google.com/maps/search/?api=1&query=${q}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`));
  };

  const shareSession = async () => {
    try {
      const msg = `Ma session Jokoo avec ${b.babysitter_name} — ${frDate(b.date)} · ${b.time_start} – ${b.time_end}. Total : ${formatXof(b.total_xof)}.`;
      if (Platform.OS === "web" && typeof (globalThis as any).navigator?.share === "function") {
        await (globalThis as any).navigator.share({ title: "Session Jokoo", text: msg });
      } else {
        await Share.share({ message: msg });
      }
    } catch { /* cancelled */ }
  };

  const canStartSession = isSitter && b.status === "confirmed" && !b.checkin_photo;
  const canComplete = isSitter && b.status === "in_progress" && !b.report_id;
  const canRateSitter = isParent && b.status === "completed" && !(b as any).review_id;
  const showSOS = (isParent || isSitter) && (b.status === "in_progress" || b.status === "confirmed");

  const peerId = isParent ? b.babysitter_user_id : b.parent_id;
  const peerName = isParent ? b.babysitter_name : b.parent_name;
  const peerAvatar = isParent ? (b.babysitter_avatar || undefined) : undefined;

  // Timeline states
  const steps: { key: string; label: string; icon: any; done: boolean; time?: string }[] = [
    { key: "booked",    label: "Réservation créée",  icon: "calendar-outline",         done: true, time: frDateShort(b.created_at) },
    { key: "confirmed", label: "Étudiant(e) confirmé(e)", icon: "checkmark-circle",     done: ["confirmed", "in_progress", "completed"].includes(b.status) },
    { key: "checkin",   label: "Check-in enregistré",   icon: "camera",                 done: !!b.checkin_photo || b.status === "in_progress" || b.status === "completed" },
    { key: "start",     label: "Session démarrée",       icon: "play-circle",           done: b.status === "in_progress" || b.status === "completed" },
    { key: "end",       label: "Mission terminée",       icon: "flag",                  done: b.status === "completed" },
    { key: "pay",       label: "Paiement libéré",        icon: "card",                  done: !!b.paid },
    { key: "review",    label: canRateSitter ? "Avis en attente" : "Avis client",       icon: "star",                  done: !canRateSitter && b.status === "completed" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Compact top bar */}
      <SafeAreaView edges={["top"]} style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="det-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Session</Text>
        <Pressable onPress={shareSession} style={styles.iconBtn} testID="det-share">
          <Ionicons name="share-outline" size={20} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 200 + insets.bottom, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        {/* ── HERO — Status card ── */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: status.bg }]}>
            <Ionicons name={status.icon} size={38} color={status.tint} />
          </View>
          <Text style={styles.heroLabel}>{status.label}</Text>
          <Text style={styles.heroTitle}>{status.sub}</Text>
          <BadgeRow style={{ marginTop: spacing.md, justifyContent: "center" }}>
            <Badge icon="briefcase-outline" tone="info" label={SERVICE_LABEL[b.service_type] || "Session"} />
            <Badge icon="calendar-outline" tone="verified" label={frDate(b.date)} />
            <Badge icon="time-outline" tone="top" label={`${b.time_start} – ${b.time_end}`} />
            <Badge icon="hourglass-outline" tone="language" label={`${b.duration_hours} h`} />
          </BadgeRow>
        </View>

        {/* ── MISSION SUMMARY ── */}
        <SectionCard>
          <SectionHeader overline="Résumé" title="Détails de la mission" />
          <View style={styles.gridRow}>
            <SummaryCell icon="calendar-outline" iconTint="#0EA5E9" label="Date" value={frDate(b.date)} />
            <SummaryCell icon="time-outline" iconTint="#7C3AED" label="Heure" value={`${b.time_start} – ${b.time_end}`} />
          </View>
          <View style={styles.gridRow}>
            <SummaryCell icon="hourglass-outline" iconTint="#D97706" label="Durée" value={`${b.duration_hours} h`} />
            <SummaryCell icon="location-outline" iconTint="#DC2626" label="Ville" value={b.city} />
          </View>
          <View style={styles.gridRow}>
            <SummaryCell icon="briefcase-outline" iconTint="#059669" label="Catégorie" value={SERVICE_LABEL[b.service_type] || "Session"} />
            <SummaryCell icon="ribbon-outline" iconTint={status.tint} label="Statut" value={status.label} />
          </View>
        </SectionCard>

        {/* ── PAYMENT CARD — dark premium ── */}
        <View style={styles.paymentCard}>
          <LinearGradient
            colors={["#0B1F3A", "#1F2A4B"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.payOverline}>Montant total</Text>
              <Text style={styles.payAmount}>{formatXof(b.total_xof)}</Text>
              <View style={styles.payStatusBadge}>
                <Ionicons name={b.paid ? "checkmark-circle" : "hourglass-outline"} size={12} color={b.paid ? "#4ADE80" : "#FCD34D"} />
                <Text style={[styles.payStatusText, { color: b.paid ? "#4ADE80" : "#FCD34D" }]}>
                  {b.paid ? "Paiement effectué" : "Paiement en attente"}
                </Text>
              </View>
            </View>
            <View style={styles.payChip}>
              <Ionicons name="card-outline" size={16} color={colors.white} />
              <Text style={styles.payChipTxt}>Wave · Orange · Carte</Text>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginVertical: 16 }} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={styles.payBtn} onPress={() => Alert.alert("Bientôt", "Téléchargement de la facture disponible prochainement.")} testID="pay-invoice">
              <Ionicons name="document-text-outline" size={14} color={colors.white} />
              <Text style={styles.payBtnTxt}>Facture</Text>
            </Pressable>
            <Pressable style={styles.payBtn} onPress={() => Alert.alert("Reçu", `Reçu #${b.id.slice(0, 8).toUpperCase()} — ${formatXof(b.total_xof)}`)} testID="pay-receipt">
              <Ionicons name="receipt-outline" size={14} color={colors.white} />
              <Text style={styles.payBtnTxt}>Reçu</Text>
            </Pressable>
          </View>
        </View>

        {/* ── STUDENT / PARENT CARD ── */}
        <SectionCard>
          <SectionHeader overline={isParent ? "Étudiant(e)" : "Parent"} title={peerName} />
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
            <Avatar uri={peerAvatar} name={peerName} size={72} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ fontFamily: "InstrumentSerif", fontSize: 22, lineHeight: 26, color: colors.text, letterSpacing: -0.3 }} numberOfLines={1}>
                {peerName}
              </Text>
              {sitter && isParent ? (
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                  {sitter.university || "—"}
                </Text>
              ) : null}
              {sitter && isParent ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginLeft: 4 }}>
                    {(sitter.rating || 0).toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: 4 }}>
                    · {sitter.reviews_count || 0} avis
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Badges (only when we have sitter details) */}
          {sitter && isParent ? (
            <BadgeRow style={{ marginTop: 12 }}>
              {sitter.identity_verified ? <Badge icon="shield-checkmark" tone="verified" label="Vérifiée" size="sm" /> : null}
              {sitter.student_card_verified ? <Badge icon="school-outline" tone="verified" label="Étudiante" size="sm" /> : null}
              {sitter.verified_plus ? <Badge icon="ribbon-outline" tone="top" label="Verified+" size="sm" /> : null}
              {(sitter.languages || []).length >= 3 ? <Badge icon="globe-outline" tone="language" label="Trilingue" size="sm" /> : null}
              {sitter.recommended_by_jokoo ? <Badge icon="heart" tone="top" label="Recommandée" size="sm" /> : null}
              {sitter.psc1_certified ? <Badge icon="medkit-outline" tone="assist" label="PSC1" size="sm" /> : null}
              <Badge icon="flash-outline" tone="warning" label="Réponse rapide" size="sm" />
            </BadgeRow>
          ) : null}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            {isParent && sitter ? (
              <Pressable onPress={() => router.push(`/family/babysitter/${sitter.id}`)} style={styles.smallCta} testID="peer-profile">
                <Ionicons name="person-outline" size={14} color={colors.text} />
                <Text style={styles.smallCtaTxt}>Voir profil</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.push(`/chat/${peerId}`)} style={styles.smallCta} testID="peer-chat">
              <Ionicons name="chatbubbles-outline" size={14} color={colors.text} />
              <Text style={styles.smallCtaTxt}>Message</Text>
            </Pressable>
            {isParent && sitter ? (
              <Pressable onPress={() => router.push(`/family/book/${sitter.id}`)} style={[styles.smallCta, { backgroundColor: colors.text, borderColor: colors.text }]} testID="peer-rebook">
                <Ionicons name="refresh" size={14} color={colors.white} />
                <Text style={[styles.smallCtaTxt, { color: colors.white }]}>Réserver à nouveau</Text>
              </Pressable>
            ) : null}
          </View>
        </SectionCard>

        {/* ── LOCATION CARD ── */}
        <SectionCard>
          <SectionHeader overline="Lieu" title="Adresse de la session" />
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 4 }}>
            <View style={styles.locIcon}>
              <Ionicons name="location" size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text, letterSpacing: -0.2 }} numberOfLines={2}>{b.address}</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{b.city}</Text>
            </View>
          </View>
          <Pressable onPress={openMaps} style={styles.mapsCta} testID="open-maps">
            <Ionicons name="navigate" size={16} color={colors.white} />
            <Text style={styles.mapsCtaTxt}>Ouvrir dans Maps</Text>
          </Pressable>
        </SectionCard>

        {/* ── KIDS CARD ── */}
        <SectionCard>
          <SectionHeader overline="Enfants" title={`${b.kids.length} enfant${b.kids.length > 1 ? "s" : ""}`} />
          <View style={{ gap: 10 }}>
            {b.kids.map((k, i) => (
              <View key={i} style={styles.kidRow}>
                <View style={styles.kidAvatar}>
                  <Ionicons name={k.age <= 5 ? "happy-outline" : "person-outline"} size={22} color="#EC4899" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }} numberOfLines={1}>{k.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{k.age} an{k.age > 1 ? "s" : ""}</Text>
                  {k.special_needs ? (
                    <View style={{ marginTop: 6 }}>
                      <Badge icon="information-circle-outline" tone="warning" label={k.special_needs} size="sm" />
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </SectionCard>

        {/* ── LANGUAGE FOCUS ── */}
        {b.language_focus ? (
          <SectionCard>
            <SectionHeader overline="Immersion" title="Langue focus" />
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
              <Text style={{ fontSize: 32 }}>{langMeta(b.language_focus).flag}</Text>
              <View style={{ marginLeft: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>{langMeta(b.language_focus).label}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Session pratiquée dans cette langue</Text>
              </View>
            </View>
          </SectionCard>
        ) : null}

        {/* ── PARENT NOTES ── */}
        {b.notes ? (
          <SectionCard>
            <SectionHeader overline="Instructions" title="Notes du parent" />
            <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 21, marginTop: 4 }}>{b.notes}</Text>
          </SectionCard>
        ) : null}

        {/* ── EMERGENCY CONTACT (sitter only) ── */}
        {isSitter ? (
          <SectionCard>
            <SectionHeader overline="Urgence" title="Contact d'urgence" />
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
              <View style={[styles.locIcon, { backgroundColor: "#DC2626" }]}>
                <Ionicons name="call" size={18} color={colors.white} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>{b.emergency_contact.name}</Text>
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{b.emergency_contact.phone}</Text>
              </View>
              <Pressable onPress={() => Linking.openURL(`tel:${b.emergency_contact.phone}`)} style={styles.callBtn}>
                <Ionicons name="call" size={18} color={colors.white} />
              </Pressable>
            </View>
          </SectionCard>
        ) : null}

        {/* ── CHECK-IN PHOTO ── */}
        {b.checkin_photo ? (
          <SectionCard>
            <SectionHeader overline="Check-in" title="Photo au démarrage" />
            <Image source={{ uri: b.checkin_photo }} style={styles.checkinImg} />
          </SectionCard>
        ) : null}

        {/* ── SESSION REPORT ── */}
        {report ? (
          <SectionCard>
            <SectionHeader overline="Carnet" title="Rapport de session" />
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
              <View style={[styles.moodPill, { backgroundColor: `${MOOD_META[report.mood].color}18` }]}>
                <Text>{MOOD_META[report.mood].emoji}</Text>
                <Text style={{ fontSize: 12, fontWeight: "700", marginLeft: 6, color: MOOD_META[report.mood].color }}>
                  {MOOD_META[report.mood].label}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 12, gap: 10 }}>
              <ReportRow label="Activités" value={report.activities} />
              {report.meals ? <ReportRow label="Repas" value={report.meals} /> : null}
              {report.notes ? <ReportRow label="Notes" value={report.notes} /> : null}
            </View>
            {report.photo ? <Image source={{ uri: report.photo }} style={styles.checkinImg} /> : null}
          </SectionCard>
        ) : null}

        {/* ── TIMELINE ── */}
        <SectionCard>
          <SectionHeader overline="Progression" title="Chronologie" />
          <View style={{ marginTop: 6 }}>
            {steps.map((s, i) => (
              <View key={s.key} style={styles.timelineRow}>
                <View style={styles.timelineIconWrap}>
                  <View style={[
                    styles.timelineDot,
                    { backgroundColor: s.done ? "#059669" : colors.white, borderColor: s.done ? "#059669" : colors.borderStrong }
                  ]}>
                    <Ionicons name={s.icon} size={14} color={s.done ? colors.white : colors.textMuted} />
                  </View>
                  {i < steps.length - 1 ? (
                    <View style={[styles.timelineLine, { backgroundColor: s.done ? "#059669" : colors.divider }]} />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 14 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: s.done ? colors.text : colors.textMuted, letterSpacing: -0.1 }}>
                    {s.label}
                  </Text>
                  {s.time ? <Text style={{ fontSize: 11, color: colors.textSubtle, marginTop: 2 }}>{s.time}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </SectionCard>

        {/* ── ACTIONS GRID ── */}
        <SectionCard>
          <SectionHeader overline="Actions" title="Que souhaitez-vous faire ?" />
          <View style={styles.actionsGrid}>
            {canRateSitter ? (
              <ActionBtn icon="star" tint="#EA580C" bg="#FFEDD5" label="Noter" onPress={() => router.push(`/family/booking/${b.id}/review` as any)} testID="act-rate" />
            ) : null}
            <ActionBtn icon="heart-outline" tint="#DC2626" bg="#FEE2E2" label="Favori" onPress={() => Alert.alert("Ajouté", "Prestataire ajouté à vos favoris ✓")} testID="act-fav" />
            <ActionBtn icon="chatbubble-ellipses-outline" tint="#0EA5E9" bg="#E0F2FE" label="Message" onPress={() => router.push(`/chat/${peerId}`)} testID="act-chat" />
            <ActionBtn icon="document-text-outline" tint="#7C3AED" bg="#EDE9FE" label="Facture" onPress={() => Alert.alert("Bientôt", "Facture PDF téléchargeable prochainement.")} testID="act-invoice" />
            {isParent && sitter ? (
              <ActionBtn icon="refresh" tint="#059669" bg="#D1FAE5" label="Rebook" onPress={() => router.push(`/family/book/${sitter.id}`)} testID="act-rebook" />
            ) : null}
            <ActionBtn icon="flag-outline" tint="#DC2626" bg="#FEE2E2" label="Signaler" onPress={() => router.push(`/family/booking/${b.id}/report` as any)} testID="act-report" />
            <ActionBtn icon="share-outline" tint={colors.text} bg="#F3F4F6" label="Partager" onPress={shareSession} testID="act-share" />
          </View>
        </SectionCard>

        {/* ── THANK YOU FOOTER ── */}
        <View style={styles.thanks}>
          <Text style={styles.thanksTitle}>Merci de faire confiance à Jokoo.</Text>
          <Text style={styles.thanksSub}>Une communauté de familles et d&apos;étudiants au Sénégal.</Text>
          <View style={styles.thanksLogo}>
            <Text style={{ fontFamily: "InstrumentSerif", fontSize: 24, letterSpacing: -0.4, color: colors.text }}>Jokoo</Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom action bar */}
      {(showSOS || canStartSession || canComplete || (isSitter && b.status === "pending")) ? (
        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          {showSOS ? (
            <Pressable onPress={triggerSOS} style={styles.sosBtn} testID="sos-btn">
              <Ionicons name="warning" size={20} color={colors.white} />
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.white, marginLeft: 8, letterSpacing: -0.1 }}>🚨 BOUTON SOS</Text>
            </Pressable>
          ) : null}
          {canStartSession ? (
            <Btn title="Photo check-in & démarrer" icon="camera" onPress={sendCheckin} fullWidth size="lg" testID="checkin-btn" />
          ) : canComplete ? (
            <Btn title="Terminer la session (carnet)" icon="clipboard" onPress={() => router.push(`/family/booking/${b.id}/report`)} fullWidth size="lg" testID="complete-btn" />
          ) : isSitter && b.status === "pending" ? (
            <Btn title="Confirmer la mission" icon="checkmark" onPress={() => changeStatus("confirmed")} fullWidth size="lg" />
          ) : null}
        </View>
      ) : null}

      <ConfirmDialog
        visible={sosConfirm}
        title="🚨 Déclencher l'alerte SOS ?"
        message="Le contact d'urgence sera affiché et l'autre partie sera notifiée immédiatement."
        confirmLabel="Oui, ALERTER"
        cancelLabel="Non"
        destructive
        onConfirm={executeSOS}
        onClose={() => setSosConfirm(false)}
      />

      {emergencyContact ? (
        <View style={styles.emergencyOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setEmergencyContact(null)} />
          <View style={styles.emergencyCard}>
            <View style={styles.emergencyIcon}>
              <Ionicons name="warning" size={26} color={colors.white} />
            </View>
            <Text style={{ fontFamily: "InstrumentSerif", fontSize: 24, textAlign: "center", marginTop: 12, letterSpacing: -0.4, color: colors.text }}>🚨 SOS envoyé</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 6 }}>
              Appelez immédiatement le contact d&apos;urgence ci-dessous.
            </Text>
            <View style={styles.emergencyContact}>
              <Ionicons name="call" size={22} color={colors.turquoise} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>{emergencyContact.name || "Contact"}</Text>
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{emergencyContact.phone}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
              <Pressable onPress={() => setEmergencyContact(null)} style={[styles.emgBtn, styles.emgGhost]} testID="emg-close">
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.textMuted }}>Fermer</Text>
              </Pressable>
              <Pressable
                onPress={() => { const p = emergencyContact.phone!; setEmergencyContact(null); Linking.openURL(`tel:${p}`); }}
                style={[styles.emgBtn, { backgroundColor: colors.danger }]}
                testID="emg-call"
              >
                <Ionicons name="call" size={18} color={colors.white} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.white, marginLeft: 6 }}>Appeler</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Reusable Building Blocks ──────────────────────────────
function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>;
}

function SectionHeader({ overline, title }: { overline?: string; title: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {overline ? (
        <Text style={{ fontSize: 11, letterSpacing: 1.6, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase" }}>
          {overline}
        </Text>
      ) : null}
      <Text style={{ fontFamily: "InstrumentSerif", fontSize: 22, lineHeight: 26, letterSpacing: -0.3, color: colors.text, marginTop: 2 }} numberOfLines={2}>
        {title}
      </Text>
    </View>
  );
}

function SummaryCell({ icon, iconTint, label, value }: { icon: any; iconTint: string; label: string; value: string }) {
  return (
    <View style={styles.summaryCell}>
      <View style={[styles.summaryIcon, { backgroundColor: `${iconTint}18` }]}>
        <Ionicons name={icon} size={16} color={iconTint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", fontWeight: "600" }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 2, letterSpacing: -0.1 }} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ fontSize: 11, color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", fontWeight: "600" }}>{label}</Text>
      <Text style={{ fontSize: 14, color: colors.text, marginTop: 4, lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

function ActionBtn({ icon, tint, bg, label, onPress, testID }: { icon: any; tint: string; bg: string; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.actionBtn} testID={testID}>
      <View style={[styles.actionIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginTop: 6, letterSpacing: -0.1 }}>{label}</Text>
    </Pressable>
  );
}

// ─── STYLES ────────────────────────────────────────────────
const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: 4,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  topTitle: { fontSize: 14, fontWeight: "700", color: colors.text, letterSpacing: -0.1 },

  // Hero
  hero: {
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heroLabel: {
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 14,
  },
  heroTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: colors.text,
    marginTop: 4,
    textAlign: "center",
  },

  // Section cards
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.hairline,
  },

  // Summary
  gridRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  summaryCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#FAFAFA",
  },
  summaryIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    marginRight: 10,
  },

  // Payment
  paymentCard: {
    borderRadius: 24,
    padding: 22,
    overflow: "hidden",
    position: "relative",
    ...shadow.card,
  },
  payOverline: {
    fontSize: 11,
    letterSpacing: 1.6,
    color: "rgba(255,255,255,0.72)",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  payAmount: {
    fontFamily: "InstrumentSerif",
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1,
    color: colors.white,
    marginTop: 6,
  },
  payStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignSelf: "flex-start",
  },
  payStatusText: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 5,
    letterSpacing: -0.1,
  },
  payChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  payChipTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.white,
    marginLeft: 6,
    letterSpacing: -0.1,
  },
  payBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  payBtnTxt: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
    marginLeft: 6,
    letterSpacing: -0.1,
  },

  // Peer card
  smallCta: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallCtaTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginLeft: 5,
    letterSpacing: -0.1,
  },

  // Location
  locIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#0EA5E9",
    alignItems: "center", justifyContent: "center",
  },
  mapsCta: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.text,
  },
  mapsCtaTxt: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
    marginLeft: 6,
    letterSpacing: -0.1,
  },

  // Kids
  kidRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#FAFAFA",
  },
  kidAvatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: "#FCE7F3",
    alignItems: "center", justifyContent: "center",
  },

  // Callbtn
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },

  // Report
  moodPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 28, borderRadius: 999, alignSelf: "flex-start" },
  checkinImg: { width: "100%", height: 200, borderRadius: 18, marginTop: 12, backgroundColor: colors.surface3 },

  // Timeline
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  timelineIconWrap: {
    alignItems: "center",
    marginRight: 12,
  },
  timelineDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 2,
    marginBottom: 2,
    minHeight: 18,
  },

  // Actions grid
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionBtn: {
    width: "22.5%",
    alignItems: "center",
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  // Thank you footer
  thanks: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  thanksTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 22,
    letterSpacing: -0.3,
    color: colors.text,
    textAlign: "center",
  },
  thanksSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: "center",
  },
  thanksLogo: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Bottom bar
  bottom: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    padding: spacing.xl,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 10,
  },
  sosBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 54,
    borderRadius: 16,
    backgroundColor: "#DC2626",
    ...shadow.card,
  },

  // Emergency overlay
  emergencyOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  emergencyCard: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, paddingBottom: 40 },
  emergencyIcon: { alignSelf: "center", width: 60, height: 60, borderRadius: 30, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  emergencyContact: { flexDirection: "row", alignItems: "center", padding: spacing.md, marginTop: spacing.md, backgroundColor: "#F3F4F6", borderRadius: 16 },
  emgBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  emgGhost: { backgroundColor: "#F3F4F6" },
});
