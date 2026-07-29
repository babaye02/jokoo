import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Ride } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Txt, Btn, Avatar, Chip } from "@/src/components/ui";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

const SN_CITIES = ["Dakar", "Thiès", "Saint-Louis", "Mbour", "Saly", "Kaolack", "Ziguinchor", "Touba", "Diourbel"];

export default function DeliveryHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [items, setItems] = useState<Ride[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    qs.append("accepts_parcels", "true");
    if (fromCity) qs.append("from_city", fromCity);
    if (toCity) qs.append("to_city", toCity);
    try {
      const r = await api.get<Ride[]>(`/rides?${qs.toString()}`);
      setItems(r);
    } catch {
      setItems([]);
    }
  }, [fromCity, toCity]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} style={styles.back} testID="delivery-back">
            <Ionicons name="chevron-back" size={22} color={colors.midnight} />
          </Pressable>
          <View>
            <Txt size="lg" weight="700">Livraison 📦</Txt>
            <Txt size="xs" color={colors.textMuted}>Colis longue distance sur trajets conducteurs</Txt>
          </View>
          <Pressable onPress={() => router.push("/mobility/delivery/mine")} style={[styles.back, { backgroundColor: colors.turquoise }]} testID="delivery-mine">
            <Ionicons name="cube" size={20} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.searchCard}>
          <View style={{ flex: 1 }}>
            <SearchField icon="location" placeholder="Ramassage · ex. Dakar" value={fromCity} onChange={setFromCity} testID="del-from" />
            <View style={styles.divider} />
            <SearchField icon="flag" placeholder="Livraison · ex. Thiès" value={toCity} onChange={setToCity} testID="del-to" />
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {/* Info banner */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.md }}>
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={20} color={colors.turquoise} />
            <Txt size="xs" color={colors.textMuted} style={{ flex: 1, marginLeft: 8, lineHeight: 18 }}>
              Confiez votre colis à un conducteur qui se rend déjà à destination. Économique & rapide.
            </Txt>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.md }}>
          <Txt size="xs" color={colors.textMuted} style={{ marginBottom: 8 }}>Villes populaires</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {SN_CITIES.map((c) => (
              <Chip
                key={c}
                label={c}
                active={fromCity === c || toCity === c}
                onPress={() => (fromCity ? setToCity(c) : setFromCity(c))}
                testID={`del-city-${c}`}
              />
            ))}
          </ScrollView>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Txt size="md" weight="700">{items.length} trajet(s) disponible(s)</Txt>
          </View>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={40} color={colors.textSubtle} />
              <Txt size="md" weight="700" style={{ marginTop: 8 }}>Aucun trajet disponible</Txt>
              <Txt size="xs" color={colors.textMuted} style={{ textAlign: "center", marginTop: 4 }}>
                Essayez d&apos;autres villes ou consultez les trajets covoiturage.
              </Txt>
              <View style={{ marginTop: 12 }}>
                <Btn title="Voir les trajets" icon="car" variant="secondary" onPress={() => router.push("/mobility/rides")} />
              </View>
            </View>
          ) : (
            items.map((r) => <ParcelRideCard key={r.id} ride={r} onPress={() => router.push(`/mobility/delivery/send/${r.id}`)} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SearchField({ icon, placeholder, value, onChange, testID }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Ionicons name={icon} size={18} color={colors.turquoise} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        value={value}
        onChangeText={onChange}
        style={styles.searchInput}
        testID={testID}
      />
    </View>
  );
}

function ParcelRideCard({ ride, onPress }: { ride: Ride; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`parcel-ride-${ride.id}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Txt size="xs" color={colors.textMuted}>{ride.date} · {ride.time}</Txt>
        <View style={styles.tag}>
          <Ionicons name="cube" size={10} color={colors.midnight} />
          <Txt size="xxs" weight="700" color={colors.midnight} style={{ marginLeft: 4 }}>Max {ride.parcel_max_kg} kg</Txt>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
        <Txt weight="700">{ride.from_city}</Txt>
        <Ionicons name="arrow-forward" size={12} color={colors.textMuted} style={{ marginHorizontal: 6 }} />
        <Txt weight="700">{ride.to_city}</Txt>
      </View>

      <View style={styles.rowDivider} />

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Avatar uri={ride.driver_avatar || undefined} name={ride.driver_name} size={36} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Txt size="sm" weight="700">{ride.driver_name}</Txt>
          <Txt size="xxs" color={colors.textMuted}>{ride.vehicle_model || "Véhicule non précisé"}</Txt>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt size="lg" weight="700" color={colors.turquoise}>{formatXof(ride.parcel_price_xof || 0)}</Txt>
          <Txt size="xxs" color={colors.textSubtle}>par colis</Txt>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  searchCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: fs.md, color: colors.text, height: 40 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
  },
  card: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, ...shadow.card },
  tag: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rowDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  empty: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
});
