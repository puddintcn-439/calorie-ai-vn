import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BillingController } from '../billing.controller';
import { BillingService } from '../billing.service';

describe('BillingController', () => {
  let app: INestApplication;
  const billingService = {
    createStripeCheckoutSession: jest.fn(),
    createPayosCheckout: jest.fn(),
    handleStripeWebhook: jest.fn(),
    handlePayosWebhook: jest.fn(),
    handleAppStoreWebhook: jest.fn(),
    handleGooglePlayWebhook: jest.fn(),
    getUserEntitlement: jest.fn(),
    getPayosRenewalReminder: jest.fn(),
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
      .compile();

    const unauthenticatedApp = moduleRef.createNestApplication();
    await unauthenticatedApp.init();

    await request(unauthenticatedApp.getHttpServer())
      .get('/billing/renewal-reminder')
      .expect(403);

    await unauthenticatedApp.close();
  });
});
