import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import { api } from "@/src/api";
import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type LegalDoc = {
  slug: string;
  title: string;
  content: string;
  summary?: string;
  category: string;
  version: number;
  effective_date: string;
  updated_at: string;
  requires_acceptance: boolean;
  published: boolean;
  language: string;
  country: string;
};

type Version = LegalDoc & { id: string; author_id: string };

export default function AdminLegalEditor() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [requiresAcc, setRequiresAcc] = useState(false);
  const [published, setPublished] = useState(true);
  const [mode, setMode] = useState<"edit" | "preview" | "history">("edit");
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const d = await api.get<LegalDoc>(`/legal/documents/${slug}`);
      setDoc(d);
      setTitle(d.title); setContent(d.content); setSummary(d.summary || "");
      setRequiresAcc(d.requires_acceptance); setPublished(d.published);
      setDirty(false);
    } catch { /* ignore */ }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const loadVersions = async () => {
    try {
      const v = await api.get<Version[]>(`/admin/legal/documents/${slug}/versions`);
      setVersions(v);
    } catch { /* ignore */ }
  };

  useEffect(() => { if (mode === "history") loadVersions(); }, [mode]);

  // autosave draft locally (simple in-memory here)
  const save = async (publishFlag = published) => {
    if (!doc) return;
    setBusy(true);
    try {
      await api.request(`/admin/legal/documents/${slug}`, {
        method: "PUT",
        body: JSON.stringify({
          title: title.trim(), content, summary: summary.trim(),
          category: doc.category, language: doc.language, country: doc.country,
          requires_acceptance: requiresAcc, published: publishFlag,
        }),
      });
      Alert.alert("Enregistré", `Version ${(doc.version || 0) + 1} publiée.`);
      setDirty(false);
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setBusy(false);
    }
  };

  const restore = (v: number) => {
    Alert.alert("Restaurer cette version ?", `Cela créera une nouvelle version basée sur v${v}.`, [
      { text: "Non", style: "cancel" },
      {
        text: "Restaurer",
        onPress: async () => {
          try {
            await api.post(`/admin/legal/documents/${slug}/versions/${v}/restore`, {});
            await load();
            setMode("edit");
          } catch (e: any) { Alert.alert("Erreur", e.message); }
        },
      },
    ]);
  };

  if (!doc) return <View style={{ flex: 1, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}><Txt color={colors.textMuted}>Chargement…</Txt></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Txt size="md" weight="700" numberOfLines={1}>{doc.title}</Txt>
          <Txt size="xxs" color={colors.textMuted}>v{doc.version} · {doc.effective_date}</Txt>
        </View>
        {dirty ? <View style={styles.dirtyDot} /> : null}
      </SafeAreaView>

      {/* Mode tabs */}
      <View style={styles.tabs}>
        {(["edit", "preview", "history"] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m && styles.tabActive]}>
            <Ionicons name={m === "edit" ? "create" : m === "preview" ? "eye" : "time"} size={14} color={mode === m ? colors.white : colors.midnight} />
            <Txt size="xxs" weight="700" color={mode === m ? colors.white : colors.midnight} style={{ marginLeft: 4 }}>
              {m === "edit" ? "Éditer" : m === "preview" ? "Aperçu" : "Historique"}
            </Txt>
          </Pressable>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {mode === "edit" ? (
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160 + insets.bottom }}>
            <FieldLabel>Titre</FieldLabel>
            <TextInput value={title} onChangeText={(v) => { setTitle(v); setDirty(true); }} style={styles.input} />
            <FieldLabel>Résumé</FieldLabel>
            <TextInput value={summary} onChangeText={(v) => { setSummary(v); setDirty(true); }} style={styles.input} placeholder="Court résumé (SEO / listing)" />
            <FieldLabel>Contenu Markdown</FieldLabel>
            <TextInput
              value={content}
              onChangeText={(v) => { setContent(v); setDirty(true); }}
              style={[styles.input, styles.textarea]}
              multiline
              placeholder={`# Titre\n\nContenu…\n\n## Section\n\n- Puce\n- Puce`}
              placeholderTextColor={colors.textSubtle}
            />

            <View style={{ marginTop: spacing.md, gap: 8 }}>
              <Toggle label="Requiert acceptation obligatoire" active={requiresAcc} onPress={() => { setRequiresAcc((v) => !v); setDirty(true); }} icon="shield-checkmark" />
              <Toggle label="Publié (visible au public)" active={published} onPress={() => { setPublished((v) => !v); setDirty(true); }} icon="globe" />
            </View>
          </ScrollView>
        ) : mode === "preview" ? (
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom }}>
            <View style={styles.previewCard}>
              <Markdown style={mdStyles as any}>{content}</Markdown>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: 8 }}>
            {versions.length === 0 ? (
              <Txt color={colors.textMuted}>Aucune version antérieure.</Txt>
            ) : versions.map((v) => (
              <View key={v.id} style={styles.versionRow}>
                <View style={{ flex: 1 }}>
                  <Txt weight="700">Version {v.version}</Txt>
                  <Txt size="xxs" color={colors.textMuted}>
                    {v.updated_at?.slice(0, 16).replace("T", " ")} · Entrée : {v.effective_date}
                  </Txt>
                </View>
                <Pressable onPress={() => restore(v.version)} style={styles.restoreBtn}>
                  <Ionicons name="refresh" size={14} color={colors.turquoise} />
                  <Txt size="xxs" weight="700" color={colors.turquoise} style={{ marginLeft: 4 }}>Restaurer</Txt>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {mode === "edit" ? (
        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn title="Enregistrer & publier" icon="save" onPress={() => save(published)} loading={busy} fullWidth size="lg" testID="save-doc" />
        </View>
      ) : null}
    </View>
  );
}

function FieldLabel({ children }: any) {
  return <Txt size="xs" weight="700" color={colors.textMuted} style={{ marginTop: spacing.md, marginBottom: 6 }}>{children}</Txt>;
}

function Toggle({ label, active, onPress, icon }: any) {
  return (
    <Pressable onPress={onPress} style={[styles.toggle, active && styles.toggleActive]}>
      <Ionicons name={icon} size={16} color={active ? colors.white : colors.midnight} />
      <Txt weight="700" style={{ marginLeft: 8, flex: 1 }} color={active ? colors.white : colors.midnight}>{label}</Txt>
      <View style={[styles.switch, active && styles.switchOn]}><View style={[styles.knob, active && styles.knobOn]} /></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  dirtyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#F59E0B" },
  tabs: { flexDirection: "row", padding: 4, margin: spacing.xl, marginBottom: 0, backgroundColor: colors.surface, borderRadius: 999, ...shadow.soft },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 999 },
  tabActive: { backgroundColor: colors.midnight },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, fontSize: 15, color: colors.text,
  },
  textarea: { minHeight: 300, textAlignVertical: "top", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13 },
  previewCard: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, ...shadow.soft },
  versionRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.md, ...shadow.soft,
  },
  restoreBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.brandTertiary },
  toggle: {
    flexDirection: "row", alignItems: "center", padding: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toggleActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  switch: { width: 40, height: 22, borderRadius: 11, backgroundColor: colors.borderStrong, padding: 3, justifyContent: "center" },
  switchOn: { backgroundColor: colors.turquoise },
  knob: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.white },
  knobOn: { alignSelf: "flex-end" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});

const mdStyles = {
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  heading1: { color: colors.midnight, fontSize: 22, fontWeight: "800", marginTop: 4, marginBottom: 10 },
  heading2: { color: colors.midnight, fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  paragraph: { marginTop: 6, marginBottom: 6, lineHeight: 22 },
  strong: { fontWeight: "700" },
  link: { color: colors.turquoise, textDecorationLine: "underline" },
  blockquote: { backgroundColor: colors.brandTertiary, borderLeftWidth: 3, borderLeftColor: colors.turquoise, padding: 10, marginVertical: 8, borderRadius: 4 },
  hr: { backgroundColor: colors.divider, height: 1, marginVertical: 16 },
};
