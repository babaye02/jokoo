import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Share } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type LegalDoc = {
  slug: string;
  title: string;
  content: string;
  category: string;
  version: number;
  effective_date: string;
  updated_at: string;
  requires_acceptance: boolean;
  language: string;
  country: string;
};

export default function LegalDocView() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const loadDoc = () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    api
      .get<LegalDoc>(`/legal/documents/${slug}`)
      .then((d) => {
        setDoc(d);
        setError(null);
      })
      .catch((e: any) => {
        setDoc(null);
        if (e?.status === 404) {
          setError("Ce document n'est pas encore disponible. Contactez le support si le problème persiste.");
        } else if (e?.status >= 500) {
          setError("Impossible de charger le document. Vérifiez votre connexion et réessayez.");
        } else {
          setError(e?.message || "Une erreur est survenue lors du chargement.");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDoc();
    // Récupère les acceptations du user pour ce slug afin d'afficher l'état correct
    api
      .get<{ slug: string; version: number; accepted_at: string }[]>("/legal/acceptances/mine")
      .then((rows) => {
        setAccepted(Array.isArray(rows) && rows.some((r) => r.slug === slug));
      })
      .catch(() => { /* silent : user could re-accept */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const accept = async () => {
    if (!doc || !user) return;
    setAccepting(true);
    try {
      await api.post("/legal/acceptances", { slug: doc.slug, version: doc.version });
      setAccepted(true);
      setTimeout(() => router.back(), 1200);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible d'enregistrer l'acceptation.");
    } finally {
      setAccepting(false);
    }
  };

  const share = async () => {
    if (!doc) return;
    try {
      await Share.share({ title: doc.title, message: `${doc.title} — Jokoo\n${doc.content.slice(0, 200)}…` });
    } catch { /* ignore */ }
  };

  // States: loading / error / doc loaded
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
        <SafeAreaView edges={["top"]} style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back} testID="doc-back">
            <Ionicons name="chevron-back" size={22} color={colors.midnight} />
          </Pressable>
          <Txt size="lg" weight="700" style={{ flex: 1, marginHorizontal: 8 }}>Chargement…</Txt>
        </SafeAreaView>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
          <Txt color={colors.textMuted} style={{ marginTop: 12 }}>Chargement du document…</Txt>
        </View>
      </View>
    );
  }

  if (error || !doc) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
        <SafeAreaView edges={["top"]} style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back} testID="doc-back">
            <Ionicons name="chevron-back" size={22} color={colors.midnight} />
          </Pressable>
          <Txt size="lg" weight="700" style={{ flex: 1, marginHorizontal: 8 }}>Document indisponible</Txt>
        </SafeAreaView>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl }}>
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.turquoise} />
          </View>
          <Txt size="lg" weight="700" style={{ marginTop: 8, textAlign: "center" }}>
            Document introuvable
          </Txt>
          <Txt color={colors.textMuted} style={{ marginTop: 8, textAlign: "center", lineHeight: 22 }}>
            {error || "Ce document n'a pas pu être chargé."}
          </Txt>
          <View style={{ height: 20 }} />
          <Btn title="Réessayer" icon="refresh" onPress={loadDoc} size="md" />
          <View style={{ height: 8 }} />
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Txt color={colors.textMuted} weight="600">Retour</Txt>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="doc-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700" numberOfLines={1} style={{ flex: 1, marginHorizontal: 8 }}>
          {doc.title}
        </Txt>
        <Pressable onPress={share} style={styles.back} testID="doc-share">
          <Ionicons name="share-outline" size={20} color={colors.midnight} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: (doc.requires_acceptance ? 130 : 40) + insets.bottom }}>
        <View style={styles.versionBar}>
          <Ionicons name="document-text" size={14} color={colors.turquoise} />
          <Txt size="xxs" weight="700" style={{ marginLeft: 6 }}>
            Version {doc.version} · Entrée en vigueur : {doc.effective_date}
          </Txt>
          <View style={{ flex: 1 }} />
          <Txt size="xxs" color={colors.textMuted}>
            {doc.language.toUpperCase()} · {doc.country}
          </Txt>
        </View>

        <View style={styles.contentCard}>
          <Markdown style={mdStyles as any}>{doc.content}</Markdown>
        </View>
      </ScrollView>

      {doc.requires_acceptance && user ? (
        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn
            title={accepted ? "✓ Acceptation enregistrée" : "J'accepte cette version"}
            icon={accepted ? "checkmark" : "shield-checkmark"}
            onPress={accept}
            loading={accepting}
            disabled={accepted}
            fullWidth
            size="lg"
            testID="doc-accept"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  errorIcon: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  versionBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    marginBottom: spacing.md,
  },
  contentCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
});

const mdStyles = {
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  heading1: { color: colors.midnight, fontSize: 22, fontWeight: "800", marginTop: 4, marginBottom: 10 },
  heading2: { color: colors.midnight, fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  heading3: { color: colors.midnight, fontSize: 16, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  paragraph: { marginTop: 6, marginBottom: 6, lineHeight: 22 },
  bullet_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  strong: { fontWeight: "700" },
  em: { fontStyle: "italic" },
  link: { color: colors.turquoise, textDecorationLine: "underline" },
  blockquote: {
    backgroundColor: colors.brandTertiary,
    borderLeftWidth: 3,
    borderLeftColor: colors.turquoise,
    padding: 10,
    marginVertical: 8,
    borderRadius: 4,
  },
  hr: { backgroundColor: colors.divider, height: 1, marginVertical: 16 },
  code_inline: { backgroundColor: colors.surface2, paddingHorizontal: 4, borderRadius: 3, fontSize: 13 },
};
