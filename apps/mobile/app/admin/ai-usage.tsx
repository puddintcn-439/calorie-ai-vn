import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
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
    <SurfaceCard style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </SurfaceCard>
  );
}

function UsageList({ title, rows }: { title: string; rows?: Array<{ label: string; count: number; estimated_cost_usd: number }> }) {
  return (
    <SurfaceCard style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!rows || rows.length === 0 ? (
        <Text style={styles.mutedText}>No data yet.</Text>
      ) : rows.map((row) => (
        <View key={`${title}-${row.label}`} style={styles.listRow}>
          <View style={styles.listCopy}>
            <Text style={styles.listLabel}>{row.label}</Text>
            <Text style={styles.mutedText}>{formatNumber(row.count)} requests</Text>
          </View>
          <Text style={styles.listValue}>{formatUsd(row.estimated_cost_usd)}</Text>
        </View>
      ))}
    </SurfaceCard>
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
      const data = await adminService.fetchAiUsage(windowDays);
      setSummary(data);
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
    <ScreenShell scroll scrollContentStyle={styles.scrollContent} reserveBottomNav={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
          <Text style={styles.title}>AI Usage</Text>
          <Text style={styles.subtitle}>Requests, cost, status, top users, top features, provider and model mix.</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={load}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin' as any)}>
          <Text style={styles.navText}>Overview</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/users' as any)}>
          <Text style={styles.navText}>Users</Text>
        </TouchableOpacity>
        {[7, 30, 90].map((days) => (
          <TouchableOpacity key={days} style={[styles.navButton, windowDays === days && styles.navButtonActive]} onPress={() => setWindowDays(days as 7 | 30 | 90)}>
            <Text style={styles.navText}>{days}d</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <SurfaceCard style={styles.centerCard}>
          <ActivityIndicator color={theme.colors.accentMint} />
          <Text style={styles.mutedText}>Loading AI usage...</Text>
        </SurfaceCard>
      ) : error ? (
        <SurfaceCard style={styles.centerCard}>
          <Text style={styles.errorTitle}>{error}</Text>
          <Text style={styles.mutedText}>Your account must be included in ADMIN_EMAILS or BETA_ANALYTICS_ADMIN_EMAILS.</Text>
        </SurfaceCard>
      ) : summary ? (
        <>
          <View style={styles.metricGrid}>
            <MetricCard label="Total requests" value={formatNumber(summary.total_requests)} />
            <MetricCard label="Estimated cost" value={formatUsd(summary.estimated_cost_usd)} />
            <MetricCard label="Success" value={formatNumber(summary.total_success)} />
            <MetricCard label="Fallback" value={formatNumber(summary.total_fallback)} />
            <MetricCard label="Failed" value={formatNumber(summary.total_failed)} />
            <MetricCard label="Blocked" value={formatNumber(summary.total_blocked)} />
          </View>

          <View style={styles.columns}>
            <UsageList title="Top features" rows={summary.top_features} />
            <UsageList title="Top users" rows={summary.top_users} />
            <UsageList title="Provider mix" rows={summary.providers} />
            <UsageList title="Model mix" rows={summary.models} />
          </View>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { gap: 18 },
  header: { gap: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { color: theme.colors.accentCyan, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, maxWidth: 720 },
  refreshButton: { borderRadius: 14, backgroundColor: theme.colors.accentMint, paddingHorizontal: 16, paddingVertical: 10 },
  refreshText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  navRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  navButton: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingVertical: 10 },
  navButtonActive: { backgroundColor: theme.colors.accentMint },
  navText: { color: theme.colors.text, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { minWidth: 170, flexGrow: 1, flexBasis: 170 },
  metricLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  metricValue: { color: theme.colors.text, fontSize: 26, fontWeight: '900', marginTop: 8 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sectionCard: { flexGrow: 1, flexBasis: 280, minWidth: 260 },
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 12 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle },
  listCopy: { flex: 1 },
  listLabel: { color: theme.colors.text, fontWeight: '800' },
  listValue: { color: theme.colors.text, fontWeight: '900' },
  centerCard: { alignItems: 'center', gap: 10 },
  errorTitle: { color: theme.colors.danger, fontSize: 20, fontWeight: '900' },
  mutedText: { color: theme.colors.textMuted },
});
