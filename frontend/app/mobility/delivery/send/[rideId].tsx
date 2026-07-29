import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform, Image } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, Ride } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Btn, Card, Chip, ErrorBox, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function SendParcel() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [ride, setRide] = useState<Ride | null>(null);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState("2");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<"app" | "cash">("app");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!rideId) return;
    api.get<Ride>(`/rides/${rideId}`).then(setRide).catch(() => setRide(null));
  }, [rideId]);

  useEffect(() => {
    // Restrict payment options to those the driver accepts
    if (!ride?.parcel_payment_mode) return;
    if (ride.parcel_payment_mode === "app_only") setPaymentMode("app");
    if (ride.parcel_payment_mode === "cash_only") setPaymentMode("cash");
  }, [ride?.parcel_payment_mode]);

  if (!ride) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}>
        <Txt color={colors.textMuted}>Chargement…</Txt>
      </View>
    );
  }

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission requise", "Autorisez l'accès à vos photos pour joindre une image du colis.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
      allowsEditing: true,
    });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      const b64 = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      setPhoto(b64);
    }
  };

  const submit = async () => {
    setErr(null);
    if (!pickup.trim()) return setErr("Indiquez l'adresse de ramassage");
    if (!dropoff.trim()) return setErr("Indiquez l'adresse de livraison");
    if (!description.trim()) return setErr("Décrivez brièvement le colis");
    if (!recipientName.trim()) return setErr("Nom du destinataire requis");
    if (!recipientPhone.trim()) return setErr("Téléphone du destinataire requis");
    const w = parseFloat((weight || "0").replace(",", "."));
    if (isNaN(w) || w <= 0) return setErr("Poids invalide");
    if (w > (ride.parcel_max_kg || 0)) return setErr(`Poids max autorisé : ${ride.parcel_max_kg} kg`);
    setBusy(true);
    try {
      await api.post(`/rides/${ride.id}/parcel`, {
        pickup_address: pickup.trim(),
        dropoff_address: dropoff.trim(),
        description: description.trim(),
        weight_kg: w,
        recipient_name: recipientName.trim(),
        recipient_phone: recipientPhone.trim(),
        photo,
        payment_mode: paymentMode,
      });
      Alert.alert(
        "Demande envoyée",
        "Le conducteur va examiner votre demande. Vous serez notifié.",
        [{ text: "OK", onPress: () => router.replace("/mobility/delivery/mine") }],
      );
    } catch (e: any) {
      setErr(e.message || "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const showApp = ride.parcel_payment_mode !== "cash_only";
  const showCash = ride.parcel_payment_mode !== "app_only";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="parcel-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Envoyer un colis</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160 + insets.bottom }} keyboardShouldPersistTaps="handled">
          {/* Ride summary */}
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.parcelIcon}>
                <Txt size="xl">📦</Txt>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Txt size="md" weight="700">{ride.from_city} → {ride.to_city}</Txt>
                <Txt size="xs" color={colors.textMuted}>
                  {ride.date} · {ride.time} · Conducteur : {ride.driver_name}
                </Txt>
                <Txt size="xs" color={colors.turquoise} weight="700" style={{ marginTop: 4 }}>
                  Dès {formatXof(ride.parcel_price_xof || 0)} · max {ride.parcel_max_kg} kg
                </Txt>
              </View>
            </View>
          </Card>

          <ErrorBox text={err} />

          <SectionTitle icon="location" label="Adresses" />
          <Input label="Ramassage" icon="pin" placeholder={`Adresse à ${ride.from_city}`} value={pickup} onChangeText={setPickup} testID="parcel-pickup" />
          <Input label="Livraison" icon="flag" placeholder={`Adresse à ${ride.to_city}`} value={dropoff} onChangeText={setDropoff} testID="parcel-dropoff" />

          <SectionTitle icon="cube" label="Détails du colis" />
          <Input
            label="Description"
            placeholder="Ex. Vêtements, documents, appareil électronique…"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            style={{ height: 90, textAlignVertical: "top", paddingTop: 12 }}
            testID="parcel-desc"
          />
          <Input
            label={`Poids (kg) · max ${ride.parcel_max_kg}`}
            icon="barbell-outline"
            keyboardType="numeric"
            value={weight}
            onChangeText={(v) => setWeight(v.replace(/[^0-9.,]/g, ""))}
            testID="parcel-weight"
          />

          {/* Photo */}
          <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Photo du colis (facultatif)</Txt>
          {photo ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: photo }} style={styles.photo} />
              <Pressable onPress={() => setPhoto(null)} style={styles.removePhoto} testID="parcel-photo-remove">
                <Ionicons name="close" size={16} color={colors.white} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={pickImage} style={styles.photoBtn} testID="parcel-photo-add">
              <Ionicons name="camera" size={20} color={colors.turquoise} />
              <Txt weight="600" color={colors.turquoise} style={{ marginLeft: 8 }}>Ajouter une photo</Txt>
            </Pressable>
          )}

          <SectionTitle icon="person" label="Destinataire" />
          <Input label="Nom complet" icon="person" placeholder="Ex. Aïcha Diallo" value={recipientName} onChangeText={setRecipientName} testID="parcel-recipient-name" />
          <Input label="Téléphone" icon="call" placeholder="+2217712345678" keyboardType="phone-pad" value={recipientPhone} onChangeText={setRecipientPhone} testID="parcel-recipient-phone" />

          <SectionTitle icon="card" label="Paiement" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {showApp ? (
              <Chip label="En app · Sécurisé" icon="phone-portrait" active={paymentMode === "app"} onPress={() => setPaymentMode("app")} testID="parcel-pay-app" />
            ) : null}
            {showCash ? (
              <Chip label="Espèces à la livraison" icon="cash" active={paymentMode === "cash"} onPress={() => setPaymentMode("cash")} testID="parcel-pay-cash" />
            ) : null}
          </View>
          <Txt size="xs" color={colors.textMuted} style={{ marginTop: 8 }}>
            {paymentMode === "app"
              ? "Le montant sera prélevé lors de l'acceptation par le conducteur."
              : "Vous payez en espèces au destinataire ou au conducteur."}
          </Txt>

          <View style={styles.totalRow}>
            <Txt weight="700">Prix estimé</Txt>
            <Txt size="xl" weight="700" color={colors.turquoise}>{formatXof(ride.parcel_price_xof || 0)}</Txt>
          </View>
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn title="Envoyer la demande" onPress={submit} loading={busy} fullWidth size="lg" testID="parcel-submit" />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SectionTitle({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.md }}>
      <Ionicons name={icon} size={16} color={colors.turquoise} />
      <Txt size="md" weight="700" style={{ marginLeft: 8 }}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  parcelIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.turquoise,
    borderStyle: "dashed",
    backgroundColor: colors.brandTertiary,
  },
  photoWrap: { position: "relative", alignSelf: "flex-start", marginBottom: spacing.md },
  photo: { width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.surface3 },
  removePhoto: {
    position: "absolute",
    top: -6, right: -6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.danger,
    alignItems: "center", justifyContent: "center",
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
});
