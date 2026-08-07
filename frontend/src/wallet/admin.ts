// Admin Wallet API — client-side helpers.
// All endpoints require admin auth; the backend enforces it.

import { api } from "@/src/api";
import { LedgerEntry, WalletSnapshot } from "@/src/wallet/api";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
export type AdminWallet = {
  id: string;
  owner_id: string;
  kind: string;
  currency: string;
  balance_available: number;
  balance_pending: number;
  balance_locked: number;
  min_balance: number;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  stats: {
    total_credited: number;
    total_debited: number;
    total_commissions_paid: number;
    total_recharged: number;
    total_withdrawn: number;
  };
};

export type AdminWithdrawal = {
  id: string;
  user_id: string;
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
  status: string;
  external_ref?: string | null;
  admin_notes?: string | null;
  audit_trail?: any[];
  created_at: string;
  updated_at: string;
};

export type AdminTransaction = {
  id: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  from_owner_id: string;
  to_owner_id: string;
  provider: string | null;
  reason: string | null;
  label: string;
  created_at: string;
  updated_at: string;
};

export type CommissionRule = {
  id: string;
  category_key: string;
  commission_percent: number;
  min_commission_xof: number;
  max_commission_xof: number | null;
  active: boolean;
  notes?: string;
  updated_at?: string;
  updated_by?: string;
};

export type PlatformSetting = {
  key: string;
  value: any;
  default: any;
  is_default: boolean;
  updated_at?: string;
  updated_by?: string;
};

export type AdminDashboard = {
  counts: {
    wallets: number;
    pending_withdrawals: number;
    pending_refunds: number;
    active_jokoo_pro: number;
  };
  platform_wallet: AdminWallet;
  platform_credits_by_type: { _id: string; total: number; n: number }[];
  platform_debits_by_type: { _id: string; total: number; n: number }[];
  recent_transactions: AdminTransaction[];
};

export type AuditEntry = {
  id: string;
  action: string;
  actor_id: string;
  actor_role: string;
  target_type: string;
  target_id: string | null;
  amount_xof: number | null;
  before: any;
  after: any;
  reason: string | null;
  ip: string | null;
  at: string;
};

// ─────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────
export const adminWalletApi = {
  dashboard: () => api.get<AdminDashboard>("/admin/wallet/dashboard"),

  listWallets: (params?: { kind?: string; status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.kind) q.set("kind", params.kind);
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    return api.get<AdminWallet[]>(`/admin/wallet/list${q.toString() ? `?${q}` : ""}`);
  },

  getWallet: (ownerId: string) =>
    api.get<{ wallet: AdminWallet; user: any | null }>(`/admin/wallet/wallet/${ownerId}`),

  getLedger: (ownerId: string, limit = 100) =>
    api.get<{ items: LedgerEntry[]; cursor: string | null; has_more: boolean }>(
      `/admin/wallet/wallet/${ownerId}/ledger?limit=${limit}`
    ),

  adjust: (ownerId: string, amountXof: number, reason: string) =>
    api.post<any>(`/admin/wallet/wallet/${ownerId}/adjust`, {
      owner_id: ownerId,
      amount_xof: amountXof,
      reason,
    }),

  setStatus: (ownerId: string, status: "active" | "frozen" | "closed", reason?: string) =>
    api.post<any>(`/admin/wallet/wallet/${ownerId}/status`, { status, reason }),

  setMinBalance: (ownerId: string, minBalanceXof: number, reason?: string) =>
    api.post<any>(`/admin/wallet/wallet/${ownerId}/min-balance`, {
      min_balance_xof: minBalanceXof,
      reason,
    }),

  grantBonus: (body: { owner_id: string; amount_xof: number; label: string; category: string }) =>
    api.post<any>("/admin/wallet/bonus", body),

  listWithdrawals: (params?: { status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    return api.get<AdminWithdrawal[]>(`/admin/wallet/withdrawals${q.toString() ? `?${q}` : ""}`);
  },

  decideWithdrawal: (
    wdrId: string,
    body: { action: string; admin_notes?: string; external_ref?: string }
  ) => api.post<AdminWithdrawal>(`/admin/wallet/withdrawals/${wdrId}/decision`, body),

  listRefunds: (params?: { status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    return api.get<any[]>(`/admin/wallet/refunds${q.toString() ? `?${q}` : ""}`);
  },

  createRefund: (booking_id: string, reason: string, amount_xof?: number) =>
    api.post<any>("/admin/wallet/refunds", { booking_id, reason, amount_xof }),

  listCommissionRules: () => api.get<CommissionRule[]>("/admin/wallet/commissions/rules"),

  upsertCommissionRule: (body: {
    category_key: string;
    commission_percent: number;
    min_commission_xof?: number;
    max_commission_xof?: number | null;
    active?: boolean;
    notes?: string;
  }) => api.post<CommissionRule>("/admin/wallet/commissions/rules", body),

  deleteCommissionRule: (category_key: string) =>
    api.del<any>(`/admin/wallet/commissions/rules/${encodeURIComponent(category_key)}`),

  getSettings: () => api.get<Record<string, PlatformSetting>>("/admin/wallet/settings"),

  setSetting: (key: string, value: any) =>
    api.post<PlatformSetting>("/admin/wallet/settings", { key, value }),

  listTransactions: (params?: { type?: string; status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.type) q.set("type", params.type);
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    return api.get<AdminTransaction[]>(`/admin/wallet/transactions${q.toString() ? `?${q}` : ""}`);
  },

  listAudit: (params?: { action?: string; target_type?: string; actor_id?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.action) q.set("action", params.action);
    if (params?.target_type) q.set("target_type", params.target_type);
    if (params?.actor_id) q.set("actor_id", params.actor_id);
    if (params?.limit) q.set("limit", String(params.limit));
    return api.get<AuditEntry[]>(`/admin/wallet/audit${q.toString() ? `?${q}` : ""}`);
  },

  confirmPaymentIntent: (intentId: string, providerRef?: string) =>
    api.post<any>(`/admin/wallet/payment-intents/${intentId}/confirm`, { provider_ref: providerRef }),

  failPaymentIntent: (intentId: string, reason: string) =>
    api.post<any>(`/admin/wallet/payment-intents/${intentId}/fail`, { reason }),

  listPaymentIntents: (params?: { status?: string; provider?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.provider) q.set("provider", params.provider);
    if (params?.limit) q.set("limit", String(params.limit));
    return api.get<any[]>(`/admin/wallet/payment-intents${q.toString() ? `?${q}` : ""}`);
  },
};

// ─────────────────────────────────────────────────────────
// Settings metadata — labels + kind + min/max
// ─────────────────────────────────────────────────────────
export const SETTING_META: Record<
  string,
  { label: string; group: string; kind: "int" | "float" | "bool"; unit?: string; help?: string; step?: number }
> = {
  commission_default_percent: {
    label: "Commission par défaut",
    group: "Commissions",
    kind: "float",
    unit: "%",
    help: "Taux appliqué quand aucune règle par catégorie ne correspond.",
  },
  recharge_min_xof: { label: "Recharge minimum", group: "Recharges", kind: "int", unit: "F CFA" },
  recharge_max_xof: { label: "Recharge maximum", group: "Recharges", kind: "int", unit: "F CFA" },
  withdrawal_min_xof: { label: "Retrait minimum", group: "Retraits", kind: "int", unit: "F CFA" },
  withdrawal_max_xof: { label: "Retrait maximum", group: "Retraits", kind: "int", unit: "F CFA" },
  withdrawal_fee_percent: {
    label: "Frais de retrait (%)",
    group: "Retraits",
    kind: "float",
    unit: "%",
  },
  withdrawal_fee_fixed_xof: {
    label: "Frais de retrait (fixe)",
    group: "Retraits",
    kind: "int",
    unit: "F CFA",
  },
  jokoo_pro_price_xof: {
    label: "Prix Jokoo Pro",
    group: "Jokoo Pro",
    kind: "int",
    unit: "F CFA",
    help: "Débité automatiquement du wallet toutes les 30 jours.",
  },
  jokoo_pro_auto_renew: {
    label: "Renouvellement auto par défaut",
    group: "Jokoo Pro",
    kind: "bool",
  },
  wallet_default_min_balance_xof: {
    label: "Plancher défaut (par utilisateur)",
    group: "Wallets",
    kind: "int",
    unit: "F CFA",
    help: "Solde minimum autorisé — négatif = découvert autorisé.",
  },
  wallet_max_negative_xof: {
    label: "Plancher global maximum",
    group: "Wallets",
    kind: "int",
    unit: "F CFA",
    help: "Plafond absolu de découvert autorisé par admin (< 0).",
  },
  low_balance_warn_xof: {
    label: "Seuil d'alerte solde bas",
    group: "Wallets",
    kind: "int",
    unit: "F CFA",
  },
};
