import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/supabase/supabase.service';

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
  cancelled_at?: string | null;
};

@Injectable()
export class BillingService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
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
