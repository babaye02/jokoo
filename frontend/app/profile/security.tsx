// Écran Sécurité & confidentialité — change password, list active sessions info, RGPD.
import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Btn, Card, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setSuccess(null);
    if (next.length < 8) return setErr("Le nouveau mot de passe doit faire au moins 8 caractères.");
    if (next !== confirm) return setErr("La confirmation ne correspond pas au nouveau mot de passe.");
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      setCurrent(""); setNext(""); setConfirm("");
      setSuccess("Mot de passe mis à jour avec succès.");
    } catch (e: any) {
      setErr(e?.message || "Impossible de changer le mot de passe.");
    } finally {
      setSaving(false);
    }
  };

  const requestExport = () => {
    Alert.alert(
      "Export de mes données",
      "Vous recevrez par email une archive de vos données (RGPD, article 20) sous 30 jours.",
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="sec-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Sécurité & confidentialité</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons name="key-outline" size={18} color={colors.turquoise} />
            <Txt weight="700" style={{ marginLeft: 8 }}>Changer mon mot de passe</Txt>
          </View>
          <Input
            label="Mot de passe actuel"
            icon="lock-closed-outline"
            secureTextEntry
            value={current}
            onChangeText={setCurrent}
            testID="sec-current"
          />
          <Input
            label="Nouveau mot de passe (8+ caractères)"
            icon="lock-closed-outline"
            secureTextEntry
            value={next}
            onChangeText={setNext}
            testID="sec-next"
          />
          <Input
            label="Confirmer le nouveau"
            icon="lock-closed-outline"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            testID="sec-confirm"
          />
          {err ? (
            <View style={styles.errBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Txt size="xs" color={colors.danger} style={{ marginLeft: 6, flex: 1 }}>{err}</Txt>
            </View>
          ) : null}
          {success ? (
            <View style={styles.okBox}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Txt size="xs" color={colors.success} style={{ marginLeft: 6, flex: 1 }}>{success}</Txt>
            </View>
          ) : null}
          <Btn
            title="Mettre à jour"
            onPress={submit}
            loading={saving}
            disabled={!current || !next || !confirm || saving}
            fullWidth
            size="lg"
            style={{ marginTop: 8 }}
            testID="sec-save"
          />
        </Card>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.turquoise} />
            <Txt weight="700" style={{ marginLeft: 8 }}>Confidentialité de mes données</Txt>
          </View>
          <Row icon="download-outline" label="Exporter mes données (RGPD)" onPress={requestExport} />
          <Row icon="document-text-outline" label="Politique de confidentialité" onPress={() => router.push("/legal/politique-confidentialite")} />
          <Row icon="document-text-outline" label="Conditions générales d'utilisation" onPress={() => router.push("/legal/cgu-utilisateur")} />
        </Card>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons name="person-outline" size={18} color={colors.turquoise} />
            <Txt weight="700" style={{ marginLeft: 8 }}>Mon compte</Txt>
          </View>
          <Row icon="mail-outline" label="Email" hint={user?.email || "—"} />
          <Row icon="call-outline" label="Téléphone" hint={user?.phone || "—"} />
          <Row icon="alert-circle-outline" label="Supprimer mon compte" tint={colors.danger} onPress={() => router.push("/(tabs)/profile")} />
        </Card>
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, hint, onPress, tint }: any) {
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12 }}>
      <Ionicons name={icon} size={18} color={tint || colors.turquoise} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt weight="600" color={tint || colors.text}>{label}</Txt>
        {hint ? <Txt size="xxs" color={colors.textMuted} numberOfLines={1}>{hint}</Txt> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  errBox: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: radius.md, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", marginTop: 4 },
  okBox: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: radius.md, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#86EFAC", marginTop: 4 },
});
