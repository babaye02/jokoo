// Promo Codes — Premium redesign inspired by Airbnb / Uber Eats / Revolut / Apple Wallet
// - Hero + input to enter a code
// - Active promo card (large, animated on apply)
// - Filter chips (Tout / Disponibles / Non applicables / Expirés)
// - Recommended section
// - Progress-based reward
// - Every card explains WHY it's not applicable (never a raw "not applicable")

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
  Text,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, PromoCode, PromoCodeStatus } from "@/src/api";
import { colors, shadow, spacing } from "@/src/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Status metadata ─────────────────────────────────────────
type FilterKey = "all" | "available" | "not_applicable" | "expired" | "coming_soon";

const STATUS_META: Record<PromoCodeStatus, { label: string; tone: any; icon: any; bg: string; fg: string }> = {
  applicable:     { label: "Applicable ✓",      tone: "verified", icon: "checkmark-circle", bg: "#DCFCE7", fg: "#065F46" },
  available:      { label: "Disponible",         tone: "verified", icon: "gift-outline",     bg: "#DCFCE7", fg: "#065F46" },
  coming_soon:    { label: "Bientôt",            tone: "warning",  icon: "time-outline",     bg: "#FEF3C7", fg: "#92400E" },
  not_applicable: { label: "Non applicable",     tone: "neutral",  icon: "lock-closed-outline", bg: "#F3F4F6", fg: "#4B5563" },
  used_up:        { label: "Épuisé",             tone: "neutral",  icon: "hourglass-outline", bg: "#F3F4F6", fg: "#4B5563" },
  expired:        { label: "Expiré",             tone: "danger",   icon: "close-circle-outline", bg: "#FEE2E2", fg: "#991B1B" },
  not_found:      { label: "Introuvable",        tone: "danger",   icon: "help-circle-outline", bg: "#FEE2E2", fg: "#991B1B" },
};

const CATEGORY_LABEL: Record<string, string> = {
  all: "Toutes catégories",
  family: "Jokoo Family",
  provider: "Prestations",
  mobility: "Mobilité",
};

function fmtFcfa(n?: number | null): string {
  if (n == null) return "0";
  return `${Math.round(n).toLocaleString("fr-FR")} F CFA`;
}

function fmtEndDate(iso?: string | null): string {
  if (!iso) return "Sans limite";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function discountLabel(p: PromoCode): string {
  if (p.discount_type === "percent") return `-${p.discount_value}%`;
  return `-${fmtFcfa(p.discount_value)}`;
}

// ─── Screen ─────────────────────────────────────────────────
export default function PromoCodesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [input, setInput] = useState("");
  const [applied, setApplied] = useState<PromoCode | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  // Simulated context (future: read from checkout screen params)
  const SAMPLE_AMOUNT = 15000;
  const SAMPLE_CATEGORY = "all";

  const load = useCallback(async () => {
    try {
      const list = await api.get<PromoCode[]>(`/promo-codes?amount=${SAMPLE_AMOUNT}&category=${SAMPLE_CATEGORY}`);
      setCodes(list);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const applyCode = async () => {
    const code = input.trim().toUpperCase();
    if (!code) return;
    setApplyLoading(true);
    setApplyError(null);
    try {
      const r = await api.post<any>("/promo-codes/validate", {
        code,
        amount: SAMPLE_AMOUNT,
        category: SAMPLE_CATEGORY,
      });
      if (r.valid) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setApplied({
          id: "applied",
          code: r.code,
          title: r.title,
          description: r.description,
          discount_type: r.discount_type,
          discount_value: r.discount_value,
          active: true,
          status: "applicable",
          discount: r.discount,
          final_amount: r.final_amount,
        });
        setInput("");
      } else {
        setApplyError(r.reason || "Ce code ne peut pas être appliqué.");
      }
    } catch (e: any) {
      setApplyError(e?.message || "Erreur, réessayez.");
    } finally {
      setApplyLoading(false);
    }
  };

  const removeApplied = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setApplied(null);
  };

  const applyFromCard = (p: PromoCode) => {
    if (p.status !== "applicable" && p.status !== "available") {
      Alert.alert("Non applicable", p.reason || "Ce code ne peut pas être appliqué pour l'instant.");
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    setApplied({ ...p, status: "applicable" });
  };

  // ─── Filtering ─────
  const filtered = useMemo(() => {
    if (filter === "all") return codes;
    if (filter === "available") return codes.filter((c) => c.status === "applicable" || c.status === "available");
    if (filter === "not_applicable") return codes.filter((c) => c.status === "not_applicable" || c.status === "used_up");
    if (filter === "expired") return codes.filter((c) => c.status === "expired");
    if (filter === "coming_soon") return codes.filter((c) => c.status === "coming_soon");
    return codes;
  }, [codes, filter]);

  const recommended = useMemo(
    () => codes.filter((c) => c.status === "applicable" || c.status === "available").slice(0, 3),
    [codes]
  );

  // Loyalty (mock progress: uses count of applicable codes as sample)
  const progress = 0.6; // 60% — placeholder
  const stepsRemaining = 2;

  const filters: { key: FilterKey; label: string; icon: any }[] = [
    { key: "all", label: "Tout", icon: "sparkles-outline" },
    { key: "available", label: "Disponibles", icon: "gift-outline" },
    { key: "not_applicable", label: "Non applicables", icon: "lock-closed-outline" },
    { key: "expired", label: "Expirés", icon: "time-outline" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Top bar */}
      <SafeAreaView edges={["top"]} style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="promo-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Codes promo</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 + insets.bottom, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ── HERO ── */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Text style={{ fontSize: 46, fontWeight: "700", color: "#7C3AED", letterSpacing: -2 }}>%</Text>
          </View>
          <Text style={styles.heroOverline}>Économisez</Text>
          <Text style={styles.heroTitle}>Codes promo</Text>
          <Text style={styles.heroSub}>Économisez sur votre prochaine réservation.</Text>
        </View>

        {/* ── APPLIED CARD (gradient premium) ── */}
        {applied ? (
          <View style={styles.appliedCard}>
            <LinearGradient
              colors={["#059669", "#0EA5A5"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <View style={styles.appliedCheck}>
                  <Ionicons name="checkmark" size={16} color="#059669" />
                </View>
                <Text style={styles.appliedOverline}>Code appliqué</Text>
                <Text style={styles.appliedCode}>{applied.code}</Text>
                <Text style={styles.appliedTitle}>{applied.title}</Text>
              </View>
              <View style={styles.appliedPct}>
                <Text style={styles.appliedPctTxt}>{discountLabel(applied)}</Text>
              </View>
            </View>

            {/* Price breakdown */}
            <View style={styles.priceBox}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Sous-total</Text>
                <Text style={styles.priceValue}>{fmtFcfa(SAMPLE_AMOUNT)}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: "#FEF3C7" }]}>Réduction</Text>
                <Text style={[styles.priceValue, { color: "#FEF3C7" }]}>−{fmtFcfa(applied.discount)}</Text>
              </View>
              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.18)", marginVertical: 8 }} />
              <View style={styles.priceRow}>
                <Text style={styles.priceTotalLabel}>Total à payer</Text>
                <Text style={styles.priceTotalValue}>{fmtFcfa(applied.final_amount)}</Text>
              </View>
              <View style={styles.savingsBadge}>
                <Ionicons name="sparkles" size={12} color="#065F46" />
                <Text style={styles.savingsBadgeTxt}>Vous économisez {fmtFcfa(applied.discount)}</Text>
              </View>
            </View>

            <Pressable onPress={removeApplied} style={styles.removeBtn} testID="promo-remove">
              <Ionicons name="close-circle" size={16} color={colors.white} />
              <Text style={styles.removeBtnTxt}>Retirer le code</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── INPUT ── */}
        {!applied ? (
          <View style={styles.inputCard}>
            <Text style={styles.overline}>Vous avez un code ?</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrap}>
                <Ionicons name="pricetag-outline" size={18} color={colors.textMuted} />
                <TextInput
                  value={input}
                  onChangeText={(v) => { setInput(v.toUpperCase()); setApplyError(null); }}
                  placeholder="Entrer un code promo"
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                  testID="promo-input"
                />
              </View>
              <Pressable
                onPress={applyCode}
                disabled={!input.trim() || applyLoading}
                style={[styles.applyBtn, (!input.trim() || applyLoading) && { opacity: 0.5 }]}
                testID="promo-apply"
              >
                <Text style={styles.applyBtnTxt}>{applyLoading ? "…" : "Appliquer"}</Text>
              </Pressable>
            </View>
            {applyError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={14} color="#DC2626" />
                <Text style={styles.errorTxt}>{applyError}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── RECOMMENDED ── */}
        {recommended.length > 0 ? (
          <View>
            <View style={styles.sectionHead}>
              <Text style={styles.overline}>Recommandés pour vous</Text>
              <Text style={styles.sectionTitle}>Offres à saisir</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
            >
              {recommended.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => applyFromCard(p)}
                  style={styles.recoCard}
                  testID={`promo-reco-${p.code}`}
                >
                  <LinearGradient
                    colors={["#0B1F3A", "#2A1054"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.recoPct}>
                    <Text style={styles.recoPctTxt}>{discountLabel(p)}</Text>
                  </View>
                  <Text style={styles.recoTitle} numberOfLines={2}>{p.title}</Text>
                  <Text style={styles.recoCode}>{p.code}</Text>
                  {p.discount ? (
                    <View style={styles.recoSaveChip}>
                      <Text style={styles.recoSaveTxt}>Économisez {fmtFcfa(p.discount)}</Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* ── REWARDS (loyalty) ── */}
        <View style={styles.rewardCard}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={styles.rewardIcon}>
              <Ionicons name="trophy" size={22} color="#EA580C" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.overline}>Programme fidélité</Text>
              <Text style={styles.rewardTitle}>Débloquez -10 %</Text>
              <Text style={styles.rewardSub}>Réservez encore {stepsRemaining} services pour débloquer votre récompense.</Text>
            </View>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={styles.progressTxt}>Progression : {Math.round(progress * 100)} %</Text>
            <Text style={styles.progressTxt}>3 / 5</Text>
          </View>
        </View>

        {/* ── FILTERS ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, marginTop: 4, paddingRight: spacing.xl }}
        >
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setFilter(f.key); }}
                style={[styles.filterChip, active && styles.filterChipActive]}
                testID={`promo-filter-${f.key}`}
              >
                <Ionicons name={f.icon} size={13} color={active ? colors.white : colors.text} />
                <Text style={[styles.filterLabel, active && { color: colors.white }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── ALL PROMO CARDS ── */}
        <View style={{ gap: 12, marginTop: spacing.sm }}>
          {filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="ticket-outline" size={40} color={colors.textSubtle} />
              <Text style={styles.emptyTitle}>Aucun code</Text>
              <Text style={styles.emptyHint}>Aucun code promo dans cette catégorie pour l&apos;instant.</Text>
            </View>
          ) : (
            filtered.map((p) => <PromoCard key={p.id} p={p} onApply={() => applyFromCard(p)} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Promo Card ────────────────────────────────────────────
function PromoCard({ p, onApply }: { p: PromoCode; onApply: () => void }) {
  const s = STATUS_META[p.status || "available"];
  const isApplicable = p.status === "applicable" || p.status === "available";
  const dimmed = !isApplicable && p.status !== "coming_soon";

  return (
    <Pressable onPress={onApply} style={[styles.promoCard, dimmed && { opacity: 0.62 }]} testID={`promo-card-${p.code}`}>
      {/* Left ticket area with big discount */}
      <View style={[styles.ticketLeft, { backgroundColor: isApplicable ? "#0B1F3A" : "#4B5563" }]}>
        <Text style={styles.ticketPct}>{discountLabel(p)}</Text>
        <Text style={styles.ticketCode}>{p.code}</Text>
      </View>

      {/* Perforation */}
      <View style={styles.perf}>
        {[...Array(6)].map((_, i) => <View key={i} style={styles.perfDot} />)}
      </View>

      {/* Right content */}
      <View style={styles.ticketRight}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={styles.promoTitle} numberOfLines={1}>{p.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
            <Ionicons name={s.icon} size={11} color={s.fg} />
            <Text style={[styles.statusBadgeTxt, { color: s.fg }]}>{s.label}</Text>
          </View>
        </View>
        {p.description ? (
          <Text style={styles.promoDesc} numberOfLines={2}>{p.description}</Text>
        ) : null}

        {/* Meta chips */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {p.category && p.category !== "all" ? (
            <MetaChip icon="briefcase-outline" text={CATEGORY_LABEL[p.category] || p.category} />
          ) : null}
          {p.min_amount_xof ? (
            <MetaChip icon="cash-outline" text={`Min. ${fmtFcfa(p.min_amount_xof)}`} />
          ) : null}
          {p.max_discount_xof ? (
            <MetaChip icon="arrow-down-outline" text={`Max ${fmtFcfa(p.max_discount_xof)}`} />
          ) : null}
          {p.first_booking_only ? (
            <MetaChip icon="sparkles-outline" text="1re réservation" />
          ) : null}
          {p.ends_at ? (
            <MetaChip icon="calendar-outline" text={`Expire ${fmtEndDate(p.ends_at)}`} />
          ) : null}
        </View>

        {/* Reason (why not applicable) */}
        {!isApplicable && p.reason ? (
          <View style={styles.reasonBox}>
            <Ionicons name="information-circle-outline" size={14} color="#4B5563" />
            <Text style={styles.reasonTxt}>{p.reason}</Text>
          </View>
        ) : null}

        {/* Savings when applicable */}
        {isApplicable && p.discount ? (
          <View style={styles.savingsPill}>
            <Ionicons name="sparkles" size={12} color="#065F46" />
            <Text style={styles.savingsPillTxt}>Économisez {fmtFcfa(p.discount)}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function MetaChip({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon} size={11} color={colors.textMuted} />
      <Text style={styles.metaChipTxt}>{text}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: 4,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  topTitle: { fontSize: 14, fontWeight: "700", color: colors.text, letterSpacing: -0.1 },

  overline: {
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  // Hero
  hero: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E9D5FF",
  },
  heroOverline: {
    fontSize: 11,
    letterSpacing: 1.8,
    color: "#7C3AED",
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 16,
  },
  heroTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.8,
    color: colors.text,
    marginTop: 4,
  },
  heroSub: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: "center",
    maxWidth: 300,
  },

  // Applied
  appliedCard: {
    borderRadius: 24,
    padding: 22,
    overflow: "hidden",
    position: "relative",
    ...shadow.card,
  },
  appliedCheck: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: "center", justifyContent: "center",
  },
  appliedOverline: {
    fontSize: 11,
    letterSpacing: 1.6,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 12,
  },
  appliedCode: {
    fontFamily: "InstrumentSerif",
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.6,
    color: colors.white,
    marginTop: 4,
  },
  appliedTitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.90)",
    marginTop: 2,
  },
  appliedPct: {
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
  },
  appliedPctTxt: {
    fontSize: 18,
    fontWeight: "800",
    color: "#059669",
    letterSpacing: -0.3,
  },
  priceBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  priceLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.82)",
  },
  priceValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.white,
  },
  priceTotalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
  },
  priceTotalValue: {
    fontFamily: "InstrumentSerif",
    fontSize: 22,
    letterSpacing: -0.3,
    color: colors.white,
  },
  savingsBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 999,
    backgroundColor: "#FEF3C7",
  },
  savingsBadgeTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#065F46",
    marginLeft: 5,
    letterSpacing: -0.1,
  },
  removeBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  removeBtnTxt: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
    marginLeft: 6,
    letterSpacing: -0.1,
  },

  // Input
  inputCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.hairline,
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderRadius: 16,
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 1.2,
    height: "100%",
  },
  applyBtn: {
    paddingHorizontal: 20,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtnTxt: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.1,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  errorTxt: {
    fontSize: 12,
    color: "#991B1B",
    marginLeft: 6,
    fontWeight: "600",
    flex: 1,
  },

  // Section head
  sectionHead: {
    marginTop: spacing.md,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: colors.text,
    marginTop: 2,
  },

  // Recommended
  recoCard: {
    width: 220,
    minHeight: 150,
    borderRadius: 20,
    padding: 16,
    overflow: "hidden",
    position: "relative",
    justifyContent: "flex-end",
    ...shadow.card,
  },
  recoPct: {
    position: "absolute",
    top: 12, right: 12,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  recoPctTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0B1F3A",
    letterSpacing: -0.2,
  },
  recoTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: colors.white,
  },
  recoCode: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 1.2,
    marginTop: 4,
  },
  recoSaveChip: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
  },
  recoSaveTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.1,
  },

  // Rewards
  rewardCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.hairline,
  },
  rewardIcon: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: "#FFEDD5",
    alignItems: "center", justifyContent: "center",
  },
  rewardTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
    color: colors.text,
    marginTop: 2,
  },
  rewardSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  progressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    marginTop: 14,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#EA580C",
  },
  progressTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },

  // Filters
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginLeft: 5,
    letterSpacing: -0.1,
  },

  // Promo card (ticket)
  promoCard: {
    flexDirection: "row",
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.hairline,
  },
  ticketLeft: {
    width: 90,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  ticketPct: {
    fontFamily: "InstrumentSerif",
    fontSize: 26,
    color: colors.white,
    letterSpacing: -0.6,
    textAlign: "center",
  },
  ticketCode: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 1.2,
    marginTop: 6,
    textAlign: "center",
  },
  perf: {
    width: 8,
    justifyContent: "space-between",
    paddingVertical: 12,
    backgroundColor: colors.white,
  },
  perfDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F3F4F6",
    marginLeft: 1,
  },
  ticketRight: {
    flex: 1,
    padding: 14,
  },
  promoTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.2,
    marginRight: 8,
  },
  promoDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 17,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  statusBadgeTxt: {
    fontSize: 10,
    fontWeight: "800",
    marginLeft: 4,
    letterSpacing: -0.1,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaChipTxt: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
    marginLeft: 4,
    letterSpacing: -0.1,
  },
  reasonBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonTxt: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "#4B5563",
    marginLeft: 5,
    lineHeight: 16,
  },
  savingsPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
  },
  savingsPillTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#065F46",
    marginLeft: 4,
    letterSpacing: -0.1,
  },

  // Empty
  emptyBox: {
    alignItems: "center",
    padding: spacing.xl,
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontFamily: "InstrumentSerif",
    fontSize: 22,
    lineHeight: 26,
    color: colors.text,
    marginTop: 12,
    letterSpacing: -0.3,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
});
