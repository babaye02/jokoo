import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Txt } from "@/src/components/ui";
import { Babysitter } from "@/src/api";
import { PROFILE_TYPE_LABEL, langMeta } from "@/src/family";
import { colors } from "@/src/theme";

/** Renders the trust badges for a babysitter — new design per user requirements */
export function TrustBadges({ b, compact }: { b: Babysitter; compact?: boolean }) {
  const langs = (b.languages || []).slice(0, 4).map((l) => langMeta(l.code).label).join(" · ");
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {b.verified_plus ? (
        <Badge bg="#F59E0B" fg="#FFFFFF" icon={<Txt style={{ fontSize: 12 }}>🛡️</Txt>} label="Jokoo Verified+" compact={compact} />
      ) : null}
      {b.recommended_by_jokoo ? (
        <Badge bg="#EC4899" fg="#FFFFFF" icon={<Txt style={{ fontSize: 12 }}>❤️</Txt>} label="Recommandé par les familles" compact={compact} />
      ) : null}
      {b.identity_verified ? (
        <Badge bg="#DCFCE7" fg="#166534" icon={<Ionicons name="checkmark-circle" size={12} color="#166534" />} label="Identité vérifiée" compact={compact} />
      ) : null}
      {b.student_card_verified ? (
        <Badge
          bg="#DBEAFE"
          fg="#1E40AF"
          icon={<Txt style={{ fontSize: 12 }}>{PROFILE_TYPE_LABEL[b.profile_type || "student"]?.emoji || "🎓"}</Txt>}
          label={`${PROFILE_TYPE_LABEL[b.profile_type || "student"]?.label || "Étudiant(e)"} vérifié`}
          compact={compact}
        />
      ) : null}
      {langs ? (
        <Badge bg="#F3E8FF" fg="#7C3AED" icon={<Txt style={{ fontSize: 12 }}>🌍</Txt>} label={langs} compact={compact} />
      ) : null}
      {!compact ? (
        <Badge bg="#FEE2E2" fg="#991B1B" icon={<Txt style={{ fontSize: 12 }}>🚨</Txt>} label="Assistance Jokoo 24/7" compact={compact} />
      ) : null}
      {b.psc1_certified && !compact ? (
        <Badge bg="#FEF3C7" fg="#92400E" icon={<Txt style={{ fontSize: 12 }}>🥇</Txt>} label="Premiers secours (PSC1)" compact={compact} />
      ) : null}
    </View>
  );
}

/** Simple pill for filter matches — e.g., "Disponible aujourd'hui" */
export function AvailabilityChips({ b }: { b: Babysitter }) {
  const items: { icon: string; label: string; bg: string; fg: string }[] = [];
  if (b.available_today) items.push({ icon: "📅", label: "Disponible aujourd'hui", bg: "#DCFCE7", fg: "#166534" });
  if (b.night_care) items.push({ icon: "🌙", label: "Garde de nuit", bg: "#E0E7FF", fg: "#3730A3" });
  if (b.can_travel) items.push({ icon: "🚗", label: "Se déplace", bg: "#DBEAFE", fg: "#1E40AF" });
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {items.map((it) => (
        <View key={it.label} style={[styles.pill, { backgroundColor: it.bg }]}>
          <Txt style={{ fontSize: 11 }}>{it.icon}</Txt>
          <Txt size="xxs" weight="700" color={it.fg} style={{ marginLeft: 4 }}>{it.label}</Txt>
        </View>
      ))}
    </View>
  );
}

function Badge({ bg, fg, icon, label, compact }: any) {
  return (
    <View style={[styles.pill, { backgroundColor: bg, paddingHorizontal: compact ? 6 : 8, paddingVertical: compact ? 2 : 4 }]}>
      {icon}
      <Txt size="xxs" weight="700" color={fg} style={{ marginLeft: 4 }}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
});

// Keep colors import so bundler treeshakes fine
void colors;
