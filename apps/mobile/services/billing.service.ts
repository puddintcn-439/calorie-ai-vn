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
};
