import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

const PRICING_USD: Record<string, number> = {
  free: 0,
  premium: 9.99,
  pro: 19.99,
};

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

@Injectable()
export class AdminRevenueService {
  constructor(private readonly supabase: SupabaseService) {}

  async getRevenue() {
    const now = new Date();
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [subscriptions, usersCount, aiUsageRows] = await Promise.all([
      this.fetchSubscriptions(),
      this.countUsers(),
      this.fetchAiUsageRows(monthStart.toISOString()),
    ]);

    const active = subscriptions.filter((row) => row.is_active !== false && !row.cancelled_at);
    const cancelled = subscriptions.filter((row) => row.is_active === false || Boolean(row.cancelled_at));
    const activeByTier = this.countByTier(active);
    const paidUsers = (activeByTier.premium ?? 0) + (activeByTier.pro ?? 0);
    const activeSubscriptions = active.length;
    const totalUsers = usersCount || Math.max(activeSubscriptions, subscriptions.length);
    const estimatedMrr = active.reduce((sum, row) => sum + this.priceForTier(row.tier), 0);
    const estimatedArr = estimatedMrr * 12;
    const aiCostMtd = aiUsageRows.reduce((sum, row: any) => sum + Number(row.estimated_cost_usd ?? 0), 0);
    const aiCreditsMtd = aiUsageRows.reduce((sum, row: any) => sum + Number(row.credits_consumed ?? 1), 0);
    const requestsMtd = aiUsageRows.length;
    const conversionRate = totalUsers > 0 ? paidUsers / totalUsers : 0;
    const grossMargin = estimatedMrr - aiCostMtd;
    const grossMarginRate = estimatedMrr > 0 ? grossMargin / estimatedMrr : 0;

    return {
      generated_at: now.toISOString(),
      currency: 'USD',
      pricing: PRICING_USD,
      subscriptions: {
        total_users: totalUsers,
        total_subscription_rows: subscriptions.length,
        active_subscriptions: activeSubscriptions,
        active_free: activeByTier.free ?? 0,
        active_premium: activeByTier.premium ?? 0,
        active_pro: activeByTier.pro ?? 0,
        paid_users: paidUsers,
        cancelled: cancelled.length,
        by_provider: this.countByProvider(active),
      },
      revenue: {
        estimated_mrr_usd: this.roundMoney(estimatedMrr),
        estimated_arr_usd: this.roundMoney(estimatedArr),
        arpu_usd: activeSubscriptions > 0 ? this.roundMoney(estimatedMrr / activeSubscriptions) : 0,
        arppu_usd: paidUsers > 0 ? this.roundMoney(estimatedMrr / paidUsers) : 0,
      },
      ai_cost: {
        month_to_date_usd: this.roundMoney(aiCostMtd),
        requests_month_to_date: requestsMtd,
        credits_month_to_date: aiCreditsMtd,
        cost_per_request_usd: requestsMtd > 0 ? this.roundMoney(aiCostMtd / requestsMtd) : 0,
      },
      margin: {
        estimated_monthly_gross_margin_usd: this.roundMoney(grossMargin),
        estimated_gross_margin_rate: Math.round(grossMarginRate * 10000) / 10000,
      },
      conversion: {
        paid_users: paidUsers,
        total_users: totalUsers,
        paid_conversion_rate: Math.round(conversionRate * 10000) / 10000,
      },
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

  private async countUsers(): Promise<number> {
    const result = await this.supabase.db.from('users').select('id', { count: 'exact', head: true });
    return Number(result?.count ?? 0) || 0;
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

  private countByTier(rows: SubscriptionRow[]): Record<string, number> {
    return rows.reduce((acc, row) => {
      const tier = String(row.tier ?? 'free');
      acc[tier] = (acc[tier] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private countByProvider(rows: SubscriptionRow[]): Record<string, number> {
    return rows.reduce((acc, row) => {
      const provider = String(row.payment_provider ?? 'unknown');
      acc[provider] = (acc[provider] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private priceForTier(tier: string | null | undefined): number {
    return PRICING_USD[String(tier ?? 'free')] ?? 0;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
