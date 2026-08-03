// Prestataire: create / edit provider profile with the new pricing model.
import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api, ServiceItem, PriceType } from "@/src/api";
import { Btn, Input, Txt } from "@/src/components/ui";
import ServicePicker from "@/src/components/ServicePicker";
import { colors, radius, shadow, spacing } from "@/src/theme";

const PRICE_TYPES: { key: PriceType; title: string; subtitle: string; icon: any }[] = [
  { key: "fixed", title: "Prix fixe", subtitle: "Ex. 15 000 F par prestation", icon: "pricetag" },
  { key: "from",  title: "À partir de…", subtitle: "Ex. Dès 10 000 F, prix affiné après échange", icon: "trending-up" },
  { key: "quote", title: "Devis sur demande", subtitle: "Vous envoyez un devis après avoir vu la demande", icon: "document-text" },
];

export default function ProviderProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [serviceKey, setServiceKey] = useState("plombier");
  const [customLabel, setCustomLabel] = useState<string | null>(null); // suggestion en attente
  const [pickerOpen, setPickerOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [priceType, setPriceType] = useState<PriceType>("fixed");
  const [priceAmount, setPriceAmount] = useState("15000");
  const [city, setCity] = useState(user?.city || "Dakar");
  const [zonesStr, setZonesStr] = useState("Dakar, Almadies, Plateau");
  const [hoursStr, setHoursStr] = useState("Lun-Sam · 8h-19h");
  const [loading, setLoading] = useState(false);

  const currentService = useMemo(
    () => services.find((s) => s.key === serviceKey),
    [services, serviceKey]
  );
  const isPending = serviceKey.startsWith("pending_");

  useEffect(() => {
    api.get<ServiceItem[]>("/services").then(setServices).catch(() => {});
    api.get(`/providers/${user?.id}`).then((p: any) => {
      if (!p) return;
      setServiceKey(p.service_key || "plombier");
      setDescription(p.description || "");
      const pt = (p.price_type as PriceType) || "quote";
      setPriceType(pt);
      setPriceAmount(p.price_amount != null ? String(p.price_amount) : "");
      setCity(p.city || "Dakar");
      setZonesStr((p.zones || []).join(", ") || "Dakar");
      setHoursStr(p.hours || "");
    }).catch(() => {});
  }, [user?.id]);

  const save = async () => {
    if (isPending) {
      Alert.alert(
        "Métier en attente de validation",
        "Votre métier est en attente d'approbation. Vous pourrez enregistrer votre profil dès qu'il aura été validé, ou choisissez un métier existant en attendant."
      );
      return;
    }
    if (priceType !== "quote") {
      const amt = parseFloat(priceAmount || "0");
      if (!amt || amt < 500) {
        Alert.alert("Prix invalide", "Indiquez un montant en FCFA (minimum 500 F).");
        return;
      }
    }
    setLoading(true);
    try {
      await api.post("/providers/me", {
        service: serviceKey,
        description,
        price_type: priceType,
        price_amount: priceType === "quote" ? null : parseFloat(priceAmount || "0"),
        city,
        zones: zonesStr.split(",").map((s) => s.trim()).filter(Boolean),
        hours: hoursStr,
        id_card: "mock-id-card-uploaded",
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
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={styles.pickerBtn}
            testID="open-service-picker"
            accessibilityRole="button"
          >
            <View style={[styles.pickerIcon, { backgroundColor: (currentService?.color || colors.turquoise) + "22" }]}>
              <Ionicons
                name={(currentService?.icon as any) || "briefcase-outline"}
                size={22}
                color={currentService?.color || colors.turquoise}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Txt size="md" weight="700" numberOfLines={1}>
                {currentService?.label || customLabel || "Choisir mon métier"}
              </Txt>
              <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                {isPending
                  ? "En attente de validation Jokoo"
                  : "Appuyez pour parcourir ou rechercher"}
              </Txt>
            </View>
            {isPending ? (
              <View style={styles.pendingPill}>
                <Ionicons name="time-outline" size={12} color="#B45309" />
                <Txt size="xxs" weight="700" color="#B45309" style={{ marginLeft: 4 }}>
                  En attente
                </Txt>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} style={{ marginLeft: 6 }} />
          </Pressable>
          <View style={{ height: spacing.xl }} />

          <Input
            label="Description"
            icon="document-text-outline"
            placeholder="Présentez-vous, précisez ce que vous facturez par prestation…"
            multiline
            numberOfLines={4}
            style={{ height: 110, textAlignVertical: "top", paddingTop: 12 }}
            value={description}
            onChangeText={setDescription}
          />

          {/* Pricing block */}
          <Txt size="md" weight="700" style={{ marginBottom: spacing.md, marginTop: spacing.sm }}>
            Comment facturez-vous ?
          </Txt>
          <Txt size="xs" color={colors.textMuted} style={{ marginBottom: spacing.md, lineHeight: 18 }}>
            {"Choisissez le mode qui convient à votre activité. Jokoo ne facture jamais à l'heure."}
          </Txt>

          {PRICE_TYPES.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setPriceType(opt.key)}
              style={[styles.optRow, priceType === opt.key && styles.optRowActive]}
              testID={`price-type-${opt.key}`}
            >
              <View style={[styles.optIcon, { backgroundColor: priceType === opt.key ? colors.brandTertiary : colors.surface2 }]}>
                <Ionicons name={opt.icon} size={20} color={priceType === opt.key ? colors.turquoise : colors.midnight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Txt weight="700">{opt.title}</Txt>
                <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>{opt.subtitle}</Txt>
              </View>
              <View style={[styles.radio, priceType === opt.key && styles.radioActive]}>
                {priceType === opt.key ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          ))}

          {priceType !== "quote" ? (
            <Input
              label={priceType === "from" ? "Prix de départ (F CFA)" : "Prix fixe (F CFA)"}
              icon="cash-outline"
              placeholder="Ex : 15000"
              keyboardType="numeric"
              value={priceAmount}
              onChangeText={setPriceAmount}
              testID="price-amount-input"
            />
          ) : (
            <View style={styles.info}>
              <Ionicons name="information-circle" size={18} color={colors.turquoise} />
              <Txt size="sm" color={colors.text} style={{ flex: 1, marginLeft: 8, lineHeight: 20 }}>
                {"Aucun montant n'est affiché aux clients. Vous leur enverrez un devis personnalisé après avoir lu leur demande."}
              </Txt>
            </View>
          )}

          <View style={{ height: spacing.lg }} />
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

      <ServicePicker
        visible={pickerOpen}
        currentKey={serviceKey}
        onClose={() => setPickerOpen(false)}
        onPick={(svc) => {
          setServiceKey(svc.key);
          setCustomLabel(svc.label);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chip: { flexDirection: "row", alignItems: "center", height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  optRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    marginBottom: 10,
  },
  optRowActive: { borderColor: colors.turquoise, backgroundColor: "#F0FBF8" },
  optIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.turquoise },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.turquoise },
  info: {
    flexDirection: "row", alignItems: "flex-start",
    padding: 12, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    marginBottom: spacing.md, marginTop: 4,
  },
  upload: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", alignItems: "center", backgroundColor: colors.surface2 },
});
