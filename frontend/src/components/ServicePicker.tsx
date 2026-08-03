/**
 * ServicePicker — Modal plein écran pour choisir un métier.
 *
 * - Barre de recherche en haut (filtre live sur label + catégorie)
 * - Métiers regroupés par catégorie avec accordéons
 * - Bouton "Mon métier n'est pas listé" → ouvre le SuggestServiceSheet
 *
 * Usage :
 *   <ServicePicker
 *     visible={open}
 *     currentKey={serviceKey}
 *     onClose={() => setOpen(false)}
 *     onPick={(svc) => { setKey(svc.key); setOpen(false); }}
 *   />
 */
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, ServiceCategory, ServiceItem, ServiceSuggestion } from "@/src/api";
import { Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import SuggestServiceSheet from "./SuggestServiceSheet";

type Props = {
  visible: boolean;
  currentKey?: string;
  title?: string;
  onClose: () => void;
  onPick: (svc: ServiceItem) => void;
};

export default function ServicePicker({ visible, currentKey, title, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api
      .get<{ categories: ServiceCategory[] }>("/services/categories")
      .then((res) => {
        setCats(res.categories || []);
        // Pré-ouvre la catégorie du métier courant si applicable.
        if (currentKey) {
          const cat = (res.categories || []).find((c) =>
            c.services.some((s) => s.key === currentKey)
          );
          if (cat) setExpanded((e) => ({ ...e, [cat.key]: true }));
        }
      })
      .finally(() => setLoading(false));
  }, [visible, currentKey]);

  // Résultat filtré : quand une requête est saisie on écrase l'accordéon
  // pour montrer tous les résultats à plat.
  const q = query.trim().toLowerCase();
  const flatSearchResults: ServiceItem[] = useMemo(() => {
    if (q.length < 1) return [];
    const bag: ServiceItem[] = [];
    for (const cat of cats) {
      for (const svc of cat.services) {
        const hay = `${svc.label} ${svc.key} ${cat.label}`.toLowerCase();
        if (hay.includes(q)) bag.push(svc);
      }
    }
    // Prioriser les correspondances en début de label
    bag.sort((a, b) => {
      const ai = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bi = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return a.label.localeCompare(b.label);
    });
    return bag;
  }, [q, cats]);

  const toggleCat = (k: string) => setExpanded((e) => ({ ...e, [k]: !e[k] }));

  const handlePickBySuggestion = (s: ServiceSuggestion) => {
    // Optimistic : on considère que la suggestion pending sert de "métier temporaire".
    // Le prestataire pourra continuer son inscription.
    setSuggestOpen(false);
    onPick({
      key: s.generated_key || `pending_${s.id}`,
      label: s.label,
      icon: "briefcase-outline",
      color: "#64748B",
      category: s.category || "other",
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable
          onPress={onClose}
          style={styles.iconBtn}
          hitSlop={10}
          testID="svc-picker-close"
          accessibilityLabel="Fermer"
        >
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700" numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>
          {title || "Choisir un métier"}
        </Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Barre de recherche */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher un métier (ex. coiffeuse, plombier)…"
            placeholderTextColor={colors.textSubtle}
            style={styles.searchInput}
            testID="svc-picker-search"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} testID="svc-picker-clear">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.turquoise} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: 120 + insets.bottom,
            paddingTop: spacing.sm,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {q.length >= 1 ? (
            // Résultats de recherche à plat
            <View style={{ gap: 8 }}>
              <Txt size="sm" color={colors.textMuted} style={{ marginTop: 4 }}>
                {flatSearchResults.length === 0
                  ? "Aucun métier ne correspond. Vous pouvez le suggérer 👇"
                  : `${flatSearchResults.length} résultat${flatSearchResults.length > 1 ? "s" : ""}`}
              </Txt>
              {flatSearchResults.map((svc) => (
                <ServiceRow
                  key={svc.key}
                  svc={svc}
                  selected={svc.key === currentKey}
                  onPress={() => onPick(svc)}
                />
              ))}
              {flatSearchResults.length === 0 ? (
                <SuggestCta onPress={() => setSuggestOpen(true)} label={query} />
              ) : null}
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {cats.map((cat) => {
                if (cat.count === 0) return null;
                const isOpen = expanded[cat.key];
                return (
                  <View key={cat.key} style={styles.catCard}>
                    <Pressable
                      onPress={() => toggleCat(cat.key)}
                      style={styles.catHeader}
                      testID={`svc-cat-${cat.key}`}
                    >
                      <Txt size="lg" style={{ marginRight: 8 }}>
                        {cat.emoji}
                      </Txt>
                      <Txt size="md" weight="700" style={{ flex: 1 }}>
                        {cat.label}
                      </Txt>
                      <View style={styles.countPill}>
                        <Txt size="xxs" weight="700" color={colors.textMuted}>
                          {cat.count}
                        </Txt>
                      </View>
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={colors.textMuted}
                        style={{ marginLeft: 6 }}
                      />
                    </Pressable>
                    {isOpen ? (
                      <View style={styles.catBody}>
                        {cat.services.map((svc) => (
                          <ServiceRow
                            key={svc.key}
                            svc={svc}
                            selected={svc.key === currentKey}
                            onPress={() => onPick(svc)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {/* CTA suggérer à la fin de la liste */}
              <SuggestCta onPress={() => setSuggestOpen(true)} />
            </View>
          )}
        </ScrollView>
      )}

      <SuggestServiceSheet
        visible={suggestOpen}
        initialLabel={query}
        categories={cats}
        onClose={() => setSuggestOpen(false)}
        onSubmitted={handlePickBySuggestion}
      />
    </Modal>
  );
}

function ServiceRow({
  svc,
  selected,
  onPress,
}: {
  svc: ServiceItem;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && { opacity: 0.85 },
      ]}
      testID={`svc-row-${svc.key}`}
    >
      <View style={[styles.rowIcon, { backgroundColor: (svc.color || colors.turquoise) + "22" }]}>
        <Ionicons name={svc.icon as any} size={18} color={svc.color || colors.turquoise} />
      </View>
      <Txt size="sm" weight="600" style={{ flex: 1 }}>
        {svc.label}
      </Txt>
      {selected ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.turquoise} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
      )}
    </Pressable>
  );
}

function SuggestCta({ onPress, label }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.suggestCta}
      testID="svc-picker-suggest"
      accessibilityRole="button"
    >
      <Ionicons name="add-circle" size={22} color={colors.turquoise} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Txt size="sm" weight="700" color={colors.midnight}>
          Mon métier n&apos;est pas listé
        </Txt>
        <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
          {label ? `Suggérer « ${label} » à l'équipe Jokoo` : "Suggérer un nouveau métier à l'équipe"}
        </Txt>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.turquoise} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  searchWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
    fontFamily: "Poppins",
  },
  catCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  countPill: {
    backgroundColor: colors.surface2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  catBody: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 4,
    backgroundColor: colors.surface2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowSelected: {
    borderColor: colors.turquoise,
    backgroundColor: colors.brandTertiary,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  suggestCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.turquoise,
    borderStyle: "dashed",
    marginTop: 12,
  },
});
