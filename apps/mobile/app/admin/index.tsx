import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../components/i18n-text';
import {
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  adminStyles,
} from '../../components/admin/AdminShell';
import { adminService, type AdminOverview } from '../../services/admin.service';

function formatNumber(value: number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '--';
}

function formatUsd(value: number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(4)}` : '--';
}

function getAdminError(error: any) {
  const status = Number(error?.response?.status ?? 0);
  if (status === 403) return 'Tài khoản này không có quyền admin.';
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập admin lại.';
  return 'Không thể tải Admin Console lúc này. Vui lòng thử lại.';
}

type MetricTone = 'purple' | 'cyan' | 'mint' | 'amber' | 'rose' | 'blue';

const toneStyles: Record<MetricTone, any> = {
  purple: { borderTopColor: '#635bff' },
  cyan: { borderTopColor: '#06b6d4' },
  mint: { borderTopColor: '#10b981' },
  amber: { borderTopColor: '#f59e0b' },
  rose: { borderTopColor: '#f43f5e' },
  blue: { borderTopColor: '#3b82f6' },
};

function toNumber(value: number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function MetricCard({ label, value, helper, tone }: { label: string; value: string; helper?: string; tone: MetricTone }) {
  return (
    <AdminSectionCard style={[adminStyles.metricCard, styles.metricCard, toneStyles[tone]]}>
      <View style={styles.metricHeader}>
        <Text style={adminStyles.metricLabel}>{label}</Text>
        <View style={[styles.metricDot, styles[`dot_${tone}`]]} />
      </View>
      <View>
        <Text style={adminStyles.metricValue}>{value}</Text>
        {helper ? <Text style={adminStyles.muted}>{helper}</Text> : null}
      </View>
    </AdminSectionCard>
  );
}

function ChartBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;

  return (
    <View style={styles.chartRow}>
      <View style={styles.chartRowHeader}>
        <Text style={styles.chartLabel}>{label}</Text>
        <Text style={styles.chartValue}>{formatNumber(value)}</Text>
      </View>
      <View style={styles.track}>
        {max > 0 ? <View style={[styles.bar, { width: `${width}%`, backgroundColor: color }]} /> : <View style={styles.emptyBar} />}
      </View>
    </View>
  );
}

function OverviewCharts({ overview }: { overview: AdminOverview }) {
  const activeToday = toNumber(overview.active_users_today);
  const active7d = toNumber(overview.active_users_7d);
  const new7d = toNumber(overview.new_users_7d);
  const aiRequests = toNumber(overview.ai_requests_today);
  const quotaBlocked = toNumber(overview.quota_blocked_today);
  const aiCostCents = Math.round(toNumber(overview.estimated_ai_cost_today_usd) * 10000);
  const engagementMax = Math.max(activeToday, active7d, new7d);
  const aiMax = Math.max(aiRequests, quotaBlocked, aiCostCents);
  const guardrailRate = aiRequests > 0 ? Math.round((quotaBlocked / aiRequests) * 100) : 0;

  return (
    <View style={styles.chartGrid}>
      <AdminSectionCard title="Engagement mix" subtitle="Current overview signals from users and account growth." style={styles.chartCard}>
        <ChartBar label="Active today" value={activeToday} max={engagementMax} color="#635bff" />
        <ChartBar label="Active 7d" value={active7d} max={engagementMax} color="#06b6d4" />
        <ChartBar label="New 7d" value={new7d} max={engagementMax} color="#10b981" />
      </AdminSectionCard>

      <AdminSectionCard title="AI operations" subtitle="Request volume, quota pressure, and cost signal for today." style={styles.chartCard}>
        <ChartBar label="Requests" value={aiRequests} max={aiMax} color="#3b82f6" />
        <ChartBar label="Quota blocked" value={quotaBlocked} max={aiMax} color="#f43f5e" />
        <ChartBar label="Cost units" value={aiCostCents} max={aiMax} color="#f59e0b" />
        <View style={styles.guardrailBox}>
          <Text style={styles.guardrailValue}>{guardrailRate}%</Text>
          <Text style={styles.guardrailLabel}>quota blocked / requests</Text>
        </View>
      </AdminSectionCard>
    </View>
  );
}

function QuickAction({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={() => router.push(href as any)}>
      <View style={styles.quickIcon}>
        <Text style={styles.quickIconText}>{title.slice(0, 1)}</Text>
      </View>
      <View style={styles.quickCopy}>
        <Text style={styles.quickTitle}>{title}</Text>
        <Text style={adminStyles.muted}>{body}</Text>
      </View>
      <Text style={styles.quickLink}>Open</Text>
    </TouchableOpacity>
  );
}

export default function AdminOverviewScreen() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setOverview(await adminService.fetchOverview());
    } catch (err: any) {
      setOverview(null);
      setError(getAdminError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <AdminShell
      title="Admin Console"
      subtitle="Theo dõi người dùng, doanh thu, AI usage và các yêu cầu hỗ trợ."
      onRefresh={load}
    >
      {loading ? (
        <AdminStateCard state="loading" title="Loading..." />
      ) : error ? (
        <AdminStateCard state="denied" title={error} onRetry={load} showLogin />
      ) : overview ? (
        <>
          <View style={adminStyles.metricGrid}>
            <MetricCard label="Active users today" value={formatNumber(overview.active_users_today)} helper="Daily active signal" tone="purple" />
            <MetricCard label="Active users 7d" value={formatNumber(overview.active_users_7d)} helper="Rolling weekly reach" tone="cyan" />
            <MetricCard label="New users 7d" value={formatNumber(overview.new_users_7d)} helper="New accounts this week" tone="mint" />
            <MetricCard label="AI requests today" value={formatNumber(overview.ai_requests_today)} helper="Provider calls today" tone="blue" />
            <MetricCard label="AI cost today" value={formatUsd(overview.estimated_ai_cost_today_usd)} helper="Estimated infra spend" tone="amber" />
            <MetricCard label="Quota blocked today" value={formatNumber(overview.quota_blocked_today)} helper="Guardrail events" tone="rose" />
          </View>

          <OverviewCharts overview={overview} />

          <AdminSectionCard
            title="Quick actions"
            subtitle="Các lối tắt cho công việc admin thường dùng."
          >
            <View style={styles.quickGrid}>
              <QuickAction title="Users" body="Tìm user, xem gói, quota và hoạt động gần đây." href="/admin/users" />
              <QuickAction title="Revenue" body="Kiểm tra doanh thu, subscription mix, AI cost và margin." href="/admin/revenue" />
              <QuickAction title="Payment Issues" body="Xử lý hoàn tiền, thanh toán trùng hoặc chưa kích hoạt gói." href="/admin/payment-issues" />
              <QuickAction title="AI Usage" body="Theo dõi request, chi phí, blocked quota và provider mix." href="/admin/ai-usage" />
            </View>
          </AdminSectionCard>

          <AdminSectionCard
            title="Needs attention"
            subtitle="Không invent số liệu nếu API chưa trả count. Dùng các link dưới đây để kiểm tra thủ công trong staging."
          >
            <View style={styles.attentionList}>
              <TouchableOpacity style={styles.attentionRow} onPress={() => router.push('/admin/payment-issues' as any)}>
                <View style={adminStyles.rowCopy}>
                  <Text style={adminStyles.rowTitle}>Payment Issues</Text>
                  <Text style={adminStyles.muted}>Mở support queue để xem case open/in_review.</Text>
                </View>
                <Text style={adminStyles.rowRight}>Review</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attentionRow} onPress={() => router.push('/admin/revenue' as any)}>
                <View style={adminStyles.rowCopy}>
                  <Text style={adminStyles.rowTitle}>Revenue</Text>
                  <Text style={adminStyles.muted}>Đối chiếu invoice paid, entitlement và PayOS notes.</Text>
                </View>
                <Text style={adminStyles.rowRight}>Check</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attentionRow} onPress={() => router.push('/admin/ai-usage' as any)}>
                <View style={adminStyles.rowCopy}>
                  <Text style={adminStyles.rowTitle}>AI Usage</Text>
                  <Text style={adminStyles.muted}>Kiểm tra spike request, cost và quota blocked hôm nay.</Text>
                </View>
                <Text style={adminStyles.rowRight}>Inspect</Text>
              </TouchableOpacity>
            </View>
          </AdminSectionCard>
        </>
      ) : (
        <AdminStateCard state="empty" />
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  metricCard: {
    borderTopWidth: 4,
    overflow: 'hidden',
  },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  metricDot: { width: 10, height: 10, borderRadius: 5 },
  dot_purple: { backgroundColor: '#635bff' },
  dot_cyan: { backgroundColor: '#06b6d4' },
  dot_mint: { backgroundColor: '#10b981' },
  dot_amber: { backgroundColor: '#f59e0b' },
  dot_rose: { backgroundColor: '#f43f5e' },
  dot_blue: { backgroundColor: '#3b82f6' },
  chartGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chartCard: { flexGrow: 1, flexBasis: 420, minWidth: 320, gap: 14 },
  chartRow: { gap: 7 },
  chartRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  chartLabel: { color: '#334155', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  chartValue: { color: '#0f172a', fontSize: 13, fontWeight: '900', textAlign: 'right', minWidth: 44 },
  track: { height: 11, borderRadius: 999, backgroundColor: '#eef2f7', overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  bar: { height: '100%', borderRadius: 999 },
  emptyBar: { width: '100%', height: '100%', backgroundColor: '#f8fafc' },
  guardrailBox: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  guardrailValue: { color: '#c2410c', fontSize: 22, lineHeight: 28, fontWeight: '900' },
  guardrailLabel: { color: '#9a3412', fontSize: 12, lineHeight: 17, fontWeight: '700', flex: 1, textAlign: 'right' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickAction: {
    flexGrow: 1,
    flexBasis: 250,
    minWidth: 230,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 13,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  quickIcon: { width: 30, height: 30, borderRadius: 7, backgroundColor: '#f0efff', alignItems: 'center', justifyContent: 'center' },
  quickIconText: { color: '#635bff', fontSize: 13, fontWeight: '900' },
  quickCopy: { flex: 1, gap: 3 },
  quickTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  quickLink: { color: '#635bff', fontSize: 12, fontWeight: '800', marginTop: 2 },
  attentionList: { gap: 0 },
  attentionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
});
