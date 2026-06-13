import { NotFoundException } from '@nestjs/common';
import { AdminService } from '../admin.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

const USER_ID = '4da564f2-6795-4b52-96a1-f0103f11a111';

function makeDb(tables: Record<string, any[]> = {}) {
  const state = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, [...rows]])) as Record<string, any[]>;
  const matches = (row: any, filters: Array<[string, any]>, inFilters: Array<[string, any[]]>) =>
    filters.every(([key, value]) => row?.[key] === value)
    && inFilters.every(([key, values]) => values.includes(row?.[key]));
  const makeChain = (table: string) => {
    const chain: any = { filters: [] as Array<[string, any]>, inFilters: [] as Array<[string, any[]]>, orders: [] as Array<[string, boolean]>, insertPayload: null as any, updatePayload: null as any };
    const rows = () => {
      const filtered = (state[table] ?? []).filter((row) => matches(row, chain.filters, chain.inFilters));
      return chain.orders.reduce((items: any[], pair: [string, boolean]) => {
        const [key, ascending] = pair;
        return [...items].sort((a: any, b: any) => {
          const left = String(a?.[key] ?? '');
          const right = String(b?.[key] ?? '');
          return ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
      }, filtered as any[]);
    };
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn((key: string, value: any) => { chain.filters.push([key, value]); return chain; });
    chain.order = jest.fn((key: string, options?: { ascending?: boolean }) => { chain.orders.push([key, options?.ascending !== false]); return chain; });
    chain.gte = jest.fn().mockReturnValue(chain);
    chain.in = jest.fn((key: string, value: any[]) => { chain.inFilters.push([key, value]); return chain; });
    chain.insert = jest.fn((payload: any) => { chain.insertPayload = payload; return chain; });
    chain.update = jest.fn((payload: any) => { chain.updatePayload = payload; return chain; });
    chain.limit = jest.fn(async (count: number) => ({ data: rows().slice(0, count), error: null }));
    chain.maybeSingle = jest.fn(async () => {
      if (chain.insertPayload) {
        state[table] = state[table] ?? [];
        const row = { id: `${table}-${state[table].length + 1}`, ...chain.insertPayload };
        state[table].push(row);
        return { data: row, error: null };
      }
      if (chain.updatePayload) {
        const index = (state[table] ?? []).findIndex((row) => matches(row, chain.filters, chain.inFilters));
        if (index >= 0) {
          state[table][index] = { ...state[table][index], ...chain.updatePayload };
          return { data: state[table][index], error: null };
        }
        return { data: null, error: null };
      }
      return { data: rows()[0] ?? null, error: null };
    });
    chain.then = (resolve: any, reject: any) => {
      if (chain.insertPayload) {
        state[table] = state[table] ?? [];
        state[table].push({ id: `${table}-${state[table].length + 1}`, ...chain.insertPayload });
      }
      if (chain.updatePayload) {
        state[table] = (state[table] ?? []).map((row) => matches(row, chain.filters, chain.inFilters) ? { ...row, ...chain.updatePayload } : row);
      }
      return Promise.resolve({ data: rows(), count: rows().length, error: null }).then(resolve, reject);
    };
    return chain;
  };
  return { from: jest.fn().mockImplementation(makeChain), state };
}

function makeService(db: any, billingService: Partial<BillingServiceMock> = {}, notificationsService?: any) {
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
    notificationsService,
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
    const notificationsService = { notifyPaymentIssueStatusChanged: jest.fn().mockResolvedValue(null) };
    const service = makeService(db, {}, notificationsService);

    const result = await service.getUserDetail(USER_ID);

    expect(result.billing_entitlement).toEqual({ tier: 'free', source: 'free', provider: null, active_until: null });
    expect(result.latest_billing_invoice).toBeNull();
    expect(result.latest_billing_subscription).toBeNull();
    expect(result.latest_renewal_reminder).toEqual({ has_reminder: false });
  });

  it('selects latest billing invoice/subscription for the requested user only', async () => {
    const db = makeDb({
      users: [{ id: USER_ID, email: 'user@example.com', created_at: null, updated_at: null }],
      billing_subscriptions: [
        { user_id: USER_ID, provider: 'payos', tier: 'premium', status: 'expired', is_paid: true, billing_period_end: '2026-05-12T00:00:00.000Z', updated_at: '2026-05-12T00:00:00.000Z' },
        { user_id: USER_ID, provider: 'payos', tier: 'pro', status: 'active', is_paid: true, billing_period_end: '2026-07-12T00:00:00.000Z', updated_at: '2026-06-12T00:00:00.000Z' },
        { user_id: 'other-user', provider: 'payos', tier: 'premium', status: 'active', is_paid: true, billing_period_end: '2099-01-01T00:00:00.000Z', updated_at: '2099-01-01T00:00:00.000Z' },
      ],
      billing_invoices: [
        { user_id: USER_ID, provider: 'payos', provider_invoice_id: 'old-order', tier: 'premium', status: 'paid', amount_vnd: 59000, created_at: '2026-05-12T00:00:00.000Z', metadata: { interval: 'monthly' } },
        { user_id: USER_ID, provider: 'payos', provider_invoice_id: 'new-order', tier: 'pro', status: 'paid', amount_vnd: 999000, created_at: '2026-06-12T00:00:00.000Z', metadata: { interval: 'annual' } },
        { user_id: 'other-user', provider: 'payos', provider_invoice_id: 'other-order', tier: 'premium', status: 'paid', amount_vnd: 59000, created_at: '2099-01-01T00:00:00.000Z', metadata: { interval: 'monthly' } },
      ],
    });
    const service = makeService(db);

    const result = await service.getUserDetail(USER_ID);

    expect(result.latest_billing_subscription).toMatchObject({
      provider: 'payos',
      tier: 'pro',
      status: 'active',
      billing_period_end: '2026-07-12T00:00:00.000Z',
    });
    expect(result.latest_billing_invoice).toMatchObject({
      provider_invoice_id: 'new-order',
      order_code: 'new-order',
      tier: 'pro',
      interval: 'annual',
      amount_vnd: 999000,
    });
    expect(JSON.stringify(result)).not.toContain('other-order');
    expect(JSON.stringify(result)).not.toContain('2099-01-01');
  });

  it('throws not found for missing users', async () => {
    const service = makeService(makeDb());

    await expect(service.getUserDetail(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists payment issues with safe user and invoice summaries', async () => {
    const invoiceId = '11111111-1111-4111-8111-111111111111';
    const db = makeDb({
      users: [{ id: USER_ID, email: 'user@example.com' }],
      billing_invoices: [{
        id: invoiceId,
        provider: 'payos',
        provider_invoice_id: '1781283708818137',
        tier: 'premium',
        status: 'paid',
        amount_vnd: 59000,
        raw_payload: { checksum: 'should-not-leak' },
      }],
      billing_payment_issues: [{
        id: '33333333-3333-4333-8333-333333333333',
        user_id: USER_ID,
        invoice_id: invoiceId,
        provider: 'payos',
        issue_type: 'refund_request',
        status: 'open',
        user_message: 'Please review.',
        admin_note: 'Internal triage note.',
        created_at: '2026-06-12T00:00:00.000Z',
      }],
    });
    const notificationsService = { notifyPaymentIssueStatusChanged: jest.fn().mockResolvedValue(null) };
    const service = makeService(db, {}, notificationsService);

    const result = await service.getPaymentIssues({ status: 'open', provider: 'payos' });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      user_id: USER_ID,
      user_email: 'user@example.com',
      provider: 'payos',
      issue_type: 'refund_request',
      status: 'open',
      admin_note: 'Internal triage note.',
      invoice: {
        provider: 'payos',
        provider_invoice_id: '1781283708818137',
        order_code: '1781283708818137',
        amount_vnd: 59000,
      },
    });
    expect(JSON.stringify(result)).not.toContain('raw_payload');
    expect(JSON.stringify(result)).not.toContain('should-not-leak');
  });

  it('lets admin update payment issue status and writes an audit log without mutating subscriptions', async () => {
    const issueId = '33333333-3333-4333-8333-333333333333';
    const db = makeDb({
      billing_payment_issues: [{
        id: issueId,
        user_id: USER_ID,
        provider: 'payos',
        issue_type: 'payment_succeeded_but_not_activated',
        status: 'open',
        user_message: 'Paid but not active.',
        created_at: '2026-06-12T00:00:00.000Z',
      }],
      billing_subscriptions: [{
        id: 'sub-1',
        user_id: USER_ID,
        provider: 'payos',
        status: 'active',
        is_paid: true,
      }],
    });
    const notificationsService = { notifyPaymentIssueStatusChanged: jest.fn().mockResolvedValue(null) };
    const service = makeService(db, {}, notificationsService);

    const result = await service.updatePaymentIssue(issueId, {
      email: 'admin@example.com',
      role: 'support',
      user_id: '99999999-9999-4999-8999-999999999999',
    }, {
      status: 'resolved',
      admin_note: 'Webhook already processed.',
      resolution: 'Entitlement confirmed active.',
    });

    expect(result).toMatchObject({
      ok: true,
      audited: true,
      issue: {
        id: issueId,
        status: 'resolved',
        admin_note: 'Webhook already processed.',
        resolution: 'Entitlement confirmed active.',
      },
    });
    expect(db.state.billing_payment_issues[0]).toMatchObject({
      status: 'resolved',
      resolved_by_admin_id: '99999999-9999-4999-8999-999999999999',
    });
    expect(db.state.billing_subscriptions[0]).toMatchObject({ status: 'active', is_paid: true });
    expect(db.state.admin_audit_log[0]).toMatchObject({
      actor_email: 'admin@example.com',
      action: 'billing.payment_issue.update',
      target_type: 'billing_payment_issue',
      target_id: issueId,
    });
    expect(notificationsService.notifyPaymentIssueStatusChanged).toHaveBeenCalledWith(expect.objectContaining({
      id: issueId,
      status: 'resolved',
      resolution: 'Entitlement confirmed active.',
    }));
  });

  it('notifies on in_review and rejected status changes but not unchanged status', async () => {
    const db = makeDb({
      billing_payment_issues: [{
        id: '33333333-3333-4333-8333-333333333333',
        user_id: USER_ID,
        provider: 'payos',
        issue_type: 'refund_request',
        status: 'open',
      }],
    });
    const notificationsService = { notifyPaymentIssueStatusChanged: jest.fn().mockResolvedValue(null) };
    const service = makeService(db, {}, notificationsService);
    const actor = { email: 'admin@example.com', role: 'support', user_id: USER_ID };

    await service.updatePaymentIssue('33333333-3333-4333-8333-333333333333', actor, { status: 'in_review' });
    await service.updatePaymentIssue('33333333-3333-4333-8333-333333333333', actor, { status: 'in_review', admin_note: 'No user notification.' });
    await service.updatePaymentIssue('33333333-3333-4333-8333-333333333333', actor, { status: 'rejected', resolution: 'Không đủ điều kiện xử lý.' });

    expect(notificationsService.notifyPaymentIssueStatusChanged).toHaveBeenCalledTimes(2);
    expect(notificationsService.notifyPaymentIssueStatusChanged).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: 'in_review' }));
    expect(notificationsService.notifyPaymentIssueStatusChanged).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: 'rejected', resolution: 'Không đủ điều kiện xử lý.' }));
  });
});
