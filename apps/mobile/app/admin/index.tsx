import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
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

function MetricCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <AdminSectionCard style={adminStyles.metricCard}>
      <Text style={adminStyles.metricLabel}>{label}</Text>
      <Text style={adminStyles.metricValue}>{value}</Text>
      {helper ? <Text style={adminStyles.muted}>{helper}</Text> : null}
    </AdminSectionCard>
  );
}

function QuickAction({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={() => router.push(href as any)}>
      <Text style={styles.quickTitle}>{title}</Text>
      <Text style={adminStyles.muted}>{body}</Text>
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
            <MetricCard label="Active users today" value={formatNumber(overview.active_users_today)} />
            <MetricCard label="Active users 7d" value={formatNumber(overview.active_users_7d)} />
            <MetricCard label="New users 7d" value={formatNumber(overview.new_users_7d)} />
            <MetricCard label="AI requests today" value={formatNumber(overview.ai_requests_today)} />
            <MetricCard label="AI cost today" value={formatUsd(overview.estimated_ai_cost_today_usd)} />
            <MetricCard label="Quota blocked today" value={formatNumber(overview.quota_blocked_today)} />
          </View>

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
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickAction: {
    flexGrow: 1,
    flexBasis: 210,
    minWidth: 200,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceAlt,
    padding: 14,
    gap: 6,
  },
  quickTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '900' },
  quickLink: { color: theme.colors.accentCyan, fontSize: 12, fontWeight: '900', marginTop: 4 },
  attentionList: { gap: 0 },
  attentionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
});
