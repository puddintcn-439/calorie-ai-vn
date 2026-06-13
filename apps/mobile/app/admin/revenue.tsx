import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
import {
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  adminStyles,
} from '../../components/admin/AdminShell';
import { adminService, type AdminRevenueResponse } from '../../services/admin.service';

function detectCurrency(): 'vnd' | 'usd' {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'vi';
  return locale.toLowerCase().startsWith('vi') ? 'vnd' : 'usd';
}

function money(value: any, currency: 'vnd' | 'usd') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  if (currency === 'vnd') return `${Math.round(numeric).toLocaleString('vi-VN')}đ`;
  return `$${numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(1)}%` : '--';
}

function n(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '--';
}

function date(value: any) {
  if (!value) return '--';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString();
}

function adminError(error: any) {
  const status = Number(error?.response?.status ?? 0);
  if (status === 403) return 'Admin access required';
  if (status === 401) return 'Please sign in again.';
  return error?.response?.data?.message ?? 'Could not load revenue dashboard.';
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <AdminSectionCard style={adminStyles.metricCard}>
      <Text style={adminStyles.metricLabel}>{label}</Text>
      <Text style={adminStyles.metricValue}>{value}</Text>
      {sub ? <Text style={adminStyles.muted}>{sub}</Text> : null}
    </AdminSectionCard>
  );
}

function Row({ left, right, sub }: { left: string; right: string; sub?: string }) {
  return (
    <View style={adminStyles.row}>
      <View style={adminStyles.rowCopy}>
        <Text style={adminStyles.rowTitle}>{left}</Text>
        {sub ? <Text style={adminStyles.muted}>{sub}</Text> : null}
      </View>
      <Text style={adminStyles.rowRight}>{right}</Text>
    </View>
  );
}

export default function AdminRevenueScreen() {
  const [data, setData] = useState<AdminRevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'vnd' | 'usd'>(() => detectCurrency());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await adminService.fetchRevenue());
    } catch (err: any) {
      setData(null);
      setError(adminError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const suffix = currency === 'vnd' ? 'vnd' : 'usd';
  const revenue = data?.revenue ?? {};
  const aiCost = data?.ai_cost ?? {};
  const margin = data?.margin ?? {};
  const subscriptions = data?.subscriptions ?? {};
  const conversion = data?.conversion ?? {};
  const confirmedRevenue = data?.confirmed_revenue ?? null;
  const confirmedMtd = confirmedRevenue?.month_to_date ?? null;
  const pricing = data?.pricing ?? {};
  const monthlyPricing = currency === 'vnd' ? pricing.monthly_vnd ?? {} : pricing.monthly_usd ?? {};
  const annualPricing = currency === 'vnd' ? pricing.annual_vnd ?? {} : pricing.annual_usd ?? {};

  const cards = useMemo(() => [
    { label: 'Estimated MRR', value: money(revenue[`estimated_mrr_${suffix}`], currency), sub: 'Estimated monthly recurring revenue' },
    { label: 'Estimated ARR', value: money(revenue[`estimated_arr_${suffix}`], currency), sub: 'Estimated annual run rate' },
    { label: 'AI Cost MTD', value: money(aiCost[`month_to_date_${suffix}`], currency), sub: `${n(aiCost.requests_month_to_date)} requests · ${n(aiCost.credits_month_to_date)} credits` },
    { label: 'Gross Margin', value: money(margin[`estimated_monthly_gross_margin_${suffix}`], currency), sub: pct(margin.estimated_gross_margin_rate) },
    { label: 'Paid Conversion', value: pct(conversion.paid_conversion_rate), sub: `${n(conversion.paid_users)} paid / ${n(conversion.total_users)} users` },
    { label: 'ARPPU', value: money(revenue[`arppu_${suffix}`], currency), sub: 'Average revenue per paid user' },
  ], [aiCost, conversion, currency, margin, revenue, suffix]);

  return (
    <AdminShell
      title="Revenue"
      subtitle="Doanh thu subscription, PayOS ledger, AI cost và margin. Các số confirmed đến từ billing ledger."
      onRefresh={load}
      actions={
        <TouchableOpacity style={styles.toggleButton} onPress={() => setCurrency(currency === 'vnd' ? 'usd' : 'vnd')}>
          <Text style={styles.toggleText}>{currency === 'vnd' ? 'VND' : 'USD'}</Text>
        </TouchableOpacity>
      }
    >
      {loading ? (
        <AdminStateCard state="loading" title="Loading..." />
      ) : error ? (
        <AdminStateCard state="denied" title={error} onRetry={load} showLogin />
      ) : data ? (
        <View style={styles.content}>
          <AdminSectionCard title="Confirmed revenue" subtitle="Ledger-based paid invoices and refunds. Prefer this section for PayOS reconciliation.">
            {confirmedRevenue ? (
              <View style={adminStyles.metricGrid}>
                <MetricCard label="Net Revenue MTD" value={money(confirmedMtd?.[`net_revenue_${suffix}`], currency)} sub="After refunds" />
                <MetricCard label="Gross Revenue MTD" value={money(confirmedMtd?.[`gross_revenue_${suffix}`], currency)} sub="Paid invoices" />
                <MetricCard label="Refunds MTD" value={money(confirmedMtd?.[`refunds_${suffix}`], currency)} sub="Recorded refunds" />
                <MetricCard label="Active Paid Users" value={n(confirmedRevenue.active_paid_users)} sub={`${n(confirmedRevenue.active_paid_subscriptions)} active paid subscriptions`} />
                <MetricCard label="Paid Invoice Count" value={n(confirmedMtd?.paid_invoice_count)} sub="Month to date" />
                <MetricCard label="Refund Count" value={n(confirmedMtd?.refund_count)} sub="Month to date" />
              </View>
            ) : (
              <Text style={adminStyles.muted}>No confirmed revenue in billing ledger yet.</Text>
            )}
          </AdminSectionCard>

          <View style={adminStyles.metricGrid}>
            {cards.map((card) => <MetricCard key={card.label} {...card} />)}
          </View>

          <AdminSectionCard title="Subscription mix" subtitle="Current active subscription distribution.">
            <Row left="Total users" right={n(subscriptions.total_users)} />
            <Row left="Active subscriptions" right={n(subscriptions.active_subscriptions)} />
            <Row left="Free" right={n(subscriptions.active_free)} />
            <Row left="Premium" right={n(subscriptions.active_premium)} />
            <Row left="Pro" right={n(subscriptions.active_pro)} />
            <Row left="Cancelled" right={n(subscriptions.cancelled)} />
          </AdminSectionCard>

          <AdminSectionCard title="AI cost" subtitle="Cost attribution used by margin calculations.">
            <Row left="AI cost source" right={data.ai_cost_source_currency} />
            <Row left="Cost/request" right={money(aiCost[`cost_per_request_${suffix}`], currency)} />
            <Row left="Requests MTD" right={n(aiCost.requests_month_to_date)} />
            <Row left="Credits MTD" right={n(aiCost.credits_month_to_date)} />
          </AdminSectionCard>

          <AdminSectionCard title="Margin" subtitle="Estimated subscription margin after AI cost.">
            <Row left="Estimated monthly gross margin" right={money(margin[`estimated_monthly_gross_margin_${suffix}`], currency)} />
            <Row left="Estimated gross margin rate" right={pct(margin.estimated_gross_margin_rate)} />
            <Row left="Paid conversion" right={pct(conversion.paid_conversion_rate)} />
            <Row left="ARPPU" right={money(revenue[`arppu_${suffix}`], currency)} />
          </AdminSectionCard>

          <AdminSectionCard title="PayOS notes" subtitle="Operational notes for payment reconciliation.">
            <Text style={adminStyles.muted}>{revenue.estimated_revenue_note ?? 'Estimated values are derived from active subscription tier pricing.'}</Text>
            <Row left="Premium monthly" right={money(monthlyPricing.premium, currency)} />
            <Row left="Premium annual" right={money(annualPricing.premium, currency)} />
            <Row left="Pro monthly" right={money(monthlyPricing.pro, currency)} />
            <Row left="Pro annual" right={money(annualPricing.pro, currency)} />
            <Row left="USD to VND rate" right={n(data.usd_to_vnd_rate)} />
            <Row left="Generated" right={date(data.generated_at)} />
          </AdminSectionCard>
        </View>
      ) : (
        <AdminStateCard state="empty" />
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  toggleButton: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.accentCyan, paddingHorizontal: 16, paddingVertical: 10 },
  toggleText: { color: theme.colors.accentCyan, fontWeight: '900' },
});
