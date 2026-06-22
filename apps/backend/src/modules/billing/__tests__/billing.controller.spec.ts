import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BillingController } from '../billing.controller';
import { BillingService } from '../billing.service';

describe('BillingController', () => {
  let app: INestApplication;
  const billingService = {
    createStripeCheckoutSession: jest.fn(),
    createPayosCheckout: jest.fn(),
    reconcilePayosCheckout: jest.fn(),
    handleStripeWebhook: jest.fn(),
    handlePayosWebhook: jest.fn(),
    handleAppStoreWebhook: jest.fn(),
    handleGooglePlayWebhook: jest.fn(),
    getUserEntitlement: jest.fn(),
    getPayosRenewalReminder: jest.fn(),
    createPaymentIssue: jest.fn(),
    listPaymentIssuesForUser: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [{ provide: BillingService, useValue: billingService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'user-1', sub: 'user-1', email: 'user@example.com' };
          return true;
        },
      })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /billing/checkout/stripe rejects invalid tier', async () => {
    await request(app.getHttpServer())
      .post('/billing/checkout/stripe')
      .send({ tier: 'gold', interval: 'monthly' })
      .expect(400);

    expect(billingService.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it('POST /billing/checkout/stripe rejects invalid interval', async () => {
    await request(app.getHttpServer())
      .post('/billing/checkout/stripe')
      .send({ tier: 'premium', interval: 'weekly' })
      .expect(400);

    expect(billingService.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it('POST /billing/checkout/stripe passes authenticated user to the service', async () => {
    billingService.createStripeCheckoutSession.mockResolvedValue({
      ok: true,
      provider: 'stripe',
      checkout_url: 'http://localhost:3000/mock-checkout?provider=stripe&tier=premium',
      customer_id: 'test_cus_user-1',
      tier: 'premium',
      interval: 'monthly',
    });

    await request(app.getHttpServer())
      .post('/billing/checkout/stripe')
      .send({ tier: 'premium', interval: 'monthly' })
      .expect(201);

    expect(billingService.createStripeCheckoutSession).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      tier: 'premium',
      interval: 'monthly',
    });
  });

  it('POST /billing/checkout/payos rejects invalid tier', async () => {
    await request(app.getHttpServer())
      .post('/billing/checkout/payos')
      .send({ tier: 'gold', interval: 'monthly' })
      .expect(400);

    expect(billingService.createPayosCheckout).not.toHaveBeenCalled();
  });

  it('POST /billing/checkout/payos rejects invalid interval', async () => {
    await request(app.getHttpServer())
      .post('/billing/checkout/payos')
      .send({ tier: 'premium', interval: 'weekly' })
      .expect(400);

    expect(billingService.createPayosCheckout).not.toHaveBeenCalled();
  });

  it('POST /billing/checkout/payos passes authenticated user to the service', async () => {
    billingService.createPayosCheckout.mockResolvedValue({
      ok: true,
      provider: 'payos',
      checkout_url: 'http://localhost:3000/mock-payos-checkout?provider=payos&tier=premium',
      order_code: 123456,
      tier: 'premium',
      interval: 'monthly',
      amount_vnd: 59000,
    });

    await request(app.getHttpServer())
      .post('/billing/checkout/payos')
      .send({ tier: 'premium', interval: 'monthly' })
      .expect(201);

    expect(billingService.createPayosCheckout).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      tier: 'premium',
      interval: 'monthly',
      returnUrl: undefined,
      cancelUrl: undefined,
      requestOrigin: undefined,
    });
  });

  it('POST /billing/checkout/payos forwards the current app return URLs', async () => {
    billingService.createPayosCheckout.mockResolvedValue({
      ok: true,
      provider: 'payos',
      checkout_url: 'https://pay.payos.vn/web/payment-link',
      order_code: 123456,
      tier: 'pro',
      interval: 'monthly',
      amount_vnd: 129000,
    });

    await request(app.getHttpServer())
      .post('/billing/checkout/payos')
      .set('Origin', 'http://localhost:19006')
      .send({
        tier: 'pro',
        interval: 'monthly',
        return_url: 'http://localhost:19006/paywall?returnTo=%2Fprofile',
        cancel_url: 'http://localhost:19006/paywall?returnTo=%2Fprofile&cancel=true',
      })
      .expect(201);

    expect(billingService.createPayosCheckout).toHaveBeenCalledWith(expect.objectContaining({
      returnUrl: 'http://localhost:19006/paywall?returnTo=%2Fprofile',
      cancelUrl: 'http://localhost:19006/paywall?returnTo=%2Fprofile&cancel=true',
      requestOrigin: 'http://localhost:19006',
    }));
  });

  it('POST /billing/payos/reconcile passes the authenticated user and order code', async () => {
    billingService.reconcilePayosCheckout.mockResolvedValue({
      ok: true,
      provider: 'payos',
      order_code: 123456,
      status: 'PAID',
      processed: true,
    });

    await request(app.getHttpServer())
      .post('/billing/payos/reconcile')
      .send({ order_code: 123456 })
      .expect(201);

    expect(billingService.reconcilePayosCheckout).toHaveBeenCalledWith({
      userId: 'user-1',
      orderCode: 123456,
    });
  });

  it('GET /billing/entitlement returns a safe response shape', async () => {
    billingService.getUserEntitlement.mockResolvedValue({
      user_id: 'user-1',
      tier: 'pro',
      source: 'paid',
      provider: 'stripe',
      active_until: '2999-01-01T00:00:00.000Z',
      billing_subscription_id: 'internal-subscription-id',
    });

    const res = await request(app.getHttpServer())
      .get('/billing/entitlement')
      .expect(200);

    expect(res.body).toEqual({
      user_id: 'user-1',
      tier: 'pro',
      source: 'paid',
      provider: 'stripe',
      active_until: '2999-01-01T00:00:00.000Z',
    });
    expect(res.body.billing_subscription_id).toBeUndefined();
    expect(billingService.getUserEntitlement).toHaveBeenCalledWith('user-1');
  });

  it('GET /billing/renewal-reminder returns the current user PayOS reminder', async () => {
    billingService.getPayosRenewalReminder.mockResolvedValue({
      has_reminder: true,
      tier: 'premium',
      provider: 'payos',
      active_until: '2026-06-19T12:00:00.000Z',
      billing_period_end: '2026-06-19T12:00:00.000Z',
      days_remaining: 7,
      reminder_window: '7_day',
      message: 'Gói Premium của bạn còn 7 ngày. Gia hạn để tiếp tục sử dụng.',
    });

    const res = await request(app.getHttpServer())
      .get('/billing/renewal-reminder')
      .expect(200);

    expect(res.body).toEqual({
      has_reminder: true,
      tier: 'premium',
      provider: 'payos',
      active_until: '2026-06-19T12:00:00.000Z',
      billing_period_end: '2026-06-19T12:00:00.000Z',
      days_remaining: 7,
      reminder_window: '7_day',
      message: 'Gói Premium của bạn còn 7 ngày. Gia hạn để tiếp tục sử dụng.',
    });
    expect(billingService.getPayosRenewalReminder).toHaveBeenCalledWith('user-1');
  });

  it('GET /billing/renewal-reminder requires auth', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [{ provide: BillingService, useValue: billingService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => false })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const unauthenticatedApp = moduleRef.createNestApplication();
    await unauthenticatedApp.init();

    await request(unauthenticatedApp.getHttpServer())
      .get('/billing/renewal-reminder')
      .expect(403);

    await unauthenticatedApp.close();
  });

  it('POST /billing/payment-issues validates issue type', async () => {
    await request(app.getHttpServer())
      .post('/billing/payment-issues')
      .send({ issue_type: 'not_supported' })
      .expect(400);

    expect(billingService.createPaymentIssue).not.toHaveBeenCalled();
  });

  it('POST /billing/payment-issues creates a current-user support case', async () => {
    billingService.createPaymentIssue.mockResolvedValue({
      id: 'case-1',
      user_id: 'user-1',
      provider: 'payos',
      issue_type: 'refund_request',
      status: 'open',
      user_message: 'Please review this payment.',
    });

    await request(app.getHttpServer())
      .post('/billing/payment-issues')
      .send({ issue_type: 'refund_request', user_message: 'Please review this payment.' })
      .expect(201);

    expect(billingService.createPaymentIssue).toHaveBeenCalledWith({
      userId: 'user-1',
      issueType: 'refund_request',
      invoiceId: null,
      userMessage: 'Please review this payment.',
    });
  });

  it('GET /billing/payment-issues lists only current-user cases', async () => {
    billingService.listPaymentIssuesForUser.mockResolvedValue({
      cases: [{ id: 'case-1', user_id: 'user-1', provider: 'payos', issue_type: 'wrong_plan', status: 'open' }],
    });

    await request(app.getHttpServer())
      .get('/billing/payment-issues')
      .expect(200);

    expect(billingService.listPaymentIssuesForUser).toHaveBeenCalledWith('user-1');
  });

  it('GET /billing/return/payos is UX-only and does not mark invoices paid', async () => {
    const res = await request(app.getHttpServer())
      .get('/billing/return/payos?status=PAID&orderCode=123456')
      .expect(302);

    expect(res.headers.location).toBe('http://localhost:19006/paywall?status=PAID&orderCode=123456');
    expect(billingService.handlePayosWebhook).not.toHaveBeenCalled();
    expect(billingService.getUserEntitlement).not.toHaveBeenCalled();
  });

  it('GET /billing/cancel/payos is UX-only and does not mark invoices paid', async () => {
    const res = await request(app.getHttpServer())
      .get('/billing/cancel/payos?cancel=true')
      .expect(302);

    expect(res.headers.location).toBe('http://localhost:19006/paywall?cancel=true');
    expect(billingService.handlePayosWebhook).not.toHaveBeenCalled();
    expect(billingService.getUserEntitlement).not.toHaveBeenCalled();
  });

  it('preserves the configured profile return target when appending PayOS query values', async () => {
    const previous = process.env.PAYOS_WEB_RETURN_URL;
    process.env.PAYOS_WEB_RETURN_URL = 'http://localhost:19006/paywall?returnTo=%2Fprofile';
    try {
      const res = await request(app.getHttpServer())
        .get('/billing/return/payos?status=PAID&orderCode=123456')
        .expect(302);

      expect(res.headers.location).toBe(
        'http://localhost:19006/paywall?returnTo=%2Fprofile&status=PAID&orderCode=123456',
      );
    } finally {
      if (previous === undefined) delete process.env.PAYOS_WEB_RETURN_URL;
      else process.env.PAYOS_WEB_RETURN_URL = previous;
    }
  });
});
