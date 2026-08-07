// Wallet v2 — client-side helpers & types.
// Backend is the source of truth. This module NEVER computes financial amounts;
// it only shapes API responses for the UI.

import { api } from "@/src/api";
import { formatXof } from "@/src/pricing";

// ─────────────────────────────────────────────────────────
// Types (must match /app/backend/wallet/models.py & constants.py)
// ─────────────────────────────────────────────────────────
export type WalletSnapshot = {
  id: string;
  owner_id: string;
  kind: "client" | "prestataire" | "platform";
  currency: "XOF";
  balance_available_xof: number;
  balance_pending_xof: number;
  balance_locked_xof: number;
  min_balance_xof: number;
  can_receive_bookings: boolean;
  low_balance_warning: boolean;
  status: "active" | "frozen" | "closed";
  updated_at: string;
  created_at?: string;
  stats: {
    total_credited_xof: number;
    total_debited_xof: number;
    total_commissions_paid_xof: number;
    total_recharged_xof: number;
    total_withdrawn_xof: number;
  };
  // Legacy compat fields (ignored by v2 UI)
  user_id?: string;
  commission_due?: number;
};

export type LedgerEntry = {
  id: string;
  at: string;
  kind: "credit" | "debit";
  amount_xof: number;
  balance_after_xof: number | null;
  reason: string;
  transaction_type: string;
  label: string;
  reference: Record<string, any>;
};

export type LedgerPage = {
  items: LedgerEntry[];
  cursor: string | null;
  has_more: boolean;
};

export type PaymentProvider =
  | "wave"
  | "orange_money"
  | "stripe"
  | "apple_pay"
  | "google_pay"
  | "bank_transfer"
  | "cash";

export type WalletProvider = {
  id: PaymentProvider;
  available: boolean;
  reason_if_unavailable: string | null;
  supports_recharge: boolean;
  supports_withdrawal: boolean;
};

export type ProvidersConfig = {
  providers: WalletProvider[];
  currency: "XOF";
  recharge_min_xof: number;
  recharge_max_xof: number;
  withdrawal_min_xof: number;
  withdrawal_max_xof: number;
};

export type RechargeIntent = {
  payment_intent_id: string;
  status: string;
  provider: PaymentProvider;
  amount_xof: number;
  currency: "XOF";
  checkout_url: string | null;
  checkout_deep_link: string | null;
  provider_ref: string | null;
  expires_at: string | null;
  manual_flow: boolean;
  instructions: string | null;
};

export type WithdrawalRequest = {
  id: string;
  status: "pending" | "approved" | "processing" | "paid" | "refused" | "cancelled" | "failed";
  amount_gross_xof: number;
  amount_fee_xof: number;
  amount_net_xof: number;
  method: string;
  destination: {
    phone?: string | null;
    iban?: string | null;
    bank_name?: string | null;
    holder_name?: string | null;
  };
  created_at: string;
  updated_at: string;
  external_ref?: string | null;
};

export type JokooProStatus = {
  active: boolean;
  expires_at: string | null;
  auto_renew: boolean;
  price_xof: number;
  kind: "jokoo_pro";
  id?: string;
  last_renewed_at?: string;
};

// ─────────────────────────────────────────────────────────
// API calls
// ─────────────────────────────────────────────────────────
export const walletApi = {
  me: () => api.get<WalletSnapshot>("/wallet/me"),
  history: (params?: { limit?: number; before?: string; kinds?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.before) q.set("before", params.before);
    if (params?.kinds) q.set("kinds", params.kinds);
    const qs = q.toString();
    return api.get<LedgerPage>(`/wallet/history${qs ? `?${qs}` : ""}`);
  },
  providers: () => api.get<ProvidersConfig>("/wallet/providers"),

  recharge: (body: {
    amount_xof: number;
    provider: PaymentProvider;
    return_url?: string;
    idempotency_key?: string;
  }) => api.post<RechargeIntent>("/wallet/recharge", body),

  getRecharge: (intentId: string) =>
    api.get<any>(`/wallet/recharge/${intentId}`),

  myRecharges: (limit = 20) =>
    api.get<any[]>(`/wallet/recharges/mine?limit=${limit}`),

  withdraw: (body: {
    amount_xof: number;
    method: PaymentProvider;
    destination_phone?: string;
    destination_iban?: string;
    destination_bank_name?: string;
    destination_holder_name?: string;
    idempotency_key?: string;
  }) => api.post<WithdrawalRequest>("/wallet/withdraw", body),

  myWithdrawals: (limit = 50) =>
    api.get<WithdrawalRequest[]>(`/wallet/withdrawals/mine?limit=${limit}`),

  cancelWithdrawal: (id: string) =>
    api.post<WithdrawalRequest>(`/wallet/withdrawals/${id}/cancel`, {}),

  myRefunds: (limit = 50) => api.get<any[]>(`/wallet/refunds/mine?limit=${limit}`),

  jokooProStatus: () => api.get<JokooProStatus>("/wallet/jokoo-pro/status"),
  jokooProSubscribe: () => api.post<any>("/wallet/jokoo-pro/subscribe", {}),
  jokooProCancel: () => api.post<any>("/wallet/jokoo-pro/cancel", {}),
};

// ─────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────
export const PROVIDER_META: Record<PaymentProvider, { label: string; icon: string; emoji: string; gradient: [string, string] }> = {
  wave: { label: "Wave", icon: "phone-portrait", emoji: "🌊", gradient: ["#1DA1F2", "#0D80D5"] },
  orange_money: { label: "Orange Money", icon: "phone-portrait", emoji: "🟠", gradient: ["#FF7900", "#E56E00"] },
  stripe: { label: "Carte bancaire", icon: "card", emoji: "💳", gradient: ["#635BFF", "#4E45C7"] },
  apple_pay: { label: "Apple Pay", icon: "logo-apple", emoji: "", gradient: ["#000000", "#333333"] },
  google_pay: { label: "Google Pay", icon: "logo-google", emoji: "", gradient: ["#4285F4", "#357AE8"] },
  bank_transfer: { label: "Virement bancaire", icon: "briefcase", emoji: "🏦", gradient: ["#5A5A5A", "#3C3C3C"] },
  cash: { label: "Espèces", icon: "cash", emoji: "💵", gradient: ["#3CB371", "#2E9958"] },
};

export const TRANSACTION_ICON: Record<string, string> = {
  recharge: "arrow-down-circle",
  electronic_payment: "cash",
  refund: "return-up-back",
  bonus: "gift",
  cash_commission: "trending-down",
  withdrawal: "arrow-up-circle",
  jokoo_pro_charge: "star",
  promotion_fee: "megaphone",
  badge_fee: "shield-checkmark",
  ad_fee: "megaphone-outline",
  manual_adjust_credit: "add-circle",
  manual_adjust_debit: "remove-circle",
  internal_transfer: "swap-horizontal",
};

export function formatXofSigned(amount: number, kind: "credit" | "debit"): string {
  const sign = kind === "credit" ? "+" : "−";
  return `${sign}${formatXof(Math.abs(amount))}`;
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "En attente",
    approved: "Approuvé",
    processing: "En cours",
    paid: "Payé",
    refused: "Refusé",
    cancelled: "Annulé",
    failed: "Échoué",
    completed: "Terminé",
    succeeded: "Réussi",
    active: "Actif",
    frozen: "Gelé",
    closed: "Fermé",
    expired: "Expiré",
    created: "Créé",
  };
  return map[status] || status;
}

export function statusColor(status: string): { bg: string; fg: string } {
  const map: Record<string, { bg: string; fg: string }> = {
    pending: { bg: "#FFF7E6", fg: "#B47F00" },
    approved: { bg: "#E6F4FF", fg: "#0057A0" },
    processing: { bg: "#E6F4FF", fg: "#0057A0" },
    paid: { bg: "#E9F9EF", fg: "#1F7A3F" },
    completed: { bg: "#E9F9EF", fg: "#1F7A3F" },
    succeeded: { bg: "#E9F9EF", fg: "#1F7A3F" },
    active: { bg: "#E9F9EF", fg: "#1F7A3F" },
    refused: { bg: "#FDECEC", fg: "#B33131" },
    failed: { bg: "#FDECEC", fg: "#B33131" },
    cancelled: { bg: "#F2F2F2", fg: "#6A6A6A" },
    frozen: { bg: "#FDECEC", fg: "#B33131" },
    expired: { bg: "#F2F2F2", fg: "#6A6A6A" },
  };
  return map[status] || { bg: "#F2F2F2", fg: "#4A4A4A" };
}
