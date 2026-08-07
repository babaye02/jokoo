// Wallet Recharge — sélecteur montant + provider.
// Le backend calcule tout : bornes min/max, dispo providers, création intent.
// Pour Stripe → redirection Checkout web. Pour Wave/OM → deep-link mobile ou flow manuel.

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";

import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { formatXof } from "@/src/pricing";
import {
  PROVIDER_META,
  PaymentProvider,
  ProvidersConfig,
  walletApi,
} from "@/src/wallet/api";

const QUICK_AMOUNTS = [2000, 5000, 10000, 20000, 50000, 100000];

export default function RechargeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [config, setConfig] = useState<ProvidersConfig | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [provider, setProvider] = useState<PaymentProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    walletApi
      .providers()
      .then((c) => {
        setConfig(c);
        // Default provider = first available with recharge support
        const firstAvail = c.providers.find((p) => p.available && p.supports_recharge);
        if (firstAvail) setProvider(firstAvail.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const amountNum = useMemo(() => {
    const raw = amount.replace(/\D/g, "");
    return raw ? parseInt(raw, 10) : 0;
  }, [amount]);

  const canSubmit = useMemo(() => {
    if (!config || !provider) return false;
    if (amountNum < config.recharge_min_xof) return false;
    if (amountNum > config.recharge_max_xof) return false;
    return !submitting;
  }, [config, provider, amountNum, submitting]);

  const onSubmit = async () => {
    if (!provider) return;
    setSubmitting(true);
    try {
      const idempotency_key = `recharge_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const intent = await walletApi.recharge({
        amount_xof: amountNum,
        provider,
        return_url: "jokoo://wallet/recharged",
        idempotency_key,
      });

      if (intent.manual_flow) {
        Alert.alert(
          "Mode manuel",
          intent.instructions ||
            "Ce moyen de paiement n'est pas encore intégré. Merci de contacter le support pour finaliser la recharge.",
          [{ text: "OK", onPress: () => router.back() }]
        );
        return;
      }

      if (intent.checkout_url) {
        // Use openAuthSessionAsync so we get a proper callback when the user
        // returns to the app (either via the deep-link scheme or by manually
        // dismissing the browser).
        const result = await WebBrowser.openAuthSessionAsync(
          intent.checkout_url,
          "jokoo://wallet/recharged",
        );
        // Poll status once the session closes. Try up to 5 times over ~10s
        // to give Stripe's webhook time to process.
        let confirmed = false;
        for (let i = 0; i < 5; i++) {
          try {
            const st = await walletApi.checkRechargeStatus(intent.payment_intent_id);
            if (st.status === "succeeded") {
              confirmed = true;
              break;
            }
          } catch {
            /* transient, retry */
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (confirmed) {
          Alert.alert(
            "Recharge confirmée ✅",
            `${formatXof(amountNum)} ont été crédités sur votre portefeuille.`,
            [{ text: "OK", onPress: () => router.replace("/wallet") }],
          );
        } else if (result.type === "cancel" || result.type === "dismiss") {
          // User closed the browser without paying — no toast, just go back.
          router.replace("/wallet");
        } else {
          Alert.alert(
            "Traitement en cours",
            "Votre recharge est en cours de validation. Votre portefeuille sera crédité dès confirmation du paiement.",
            [{ text: "OK", onPress: () => router.replace("/wallet") }],
          );
        }
      } else if (intent.checkout_deep_link) {
        const ok = await Linking.canOpenURL(intent.checkout_deep_link);
        if (ok) {
          await Linking.openURL(intent.checkout_deep_link);
        } else {
          Alert.alert(
            "Impossible d'ouvrir " + PROVIDER_META[provider].label,
            "L'application n'est pas installée sur votre appareil.",
          );
        }
      } else {
        Alert.alert("Recharge créée", "Statut : " + intent.status);
        router.back();
      }
    } catch (e: any) {
      const msg =
        e?.data?.detail?.message ||
        e?.data?.message ||
        e?.message ||
        "La recharge a échoué. Merci de réessayer.";
      Alert.alert("Recharge échouée", msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={colors.turquoise} /></View>
      </SafeAreaView>
    );
  }

  const rechargeProviders = (config?.providers || []).filter((p) => p.supports_recharge && p.id !== "cash");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Txt size="lg" weight="700">Recharger</Txt>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* AMOUNT input */}
          <Txt size="xs" weight="700" color={colors.textMuted} style={styles.label}>
            MONTANT
          </Txt>
          <View style={styles.amountBox}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textSubtle}
              style={styles.amountInput}
              maxLength={9}
            />
            <Txt size="xxl" weight="700" color={colors.textMuted} style={{ marginLeft: 8 }}>
              F CFA
            </Txt>
          </View>
          {config && (
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 6, textAlign: "center" }}>
              Min {formatXof(config.recharge_min_xof)} · Max {formatXof(config.recharge_max_xof)}
            </Txt>
          )}

          {/* QUICK amounts */}
          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map((a) => (
              <Pressable
                key={a}
                onPress={() => setAmount(String(a))}
                style={[styles.quickChip, amountNum === a ? styles.quickChipActive : null]}
              >
                <Txt
                  size="sm"
                  weight="700"
                  color={amountNum === a ? colors.white : colors.text}
                >
                  {formatXof(a)}
                </Txt>
              </Pressable>
            ))}
          </View>

          {/* PROVIDER picker */}
          <Txt size="xs" weight="700" color={colors.textMuted} style={[styles.label, { marginTop: spacing.xl }]}>
            MOYEN DE PAIEMENT
          </Txt>
          <View style={styles.providerList}>
            {rechargeProviders.map((p) => {
              const meta = PROVIDER_META[p.id];
              const isSel = provider === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => p.available && setProvider(p.id)}
                  disabled={!p.available}
                  style={[
                    styles.providerRow,
                    isSel ? styles.providerRowActive : null,
                    !p.available ? { opacity: 0.4 } : null,
                  ]}
                >
                  <View style={[styles.providerIcon, { backgroundColor: meta.gradient[0] + "22" }]}>
                    <Ionicons name={meta.icon as any} size={22} color={meta.gradient[0]} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Txt size="md" weight="700">{meta.label}</Txt>
                    <Txt size="xs" color={colors.textMuted} style={{ marginTop: 2 }}>
                      {p.available
                        ? "Instantané, sécurisé"
                        : p.reason_if_unavailable || "Bientôt disponible"}
                    </Txt>
                  </View>
                  {isSel && <Ionicons name="checkmark-circle" size={22} color={colors.turquoise} />}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Sticky CTA */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Btn
            title={
              submitting
                ? "Traitement…"
                : amountNum > 0
                ? `Recharger ${formatXof(amountNum)}`
                : "Recharger"
            }
            onPress={onSubmit}
            disabled={!canSubmit}
            loading={submitting}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  headerBtn: { padding: 4, width: 40 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { letterSpacing: 1.2, marginBottom: spacing.sm },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    ...shadow.sm,
  },
  amountInput: {
    fontSize: 44,
    fontWeight: "800",
    color: colors.text,
    textAlign: "right",
    minWidth: 120,
    padding: 0,
    fontVariant: ["tabular-nums"] as any,
  },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.lg },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  providerList: { gap: 10 },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  providerRowActive: { borderColor: colors.turquoise, backgroundColor: colors.brandTertiary },
  providerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    padding: spacing.lg,
    ...shadow.md,
  },
});
