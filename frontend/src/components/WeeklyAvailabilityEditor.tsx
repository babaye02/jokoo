/**
 * WeeklyAvailabilityEditor — édition des horaires hebdomadaires + jours off.
 * Structure : { mon: [{start,end}], tue: [...], ... , sun: [] }.
 * Un jour vide = repos.
 */
import { View, StyleSheet, Pressable, TextInput, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Txt } from "@/src/components/ui";
import { colors, radius } from "@/src/theme";

export type TimeRange = { start: string; end: string };
export type WeeklyAvailability = Record<string, TimeRange[]>;

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Lundi" },
  { key: "tue", label: "Mardi" },
  { key: "wed", label: "Mercredi" },
  { key: "thu", label: "Jeudi" },
  { key: "fri", label: "Vendredi" },
  { key: "sat", label: "Samedi" },
  { key: "sun", label: "Dimanche" },
];

export const DEFAULT_WEEKLY_AVAILABILITY: WeeklyAvailability = {
  mon: [{ start: "09:00", end: "18:00" }],
  tue: [{ start: "09:00", end: "18:00" }],
  wed: [{ start: "09:00", end: "18:00" }],
  thu: [{ start: "09:00", end: "18:00" }],
  fri: [{ start: "09:00", end: "18:00" }],
  sat: [],
  sun: [],
};

type Props = {
  value: WeeklyAvailability;
  onChange: (next: WeeklyAvailability) => void;
};

export default function WeeklyAvailabilityEditor({ value, onChange }: Props) {
  const setDay = (day: string, ranges: TimeRange[]) => {
    onChange({ ...value, [day]: ranges });
  };

  const addRange = (day: string) => {
    const ranges = value[day] || [];
    setDay(day, [...ranges, { start: "09:00", end: "18:00" }]);
  };
  const removeRange = (day: string, idx: number) => {
    const ranges = [...(value[day] || [])];
    ranges.splice(idx, 1);
    setDay(day, ranges);
  };
  const updateRange = (day: string, idx: number, field: "start" | "end", v: string) => {
    const ranges = [...(value[day] || [])];
    ranges[idx] = { ...ranges[idx], [field]: v };
    setDay(day, ranges);
  };

  return (
    <View style={{ gap: 8 }}>
      {DAYS.map((d) => {
        const ranges = value[d.key] || [];
        const isOff = ranges.length === 0;
        return (
          <View key={d.key} style={styles.dayRow}>
            <View style={styles.dayHeader}>
              <Txt size="sm" weight="700" style={{ flex: 1 }}>
                {d.label}
              </Txt>
              {isOff ? (
                <Pressable
                  onPress={() => addRange(d.key)}
                  style={styles.addPill}
                  testID={`day-${d.key}-add`}
                >
                  <Ionicons name="add" size={14} color={colors.turquoise} />
                  <Txt size="xxs" weight="700" color={colors.turquoise} style={{ marginLeft: 4 }}>
                    Ouvrir
                  </Txt>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => addRange(d.key)}
                  style={styles.addPill}
                  testID={`day-${d.key}-add-range`}
                >
                  <Ionicons name="add" size={14} color={colors.turquoise} />
                  <Txt size="xxs" weight="700" color={colors.turquoise} style={{ marginLeft: 4 }}>
                    Plage
                  </Txt>
                </Pressable>
              )}
            </View>

            {isOff ? (
              <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 2 }}>
                Repos
              </Txt>
            ) : (
              <View style={{ gap: 6 }}>
                {ranges.map((r, idx) => (
                  <View key={idx} style={styles.rangeRow}>
                    <TimeInput
                      value={r.start}
                      onChange={(v) => updateRange(d.key, idx, "start", v)}
                      testID={`day-${d.key}-start-${idx}`}
                    />
                    <Txt size="sm" color={colors.textMuted} style={{ marginHorizontal: 4 }}>
                      —
                    </Txt>
                    <TimeInput
                      value={r.end}
                      onChange={(v) => updateRange(d.key, idx, "end", v)}
                      testID={`day-${d.key}-end-${idx}`}
                    />
                    <Pressable
                      onPress={() => removeRange(d.key, idx)}
                      style={styles.trash}
                      testID={`day-${d.key}-rm-${idx}`}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function TimeInput({
  value,
  onChange,
  testID,
}: {
  value: string;
  onChange: (v: string) => void;
  testID?: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="HH:MM"
      placeholderTextColor={colors.textSubtle}
      style={styles.timeInput}
      keyboardType="numeric"
      maxLength={5}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  dayRow: {
    backgroundColor: colors.surface2,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.brandTertiary,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.turquoise,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 8, android: 6 }),
    width: 72,
    textAlign: "center",
    fontSize: 14,
    color: colors.text,
    fontFamily: "Poppins",
    backgroundColor: colors.surface,
  },
  trash: {
    marginLeft: "auto",
    padding: 4,
  },
});
