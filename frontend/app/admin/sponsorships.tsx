// Admin — sponsorisations prestataires + édition des tarifs.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, TextInput, Text } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Sponsorship } from "@/src/api";
import { formatXof } from "@/src/pricing";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, shadow, spacing } from "@/src/theme";

type PricesResp = { prices: Record<string, number>; defaults: Record<string, number> };

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:         { label: "En attente",           color: colors.warning },
  pending_payment: { label: "Paiement en attente",  color: colors.warning },
  approved:        { label: "Approuvée",            color: colors.turquoise },
  active:          { label: "Active",               color: colors.success },
  rejected:        { label: "Refusée",              color: colors.danger },
  expired:         { label: "Expirée",              color: colors.textMuted },
};

export default function AdminSponsors() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Sponsorship[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({ "7": "", "15": "", "30": "" });
  const [savingPrices, setSavingPrices] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, p] = await Promise.all([
        api.get<Sponsorship[]>("/admin/sponsorships").catch(() => []),
        api.get<PricesResp>("/admin/sponsorships/prices").catch(() => null as unknown as PricesResp),
      ]);
      setItems(list || []);
      if (p && p.prices) {
        setPrices({
          "7": String(p.prices["7"] ?? p.defaults["7"] ?? 5000),
          "15": String(p.prices["15"] ?? p.defaults["15"] ?? 10000),
          "30": String(p.prices["30"] ?? p.defaults["30"] ?? 18000),
        });
      }
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const savePrices = async () => {
    setSavingPrices(true);
    try {
      const body: Record<string, number> = {};
      for (const k of ["7", "15", "30"]) {
        const n = parseInt(prices[k], 10);
        if (!n || n <= 0) throw new Error(`Prix invalide pour ${k} jours`);
        body[k] = n;
      }
      await api.put("/admin/sponsorships/prices", { prices: body });
      Alert.alert("Tarifs enregistrés", "Les nouveaux prix sont désormais actifs.");
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible d'enregistrer les tarifs.");
    } finally {
      setSavingPrices(false);
    }
  };

  const gift = async (s: Sponsorship) => {
    setBusyId(s.id);
    try {
      await api.patch(`/admin/sponsorships/${s.id}`, { status: "gift" });
      Alert.alert("Offert", `${s.provider_name} est boosté ${s.duration_days} jours.`);
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Action impossible.");
    } finally { setBusyId(null); }
  };

  const reject = async (s: Sponsorship) => {
    setBusyId(s.id);
    try {
      await api.patch(`/admin/sponsorships/${s.id}`, { status: "rejected" });
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Action impossible.");
    } finally { setBusyId(null); }
  };

  const expire = async (s: Sponsorship) => {
    setBusyId(s.id);
    try {
      await api.patch(`/admin/sponsorships/${s.id}`, { status: "expire" });
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Action impossible.");
    } finally { setBusyId(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="sponsors-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Sponsorisations</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        {/* ── Éditeur de tarifs ── */}
        <Card style={{ padding: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="pricetags" size={18} color={colors.turquoise} />
            <Txt weight="700" style={{ marginLeft: 8 }}>Tarifs des boosts (XOF)</Txt>
          </View>
          <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
            Modifiez les montants applicables aux prestataires.
          </Txt>
          <View style={styles.priceRow}>
            {(["7", "15", "30"] as const).map((k) => (
              <View key={k} style={styles.priceCell}>
                <Text style={styles.priceLabel}>{k} jours</Text>
                <TextInput
                  value={prices[k]}
                  onChangeText={(v) => setPrices((p) => ({ ...p, [k]: v.replace(/[^0-9]/g, "") }))}
                  keyboardType="numeric"
                  style={styles.priceInput}
                  placeholder="0"
                  placeholderTextColor={colors.textSubtle}
                  testID={`price-${k}`}
                />
              </View>
            ))}
          </View>
          <View style={{ height: spacing.sm }} />
          <Btn title="Enregistrer les tarifs" onPress={savePrices} loading={savingPrices} icon="save" fullWidth />
        </Card>

        {/* ── Historique des demandes ── */}
        <Txt weight="700" style={{ marginTop: spacing.md }}>Demandes récentes</Txt>
        {items.length === 0 ? (
          <Card><Txt color={colors.textMuted}>Aucune demande de sponsorisation.</Txt></Card>
        ) : items.map((s) => {
          const st = STATUS_LABEL[s.status] || STATUS_LABEL.pending;
          const isPending = s.status === "pending" || s.status === "pending_payment";
          const isActive = s.status === "active";
          return (
            <Card key={s.id} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Txt weight="700">{s.provider_name}</Txt>
                  <Txt size="xs" color={colors.textMuted}>
                    Boost {s.duration_days} jours · {formatXof(s.amount_xof)}
                  </Txt>
                  {s.payment_provider ? (
                    <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 2 }}>
                      Paiement : {s.payment_provider}{s.paid ? " (payé)" : ""}
                    </Txt>
                  ) : null}
                  {s.ends_at ? (
                    <Txt size="xxs" color={colors.textMuted} style={{ marginTop: 4 }}>
                      Se termine le {s.ends_at.slice(0, 10)}
                    </Txt>
                  ) : null}
                </View>
                <View style={[styles.pill, { backgroundColor: `${st.color}22` }]}>
                  <Txt size="xxs" weight="700" color={st.color}>{st.label}</Txt>
                </View>
              </View>
              {isPending ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Btn title="Refuser" variant="secondary" onPress={() => reject(s)} loading={busyId === s.id} testID={`sp-reject-${s.id}`} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Btn title="Offrir 🎁" onPress={() => gift(s)} loading={busyId === s.id} testID={`sp-gift-${s.id}`} />
                  </View>
                </View>
              ) : isActive ? (
                <View style={{ marginTop: 12 }}>
                  <Btn title="Forcer l'expiration" variant="secondary" onPress={() => expire(s)} loading={busyId === s.id} testID={`sp-expire-${s.id}`} />
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },

  priceRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  priceCell: { flex: 1, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, padding: 10 },
  priceLabel: { fontSize: 11, letterSpacing: 1, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  priceInput: { fontSize: 15, fontWeight: "700", color: colors.text, paddingVertical: 4 },
});
