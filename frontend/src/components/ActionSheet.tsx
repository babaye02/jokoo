// Bottom-sheet action menu — remplaçant fiable pour Alert.alert(title, msg, buttons).
// Sur navigateur web, Alert.alert avec plusieurs actions ne fonctionne pas correctement.
// Ce composant marche partout (iOS, Android, Web) et supporte les actions destructives.
import React from "react";
import { View, StyleSheet, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Txt } from "./ui";
import { colors, radius, spacing } from "../theme";

export type ActionItem = {
  id: string;
  label: string;
  icon?: any;
  destructive?: boolean;
  hint?: string;
  onPress: () => void | Promise<void>;
};

export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
  testID,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: ActionItem[];
  onClose: () => void;
  testID?: string;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} testID={testID}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {title ? (
            <View style={styles.head}>
              <Txt size="lg" weight="700" style={{ textAlign: "center" }}>{title}</Txt>
              {subtitle ? (
                <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4, textAlign: "center" }}>{subtitle}</Txt>
              ) : null}
            </View>
          ) : null}
          {actions.map((a, i) => (
            <Pressable
              key={a.id}
              onPress={async () => {
                onClose();
                // Attendre la fin de l'animation de fermeture avant d'exécuter l'action
                // (évite les problèmes de double modal sur web/Android).
                setTimeout(() => { a.onPress(); }, 350);
              }}
              style={[
                styles.row,
                i === 0 && !title ? { borderTopLeftRadius: 24, borderTopRightRadius: 24 } : null,
              ]}
              testID={`action-${a.id}`}
            >
              {a.icon ? (
                <Ionicons name={a.icon} size={20} color={a.destructive ? colors.danger : colors.turquoise} />
              ) : null}
              <View style={{ flex: 1, marginLeft: a.icon ? 12 : 0 }}>
                <Txt weight="600" color={a.destructive ? colors.danger : colors.text}>{a.label}</Txt>
                {a.hint ? <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>{a.hint}</Txt> : null}
              </View>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={styles.cancel} testID="action-cancel">
            <Txt weight="700" color={colors.textMuted}>Annuler</Txt>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Confirmation modale (in-app, plus fiable que Alert.alert sur navigateur web).
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  destructive,
  onConfirm,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  testID?: string;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlayCenter} onPress={onClose} testID={testID}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={[styles.iconWrap, { backgroundColor: destructive ? "#FEE2E2" : colors.brandTertiary }]}>
            <Ionicons name={destructive ? "warning" : "help-circle"} size={22} color={destructive ? colors.danger : colors.turquoise} />
          </View>
          <Txt size="lg" weight="700" style={{ textAlign: "center", marginTop: 12 }}>{title}</Txt>
          {message ? (
            <Txt size="sm" color={colors.textMuted} style={{ textAlign: "center", marginTop: 6, lineHeight: 20 }}>{message}</Txt>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.lg }}>
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]} testID="dialog-cancel">
              <Txt weight="700" color={colors.textMuted}>{cancelLabel}</Txt>
            </Pressable>
            <Pressable
              onPress={async () => { onClose(); setTimeout(() => onConfirm(), 350); }}
              style={[styles.btn, { backgroundColor: destructive ? colors.danger : colors.turquoise }]}
              testID="dialog-confirm"
            >
              <Txt weight="700" color={colors.white}>{confirmLabel}</Txt>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  overlayCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, paddingBottom: 30 },
  head: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md },
  cancel: { padding: spacing.md, alignItems: "center", marginTop: 4, borderTopWidth: 1, borderTopColor: colors.divider },
  card: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  iconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  btn: { flex: 1, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  btnGhost: { backgroundColor: colors.surface2 },
});
