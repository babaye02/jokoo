/**
 * CategoryPicker — Modal plein écran pour choisir une ou plusieurs catégories.
 * Grille 2 colonnes de tuiles colorées avec état "coché".
 */
import { useEffect, useState } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, ServiceCategory } from "@/src/api";
import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type Props = {
  visible: boolean;
  selected: string[]; // clés de catégories initialement sélectionnées
  onClose: () => void;
  onConfirm: (keys: string[]) => void;
};

export default function CategoryPicker({ visible, selected, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [picked, setPicked] = useState<string[]>(selected);

  useEffect(() => {
    if (!visible) return;
    setPicked(selected);
    setLoading(true);
    api
      .get<{ categories: ServiceCategory[] }>("/services/categories")
      .then((res) => setCats(res.categories || []))
      .finally(() => setLoading(false));
  }, [visible, selected]);

  const toggle = (k: string) =>
    setPicked((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable
          onPress={onClose}
          style={styles.iconBtn}
          hitSlop={10}
          testID="cat-picker-close"
          accessibilityLabel="Fermer"
        >
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700" style={{ flex: 1, textAlign: "center" }}>
          Choisir mes catégories
        </Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <Txt
        size="sm"
        color={colors.textMuted}
        style={{
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
          lineHeight: 20,
        }}
      >
        Sélectionnez toutes les catégories qui correspondent à votre activité. Vous pourrez y ajouter plusieurs métiers ensuite.
      </Txt>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.turquoise} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: 120 + insets.bottom,
          }}
        >
          <View style={styles.grid}>
            {cats.map((cat) => {
              const isPicked = picked.includes(cat.key);
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => toggle(cat.key)}
                  style={[styles.tile, isPicked && styles.tileActive]}
                  testID={`cat-tile-${cat.key}`}
                >
                  <View style={styles.tileTop}>
                    <Txt size="xxl">{cat.emoji}</Txt>
                    {isPicked ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.turquoise} />
                    ) : (
                      <View style={styles.circleEmpty} />
                    )}
                  </View>
                  <Txt size="sm" weight="700" numberOfLines={2}>
                    {cat.label}
                  </Txt>
                  <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 4 }}>
                    {cat.count} métiers
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      <View
        style={[
          styles.footer,
          { paddingBottom: 16 + insets.bottom },
        ]}
      >
        <Txt size="xs" color={colors.textMuted}>
          {picked.length === 0
            ? "Aucune catégorie sélectionnée"
            : `${picked.length} catégorie${picked.length > 1 ? "s" : ""} sélectionnée${picked.length > 1 ? "s" : ""}`}
        </Txt>
        <Btn
          title="Valider"
          onPress={() => onConfirm(picked)}
          testID="cat-picker-confirm"
          disabled={picked.length === 0}
        />
      </View>
    </Modal>
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tile: {
    width: "48%",
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileActive: {
    borderColor: colors.turquoise,
    backgroundColor: colors.brandTertiary,
  },
  tileTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  circleEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
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
