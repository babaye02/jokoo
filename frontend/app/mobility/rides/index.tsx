import { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Ride } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Txt, Chip, Btn, Avatar } from "@/src/components/ui";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

const SN_CITIES = ["Dakar", "Thiès", "Rufisque", "Saint-Louis", "Mbour", "Saly", "Kaolack", "Ziguinchor", "Touba", "Diourbel"];

function todayDays(n = 14) {
  const arr: { label: string; day: string; iso: string; date: Date }[] = [];
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    arr.push({ label: `${d.getDate()}`, day: days[d.getDay()], iso: d.toISOString().slice(0, 10), date: d });
  }
  return arr;
}

export default function RidesSearch() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const [fromCity, setFromCity] = useState<string>(params.from || "");
  const [toCity, setToCity] = useState<string>(params.to || "");
  const days = useMemo(() => todayDays(), []);
  const [dateIdx, setDateIdx] = useState<number | null>(null);
  const [distanceType, setDistanceType] = useState<"" | "short" | "long">("");
  const [items, setItems] = useState<Ride[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fromCity) qs.append("from_city", fromCity);
    if (toCity) qs.append("to_city", toCity);
    if (dateIdx !== null) qs.append("date", days[dateIdx].iso);
    if (distanceType) qs.append("distance_type", distanceType);
    try {
      const r = await api.get<Ride[]>(`/rides?${qs.toString()}`);
      setItems(r);
    } catch {
      setItems([]);
    }
  }, [fromCity, toCity, dateIdx, distanceType, days]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const invert = () => {
    setFromCity(toCity);
    setToCity(fromCity);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} style={styles.back} testID="rides-back">
            <Ionicons name="chevron-back" size={22} color={colors.midnight} />
          </Pressable>
          <View>
            <Txt size="lg" weight="700">Covoiturage 🚗</Txt>
            <Txt size="xs" color={colors.textMuted}>Trouvez ou publiez un trajet</Txt>
          </View>
          <Pressable onPress={() => router.push("/mobility/rides/publish")} style={[styles.back, { backgroundColor: colors.turquoise }]} testID="rides-publish">
            <Ionicons name="add" size={22} color={colors.white} />
          </Pressable>
        </View>

        {/* Search box */}
        <View style={styles.searchCard}>
          <View style={{ flex: 1 }}>
            <SearchField
              icon="location"
              placeholder="Départ · ex. Dakar"
              value={fromCity}
              onChange={setFromCity}
              testID="rides-from"
            />
            <View style={styles.divider} />
            <SearchField
              icon="flag"
              placeholder="Destination · ex. Thiès"
              value={toCity}
              onChange={setToCity}
              testID="rides-to"
            />
          </View>
          <Pressable onPress={invert} style={styles.invert} testID="rides-invert">
            <Ionicons name="swap-vertical" size={20} color={colors.turquoise} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {/* Suggestions villes */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.md }}>
          <Txt size="xs" color={colors.textMuted} style={{ marginBottom: 8 }}>Villes populaires</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {SN_CITIES.map((c) => (
              <Chip
                key={c}
                label={c}
                active={fromCity === c || toCity === c}
                onPress={() => (fromCity ? setToCity(c) : setFromCity(c))}
                testID={`city-${c}`}
              />
            ))}
          </ScrollView>
        </View>

        {/* Date */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Txt size="xs" color={colors.textMuted}>Date de départ</Txt>
            {dateIdx !== null ? (
              <Pressable onPress={() => setDateIdx(null)}>
                <Txt size="xs" weight="600" color={colors.turquoise}>Effacer</Txt>
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d, i) => {
              const active = dateIdx === i;
              return (
                <Pressable
                  key={d.iso}
                  onPress={() => setDateIdx(i)}
                  style={[styles.dayBtn, active && styles.dayBtnActive]}
                  testID={`ride-day-${i}`}
                >
                  <Txt size="xxs" color={active ? colors.white : colors.textMuted} weight="600">{d.day}</Txt>
                  <Txt size="lg" weight="700" color={active ? colors.white : colors.text}>{d.label}</Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Type distance */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg, flexDirection: "row", gap: 8 }}>
          <Chip label="Tous" active={distanceType === ""} onPress={() => setDistanceType("")} />
          <Chip label="Courte distance" icon="pin" active={distanceType === "short"} onPress={() => setDistanceType("short")} />
          <Chip label="Longue distance" icon="navigate" active={distanceType === "long"} onPress={() => setDistanceType("long")} />
        </View>

        {/* Results */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Txt size="md" weight="700">{items.length} trajet(s)</Txt>
            <Txt size="xs" color={colors.textMuted}>Tri : plus récents</Txt>
          </View>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="car-sport-outline" size={40} color={colors.textSubtle} />
              <Txt size="md" weight="700" style={{ marginTop: 8 }}>Aucun trajet trouvé</Txt>
              <Txt size="xs" color={colors.textMuted} style={{ textAlign: "center", marginTop: 4 }}>
                Essayez d&apos;autres villes ou dates — ou publiez votre propre trajet.
              </Txt>
              <View style={{ marginTop: 12 }}>
                <Btn title="Publier un trajet" icon="add" onPress={() => router.push("/mobility/rides/publish")} testID="empty-publish" />
              </View>
            </View>
          ) : (
            items.map((r) => <RideCard key={r.id} ride={r} onPress={() => router.push(`/mobility/rides/${r.id}`)} />)
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

function RideCard({ ride, onPress }: { ride: Ride; onPress: () => void }) {
  const isRecurrent = ride.recurrence === "weekly";
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`ride-card-${ride.id}`}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt size="xs" color={colors.textMuted}>
          {ride.date} · {ride.time}
        </Txt>
        {isRecurrent ? (
          <View style={styles.tag}>
            <Ionicons name="repeat" size={10} color={colors.midnight} />
            <Txt size="xxs" weight="700" color={colors.midnight} style={{ marginLeft: 4 }}>Récurrent</Txt>
          </View>
        ) : ride.distance_type === "long" ? (
          <View style={[styles.tag, { backgroundColor: "#DBEAFE" }]}>
            <Txt size="xxs" weight="700" color="#1E40AF">Long courrier</Txt>
          </View>
        ) : (
          <View style={[styles.tag, { backgroundColor: "#DCFCE7" }]}>
            <Txt size="xxs" weight="700" color="#166534">Courte distance</Txt>
          </View>
        )}
      </View>

      {/* Route */}
      <View style={{ flexDirection: "row", marginTop: 10 }}>
        <View style={{ alignItems: "center", width: 20, marginRight: 12, paddingTop: 4 }}>
          <View style={[styles.dot, { backgroundColor: colors.turquoise }]} />
          <View style={styles.line} />
          <View style={[styles.dot, { backgroundColor: colors.midnight }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt size="md" weight="700">{ride.from_city}</Txt>
          {ride.from_address ? <Txt size="xs" color={colors.textMuted}>{ride.from_address}</Txt> : null}
          {ride.stops?.length ? (
            <Txt size="xxs" color={colors.textSubtle} style={{ marginTop: 4 }}>
              • {ride.stops.map((s) => s.city).join(" · ")}
            </Txt>
          ) : null}
          <View style={{ height: 8 }} />
          <Txt size="md" weight="700">{ride.to_city}</Txt>
          {ride.to_address ? <Txt size="xs" color={colors.textMuted}>{ride.to_address}</Txt> : null}
        </View>
      </View>

      <View style={styles.rowDivider} />

      {/* Driver + price */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Avatar uri={ride.driver_avatar || undefined} name={ride.driver_name} size={36} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Txt size="sm" weight="700" numberOfLines={1}>{ride.driver_name}</Txt>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
            {ride.driver_verified ? <Ionicons name="checkmark-circle" size={12} color={colors.turquoise} /> : null}
            <Ionicons name="people" size={11} color={colors.textMuted} style={{ marginLeft: ride.driver_verified ? 6 : 0 }} />
            <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 3 }}>{ride.seats_available}/{ride.seats_total} places</Txt>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt size="lg" weight="700" color={colors.turquoise}>{formatXof(ride.price_xof)}</Txt>
          <Txt size="xxs" color={colors.textSubtle}>par place</Txt>
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
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: fs.md, color: colors.text, height: 40 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  invert: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginLeft: spacing.sm },
  dayBtn: { width: 58, height: 68, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  dayBtnActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { flex: 1, width: 2, backgroundColor: colors.borderStrong, marginVertical: 3, minHeight: 24 },
  rowDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  empty: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.soft },
});
