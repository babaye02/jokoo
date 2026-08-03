import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Image, Linking } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, FamilyBooking, SessionReport } from "@/src/api";
import { MOOD_META, langMeta } from "@/src/family";
import { useAuth } from "@/src/auth";
import { formatXof } from "@/src/pricing";
import { Btn, Card, Txt } from "@/src/components/ui";
import { ConfirmDialog } from "@/src/components/ActionSheet";
import { colors, radius, shadow, spacing } from "@/src/theme";

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};

export default function FamilyBookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [b, setB] = useState<FamilyBooking | null>(null);
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
    } catch { setB(null); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!b) return <View style={{ flex: 1, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}><Txt color={colors.textMuted}>Chargement…</Txt></View>;

  const isParent = user?.id === b.parent_id;
  const isSitter = user?.id === b.babysitter_user_id;

  const changeStatus = async (status: string) => {
    try {
      await api.patch(`/family/bookings/${b.id}`, { status });
      await load();
    } catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  const sendCheckin = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission refusée", "Autorisez l'accès à la caméra pour envoyer une photo de check-in.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true, allowsEditing: false });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      const b64 = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      try {
        await api.patch(`/family/bookings/${b.id}`, { checkin_photo: b64 });
        await changeStatus("in_progress");
      } catch (e: any) { Alert.alert("Erreur", e.message); }
    }
  };

  const triggerSOS = () => setSosConfirm(true);

  const executeSOS = async () => {
    if (!b) return;
    try {
      const r = await api.post<{ ok: boolean; emergency_contact: any }>(`/family/bookings/${b.id}/sos`, {});
      const ec = r?.emergency_contact;
      await load();
      // Overlay in-app plutôt qu'un Alert.alert (bloqué sur navigateur web).
      if (ec?.phone) {
        setEmergencyContact({ name: ec.name, phone: ec.phone });
      }
    } catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  const canStartSession = isSitter && b.status === "confirmed" && !b.checkin_photo;
  const canComplete = isSitter && b.status === "in_progress" && !b.report_id;
  const canRateSitter = isParent && b.status === "completed" && !(b as any).review_id;
  const showSOS = (isParent || isSitter) && (b.status === "in_progress" || b.status === "confirmed");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="det-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Session</Txt>
        <Pressable onPress={() => router.push(`/chat/${isParent ? b.babysitter_user_id : b.parent_id}`)} style={styles.back}>
          <Ionicons name="chatbubble-ellipses" size={20} color={colors.midnight} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 200 + insets.bottom }}>
        {/* Status header */}
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Txt size="xs" color={colors.textMuted}>Statut</Txt>
              <Txt size="lg" weight="700">{STATUS_LABEL[b.status]}</Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>{b.date} · {b.time_start} – {b.time_end} ({b.duration_hours}h)</Txt>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Txt size="xs" color={colors.textMuted}>Total</Txt>
              <Txt size="xl" weight="700" color={colors.turquoise}>{formatXof(b.total_xof)}</Txt>
            </View>
          </View>
        </Card>

        {/* Parties */}
        <View style={{ marginTop: spacing.md }}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Txt size="xs" color={colors.textMuted}>{isParent ? "Étudiant(e)" : "Parent"}</Txt>
                <Txt weight="700">{isParent ? b.babysitter_name : b.parent_name}</Txt>
                <Txt size="xxs" color={colors.textMuted}>{(isParent ? b.babysitter_id : b.parent_id).slice(0, 8)}</Txt>
              </View>
              <Pressable onPress={() => router.push(`/chat/${isParent ? b.babysitter_user_id : b.parent_id}`)} style={styles.chatBtn}>
                <Ionicons name="chatbubble" size={18} color={colors.turquoise} />
              </Pressable>
            </View>
          </Card>
        </View>

        {/* Address */}
        <View style={{ marginTop: spacing.md }}>
          <Card>
            <Txt size="sm" weight="700" style={{ marginBottom: 6 }}>Lieu</Txt>
            <Txt>{b.address}</Txt>
            <Txt size="xs" color={colors.textMuted}>{b.city}</Txt>
          </Card>
        </View>

        {/* Kids */}
        <View style={{ marginTop: spacing.md }}>
          <Card>
            <Txt size="sm" weight="700" style={{ marginBottom: 6 }}>Enfants ({b.kids.length})</Txt>
            {b.kids.map((k, i) => (
              <View key={i} style={styles.kidRow}>
                <Ionicons name="happy" size={18} color={colors.turquoise} />
                <Txt weight="700" style={{ marginLeft: 8 }}>{k.name}</Txt>
                <Txt size="xs" color={colors.textMuted} style={{ marginLeft: 6 }}>· {k.age} ans</Txt>
                {k.special_needs ? <Txt size="xxs" color={colors.textSubtle} style={{ marginLeft: 8, flex: 1 }} numberOfLines={1}>({k.special_needs})</Txt> : null}
              </View>
            ))}
          </Card>
        </View>

        {/* Language focus */}
        {b.language_focus ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt size="xl">{langMeta(b.language_focus).flag}</Txt>
                <View style={{ marginLeft: 10 }}>
                  <Txt size="xs" color={colors.textMuted}>Immersion linguistique</Txt>
                  <Txt weight="700">{langMeta(b.language_focus).label}</Txt>
                </View>
              </View>
            </Card>
          </View>
        ) : null}

        {b.notes ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <Txt size="sm" weight="700">Notes du parent</Txt>
              <Txt size="sm" style={{ marginTop: 6, lineHeight: 20 }}>{b.notes}</Txt>
            </Card>
          </View>
        ) : null}

        {/* Emergency contact — visible to sitter */}
        {isSitter ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <Txt size="sm" weight="700" style={{ marginBottom: 6 }}>🚨 Contact d&apos;urgence</Txt>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="700">{b.emergency_contact.name}</Txt>
                  <Txt size="xs" color={colors.textMuted}>{b.emergency_contact.phone}</Txt>
                </View>
                <Pressable onPress={() => Linking.openURL(`tel:${b.emergency_contact.phone}`)} style={styles.callBtn}>
                  <Ionicons name="call" size={16} color={colors.white} />
                </Pressable>
              </View>
            </Card>
          </View>
        ) : null}

        {/* Check-in photo */}
        {b.checkin_photo ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <Txt size="sm" weight="700" style={{ marginBottom: 6 }}>📸 Check-in au démarrage</Txt>
              <Image source={{ uri: b.checkin_photo }} style={styles.checkinImg} />
            </Card>
          </View>
        ) : null}

        {/* Session Report */}
        {report ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <Txt size="sm" weight="700" style={{ marginBottom: 6 }}>📝 Carnet de session</Txt>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <View style={[styles.moodPill, { backgroundColor: `${MOOD_META[report.mood].color}22` }]}>
                  <Txt>{MOOD_META[report.mood].emoji}</Txt>
                  <Txt size="xs" weight="700" style={{ marginLeft: 4 }} color={MOOD_META[report.mood].color}>
                    {MOOD_META[report.mood].label}
                  </Txt>
                </View>
              </View>
              <Txt size="xs" color={colors.textMuted}>Activités</Txt>
              <Txt size="sm" style={{ marginBottom: 8, lineHeight: 20 }}>{report.activities}</Txt>
              {report.meals ? <><Txt size="xs" color={colors.textMuted}>Repas</Txt><Txt size="sm" style={{ marginBottom: 8 }}>{report.meals}</Txt></> : null}
              {report.notes ? <><Txt size="xs" color={colors.textMuted}>Notes</Txt><Txt size="sm" style={{ lineHeight: 20 }}>{report.notes}</Txt></> : null}
              {report.photo ? <Image source={{ uri: report.photo }} style={styles.checkinImg} /> : null}
            </Card>
          </View>
        ) : null}

        {/* Review CTA (parent uniquement, mission terminée, avis non encore laissé) */}
        {canRateSitter ? (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="star" size={22} color="#F59E0B" />
                <Txt weight="700" style={{ marginLeft: 8 }}>Laissez un avis</Txt>
              </View>
              <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
                Aidez d'autres parents en notant votre expérience avec {b.babysitter_name}.
              </Txt>
              <Btn
                title="Noter la baby-sitter"
                icon="star"
                onPress={() => router.push(`/family/booking/${b.id}/review` as any)}
                fullWidth
                size="lg"
                style={{ marginTop: 12 }}
                testID="family-leave-review-btn"
              />
            </Card>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
        {showSOS ? (
          <Pressable onPress={triggerSOS} style={styles.sosBtn} testID="sos-btn">
            <Ionicons name="warning" size={20} color={colors.white} />
            <Txt weight="700" color={colors.white} size="md" style={{ marginLeft: 8 }}>🚨 BOUTON SOS</Txt>
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
            <Txt size="xl" weight="700" style={{ textAlign: "center", marginTop: 12 }}>🚨 SOS envoyé</Txt>
            <Txt size="sm" color={colors.textMuted} style={{ textAlign: "center", marginTop: 6 }}>
              Appelez immédiatement le contact d&apos;urgence ci-dessous.
            </Txt>
            <View style={styles.emergencyContact}>
              <Ionicons name="call" size={22} color={colors.turquoise} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Txt weight="700">{emergencyContact.name || "Contact"}</Txt>
                <Txt size="sm" color={colors.textMuted}>{emergencyContact.phone}</Txt>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
              <Pressable onPress={() => setEmergencyContact(null)} style={[styles.emgBtn, styles.emgGhost]} testID="emg-close">
                <Txt weight="700" color={colors.textMuted}>Fermer</Txt>
              </Pressable>
              <Pressable
                onPress={() => { const p = emergencyContact.phone!; setEmergencyContact(null); Linking.openURL(`tel:${p}`); }}
                style={[styles.emgBtn, { backgroundColor: colors.danger }]}
                testID="emg-call"
              >
                <Ionicons name="call" size={18} color={colors.white} />
                <Txt weight="700" color={colors.white} style={{ marginLeft: 6 }}>Appeler</Txt>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
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
  chatBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  kidRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  checkinImg: { width: "100%", height: 200, borderRadius: radius.md, marginTop: 8, backgroundColor: colors.surface3 },
  moodPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider, gap: 10 },
  sosBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: "#EF4444",
    ...shadow.card,
  },
  emergencyOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  emergencyCard: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, paddingBottom: 40 },
  emergencyIcon: { alignSelf: "center", width: 60, height: 60, borderRadius: 30, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  emergencyContact: { flexDirection: "row", alignItems: "center", padding: spacing.md, marginTop: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md },
  emgBtn: { flex: 1, height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  emgGhost: { backgroundColor: colors.surface2 },
});
