// KYC — Écran de vérification d'identité pour les prestataires.
// Upload : recto + verso + selfie (Cloudinary "kyc" folder), puis POST /api/kyc-requests.
// Affiche le status en cours : pending / approved / rejected / more_info / none.

import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Text } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { api } from "@/src/api";
import { Btn, Txt } from "@/src/components/ui";
import { CompatibleImage } from "@/src/components/CompatibleImage";
import { pickImageFromLibrary, pickImageFromCamera, uploadToCloudinary } from "@/src/media/cloudinary";
import { colors, radius, shadow, spacing } from "@/src/theme";

type KycStatus = "none" | "pending" | "approved" | "rejected" | "more_info";
type IdType = "cni" | "passport" | "drivers_licence";

type KycDoc = {
  id?: string;
  id_type?: IdType;
  doc_front?: string;
  doc_back?: string | null;
  selfie?: string;
  status: KycStatus;
  rejection_reason?: string | null;
  version?: number;
  submitted_at?: string;
  reviewed_at?: string | null;
};

const ID_LABELS: Record<IdType, { label: string; icon: keyof typeof Ionicons.glyphMap; hint: string }> = {
  cni: { label: "Carte d'identité", icon: "card-outline", hint: "Photographiez le recto et le verso." },
  passport: { label: "Passeport", icon: "book-outline", hint: "Photographiez la page principale (recto suffit)." },
  drivers_licence: { label: "Permis de conduire", icon: "car-outline", hint: "Photographiez le recto et le verso." },
};

export default function KycVerificationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<KycDoc | null>(null);
  const [idType, setIdType] = useState<IdType>("cni");
  const [docFront, setDocFront] = useState<string>("");
  const [docBack, setDocBack] = useState<string>("");
  const [selfie, setSelfie] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<KycDoc>("/kyc-requests/mine");
      setCurrent(r);
      if (r?.id_type) setIdType(r.id_type);
      if (r?.doc_front) setDocFront(r.doc_front);
      if (r?.doc_back) setDocBack(r.doc_back);
      if (r?.selfie) setSelfie(r.selfie);
    } catch {
      setCurrent({ status: "none" });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const canEdit = !current || current.status === "none" || current.status === "rejected" || current.status === "more_info";
  const passportNoBack = idType === "passport";

  const pick = async (which: "front" | "back" | "selfie", useCamera = false) => {
    if (!canEdit) return;
    setBusy(true);
    try {
      const picked = useCamera
        ? await pickImageFromCamera({ allowsEditing: which !== "selfie", quality: 0.85, aspect: which === "selfie" ? [1, 1] : [4, 3] })
        : await pickImageFromLibrary({ allowsEditing: which !== "selfie", quality: 0.85, aspect: which === "selfie" ? [1, 1] : [4, 3] });
      if (!picked) return;
      const uploaded = await uploadToCloudinary(picked, "kyc");
      if (which === "front") setDocFront(uploaded.secure_url);
      else if (which === "back") setDocBack(uploaded.secure_url);
      else setSelfie(uploaded.secure_url);
    } catch (e: any) {
      Alert.alert("Upload impossible", e?.message || "Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!docFront) return Alert.alert("Manquant", "Veuillez ajouter le recto de votre pièce d'identité.");
    if (!passportNoBack && !docBack) return Alert.alert("Manquant", "Veuillez ajouter le verso de votre pièce d'identité.");
    if (!selfie) return Alert.alert("Manquant", "Veuillez ajouter votre selfie de vérification.");
    setSubmitting(true);
    try {
      const r = await api.post<KycDoc>("/kyc-requests", {
        id_type: idType,
        doc_front: docFront,
        doc_back: passportNoBack ? null : docBack,
        selfie,
      });
      setCurrent(r);
      Alert.alert("Envoyé", "Votre dossier a été soumis. Vous recevrez une notification dès qu'il sera examiné (24-48h ouvrées).");
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Envoi impossible, réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header premium */}
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, marginHorizontal: 8 }}>Vérification d&apos;identité</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}>
        {/* Hero */}
        <LinearGradient colors={["#E6F9F4", colors.surface]} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark" size={30} color={colors.turquoise} />
          </View>
          <Txt size="xl" weight="800" style={{ marginTop: 8, textAlign: "center" }}>
            Faites vérifier votre identité
          </Txt>
          <Txt size="sm" color={colors.textMuted} style={{ textAlign: "center", marginTop: 8, lineHeight: 20, paddingHorizontal: 24 }}>
            Une identité vérifiée renforce la confiance : votre profil affiche le badge ✔ Vérifié et vous êtes mieux mis en avant dans les recherches.
          </Txt>
        </LinearGradient>

        {/* Status card */}
        {!loading && current && current.status !== "none" ? (
          <StatusCard doc={current} />
        ) : null}

        {/* Type de pièce */}
        {canEdit ? (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <Txt weight="700" size="md" style={{ marginBottom: 10 }}>Type de pièce</Txt>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(Object.keys(ID_LABELS) as IdType[]).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setIdType(k)}
                  style={[styles.chip, idType === k && styles.chipActive]}
                >
                  <Ionicons name={ID_LABELS[k].icon} size={14} color={idType === k ? colors.white : colors.midnight} />
                  <Text style={[styles.chipTxt, idType === k && { color: colors.white }]} numberOfLines={1}>
                    {ID_LABELS[k].label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 8 }}>{ID_LABELS[idType].hint}</Txt>
          </View>
        ) : null}

        {/* Uploaders */}
        {canEdit ? (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: 12 }}>
            <DocSlot
              label="Recto de la pièce"
              uri={docFront}
              onPickLibrary={() => pick("front", false)}
              onPickCamera={() => pick("front", true)}
            />
            {!passportNoBack ? (
              <DocSlot
                label="Verso de la pièce"
                uri={docBack}
                onPickLibrary={() => pick("back", false)}
                onPickCamera={() => pick("back", true)}
              />
            ) : null}
            <DocSlot
              label="Selfie de vérification"
              hint="Tenez votre pièce d'identité près de votre visage. Environnement bien éclairé."
              uri={selfie}
              onPickLibrary={() => pick("selfie", false)}
              onPickCamera={() => pick("selfie", true)}
            />
          </View>
        ) : null}

        {/* Legal / security note */}
        <View style={styles.legalCard}>
          <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
          <Txt size="xs" color={colors.textMuted} style={{ flex: 1, marginLeft: 8, lineHeight: 17 }}>
            Vos documents sont chiffrés et accessibles uniquement à notre équipe de vérification. Ils ne sont ni partagés ni revendus. Vous pouvez demander leur suppression à tout moment via le support.
          </Txt>
        </View>

        {/* Submit */}
        {canEdit ? (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <Btn
              title={current?.status === "rejected" || current?.status === "more_info" ? "Renvoyer mon dossier" : "Soumettre pour vérification"}
              icon="arrow-forward"
              onPress={submit}
              disabled={busy || submitting}
              loading={submitting}
              variant="primary"
              size="lg"
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── Status card ───────────────────────────────────────────────
function StatusCard({ doc }: { doc: KycDoc }) {
  const cfg = {
    pending: { icon: "hourglass-outline", bg: "#FEF9C3", ic: "#CA8A04", title: "En cours d'examen", body: "Notre équipe étudie votre dossier. Vous recevrez une notification (24-48h)." },
    approved: { icon: "checkmark-done", bg: "#DCFCE7", ic: "#16A34A", title: "Vérifié ✔", body: "Votre identité est confirmée. Le badge Vérifié apparaît sur votre profil." },
    rejected: { icon: "close-circle-outline", bg: "#FEE2E2", ic: "#DC2626", title: "Refusé", body: doc.rejection_reason || "Le dossier n'a pas pu être validé. Merci de renvoyer des documents plus lisibles." },
    more_info: { icon: "help-circle-outline", bg: "#DBEAFE", ic: "#2563EB", title: "Informations complémentaires demandées", body: doc.rejection_reason || "Merci de fournir des clichés plus lisibles." },
    none: null,
  }[doc.status];
  if (!cfg) return null;
  return (
    <View style={[styles.statusCard, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon as any} size={24} color={cfg.ic} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.midnight, letterSpacing: -0.1 }}>{cfg.title}</Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 }}>{cfg.body}</Text>
        {doc.submitted_at ? (
          <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 6 }}>
            Envoyé le {new Date(doc.submitted_at).toLocaleDateString("fr-FR")} · Version {doc.version || 1}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Doc slot ──────────────────────────────────────────────────
function DocSlot({
  label,
  uri,
  hint,
  onPickLibrary,
  onPickCamera,
}: {
  label: string;
  uri?: string;
  hint?: string;
  onPickLibrary: () => void;
  onPickCamera: () => void;
}) {
  return (
    <View style={styles.slot}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.midnight }}>{label}</Text>
        {uri ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="checkmark-circle" size={14} color={colors.turquoise} />
            <Text style={{ fontSize: 11, color: colors.turquoise, fontWeight: "700" }}>Ajouté</Text>
          </View>
        ) : null}
      </View>
      {hint ? <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 3, lineHeight: 15 }}>{hint}</Text> : null}
      <View style={{ marginTop: 10 }}>
        {uri ? (
          <View style={{ position: "relative" }}>
            <CompatibleImage uri={uri} style={styles.preview as any} transform={{ width: 400 }} />
            <View style={styles.previewOverlay}>
              <Pressable onPress={onPickLibrary} style={styles.smallBtn}>
                <Ionicons name="images" size={13} color={colors.white} />
                <Text style={styles.smallBtnTxt}>Remplacer</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.emptyPreview}>
            <Ionicons name="cloud-upload-outline" size={26} color={colors.textMuted} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Pressable onPress={onPickCamera} style={styles.slotBtn}>
                <Ionicons name="camera" size={14} color={colors.midnight} />
                <Text style={styles.slotBtnTxt}>Prendre en photo</Text>
              </Pressable>
              <Pressable onPress={onPickLibrary} style={styles.slotBtn}>
                <Ionicons name="images" size={14} color={colors.midnight} />
                <Text style={styles.slotBtnTxt}>Galerie</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  hero: {
    padding: spacing.xl, alignItems: "center",
    borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl,
  },
  heroIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", ...shadow.soft,
  },
  statusCard: {
    flexDirection: "row", alignItems: "flex-start",
    padding: spacing.md, marginHorizontal: spacing.xl, marginTop: spacing.xl,
    borderRadius: radius.lg,
  },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, height: 36, borderRadius: 999,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  chipTxt: { fontSize: 12, fontWeight: "700", color: colors.midnight, letterSpacing: -0.1 },
  slot: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    ...shadow.soft,
  },
  preview: { width: "100%", height: 180, borderRadius: radius.md, backgroundColor: colors.surface2 },
  previewOverlay: {
    position: "absolute", top: 8, right: 8,
  },
  smallBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, height: 30, borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  smallBtnTxt: { color: colors.white, fontSize: 11, fontWeight: "700" },
  emptyPreview: {
    height: 180, borderRadius: radius.md,
    backgroundColor: colors.surface2, borderStyle: "dashed", borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  slotBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, height: 34, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  slotBtnTxt: { color: colors.midnight, fontSize: 12, fontWeight: "700", letterSpacing: -0.1 },
  legalCard: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 14,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
  },
});
