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

export const billingService = {
  async createPayosCheckout(tier: BillingCheckoutTier, interval: BillingCheckoutInterval): Promise<PayosCheckoutResponse> {
    const { data } = await apiClient.post<PayosCheckoutResponse>('/billing/checkout/payos', { tier, interval });
    return data;
  },
};
