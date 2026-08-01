// Écran Paramètres — préférences utilisateur (langue, notifications).
import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Switch, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { storage } from "@/src/utils/storage";
import { Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const LANG_KEY = "jokoo_lang";
const NOTIF_BOOKINGS = "jokoo_notif_bookings";
const NOTIF_MESSAGES = "jokoo_notif_messages";
const NOTIF_MARKETING = "jokoo_notif_marketing";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [lang, setLang] = useState<"fr" | "wo" | "en">("fr");
  const [notifBookings, setNotifBookings] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);
  const [notifMarketing, setNotifMarketing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const l = await storage.getItem<string>(LANG_KEY, "fr");
        if (l === "fr" || l === "wo" || l === "en") setLang(l);
        setNotifBookings(await storage.getItem<boolean>(NOTIF_BOOKINGS, true) as boolean);
        setNotifMessages(await storage.getItem<boolean>(NOTIF_MESSAGES, true) as boolean);
        setNotifMarketing(await storage.getItem<boolean>(NOTIF_MARKETING, false) as boolean);
      } catch { /* noop */ }
    })();
  }, []);

  const setLangSaved = async (l: "fr" | "wo" | "en") => {
    setLang(l);
    await storage.setItem(LANG_KEY, l);
    // Note : les traductions live nécessitent i18n — mais on persiste le choix.
    if (l !== "fr") {
      Alert.alert(
        "Bientôt disponible",
        l === "wo"
          ? "Ndakaru Jokoo bi ci Wolof di lay wax ci suf. Nu ngi ko def."
          : "The English version will be available soon.",
      );
    }
  };

  const toggle = async (key: string, val: boolean, setter: (v: boolean) => void) => {
    setter(val);
    await storage.setItem(key, val);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="settings-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Paramètres</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        <Card>
          <Txt size="sm" weight="700" style={{ marginBottom: 10 }}>Langue de l&apos;application</Txt>
          {([
            { k: "fr", label: "Français", icon: "🇫🇷" },
            { k: "wo", label: "Wolof",    icon: "🇸🇳" },
            { k: "en", label: "English",  icon: "🇬🇧" },
          ] as const).map((o) => (
            <Pressable key={o.k} onPress={() => setLangSaved(o.k)} style={[styles.row, lang === o.k && styles.rowActive]}>
              <Txt size="lg">{o.icon}</Txt>
              <Txt weight="600" style={{ flex: 1, marginLeft: 12 }}>{o.label}</Txt>
              {lang === o.k ? <Ionicons name="checkmark-circle" size={20} color={colors.turquoise} /> : null}
            </Pressable>
          ))}
        </Card>

        <Card>
          <Txt size="sm" weight="700" style={{ marginBottom: 10 }}>Notifications</Txt>
          <Row label="Réservations & devis" hint="Nouvelles demandes, confirmations, annulations" value={notifBookings} onChange={(v) => toggle(NOTIF_BOOKINGS, v, setNotifBookings)} />
          <Row label="Messages" hint="Chat avec vos clients et prestataires" value={notifMessages} onChange={(v) => toggle(NOTIF_MESSAGES, v, setNotifMessages)} />
          <Row label="Offres & promotions" hint="Actualités Jokoo et bons plans" value={notifMarketing} onChange={(v) => toggle(NOTIF_MARKETING, v, setNotifMarketing)} />
        </Card>

        <Card>
          <Txt size="sm" weight="700" style={{ marginBottom: 6 }}>{"À propos"}</Txt>
          <Row label="Centre juridique" hint="CGU, confidentialité, mentions légales" onPress={() => router.push("/legal")} />
          <Row label="Aide & contact" hint="FAQ, support Jokoo" onPress={() => router.push("/profile/help")} />
        </Card>
      </ScrollView>
    </View>
  );
}

function Row({ label, hint, value, onChange, onPress }: { label: string; hint?: string; value?: boolean; onChange?: (v: boolean) => void; onPress?: () => void }) {
  const isSwitch = typeof value === "boolean";
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }}>
      <View style={{ flex: 1 }}>
        <Txt weight="600">{label}</Txt>
        {hint ? <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>{hint}</Txt> : null}
      </View>
      {isSwitch ? (
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.turquoise, false: colors.border }} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
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
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md },
  rowActive: { backgroundColor: colors.brandTertiary },
});
