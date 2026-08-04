// Admin CRM Push — Création d'une campagne (titre, message, image, deep link, CTA, segment, envoi imm./programmé).
import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, TextInput, Text, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api";
import { uploadToCloudinary } from "@/src/media/cloudinary";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type SegType = "all" | "clients" | "prestataires" | "verified" | "unverified" | "category" | "city" | "new_signups" | "inactive" | "manual";

const SEGMENTS: { key: SegType; label: string; icon: string; hint?: string }[] = [
  { key: "all",           label: "Tous les utilisateurs", icon: "people" },
  { key: "clients",       label: "Tous les clients",      icon: "person" },
  { key: "prestataires",  label: "Tous les prestataires", icon: "briefcase" },
  { key: "verified",      label: "Utilisateurs vérifiés", icon: "checkmark-circle" },
  { key: "unverified",    label: "Non-vérifiés",          icon: "help-circle" },
  { key: "category",      label: "Une catégorie",         icon: "grid",       hint: "Ex : plombier, coiffeuse" },
  { key: "city",          label: "Une ville",             icon: "location",   hint: "Ex : Dakar, Saint-Louis" },
  { key: "new_signups",   label: "Nouveaux inscrits",     icon: "sparkles",   hint: "≤ 7 jours" },
  { key: "inactive",      label: "Inactifs",              icon: "moon",       hint: "≥ 30 jours sans activité" },
  { key: "manual",        label: "Sélection manuelle",    icon: "list",       hint: "IDs utilisateurs séparés par virgules" },
];

export default function CreateCampaign() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ template?: string }>();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deepLink, setDeepLink] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [segment, setSegment] = useState<SegType>("all");
  const [segParams, setSegParams] = useState<{ value?: string; user_ids?: string }>({});
  const [mode, setMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledAt, setScheduledAt] = useState(""); // YYYY-MM-DDTHH:MM
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Chargement d'un template si passé en paramètre
  useEffect(() => {
    const tplKey = typeof params.template === "string" ? params.template : "";
    if (!tplKey) return;
    (async () => {
      try {
        const list = await api.get<any[]>("/admin/push/templates");
        const tpl = list.find((t) => t.key === tplKey);
        if (tpl) {
          setTitle(tpl.title_template);
          setMessage(tpl.message_template);
          setImageUrl(tpl.image_url || null);
          setDeepLink(tpl.deep_link || "");
          setCtaText(tpl.cta_text || "");
        }
      } catch { /* silent */ }
    })();
  }, [params.template]);

  const doPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const seg = buildSegment(segment, segParams);
      const r = await api.post<{ count: number }>("/admin/push/preview", { segment: seg });
      setPreviewCount(r.count);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible d'estimer l'audience.");
    } finally { setPreviewing(false); }
  }, [segment, segParams]);

  const pickImage = async () => {
    try {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert("Permission", "Autorisez l'accès à la galerie."); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setUploading(true);
      const url = await uploadToCloudinary(res.assets[0].uri, "jokoo/push-campaigns");
      setImageUrl(url);
    } catch (e: any) {
      Alert.alert("Upload échoué", e?.message || "Impossible d'uploader l'image.");
    } finally { setUploading(false); }
  };

  const submit = async () => {
    if (!title.trim() || !message.trim()) { Alert.alert("Champs requis", "Titre et message obligatoires."); return; }
    if (mode === "scheduled" && !scheduledAt) { Alert.alert("Date requise", "Choisissez une date et heure."); return; }
    setSubmitting(true);
    try {
      const seg = buildSegment(segment, segParams);
      const body: any = {
        title: title.trim(), message: message.trim(),
        image_url: imageUrl || undefined,
        deep_link: deepLink.trim() || undefined,
        cta_text: ctaText.trim() || undefined,
        segment: seg,
        mode,
      };
      if (mode === "scheduled") {
        // Convert local input to UTC ISO
        const d = new Date(scheduledAt);
        if (isNaN(d.getTime())) throw new Error("Date invalide");
        body.scheduled_at = d.toISOString();
      }
      const r = await api.post<any>("/admin/push/campaigns", body);
      const msg = mode === "immediate"
        ? `Envoi en cours à ${r.stats?.targeted ?? "…"} destinataires.`
        : `Programmée pour ${new Date(body.scheduled_at).toLocaleString("fr-FR")}.`;
      Alert.alert("Campagne créée ✅", msg, [
        { text: "OK", onPress: () => router.replace("/admin/push") },
      ]);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Création impossible.");
    } finally { setSubmitting(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="cr-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Nouvelle campagne</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 + insets.bottom, gap: spacing.md }}>
        {/* Contenu */}
        <Card style={{ padding: spacing.md, gap: 12 }}>
          <Section icon="text" title="Contenu" />
          <Input label="Titre" value={title} onChangeText={setTitle} placeholder="Ex : Nouvelle offre 🔥" maxLength={120} testID="c-title" />
          <Input label="Message" value={message} onChangeText={setMessage} placeholder="Le texte affiché dans la notification" multiline maxLength={500} testID="c-msg" />
          <View>
            <Text style={styles.label}>Image (facultative)</Text>
            {imageUrl ? (
              <View style={{ position: "relative" }}>
                <Pressable onPress={pickImage} disabled={uploading}>
                  <Text style={{ color: colors.turquoise, textDecorationLine: "underline" }} numberOfLines={1}>{imageUrl}</Text>
                </Pressable>
                <Pressable onPress={() => setImageUrl(null)} style={{ marginTop: 4 }}>
                  <Txt size="xs" color={colors.danger}>Retirer l&apos;image</Txt>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={pickImage} style={styles.uploadBtn} disabled={uploading} testID="c-img">
                {uploading ? <ActivityIndicator color={colors.turquoise} /> : <>
                  <Ionicons name="cloud-upload" size={18} color={colors.turquoise} />
                  <Txt size="sm" weight="700" color={colors.turquoise} style={{ marginLeft: 6 }}>Ajouter une image</Txt>
                </>}
              </Pressable>
            )}
          </View>
          <Input label="Deep link (facultatif)" value={deepLink} onChangeText={setDeepLink} placeholder="/promo-codes ou /(tabs)/search" testID="c-link" />
          <Input label="Texte du bouton (facultatif)" value={ctaText} onChangeText={setCtaText} placeholder="Ex : En profiter" maxLength={40} testID="c-cta" />
        </Card>

        {/* Segment */}
        <Card style={{ padding: spacing.md, gap: 10 }}>
          <Section icon="people" title="Destinataires" />
          {SEGMENTS.map((s) => (
            <Pressable key={s.key} onPress={() => { setSegment(s.key); setPreviewCount(null); }} style={[styles.seg, segment === s.key && styles.segOn]}>
              <View style={[styles.segIcon, segment === s.key && { backgroundColor: colors.turquoise }]}>
                <Ionicons name={s.icon as any} size={16} color={segment === s.key ? colors.white : colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="700" size="sm">{s.label}</Txt>
                {s.hint ? <Txt size="xxs" color={colors.textMuted}>{s.hint}</Txt> : null}
              </View>
              {segment === s.key ? <Ionicons name="checkmark-circle" size={18} color={colors.turquoise} /> : null}
            </Pressable>
          ))}
          {segment === "category" || segment === "city" ? (
            <Input label={segment === "category" ? "Clé du métier (ex: plombier)" : "Nom de la ville"} value={segParams.value || ""} onChangeText={(v) => setSegParams((p) => ({ ...p, value: v }))} testID="c-seg-val" />
          ) : null}
          {segment === "manual" ? (
            <Input label="IDs utilisateurs (séparés par virgule)" value={segParams.user_ids || ""} onChangeText={(v) => setSegParams((p) => ({ ...p, user_ids: v }))} multiline testID="c-seg-ids" />
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Pressable style={styles.preview} onPress={doPreview} disabled={previewing} testID="c-preview">
              {previewing ? <ActivityIndicator color={colors.turquoise} /> : <>
                <Ionicons name="eye" size={16} color={colors.turquoise} />
                <Txt size="xs" weight="700" color={colors.turquoise} style={{ marginLeft: 6 }}>Estimer l&apos;audience</Txt>
              </>}
            </Pressable>
            {previewCount !== null ? (
              <Txt size="xs" weight="700">{previewCount} personne(s)</Txt>
            ) : null}
          </View>
        </Card>

        {/* Envoi */}
        <Card style={{ padding: spacing.md, gap: 10 }}>
          <Section icon="paper-plane" title="Envoi" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable style={[styles.modeBtn, mode === "immediate" && styles.modeOn]} onPress={() => setMode("immediate")} testID="c-imm">
              <Ionicons name="flash" size={18} color={mode === "immediate" ? colors.white : colors.textMuted} />
              <Txt weight="700" size="sm" color={mode === "immediate" ? colors.white : colors.text} style={{ marginTop: 4 }}>Immédiat</Txt>
            </Pressable>
            <Pressable style={[styles.modeBtn, mode === "scheduled" && styles.modeOn]} onPress={() => setMode("scheduled")} testID="c-sched">
              <Ionicons name="calendar" size={18} color={mode === "scheduled" ? colors.white : colors.textMuted} />
              <Txt weight="700" size="sm" color={mode === "scheduled" ? colors.white : colors.text} style={{ marginTop: 4 }}>Programmé</Txt>
            </Pressable>
          </View>
          {mode === "scheduled" ? (
            <Input
              label="Date et heure (YYYY-MM-DDTHH:MM)"
              value={scheduledAt}
              onChangeText={setScheduledAt}
              placeholder="Ex : 2026-06-15T18:00"
              testID="c-date"
            />
          ) : null}
        </Card>

        <Btn title={submitting ? "Envoi…" : (mode === "immediate" ? "🚀 Envoyer maintenant" : "📅 Programmer")} loading={submitting} onPress={submit} fullWidth />
      </ScrollView>
    </View>
  );
}

function buildSegment(type: SegType, p: { value?: string; user_ids?: string }): any {
  if (type === "category") return { type, params: { category: p.value?.trim() } };
  if (type === "city") return { type, params: { city: p.value?.trim() } };
  if (type === "manual") return { type, params: { user_ids: (p.user_ids || "").split(/[,\s]+/).filter(Boolean) } };
  return { type };
}

function Section({ icon, title }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <Ionicons name={icon} size={18} color={colors.turquoise} />
      <Txt weight="700">{title}</Txt>
    </View>
  );
}

function Input({ label, value, onChangeText, placeholder, multiline, maxLength, testID, keyboardType }: any) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        multiline={multiline}
        maxLength={maxLength}
        autoCapitalize="sentences"
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }]}
        keyboardType={keyboardType}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 11, letterSpacing: 1, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  input: { fontSize: 15, color: colors.text, backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  seg: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 12, gap: 10, borderWidth: 1, borderColor: colors.border },
  segOn: { borderColor: colors.turquoise, backgroundColor: `${colors.turquoise}10` },
  segIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  preview: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: `${colors.turquoise}15`, borderWidth: 1, borderColor: `${colors.turquoise}50` },
  modeBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: colors.surface2 },
  modeOn: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: `${colors.turquoise}15`, borderWidth: 1, borderColor: `${colors.turquoise}50` },
});
