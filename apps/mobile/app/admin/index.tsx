import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
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
  if (status === 403) return 'Admin access required';
  if (status === 401) return 'Please sign in again to view admin tools.';
  return 'Could not load admin overview right now.';
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceCard style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </SurfaceCard>
  );
}

export default function AdminOverviewScreen() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await adminService.fetchOverview();
      setOverview(data);
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
    <ScreenShell scroll scrollContentStyle={styles.scrollContent} reserveBottomNav={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
          <Text style={styles.title}>Production Overview</Text>
          <Text style={styles.subtitle}>Read-only monitoring for users, AI cost, quota, credits, and product health.</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={load}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/users' as any)}>
          <Text style={styles.navText}>Users</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/ai-usage' as any)}>
          <Text style={styles.navText}>AI Usage</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <SurfaceCard style={styles.centerCard}>
          <ActivityIndicator color={theme.colors.accentMint} />
          <Text style={styles.mutedText}>Loading admin overview...</Text>
        </SurfaceCard>
      ) : error ? (
        <SurfaceCard style={styles.centerCard}>
          <Text style={styles.errorTitle}>{error}</Text>
          <Text style={styles.mutedText}>Your account must be included in ADMIN_EMAILS or BETA_ANALYTICS_ADMIN_EMAILS.</Text>
        </SurfaceCard>
      ) : overview ? (
        <View style={styles.metricGrid}>
          <MetricCard label="Active users today" value={formatNumber(overview.active_users_today)} />
          <MetricCard label="Active users 7d" value={formatNumber(overview.active_users_7d)} />
          <MetricCard label="New users today" value={formatNumber(overview.new_users_today)} />
          <MetricCard label="New users 7d" value={formatNumber(overview.new_users_7d)} />
          <MetricCard label="Food logs today" value={formatNumber(overview.food_logs_today)} />
          <MetricCard label="AI requests today" value={formatNumber(overview.ai_requests_today)} />
          <MetricCard label="AI cost today" value={formatUsd(overview.estimated_ai_cost_today_usd)} />
          <MetricCard label="AI credits today" value={formatNumber(overview.ai_credits_used_today)} />
          <MetricCard label="Quota blocked today" value={formatNumber(overview.quota_blocked_today)} />
          <MetricCard label="Failed AI today" value={formatNumber(overview.failed_ai_requests_today)} />
        </View>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 18,
  },
  header: {
    gap: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eyebrow: {
    color: theme.colors.accentCyan,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 720,
  },
  refreshButton: {
    borderRadius: 14,
    backgroundColor: theme.colors.accentMint,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  refreshText: {
    color: theme.colors.textOnAccent,
    fontWeight: '900',
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  navButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  navText: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    minWidth: 170,
    flexGrow: 1,
    flexBasis: 170,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 8,
  },
  centerCard: {
    alignItems: 'center',
    gap: 10,
  },
  errorTitle: {
    color: theme.colors.danger,
    fontSize: 20,
    fontWeight: '900',
  },
  mutedText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
