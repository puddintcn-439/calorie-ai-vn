import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/i18n-text';
import {
  AdminMetricCard,
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  AdminToneCard,
  type AdminTone,
  adminChrome,
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

function num(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function ChartBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  return (
    <View style={styles.chartRow}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartLabel}>{label}</Text>
        <Text style={styles.chartValue}>{n(value)}</Text>
      </View>
      <View style={styles.track}>{max > 0 ? <View style={[styles.bar, { width: `${width}%`, backgroundColor: color }]} /> : null}</View>
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
  const marginRate = num(margin.estimated_gross_margin_rate);
  const marginTone: AdminTone = marginRate < 0 ? 'danger' : marginRate < 0.25 ? 'warning' : 'success';

  const cards = useMemo(() => [
    { label: 'Estimated MRR', value: money(revenue[`estimated_mrr_${suffix}`], currency), helper: 'Estimated monthly recurring revenue', tone: 'billing' as AdminTone },
    { label: 'Estimated ARR', value: money(revenue[`estimated_arr_${suffix}`], currency), helper: 'Estimated annual run rate', tone: 'premium' as AdminTone },
    { label: 'AI Cost MTD', value: money(aiCost[`month_to_date_${suffix}`], currency), helper: `${n(aiCost.requests_month_to_date)} requests · ${n(aiCost.credits_month_to_date)} credits`, tone: 'warning' as AdminTone },
    { label: 'Gross Margin', value: money(margin[`estimated_monthly_gross_margin_${suffix}`], currency), helper: pct(margin.estimated_gross_margin_rate), tone: marginTone },
    { label: 'Paid Conversion', value: pct(conversion.paid_conversion_rate), helper: `${n(conversion.paid_users)} paid / ${n(conversion.total_users)} users`, tone: 'success' as AdminTone },
    { label: 'ARPPU', value: money(revenue[`arppu_${suffix}`], currency), helper: 'Average revenue per paid user', tone: 'info' as AdminTone },
  ], [aiCost, conversion, currency, margin, marginTone, revenue, suffix]);

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
          <AdminToneCard title="Confirmed revenue" subtitle="Ledger-based paid invoices and refunds. Prefer this section for PayOS reconciliation." tone="billing">
            {confirmedRevenue ? (
              <View style={adminStyles.metricGrid}>
                <AdminMetricCard label="Net Revenue MTD" value={money(confirmedMtd?.[`net_revenue_${suffix}`], currency)} helper="After refunds" tone="billing" />
                <AdminMetricCard label="Gross Revenue MTD" value={money(confirmedMtd?.[`gross_revenue_${suffix}`], currency)} helper="Paid invoices" tone="success" />
                <AdminMetricCard label="Refunds MTD" value={money(confirmedMtd?.[`refunds_${suffix}`], currency)} helper="Recorded refunds" tone={num(confirmedMtd?.[`refunds_${suffix}`]) > 0 ? 'warning' : 'neutral'} />
                <AdminMetricCard label="Active Paid Users" value={n(confirmedRevenue.active_paid_users)} helper={`${n(confirmedRevenue.active_paid_subscriptions)} active paid subscriptions`} tone="premium" />
                <AdminMetricCard label="Paid Invoice Count" value={n(confirmedMtd?.paid_invoice_count)} helper="Month to date" tone="info" />
                <AdminMetricCard label="Refund Count" value={n(confirmedMtd?.refund_count)} helper="Month to date" tone={num(confirmedMtd?.refund_count) > 0 ? 'warning' : 'neutral'} />
              </View>
            ) : (
              <Text style={adminStyles.muted}>No confirmed revenue in billing ledger yet.</Text>
            )}
          </AdminToneCard>

          <View style={adminStyles.metricGrid}>
            {cards.map((card) => <AdminMetricCard key={card.label} {...card} />)}
          </View>

          <View style={styles.chartGrid}>
            <AdminSectionCard title="User plan distribution" subtitle="All registered users grouped by current access tier." style={styles.chartCard}>
              <ChartBar label="Free" value={num(subscriptions.active_free)} max={Math.max(num(subscriptions.active_free), num(subscriptions.active_premium), num(subscriptions.active_pro), num(subscriptions.cancelled))} color={adminChrome.textMuted} />
              <ChartBar label="Premium" value={num(subscriptions.active_premium)} max={Math.max(num(subscriptions.active_free), num(subscriptions.active_premium), num(subscriptions.active_pro), num(subscriptions.cancelled))} color={adminChrome.purple} />
              <ChartBar label="Pro" value={num(subscriptions.active_pro)} max={Math.max(num(subscriptions.active_free), num(subscriptions.active_premium), num(subscriptions.active_pro), num(subscriptions.cancelled))} color={adminChrome.mint} />
              <ChartBar label="Cancelled" value={num(subscriptions.cancelled)} max={Math.max(num(subscriptions.active_free), num(subscriptions.active_premium), num(subscriptions.active_pro), num(subscriptions.cancelled))} color={adminChrome.rose} />
            </AdminSectionCard>

            <AdminSectionCard title="Revenue guardrails" subtitle="Margin, conversion, and AI cost signals for production checks." style={styles.chartCard}>
              <View style={styles.signalGrid}>
                <View style={styles.signalBox}><Text style={styles.signalValue}>{pct(margin.estimated_gross_margin_rate)}</Text><Text style={styles.signalLabel}>gross margin</Text></View>
                <View style={styles.signalBox}><Text style={styles.signalValue}>{pct(conversion.paid_conversion_rate)}</Text><Text style={styles.signalLabel}>paid conversion</Text></View>
                <View style={styles.signalBox}><Text style={styles.signalValue}>{money(aiCost[`month_to_date_${suffix}`], currency)}</Text><Text style={styles.signalLabel}>AI cost MTD</Text></View>
              </View>
            </AdminSectionCard>
          </View>

          <AdminSectionCard title="User plan mix" subtitle="All registered users grouped by current access tier. Active subscriptions remains the row count for subscription records.">
            <Row left="Total users" right={n(subscriptions.total_users)} />
            <Row left="Active subscriptions" right={n(subscriptions.active_subscriptions)} />
            <Row left="Free" right={n(subscriptions.active_free)} />
            <Row left="Premium" right={n(subscriptions.active_premium)} />
            <Row left="Pro" right={n(subscriptions.active_pro)} />
            <Row left="Cancelled" right={n(subscriptions.cancelled)} />
            <Row left="Distribution total" right={n(subscriptions.plan_distribution_total)} />
          </AdminSectionCard>

          <AdminToneCard title="AI cost" subtitle="Cost attribution used by margin calculations." tone="warning">
            <Row left="AI cost source" right={data.ai_cost_source_currency} />
            <Row left="Cost/request" right={money(aiCost[`cost_per_request_${suffix}`], currency)} />
            <Row left="Requests MTD" right={n(aiCost.requests_month_to_date)} />
            <Row left="Credits MTD" right={n(aiCost.credits_month_to_date)} />
          </AdminToneCard>

          <AdminToneCard title="Margin" subtitle="Estimated subscription margin after AI cost." tone={marginTone}>
            <Row left="Estimated monthly gross margin" right={money(margin[`estimated_monthly_gross_margin_${suffix}`], currency)} />
            <Row left="Estimated gross margin rate" right={pct(margin.estimated_gross_margin_rate)} />
            <Row left="Paid conversion" right={pct(conversion.paid_conversion_rate)} />
            <Row left="ARPPU" right={money(revenue[`arppu_${suffix}`], currency)} />
          </AdminToneCard>

          <AdminToneCard title="PayOS notes" subtitle="Operational notes for payment reconciliation." tone="billing">
            <Text style={adminStyles.muted}>{revenue.estimated_revenue_note ?? 'Estimated values are derived from active subscription tier pricing.'}</Text>
            <Row left="Premium monthly" right={money(monthlyPricing.premium, currency)} />
            <Row left="Premium annual" right={money(annualPricing.premium, currency)} />
            <Row left="Pro monthly" right={money(monthlyPricing.pro, currency)} />
            <Row left="Pro annual" right={money(annualPricing.pro, currency)} />
            <Row left="USD to VND rate" right={n(data.usd_to_vnd_rate)} />
            <Row left="Generated" right={date(data.generated_at)} />
          </AdminToneCard>
        </View>
      ) : (
        <AdminStateCard state="empty" />
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  toggleButton: { borderRadius: 8, borderWidth: 1, borderColor: adminChrome.accent, backgroundColor: adminChrome.accentSoft, paddingHorizontal: 16, paddingVertical: 10 },
  toggleText: { color: adminChrome.accent, fontWeight: '900' },
  chartGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chartCard: { flexGrow: 1, flexBasis: 420, minWidth: 320, gap: 14 },
  chartRow: { gap: 7 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  chartLabel: { color: adminChrome.textSoft, fontSize: 13, fontWeight: '800', flexShrink: 1 },
  chartValue: { color: adminChrome.text, fontSize: 13, fontWeight: '900', textAlign: 'right', minWidth: 44 },
  track: { height: 11, borderRadius: 999, backgroundColor: '#eef2f7', overflow: 'hidden', borderWidth: 1, borderColor: adminChrome.border },
  bar: { height: '100%', borderRadius: 999 },
  signalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  signalBox: { flexGrow: 1, flexBasis: 150, minWidth: 140, borderRadius: 10, borderWidth: 1, borderColor: adminChrome.border, backgroundColor: adminChrome.cardMuted, padding: 12, gap: 4 },
  signalValue: { color: adminChrome.text, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  signalLabel: { color: adminChrome.textMuted, fontSize: 12, fontWeight: '700' },
});
