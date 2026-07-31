// Fiche partenaire commercial Jokoo — accessible via /partner/{id}.
// Une bannière peut cibler cette page en choisissant `link_type=partner` + `link_target=<partner_id>`.
import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Partner } from "@/src/api";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

export default function PartnerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<Partner>(`/partners/${id}`, false)
      .then(setPartner)
      .catch(() => setPartner(null))
      .finally(() => setLoading(false));
  }, [id]);

  const openLink = (url?: string | null, prefix = "") => {
    if (!url) return;
    Linking.openURL(prefix + url).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="partner-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Partenaire</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.turquoise} />
        </View>
      ) : !partner ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
          <Ionicons name="business-outline" size={40} color={colors.textMuted} />
          <Txt size="lg" weight="700" style={{ marginTop: spacing.md, textAlign: "center" }}>
            Partenaire introuvable
          </Txt>
          <Btn title="Retour à l'accueil" onPress={() => router.replace("/(tabs)")} style={{ marginTop: spacing.lg }} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
          {partner.cover ? (
            <Image source={{ uri: partner.cover }} style={styles.cover} contentFit="cover" />
          ) : (
            <View style={[styles.cover, { backgroundColor: colors.midnight }]} />
          )}
          <View style={{ padding: spacing.xl }}>
            <View style={styles.logoRow}>
              {partner.logo ? (
                <Image source={{ uri: partner.logo }} style={styles.logo} contentFit="cover" />
              ) : (
                <View style={[styles.logo, { backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="business" size={26} color={colors.turquoise} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Txt size="xxl" weight="700">{partner.name}</Txt>
                {partner.tagline ? (
                  <Txt size="sm" color={colors.textMuted}>{partner.tagline}</Txt>
                ) : null}
              </View>
            </View>

            {partner.description ? (
              <Card style={{ marginTop: spacing.lg }}>
                <Txt size="sm" style={{ lineHeight: 22 }}>{partner.description}</Txt>
              </Card>
            ) : null}

            <View style={{ marginTop: spacing.lg, gap: 10 }}>
              {partner.website ? (
                <ContactRow icon="globe-outline" label="Site web" value={partner.website} onPress={() => openLink(partner.website)} />
              ) : null}
              {partner.phone ? (
                <ContactRow icon="call-outline" label="Téléphone" value={partner.phone} onPress={() => openLink(partner.phone, "tel:")} />
              ) : null}
              {partner.email ? (
                <ContactRow icon="mail-outline" label="Email" value={partner.email} onPress={() => openLink(partner.email, "mailto:")} />
              ) : null}
              {partner.city || partner.category ? (
                <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                  {partner.city ? (
                    <View style={styles.chip}>
                      <Ionicons name="location-outline" size={12} color={colors.midnight} />
                      <Txt size="xxs" weight="600" style={{ marginLeft: 3 }}>{partner.city}</Txt>
                    </View>
                  ) : null}
                  {partner.category ? (
                    <View style={styles.chip}>
                      <Ionicons name="pricetag-outline" size={12} color={colors.midnight} />
                      <Txt size="xxs" weight="600" style={{ marginLeft: 3 }}>{partner.category}</Txt>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      )}

      {partner?.website ? (
        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn
            title="Visiter le site"
            onPress={() => openLink(partner.website)}
            fullWidth
            size="lg"
            icon="open-outline"
            testID="partner-visit"
          />
        </View>
      ) : null}
    </View>
  );
}

function ContactRow({ icon, label, value, onPress }: any) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.turquoise} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt size="xs" color={colors.textMuted}>{label}</Txt>
        <Txt size="sm" weight="600" numberOfLines={1}>{value}</Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", height: 180 },
  logoRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 64, height: 64, borderRadius: 16 },
  chip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: colors.surface2, borderRadius: 999,
  },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.md,
  },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.xl, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
});
