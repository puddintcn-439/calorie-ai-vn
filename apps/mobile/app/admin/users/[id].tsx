import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../../components/ui-shell';
import { Text } from '../../../components/i18n-text';
import { theme } from '../../../components/theme';
import { adminService, type AdminUserDetail } from '../../../services/admin.service';

function n(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '--';
}

function usd(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(4)}` : '--';
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
  if (status === 404) return 'User not found';
  return error?.response?.data?.message ?? 'Could not load user detail.';
}

function KeyValue({ label, value }: { label: string; value: any }) {
  return (
    <View style={styles.keyBox}>
      <Text style={styles.keyLabel}>{label}</Text>
      <Text style={styles.keyValue}>{value ?? '--'}</Text>
    </View>
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

function Row({ left, sub, right }: { left: string; sub?: string; right?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{left}</Text>
        {sub ? <Text style={styles.muted}>{sub}</Text> : null}
      </View>
      {right ? <Text style={styles.rowRight}>{right}</Text> : null}
    </View>
  );
}

type AdminAction = 'grant' | 'revoke' | 'resetDaily' | 'resetMonthly';

export default function AdminUserDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const userId = useMemo(() => Array.isArray(params.id) ? params.id[0] : params.id, [params.id]);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState<AdminAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setError('Missing user id');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setDetail(await adminService.fetchUserDetail(userId));
    } catch (err: any) {
      setDetail(null);
      setError(adminError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const runAdminAction = useCallback(async (action: AdminAction) => {
    if (!userId) return;
    const reason = actionReason.trim();
    if (reason.length < 5) {
      setActionError('Reason must be at least 5 characters.');
      return;
    }
    try {
      setActionLoading(action);
      setActionError(null);
      setActionSuccess(null);
      if (action === 'grant') {
        await adminService.grantPremium(userId, reason);
        setActionSuccess('Premium granted and audit log written.');
      } else if (action === 'revoke') {
        await adminService.revokePremium(userId, reason);
        setActionSuccess('Premium revoked and audit log written.');
      } else if (action === 'resetDaily') {
        const result = await adminService.resetAiQuota(userId, reason, 'daily');
        setActionSuccess(`Daily AI quota reset. +${n(result.credits_delta)} credits until ${date(result.expires_at)}.`);
      } else {
        const result = await adminService.resetAiQuota(userId, reason, 'monthly');
        setActionSuccess(`Monthly AI quota reset. +${n(result.credits_delta)} credits until ${date(result.expires_at)}.`);
      }
      setActionReason('');
      await load();
    } catch (err: any) {
      setActionError(adminError(err));
    } finally {
      setActionLoading(null);
    }
  }, [actionReason, load, userId]);

  const quota: any = detail?.ai_quota ?? null;
  const subscriptionTier = String(detail?.subscription?.tier ?? 'free');
  const subscriptionStatus = String(detail?.subscription?.status ?? 'unknown');
  const isPremium = subscriptionTier === 'premium' && subscriptionStatus !== 'inactive';

  return (
    <ScreenShell scroll scrollContentStyle={styles.scrollContent} reserveBottomNav={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
          <Text style={styles.title}>User Detail</Text>
          <Text style={styles.subtitle}>Support view for subscription, AI quota, food logs, AI usage, telemetry, and audited safe actions.</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={load}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/users' as any)}><Text style={styles.navText}>Users</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin' as any)}><Text style={styles.navText}>Overview</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/ai-usage' as any)}><Text style={styles.navText}>AI Usage</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/audit-log' as any)}><Text style={styles.navText}>Audit Log</Text></TouchableOpacity>
      </View>

      {loading ? (
        <SurfaceCard style={styles.centerCard}>
          <ActivityIndicator color={theme.colors.accentMint} />
          <Text style={styles.muted}>Loading user detail...</Text>
        </SurfaceCard>
      ) : error ? (
        <SurfaceCard style={styles.centerCard}>
          <Text style={styles.errorTitle}>{error}</Text>
          <Text style={styles.muted}>This page is restricted to configured admin accounts.</Text>
        </SurfaceCard>
      ) : detail ? (
        <View style={styles.content}>
          <Section title="Profile">
            <View style={styles.grid}>
              <KeyValue label="Email" value={detail.profile?.email} />
              <KeyValue label="User ID" value={detail.profile?.id} />
              <KeyValue label="Created" value={date(detail.profile?.created_at)} />
              <KeyValue label="Updated" value={date(detail.profile?.updated_at)} />
            </View>
          </Section>

          <Section title="Subscription">
            <View style={styles.grid}>
              <KeyValue label="Tier" value={detail.subscription?.tier ?? 'free'} />
              <KeyValue label="Status" value={detail.subscription?.status ?? 'unknown'} />
              <KeyValue label="Renews At" value={date(detail.subscription?.renews_at)} />
              <KeyValue label="Updated" value={date(detail.subscription?.updated_at)} />
            </View>
            <View style={styles.actionBox}>
              <View style={styles.actionHeader}>
                <View style={styles.rowCopy}>
                  <Text style={styles.actionTitle}>Safe Admin Actions</Text>
                  <Text style={styles.muted}>Admin/Owner only. Every action requires a reason and writes admin_audit_log.</Text>
                </View>
                <View style={[styles.statusPill, isPremium ? styles.statusPillPremium : styles.statusPillFree]}>
                  <Text style={styles.statusPillText}>{isPremium ? 'Premium Active' : 'Free / Inactive'}</Text>
                </View>
              </View>
              <TextInput
                value={actionReason}
                onChangeText={setActionReason}
                placeholder="Reason, e.g. Support quota compensation"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="sentences"
                style={styles.reasonInput}
                editable={!actionLoading}
              />
              {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
              {actionSuccess ? <Text style={styles.actionSuccess}>{actionSuccess}</Text> : null}
              <View style={styles.actionRow}>
                <TouchableOpacity disabled={Boolean(actionLoading)} style={[styles.primaryActionButton, actionLoading && styles.disabledButton]} onPress={() => runAdminAction('grant')}>
                  <Text style={styles.primaryActionText}>{actionLoading === 'grant' ? 'Granting...' : 'Grant Premium'}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={Boolean(actionLoading)} style={[styles.dangerActionButton, actionLoading && styles.disabledButton]} onPress={() => runAdminAction('revoke')}>
                  <Text style={styles.dangerActionText}>{actionLoading === 'revoke' ? 'Revoking...' : 'Revoke Premium'}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={Boolean(actionLoading)} style={[styles.quotaActionButton, actionLoading && styles.disabledButton]} onPress={() => runAdminAction('resetDaily')}>
                  <Text style={styles.quotaActionText}>{actionLoading === 'resetDaily' ? 'Resetting...' : 'Reset Daily Quota'}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={Boolean(actionLoading)} style={[styles.quotaActionButton, actionLoading && styles.disabledButton]} onPress={() => runAdminAction('resetMonthly')}>
                  <Text style={styles.quotaActionText}>{actionLoading === 'resetMonthly' ? 'Resetting...' : 'Reset Monthly Quota'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Section>

          <Section title="AI Quota & Credits">
            {quota ? (
              <View style={styles.sectionBody}>
                <View style={styles.grid}>
                  <KeyValue label="Plan" value={quota.plan_tier} />
                  <KeyValue label="Daily credits left" value={`${n(quota.daily_credits_remaining)} / ${n(quota.daily_credit_limit)}`} />
                  <KeyValue label="Monthly credits left" value={`${n(quota.monthly_credits_remaining)} / ${n(quota.monthly_credit_limit)}`} />
                </View>
                {(quota.quotas ?? []).map((item: any) => (
                  <Row key={item.feature} left={item.feature_label ?? item.feature} sub={`${item.credits_per_request ?? 1} credit/request · ${usd(item.estimated_cost_usd)}`} right={`${n(item.daily_remaining)} / ${n(item.daily_limit)} today`} />
                ))}
              </View>
            ) : <Text style={styles.muted}>No quota data available.</Text>}
          </Section>

          <Section title="Recent Food Logs">
            {(detail.recent_food_logs ?? []).length === 0 ? <Text style={styles.muted}>No recent food logs.</Text> : detail.recent_food_logs.map((row: any) => (
              <Row key={row.id ?? `${row.food_name}-${row.created_at}`} left={row.food_name ?? row.name ?? 'Food log'} sub={`${row.meal_type ?? '--'} · ${date(row.created_at)}`} right={`${n(row.calories)} kcal`} />
            ))}
          </Section>

          <Section title="Recent AI Usage">
            {(detail.recent_ai_usage ?? []).length === 0 ? <Text style={styles.muted}>No recent AI usage.</Text> : detail.recent_ai_usage.map((row: any) => (
              <Row key={row.id ?? `${row.feature}-${row.created_at}`} left={`${row.feature ?? 'AI request'} · ${row.status ?? '--'}`} sub={`${row.provider ?? '--'} / ${row.model ?? '--'} · ${date(row.created_at)}`} right={`${usd(row.estimated_cost_usd)} · ${n(row.credits_consumed ?? 1)} cr`} />
            ))}
          </Section>

          <Section title="Recent Telemetry">
            {(detail.recent_telemetry ?? []).length === 0 ? <Text style={styles.muted}>No recent telemetry.</Text> : detail.recent_telemetry.map((row: any) => (
              <Row key={row.id ?? `${row.event_type}-${row.created_at}`} left={row.event_name ?? row.event_type ?? 'Event'} sub={`${row.event_type ?? '--'} · ${date(row.created_at)}`} />
            ))}
          </Section>
        </View>
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
  navText: { color: theme.colors.text, fontWeight: '800' },
  content: { gap: 14 },
  section: { gap: 12 },
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900' },
  sectionBody: { gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  keyBox: { minWidth: 180, flexGrow: 1, borderRadius: 14, backgroundColor: theme.colors.surfaceAlt, padding: 12 },
  keyLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  keyValue: { color: theme.colors.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle },
  rowCopy: { flex: 1 },
  rowTitle: { color: theme.colors.text, fontWeight: '900' },
  rowRight: { color: theme.colors.text, fontWeight: '900', textAlign: 'right' },
  actionBox: { gap: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surfaceAlt, padding: 14 },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  actionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '900' },
  reasonInput: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSubtle, color: theme.colors.text, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: theme.colors.surface },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primaryActionButton: { borderRadius: 14, backgroundColor: theme.colors.accentMint, paddingHorizontal: 16, paddingVertical: 11 },
  primaryActionText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  dangerActionButton: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.danger, paddingHorizontal: 16, paddingVertical: 11 },
  dangerActionText: { color: theme.colors.danger, fontWeight: '900' },
  quotaActionButton: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.accentCyan, paddingHorizontal: 16, paddingVertical: 11 },
  quotaActionText: { color: theme.colors.accentCyan, fontWeight: '900' },
  disabledButton: { opacity: 0.55 },
  actionError: { color: theme.colors.danger, fontSize: 12, fontWeight: '800' },
  actionSuccess: { color: theme.colors.accentMint, fontSize: 12, fontWeight: '800' },
  statusPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  statusPillPremium: { backgroundColor: theme.colors.accentMint },
  statusPillFree: { backgroundColor: theme.colors.surface },
  statusPillText: { color: theme.colors.textOnAccent, fontSize: 11, fontWeight: '900' },
  centerCard: { alignItems: 'center', gap: 10 },
  errorTitle: { color: theme.colors.danger, fontSize: 20, fontWeight: '900' },
  muted: { color: theme.colors.textMuted, fontSize: 12 },
});
