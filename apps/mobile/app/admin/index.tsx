import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../components/i18n-text';
import {
  AdminMetricCard,
  AdminQuickActionCard,
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  AdminToneCard,
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

function toNumber(value: number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function ChartBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 && value > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;

  return (
    <View style={styles.chartRow}>
      <View style={styles.chartRowHeader}>
        <Text style={styles.chartLabel}>{label}</Text>
        <Text style={styles.chartValue}>{formatNumber(value)}</Text>
      </View>
      <View style={styles.track}>
        {width > 0 ? <View style={[styles.bar, { width: `${width}%`, backgroundColor: color }]} /> : <View style={styles.emptyBar} />}
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
            <AdminMetricCard label="Active users today" value={formatNumber(overview.active_users_today)} helper="Daily active signal" tone="info" />
            <AdminMetricCard label="Active users 7d" value={formatNumber(overview.active_users_7d)} helper="Rolling weekly reach" tone="support" />
            <AdminMetricCard label="New users 7d" value={formatNumber(overview.new_users_7d)} helper="New accounts this week" tone="success" />
            <AdminMetricCard label="AI requests today" value={formatNumber(overview.ai_requests_today)} helper="Provider calls today" tone="ai" />
            <AdminMetricCard label="AI cost today" value={formatUsd(overview.estimated_ai_cost_today_usd)} helper="Estimated infra spend" tone="warning" />
            <AdminMetricCard label="Quota blocked today" value={formatNumber(overview.quota_blocked_today)} helper="Guardrail events" tone="danger" />
          </View>

          <OverviewCharts overview={overview} />

          <AdminSectionCard
            title="Quick actions"
            subtitle="Các lối tắt cho công việc admin thường dùng."
          >
            <View style={styles.quickGrid}>
              <AdminQuickActionCard title="Users" body="Tìm user, xem gói, quota và hoạt động gần đây." href="/admin/users" tone="info" />
              <AdminQuickActionCard title="Revenue" body="Kiểm tra doanh thu, subscription mix, AI cost và margin." href="/admin/revenue" tone="billing" />
              <AdminQuickActionCard title="Payment Issues" body="Xử lý hoàn tiền, thanh toán trùng hoặc chưa kích hoạt gói." href="/admin/payment-issues" tone="support" />
              <AdminQuickActionCard title="AI Usage" body="Theo dõi request, chi phí, blocked quota và provider mix." href="/admin/ai-usage" tone="ai" />
            </View>
          </AdminSectionCard>

          <AdminToneCard
            title="Needs attention"
            subtitle="Không invent số liệu nếu API chưa trả count. Dùng các link dưới đây để kiểm tra thủ công trong staging."
            tone="support"
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
          </AdminToneCard>
        </>
      ) : (
        <AdminStateCard state="empty" />
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
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
