// Prestataire: create / edit provider profile (my provider record).
import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api, ServiceItem } from "@/src/api";
import { Btn, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function ProviderProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [serviceKey, setServiceKey] = useState("plombier");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("5000");
  const [city, setCity] = useState(user?.city || "Dakar");
  const [zonesStr, setZonesStr] = useState("Dakar, Almadies, Plateau");
  const [hoursStr, setHoursStr] = useState("Lun-Sam · 8h-19h");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<ServiceItem[]>("/services").then(setServices).catch(() => {});
    api.get(`/providers/${user?.id}`).then((p: any) => {
      if (!p) return;
      setServiceKey(p.service_key || "plombier");
      setDescription(p.description || "");
      setPrice(String(p.hourly_price || 5000));
      setCity(p.city || "Dakar");
      setZonesStr((p.zones || []).join(", ") || "Dakar");
      setHoursStr(p.hours || "");
    }).catch(() => {});
  }, [user?.id]);

  const save = async () => {
    setLoading(true);
    try {
      await api.post("/providers/me", {
        service: serviceKey,
        description,
        hourly_price: parseFloat(price || "0"),
        city,
        zones: zonesStr.split(",").map((s) => s.trim()).filter(Boolean),
        hours: hoursStr,
        id_card: "mock-id-card-uploaded",  // demo verification
      });
      Alert.alert("Profil enregistré", "Votre profil prestataire est à jour.");
      router.back();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Profil prestataire</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Txt size="md" weight="700" style={{ marginBottom: spacing.md }}>Votre métier</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.xl }}>
            {services.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => setServiceKey(s.key)}
                style={[styles.chip, serviceKey === s.key && styles.chipActive]}
                testID={`svc-${s.key}`}
              >
                <Ionicons name={s.icon as any} size={14} color={serviceKey === s.key ? colors.white : colors.midnight} />
                <Txt weight="600" color={serviceKey === s.key ? colors.white : colors.midnight} style={{ marginLeft: 6 }}>{s.label}</Txt>
              </Pressable>
            ))}
          </View>

          <Input label="Description" icon="document-text-outline" placeholder="Présentez-vous en quelques lignes…" multiline numberOfLines={4} style={{ height: 100, textAlignVertical: "top", paddingTop: 12 }} value={description} onChangeText={setDescription} />
          <Input label="Tarif horaire (F CFA)" icon="cash-outline" keyboardType="numeric" value={price} onChangeText={setPrice} />
          <Input label="Ville" icon="location-outline" value={city} onChangeText={setCity} />
          <Input label="Zones d'intervention" icon="map-outline" placeholder="Dakar, Almadies, Plateau" value={zonesStr} onChangeText={setZonesStr} />
          <Input label="Horaires" icon="time-outline" placeholder="Lun-Sam · 8h-19h" value={hoursStr} onChangeText={setHoursStr} />

          <View style={styles.upload}>
            <Ionicons name="cloud-upload-outline" size={28} color={colors.turquoise} />
            <Txt weight="700" style={{ marginTop: 8 }}>{"Vérification d'identité"}</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4, textAlign: "center" }}>{"Téléchargement de pièce d'identité (démo)"}</Txt>
            <Btn title="Simuler l'upload" variant="secondary" style={{ marginTop: 10 }} onPress={() => Alert.alert("Vérifié", "Pièce d'identité téléchargée (démo)")} />
          </View>

          <Btn title="Enregistrer" onPress={save} loading={loading} fullWidth size="lg" style={{ marginTop: spacing.xl }} testID="provider-save" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  upload: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", alignItems: "center", backgroundColor: colors.surface2 },
});
