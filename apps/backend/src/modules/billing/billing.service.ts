import { BadRequestException, HttpException, HttpStatus, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';
import { createHash } from 'crypto';
import Stripe from 'stripe';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';

const DEFAULT_USD_TO_VND = 26000;

type BillingInvoiceRow = {
  id?: string;
  user_id?: string | null;
  provider?: string | null;
  tier?: string | null;
  status?: string | null;
  amount_vnd?: number | string | null;
  amount_usd?: number | string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
};

type BillingRefundRow = {
  id?: string;
  user_id?: string | null;
  provider?: string | null;
  amount_vnd?: number | string | null;
  amount_usd?: number | string | null;
  refunded_at?: string | null;
};

type BillingSubscriptionRow = {
  id?: string;
  user_id?: string | null;
  provider?: string | null;
  tier?: string | null;
  status?: string | null;
  is_paid?: boolean | null;
  billing_period_end?: string | null;
  cancelled_at?: string | null;
};

type BillingProvider = 'stripe' | 'app_store' | 'google_play' | 'payos';
type BillingEntitlementProvider = BillingProvider | 'manual' | 'trial';
type BillingEntitlementTier = 'free' | 'premium' | 'pro';
type BillingEntitlementSource = 'paid' | 'trial' | 'manual' | 'free';
type BillingPaymentIssueType =
  | 'refund_request'
  | 'duplicate_payment'
  | 'payment_succeeded_but_not_activated'
  | 'wrong_plan'
  | 'other';
type BillingPaymentIssueStatus = 'open' | 'in_review' | 'resolved' | 'rejected';

type BillingEventInput = {
  provider: BillingProvider;
  providerEventId: string;
  eventType: string;
  rawPayload: Record<string, any>;
};

type StripeMappingResult = {
  processed: boolean;
  skipped_reason?: string;
  billing_invoice_id?: string | null;
  billing_subscription_id?: string | null;
  billing_refund_id?: string | null;
  entitlement_sync?: {
    attempted: boolean;
    synced?: boolean;
    skipped_reason?: string;
    error?: string;
  };
};

type StripeCheckoutTier = 'premium' | 'pro';
type StripeCheckoutInterval = 'monthly' | 'annual';
type PayosCheckoutTier = 'premium' | 'pro';
type PayosCheckoutInterval = 'monthly' | 'annual';
type UserEntitlement = {
  user_id: string;
  tier: BillingEntitlementTier;
  source: BillingEntitlementSource;
  provider?: BillingEntitlementProvider;
  active_until?: string | null;
  billing_subscription_id?: string | null;
  legacy_subscription_id?: string | null;
};

type PayosRenewalReminderWindow = '7_day' | '3_day' | '1_day' | 'expired';

type PayosRenewalReminder =
  | { has_reminder: false }
  | {
    has_reminder: true;
    tier: Extract<BillingEntitlementTier, 'premium' | 'pro'>;
    provider: 'payos';
    active_until: string;
    billing_period_end: string;
    days_remaining: number;
    reminder_window: PayosRenewalReminderWindow;
    message: string;
  };

const BILLING_PAYMENT_ISSUE_TYPES: BillingPaymentIssueType[] = [
  'refund_request',
  'duplicate_payment',
  'payment_succeeded_but_not_activated',
  'wrong_plan',
  'other',
];

@Injectable()
export class BillingService {
  private stripeClient: Stripe.Stripe | null | undefined;
  private payosClient: PayOS | null | undefined;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  async getConfirmedRevenueSummary(now = new Date()) {
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const usdToVnd = this.usdToVndRate();

    const [activePaidSubscriptions, paidInvoicesMtd, refundsMtd] = await Promise.all([
      this.fetchActivePaidSubscriptions(),
      this.fetchPaidInvoices(monthStart.toISOString()),
      this.fetchRefunds(monthStart.toISOString()),
    ]);

    const grossRevenueVnd = paidInvoicesMtd.reduce((sum, row) => sum + this.amountVnd(row, usdToVnd), 0);
    const grossRevenueUsd = paidInvoicesMtd.reduce((sum, row) => sum + this.amountUsd(row, usdToVnd), 0);
    const refundRevenueVnd = refundsMtd.reduce((sum, row) => sum + this.amountVnd(row, usdToVnd), 0);
    const refundRevenueUsd = refundsMtd.reduce((sum, row) => sum + this.amountUsd(row, usdToVnd), 0);
    const netRevenueVnd = grossRevenueVnd - refundRevenueVnd;
    const netRevenueUsd = grossRevenueUsd - refundRevenueUsd;

    return {
      generated_at: now.toISOString(),
      source: 'billing_ledger',
      default_currency: 'VND',
      display_currencies: ['VND', 'USD'],
      usd_to_vnd_rate: usdToVnd,
      active_paid_users: this.countUnique(activePaidSubscriptions.map((row) => row.user_id)),
      active_paid_subscriptions: activePaidSubscriptions.length,
      active_paid_by_tier: this.countBy(activePaidSubscriptions, 'tier'),
      active_paid_by_provider: this.countBy(activePaidSubscriptions, 'provider'),
      month_to_date: {
        gross_revenue_vnd: this.roundVnd(grossRevenueVnd),
        gross_revenue_usd: this.roundUsd(grossRevenueUsd),
        refunds_vnd: this.roundVnd(refundRevenueVnd),
        refunds_usd: this.roundUsd(refundRevenueUsd),
        net_revenue_vnd: this.roundVnd(netRevenueVnd),
        net_revenue_usd: this.roundUsd(netRevenueUsd),
        paid_invoice_count: paidInvoicesMtd.length,
        refund_count: refundsMtd.length,
      },
    };
  }

  async getOrCreateStripeCustomerForUser(input: {
    userId: string;
    email?: string | null;
  }): Promise<{
    user_id: string;
    provider: 'stripe';
    provider_customer_id: string;
    created: boolean;
  }> {
    const userId = String(input.userId ?? '').trim();
    if (!userId) {
      throw new HttpException('User id is required for Stripe customer linking.', HttpStatus.BAD_REQUEST);
    }

    const { data: existing, error: lookupError } = await this.supabase.db
      .from('billing_customers')
      .select('user_id, provider, provider_customer_id')
      .eq('provider', 'stripe')
      .eq('user_id', userId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing?.provider_customer_id) {
      return {
        user_id: String(existing.user_id ?? userId),
        provider: 'stripe',
        provider_customer_id: String(existing.provider_customer_id),
        created: false,
      };
    }

    const customer = await this.createStripeCustomerPlaceholderOrFail(userId, input.email ?? null);
    const email = input.email ?? null;
    const { data, error } = await this.supabase.db
      .from('billing_customers')
      .upsert({
        user_id: userId,
        provider: 'stripe',
        provider_customer_id: customer.providerCustomerId,
        email,
        metadata: {
          source: customer.source,
          created_by: 'checkout',
          ...(customer.metadata ?? {}),
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,provider_customer_id' })
      .select('user_id, provider, provider_customer_id')
      .maybeSingle();
    if (error) throw error;

    return {
      user_id: String(data?.user_id ?? userId),
      provider: 'stripe',
      provider_customer_id: String(data?.provider_customer_id ?? customer.providerCustomerId),
      created: true,
    };
  }

  async createStripeCheckoutSession(input: {
    userId: string;
    email?: string | null;
    tier: StripeCheckoutTier;
    interval: StripeCheckoutInterval;
  }) {
    if (!['premium', 'pro'].includes(input.tier)) {
      throw new HttpException('Invalid Stripe checkout tier.', HttpStatus.BAD_REQUEST);
    }
    if (!['monthly', 'annual'].includes(input.interval)) {
      throw new HttpException('Invalid Stripe checkout interval.', HttpStatus.BAD_REQUEST);
    }

    const stripe = this.getStripeClient();
    const customer = await this.getOrCreateStripeCustomerForUser({ userId: input.userId, email: input.email });
    const priceId = this.stripePriceId(input.tier, input.interval, Boolean(stripe));
    const checkoutUrl = await this.createStripeCheckoutUrlOrMock({
      stripe,
      customerId: customer.provider_customer_id,
      priceId,
      userId: input.userId,
      tier: input.tier,
      interval: input.interval,
    });

    return {
      ok: true,
      provider: 'stripe',
      checkout_url: checkoutUrl,
      customer_id: customer.provider_customer_id,
      tier: input.tier,
      interval: input.interval,
    };
  }

  async getOrCreatePayosCustomerForUser(input: {
    userId: string;
    email?: string | null;
  }): Promise<{
    user_id: string;
    provider: 'payos';
    provider_customer_id: string;
    created: boolean;
  }> {
    const userId = String(input.userId ?? '').trim();
    if (!userId) {
      throw new HttpException('User id is required for PayOS customer linking.', HttpStatus.BAD_REQUEST);
    }

    const providerCustomerId = `payos_user_${userId}`;
    const { data, error } = await this.supabase.db
      .from('billing_customers')
      .upsert({
        user_id: userId,
        provider: 'payos',
        provider_customer_id: providerCustomerId,
        email: input.email ?? null,
        metadata: {
          source: 'payos_checkout',
          created_by: 'checkout',
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,provider_customer_id' })
      .select('user_id, provider, provider_customer_id')
      .maybeSingle();
    if (error) throw error;

    return {
      user_id: String(data?.user_id ?? userId),
      provider: 'payos',
      provider_customer_id: String(data?.provider_customer_id ?? providerCustomerId),
      created: true,
    };
  }

  async createPayosCheckout(input: {
    userId: string;
    email?: string | null;
    tier: PayosCheckoutTier;
    interval: PayosCheckoutInterval;
  }) {
    if (!['premium', 'pro'].includes(input.tier)) {
      throw new HttpException('Invalid PayOS checkout tier.', HttpStatus.BAD_REQUEST);
    }
    if (!['monthly', 'annual'].includes(input.interval)) {
      throw new HttpException('Invalid PayOS checkout interval.', HttpStatus.BAD_REQUEST);
    }

    const payos = this.getPayosClient();
    if (!payos && this.isProduction()) {
      throw new HttpException('PayOS is not configured.', HttpStatus.NOT_IMPLEMENTED);
    }

    const customer = await this.getOrCreatePayosCustomerForUser({ userId: input.userId, email: input.email });
    const amount = this.payosAmountVnd(input.tier, input.interval);
    const orderCode = this.createPayosOrderCode();
    const usdToVnd = this.usdToVndRate();
    const now = new Date().toISOString();

    const { error: invoiceError } = await this.supabase.db
      .from('billing_invoices')
      .upsert({
        user_id: input.userId,
        provider: 'payos',
        provider_invoice_id: String(orderCode),
        tier: input.tier,
        status: 'open',
        amount_original: amount,
        currency_original: 'VND',
        amount_vnd: amount,
        amount_usd: this.roundUsd(amount / usdToVnd),
        fx_rate: usdToVnd,
        metadata: {
          interval: input.interval,
          source: 'payos_checkout_created',
          provider_customer_id: customer.provider_customer_id,
        },
        raw_payload: {
          orderCode,
          tier: input.tier,
          interval: input.interval,
          source: 'payos_checkout_created',
        },
        updated_at: now,
      }, { onConflict: 'provider,provider_invoice_id' });
    if (invoiceError) throw invoiceError;

    const paymentData = {
      orderCode,
      amount,
      description: input.tier === 'pro' ? 'CAI PRO' : 'CAI PREMIUM',
      items: [{
        name: `Calorie AI ${this.titleCase(input.tier)} ${this.titleCase(input.interval)}`,
        quantity: 1,
        price: amount,
      }],
      cancelUrl: this.payosUrl('PAYOS_CANCEL_URL', Boolean(payos)),
      returnUrl: this.payosUrl('PAYOS_RETURN_URL', Boolean(payos)),
    };

    const checkoutUrl = payos
      ? this.payosCheckoutUrl(await payos.paymentRequests.create(paymentData))
      : this.createPayosMockCheckoutUrl(input.tier, input.interval, orderCode);

    return {
      ok: true,
      provider: 'payos',
      checkout_url: checkoutUrl,
      order_code: orderCode,
      tier: input.tier,
      interval: input.interval,
      amount_vnd: amount,
    };
  }

  async getUserEntitlement(userId: string): Promise<UserEntitlement> {
    const normalizedUserId = String(userId ?? '').trim();
    if (!normalizedUserId) {
      throw new HttpException('User id is required for billing entitlement.', HttpStatus.BAD_REQUEST);
    }

    const now = new Date();
    const [billingRows, legacyRows] = await Promise.all([
      this.fetchBillingSubscriptionsForEntitlement(normalizedUserId),
      this.fetchLegacySubscriptionsForEntitlement(normalizedUserId),
    ]);

    const activePaidRows = billingRows
      .filter((row) => this.isActivePaidBillingSubscription(row, now))
      .sort((a, b) => this.tierPriority(b.tier) - this.tierPriority(a.tier));

    const paid = activePaidRows[0];
    if (paid) {
      return {
        user_id: normalizedUserId,
        tier: this.normalizeTier(paid.tier),
        source: 'paid',
        provider: this.normalizeEntitlementProvider(paid.provider),
        active_until: paid.billing_period_end ?? null,
        billing_subscription_id: paid.id ?? null,
      };
    }

    const legacy = legacyRows
      .filter((row) => this.isActiveLegacySubscription(row, now))
      .sort((a, b) => this.tierPriority(b.tier) - this.tierPriority(a.tier))[0];

    if (legacy) {
      const source = this.legacyEntitlementSource(legacy.payment_provider);
      if (source) {
        return {
          user_id: normalizedUserId,
          tier: this.normalizeTier(legacy.tier),
          source,
          provider: source,
          active_until: legacy.renews_at ?? null,
          legacy_subscription_id: legacy.id ?? null,
        };
      }
    }

    return {
      user_id: normalizedUserId,
      tier: 'free',
      source: 'free',
      active_until: null,
    };
  }

  async getPayosRenewalReminder(userId: string, now = new Date()): Promise<PayosRenewalReminder> {
    const normalizedUserId = String(userId ?? '').trim();
    if (!normalizedUserId) {
      throw new HttpException('User id is required for PayOS renewal reminders.', HttpStatus.BAD_REQUEST);
    }

    const rows = await this.fetchPayosSubscriptionsForRenewalReminder(normalizedUserId);
    const subscription = rows
      .map((row) => {
        const tier = this.normalizeTier(row.tier);
        const periodEnd = row.billing_period_end ? new Date(String(row.billing_period_end)) : null;
        if (!['premium', 'pro'].includes(tier) || !periodEnd || Number.isNaN(periodEnd.getTime())) return null;
        return { row, tier: tier as Extract<BillingEntitlementTier, 'premium' | 'pro'>, periodEnd };
      })
      .filter((entry): entry is { row: Record<string, any>; tier: Extract<BillingEntitlementTier, 'premium' | 'pro'>; periodEnd: Date } => entry !== null)
      .sort((a, b) => {
        const tierDelta = this.tierPriority(b.tier) - this.tierPriority(a.tier);
        if (tierDelta !== 0) return tierDelta;
        return b.periodEnd.getTime() - a.periodEnd.getTime();
      })[0];

    if (!subscription) return { has_reminder: false };

    const daysRemaining = this.daysUntil(subscription.periodEnd, now);
    const reminderWindow = this.payosRenewalReminderWindow(daysRemaining);
    if (!reminderWindow) return { has_reminder: false };

    const activeUntil = subscription.periodEnd.toISOString();
    return {
      has_reminder: true,
      tier: subscription.tier,
      provider: 'payos',
      active_until: activeUntil,
      billing_period_end: activeUntil,
      days_remaining: daysRemaining,
      reminder_window: reminderWindow,
      message: this.payosRenewalReminderMessage(subscription.tier, reminderWindow),
    };
  }

  async createPaymentIssue(input: {
    userId: string;
    issueType: BillingPaymentIssueType;
    invoiceId?: string | null;
    userMessage?: string | null;
  }) {
    const userId = String(input.userId ?? '').trim();
    if (!userId) {
      throw new HttpException('User id is required for payment issues.', HttpStatus.BAD_REQUEST);
    }
    const issueType = this.requirePaymentIssueType(input.issueType);
    const invoiceId = String(input.invoiceId ?? '').trim() || null;
    const invoice = invoiceId ? await this.requireUserInvoice(userId, invoiceId) : null;
    const now = new Date().toISOString();

    const { data, error } = await this.supabase.db
      .from('billing_payment_issues')
      .insert({
        user_id: userId,
        invoice_id: invoice?.id ?? null,
        subscription_id: null,
        provider: invoice?.provider ?? 'payos',
        issue_type: issueType,
        status: 'open',
        user_message: this.cleanNullableText(input.userMessage, 1000),
        created_by_user_id: userId,
        updated_at: now,
      })
      .select('id, user_id, invoice_id, subscription_id, provider, issue_type, status, user_message, resolution, created_at, updated_at, resolved_at')
      .maybeSingle();
    if (error) throw error;

    if (data && this.notificationsService) {
      await this.notificationsService.notifyPaymentIssueCreated(data);
    }

    return this.safeUserPaymentIssue(data);
  }

  async listPaymentIssuesForUser(userId: string) {
    const normalizedUserId = String(userId ?? '').trim();
    if (!normalizedUserId) {
      throw new HttpException('User id is required for payment issues.', HttpStatus.BAD_REQUEST);
    }

    const { data, error } = await this.supabase.db
      .from('billing_payment_issues')
      .select('id, user_id, invoice_id, subscription_id, provider, issue_type, status, user_message, resolution, created_at, updated_at, resolved_at')
      .eq('user_id', normalizedUserId)
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) throw error;

    return {
      cases: (Array.isArray(data) ? data : []).map((row) => this.safeUserPaymentIssue(row)),
    };
  }

  async syncUserSubscriptionFromBilling(userId: string): Promise<{
    ok: boolean;
    user_id: string;
    entitlement: Awaited<ReturnType<BillingService['getUserEntitlement']>>;
    synced: boolean;
    skipped_reason?: string;
  }> {
    const entitlement = await this.getUserEntitlement(userId);
    if (entitlement.source !== 'paid') {
      return {
        ok: true,
        user_id: entitlement.user_id,
        entitlement,
        synced: false,
        skipped_reason: `entitlement source is ${entitlement.source}; legacy subscription was not overwritten`,
      };
    }

    const { error } = await this.supabase.db
      .from('user_subscriptions')
      .upsert({
        user_id: entitlement.user_id,
        tier: entitlement.tier,
        is_active: true,
        payment_provider: entitlement.provider ?? 'stripe',
        renews_at: entitlement.active_until ?? null,
        cancelled_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      return {
        ok: false,
        user_id: entitlement.user_id,
        entitlement,
        synced: false,
        skipped_reason: this.safeErrorMessage(error),
      };
    }

    const { error: userUpdateError } = await this.supabase.db
      .from('users')
      .update({ subscription_tier: entitlement.tier, updated_at: new Date().toISOString() })
      .eq('id', entitlement.user_id);

    if (userUpdateError) {
      return {
        ok: false,
        user_id: entitlement.user_id,
        entitlement,
        synced: false,
        skipped_reason: this.safeErrorMessage(userUpdateError),
      };
    }

    return {
      ok: true,
      user_id: entitlement.user_id,
      entitlement,
      synced: true,
    };
  }

  async handleStripeWebhook(payload: any, headers: Record<string, string | string[] | undefined> = {}, rawBody?: Buffer | string) {
    const verifiedPayload = this.verifyStripeWebhookPayload(payload, headers, rawBody);
    const eventId = this.providerEventId(verifiedPayload, ['id']);
    const eventType = String(verifiedPayload?.type ?? verifiedPayload?.eventType ?? 'unknown');
    const event = await this.recordBillingEvent({
      provider: 'stripe',
      providerEventId: eventId,
      eventType,
      rawPayload: this.safePayload(verifiedPayload),
    });

    if (event.duplicate) {
      return { ok: true, provider: 'stripe', event_id: eventId, event_type: eventType, duplicate: true, processed: false, skipped_reason: 'duplicate' };
    }

    let result: StripeMappingResult;
    if (['invoice.paid', 'invoice.payment_succeeded'].includes(eventType)) {
      result = await this.upsertBillingInvoiceFromStripe(verifiedPayload);
    } else if (eventType === 'invoice.payment_failed') {
      result = { processed: false, skipped_reason: 'stripe invoice payment failed; no paid invoice recorded' };
    } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(eventType)) {
      result = await this.upsertBillingSubscriptionFromStripe(verifiedPayload);
    } else if (['charge.refunded', 'refund.created'].includes(eventType)) {
      result = await this.insertBillingRefundFromStripe(verifiedPayload);
    } else {
      return { ok: true, provider: 'stripe', event_id: eventId, event_type: eventType, duplicate: false, processed: false, skipped_reason: 'unknown_event_type' };
    }

    await this.updateBillingEventStatus('stripe', eventId, {
      status: result.processed ? 'processed' : 'ignored',
      processed_at: result.processed ? new Date().toISOString() : null,
      error_message: result.skipped_reason ?? null,
      billing_invoice_id: result.billing_invoice_id ?? null,
      billing_subscription_id: result.billing_subscription_id ?? null,
      billing_refund_id: result.billing_refund_id ?? null,
    });

    return {
      ok: true,
      provider: 'stripe',
      event_id: eventId,
      event_type: eventType,
      duplicate: false,
      processed: result.processed,
      ...(result.skipped_reason ? { skipped_reason: result.skipped_reason } : {}),
      ...(result.entitlement_sync ? { entitlement_sync: result.entitlement_sync } : {}),
    };
  }

  async handleAppStoreWebhook(payload: any, headers: Record<string, string | string[] | undefined> = {}) {
    this.assertWebhookAllowed('APP_STORE_WEBHOOK_SECRET', headers);
    return this.recordBillingEvent({
      provider: 'app_store',
      providerEventId: this.providerEventId(payload, ['notificationUUID', 'id']),
      eventType: String(payload?.notificationType ?? payload?.type ?? payload?.eventType ?? 'unknown'),
      rawPayload: this.safePayload(payload),
    });
  }

  async handleGooglePlayWebhook(payload: any, headers: Record<string, string | string[] | undefined> = {}) {
    this.assertWebhookAllowed('GOOGLE_PLAY_WEBHOOK_SECRET', headers);
    return this.recordBillingEvent({
      provider: 'google_play',
      providerEventId: this.providerEventId(payload, ['messageId', 'eventId', 'id']),
      eventType: String(payload?.eventType ?? payload?.notificationType ?? payload?.type ?? 'unknown'),
      rawPayload: this.safePayload(payload),
    });
  }

  async handlePayosWebhook(payload: any) {
    const verified = await this.verifyPayosWebhookPayload(payload);
    const data = verified.data;
    const orderCode = this.normalizedPayosOrderCode(data?.orderCode);
    const code = String(verified.code ?? data?.code ?? '').trim();
    const eventId = this.payosProviderEventId(data, orderCode, code);
    const eventType = verified.success === true && code === '00'
      ? 'payos.payment.success'
      : 'payos.payment.updated';

    const event = await this.recordBillingEvent({
      provider: 'payos',
      providerEventId: eventId,
      eventType,
      rawPayload: this.safePayload(payload),
    });

    if (event.duplicate) {
      return { ok: true, provider: 'payos', event_id: eventId, event_type: eventType, duplicate: true, processed: false, skipped_reason: 'duplicate' };
    }

    if (!orderCode) {
      await this.updateBillingEventStatus('payos', eventId, {
        status: 'ignored',
        error_message: 'payos webhook is missing orderCode',
      });
      return { ok: true, provider: 'payos', event_id: eventId, event_type: eventType, duplicate: false, processed: false, skipped_reason: 'missing_order_code' };
    }

    const invoice = await this.findPayosInvoice(orderCode);
    if (!invoice) {
      await this.updateBillingEventStatus('payos', eventId, {
        status: 'ignored',
        error_message: 'payos invoice was not found',
      });
      return { ok: true, provider: 'payos', event_id: eventId, event_type: eventType, duplicate: false, processed: false, skipped_reason: 'payos_invoice_not_found' };
    }

    const validationError = this.payosSuccessValidationError(verified, invoice);
    if (validationError) {
      await this.updateBillingEventStatus('payos', eventId, {
        status: 'ignored',
        error_message: validationError,
        billing_invoice_id: invoice.id ?? null,
      });
      return { ok: true, provider: 'payos', event_id: eventId, event_type: eventType, duplicate: false, processed: false, skipped_reason: validationError };
    }

    const result = await this.activatePayosInvoice(invoice, orderCode, verified, payload);
    await this.updateBillingEventStatus('payos', eventId, {
      status: result.processed ? 'processed' : 'ignored',
      processed_at: result.processed ? new Date().toISOString() : null,
      error_message: result.skipped_reason ?? null,
      billing_invoice_id: result.billing_invoice_id ?? null,
      billing_subscription_id: result.billing_subscription_id ?? null,
    });

    return {
      ok: true,
      provider: 'payos',
      event_id: eventId,
      event_type: eventType,
      duplicate: false,
      processed: result.processed,
      ...(result.skipped_reason ? { skipped_reason: result.skipped_reason } : {}),
      ...(result.entitlement_sync ? { entitlement_sync: result.entitlement_sync } : {}),
    };
  }

  async recordBillingEvent(input: BillingEventInput) {
    const { error } = await this.supabase.db.from('billing_events').insert({
      provider: input.provider,
      provider_event_id: input.providerEventId,
      event_type: input.eventType,
      status: 'received',
      raw_payload: input.rawPayload,
    });

    if (error) {
      if (this.isDuplicateError(error)) {
        return { ok: true, duplicate: true, ignored: true };
      }
      throw error;
    }

    return { ok: true, duplicate: false };
  }

  async upsertBillingCustomerFromStripe(payload: any): Promise<{ user_id: string; billing_customer_id: string | null } | null> {
    const object = this.stripeObject(payload);
    const customer = this.stripeCustomerValue(object?.customer ?? object);
    if (!customer.id) return null;
    const userId = this.extractValidMetadataUserId(customer.metadata, object?.metadata);
    if (!userId) return null;

    const { data, error } = await this.supabase.db
      .from('billing_customers')
      .upsert({
        user_id: userId,
        provider: 'stripe',
        provider_customer_id: customer.id,
        email: customer.email ?? object?.customer_email ?? object?.email ?? null,
        metadata: {
          source: 'stripe_metadata',
          created_by: 'webhook',
          ...(customer.metadata ?? {}),
          ...(object?.metadata ?? {}),
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,provider_customer_id' })
      .select('id, user_id')
      .maybeSingle();

    if (error) throw error;
    return { user_id: String(data?.user_id ?? userId), billing_customer_id: data?.id ?? null };
  }

  async upsertBillingSubscriptionFromStripe(payload: any): Promise<StripeMappingResult> {
    const subscription = this.stripeObject(payload);
    const providerSubscriptionId = String(subscription?.id ?? '').trim();
    const customerId = this.stripeCustomerValue(subscription?.customer).id;
    if (!providerSubscriptionId || !customerId) return { processed: false, skipped_reason: 'stripe subscription is missing id or customer' };

    await this.upsertBillingCustomerFromStripe(payload);
    const userId = await this.resolveUserIdFromStripeCustomer(customerId, subscription);
    if (!userId) return { processed: false, skipped_reason: 'stripe customer is not linked to a user' };

    const tier = this.resolveTier(subscription?.metadata);
    const status = this.mapStripeSubscriptionStatus(String(subscription?.status ?? ''));
    const cancelledAt = subscription?.canceled_at
      ? this.stripeTimestamp(subscription.canceled_at)
      : payload?.type === 'customer.subscription.deleted'
        ? new Date().toISOString()
        : null;

    const { data, error } = await this.supabase.db
      .from('billing_subscriptions')
      .upsert({
        user_id: userId,
        provider: 'stripe',
        provider_subscription_id: providerSubscriptionId,
        tier: tier.tier,
        status,
        is_paid: status === 'active',
        billing_period_start: this.stripeTimestamp(subscription?.current_period_start),
        billing_period_end: this.stripeTimestamp(subscription?.current_period_end),
        cancelled_at: cancelledAt,
        metadata: { ...(subscription?.metadata ?? {}), ...tier.metadata },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,provider_subscription_id' })
      .select('id')
      .maybeSingle();

    if (error) throw error;
    const result: StripeMappingResult = { processed: true, billing_subscription_id: data?.id ?? null };
    try {
      const sync = await this.syncUserSubscriptionFromBilling(userId);
      result.entitlement_sync = {
        attempted: true,
        synced: sync.synced,
        ...(sync.skipped_reason ? { skipped_reason: sync.skipped_reason } : {}),
      };
    } catch (error: any) {
      result.entitlement_sync = {
        attempted: true,
        synced: false,
        error: this.safeErrorMessage(error),
      };
    }
    return result;
  }

  async upsertBillingInvoiceFromStripe(payload: any): Promise<StripeMappingResult> {
    const invoice = this.stripeObject(payload);
    const providerInvoiceId = String(invoice?.id ?? '').trim();
    const customerId = this.stripeCustomerValue(invoice?.customer).id;
    if (!providerInvoiceId || !customerId) return { processed: false, skipped_reason: 'stripe invoice is missing id or customer' };

    await this.upsertBillingCustomerFromStripe(payload);
    const userId = await this.resolveUserIdFromStripeCustomer(customerId, invoice);
    if (!userId) return { processed: false, skipped_reason: 'stripe customer is not linked to a user' };

    const providerSubscriptionId = this.stripeSubscriptionId(invoice?.subscription);
    const billingSubscriptionId = providerSubscriptionId ? await this.resolveBillingSubscriptionIdFromStripeSubscription(providerSubscriptionId) : null;
    const tier = this.resolveTier(invoice?.metadata, this.stripeSubscriptionMetadata(invoice?.subscription));
    const amount = this.convertOriginalAmount(Number(invoice?.amount_paid ?? 0) / 100, String(invoice?.currency ?? 'VND'));
    const period = invoice?.lines?.data?.[0]?.period ?? {};
    const paidAt = this.stripeTimestamp(invoice?.status_transitions?.paid_at) ?? new Date().toISOString();

    const { data, error } = await this.supabase.db
      .from('billing_invoices')
      .upsert({
        user_id: userId,
        billing_subscription_id: billingSubscriptionId,
        provider: 'stripe',
        provider_invoice_id: providerInvoiceId,
        tier: tier.tier,
        status: 'paid',
        amount_original: amount.amount_original,
        currency_original: amount.currency_original,
        amount_vnd: amount.amount_vnd,
        amount_usd: amount.amount_usd,
        fx_rate: amount.fx_rate,
        billing_period_start: this.stripeTimestamp(period.start),
        billing_period_end: this.stripeTimestamp(period.end),
        paid_at: paidAt,
        metadata: { ...(invoice?.metadata ?? {}), ...tier.metadata, ...amount.metadata },
        raw_payload: invoice,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,provider_invoice_id' })
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return { processed: true, billing_invoice_id: data?.id ?? null };
  }

  async insertBillingRefundFromStripe(payload: any): Promise<StripeMappingResult> {
    const object = this.stripeObject(payload);
    const isRefund = payload?.type === 'refund.created';
    const refund = isRefund ? object : object?.refunds?.data?.[0] ?? null;
    const providerRefundId = String(isRefund ? object?.id ?? '' : refund?.id ?? object?.id ?? '').trim();
    const customerId = this.stripeCustomerValue(object?.customer).id;
    if (!providerRefundId) return { processed: false, skipped_reason: 'stripe refund is missing id' };

    await this.upsertBillingCustomerFromStripe(payload);
    const userId = customerId ? await this.resolveUserIdFromStripeCustomer(customerId, object) : null;
    if (!userId) return { processed: false, skipped_reason: 'stripe customer is not linked to a user' };

    const providerInvoiceId = String(object?.invoice ?? refund?.invoice ?? '').trim();
    const billingInvoiceId = providerInvoiceId ? await this.resolveBillingInvoiceIdFromStripeInvoice(providerInvoiceId) : null;
    const originalAmount = Number((isRefund ? object?.amount : object?.amount_refunded) ?? 0) / 100;
    const amount = this.convertOriginalAmount(originalAmount, String(object?.currency ?? refund?.currency ?? 'VND'));

    const { data, error } = await this.supabase.db
      .from('billing_refunds')
      .upsert({
        user_id: userId,
        billing_invoice_id: billingInvoiceId,
        provider: 'stripe',
        provider_refund_id: providerRefundId,
        amount_original: amount.amount_original,
        currency_original: amount.currency_original,
        amount_vnd: amount.amount_vnd,
        amount_usd: amount.amount_usd,
        fx_rate: amount.fx_rate,
        refunded_at: this.stripeTimestamp(object?.created ?? refund?.created) ?? new Date().toISOString(),
        reason: object?.reason ?? refund?.reason ?? null,
        metadata: amount.metadata,
        raw_payload: object,
      }, { onConflict: 'provider,provider_refund_id' })
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return { processed: true, billing_refund_id: data?.id ?? null, billing_invoice_id: billingInvoiceId };
  }

  async resolveUserIdFromStripeCustomer(customerId: string | null | undefined, metadataSource?: any): Promise<string | null> {
    const normalized = String(customerId ?? '').trim();
    if (!normalized) return null;
    const { data, error } = await this.supabase.db
      .from('billing_customers')
      .select('user_id')
      .eq('provider', 'stripe')
      .eq('provider_customer_id', normalized)
      .maybeSingle();
    if (error) return null;
    if (data?.user_id) return String(data.user_id);

    const customer = this.stripeCustomerValue(metadataSource?.customer);
    const userId = this.extractValidMetadataUserId(
      metadataSource?.metadata,
      customer.metadata,
      metadataSource?.subscription?.metadata,
    );
    if (!userId) return null;

    const { error: linkError } = await this.supabase.db
      .from('billing_customers')
      .upsert({
        user_id: userId,
        provider: 'stripe',
        provider_customer_id: normalized,
        email: customer.email ?? metadataSource?.customer_email ?? metadataSource?.email ?? null,
        metadata: {
          source: 'stripe_metadata',
          created_by: 'webhook',
          ...(metadataSource?.metadata ?? {}),
          ...(customer.metadata ?? {}),
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,provider_customer_id' })
      .select('id')
      .maybeSingle();
    if (linkError) throw linkError;
    return userId;
  }

  private requirePaymentIssueType(value: any): BillingPaymentIssueType {
    const issueType = String(value ?? '').trim() as BillingPaymentIssueType;
    if (!BILLING_PAYMENT_ISSUE_TYPES.includes(issueType)) {
      throw new BadRequestException('Invalid payment issue type.');
    }
    return issueType;
  }

  private async requireUserInvoice(userId: string, invoiceId: string): Promise<Record<string, any>> {
    if (!this.isUuid(invoiceId)) {
      throw new BadRequestException('Invalid invoice id. Expected UUID.');
    }

    const { data, error } = await this.supabase.db
      .from('billing_invoices')
      .select('id, user_id, provider, provider_invoice_id, tier, status, amount_vnd, paid_at, created_at')
      .eq('id', invoiceId)
      .maybeSingle();
    if (error) throw error;
    if (!data || String(data.user_id ?? '') !== userId) {
      throw new BadRequestException('Invoice does not belong to the authenticated user.');
    }
    return data;
  }

  private cleanNullableText(value: any, maxLength: number): string | null {
    const text = String(value ?? '').trim();
    if (!text) return null;
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }

  private safeUserPaymentIssue(row: any) {
    return {
      id: row?.id ?? null,
      user_id: row?.user_id ?? null,
      invoice_id: row?.invoice_id ?? null,
      subscription_id: row?.subscription_id ?? null,
      provider: row?.provider ?? 'payos',
      issue_type: row?.issue_type ?? null,
      status: (row?.status ?? 'open') as BillingPaymentIssueStatus,
      user_message: row?.user_message ?? null,
      resolution: row?.resolution ?? null,
      created_at: row?.created_at ?? null,
      updated_at: row?.updated_at ?? null,
      resolved_at: row?.resolved_at ?? null,
    };
  }

  private async fetchBillingSubscriptionsForEntitlement(userId: string): Promise<Array<Record<string, any>>> {
    const { data, error } = await this.supabase.db
      .from('billing_subscriptions')
      .select('id, user_id, provider, tier, status, is_paid, billing_period_end, cancelled_at, updated_at, created_at')
      .eq('user_id', userId)
      .limit(100);
    if (error) return [];
    return Array.isArray(data) ? data : [];
  }

  private async fetchLegacySubscriptionsForEntitlement(userId: string): Promise<Array<Record<string, any>>> {
    const { data, error } = await this.supabase.db
      .from('user_subscriptions')
      .select('id, user_id, tier, is_active, payment_provider, renews_at, cancelled_at, updated_at, created_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) return [];
    return Array.isArray(data) ? data : [];
  }

  private async fetchPayosSubscriptionsForRenewalReminder(userId: string): Promise<Array<Record<string, any>>> {
    const { data, error } = await this.supabase.db
      .from('billing_subscriptions')
      .select('id, user_id, provider, tier, status, is_paid, billing_period_end, cancelled_at, updated_at, created_at')
      .eq('user_id', userId)
      .eq('provider', 'payos')
      .eq('status', 'active')
      .eq('is_paid', true)
      .is('cancelled_at', null)
      .limit(100);
    if (error) return [];
    return Array.isArray(data)
      ? data.filter((row) => (
        row?.user_id === userId
        && String(row?.provider ?? '').toLowerCase() === 'payos'
        && String(row?.status ?? '').toLowerCase() === 'active'
        && row?.is_paid === true
        && !row?.cancelled_at
      ))
      : [];
  }

  private daysUntil(end: Date, now: Date): number {
    const dayMs = 24 * 60 * 60 * 1000;
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return 0;
    return Math.ceil(diff / dayMs);
  }

  private payosRenewalReminderWindow(daysRemaining: number): PayosRenewalReminderWindow | null {
    if (daysRemaining <= 0) return 'expired';
    if (daysRemaining <= 1) return '1_day';
    if (daysRemaining <= 3) return '3_day';
    if (daysRemaining <= 7) return '7_day';
    return null;
  }

  private payosRenewalReminderMessage(tier: Extract<BillingEntitlementTier, 'premium' | 'pro'>, window: PayosRenewalReminderWindow): string {
    const name = this.titleCase(tier);
    if (window === '7_day') return `Gói ${name} của bạn còn 7 ngày. Gia hạn để tiếp tục sử dụng.`;
    if (window === '3_day') return `Gói ${name} của bạn còn 3 ngày. Gia hạn để không bị gián đoạn.`;
    if (window === '1_day') return `Gói ${name} của bạn còn 1 ngày. Hãy gia hạn hôm nay.`;
    return `Gói ${name} của bạn đã hết hạn. Gia hạn để tiếp tục dùng tính năng ${name}.`;
  }

  private isActivePaidBillingSubscription(row: Record<string, any>, now: Date): boolean {
    if (row.is_paid !== true) return false;
    if (String(row.status ?? '').toLowerCase() !== 'active') return false;
    if (row.cancelled_at) return false;
    const periodEnd = row.billing_period_end ? new Date(String(row.billing_period_end)) : null;
    return !periodEnd || Number.isNaN(periodEnd.getTime()) || periodEnd > now;
  }

  private isActiveLegacySubscription(row: Record<string, any>, now: Date): boolean {
    if (row.is_active === false) return false;
    if (row.cancelled_at) return false;
    const tier = this.normalizeTier(row.tier);
    if (!['premium', 'pro'].includes(tier)) return false;
    const source = this.legacyEntitlementSource(row.payment_provider);
    if (!source) return false;
    const renewsAt = row.renews_at ? new Date(String(row.renews_at)) : null;
    return !renewsAt || Number.isNaN(renewsAt.getTime()) || renewsAt > now;
  }

  private legacyEntitlementSource(provider: any): Extract<BillingEntitlementSource, 'trial' | 'manual'> | null {
    const normalized = String(provider ?? '').toLowerCase();
    if (normalized === 'trial') return 'trial';
    if (normalized === 'manual') return 'manual';
    return null;
  }

  private normalizeTier(value: any): BillingEntitlementTier {
    const normalized = String(value ?? '').toLowerCase();
    if (normalized === 'pro') return 'pro';
    if (normalized === 'premium') return 'premium';
    return 'free';
  }

  private normalizeEntitlementProvider(value: any): BillingEntitlementProvider | undefined {
    const normalized = String(value ?? '').toLowerCase();
    if (['stripe', 'app_store', 'google_play', 'payos', 'manual', 'trial'].includes(normalized)) {
      return normalized as BillingEntitlementProvider;
    }
    return undefined;
  }

  private tierPriority(value: any): number {
    const tier = this.normalizeTier(value);
    if (tier === 'pro') return 3;
    if (tier === 'premium') return 2;
    return 1;
  }

  private safeErrorMessage(error: any): string {
    return String(error?.message ?? error?.error_description ?? 'billing entitlement sync failed').slice(0, 200);
  }

  private async fetchActivePaidSubscriptions(): Promise<BillingSubscriptionRow[]> {
    const { data, error } = await this.supabase.db
      .from('billing_subscriptions')
      .select('id, user_id, provider, tier, status, is_paid, cancelled_at')
      .eq('is_paid', true)
      .in('status', ['active', 'trialing'])
      .is('cancelled_at', null)
      .limit(50000);
    if (error) return [];
    return Array.isArray(data) ? data : [];
  }

  private async createStripeCustomerPlaceholderOrFail(userId: string, email?: string | null): Promise<{
    providerCustomerId: string;
    source: string;
    metadata?: Record<string, any>;
  }> {
    const stripe = this.getStripeClient();
    if (stripe) {
      const customer = await stripe.customers.create({
        ...(email ? { email } : {}),
        metadata: { user_id: userId },
      });
      if (!customer.id) {
        throw new HttpException('Stripe customer creation did not return a customer id.', HttpStatus.BAD_GATEWAY);
      }
      return {
        providerCustomerId: customer.id,
        source: 'stripe',
        metadata: { stripe_customer_created: true },
      };
    }

    if (this.isProduction()) {
      throw new HttpException('Stripe checkout is not configured for production.', HttpStatus.NOT_IMPLEMENTED);
    }

    return {
      providerCustomerId: `test_cus_${userId}`,
      source: 'local_placeholder',
      metadata: { stripe_sdk_available: false },
    };
  }

  private createStripeCheckoutUrlOrMock(input: {
    stripe: Stripe.Stripe | null;
    customerId: string;
    priceId: string;
    userId: string;
    tier: StripeCheckoutTier;
    interval: StripeCheckoutInterval;
  }): Promise<string> | string {
    if (input.stripe) {
      const successUrl = this.billingUrl('BILLING_SUCCESS_URL', true);
      const cancelUrl = this.billingUrl('BILLING_CANCEL_URL', true);
      return input.stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: input.customerId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          user_id: input.userId,
          tier: input.tier,
          interval: input.interval,
        },
        subscription_data: {
          metadata: {
            user_id: input.userId,
            tier: input.tier,
            interval: input.interval,
          },
        },
      }).then((session: { url?: string | null }) => {
        if (!session.url) {
          throw new HttpException('Stripe Checkout Session did not return a URL.', HttpStatus.BAD_GATEWAY);
        }
        return session.url;
      });
    }

    if (this.isProduction()) {
      throw new HttpException('Stripe Checkout is not fully configured for production.', HttpStatus.NOT_IMPLEMENTED);
    }

    const params = new URLSearchParams({
      provider: 'stripe',
      tier: input.tier,
      interval: input.interval,
      customer_id: input.customerId,
      price_id: input.priceId || 'missing_price',
    });
    return `http://localhost:3000/mock-checkout?${params.toString()}`;
  }

  private stripePriceId(tier: StripeCheckoutTier, interval: StripeCheckoutInterval, requireConfigured = false): string {
    const key = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`;
    const priceId = String(this.config.get<string>(key) ?? '').trim();
    if (priceId) return priceId;
    if (this.isProduction() || requireConfigured) {
      throw new HttpException(`Stripe price id is not configured for ${tier}/${interval}.`, HttpStatus.NOT_IMPLEMENTED);
    }
    return `mock_price_${tier}_${interval}`;
  }

  private billingUrl(key: 'BILLING_SUCCESS_URL' | 'BILLING_CANCEL_URL', requireConfigured = false): string {
    const url = String(this.config.get<string>(key) ?? '').trim();
    if (url) return url;
    if (this.isProduction() || requireConfigured) {
      throw new HttpException(`${key} is not configured for Stripe Checkout.`, HttpStatus.NOT_IMPLEMENTED);
    }
    return 'http://localhost:3000/mock-checkout-return';
  }

  private getStripeClient(): Stripe.Stripe | null {
    if (this.stripeClient !== undefined) return this.stripeClient;
    const secretKey = String(this.config.get<string>('STRIPE_SECRET_KEY') ?? '').trim();
    if (!secretKey) {
      this.stripeClient = null;
      return null;
    }
    this.stripeClient = new Stripe(secretKey);
    return this.stripeClient;
  }

  private getPayosClient(): PayOS | null {
    if (this.payosClient !== undefined) return this.payosClient;
    const clientId = String(this.config.get<string>('PAYOS_CLIENT_ID') ?? '').trim();
    const apiKey = String(this.config.get<string>('PAYOS_API_KEY') ?? '').trim();
    const checksumKey = String(this.config.get<string>('PAYOS_CHECKSUM_KEY') ?? '').trim();
    if (!clientId || !apiKey || !checksumKey) {
      this.payosClient = null;
      return null;
    }
    this.payosClient = new PayOS({ clientId, apiKey, checksumKey });
    return this.payosClient;
  }

  private async verifyPayosWebhookPayload(payload: any): Promise<{
    code: string;
    desc?: string | null;
    success: boolean;
    data: Record<string, any>;
  }> {
    const payos = this.getPayosClient();
    if (payos) {
      try {
        const verified = await payos.webhooks.verify(payload);
        return this.normalizePayosWebhookPayload(payload, verified);
      } catch (err: any) {
        // Normalize and hide any sensitive details from provider errors
        const _ = this.safeErrorMessage(err);
        throw new BadRequestException('Invalid PayOS webhook signature.');
      }
    }

    if (this.isProduction()) {
      throw new HttpException('PayOS webhook verification is not configured.', HttpStatus.NOT_IMPLEMENTED);
    }

    return this.normalizePayosWebhookPayload(payload, payload);
  }

  private normalizePayosWebhookPayload(originalPayload: any, verifiedPayload: any): {
    code: string;
    desc?: string | null;
    success: boolean;
    data: Record<string, any>;
  } {
    const envelope = verifiedPayload?.data ? verifiedPayload : originalPayload;
    const data = verifiedPayload?.data
      ? verifiedPayload.data
      : originalPayload?.data
        ? originalPayload.data
        : verifiedPayload ?? {};
    const successValue = envelope?.success ?? originalPayload?.success;
    return {
      code: String(envelope?.code ?? originalPayload?.code ?? data?.code ?? '').trim(),
      desc: envelope?.desc ?? originalPayload?.desc ?? data?.desc ?? null,
      success: successValue === true || String(successValue).toLowerCase() === 'true',
      data: this.safePayload(data),
    };
  }

  private payosProviderEventId(data: Record<string, any>, orderCode: string | null, code: string): string {
    const paymentLinkId = String(data?.paymentLinkId ?? '').trim();
    const reference = String(data?.reference ?? '').trim();
    if (paymentLinkId && reference) return `payos:${paymentLinkId}:${reference}`;
    return `payos:${orderCode ?? 'unknown'}:${code || 'unknown'}`;
  }

  private normalizedPayosOrderCode(value: any): string | null {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const numeric = Number(text);
    if (!Number.isSafeInteger(numeric) || numeric <= 0) return null;
    return String(numeric);
  }

  private payosSuccessValidationError(
    verified: { code: string; success: boolean; data: Record<string, any> },
    invoice: Record<string, any>,
  ): string | null {
    if (verified.success !== true || verified.code !== '00') return 'payos webhook is not a successful payment';
    const currency = String(verified.data?.currency ?? '').trim().toUpperCase();
    if (currency && currency !== 'VND') return 'payos webhook currency is not VND';
    const expected = this.roundVnd(Number(invoice.amount_vnd ?? invoice.amount_original ?? 0));
    const actual = this.roundVnd(Number(verified.data?.amount ?? 0));
    if (!expected || actual !== expected) return 'payos webhook amount does not match invoice';
    return null;
  }

  private async findPayosInvoice(orderCode: string): Promise<Record<string, any> | null> {
    const { data, error } = await this.supabase.db
      .from('billing_invoices')
      .select('id, user_id, provider, provider_invoice_id, tier, status, amount_original, currency_original, amount_vnd, amount_usd, metadata, raw_payload')
      .eq('provider', 'payos')
      .eq('provider_invoice_id', orderCode)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  private async activatePayosInvoice(
    invoice: Record<string, any>,
    orderCode: string,
    verified: { data: Record<string, any> },
    originalPayload: any,
  ): Promise<StripeMappingResult> {
    const userId = String(invoice.user_id ?? '').trim();
    if (!userId) return { processed: false, skipped_reason: 'payos invoice is not linked to a user' };
    const tier = this.normalizeTier(invoice.tier);
    if (!['premium', 'pro'].includes(tier)) return { processed: false, skipped_reason: 'payos invoice has invalid tier' };
    const interval = this.normalizePayosInterval(invoice.metadata?.interval ?? invoice.raw_payload?.interval);
    const paidAt = this.payosPaidAt(verified.data?.transactionDateTime);
    const period = await this.payosBillingPeriod(userId, tier as PayosCheckoutTier, interval, paidAt);
    const amount = this.convertOriginalAmount(Number(invoice.amount_vnd ?? verified.data?.amount ?? 0), 'VND');

    const { data: paidInvoice, error: invoiceError } = await this.supabase.db
      .from('billing_invoices')
      .upsert({
        user_id: userId,
        provider: 'payos',
        provider_invoice_id: orderCode,
        tier,
        status: 'paid',
        amount_original: amount.amount_original,
        currency_original: amount.currency_original,
        amount_vnd: amount.amount_vnd,
        amount_usd: amount.amount_usd,
        fx_rate: amount.fx_rate,
        billing_period_start: period.start,
        billing_period_end: period.end,
        paid_at: paidAt,
        metadata: {
          ...(invoice.metadata ?? {}),
          interval,
          payos_reference: verified.data?.reference ?? null,
          payos_payment_link_id: verified.data?.paymentLinkId ?? null,
          source: 'payos_webhook_success',
        },
        raw_payload: this.safePayload(originalPayload),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,provider_invoice_id' })
      .select('id')
      .maybeSingle();
    if (invoiceError) throw invoiceError;

    const { data: subscription, error: subscriptionError } = await this.supabase.db
      .from('billing_subscriptions')
      .upsert({
        user_id: userId,
        provider: 'payos',
        provider_subscription_id: `payos_${orderCode}`,
        tier,
        status: 'active',
        is_paid: true,
        billing_period_start: period.start,
        billing_period_end: period.end,
        cancelled_at: null,
        metadata: {
          orderCode,
          interval,
          source: 'payos_webhook_success',
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,provider_subscription_id' })
      .select('id')
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    const result: StripeMappingResult = {
      processed: true,
      billing_invoice_id: paidInvoice?.id ?? invoice.id ?? null,
      billing_subscription_id: subscription?.id ?? null,
    };
    try {
      const sync = await this.syncUserSubscriptionFromBilling(userId);
      result.entitlement_sync = {
        attempted: true,
        synced: sync.synced,
        ...(sync.skipped_reason ? { skipped_reason: sync.skipped_reason } : {}),
      };
    } catch (error: any) {
      result.entitlement_sync = {
        attempted: true,
        synced: false,
        error: this.safeErrorMessage(error),
      };
    }
    return result;
  }

  private normalizePayosInterval(value: any): PayosCheckoutInterval {
    return String(value ?? '').toLowerCase() === 'annual' ? 'annual' : 'monthly';
  }

  private async payosBillingPeriod(
    userId: string,
    tier: PayosCheckoutTier,
    interval: PayosCheckoutInterval,
    paidAtIso: string,
  ): Promise<{ start: string; end: string }> {
    const paidAt = new Date(paidAtIso);
    let start = Number.isNaN(paidAt.getTime()) ? new Date() : paidAt;
    const activeSameTier = await this.fetchActivePayosSubscriptions(userId, tier);
    const futureEnd = activeSameTier
      .map((row) => row.billing_period_end ? new Date(String(row.billing_period_end)) : null)
      .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()) && value > start)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (futureEnd) start = futureEnd;
    const end = this.addPayosInterval(start, interval);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  private async fetchActivePayosSubscriptions(userId: string, tier: PayosCheckoutTier): Promise<BillingSubscriptionRow[]> {
    const { data, error } = await this.supabase.db
      .from('billing_subscriptions')
      .select('id, user_id, provider, tier, status, is_paid, billing_period_end, cancelled_at')
      .eq('provider', 'payos')
      .eq('user_id', userId)
      .eq('tier', tier)
      .eq('is_paid', true)
      .eq('status', 'active')
      .is('cancelled_at', null)
      .limit(100);
    if (error) return [];
    return Array.isArray(data) ? data : [];
  }

  private addPayosInterval(start: Date, interval: PayosCheckoutInterval): Date {
    const end = new Date(start.getTime());
    if (interval === 'annual') end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    return end;
  }

  private payosPaidAt(value: any): string {
    const text = String(value ?? '').trim();
    if (text) {
      const parsed = new Date(text.includes(' ') ? text.replace(' ', 'T') : text);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
  }

  private payosAmountVnd(tier: PayosCheckoutTier, interval: PayosCheckoutInterval): number {
    if (tier === 'premium' && interval === 'monthly') return 59000;
    if (tier === 'premium' && interval === 'annual') return 499000;
    if (tier === 'pro' && interval === 'monthly') return 129000;
    return 999000;
  }

  private payosCheckoutUrl(response: any): string {
    const checkoutUrl = response?.checkoutUrl
      ?? response?.checkout_url
      ?? response?.paymentLinkUrl
      ?? response?.payment_link_url
      ?? response?.data?.checkoutUrl
      ?? response?.data?.checkout_url
      ?? response?.data?.paymentLinkUrl
      ?? response?.data?.payment_link_url;
    if (!checkoutUrl) {
      throw new HttpException('PayOS payment link did not return a checkout URL.', HttpStatus.BAD_GATEWAY);
    }
    return String(checkoutUrl);
  }

  private payosUrl(key: 'PAYOS_RETURN_URL' | 'PAYOS_CANCEL_URL', requireConfigured = false): string {
    const url = String(this.config.get<string>(key) ?? '').trim();
    if (url) return url;
    if (this.isProduction() || requireConfigured) {
      throw new HttpException(`${key} is not configured for PayOS Checkout.`, HttpStatus.NOT_IMPLEMENTED);
    }
    return key === 'PAYOS_RETURN_URL'
      ? 'http://localhost:3000/billing/return/payos'
      : 'http://localhost:3000/billing/cancel/payos';
  }

  private createPayosMockCheckoutUrl(tier: PayosCheckoutTier, interval: PayosCheckoutInterval, orderCode: number): string {
    const params = new URLSearchParams({
      provider: 'payos',
      tier,
      interval,
      orderCode: String(orderCode),
    });
    return `http://localhost:3000/mock-payos-checkout?${params.toString()}`;
  }

  private createPayosOrderCode(): number {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
  }

  private titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private verifyStripeWebhookPayload(payload: any, headers: Record<string, string | string[] | undefined>, rawBody?: Buffer | string): any {
    const webhookSecret = String(this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '').trim();
    const signature = this.headerValue(headers, 'stripe-signature');
    const stripe = this.getStripeClient();

    if (this.isProduction()) {
      if (!webhookSecret) {
        throw new HttpException('Stripe webhook secret is not configured.', HttpStatus.NOT_IMPLEMENTED);
      }
      if (!stripe) {
        throw new HttpException('Stripe SDK is not configured for webhook verification.', HttpStatus.NOT_IMPLEMENTED);
      }
      if (!signature) {
        throw new BadRequestException('Missing Stripe-Signature header.');
      }
      if (!rawBody) {
        throw new BadRequestException('Missing raw request body for Stripe webhook verification.');
      }
      try {
        return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch {
        throw new BadRequestException('Invalid Stripe webhook signature.');
      }
    }

    if (webhookSecret && signature && rawBody && stripe) {
      try {
        return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch {
        throw new BadRequestException('Invalid Stripe webhook signature.');
      }
    }

    this.assertWebhookAllowed('STRIPE_WEBHOOK_SECRET', headers);
    return payload;
  }

  private assertWebhookAllowed(secretKey: string, headers: Record<string, string | string[] | undefined>) {
    const configuredSecret = String(this.config.get<string>(secretKey) ?? '').trim();
    if (configuredSecret) {
      const providedSecret = this.headerValue(headers, 'x-webhook-secret') ?? this.headerValue(headers, secretKey.toLowerCase().replace(/_/g, '-'));
      if (providedSecret !== configuredSecret) {
        throw new UnauthorizedException('Invalid webhook secret');
      }
      return;
    }

    if (this.isProduction()) {
      throw new HttpException(`Webhook secret is not configured for ${secretKey}.`, HttpStatus.NOT_IMPLEMENTED);
    }
  }

  private headerValue(headers: Record<string, string | string[] | undefined>, key: string): string | null {
    const target = key.toLowerCase();
    const entry = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === target)?.[1];
    const value = Array.isArray(entry) ? entry[0] : entry;
    return typeof value === 'string' ? value : null;
  }

  private providerEventId(payload: any, keys: string[]): string {
    for (const key of keys) {
      const value = payload?.[key];
      if (value) return String(value);
    }
    return createHash('sha256').update(JSON.stringify(this.safePayload(payload))).digest('hex');
  }

  private safePayload(payload: any): Record<string, any> {
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : { value: payload ?? null };
  }

  private isDuplicateError(error: any): boolean {
    const code = String(error?.code ?? '').toLowerCase();
    const message = String(error?.message ?? '').toLowerCase();
    return code === '23505' || message.includes('duplicate') || message.includes('unique');
  }

  private isProduction(): boolean {
    return process.env.NODE_ENV === 'production' || String(this.config.get<string>('NODE_ENV') ?? '').toLowerCase() === 'production';
  }

  private async fetchPaidInvoices(sinceIso: string): Promise<BillingInvoiceRow[]> {
    const { data, error } = await this.supabase.db
      .from('billing_invoices')
      .select('id, user_id, provider, tier, status, amount_vnd, amount_usd, paid_at, refunded_at')
      .eq('status', 'paid')
      .gte('paid_at', sinceIso)
      .limit(50000);
    if (error) return [];
    return Array.isArray(data) ? data : [];
  }

  private async fetchRefunds(sinceIso: string): Promise<BillingRefundRow[]> {
    const { data, error } = await this.supabase.db
      .from('billing_refunds')
      .select('id, user_id, provider, amount_vnd, amount_usd, refunded_at')
      .gte('refunded_at', sinceIso)
      .limit(50000);
    if (error) return [];
    return Array.isArray(data) ? data : [];
  }

  private async updateBillingEventStatus(provider: BillingProvider, providerEventId: string, patch: Record<string, any>) {
    const { error } = await this.supabase.db
      .from('billing_events')
      .update(patch)
      .eq('provider', provider)
      .eq('provider_event_id', providerEventId);
    if (error) throw error;
  }

  private async resolveBillingSubscriptionIdFromStripeSubscription(providerSubscriptionId: string): Promise<string | null> {
    const { data, error } = await this.supabase.db
      .from('billing_subscriptions')
      .select('id')
      .eq('provider', 'stripe')
      .eq('provider_subscription_id', providerSubscriptionId)
      .maybeSingle();
    if (error) return null;
    return data?.id ?? null;
  }

  private async resolveBillingInvoiceIdFromStripeInvoice(providerInvoiceId: string): Promise<string | null> {
    const { data, error } = await this.supabase.db
      .from('billing_invoices')
      .select('id')
      .eq('provider', 'stripe')
      .eq('provider_invoice_id', providerInvoiceId)
      .maybeSingle();
    if (error) return null;
    return data?.id ?? null;
  }

  private stripeObject(payload: any): any {
    return payload?.data?.object ?? payload ?? {};
  }

  private stripeCustomerValue(value: any): { id: string | null; email?: string | null; metadata?: Record<string, any> } {
    if (!value) return { id: null };
    if (typeof value === 'string') return { id: value };
    return {
      id: value.id ? String(value.id) : null,
      email: value.email ?? null,
      metadata: value.metadata ?? {},
    };
  }

  private stripeSubscriptionId(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.id ? String(value.id) : null;
  }

  private stripeSubscriptionMetadata(value: any): Record<string, any> {
    return value && typeof value === 'object' ? value.metadata ?? {} : {};
  }

  private extractValidMetadataUserId(...sources: Array<Record<string, any> | null | undefined>): string | null {
    for (const source of sources) {
      const candidate = String(source?.user_id ?? '').trim();
      if (this.isUuid(candidate)) return candidate;
    }
    return null;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private stripeTimestamp(value: any): string | null {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return new Date(numeric * 1000).toISOString();
  }

  private resolveTier(...metadataSources: Array<Record<string, any> | null | undefined>): { tier: 'free' | 'premium' | 'pro'; metadata: Record<string, any> } {
    for (const metadata of metadataSources) {
      const candidate = String(metadata?.tier ?? '').toLowerCase();
      if (['free', 'premium', 'pro'].includes(candidate)) {
        return { tier: candidate as 'free' | 'premium' | 'pro', metadata: {} };
      }
    }
    return { tier: 'premium', metadata: { tier_defaulted: true } };
  }

  private mapStripeSubscriptionStatus(status: string): 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' {
    const normalized = status.toLowerCase();
    if (normalized === 'active') return 'active';
    if (normalized === 'trialing') return 'trialing';
    if (normalized === 'past_due') return 'past_due';
    if (normalized === 'canceled' || normalized === 'cancelled') return 'cancelled';
    if (normalized === 'incomplete_expired') return 'expired';
    return 'past_due';
  }

  private convertOriginalAmount(amountOriginal: number, currency: string) {
    const amount = Number.isFinite(amountOriginal) && amountOriginal > 0 ? amountOriginal : 0;
    const currencyOriginal = String(currency || 'VND').toUpperCase();
    const fxRate = this.usdToVndRate();
    if (currencyOriginal === 'VND') {
      return {
        amount_original: amount,
        currency_original: currencyOriginal,
        amount_vnd: this.roundVnd(amount),
        amount_usd: this.roundUsd(amount / fxRate),
        fx_rate: fxRate,
        metadata: {},
      };
    }
    if (currencyOriginal === 'USD') {
      return {
        amount_original: amount,
        currency_original: currencyOriginal,
        amount_vnd: this.roundVnd(amount * fxRate),
        amount_usd: this.roundUsd(amount),
        fx_rate: fxRate,
        metadata: {},
      };
    }
    return {
      amount_original: amount,
      currency_original: currencyOriginal,
      amount_vnd: 0,
      amount_usd: 0,
      fx_rate: fxRate,
      metadata: { unsupported_currency: currencyOriginal },
    };
  }

  private amountVnd(row: { amount_vnd?: number | string | null; amount_usd?: number | string | null }, usdToVnd: number): number {
    const direct = Number(row.amount_vnd ?? 0);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const usd = Number(row.amount_usd ?? 0);
    return Number.isFinite(usd) ? usd * usdToVnd : 0;
  }

  private amountUsd(row: { amount_vnd?: number | string | null; amount_usd?: number | string | null }, usdToVnd: number): number {
    const direct = Number(row.amount_usd ?? 0);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const vnd = Number(row.amount_vnd ?? 0);
    return Number.isFinite(vnd) && usdToVnd > 0 ? vnd / usdToVnd : 0;
  }

  private countUnique(values: Array<string | null | undefined>): number {
    return new Set(values.filter(Boolean)).size;
  }

  private countBy(rows: Array<Record<string, any>>, key: string): Record<string, number> {
    return rows.reduce((acc, row) => {
      const value = String(row[key] ?? 'unknown');
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private usdToVndRate(): number {
    const configured = Number(this.config.get<string>('USD_TO_VND_RATE') ?? DEFAULT_USD_TO_VND);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_USD_TO_VND;
  }

  private roundVnd(value: number): number {
    return Math.round(value);
  }

  private roundUsd(value: number): number {
    return Math.round(value * 10000) / 10000;
  }
}
