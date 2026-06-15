import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { BillingService } from '../billing/billing.service';

const PRICING_VND: Record<string, number> = {
  free: 0,
  premium: 59000,
  pro: 129000,
};

const ANNUAL_PRICING_VND: Record<string, number> = {
  free: 0,
  premium: 499000,
  pro: 999000,
};

const DEFAULT_USD_TO_VND = 26000;

type SubscriptionRow = {
  user_id?: string | null;
  tier?: string | null;
  is_active?: boolean | null;
  payment_provider?: string | null;
  started_at?: string | null;
  renews_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type UserPlanMix = {
  total_users: number;
  active_free: number;
  active_premium: number;
  active_pro: number;
  cancelled: number;
  paid_users: number;
  plan_distribution_total: number;
};

@Injectable()
export class AdminRevenueService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly billingService: BillingService,
  ) {}

  async getRevenue() {
    const now = new Date();
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const usdToVnd = this.usdToVndRate();

    const [subscriptions, userIds, aiUsageRows, confirmedRevenue] = await Promise.all([
      this.fetchSubscriptions(),
      this.fetchUserIds(),
      this.fetchAiUsageRows(monthStart.toISOString()),
      this.billingService.getConfirmedRevenueSummary(now),
    ]);

    const active = subscriptions.filter((row) => row.is_active !== false && !row.cancelled_at);
    const cancelled = subscriptions.filter((row) => row.is_active === false || Boolean(row.cancelled_at));
    const userPlanMix = this.buildUserPlanMix(userIds, subscriptions);
    const activeTrial = active.filter((row) => String(row.payment_provider ?? '').toLowerCase() === 'trial').length;
    const activeManualGrant = active.filter((row) => String(row.payment_provider ?? '').toLowerCase() === 'manual').length;
    const activePaidEstimatedRows = active.filter((row) => this.isEstimatedPaidSubscription(row));
    const paidUsers = userPlanMix.paid_users;
    const activeSubscriptions = active.length;
    const totalUsers = userPlanMix.total_users;
    const estimatedMrrVnd = active.reduce((sum, row) => sum + this.priceForTier(row.tier), 0);
    const estimatedPaidMrrVnd = activePaidEstimatedRows.reduce((sum, row) => sum + this.priceForTier(row.tier), 0);
    const estimatedArrVnd = estimatedMrrVnd * 12;
    const estimatedPaidArrVnd = estimatedPaidMrrVnd * 12;
    const estimatedMrrUsd = estimatedMrrVnd / usdToVnd;
    const estimatedPaidMrrUsd = estimatedPaidMrrVnd / usdToVnd;
    const estimatedArrUsd = estimatedArrVnd / usdToVnd;
    const estimatedPaidArrUsd = estimatedPaidArrVnd / usdToVnd;
    const aiCostMtdUsd = aiUsageRows.reduce((sum, row: any) => sum + Number(row.estimated_cost_usd ?? 0), 0);
    const aiCostMtdVnd = aiCostMtdUsd * usdToVnd;
    const aiCreditsMtd = aiUsageRows.reduce((sum, row: any) => sum + Number(row.credits_consumed ?? 1), 0);
    const requestsMtd = aiUsageRows.length;
    const conversionRate = totalUsers > 0 ? paidUsers / totalUsers : 0;
    const grossMarginVnd = estimatedMrrVnd - aiCostMtdVnd;
    const grossMarginUsd = grossMarginVnd / usdToVnd;
    const grossMarginRate = estimatedMrrVnd > 0 ? grossMarginVnd / estimatedMrrVnd : 0;

    return {
      generated_at: now.toISOString(),
      default_currency: 'VND',
      display_currencies: ['VND', 'USD'],
      ai_cost_source_currency: 'USD',
      usd_to_vnd_rate: usdToVnd,
      pricing: {
        monthly_vnd: PRICING_VND,
        annual_vnd: ANNUAL_PRICING_VND,
        monthly_usd: this.convertPriceMapToUsd(PRICING_VND, usdToVnd),
        annual_usd: this.convertPriceMapToUsd(ANNUAL_PRICING_VND, usdToVnd),
      },
      subscriptions: {
        total_users: totalUsers,
        total_subscription_rows: subscriptions.length,
        active_subscriptions: activeSubscriptions,
        active_free: userPlanMix.active_free,
        active_premium: userPlanMix.active_premium,
        active_pro: userPlanMix.active_pro,
        active_trial: activeTrial,
        active_manual_grant: activeManualGrant,
        active_paid_estimated: activePaidEstimatedRows.length,
        paid_users: paidUsers,
        cancelled: userPlanMix.cancelled,
        cancelled_subscription_rows: cancelled.length,
        plan_distribution_total: userPlanMix.plan_distribution_total,
        by_provider: this.countByProvider(active),
      },
      revenue: {
        estimated_revenue_note: 'Estimated from user_subscriptions tier pricing. Confirmed paid revenue is available in confirmed_revenue.',
        estimated_mrr_vnd: this.roundVnd(estimatedMrrVnd),
        estimated_mrr_usd: this.roundUsd(estimatedMrrUsd),
        estimated_arr_vnd: this.roundVnd(estimatedArrVnd),
        estimated_arr_usd: this.roundUsd(estimatedArrUsd),
        estimated_paid_mrr_vnd: this.roundVnd(estimatedPaidMrrVnd),
        estimated_paid_mrr_usd: this.roundUsd(estimatedPaidMrrUsd),
        estimated_paid_arr_vnd: this.roundVnd(estimatedPaidArrVnd),
        estimated_paid_arr_usd: this.roundUsd(estimatedPaidArrUsd),
        arpu_vnd: activeSubscriptions > 0 ? this.roundVnd(estimatedMrrVnd / activeSubscriptions) : 0,
        arpu_usd: activeSubscriptions > 0 ? this.roundUsd(estimatedMrrUsd / activeSubscriptions) : 0,
        arppu_vnd: paidUsers > 0 ? this.roundVnd(estimatedMrrVnd / paidUsers) : 0,
        arppu_usd: paidUsers > 0 ? this.roundUsd(estimatedMrrUsd / paidUsers) : 0,
      },
      ai_cost: {
        month_to_date_usd: this.roundUsd(aiCostMtdUsd),
        month_to_date_vnd: this.roundVnd(aiCostMtdVnd),
        requests_month_to_date: requestsMtd,
        credits_month_to_date: aiCreditsMtd,
        cost_per_request_usd: requestsMtd > 0 ? this.roundUsd(aiCostMtdUsd / requestsMtd) : 0,
        cost_per_request_vnd: requestsMtd > 0 ? this.roundVnd(aiCostMtdVnd / requestsMtd) : 0,
      },
      margin: {
        estimated_monthly_gross_margin_vnd: this.roundVnd(grossMarginVnd),
        estimated_monthly_gross_margin_usd: this.roundUsd(grossMarginUsd),
        estimated_gross_margin_rate: Math.round(grossMarginRate * 10000) / 10000,
      },
      conversion: {
        paid_users: paidUsers,
        total_users: totalUsers,
        paid_conversion_rate: Math.round(conversionRate * 10000) / 10000,
      },
      confirmed_revenue: confirmedRevenue,
    };
  }

  private async fetchSubscriptions(): Promise<SubscriptionRow[]> {
    const { data, error } = await this.supabase.db
      .from('user_subscriptions')
      .select('user_id, tier, is_active, payment_provider, started_at, renews_at, cancelled_at, created_at, updated_at')
      .limit(10000);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  private async fetchUserIds(): Promise<string[]> {
    const { data, error } = await this.supabase.db
      .from('users')
      .select('id')
      .limit(100000);
    if (error) throw error;
    return [...new Set((Array.isArray(data) ? data : []).map((row: any) => String(row?.id ?? '').trim()).filter(Boolean))];
  }

  private async fetchAiUsageRows(sinceIso: string): Promise<any[]> {
    const { data, error } = await this.supabase.db
      .from('ai_usage_events')
      .select('estimated_cost_usd, credits_consumed, created_at')
      .gte('created_at', sinceIso)
      .limit(50000);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  private countByProvider(rows: SubscriptionRow[]): Record<string, number> {
    return rows.reduce((acc, row) => {
      const provider = String(row.payment_provider ?? 'unknown');
      acc[provider] = (acc[provider] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private priceForTier(tier: string | null | undefined): number {
    return PRICING_VND[String(tier ?? 'free')] ?? 0;
  }

  private buildUserPlanMix(userIds: string[], subscriptions: SubscriptionRow[]): UserPlanMix {
    const registeredUsers = new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean));
    const rowsByUser = new Map<string, SubscriptionRow[]>();
    for (const row of subscriptions) {
      const userId = String(row.user_id ?? '').trim();
      if (!userId || !registeredUsers.has(userId)) continue;
      const rows = rowsByUser.get(userId) ?? [];
      rows.push(row);
      rowsByUser.set(userId, rows);
    }

    const mix: UserPlanMix = {
      total_users: registeredUsers.size,
      active_free: 0,
      active_premium: 0,
      active_pro: 0,
      cancelled: 0,
      paid_users: 0,
      plan_distribution_total: 0,
    };

    for (const userId of registeredUsers) {
      const rows = this.sortSubscriptionsNewestFirst(rowsByUser.get(userId) ?? []);
      const activePaid = rows.filter((row) => this.isActivePaidAccess(row));
      if (activePaid.length > 0) {
        const current = this.sortSubscriptionsNewestFirst(activePaid)[0];
        if (String(current?.tier ?? '').toLowerCase() === 'pro') mix.active_pro += 1;
        else mix.active_premium += 1;
        continue;
      }

      const latest = rows[0];
      if (latest && Boolean(latest.cancelled_at)) mix.cancelled += 1;
      else mix.active_free += 1;
    }

    mix.paid_users = mix.active_premium + mix.active_pro;
    mix.plan_distribution_total = mix.active_free + mix.active_premium + mix.active_pro + mix.cancelled;
    return mix;
  }

  private isActivePaidAccess(row: SubscriptionRow): boolean {
    const tier = String(row.tier ?? '').toLowerCase();
    return ['premium', 'pro'].includes(tier) && row.is_active !== false && !row.cancelled_at;
  }

  private sortSubscriptionsNewestFirst(rows: SubscriptionRow[]): SubscriptionRow[] {
    return [...rows].sort((left, right) => this.subscriptionTimestamp(right) - this.subscriptionTimestamp(left));
  }

  private subscriptionTimestamp(row: SubscriptionRow): number {
    const value = row.updated_at ?? row.created_at ?? row.started_at ?? row.renews_at ?? row.cancelled_at;
    const parsed = value ? new Date(value).getTime() : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private isEstimatedPaidSubscription(row: SubscriptionRow): boolean {
    const tier = String(row.tier ?? 'free').toLowerCase();
    const provider = String(row.payment_provider ?? '').toLowerCase();
    return ['premium', 'pro'].includes(tier) && ['stripe', 'app_store', 'google_play'].includes(provider);
  }

  private usdToVndRate(): number {
    const configured = Number(this.config.get<string>('USD_TO_VND_RATE') ?? DEFAULT_USD_TO_VND);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_USD_TO_VND;
  }

  private convertPriceMapToUsd(pricingVnd: Record<string, number>, usdToVnd: number): Record<string, number> {
    return Object.fromEntries(Object.entries(pricingVnd).map(([tier, value]) => [tier, this.roundUsd(value / usdToVnd)]));
  }

  private roundVnd(value: number): number {
    return Math.round(value);
  }

  private roundUsd(value: number): number {
    return Math.round(value * 10000) / 10000;
  }
}
