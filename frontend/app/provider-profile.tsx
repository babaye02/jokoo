/**
 * Provider Profile (v2) — Hub complet du prestataire.
 *
 * Blocs :
 *   1. Bandeau (cover_photo + avatar) éditables
 *   2. Catégories (multi-sélection via CategoryPicker)
 *   3. Métiers regroupés par catégorie (multi-sélection via ServicePicker mode="multi")
 *   4. Description
 *   5. Tarification globale (fixe / dès / devis) — reste, sert de fallback
 *   6. Ville / zones / horaires
 *   7. Lien vers "Gérer mes prestations & prix"
 */
import { useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api, PriceType, ServiceCategory, ServiceItem } from "@/src/api";
import { Btn, Input, Txt } from "@/src/components/ui";
import ServicePicker from "@/src/components/ServicePicker";
import CategoryPicker from "@/src/components/CategoryPicker";
import WeeklyAvailabilityEditor, {
  DEFAULT_WEEKLY_AVAILABILITY,
  WeeklyAvailability,
} from "@/src/components/WeeklyAvailabilityEditor";
import { colors, radius, shadow, spacing } from "@/src/theme";

const PRICE_TYPES: { key: PriceType; title: string; subtitle: string; icon: any }[] = [
  { key: "fixed", title: "Prix fixe", subtitle: "Ex. 15 000 F par prestation", icon: "pricetag" },
  { key: "from",  title: "À partir de…", subtitle: "Ex. Dès 10 000 F, prix affiné après échange", icon: "trending-up" },
  { key: "quote", title: "Devis sur demande", subtitle: "Vous envoyez un devis après avoir vu la demande", icon: "document-text" },
];

type ServiceMode = "at_client" | "at_venue" | "both";
const MODE_OPTIONS: { key: ServiceMode; title: string; subtitle: string; icon: any }[] = [
  { key: "at_client", title: "🏠 Je me déplace chez le client", subtitle: "Vous vous rendez au domicile ou au bureau du client", icon: "car-outline" },
  { key: "at_venue",  title: "🏢 Je reçois dans mon établissement", subtitle: "Salon, cabinet ou atelier — vos clients viennent chez vous", icon: "storefront-outline" },
  { key: "both",      title: "🔄 Les deux", subtitle: "Le client choisira à la réservation", icon: "swap-horizontal-outline" },
];

export default function ProviderProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // catalogue complet groupé par catégorie
  const [catalog, setCatalog] = useState<ServiceCategory[]>([]);
  // sélection v2
  const [categories, setCategories] = useState<string[]>([]);
  const [trades, setTrades] = useState<string[]>([]);
  // photos
  const [photo, setPhoto] = useState<string | null>(null);
  const [coverPhoto, setCoverPhoto] = useState<string | null>(null);
  // autres champs
  const [description, setDescription] = useState("");
  const [priceType, setPriceType] = useState<PriceType>("quote");
  const [priceAmount, setPriceAmount] = useState("");
  const [city, setCity] = useState(user?.city || "Dakar");
  const [zonesStr, setZonesStr] = useState("Dakar, Almadies, Plateau");
  const [hoursStr, setHoursStr] = useState("Lun-Sam · 8h-19h");
  // v2.1 — mode d'intervention & dispos
  const [serviceMode, setServiceMode] = useState<ServiceMode>("at_client");
  const [venueAddress, setVenueAddress] = useState("");
  const [travelFee, setTravelFee] = useState("");
  const [weekly, setWeekly] = useState<WeeklyAvailability>(DEFAULT_WEEKLY_AVAILABILITY);
  const [unavailableDates, setUnavailableDates] = useState<{ date: string; reason?: string }[]>([]);
  const [newUnavDate, setNewUnavDate] = useState("");
  // pickers
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [tradesPickerOpen, setTradesPickerOpen] = useState(false);
  // state
  const [loading, setLoading] = useState(false);

  // ---- Load catalog + existing profile ----
  useEffect(() => {
    api
      .get<{ categories: ServiceCategory[] }>("/services/categories")
      .then((r) => setCatalog(r.categories || []))
      .catch(() => {});
    if (!user?.id) return;
    api
      .get(`/providers/${user.id}`)
      .then((p: any) => {
        if (!p) return;
        setCategories(p.categories || []);
        setTrades(p.trades || (p.service_key ? [p.service_key] : []));
        setPhoto(p.photo || null);
        setCoverPhoto(p.cover_photo || null);
        setDescription(p.description || "");
        const pt = (p.price_type as PriceType) || "quote";
        setPriceType(pt);
        setPriceAmount(p.price_amount != null ? String(p.price_amount) : "");
        setCity(p.city || "Dakar");
        setZonesStr((p.zones || []).join(", ") || "Dakar");
        setHoursStr(p.hours || "");
        setServiceMode((p.service_mode as ServiceMode) || "at_client");
        setVenueAddress(p.venue_address || "");
        setTravelFee(p.travel_fee_xof != null ? String(p.travel_fee_xof) : "");
        if (p.weekly_availability && typeof p.weekly_availability === "object") {
          setWeekly({ ...DEFAULT_WEEKLY_AVAILABILITY, ...p.weekly_availability });
        }
        setUnavailableDates(Array.isArray(p.unavailable_dates) ? p.unavailable_dates : []);
      })
      .catch(() => {});
  }, [user?.id]);

  // Métiers regroupés par catégorie sélectionnée (pour l'affichage en chips)
  const tradesByCategory = useMemo(() => {
    const out: Record<string, { key: string; label: string; icon: string; color: string }[]> = {};
    for (const cat of catalog) {
      const inCat = cat.services.filter((s) => trades.includes(s.key));
      if (inCat.length) out[cat.key] = inCat;
    }
    // Ajouter aussi les métiers pending (générés depuis suggestion)
    const pending = trades.filter((t) => t.startsWith("pending_"));
    if (pending.length) {
      out.__pending__ = pending.map((k) => ({
        key: k,
        label: k.replace("pending_", "En attente #"),
        icon: "time-outline",
        color: "#F59E0B",
      }));
    }
    return out;
  }, [catalog, trades]);

  const catLabels = useMemo(() => {
    const m: Record<string, { emoji: string; label: string }> = {};
    for (const c of catalog) m[c.key] = { emoji: c.emoji, label: c.label };
    return m;
  }, [catalog]);

  // ---- Image pickers ----
  const pickImage = async (kind: "photo" | "cover") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission requise", "Autorisez l'accès à vos photos pour continuer.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
      allowsEditing: true,
      aspect: kind === "cover" ? [16, 9] : [1, 1],
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    const dataUrl = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
    if (kind === "photo") setPhoto(dataUrl);
    else setCoverPhoto(dataUrl);
  };

  // ---- Save ----
  const save = async () => {
    if (trades.length === 0) {
      Alert.alert("Métier requis", "Choisissez au moins un métier avant d'enregistrer votre profil.");
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
        categories,
        trades,
        // legacy compat
        service: undefined,
        description,
        price_type: priceType,
        price_amount: priceType === "quote" ? null : parseFloat(priceAmount || "0"),
        city,
        zones: zonesStr.split(",").map((s) => s.trim()).filter(Boolean),
        hours: hoursStr,
        photo,
        cover_photo: coverPhoto,
        // v2.1 — mode d'intervention + dispos
        service_mode: serviceMode,
        venue_address: serviceMode === "at_client" ? null : venueAddress || null,
        venue_city: city,
        travel_fee_xof: serviceMode === "at_venue" ? null : parseFloat(travelFee || "0") || 0,
        weekly_availability: weekly,
        unavailable_dates: unavailableDates,
        id_card: "mock-id-card-uploaded",
      });
      Alert.alert("Profil enregistré", "Votre profil prestataire est à jour.");
      router.back();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible d'enregistrer.");
    } finally {
      setLoading(false);
    }
  };

  const totalTrades = trades.length;
  const totalCategories = categories.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="pp-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Profil prestataire</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Bandeau : cover + avatar */}
          <View style={styles.coverWrap}>
            <Pressable onPress={() => pickImage("cover")} style={styles.cover} testID="pp-cover">
              {coverPhoto ? (
                <Image source={{ uri: coverPhoto }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.coverPlaceholder]}>
                  <Ionicons name="image-outline" size={26} color={colors.textMuted} />
                  <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
                    Ajouter une photo de couverture
                  </Txt>
                </View>
              )}
              <View style={styles.coverEdit}>
                <Ionicons name="camera" size={14} color={colors.midnight} />
              </View>
            </Pressable>

            <Pressable onPress={() => pickImage("photo")} style={styles.avatarBtn} testID="pp-avatar">
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <View style={styles.avatarImg}>
                  <Ionicons name="person" size={30} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.avatarEdit}>
                <Ionicons name="camera" size={12} color={colors.white} />
              </View>
            </Pressable>
          </View>

          <View style={{ padding: spacing.xl, paddingTop: 40 }}>
            {/* Bloc catégories */}
            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <View style={{ flex: 1 }}>
                  <Txt size="md" weight="700">Mes catégories</Txt>
                  <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                    Sélectionnez toutes les catégories qui correspondent à votre activité
                  </Txt>
                </View>
                <Pressable
                  onPress={() => setCatPickerOpen(true)}
                  style={styles.editBtn}
                  testID="pp-edit-cats"
                  hitSlop={8}
                >
                  <Ionicons name="create-outline" size={16} color={colors.turquoise} />
                  <Txt size="xs" weight="700" color={colors.turquoise} style={{ marginLeft: 4 }}>
                    Modifier
                  </Txt>
                </Pressable>
              </View>
              {totalCategories === 0 ? (
                <Pressable
                  onPress={() => setCatPickerOpen(true)}
                  style={styles.emptyState}
                  testID="pp-add-cats"
                >
                  <Ionicons name="add-circle" size={22} color={colors.turquoise} />
                  <Txt size="sm" weight="700" color={colors.midnight} style={{ marginLeft: 8 }}>
                    Ajouter des catégories
                  </Txt>
                </Pressable>
              ) : (
                <View style={styles.chipsRow}>
                  {categories.map((k) => {
                    const meta = catLabels[k];
                    return (
                      <View key={k} style={styles.chipCat}>
                        <Txt size="sm">{meta?.emoji || "✨"}</Txt>
                        <Txt size="xs" weight="700" style={{ marginLeft: 6 }}>
                          {meta?.label || k}
                        </Txt>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Bloc métiers */}
            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <View style={{ flex: 1 }}>
                  <Txt size="md" weight="700">Mes métiers</Txt>
                  <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                    {totalTrades > 0
                      ? `${totalTrades} métier${totalTrades > 1 ? "s" : ""} · vous pouvez en avoir plusieurs`
                      : "Vous pouvez sélectionner plusieurs métiers"}
                  </Txt>
                </View>
                <Pressable
                  onPress={() => {
                    if (categories.length === 0) {
                      Alert.alert(
                        "Catégories requises",
                        "Choisissez d'abord au moins une catégorie."
                      );
                      return;
                    }
                    setTradesPickerOpen(true);
                  }}
                  style={styles.editBtn}
                  testID="pp-edit-trades"
                  hitSlop={8}
                >
                  <Ionicons name="create-outline" size={16} color={colors.turquoise} />
                  <Txt size="xs" weight="700" color={colors.turquoise} style={{ marginLeft: 4 }}>
                    Modifier
                  </Txt>
                </Pressable>
              </View>

              {totalTrades === 0 ? (
                <Pressable
                  onPress={() => {
                    if (categories.length === 0) {
                      Alert.alert(
                        "Catégories requises",
                        "Choisissez d'abord au moins une catégorie."
                      );
                      return;
                    }
                    setTradesPickerOpen(true);
                  }}
                  style={styles.emptyState}
                  testID="pp-add-trades"
                >
                  <Ionicons name="add-circle" size={22} color={colors.turquoise} />
                  <Txt size="sm" weight="700" color={colors.midnight} style={{ marginLeft: 8 }}>
                    Ajouter des métiers
                  </Txt>
                </Pressable>
              ) : (
                <View style={{ gap: 12 }}>
                  {Object.entries(tradesByCategory).map(([catKey, items]) => {
                    const meta =
                      catKey === "__pending__"
                        ? { emoji: "⏱", label: "En attente de validation" }
                        : catLabels[catKey] || { emoji: "✨", label: catKey };
                    return (
                      <View key={catKey}>
                        <Txt size="xxs" weight="700" color={colors.textMuted} style={{ marginBottom: 6 }}>
                          {meta.emoji}  {meta.label.toUpperCase()}
                        </Txt>
                        <View style={styles.chipsRow}>
                          {items.map((it) => (
                            <View
                              key={it.key}
                              style={[
                                styles.chipTrade,
                                catKey === "__pending__" && styles.chipTradePending,
                              ]}
                            >
                              <Ionicons
                                name={it.icon as any}
                                size={12}
                                color={it.color || colors.midnight}
                              />
                              <Txt
                                size="xs"
                                weight="700"
                                style={{ marginLeft: 5 }}
                                numberOfLines={1}
                              >
                                {it.label}
                              </Txt>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Description */}
            <View style={styles.block}>
              <Txt size="md" weight="700" style={{ marginBottom: 6 }}>
                À propos de vous
              </Txt>
              <Input
                icon="document-text-outline"
                placeholder="Présentez-vous, précisez vos spécialités, votre expérience…"
                multiline
                numberOfLines={4}
                style={{ height: 110, textAlignVertical: "top", paddingTop: 12 }}
                value={description}
                onChangeText={setDescription}
              />
            </View>

            {/* Tarification globale (fallback) */}
            <View style={styles.block}>
              <Txt size="md" weight="700" style={{ marginBottom: 4 }}>
                Tarification globale
              </Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginBottom: spacing.md, lineHeight: 18 }}>
                Utilisée en affichage rapide sur les cartes. Vous pourrez fixer des prix précis pour chaque prestation dans « Gérer mes prestations ».
              </Txt>
              {PRICE_TYPES.map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => setPriceType(opt.key)}
                  style={[styles.optRow, priceType === opt.key && styles.optRowActive]}
                  testID={`price-type-${opt.key}`}
                >
                  <View
                    style={[
                      styles.optIcon,
                      { backgroundColor: priceType === opt.key ? colors.brandTertiary : colors.surface2 },
                    ]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={20}
                      color={priceType === opt.key ? colors.turquoise : colors.midnight}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Txt weight="700">{opt.title}</Txt>
                    <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>
                      {opt.subtitle}
                    </Txt>
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
              ) : null}
            </View>

            {/* Ville / zones / horaires */}
            <View style={styles.block}>
              <Txt size="md" weight="700" style={{ marginBottom: 6 }}>
                Zone de service
              </Txt>
              <Input label="Ville" icon="location-outline" value={city} onChangeText={setCity} />
              <Input
                label="Zones d'intervention"
                icon="map-outline"
                placeholder="Dakar, Almadies, Plateau"
                value={zonesStr}
                onChangeText={setZonesStr}
              />
              <Input
                label="Horaires (texte libre)"
                icon="time-outline"
                placeholder="Lun-Sam · 8h-19h"
                value={hoursStr}
                onChangeText={setHoursStr}
              />
            </View>

            {/* Mode d'intervention */}
            <View style={styles.block}>
              <Txt size="md" weight="700" style={{ marginBottom: 4 }}>
                Mode d&apos;intervention
              </Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginBottom: spacing.md, lineHeight: 18 }}>
                Comment travaillez-vous avec vos clients&nbsp;?
              </Txt>
              {MODE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => setServiceMode(opt.key)}
                  style={[styles.optRow, serviceMode === opt.key && styles.optRowActive]}
                  testID={`mode-${opt.key}`}
                >
                  <View
                    style={[
                      styles.optIcon,
                      { backgroundColor: serviceMode === opt.key ? colors.brandTertiary : colors.surface2 },
                    ]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={20}
                      color={serviceMode === opt.key ? colors.turquoise : colors.midnight}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Txt weight="700">{opt.title}</Txt>
                    <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>
                      {opt.subtitle}
                    </Txt>
                  </View>
                  <View style={[styles.radio, serviceMode === opt.key && styles.radioActive]}>
                    {serviceMode === opt.key ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              ))}
              {/* Adresse établissement — si receive/both */}
              {serviceMode !== "at_client" ? (
                <Input
                  label="Adresse de votre établissement"
                  icon="business-outline"
                  placeholder="Ex : 12 rue Ndar, Almadies, Dakar"
                  value={venueAddress}
                  onChangeText={setVenueAddress}
                  testID="pp-venue-address"
                />
              ) : null}
              {/* Frais de déplacement — si travel/both */}
              {serviceMode !== "at_venue" ? (
                <Input
                  label="Frais de déplacement (F CFA, facultatif)"
                  icon="cash-outline"
                  placeholder="Ex : 2000"
                  keyboardType="numeric"
                  value={travelFee}
                  onChangeText={setTravelFee}
                  testID="pp-travel-fee"
                />
              ) : null}
            </View>

            {/* Disponibilités hebdomadaires */}
            <View style={styles.block}>
              <Txt size="md" weight="700" style={{ marginBottom: 4 }}>
                Disponibilités hebdomadaires
              </Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginBottom: spacing.md, lineHeight: 18 }}>
                Vos jours et horaires d&apos;ouverture. Les clients ne pourront réserver que sur ces plages.
              </Txt>
              <WeeklyAvailabilityEditor value={weekly} onChange={setWeekly} />
            </View>

            {/* Absences ponctuelles */}
            <View style={styles.block}>
              <Txt size="md" weight="700" style={{ marginBottom: 4 }}>
                Absences ou congés
              </Txt>
              <Txt size="xs" color={colors.textMuted} style={{ marginBottom: spacing.md, lineHeight: 18 }}>
                Ajoutez des dates où vous êtes indisponible (format YYYY-MM-DD).
              </Txt>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    icon="calendar-outline"
                    placeholder="2026-08-15"
                    value={newUnavDate}
                    onChangeText={setNewUnavDate}
                    testID="pp-unav-date"
                  />
                </View>
                <Pressable
                  onPress={() => {
                    const d = newUnavDate.trim();
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
                      Alert.alert("Date invalide", "Format attendu : YYYY-MM-DD");
                      return;
                    }
                    if (unavailableDates.some((u) => u.date === d)) return;
                    setUnavailableDates([...unavailableDates, { date: d }]);
                    setNewUnavDate("");
                  }}
                  style={styles.addBtn}
                  testID="pp-unav-add"
                >
                  <Ionicons name="add" size={20} color={colors.white} />
                </Pressable>
              </View>
              {unavailableDates.length === 0 ? (
                <Txt size="xs" color={colors.textSubtle} style={{ fontStyle: "italic" }}>
                  Aucune absence programmée.
                </Txt>
              ) : (
                <View style={{ gap: 6 }}>
                  {unavailableDates.map((u) => (
                    <View key={u.date} style={styles.unavRow}>
                      <Ionicons name="calendar" size={16} color="#B45309" />
                      <Txt size="sm" weight="700" style={{ marginLeft: 8, flex: 1 }}>
                        {u.date}
                      </Txt>
                      <Pressable
                        onPress={() =>
                          setUnavailableDates(unavailableDates.filter((x) => x.date !== u.date))
                        }
                        hitSlop={8}
                        testID={`pp-unav-rm-${u.date}`}
                      >
                        <Ionicons name="close-circle" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* CTA gérer prestations */}
            <Pressable
              onPress={() => router.push("/my-services")}
              style={styles.myServicesCta}
              testID="pp-my-services"
            >
              <View style={styles.myServicesIcon}>
                <Ionicons name="pricetags" size={22} color={colors.turquoise} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Txt size="md" weight="700">
                  Gérer mes prestations & prix
                </Txt>
                <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                  Ajoutez le détail de vos services avec leurs prix (recommandé)
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </Pressable>

            <Btn
              title="Enregistrer"
              onPress={save}
              loading={loading}
              fullWidth
              size="lg"
              style={{ marginTop: spacing.xl }}
              testID="provider-save"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CategoryPicker
        visible={catPickerOpen}
        selected={categories}
        onClose={() => setCatPickerOpen(false)}
        onConfirm={(ks) => {
          setCategories(ks);
          // Purge les métiers dont la catégorie n'est plus sélectionnée
          setTrades((prev) =>
            prev.filter((tk) => {
              if (tk.startsWith("pending_")) return true;
              const cat = catalog.find((c) => c.services.some((s) => s.key === tk));
              return cat ? ks.includes(cat.key) : true;
            })
          );
          setCatPickerOpen(false);
        }}
      />

      <ServicePicker
        visible={tradesPickerOpen}
        mode="multi"
        selectedKeys={trades}
        filterCategories={categories}
        onClose={() => setTradesPickerOpen(false)}
        onConfirmMulti={(services: ServiceItem[]) => {
          const keys = services.map((s) => s.key);
          setTrades(keys);
          // Merge des catégories dérivées si besoin
          const derived = new Set(categories);
          for (const s of services) if (s.category) derived.add(s.category);
          setCategories(Array.from(derived));
          setTradesPickerOpen(false);
        }}
      />
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
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  coverWrap: {
    position: "relative",
    marginBottom: 32, // laisser dépasser l'avatar
  },
  cover: {
    width: "100%",
    height: 160,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  coverEdit: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: colors.white,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.soft,
  },
  avatarBtn: {
    position: "absolute",
    left: spacing.xl,
    bottom: -40,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: colors.surface,
    ...shadow.soft,
  },
  avatarImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEdit: {
    position: "absolute",
    right: 0,
    bottom: 2,
    backgroundColor: colors.turquoise,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.brandTertiary,
  },
  emptyState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderWidth: 1,
    borderColor: colors.turquoise,
    borderStyle: "dashed",
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chipCat: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipTrade: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.turquoise,
  },
  chipTradePending: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
  },
  optRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  optRowActive: { borderColor: colors.turquoise, backgroundColor: "#F0FBF8" },
  optIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: colors.turquoise },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.turquoise },
  myServicesCta: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.turquoise,
    marginTop: spacing.md,
  },
  myServicesIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    backgroundColor: colors.turquoise,
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  unavRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
});
