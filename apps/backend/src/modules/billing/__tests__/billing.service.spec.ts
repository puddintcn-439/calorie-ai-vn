import { BadRequestException, HttpException, UnauthorizedException } from '@nestjs/common';
import { BillingService } from '../billing.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

function makeDb(tables: Record<string, { data?: any[]; error?: any }> = {}, insertResult: any = { error: null }) {
  const state = Object.fromEntries(Object.entries(tables).map(([table, result]) => [table, [...(result.data ?? [])]])) as Record<string, any[]>;
  const tableError = (table: string) => tables[table]?.error ?? null;
  const insert = jest.fn().mockImplementation((payload: any) => {
    if (insertResult.error) return Promise.resolve(insertResult);
    state.billing_events = state.billing_events ?? [];
    state.billing_events.push({ id: `billing_events-${state.billing_events.length + 1}`, ...payload });
    return Promise.resolve({ data: null, error: null });
  });
  const uniqueKey: Record<string, string> = {
    billing_customers: 'provider_customer_id',
    billing_subscriptions: 'provider_subscription_id',
    billing_invoices: 'provider_invoice_id',
    billing_refunds: 'provider_refund_id',
    user_subscriptions: 'user_id',
  };
  const matches = (row: any, filters: Array<[string, any]>, inFilters: Array<[string, any[]]> = [], isFilters: Array<[string, any]> = []) =>
    filters.every(([key, value]) => row?.[key] === value)
    && inFilters.every(([key, values]) => values.includes(row?.[key]))
    && isFilters.every(([key, value]) => row?.[key] === value);
  const makeChain = (table: string) => {
    const chain: any = { filters: [] as Array<[string, any]>, inFilters: [] as Array<[string, any[]]>, isFilters: [] as Array<[string, any]>, insertPayload: null as any, upsertPayload: null as any, updatePayload: null as any };
    const applyInsert = () => {
      state[table] = state[table] ?? [];
      const row = { id: `${table}-${state[table].length + 1}`, ...chain.insertPayload };
      state[table].push(row);
      return row;
    };
    const applyUpsert = () => {
      state[table] = state[table] ?? [];
      const key = uniqueKey[table];
      const index = key
        ? state[table].findIndex((row) => table === 'user_subscriptions'
          ? row[key] === chain.upsertPayload[key]
          : row.provider === chain.upsertPayload.provider && row[key] === chain.upsertPayload[key])
        : -1;
      const row = { id: index >= 0 ? state[table][index].id : `${table}-${state[table].length + 1}`, ...(index >= 0 ? state[table][index] : {}), ...chain.upsertPayload };
      if (index >= 0) state[table][index] = row;
      else state[table].push(row);
      return row;
    };
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn((key: string, value: any) => { chain.filters.push([key, value]); return chain; });
    chain.in = jest.fn((key: string, value: any[]) => { chain.inFilters.push([key, value]); return chain; });
    chain.is = jest.fn((key: string, value: any) => { chain.isFilters.push([key, value]); return chain; });
    chain.gte = jest.fn().mockReturnValue(chain);
    chain.order = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockImplementation(async () => ({ data: (state[table] ?? []).filter((row) => matches(row, chain.filters, chain.inFilters, chain.isFilters)), error: tableError(table) }));
    chain.insert = jest.fn((payload: any) => {
      if (table === 'billing_events') return insert(payload);
      chain.insertPayload = payload;
      return chain;
    });
    chain.upsert = jest.fn((payload: any) => { chain.upsertPayload = payload; return chain; });
    chain.update = jest.fn((payload: any) => { chain.updatePayload = payload; return chain; });
    chain.maybeSingle = jest.fn().mockImplementation(async () => {
      if (tableError(table)) return { data: null, error: tableError(table) };
      state[table] = state[table] ?? [];
      if (chain.insertPayload) {
        const row = applyInsert();
        return { data: row, error: null };
      }
      if (chain.upsertPayload) {
        const row = applyUpsert();
        return { data: row, error: null };
      }
      return { data: state[table].find((row) => matches(row, chain.filters, chain.inFilters, chain.isFilters)) ?? null, error: null };
    });
    chain.then = (resolve: any, reject: any) => {
      if (chain.insertPayload) {
        applyInsert();
      }
      if (chain.upsertPayload) {
        applyUpsert();
      }
      if (chain.updatePayload) {
        state[table] = (state[table] ?? []).map((row) => matches(row, chain.filters, chain.inFilters, chain.isFilters) ? { ...row, ...chain.updatePayload } : row);
      }
      return Promise.resolve({ data: null, error: tableError(table) }).then(resolve, reject);
    };
    return chain;
  };
  const db = {
    state,
    insert,
    from: jest.fn().mockImplementation(makeChain),
  };
  return db;
}

function makeService(db: any, config: Record<string, string> = {}) {
  return new BillingService(
    { db } as unknown as SupabaseService,
    { get: jest.fn((key: string) => config[key]) } as any,
  );
}

function payosSuccessPayload(orderCode: number, amount = 59000, overrides: Record<string, any> = {}) {
  return {
    code: '00',
    desc: 'success',
    success: true,
    data: {
      orderCode,
      amount,
      description: 'CAI PREMIUM',
      reference: `ref_${orderCode}`,
      transactionDateTime: '2026-06-12T12:00:00.000Z',
      currency: 'VND',
      paymentLinkId: `plink_${orderCode}`,
      ...overrides,
    },
    signature: 'test_signature',
  };
}

describe('BillingService', () => {
  const now = new Date('2026-06-12T12:00:00.000Z');

  it('counts paid invoices as gross and net revenue', async () => {
    const service = makeService(makeDb({
      billing_invoices: { data: [{ status: 'paid', amount_vnd: 59000, paid_at: now.toISOString() }] },
    }));

    const result = await service.getConfirmedRevenueSummary(now);

    expect(result.month_to_date.gross_revenue_vnd).toBe(59000);
    expect(result.month_to_date.net_revenue_vnd).toBe(59000);
    expect(result.month_to_date.paid_invoice_count).toBe(1);
  });

  it('subtracts refunds from net revenue', async () => {
    const service = makeService(makeDb({
      billing_invoices: { data: [{ status: 'paid', amount_vnd: 129000, paid_at: now.toISOString() }] },
      billing_refunds: { data: [{ amount_vnd: 29000, refunded_at: now.toISOString() }] },
    }));

    const result = await service.getConfirmedRevenueSummary(now);

    expect(result.month_to_date.gross_revenue_vnd).toBe(129000);
    expect(result.month_to_date.refunds_vnd).toBe(29000);
    expect(result.month_to_date.net_revenue_vnd).toBe(100000);
    expect(result.month_to_date.refund_count).toBe(1);
  });

  it('converts VND invoice amounts to USD', async () => {
    const service = makeService(makeDb({
      billing_invoices: { data: [{ status: 'paid', amount_vnd: 260000, paid_at: now.toISOString() }] },
    }), { USD_TO_VND_RATE: '26000' });

    const result = await service.getConfirmedRevenueSummary(now);

    expect(result.month_to_date.gross_revenue_usd).toBe(10);
    expect(result.month_to_date.net_revenue_usd).toBe(10);
  });

  it('converts USD invoice amounts to VND', async () => {
    const service = makeService(makeDb({
      billing_invoices: { data: [{ status: 'paid', amount_usd: 5, paid_at: now.toISOString() }] },
    }), { USD_TO_VND_RATE: '26000' });

    const result = await service.getConfirmedRevenueSummary(now);

    expect(result.month_to_date.gross_revenue_vnd).toBe(130000);
    expect(result.month_to_date.net_revenue_vnd).toBe(130000);
  });

  it('returns zero summary when billing tables are empty or unavailable', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { error: { message: 'missing table' } },
      billing_invoices: { error: { message: 'missing table' } },
      billing_refunds: { error: { message: 'missing table' } },
    }));

    const result = await service.getConfirmedRevenueSummary(now);

    expect(result.active_paid_users).toBe(0);
    expect(result.active_paid_subscriptions).toBe(0);
    expect(result.month_to_date).toMatchObject({
      gross_revenue_vnd: 0,
      refunds_vnd: 0,
      net_revenue_vnd: 0,
      paid_invoice_count: 0,
      refund_count: 0,
    });
  });

  it('stores webhook raw payload as a billing event', async () => {
    const db = makeDb({}, { error: null });
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value' });
    const payload = { id: 'evt_1', type: 'invoice.paid', nested: { ok: true } };

    const result = await service.handleStripeWebhook(payload, { 'x-webhook-secret': 'secret-value' });

    expect(result).toEqual({ ok: true, provider: 'stripe', event_id: 'evt_1', event_type: 'invoice.paid', duplicate: false, processed: false, skipped_reason: 'stripe invoice is missing id or customer' });
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'stripe',
      provider_event_id: 'evt_1',
      event_type: 'invoice.paid',
      status: 'received',
      raw_payload: payload,
    }));
  });

  it('ignores duplicate provider events idempotently', async () => {
    const service = makeService(makeDb({}, { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }));

    await expect(service.recordBillingEvent({
      provider: 'stripe',
      providerEventId: 'evt_duplicate',
      eventType: 'invoice.paid',
      rawPayload: {},
    })).resolves.toEqual({ ok: true, duplicate: true, ignored: true });
  });

  it('does not expose configured webhook secret in error messages', async () => {
    const service = makeService(makeDb(), { STRIPE_WEBHOOK_SECRET: 'super-sensitive-secret' });

    try {
      await service.handleStripeWebhook({ id: 'evt_1' }, { 'x-webhook-secret': 'wrong' });
      fail('Expected webhook validation to fail');
    } catch (error: any) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(String(error?.message)).not.toContain('super-sensitive-secret');
      expect(JSON.stringify(error?.getResponse?.())).not.toContain('super-sensitive-secret');
    }
  });

  it('returns 501 for unconfigured webhook secrets in production', async () => {
    const service = makeService(makeDb(), { NODE_ENV: 'production' });

    await expect(service.handleStripeWebhook({ id: 'evt_1' }, {})).rejects.toBeInstanceOf(HttpException);
  });

  it('does not create duplicate invoices for duplicate Stripe events', async () => {
    const db = makeDb({}, { error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value' });

    const result = await service.handleStripeWebhook({ id: 'evt_dup', type: 'invoice.paid', data: { object: { id: 'in_1', customer: 'cus_1' } } }, { 'x-webhook-secret': 'secret-value' });

    expect(result).toMatchObject({ duplicate: true, processed: false, skipped_reason: 'duplicate' });
    expect(db.state.billing_invoices ?? []).toHaveLength(0);
  });

  it('maps Stripe invoice.paid into billing_invoices when customer maps to a user', async () => {
    const db = makeDb({
      billing_customers: { data: [{ id: 'bc_1', provider: 'stripe', provider_customer_id: 'cus_1', user_id: 'user-1' }] },
    });
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value', USD_TO_VND_RATE: '26000' });
    const payload = {
      id: 'evt_invoice',
      type: 'invoice.paid',
      data: { object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', amount_paid: 5900000, currency: 'vnd', metadata: { tier: 'premium' }, status_transitions: { paid_at: 1781265600 }, lines: { data: [{ period: { start: 1781265600, end: 1783857600 } }] } } },
    };

    const result = await service.handleStripeWebhook(payload, { 'x-webhook-secret': 'secret-value' });

    expect(result).toMatchObject({ processed: true, duplicate: false });
    expect(db.state.billing_invoices[0]).toMatchObject({
      provider: 'stripe',
      provider_invoice_id: 'in_1',
      user_id: 'user-1',
      tier: 'premium',
      status: 'paid',
      amount_original: 59000,
      currency_original: 'VND',
      amount_vnd: 59000,
      amount_usd: 2.2692,
    });
  });

  it('maps Stripe USD invoice amounts to VND', async () => {
    const db = makeDb({
      billing_customers: { data: [{ id: 'bc_1', provider: 'stripe', provider_customer_id: 'cus_1', user_id: 'user-1' }] },
    });
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value', USD_TO_VND_RATE: '26000' });

    await service.handleStripeWebhook({ id: 'evt_usd', type: 'invoice.payment_succeeded', data: { object: { id: 'in_usd', customer: 'cus_1', amount_paid: 500, currency: 'usd', metadata: { tier: 'pro' } } } }, { 'x-webhook-secret': 'secret-value' });

    expect(db.state.billing_invoices[0]).toMatchObject({ amount_original: 5, amount_usd: 5, amount_vnd: 130000, tier: 'pro' });
  });

  it('upserts Stripe subscription.updated into billing_subscriptions', async () => {
    const db = makeDb({
      billing_customers: { data: [{ id: 'bc_1', provider: 'stripe', provider_customer_id: 'cus_1', user_id: 'user-1' }] },
    });
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value' });

    const result = await service.handleStripeWebhook({ id: 'evt_sub', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_start: 1781265600, current_period_end: 1783857600, metadata: { tier: 'pro' } } } }, { 'x-webhook-secret': 'secret-value' });

    expect(result).toMatchObject({ processed: true });
    expect(db.state.billing_subscriptions[0]).toMatchObject({
      provider_subscription_id: 'sub_1',
      user_id: 'user-1',
      tier: 'pro',
      status: 'active',
      is_paid: true,
    });
  });

  it('maps Stripe refund.created into billing_refunds', async () => {
    const db = makeDb({
      billing_customers: { data: [{ id: 'bc_1', provider: 'stripe', provider_customer_id: 'cus_1', user_id: 'user-1' }] },
      billing_invoices: { data: [{ id: 'bi_1', provider: 'stripe', provider_invoice_id: 'in_1' }] },
    });
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value', USD_TO_VND_RATE: '26000' });

    const result = await service.handleStripeWebhook({ id: 'evt_refund', type: 'refund.created', data: { object: { id: 're_1', customer: 'cus_1', invoice: 'in_1', amount: 500, currency: 'usd', reason: 'requested_by_customer' } } }, { 'x-webhook-secret': 'secret-value' });

    expect(result).toMatchObject({ processed: true });
    expect(db.state.billing_refunds[0]).toMatchObject({
      provider_refund_id: 're_1',
      user_id: 'user-1',
      billing_invoice_id: 'bi_1',
      amount_original: 5,
      amount_usd: 5,
      amount_vnd: 130000,
    });
  });

  it('stores unknown Stripe events without throwing', async () => {
    const db = makeDb();
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value' });

    await expect(service.handleStripeWebhook({ id: 'evt_unknown', type: 'customer.created' }, { 'x-webhook-secret': 'secret-value' }))
      .resolves.toMatchObject({ ok: true, processed: false, skipped_reason: 'unknown_event_type' });
    expect(db.state.billing_events[0]).toMatchObject({ provider_event_id: 'evt_unknown', status: 'received' });
  });

  it('skips Stripe invoices with unresolved customers without failing', async () => {
    const db = makeDb();
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value' });

    const result = await service.handleStripeWebhook({ id: 'evt_unresolved', type: 'invoice.paid', data: { object: { id: 'in_1', customer: 'cus_missing', amount_paid: 5900000, currency: 'vnd' } } }, { 'x-webhook-secret': 'secret-value' });

    expect(result).toMatchObject({ processed: false, skipped_reason: 'stripe customer is not linked to a user' });
    expect(db.state.billing_invoices ?? []).toHaveLength(0);
    expect(db.state.billing_events[0]).toMatchObject({ provider_event_id: 'evt_unresolved', status: 'ignored', error_message: 'stripe customer is not linked to a user' });
  });

  it('returns an existing Stripe customer for checkout linking', async () => {
    const db = makeDb({
      billing_customers: { data: [{ id: 'bc_1', provider: 'stripe', provider_customer_id: 'cus_existing', user_id: 'user-1' }] },
    });
    const service = makeService(db);

    await expect(service.getOrCreateStripeCustomerForUser({ userId: 'user-1', email: 'user@example.com' }))
      .resolves.toEqual({
        user_id: 'user-1',
        provider: 'stripe',
        provider_customer_id: 'cus_existing',
        created: false,
      });
  });

  it('creates a local placeholder Stripe customer only outside production', async () => {
    const db = makeDb();
    const service = makeService(db);

    const result = await service.getOrCreateStripeCustomerForUser({ userId: 'user-1', email: 'user@example.com' });

    expect(result).toEqual({
      user_id: 'user-1',
      provider: 'stripe',
      provider_customer_id: 'test_cus_user-1',
      created: true,
    });
    expect(db.state.billing_customers[0]).toMatchObject({
      provider: 'stripe',
      provider_customer_id: 'test_cus_user-1',
      user_id: 'user-1',
      email: 'user@example.com',
      metadata: expect.objectContaining({ source: 'local_placeholder', created_by: 'checkout' }),
    });
  });

  it('creates a real Stripe customer with metadata when Stripe client is configured', async () => {
    const db = makeDb();
    const service = makeService(db, { STRIPE_SECRET_KEY: 'sk_test_123' });
    const stripeMock = {
      customers: {
        create: jest.fn().mockResolvedValue({ id: 'cus_real' }),
      },
    };
    jest.spyOn(service as any, 'getStripeClient').mockReturnValue(stripeMock);

    const result = await service.getOrCreateStripeCustomerForUser({
      userId: '4da564f2-6795-4b52-96a1-f0103f11a111',
      email: 'user@example.com',
    });

    expect(stripeMock.customers.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      metadata: { user_id: '4da564f2-6795-4b52-96a1-f0103f11a111' },
    });
    expect(result).toMatchObject({ provider_customer_id: 'cus_real', created: true });
    expect(db.state.billing_customers[0]).toMatchObject({
      provider_customer_id: 'cus_real',
      metadata: expect.objectContaining({ source: 'stripe', created_by: 'checkout' }),
    });
  });

  it('throws a safe error for production checkout without Stripe config', async () => {
    const service = makeService(makeDb(), { NODE_ENV: 'production' });

    await expect(service.getOrCreateStripeCustomerForUser({ userId: 'user-1' }))
      .rejects.toMatchObject({ response: 'Stripe checkout is not configured for production.' });
  });

  it('returns a mock Stripe checkout URL outside production when Stripe is not configured', async () => {
    const service = makeService(makeDb(), {
      STRIPE_PRICE_PREMIUM_MONTHLY: 'price_premium_monthly',
    });

    const result = await service.createStripeCheckoutSession({
      userId: 'user-1',
      email: 'user@example.com',
      tier: 'premium',
      interval: 'monthly',
    });

    expect(result).toMatchObject({
      ok: true,
      provider: 'stripe',
      checkout_url: expect.stringContaining('http://localhost:3000/mock-checkout?'),
      customer_id: 'test_cus_user-1',
      tier: 'premium',
      interval: 'monthly',
    });
    expect(result.checkout_url).toContain('price_id=price_premium_monthly');
  });

  it('creates a real Stripe checkout session when Stripe client is configured', async () => {
    const db = makeDb({
      billing_customers: { data: [{ id: 'bc_1', provider: 'stripe', provider_customer_id: 'cus_existing', user_id: 'user-1' }] },
    });
    const service = makeService(db, {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PRICE_PRO_ANNUAL: 'price_pro_annual',
      BILLING_SUCCESS_URL: 'https://example.com/success',
      BILLING_CANCEL_URL: 'https://example.com/cancel',
    });
    const stripeMock = {
      checkout: {
        sessions: {
          create: jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/c/session_123' }),
        },
      },
    };
    jest.spyOn(service as any, 'getStripeClient').mockReturnValue(stripeMock);

    const result = await service.createStripeCheckoutSession({
      userId: 'user-1',
      email: 'user@example.com',
      tier: 'pro',
      interval: 'annual',
    });

    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith({
      mode: 'subscription',
      customer: 'cus_existing',
      line_items: [{ price: 'price_pro_annual', quantity: 1 }],
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      metadata: { user_id: 'user-1', tier: 'pro', interval: 'annual' },
      subscription_data: { metadata: { user_id: 'user-1', tier: 'pro', interval: 'annual' } },
    });
    expect(result).toMatchObject({
      checkout_url: 'https://checkout.stripe.com/c/session_123',
      customer_id: 'cus_existing',
      tier: 'pro',
      interval: 'annual',
    });
  });

  it('does not return a mock Stripe checkout URL in production', async () => {
    const service = makeService(makeDb(), { NODE_ENV: 'production' });

    await expect(service.createStripeCheckoutSession({
      userId: 'user-1',
      tier: 'premium',
      interval: 'monthly',
    })).rejects.toBeInstanceOf(HttpException);
  });

  it('returns a mock PayOS checkout URL outside production when PayOS is not configured', async () => {
    const db = makeDb();
    const service = makeService(db, { USD_TO_VND_RATE: '26000' });

    const result = await service.createPayosCheckout({
      userId: 'user-1',
      email: 'user@example.com',
      tier: 'premium',
      interval: 'monthly',
    });

    expect(result).toMatchObject({
      ok: true,
      provider: 'payos',
      checkout_url: expect.stringContaining('http://localhost:3000/mock-payos-checkout?'),
      tier: 'premium',
      interval: 'monthly',
      amount_vnd: 59000,
    });
    expect(db.state.billing_invoices[0]).toMatchObject({
      provider: 'payos',
      provider_invoice_id: String(result.order_code),
      user_id: 'user-1',
      tier: 'premium',
      status: 'open',
      amount_vnd: 59000,
      currency_original: 'VND',
      metadata: expect.objectContaining({ interval: 'monthly', source: 'payos_checkout_created' }),
    });
  });

  it('throws a safe error for production PayOS checkout without PayOS config', async () => {
    const db = makeDb();
    const service = makeService(db, { NODE_ENV: 'production' });

    await expect(service.createPayosCheckout({
      userId: 'user-1',
      tier: 'premium',
      interval: 'monthly',
    })).rejects.toMatchObject({ response: 'PayOS is not configured.' });

    expect(db.state.billing_invoices ?? []).toHaveLength(0);
  });

  it('creates a real PayOS checkout link when PayOS client is configured', async () => {
    const db = makeDb();
    const service = makeService(db, {
      PAYOS_CLIENT_ID: 'client_id',
      PAYOS_API_KEY: 'api_key',
      PAYOS_CHECKSUM_KEY: 'checksum_key',
      PAYOS_RETURN_URL: 'https://example.com/payos-return',
      PAYOS_CANCEL_URL: 'https://example.com/payos-cancel',
    });
    const payosMock = {
      paymentRequests: {
        create: jest.fn().mockResolvedValue({ checkoutUrl: 'https://pay.payos.vn/web/payment-link' }),
      },
    };
    jest.spyOn(service as any, 'getPayosClient').mockReturnValue(payosMock);

    const result = await service.createPayosCheckout({
      userId: 'user-1',
      email: 'user@example.com',
      tier: 'pro',
      interval: 'annual',
    });

    expect(payosMock.paymentRequests.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 999000,
      description: 'CAI PRO',
      cancelUrl: 'https://example.com/payos-cancel',
      returnUrl: 'https://example.com/payos-return',
      items: [{ name: 'Calorie AI Pro Annual', quantity: 1, price: 999000 }],
    }));
    expect(result).toMatchObject({
      provider: 'payos',
      checkout_url: 'https://pay.payos.vn/web/payment-link',
      tier: 'pro',
      interval: 'annual',
      amount_vnd: 999000,
    });
  });

  it('uses PayOS webhook verification when PayOS client exists', async () => {
    const orderCode = 900001;
    const payload = payosSuccessPayload(orderCode);
    const db = makeDb({
      billing_invoices: { data: [{ provider: 'payos', provider_invoice_id: String(orderCode), user_id: 'user-1', tier: 'premium', status: 'open', amount_vnd: 59000, metadata: { interval: 'monthly' } }] },
    });
    const service = makeService(db);
    const payosMock = {
      webhooks: {
        verify: jest.fn().mockResolvedValue(payload.data),
      },
    };
    jest.spyOn(service as any, 'getPayosClient').mockReturnValue(payosMock);

    const result = await service.handlePayosWebhook(payload);

    expect(payosMock.webhooks.verify).toHaveBeenCalledWith(payload);
    expect(result).toMatchObject({ provider: 'payos', processed: true });
  });

  it('successful PayOS webhook updates invoice and creates active subscription', async () => {
    const orderCode = 900002;
    const db = makeDb({
      billing_invoices: { data: [{ provider: 'payos', provider_invoice_id: String(orderCode), user_id: 'user-1', tier: 'premium', status: 'open', amount_vnd: 59000, metadata: { interval: 'monthly' } }] },
    });
    const service = makeService(db);

    const result = await service.handlePayosWebhook(payosSuccessPayload(orderCode));

    expect(result).toMatchObject({ processed: true, entitlement_sync: { attempted: true, synced: true } });
    expect(db.state.billing_invoices[0]).toMatchObject({
      provider: 'payos',
      provider_invoice_id: String(orderCode),
      status: 'paid',
      paid_at: '2026-06-12T12:00:00.000Z',
    });
    expect(db.state.billing_subscriptions[0]).toMatchObject({
      provider: 'payos',
      provider_subscription_id: `payos_${orderCode}`,
      user_id: 'user-1',
      tier: 'premium',
      status: 'active',
      is_paid: true,
    });
    expect(db.state.user_subscriptions[0]).toMatchObject({
      user_id: 'user-1',
      tier: 'premium',
      is_active: true,
      payment_provider: 'payos',
    });
  });

  it('sets PayOS monthly period end one month after payment', async () => {
    const orderCode = 900003;
    const db = makeDb({
      billing_invoices: { data: [{ provider: 'payos', provider_invoice_id: String(orderCode), user_id: 'user-1', tier: 'premium', status: 'open', amount_vnd: 59000, metadata: { interval: 'monthly' } }] },
    });
    const service = makeService(db);

    await service.handlePayosWebhook(payosSuccessPayload(orderCode, 59000, { transactionDateTime: '2026-06-12T00:00:00.000Z' }));

    expect(db.state.billing_subscriptions[0]).toMatchObject({
      billing_period_start: '2026-06-12T00:00:00.000Z',
      billing_period_end: '2026-07-12T00:00:00.000Z',
    });
  });

  it('sets PayOS annual period end one year after payment', async () => {
    const orderCode = 900004;
    const db = makeDb({
      billing_invoices: { data: [{ provider: 'payos', provider_invoice_id: String(orderCode), user_id: 'user-1', tier: 'pro', status: 'open', amount_vnd: 999000, metadata: { interval: 'annual' } }] },
    });
    const service = makeService(db);

    await service.handlePayosWebhook(payosSuccessPayload(orderCode, 999000, { transactionDateTime: '2026-06-12T00:00:00.000Z' }));

    expect(db.state.billing_subscriptions[0]).toMatchObject({
      billing_period_start: '2026-06-12T00:00:00.000Z',
      billing_period_end: '2027-06-12T00:00:00.000Z',
    });
  });

  it('successful PayOS webhook calls syncUserSubscriptionFromBilling', async () => {
    const orderCode = 900005;
    const service = makeService(makeDb({
      billing_invoices: { data: [{ provider: 'payos', provider_invoice_id: String(orderCode), user_id: 'user-1', tier: 'premium', status: 'open', amount_vnd: 59000, metadata: { interval: 'monthly' } }] },
    }));
    const syncSpy = jest.spyOn(service, 'syncUserSubscriptionFromBilling');

    await service.handlePayosWebhook(payosSuccessPayload(orderCode));

    expect(syncSpy).toHaveBeenCalledWith('user-1');
  });

  it('duplicate PayOS webhook does not duplicate invoice or subscription', async () => {
    const orderCode = 900006;
    const duplicateError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const db = makeDb({
      billing_invoices: { data: [{ provider: 'payos', provider_invoice_id: String(orderCode), user_id: 'user-1', tier: 'premium', status: 'open', amount_vnd: 59000, metadata: { interval: 'monthly' } }] },
    }, { error: duplicateError });
    const service = makeService(db);

    const result = await service.handlePayosWebhook(payosSuccessPayload(orderCode));

    expect(result).toMatchObject({ duplicate: true, processed: false, skipped_reason: 'duplicate' });
    expect(db.state.billing_invoices).toHaveLength(1);
    expect(db.state.billing_subscriptions ?? []).toHaveLength(0);
  });

  it('failed PayOS webhook does not grant entitlement', async () => {
    const orderCode = 900007;
    const db = makeDb({
      billing_invoices: { data: [{ provider: 'payos', provider_invoice_id: String(orderCode), user_id: 'user-1', tier: 'premium', status: 'open', amount_vnd: 59000, metadata: { interval: 'monthly' } }] },
    });
    const service = makeService(db);

    const result = await service.handlePayosWebhook({
      ...payosSuccessPayload(orderCode),
      code: '01',
      success: false,
    });

    expect(result).toMatchObject({ processed: false, skipped_reason: 'payos webhook is not a successful payment' });
    expect(db.state.billing_invoices[0]).toMatchObject({ status: 'open' });
    expect(db.state.billing_subscriptions ?? []).toHaveLength(0);
    expect(db.state.user_subscriptions ?? []).toHaveLength(0);
  });

  it('missing PayOS pending invoice is ignored safely', async () => {
    const service = makeService(makeDb());

    const result = await service.handlePayosWebhook(payosSuccessPayload(900008));

    expect(result).toMatchObject({ processed: false, skipped_reason: 'payos_invoice_not_found' });
  });

  it('PayOS amount mismatch is ignored and does not grant entitlement', async () => {
    const orderCode = 900009;
    const db = makeDb({
      billing_invoices: { data: [{ provider: 'payos', provider_invoice_id: String(orderCode), user_id: 'user-1', tier: 'premium', status: 'open', amount_vnd: 59000, metadata: { interval: 'monthly' } }] },
    });
    const service = makeService(db);

    const result = await service.handlePayosWebhook(payosSuccessPayload(orderCode, 129000));

    expect(result).toMatchObject({ processed: false, skipped_reason: 'payos webhook amount does not match invoice' });
    expect(db.state.billing_subscriptions ?? []).toHaveLength(0);
    expect(db.state.user_subscriptions ?? []).toHaveLength(0);
  });

  it('includes PayOS provider in confirmed revenue metrics', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [{ id: 'bs_payos', user_id: 'user-1', provider: 'payos', tier: 'premium', status: 'active', is_paid: true, cancelled_at: null }] },
      billing_invoices: { data: [{ provider: 'payos', status: 'paid', amount_vnd: 59000, paid_at: now.toISOString() }] },
    }));

    const result = await service.getConfirmedRevenueSummary(now);

    expect(result.active_paid_by_provider.payos).toBe(1);
    expect(result.month_to_date.gross_revenue_vnd).toBe(59000);
  });

  it('resolves Stripe webhook users from metadata.user_id and links billing_customers', async () => {
    const userId = '4da564f2-6795-4b52-96a1-f0103f11a111';
    const db = makeDb();
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value' });

    const result = await service.handleStripeWebhook({
      id: 'evt_metadata_user',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_metadata',
          customer: 'cus_metadata',
          amount_paid: 5900000,
          currency: 'vnd',
          metadata: { user_id: userId, tier: 'premium' },
        },
      },
    }, { 'x-webhook-secret': 'secret-value' });

    expect(result).toMatchObject({ processed: true });
    expect(db.state.billing_customers[0]).toMatchObject({
      provider: 'stripe',
      provider_customer_id: 'cus_metadata',
      user_id: userId,
      metadata: expect.objectContaining({ source: 'stripe_metadata', created_by: 'webhook' }),
    });
    expect(db.state.billing_invoices[0]).toMatchObject({ provider_invoice_id: 'in_metadata', user_id: userId });
  });

  it('does not guess Stripe users by email', async () => {
    const db = makeDb();
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value' });

    const result = await service.handleStripeWebhook({
      id: 'evt_email_only',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_email_only',
          customer: { id: 'cus_email_only', email: 'known@example.com' },
          customer_email: 'known@example.com',
          amount_paid: 5900000,
          currency: 'vnd',
        },
      },
    }, { 'x-webhook-secret': 'secret-value' });

    expect(result).toMatchObject({ processed: false, skipped_reason: 'stripe customer is not linked to a user' });
    expect(db.state.billing_customers ?? []).toHaveLength(0);
    expect(db.state.billing_invoices ?? []).toHaveLength(0);
  });

  it('returns pro paid entitlement when an active paid pro billing subscription exists', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [{ id: 'bs_pro', user_id: 'user-1', tier: 'pro', provider: 'stripe', status: 'active', is_paid: true, billing_period_end: '2999-01-01T00:00:00.000Z', cancelled_at: null }] },
    }));

    await expect(service.getUserEntitlement('user-1')).resolves.toMatchObject({
      user_id: 'user-1',
      tier: 'pro',
      source: 'paid',
      provider: 'stripe',
      active_until: '2999-01-01T00:00:00.000Z',
      billing_subscription_id: 'bs_pro',
    });
  });

  it('returns premium paid entitlement when an active paid premium billing subscription exists', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [{ id: 'bs_premium', user_id: 'user-1', tier: 'premium', provider: 'stripe', status: 'active', is_paid: true, billing_period_end: null, cancelled_at: null }] },
    }));

    await expect(service.getUserEntitlement('user-1')).resolves.toMatchObject({
      tier: 'premium',
      source: 'paid',
      provider: 'stripe',
      active_until: null,
    });
  });

  it('returns paid PayOS entitlement when an active PayOS subscription exists', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [{ id: 'bs_payos', user_id: 'user-1', tier: 'premium', provider: 'payos', status: 'active', is_paid: true, billing_period_end: '2999-01-01T00:00:00.000Z', cancelled_at: null }] },
    }));

    await expect(service.getUserEntitlement('user-1')).resolves.toMatchObject({
      user_id: 'user-1',
      tier: 'premium',
      source: 'paid',
      provider: 'payos',
      active_until: '2999-01-01T00:00:00.000Z',
      billing_subscription_id: 'bs_payos',
    });
  });

  it('chooses pro over premium when both paid billing subscriptions are active', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [
        { id: 'bs_premium', user_id: 'user-1', tier: 'premium', provider: 'stripe', status: 'active', is_paid: true, billing_period_end: null, cancelled_at: null },
        { id: 'bs_pro', user_id: 'user-1', tier: 'pro', provider: 'stripe', status: 'active', is_paid: true, billing_period_end: null, cancelled_at: null },
      ] },
    }));

    const result = await service.getUserEntitlement('user-1');

    expect(result).toMatchObject({ tier: 'pro', source: 'paid', billing_subscription_id: 'bs_pro' });
  });

  it('does not grant paid entitlement for expired billing subscriptions', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [{ id: 'bs_old', user_id: 'user-1', tier: 'pro', provider: 'stripe', status: 'active', is_paid: true, billing_period_end: '2000-01-01T00:00:00.000Z', cancelled_at: null }] },
    }));

    await expect(service.getUserEntitlement('user-1')).resolves.toMatchObject({ tier: 'free', source: 'free' });
  });

  it('does not grant paid entitlement for cancelled billing subscriptions', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [{ id: 'bs_cancelled', user_id: 'user-1', tier: 'pro', provider: 'stripe', status: 'active', is_paid: true, billing_period_end: null, cancelled_at: '2026-06-12T00:00:00.000Z' }] },
    }));

    await expect(service.getUserEntitlement('user-1')).resolves.toMatchObject({ tier: 'free', source: 'free' });
  });

  it('falls back to legacy trial entitlement when no active paid billing subscription exists', async () => {
    const service = makeService(makeDb({
      user_subscriptions: { data: [{ id: 'legacy_trial', user_id: 'user-1', tier: 'premium', is_active: true, payment_provider: 'trial', renews_at: '2999-01-01T00:00:00.000Z', cancelled_at: null }] },
    }));

    await expect(service.getUserEntitlement('user-1')).resolves.toMatchObject({
      tier: 'premium',
      source: 'trial',
      provider: 'trial',
      legacy_subscription_id: 'legacy_trial',
    });
  });

  it('falls back to legacy manual entitlement when no active paid billing subscription exists', async () => {
    const service = makeService(makeDb({
      user_subscriptions: { data: [{ id: 'legacy_manual', user_id: 'user-1', tier: 'pro', is_active: true, payment_provider: 'manual', renews_at: null, cancelled_at: null }] },
    }));

    await expect(service.getUserEntitlement('user-1')).resolves.toMatchObject({
      tier: 'pro',
      source: 'manual',
      provider: 'manual',
      legacy_subscription_id: 'legacy_manual',
    });
  });

  it('returns free entitlement when no subscriptions exist', async () => {
    const service = makeService(makeDb());

    await expect(service.getUserEntitlement('user-1')).resolves.toEqual({
      user_id: 'user-1',
      tier: 'free',
      source: 'free',
      active_until: null,
    });
  });

  it('returns no renewal reminder when no active paid PayOS subscription exists', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [
        { id: 'bs_stripe', user_id: 'user-1', tier: 'premium', provider: 'stripe', status: 'active', is_paid: true, billing_period_end: '2026-06-19T12:00:00.000Z', cancelled_at: null },
        { id: 'bs_manual', user_id: 'user-1', tier: 'premium', provider: 'manual', status: 'active', is_paid: true, billing_period_end: '2026-06-19T12:00:00.000Z', cancelled_at: null },
        { id: 'bs_free', user_id: 'user-1', tier: 'free', provider: 'payos', status: 'active', is_paid: false, billing_period_end: '2026-06-19T12:00:00.000Z', cancelled_at: null },
      ] },
    }));

    await expect(service.getPayosRenewalReminder('user-1', now)).resolves.toEqual({ has_reminder: false });
  });

  it('returns a 7_day renewal reminder for active PayOS subscriptions expiring in 7 days', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [{ id: 'bs_payos', user_id: 'user-1', tier: 'premium', provider: 'payos', status: 'active', is_paid: true, billing_period_end: '2026-06-19T12:00:00.000Z', cancelled_at: null }] },
    }));

    await expect(service.getPayosRenewalReminder('user-1', now)).resolves.toMatchObject({
      has_reminder: true,
      tier: 'premium',
      provider: 'payos',
      active_until: '2026-06-19T12:00:00.000Z',
      billing_period_end: '2026-06-19T12:00:00.000Z',
      days_remaining: 7,
      reminder_window: '7_day',
      message: 'Gói Premium của bạn còn 7 ngày. Gia hạn để tiếp tục sử dụng.',
    });
  });

  it('returns a 3_day renewal reminder for active PayOS subscriptions expiring in 3 days', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [{ id: 'bs_payos', user_id: 'user-1', tier: 'premium', provider: 'payos', status: 'active', is_paid: true, billing_period_end: '2026-06-15T12:00:00.000Z', cancelled_at: null }] },
    }));

    await expect(service.getPayosRenewalReminder('user-1', now)).resolves.toMatchObject({
      has_reminder: true,
      days_remaining: 3,
      reminder_window: '3_day',
      message: 'Gói Premium của bạn còn 3 ngày. Gia hạn để không bị gián đoạn.',
    });
  });

  it('returns a 1_day renewal reminder for active PayOS subscriptions expiring in 1 day', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [{ id: 'bs_payos', user_id: 'user-1', tier: 'premium', provider: 'payos', status: 'active', is_paid: true, billing_period_end: '2026-06-12T18:00:00.000Z', cancelled_at: null }] },
    }));

    await expect(service.getPayosRenewalReminder('user-1', now)).resolves.toMatchObject({
      has_reminder: true,
      days_remaining: 1,
      reminder_window: '1_day',
      message: 'Gói Premium của bạn còn 1 ngày. Hãy gia hạn hôm nay.',
    });
  });

  it('returns an expired renewal reminder for elapsed active PayOS subscriptions', async () => {
    const service = makeService(makeDb({
      billing_subscriptions: { data: [{ id: 'bs_payos', user_id: 'user-1', tier: 'premium', provider: 'payos', status: 'active', is_paid: true, billing_period_end: '2026-06-11T12:00:00.000Z', cancelled_at: null }] },
    }));

    await expect(service.getPayosRenewalReminder('user-1', now)).resolves.toMatchObject({
      has_reminder: true,
      days_remaining: 0,
      reminder_window: 'expired',
      message: 'Gói Premium của bạn đã hết hạn. Gia hạn để tiếp tục dùng tính năng Premium.',
    });
  });

  it('lets a user create a payment issue for their own invoice only', async () => {
    const invoiceId = '11111111-1111-4111-8111-111111111111';
    const db = makeDb({
      billing_invoices: { data: [{
        id: invoiceId,
        user_id: 'user-1',
        provider: 'payos',
        provider_invoice_id: '1781283708818137',
        raw_payload: { checksum: 'should-not-leak' },
      }] },
    });
    const service = makeService(db);

    const result = await service.createPaymentIssue({
      userId: 'user-1',
      issueType: 'payment_succeeded_but_not_activated',
      invoiceId,
      userMessage: 'I paid but my plan is still pending.',
    });

    expect(result).toMatchObject({
      user_id: 'user-1',
      invoice_id: invoiceId,
      provider: 'payos',
      issue_type: 'payment_succeeded_but_not_activated',
      status: 'open',
      user_message: 'I paid but my plan is still pending.',
    });
    expect(JSON.stringify(result)).not.toContain('admin_note');
    expect(JSON.stringify(result)).not.toContain('should-not-leak');
    expect(db.state.billing_payment_issues[0]).toMatchObject({
      user_id: 'user-1',
      invoice_id: invoiceId,
      created_by_user_id: 'user-1',
    });
  });

  it('rejects payment issues for another user invoice', async () => {
    const invoiceId = '22222222-2222-4222-8222-222222222222';
    const service = makeService(makeDb({
      billing_invoices: { data: [{ id: invoiceId, user_id: 'user-2', provider: 'payos' }] },
    }));

    await expect(service.createPaymentIssue({
      userId: 'user-1',
      issueType: 'refund_request',
      invoiceId,
    })).rejects.toMatchObject({ response: expect.objectContaining({ message: expect.stringContaining('Invoice does not belong') }) });
  });

  it('lists only current user payment issues without admin notes', async () => {
    const service = makeService(makeDb({
      billing_payment_issues: { data: [
        { id: 'case-1', user_id: 'user-1', provider: 'payos', issue_type: 'refund_request', status: 'open', admin_note: 'internal note', created_at: '2026-06-12T00:00:00.000Z' },
        { id: 'case-2', user_id: 'user-2', provider: 'payos', issue_type: 'wrong_plan', status: 'open', admin_note: 'other internal note', created_at: '2026-06-12T00:00:00.000Z' },
      ] },
    }));

    const result = await service.listPaymentIssuesForUser('user-1');

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]).toMatchObject({ id: 'case-1', user_id: 'user-1', issue_type: 'refund_request' });
    expect(JSON.stringify(result)).not.toContain('internal note');
  });

  it('rejects invalid payment issue type', async () => {
    const service = makeService(makeDb());

    await expect(service.createPaymentIssue({
      userId: 'user-1',
      issueType: 'invalid' as any,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('syncs paid billing entitlement into legacy user_subscriptions', async () => {
    const db = makeDb({
      billing_subscriptions: { data: [{ id: 'bs_1', user_id: 'user-1', tier: 'pro', provider: 'stripe', status: 'active', is_paid: true, billing_period_end: '2999-01-01T00:00:00.000Z', cancelled_at: null }] },
    });
    const service = makeService(db);

    const result = await service.syncUserSubscriptionFromBilling('user-1');

    expect(result).toMatchObject({ ok: true, synced: true, entitlement: { tier: 'pro', source: 'paid' } });
    expect(db.state.user_subscriptions[0]).toMatchObject({
      user_id: 'user-1',
      tier: 'pro',
      is_active: true,
      payment_provider: 'stripe',
      renews_at: '2999-01-01T00:00:00.000Z',
    });
  });

  it('skips legacy sync for trial, manual, and free entitlements', async () => {
    const trialDb = makeDb({
      user_subscriptions: { data: [{ id: 'legacy_trial', user_id: 'user-1', tier: 'premium', is_active: true, payment_provider: 'trial', renews_at: null, cancelled_at: null }] },
    });
    const trialService = makeService(trialDb);
    await expect(trialService.syncUserSubscriptionFromBilling('user-1')).resolves.toMatchObject({ synced: false, skipped_reason: expect.stringContaining('trial') });

    const manualDb = makeDb({
      user_subscriptions: { data: [{ id: 'legacy_manual', user_id: 'user-2', tier: 'premium', is_active: true, payment_provider: 'manual', renews_at: null, cancelled_at: null }] },
    });
    const manualService = makeService(manualDb);
    await expect(manualService.syncUserSubscriptionFromBilling('user-2')).resolves.toMatchObject({ synced: false, skipped_reason: expect.stringContaining('manual') });

    const freeService = makeService(makeDb());
    await expect(freeService.syncUserSubscriptionFromBilling('user-3')).resolves.toMatchObject({ synced: false, skipped_reason: expect.stringContaining('free') });
  });

  it('triggers entitlement sync from Stripe subscription webhooks without Stripe env', async () => {
    const db = makeDb({
      billing_customers: { data: [{ id: 'bc_1', provider: 'stripe', provider_customer_id: 'cus_1', user_id: 'user-1' }] },
    });
    const service = makeService(db, { STRIPE_WEBHOOK_SECRET: 'secret-value' });

    const result = await service.handleStripeWebhook({ id: 'evt_sub_sync', type: 'customer.subscription.updated', data: { object: { id: 'sub_sync', customer: 'cus_1', status: 'active', current_period_end: 32503680000, metadata: { tier: 'premium' } } } }, { 'x-webhook-secret': 'secret-value' });

    expect(result).toMatchObject({ processed: true, entitlement_sync: { attempted: true, synced: true } });
    expect(db.state.user_subscriptions[0]).toMatchObject({
      user_id: 'user-1',
      tier: 'premium',
      is_active: true,
      payment_provider: 'stripe',
    });
  });

  it('rejects production Stripe webhooks without Stripe-Signature', async () => {
    const service = makeService(makeDb(), {
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
    });
    jest.spyOn(service as any, 'getStripeClient').mockReturnValue({ webhooks: { constructEvent: jest.fn() } });

    await expect(service.handleStripeWebhook({ id: 'evt_1' }, {}, Buffer.from('{}')))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: 'Missing Stripe-Signature header.' }) });
  });

  it('rejects production Stripe webhooks without STRIPE_WEBHOOK_SECRET', async () => {
    const service = makeService(makeDb(), {
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: 'sk_test_123',
    });
    jest.spyOn(service as any, 'getStripeClient').mockReturnValue({ webhooks: { constructEvent: jest.fn() } });

    await expect(service.handleStripeWebhook({ id: 'evt_1' }, { 'stripe-signature': 'sig' }, Buffer.from('{}')))
      .rejects.toMatchObject({ response: 'Stripe webhook secret is not configured.' });
  });

  it('rejects invalid production Stripe signatures safely', async () => {
    const service = makeService(makeDb(), {
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
    });
    jest.spyOn(service as any, 'getStripeClient').mockReturnValue({
      webhooks: { constructEvent: jest.fn(() => { throw new Error('leaked secret whsec_123'); }) },
    });

    await expect(service.handleStripeWebhook({ id: 'evt_1' }, { 'stripe-signature': 'bad' }, Buffer.from('{}')))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: 'Invalid Stripe webhook signature.' }) });
  });

  it('passes verified production Stripe events into the billing event handler', async () => {
    const db = makeDb();
    const service = makeService(db, {
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
    });
    jest.spyOn(service as any, 'getStripeClient').mockReturnValue({
      webhooks: { constructEvent: jest.fn().mockReturnValue({ id: 'evt_verified', type: 'customer.created' }) },
    });

    const result = await service.handleStripeWebhook({}, { 'stripe-signature': 'valid' }, Buffer.from('{}'));

    expect(result).toMatchObject({ event_id: 'evt_verified', event_type: 'customer.created', skipped_reason: 'unknown_event_type' });
    expect(db.state.billing_events[0]).toMatchObject({ provider_event_id: 'evt_verified', event_type: 'customer.created' });
  });

  it('keeps non-production placeholder webhook verification working', async () => {
    const service = makeService(makeDb(), { STRIPE_WEBHOOK_SECRET: 'secret-value' });

    await expect(service.handleStripeWebhook({ id: 'evt_dev', type: 'customer.created' }, { 'x-webhook-secret': 'secret-value' }))
      .resolves.toMatchObject({ event_id: 'evt_dev', skipped_reason: 'unknown_event_type' });
  });
});
