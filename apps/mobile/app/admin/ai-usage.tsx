import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/i18n-text';
import {
  AdminMetricCard,
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  AdminToneCard,
  adminChrome,
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

function toNumber(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function StatusBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 && value > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusHeader}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusValue}>{formatNumber(value)}</Text>
      </View>
      <View style={styles.track}>{width > 0 ? <View style={[styles.bar, { width: `${width}%`, backgroundColor: color }]} /> : null}</View>
    </View>
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
            <AdminMetricCard label="Total requests" value={formatNumber(summary.total_requests)} helper={`${windowDays}d window`} tone="ai" />
            <AdminMetricCard label="Estimated cost" value={formatUsd(summary.estimated_cost_usd)} helper="Provider spend estimate" tone="warning" />
            <AdminMetricCard label="Reserved" value={formatNumber(summary.total_reserved)} helper="Reserved but not finalized" tone={toNumber(summary.total_reserved) > 0 ? 'warning' : 'neutral'} />
            <AdminMetricCard label="Success" value={formatNumber(summary.total_success)} helper="Completed calls" tone="success" />
            <AdminMetricCard label="Fallback" value={formatNumber(summary.total_fallback)} helper="Fallback path used" tone="warning" />
            <AdminMetricCard label="Failed" value={formatNumber(summary.total_failed)} helper="Provider/app failures" tone={toNumber(summary.total_failed) > 0 ? 'danger' : 'neutral'} />
            <AdminMetricCard label="Blocked" value={formatNumber(summary.total_blocked)} helper="Quota guardrail blocks" tone={toNumber(summary.total_blocked) > 0 ? 'danger' : 'neutral'} />
          </View>

          <AdminToneCard title="Status mix" subtitle="Production signal for success, fallback, failed, and blocked requests." tone="ai">
            <View style={styles.statusGrid}>
              <StatusBar label="Reserved" value={toNumber(summary.total_reserved)} max={Math.max(toNumber(summary.total_reserved), toNumber(summary.total_success), toNumber(summary.total_fallback), toNumber(summary.total_failed), toNumber(summary.total_blocked))} color={adminChrome.amber} />
              <StatusBar label="Success" value={toNumber(summary.total_success)} max={Math.max(toNumber(summary.total_reserved), toNumber(summary.total_success), toNumber(summary.total_fallback), toNumber(summary.total_failed), toNumber(summary.total_blocked))} color={adminChrome.mint} />
              <StatusBar label="Fallback" value={toNumber(summary.total_fallback)} max={Math.max(toNumber(summary.total_reserved), toNumber(summary.total_success), toNumber(summary.total_fallback), toNumber(summary.total_failed), toNumber(summary.total_blocked))} color={adminChrome.blue} />
              <StatusBar label="Failed" value={toNumber(summary.total_failed)} max={Math.max(toNumber(summary.total_reserved), toNumber(summary.total_success), toNumber(summary.total_fallback), toNumber(summary.total_failed), toNumber(summary.total_blocked))} color={adminChrome.rose} />
              <StatusBar label="Blocked" value={toNumber(summary.total_blocked)} max={Math.max(toNumber(summary.total_reserved), toNumber(summary.total_success), toNumber(summary.total_fallback), toNumber(summary.total_failed), toNumber(summary.total_blocked))} color={adminChrome.purple} />
            </View>
          </AdminToneCard>

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
  windowButton: { borderRadius: 999, borderWidth: 1, borderColor: adminChrome.borderStrong, backgroundColor: adminChrome.cardBg, paddingHorizontal: 12, paddingVertical: 10 },
  windowButtonActive: { backgroundColor: adminChrome.accentSoft, borderColor: adminChrome.accent },
  windowText: { color: adminChrome.textSoft, fontWeight: '900' },
  windowTextActive: { color: adminChrome.accent },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sectionCard: { flexGrow: 1, flexBasis: 420, minWidth: 320 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  statusRow: { flexGrow: 1, flexBasis: 250, minWidth: 220, gap: 7 },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  statusLabel: { color: adminChrome.textSoft, fontSize: 13, fontWeight: '800' },
  statusValue: { color: adminChrome.text, fontSize: 13, fontWeight: '900', textAlign: 'right', minWidth: 44 },
  track: { height: 11, borderRadius: 999, backgroundColor: '#eef2f7', overflow: 'hidden', borderWidth: 1, borderColor: adminChrome.border },
  bar: { height: '100%', borderRadius: 999 },
});
