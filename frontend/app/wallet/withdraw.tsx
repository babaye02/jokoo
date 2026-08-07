// Wallet Withdraw — formulaire retrait avec calcul frais/net.
// Le backend recalcule TOUT à la validation ; ces valeurs affichées ici sont
// uniquement indicatives (calculées avec la même règle que /api/wallet/providers).

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

import { Btn, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { formatXof } from "@/src/pricing";
import {
  PROVIDER_META,
  PaymentProvider,
  ProvidersConfig,
  WalletSnapshot,
  walletApi,
} from "@/src/wallet/api";

type WdrMethod = "wave" | "orange_money" | "bank_transfer";

const METHODS: { id: WdrMethod; enabled: boolean }[] = [
  { id: "wave", enabled: true },
  { id: "orange_money", enabled: true },
  { id: "bank_transfer", enabled: true },
];

export default function WithdrawScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [config, setConfig] = useState<ProvidersConfig | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<WdrMethod>("wave");
  const [phone, setPhone] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [holderName, setHolderName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([walletApi.providers(), walletApi.me()])
      .then(([c, w]) => {
        setConfig(c);
        setWallet(w);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const amountNum = useMemo(() => {
    const raw = amount.replace(/\D/g, "");
    return raw ? parseInt(raw, 10) : 0;
  }, [amount]);

  // ⚠️ Ces frais sont indicatifs. Le backend recalcule à la soumission.
  // Pour rester simple : lit depuis l'admin settings via une future exposition.
  // En attendant, on lit rien et on affiche seulement le "net = brut" (frais 0% par défaut).
  const feeXof = 0;
  const netXof = Math.max(0, amountNum - feeXof);

  const validForm = useMemo(() => {
    if (!config) return false;
    if (amountNum < config.withdrawal_min_xof) return false;
    if (amountNum > config.withdrawal_max_xof) return false;
    if (wallet && amountNum > wallet.balance_available_xof) return false;
    if (method === "wave" || method === "orange_money") {
      if (!phone || phone.replace(/\D/g, "").length < 8) return false;
    }
    if (method === "bank_transfer") {
      if (!iban || iban.trim().length < 10) return false;
      if (!holderName || holderName.trim().length < 3) return false;
    }
    return !submitting;
  }, [config, wallet, amountNum, method, phone, iban, holderName, submitting]);

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const idempotency_key = `wdr_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const body: any = {
        amount_xof: amountNum,
        method,
        idempotency_key,
      };
      if (method === "wave" || method === "orange_money") body.destination_phone = phone.trim();
      if (method === "bank_transfer") {
        body.destination_iban = iban.trim();
        body.destination_bank_name = bankName.trim() || undefined;
        body.destination_holder_name = holderName.trim();
      }
      const doc = await walletApi.withdraw(body);
      Alert.alert(
        "Retrait demandé",
        `Votre demande de ${formatXof(doc.amount_gross_xof)} vers ${PROVIDER_META[method].label} est en attente d'approbation. Vous serez notifié dès son traitement.`,
        [{ text: "OK", onPress: () => router.replace("/wallet") }]
      );
    } catch (e: any) {
      const msg =
        e?.data?.detail?.message ||
        e?.data?.message ||
        e?.message ||
        "Retrait impossible pour le moment.";
      Alert.alert("Retrait échoué", msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.turquoise} />
        </View>
      </SafeAreaView>
    );
  }

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
          <Txt size="lg" weight="700">Retrait</Txt>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 140 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Available balance */}
          {wallet && (
            <View style={styles.availBox}>
              <Txt size="xs" weight="600" color={colors.textMuted} style={{ letterSpacing: 1 }}>
                DISPONIBLE
              </Txt>
              <Txt size="xxl" weight="800" style={{ marginTop: 4 }}>
                {formatXof(wallet.balance_available_xof)}
              </Txt>
            </View>
          )}

          {/* AMOUNT */}
          <Txt size="xs" weight="700" color={colors.textMuted} style={styles.label}>
            MONTANT À RETIRER
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
              Min {formatXof(config.withdrawal_min_xof)} · Max {formatXof(config.withdrawal_max_xof)}
            </Txt>
          )}

          {/* METHOD picker */}
          <Txt size="xs" weight="700" color={colors.textMuted} style={[styles.label, { marginTop: spacing.xl }]}>
            MÉTHODE DE RETRAIT
          </Txt>
          <View style={{ gap: 10 }}>
            {METHODS.map((m) => {
              const meta = PROVIDER_META[m.id as PaymentProvider];
              const isSel = method === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setMethod(m.id)}
                  style={[styles.methodRow, isSel ? styles.methodRowActive : null]}
                >
                  <View style={[styles.methodIcon, { backgroundColor: meta.gradient[0] + "22" }]}>
                    <Ionicons name={meta.icon as any} size={22} color={meta.gradient[0]} />
                  </View>
                  <Txt size="md" weight="700" style={{ flex: 1, marginLeft: spacing.md }}>
                    {meta.label}
                  </Txt>
                  {isSel && <Ionicons name="checkmark-circle" size={22} color={colors.turquoise} />}
                </Pressable>
              );
            })}
          </View>

          {/* DESTINATION FIELDS */}
          <Txt size="xs" weight="700" color={colors.textMuted} style={[styles.label, { marginTop: spacing.xl }]}>
            DESTINATION
          </Txt>
          {(method === "wave" || method === "orange_money") && (
            <TextField
              icon="call"
              placeholder="+221 XX XXX XX XX"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          )}
          {method === "bank_transfer" && (
            <>
              <TextField
                icon="person"
                placeholder="Nom du titulaire"
                value={holderName}
                onChangeText={setHolderName}
              />
              <TextField
                icon="business"
                placeholder="Nom de la banque (facultatif)"
                value={bankName}
                onChangeText={setBankName}
              />
              <TextField
                icon="card"
                placeholder="IBAN / N° de compte"
                value={iban}
                onChangeText={setIban}
                autoCapitalize="characters"
              />
            </>
          )}

          {/* SUMMARY */}
          {amountNum > 0 && (
            <View style={styles.summary}>
              <SummaryRow label="Montant brut" value={formatXof(amountNum)} />
              <SummaryRow label="Frais Jokoo" value={feeXof === 0 ? "Gratuit" : `− ${formatXof(feeXof)}`} muted={feeXof === 0} />
              <View style={styles.summaryDivider} />
              <SummaryRow label="Vous recevrez" value={formatXof(netXof)} strong />
            </View>
          )}
        </ScrollView>

        {/* Sticky CTA */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Btn
            title={submitting ? "Traitement…" : amountNum > 0 ? `Retirer ${formatXof(amountNum)}` : "Retirer"}
            onPress={onSubmit}
            disabled={!validForm}
            loading={submitting}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TextField({
  icon,
  ...props
}: { icon: keyof typeof Ionicons.glyphMap } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <TextInput
        {...props}
        placeholderTextColor={colors.textSubtle}
        style={styles.fieldInput}
      />
    </View>
  );
}

function SummaryRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Txt size="sm" color={muted ? colors.textMuted : colors.text}>
        {label}
      </Txt>
      <Txt size={strong ? "lg" : "sm"} weight={strong ? "800" : "600"} color={muted ? colors.textMuted : colors.text}>
        {value}
      </Txt>
    </View>
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
  availBox: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
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
  },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  methodRowActive: { borderColor: colors.turquoise, backgroundColor: colors.brandTertiary },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 12,
  },
  summary: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    ...shadow.sm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
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
