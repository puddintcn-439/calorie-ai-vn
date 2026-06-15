import { AdminRevenueService } from '../admin-revenue.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { BillingService } from '../../billing/billing.service';

function tableQuery(data: any[] = [], error: any = null) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data, error }),
  };
  return chain;
}

function makeUsers(users: number | any[]) {
  if (Array.isArray(users)) return users;
  return Array.from({ length: users }, (_, index) => ({ id: `user-${index + 1}` }));
}

function makeDb(subscriptions: any[], aiUsageRows: any[] = [], users: number | any[] = 10) {
  const userRows = makeUsers(users);
  return {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return tableQuery(userRows);
      }
      if (table === 'ai_usage_events') {
        return tableQuery(aiUsageRows);
      }
      if (table === 'user_subscriptions') {
        return tableQuery(subscriptions);
      }
      return tableQuery([]);
    }),
  };
}

function makeService(db: any, confirmedRevenue: Record<string, any> = { source: 'billing_ledger', month_to_date: {} }) {
  return new AdminRevenueService(
    { db } as unknown as SupabaseService,
    { get: jest.fn((key: string) => key === 'USD_TO_VND_RATE' ? '26000' : undefined) } as any,
    { getConfirmedRevenueSummary: jest.fn().mockResolvedValue(confirmedRevenue) } as unknown as BillingService,
  );
}

describe('AdminRevenueService', () => {
  it('includes confirmed_revenue while preserving legacy V3 fields', async () => {
    const confirmedRevenue = {
      source: 'billing_ledger',
      month_to_date: { net_revenue_vnd: 59000 },
    };
    const service = makeService(makeDb([
      { user_id: 'u1', tier: 'premium', is_active: true, payment_provider: 'stripe' },
    ]), confirmedRevenue);

    const result = await service.getRevenue();

    expect(result.confirmed_revenue).toBe(confirmedRevenue);
    expect(result).toEqual(expect.objectContaining({
      generated_at: expect.any(String),
      default_currency: 'VND',
      display_currencies: ['VND', 'USD'],
      pricing: expect.any(Object),
      subscriptions: expect.any(Object),
      revenue: expect.any(Object),
      ai_cost: expect.any(Object),
      margin: expect.any(Object),
      conversion: expect.any(Object),
    }));
    expect(result.revenue).toEqual(expect.objectContaining({
      estimated_mrr_vnd: expect.any(Number),
      estimated_mrr_usd: expect.any(Number),
      estimated_arr_vnd: expect.any(Number),
      estimated_arr_usd: expect.any(Number),
    }));
  });

  it('separates trial and manual grants from estimated paid subscriptions', async () => {
    const service = makeService(makeDb([
      { user_id: 'paid-premium', tier: 'premium', is_active: true, payment_provider: 'stripe', updated_at: '2026-06-10T00:00:00.000Z' },
      { user_id: 'paid-pro', tier: 'pro', is_active: true, payment_provider: 'app_store', updated_at: '2026-06-10T00:00:00.000Z' },
      { user_id: 'trial', tier: 'premium', is_active: true, payment_provider: 'trial', updated_at: '2026-06-10T00:00:00.000Z' },
      { user_id: 'manual', tier: 'pro', is_active: true, payment_provider: 'manual', updated_at: '2026-06-10T00:00:00.000Z' },
      { user_id: 'unknown', tier: 'premium', is_active: true, payment_provider: 'unknown', updated_at: '2026-06-10T00:00:00.000Z' },
    ], [], [
      { id: 'paid-premium' },
      { id: 'paid-pro' },
      { id: 'trial' },
      { id: 'manual' },
      { id: 'unknown' },
    ]));

    const result = await service.getRevenue();

    expect(result.subscriptions.active_premium).toBe(3);
    expect(result.subscriptions.active_pro).toBe(2);
    expect(result.subscriptions.active_trial).toBe(1);
    expect(result.subscriptions.active_manual_grant).toBe(1);
    expect(result.subscriptions.active_paid_estimated).toBe(2);
    expect(result.revenue.estimated_paid_mrr_vnd).toBe(188000);
    expect(result.revenue.estimated_paid_arr_vnd).toBe(2256000);
    expect(result.revenue.estimated_revenue_note).toContain('Confirmed paid revenue');
  });

  it('counts all registered users in current user plan distribution without double counting', async () => {
    const service = makeService(makeDb([
      { user_id: 'no-subscription-deleted-row', tier: 'premium', is_active: true, payment_provider: 'stripe', updated_at: '2026-06-10T00:00:00.000Z' },
      { user_id: 'active-premium', tier: 'premium', is_active: true, payment_provider: 'stripe', updated_at: '2026-06-10T00:00:00.000Z' },
      { user_id: 'active-pro', tier: 'pro', is_active: true, payment_provider: 'stripe', updated_at: '2026-06-10T00:00:00.000Z' },
      { user_id: 'inactive-premium', tier: 'premium', is_active: false, payment_provider: 'stripe', updated_at: '2026-06-09T00:00:00.000Z' },
      { user_id: 'cancelled-latest', tier: 'premium', is_active: false, payment_provider: 'stripe', cancelled_at: '2026-06-11T00:00:00.000Z', updated_at: '2026-06-11T00:00:00.000Z' },
      { user_id: 'active-pro-with-old-premium', tier: 'premium', is_active: true, payment_provider: 'stripe', updated_at: '2026-05-01T00:00:00.000Z' },
      { user_id: 'active-pro-with-old-premium', tier: 'pro', is_active: true, payment_provider: 'stripe', updated_at: '2026-06-12T00:00:00.000Z' },
      { user_id: 'cancelled-but-reactivated', tier: 'premium', is_active: false, payment_provider: 'stripe', cancelled_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z' },
      { user_id: 'cancelled-but-reactivated', tier: 'premium', is_active: true, payment_provider: 'stripe', updated_at: '2026-06-13T00:00:00.000Z' },
    ], [], [
      { id: 'no-subscription' },
      { id: 'active-premium' },
      { id: 'active-pro' },
      { id: 'inactive-premium' },
      { id: 'cancelled-latest' },
      { id: 'active-pro-with-old-premium' },
      { id: 'cancelled-but-reactivated' },
    ]));

    const result = await service.getRevenue();

    expect(result.subscriptions.total_users).toBe(7);
    expect(result.subscriptions.active_free).toBe(2);
    expect(result.subscriptions.active_premium).toBe(2);
    expect(result.subscriptions.active_pro).toBe(2);
    expect(result.subscriptions.cancelled).toBe(1);
    expect(result.subscriptions.paid_users).toBe(4);
    expect(result.subscriptions.plan_distribution_total).toBe(7);
    expect(
      result.subscriptions.active_free
      + result.subscriptions.active_premium
      + result.subscriptions.active_pro
      + result.subscriptions.cancelled,
    ).toBe(result.subscriptions.total_users);
  });
});
