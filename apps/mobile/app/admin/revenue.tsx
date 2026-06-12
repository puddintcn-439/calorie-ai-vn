import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
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
    <SurfaceCard style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {sub ? <Text style={styles.muted}>{sub}</Text> : null}
    </SurfaceCard>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SurfaceCard style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </SurfaceCard>
  );
}

function Row({ left, right, sub }: { left: string; right: string; sub?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{left}</Text>
        {sub ? <Text style={styles.muted}>{sub}</Text> : null}
      </View>
      <Text style={styles.rowRight}>{right}</Text>
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
    <ScreenShell scroll scrollContentStyle={styles.scrollContent} reserveBottomNav={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ADMIN CONSOLE V3</Text>
          <Text style={styles.title}>Revenue</Text>
          <Text style={styles.subtitle}>Subscription revenue, AI cost, margin, and conversion metrics.</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.toggleButton} onPress={() => setCurrency(currency === 'vnd' ? 'usd' : 'vnd')}>
            <Text style={styles.toggleText}>{currency === 'vnd' ? 'VND' : 'USD'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshButton} onPress={load}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin' as any)}><Text style={styles.navText}>Overview</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/users' as any)}><Text style={styles.navText}>Users</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/ai-usage' as any)}><Text style={styles.navText}>AI Usage</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/audit-log' as any)}><Text style={styles.navText}>Audit Log</Text></TouchableOpacity>
      </View>

      {loading ? (
        <SurfaceCard style={styles.centerCard}>
          <ActivityIndicator color={theme.colors.accentMint} />
          <Text style={styles.muted}>Loading revenue dashboard...</Text>
        </SurfaceCard>
      ) : error ? (
        <SurfaceCard style={styles.centerCard}>
          <Text style={styles.errorTitle}>{error}</Text>
          <Text style={styles.muted}>This page is restricted to admin/owner accounts.</Text>
        </SurfaceCard>
      ) : data ? (
        <View style={styles.content}>
          <Section title="Confirmed billing revenue">
            {confirmedRevenue ? (
              <View style={styles.metricGrid}>
                <MetricCard label="Confirmed Net Revenue MTD" value={money(confirmedMtd?.[`net_revenue_${suffix}`], currency)} sub="Ledger net revenue after refunds" />
                <MetricCard label="Confirmed Gross Revenue MTD" value={money(confirmedMtd?.[`gross_revenue_${suffix}`], currency)} sub="Paid invoices from billing ledger" />
                <MetricCard label="Refunds MTD" value={money(confirmedMtd?.[`refunds_${suffix}`], currency)} sub="Refunds recorded in billing ledger" />
                <MetricCard label="Active Paid Users" value={n(confirmedRevenue.active_paid_users)} sub={`${n(confirmedRevenue.active_paid_subscriptions)} active paid subscriptions`} />
                <MetricCard label="Paid Invoice Count" value={n(confirmedMtd?.paid_invoice_count)} sub="Month to date" />
                <MetricCard label="Refund Count" value={n(confirmedMtd?.refund_count)} sub="Month to date" />
              </View>
            ) : (
              <Text style={styles.muted}>Billing ledger has no confirmed revenue yet.</Text>
            )}
          </Section>

          <Section title="Estimated revenue">
            <Text style={styles.muted}>{revenue.estimated_revenue_note ?? 'Estimated from active subscription tier pricing.'}</Text>
          </Section>

          <View style={styles.metricGrid}>
            {cards.map((card) => <MetricCard key={card.label} {...card} />)}
          </View>

          <Section title="Subscriptions">
            <Row left="Total users" right={n(subscriptions.total_users)} />
            <Row left="Active subscriptions" right={n(subscriptions.active_subscriptions)} />
            <Row left="Free" right={n(subscriptions.active_free)} />
            <Row left="Premium" right={n(subscriptions.active_premium)} />
            <Row left="Pro" right={n(subscriptions.active_pro)} />
            <Row left="Cancelled" right={n(subscriptions.cancelled)} />
          </Section>

          <Section title="Pricing">
            <Row left="Premium monthly" right={money(monthlyPricing.premium, currency)} />
            <Row left="Premium annual" right={money(annualPricing.premium, currency)} />
            <Row left="Pro monthly" right={money(monthlyPricing.pro, currency)} />
            <Row left="Pro annual" right={money(annualPricing.pro, currency)} />
          </Section>

          <Section title="AI Cost & Exchange">
            <Row left="AI cost source" right={data.ai_cost_source_currency} />
            <Row left="USD to VND rate" right={n(data.usd_to_vnd_rate)} />
            <Row left="Cost/request" right={money(aiCost[`cost_per_request_${suffix}`], currency)} />
            <Row left="Generated" right={date(data.generated_at)} />
          </Section>
        </View>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { gap: 18 },
  header: { gap: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerActions: { flexDirection: 'row', gap: 10 },
  eyebrow: { color: theme.colors.accentCyan, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, maxWidth: 720 },
  refreshButton: { borderRadius: 14, backgroundColor: theme.colors.accentMint, paddingHorizontal: 16, paddingVertical: 10 },
  refreshText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  toggleButton: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.accentCyan, paddingHorizontal: 16, paddingVertical: 10 },
  toggleText: { color: theme.colors.accentCyan, fontWeight: '900' },
  navRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  navButton: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingVertical: 10 },
  navText: { color: theme.colors.text, fontWeight: '800' },
  content: { gap: 14 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { minWidth: 180, flexGrow: 1, gap: 6 },
  metricLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  metricValue: { color: theme.colors.text, fontSize: 26, fontWeight: '900' },
  section: { gap: 8 },
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle },
  rowCopy: { flex: 1 },
  rowTitle: { color: theme.colors.text, fontWeight: '900' },
  rowRight: { color: theme.colors.text, fontWeight: '900', textAlign: 'right' },
  centerCard: { alignItems: 'center', gap: 10 },
  errorTitle: { color: theme.colors.danger, fontSize: 20, fontWeight: '900' },
  muted: { color: theme.colors.textMuted, fontSize: 12 },
});
