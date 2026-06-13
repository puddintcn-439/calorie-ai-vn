import { apiClient } from './api';

export type BillingCheckoutTier = 'premium' | 'pro';
export type BillingCheckoutInterval = 'monthly' | 'annual';

export type PayosCheckoutResponse = {
  ok: true;
  provider: 'payos';
  checkout_url: string;
  order_code: number;
  tier: BillingCheckoutTier;
  interval: BillingCheckoutInterval;
  amount_vnd: number;
};

export type BillingEntitlement = {
  user_id?: string;
  tier: 'free' | 'premium' | 'pro';
  source: 'free' | 'trial' | 'manual' | 'paid';
  provider?: 'stripe' | 'app_store' | 'google_play' | 'payos' | 'manual' | 'trial' | null;
  active_until?: string | null;
};

export type BillingRenewalReminder =
  | { has_reminder: false }
  | {
    has_reminder: true;
    tier: BillingCheckoutTier;
    provider: 'payos';
    active_until: string;
    billing_period_end: string;
    days_remaining: number;
    reminder_window: '7_day' | '3_day' | '1_day' | 'expired';
    message: string;
  };

export type BillingPaymentIssueType =
  | 'refund_request'
  | 'duplicate_payment'
  | 'payment_succeeded_but_not_activated'
  | 'wrong_plan'
  | 'other';

export type BillingPaymentIssue = {
  id: string;
  user_id?: string | null;
  invoice_id?: string | null;
  subscription_id?: string | null;
  provider: string;
  issue_type: BillingPaymentIssueType;
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  user_message?: string | null;
  resolution?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  resolved_at?: string | null;
};

export const billingService = {
  async createPayosCheckout(tier: BillingCheckoutTier, interval: BillingCheckoutInterval): Promise<PayosCheckoutResponse> {
    const { data } = await apiClient.post<PayosCheckoutResponse>('/billing/checkout/payos', { tier, interval });
    return data;
  },

  async getEntitlement(): Promise<BillingEntitlement> {
    const { data } = await apiClient.get<BillingEntitlement>('/billing/entitlement');
    return data;
  },

  async getRenewalReminder(): Promise<BillingRenewalReminder> {
    const { data } = await apiClient.get<BillingRenewalReminder>('/billing/renewal-reminder');
    return data;
  },

  async createPaymentIssue(input: {
    issue_type: BillingPaymentIssueType;
    invoice_id?: string | null;
    user_message?: string | null;
  }): Promise<BillingPaymentIssue> {
    const { data } = await apiClient.post<BillingPaymentIssue>('/billing/payment-issues', input);
    return data;
  },

  async fetchPaymentIssues(): Promise<{ cases: BillingPaymentIssue[] }> {
    const { data } = await apiClient.get<{ cases: BillingPaymentIssue[] }>('/billing/payment-issues');
    return data;
  },
};
