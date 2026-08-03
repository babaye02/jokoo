/**
 * ServicePicker — Modal plein écran pour choisir un ou plusieurs métiers.
 *
 * Modes :
 *   - single (défaut) : ancien comportement, on ferme après sélection.
 *   - multi           : cases à cocher, bouton "Valider" en bas.
 *
 * Props optionnelles :
 *   - filterCategories : n'afficher que les catégories cochées (utilisé
 *     dans le flow provider où l'utilisateur choisit d'abord ses catégories).
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
import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import SuggestServiceSheet from "./SuggestServiceSheet";

type SingleProps = {
  visible: boolean;
  currentKey?: string;
  title?: string;
  mode?: "single";
  onClose: () => void;
  onPick: (svc: ServiceItem) => void;
};

type MultiProps = {
  visible: boolean;
  mode: "multi";
  selectedKeys: string[];
  filterCategories?: string[];
  title?: string;
  onClose: () => void;
  onConfirmMulti: (services: ServiceItem[]) => void;
};

type Props = SingleProps | MultiProps;

export default function ServicePicker(props: Props) {
  const { visible, onClose } = props;
  const mode = props.mode || "single";
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [multiPicked, setMultiPicked] = useState<Set<string>>(new Set());

  const currentKey = mode === "single" ? (props as SingleProps).currentKey : undefined;
  const filterCategories =
    mode === "multi" ? (props as MultiProps).filterCategories : undefined;

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setLoading(true);
    api
      .get<{ categories: ServiceCategory[] }>("/services/categories")
      .then((res) => {
        const list = res.categories || [];
        setCats(list);
        if (mode === "multi") {
          setMultiPicked(new Set((props as MultiProps).selectedKeys || []));
          const initialExpand: Record<string, boolean> = {};
          for (const c of list) {
            if (!filterCategories || filterCategories.includes(c.key)) {
              initialExpand[c.key] = true;
            }
          }
          setExpanded(initialExpand);
        } else {
          if (currentKey) {
            const cat = list.find((c) => c.services.some((s) => s.key === currentKey));
            if (cat) setExpanded((e) => ({ ...e, [cat.key]: true }));
          }
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const visibleCats = useMemo(() => {
    if (mode === "multi" && filterCategories && filterCategories.length > 0) {
      return cats.filter((c) => filterCategories.includes(c.key));
    }
    return cats;
  }, [cats, mode, filterCategories]);

  const q = query.trim().toLowerCase();
  const flatSearchResults: ServiceItem[] = useMemo(() => {
    if (q.length < 1) return [];
    const bag: ServiceItem[] = [];
    for (const cat of visibleCats) {
      for (const svc of cat.services) {
        const hay = `${svc.label} ${svc.key} ${cat.label}`.toLowerCase();
        if (hay.includes(q)) bag.push(svc);
      }
    }
    bag.sort((a, b) => {
      const ai = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bi = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return a.label.localeCompare(b.label);
    });
    return bag;
  }, [q, visibleCats]);

  const toggleCat = (k: string) => setExpanded((e) => ({ ...e, [k]: !e[k] }));

  const handlePress = (svc: ServiceItem) => {
    if (mode === "single") {
      (props as SingleProps).onPick(svc);
    } else {
      setMultiPicked((prev) => {
        const next = new Set(prev);
        if (next.has(svc.key)) next.delete(svc.key);
        else next.add(svc.key);
        return next;
      });
    }
  };

  const confirmMulti = () => {
    if (mode !== "multi") return;
    const flat: ServiceItem[] = [];
    for (const cat of cats) {
      for (const svc of cat.services) {
        if (multiPicked.has(svc.key)) flat.push(svc);
      }
    }
    (props as MultiProps).onConfirmMulti(flat);
  };

  const handlePickBySuggestion = (s: ServiceSuggestion) => {
    setSuggestOpen(false);
    const svc: ServiceItem = {
      key: s.generated_key || `pending_${s.id}`,
      label: s.label,
      icon: "briefcase-outline",
      color: "#64748B",
      category: s.category || "other",
    };
    if (mode === "single") (props as SingleProps).onPick(svc);
    else setMultiPicked((prev) => new Set([...prev, svc.key]));
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
          {props.title || (mode === "multi" ? "Choisir mes métiers" : "Choisir un métier")}
        </Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

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
            paddingBottom: (mode === "multi" ? 130 : 120) + insets.bottom,
            paddingTop: spacing.sm,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {q.length >= 1 ? (
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
                  mode={mode}
                  selected={mode === "single" ? svc.key === currentKey : multiPicked.has(svc.key)}
                  onPress={() => handlePress(svc)}
                />
              ))}
              {flatSearchResults.length === 0 ? (
                <SuggestCta onPress={() => setSuggestOpen(true)} label={query} />
              ) : null}
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {visibleCats.map((cat) => {
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
                            mode={mode}
                            selected={
                              mode === "single"
                                ? svc.key === currentKey
                                : multiPicked.has(svc.key)
                            }
                            onPress={() => handlePress(svc)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              <SuggestCta onPress={() => setSuggestOpen(true)} />
            </View>
          )}
        </ScrollView>
      )}

      {mode === "multi" ? (
        <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
          <Txt size="xs" color={colors.textMuted}>
            {multiPicked.size === 0
              ? "Aucun métier sélectionné"
              : `${multiPicked.size} métier${multiPicked.size > 1 ? "s" : ""} sélectionné${multiPicked.size > 1 ? "s" : ""}`}
          </Txt>
          <Btn
            title="Valider"
            onPress={confirmMulti}
            testID="svc-picker-confirm-multi"
            disabled={multiPicked.size === 0}
          />
        </View>
      ) : null}

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
  mode,
  onPress,
}: {
  svc: ServiceItem;
  selected?: boolean;
  mode: "single" | "multi";
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
      {mode === "multi" ? (
        selected ? (
          <Ionicons name="checkbox" size={22} color={colors.turquoise} />
        ) : (
          <Ionicons name="square-outline" size={22} color={colors.borderStrong} />
        )
      ) : selected ? (
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
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
});
