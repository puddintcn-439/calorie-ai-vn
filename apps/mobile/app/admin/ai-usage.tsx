import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
import {
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  adminStyles,
} from '../../components/admin/AdminShell';
import { adminService } from '../../services/admin.service';

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
  if (status === 403) return 'Admin access required';
  if (status === 401) return 'Please sign in again to view admin tools.';
  return 'Could not load AI usage right now.';
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <AdminSectionCard style={adminStyles.metricCard}>
      <Text style={adminStyles.metricLabel}>{label}</Text>
      <Text style={adminStyles.metricValue}>{value}</Text>
    </AdminSectionCard>
  );
}

function UsageList({ title, subtitle, rows }: { title: string; subtitle: string; rows?: Array<{ label: string; count: number; estimated_cost_usd: number }> }) {
  return (
    <AdminSectionCard title={title} subtitle={subtitle} style={styles.sectionCard}>
      {!rows || rows.length === 0 ? (
        <Text style={adminStyles.muted}>No data</Text>
      ) : rows.map((row) => (
        <View key={`${title}-${row.label}`} style={adminStyles.row}>
          <View style={adminStyles.rowCopy}>
            <Text style={adminStyles.rowTitle}>{row.label}</Text>
            <Text style={adminStyles.muted}>{formatNumber(row.count)} requests</Text>
          </View>
          <Text style={adminStyles.rowRight}>{formatUsd(row.estimated_cost_usd)}</Text>
        </View>
      ))}
    </AdminSectionCard>
  );
}

export default function AdminAiUsageScreen() {
  const [summary, setSummary] = useState<any | null>(null);
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSummary(await adminService.fetchAiUsage(windowDays));
    } catch (err: any) {
      setSummary(null);
      setError(getAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <AdminShell
      title="AI Usage"
      subtitle="Theo dõi request, chi phí, trạng thái fallback/failed/blocked và phân bổ theo feature, user, provider, model."
      onRefresh={load}
      actions={
        <View style={styles.windowRow}>
          {[7, 30, 90].map((days) => (
            <TouchableOpacity key={days} style={[styles.windowButton, windowDays === days && styles.windowButtonActive]} onPress={() => setWindowDays(days as 7 | 30 | 90)}>
              <Text style={[styles.windowText, windowDays === days && styles.windowTextActive]}>{days}d</Text>
            </TouchableOpacity>
          ))}
        </View>
      }
    >
      {loading ? (
        <AdminStateCard state="loading" title="Loading..." />
      ) : error ? (
        <AdminStateCard state="denied" title={error} onRetry={load} showLogin />
      ) : summary ? (
        <>
          <View style={adminStyles.metricGrid}>
            <MetricCard label="Total requests" value={formatNumber(summary.total_requests)} />
            <MetricCard label="Estimated cost" value={formatUsd(summary.estimated_cost_usd)} />
            <MetricCard label="Success" value={formatNumber(summary.total_success)} />
            <MetricCard label="Fallback" value={formatNumber(summary.total_fallback)} />
            <MetricCard label="Failed" value={formatNumber(summary.total_failed)} />
            <MetricCard label="Blocked" value={formatNumber(summary.total_blocked)} />
          </View>

          <View style={styles.columns}>
            <UsageList title="Top features" subtitle="Feature nào đang tạo nhiều request/cost nhất." rows={summary.top_features} />
            <UsageList title="Top users" subtitle="User cần kiểm tra nếu usage tăng bất thường." rows={summary.top_users} />
            <UsageList title="Provider mix" subtitle="Phân bổ theo provider để quan sát fallback." rows={summary.providers} />
            <UsageList title="Model mix" subtitle="Chi phí theo model đang được gọi." rows={summary.models} />
          </View>
        </>
      ) : (
        <AdminStateCard state="empty" />
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  windowRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  windowButton: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 10 },
  windowButtonActive: { backgroundColor: theme.colors.accentMint, borderColor: theme.colors.accentMint },
  windowText: { color: theme.colors.text, fontWeight: '900' },
  windowTextActive: { color: theme.colors.textOnAccent },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sectionCard: { flexGrow: 1, flexBasis: 280, minWidth: 260 },
});
