/**
 * SuggestServiceSheet — Bottom sheet pour suggérer un nouveau métier.
 * Le prestataire saisit label + catégorie + description courte, ça part
 * en attente de validation par un admin.
 */
import { useEffect, useState } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, ServiceCategory, ServiceSuggestion } from "@/src/api";
import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Props = {
  visible: boolean;
  initialLabel?: string;
  categories: ServiceCategory[];
  onClose: () => void;
  /** Callback appelé quand la suggestion est bien envoyée en base. */
  onSubmitted: (s: ServiceSuggestion) => void;
};

export default function SuggestServiceSheet({
  visible,
  initialLabel,
  categories,
  onClose,
  onSubmitted,
}: Props) {
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okDoc, setOkDoc] = useState<ServiceSuggestion | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLabel((initialLabel || "").trim());
    setCategory("other");
    setDescription("");
    setError(null);
    setOkDoc(null);
    setBusy(false);
  }, [visible, initialLabel]);

  const submit = async () => {
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setError("Merci d'indiquer un nom de métier (min 2 caractères).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const doc = await api.post<ServiceSuggestion>("/services/suggestions", {
        label: trimmed,
        category,
        description: description.trim() || undefined,
      });
      setOkDoc(doc);
    } catch (e: any) {
      setError(e?.message || "Impossible d'envoyer la suggestion.");
    } finally {
      setBusy(false);
    }
  };

  const useAsTemporary = () => {
    if (okDoc) onSubmitted(okDoc);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%" }}
        >
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            {/* Handle */}
            <View style={styles.handle} />

            <View style={styles.headerRow}>
              <Txt size="lg" weight="700">
                {okDoc ? "🎉 Suggestion envoyée" : "Suggérer un nouveau métier"}
              </Txt>
              <Pressable onPress={onClose} hitSlop={10} testID="suggest-close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: spacing.lg + insets.bottom }}
              keyboardShouldPersistTaps="handled"
            >
              {okDoc ? (
                <SuccessBlock
                  suggestion={okDoc}
                  onUseTemp={useAsTemporary}
                  onClose={onClose}
                />
              ) : (
                <>
                  <Txt size="sm" color={colors.textMuted} style={{ marginTop: 8, marginBottom: spacing.md }}>
                    Votre suggestion sera examinée par l&apos;équipe Jokoo. Vous pouvez continuer votre inscription en attendant.
                  </Txt>

                  {/* Label */}
                  <FormLabel text="Nom du métier" />
                  <TextInput
                    value={label}
                    onChangeText={setLabel}
                    placeholder="Ex. Réparateur de trottinettes"
                    placeholderTextColor={colors.textSubtle}
                    style={styles.input}
                    autoFocus
                    testID="suggest-label"
                    maxLength={60}
                  />

                  {/* Catégorie */}
                  <FormLabel text="Catégorie" style={{ marginTop: spacing.md }} />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                  >
                    {categories.map((c) => {
                      const active = c.key === category;
                      return (
                        <Pressable
                          key={c.key}
                          onPress={() => setCategory(c.key)}
                          style={[styles.chip, active && styles.chipActive]}
                          testID={`suggest-cat-${c.key}`}
                        >
                          <Txt size="sm" style={{ marginRight: 4 }}>
                            {c.emoji}
                          </Txt>
                          <Txt
                            size="xs"
                            weight="700"
                            color={active ? colors.white : colors.midnight}
                          >
                            {c.label}
                          </Txt>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* Description */}
                  <FormLabel text="Description (facultative)" style={{ marginTop: spacing.md }} />
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Décrivez brièvement ce que vous proposez…"
                    placeholderTextColor={colors.textSubtle}
                    style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
                    multiline
                    testID="suggest-desc"
                    maxLength={280}
                  />
                  <Txt size="xxs" color={colors.textSubtle} style={{ alignSelf: "flex-end", marginTop: 4 }}>
                    {description.length}/280
                  </Txt>

                  {error ? (
                    <View style={styles.errorBox}>
                      <Ionicons name="alert-circle" size={16} color={colors.danger} />
                      <Txt size="xs" color={colors.danger} style={{ marginLeft: 6, flex: 1 }}>
                        {error}
                      </Txt>
                    </View>
                  ) : null}

                  <View style={{ marginTop: spacing.lg }}>
                    {busy ? (
                      <View style={{ alignItems: "center", padding: 12 }}>
                        <ActivityIndicator color={colors.turquoise} />
                      </View>
                    ) : (
                      <Btn
                        onPress={submit}
                        testID="suggest-submit"
                        title="Envoyer la suggestion"
                      />
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function SuccessBlock({
  suggestion,
  onUseTemp,
  onClose,
}: {
  suggestion: ServiceSuggestion;
  onUseTemp: () => void;
  onClose: () => void;
}) {
  return (
    <View style={{ paddingTop: spacing.md, gap: 12 }}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark-circle" size={44} color={colors.turquoise} />
      </View>
      <Txt size="md" weight="700" style={{ textAlign: "center" }}>
        « {suggestion.label} »
      </Txt>
      <Txt size="sm" color={colors.textMuted} style={{ textAlign: "center" }}>
        Votre suggestion est en attente de validation par l&apos;équipe Jokoo. Vous serez notifié dès qu&apos;elle sera approuvée.
      </Txt>
      <View style={{ height: 6 }} />
      <Btn onPress={onUseTemp} title="Utiliser ce métier en attendant" testID="suggest-use-temp" />
      <Btn onPress={onClose} title="Fermer" variant="ghost" testID="suggest-close-final" />
    </View>
  );
}

function FormLabel({ text, style }: { text: string; style?: any }) {
  return (
    <Txt size="xs" weight="700" color={colors.textMuted} style={[{ marginBottom: 6 }, style]}>
      {text.toUpperCase()}
    </Txt>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(11,31,58,0.55)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
    maxHeight: "88%",
    ...shadow.strong,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface2,
    fontFamily: "Poppins",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.turquoise,
    borderColor: colors.turquoise,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    marginTop: spacing.md,
  },
  successIcon: {
    alignItems: "center",
    marginTop: spacing.md,
  },
});
