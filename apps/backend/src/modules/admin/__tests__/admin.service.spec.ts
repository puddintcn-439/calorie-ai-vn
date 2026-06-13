import { NotFoundException } from '@nestjs/common';
import { AdminService } from '../admin.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

const USER_ID = '4da564f2-6795-4b52-96a1-f0103f11a111';

function makeDb(tables: Record<string, any[]> = {}) {
  const state = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, [...rows]])) as Record<string, any[]>;
  const matches = (row: any, filters: Array<[string, any]>) => filters.every(([key, value]) => row?.[key] === value);
  const makeChain = (table: string) => {
    const chain: any = { filters: [] as Array<[string, any]> };
    const rows = () => (state[table] ?? []).filter((row) => matches(row, chain.filters));
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn((key: string, value: any) => { chain.filters.push([key, value]); return chain; });
    chain.order = jest.fn().mockReturnValue(chain);
    chain.gte = jest.fn().mockReturnValue(chain);
    chain.in = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn(async (count: number) => ({ data: rows().slice(0, count), error: null }));
    chain.maybeSingle = jest.fn(async () => ({ data: rows()[0] ?? null, error: null }));
    chain.then = (resolve: any, reject: any) => Promise.resolve({ data: rows(), count: rows().length, error: null }).then(resolve, reject);
    return chain;
  };
  return { from: jest.fn().mockImplementation(makeChain), state };
}

function makeService(db: any, billingService: Partial<BillingServiceMock> = {}) {
  const aiUsageService = { getQuotaRemaining: jest.fn().mockResolvedValue(null) };
  const billing = {
    getUserEntitlement: jest.fn().mockResolvedValue({ tier: 'free', source: 'free', active_until: null }),
    getPayosRenewalReminder: jest.fn().mockResolvedValue({ has_reminder: false }),
    ...billingService,
  };
  return new AdminService(
    { db } as unknown as SupabaseService,
    aiUsageService as any,
    billing as any,
  );
}

type BillingServiceMock = {
  getUserEntitlement: jest.Mock;
  getPayosRenewalReminder: jest.Mock;
};

describe('AdminService user billing detail', () => {
  it('includes safe billing data for PayOS support without raw provider payloads', async () => {
    const db = makeDb({
      users: [{ id: USER_ID, email: 'user@example.com', created_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-12T00:00:00.000Z' }],
      billing_subscriptions: [{
        user_id: USER_ID,
        provider: 'payos',
        tier: 'premium',
        status: 'active',
        is_paid: true,
        billing_period_start: '2026-06-12T17:11:30.000Z',
        billing_period_end: '2026-07-12T17:11:30.000Z',
        cancelled_at: null,
        raw_payload: { checksum: 'should-not-leak' },
        updated_at: '2026-06-12T17:11:30.000Z',
      }],
      billing_invoices: [{
        user_id: USER_ID,
        provider: 'payos',
        provider_invoice_id: '1781283708818137',
        tier: 'premium',
        status: 'paid',
        amount_vnd: 59000,
        paid_at: '2026-06-12T17:11:30.000Z',
        created_at: '2026-06-12T17:00:00.000Z',
        metadata: { interval: 'monthly', payos_payment_link_id: 'sensitive-ish' },
        raw_payload: { checksum: 'should-not-leak' },
      }],
    });
    const service = makeService(db, {
      getUserEntitlement: jest.fn().mockResolvedValue({
        tier: 'premium',
        source: 'paid',
        provider: 'payos',
        active_until: '2026-07-12T17:11:30.000Z',
        billing_subscription_id: 'internal-id',
      }),
      getPayosRenewalReminder: jest.fn().mockResolvedValue({
        has_reminder: true,
        tier: 'premium',
        provider: 'payos',
        active_until: '2026-07-12T17:11:30.000Z',
        billing_period_end: '2026-07-12T17:11:30.000Z',
        days_remaining: 7,
        reminder_window: '7_day',
        message: 'Gói Premium của bạn còn 7 ngày. Gia hạn để tiếp tục sử dụng.',
      }),
    });

    const result = await service.getUserDetail(USER_ID);

    expect(result.billing_entitlement).toEqual({
      tier: 'premium',
      source: 'paid',
      provider: 'payos',
      active_until: '2026-07-12T17:11:30.000Z',
    });
    expect(result.latest_billing_invoice).toEqual({
      provider: 'payos',
      provider_invoice_id: '1781283708818137',
      order_code: '1781283708818137',
      tier: 'premium',
      interval: 'monthly',
      status: 'paid',
      amount_vnd: 59000,
      paid_at: '2026-06-12T17:11:30.000Z',
      created_at: '2026-06-12T17:00:00.000Z',
    });
    expect(result.latest_billing_subscription).toEqual({
      provider: 'payos',
      tier: 'premium',
      status: 'active',
      is_paid: true,
      billing_period_start: '2026-06-12T17:11:30.000Z',
      billing_period_end: '2026-07-12T17:11:30.000Z',
      cancelled_at: null,
    });
    expect(result.latest_renewal_reminder).toEqual({
      has_reminder: true,
      reminder_window: '7_day',
      days_remaining: 7,
      message: 'Gói Premium của bạn còn 7 ngày. Gia hạn để tiếp tục sử dụng.',
    });
    expect(JSON.stringify(result)).not.toContain('raw_payload');
    expect(JSON.stringify(result)).not.toContain('should-not-leak');
    expect(JSON.stringify(result)).not.toContain('sensitive-ish');
    expect(JSON.stringify(result)).not.toContain('internal-id');
  });

  it('returns null billing fields safely when no billing data exists', async () => {
    const db = makeDb({
      users: [{ id: USER_ID, email: 'user@example.com', created_at: null, updated_at: null }],
    });
    const service = makeService(db);

    const result = await service.getUserDetail(USER_ID);

    expect(result.billing_entitlement).toEqual({ tier: 'free', source: 'free', provider: null, active_until: null });
    expect(result.latest_billing_invoice).toBeNull();
    expect(result.latest_billing_subscription).toBeNull();
    expect(result.latest_renewal_reminder).toEqual({ has_reminder: false });
  });

  it('throws not found for missing users', async () => {
    const service = makeService(makeDb());

    await expect(service.getUserDetail(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
