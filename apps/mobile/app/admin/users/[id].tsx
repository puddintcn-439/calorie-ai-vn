import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '../../../components/i18n-text';
import { theme } from '../../../components/theme';
import {
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  AdminStatusBadge,
  adminStyles,
} from '../../../components/admin/AdminShell';
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
    <View style={adminStyles.keyBox}>
      <Text style={adminStyles.keyLabel}>{label}</Text>
      <Text style={adminStyles.keyValue}>{value ?? '--'}</Text>
    </View>
  );
}

function Row({ left, sub, right }: { left: string; sub?: string; right?: string }) {
  return (
    <View style={adminStyles.row}>
      <View style={adminStyles.rowCopy}>
        <Text style={adminStyles.rowTitle}>{left}</Text>
        {sub ? <Text style={adminStyles.muted}>{sub}</Text> : null}
      </View>
      {right ? <Text style={adminStyles.rowRight}>{right}</Text> : null}
    </View>
  );
}

function hasBillingData(detail: AdminUserDetail) {
  return Boolean(
    detail.billing_entitlement
    || detail.latest_billing_invoice
    || detail.latest_billing_subscription
    || detail.latest_renewal_reminder?.has_reminder,
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
  const isPremium = subscriptionTier !== 'free' && subscriptionStatus !== 'inactive';

  return (
    <AdminShell
      title="User detail"
      subtitle="Support view cho profile, subscription/entitlement, Billing & PayOS, AI usage và recent activity."
      onRefresh={load}
    >
      {loading ? (
        <AdminStateCard state="loading" title="Loading..." />
      ) : error ? (
        <AdminStateCard state="denied" title={error} onRetry={load} showLogin />
      ) : detail ? (
        <View style={styles.content}>
          <AdminSectionCard title="Profile" subtitle="Identity and lifecycle fields used for support lookup.">
            <View style={adminStyles.grid}>
              <KeyValue label="Email" value={detail.profile?.email} />
              <KeyValue label="User ID" value={detail.profile?.id} />
              <KeyValue label="Created" value={date(detail.profile?.created_at)} />
              <KeyValue label="Updated" value={date(detail.profile?.updated_at)} />
            </View>
          </AdminSectionCard>

          <AdminSectionCard title="Subscription / Entitlement" subtitle="App subscription state plus billing entitlement source.">
            <View style={styles.sectionBody}>
              <View style={styles.statusHeader}>
                <View style={adminStyles.rowCopy}>
                  <Text style={adminStyles.rowTitle}>Current access</Text>
                  <Text style={adminStyles.muted}>Backend remains the source of truth for paid access.</Text>
                </View>
                <AdminStatusBadge label={isPremium ? 'Paid active' : 'Free / inactive'} tone={isPremium ? 'success' : 'neutral'} />
              </View>
              <View style={adminStyles.grid}>
                <KeyValue label="Tier" value={detail.subscription?.tier ?? 'free'} />
                <KeyValue label="Status" value={detail.subscription?.status ?? 'unknown'} />
                <KeyValue label="Renews At" value={date(detail.subscription?.renews_at)} />
                <KeyValue label="Updated" value={date(detail.subscription?.updated_at)} />
                <KeyValue label="Entitlement Tier" value={detail.billing_entitlement?.tier} />
                <KeyValue label="Entitlement Source" value={detail.billing_entitlement?.source} />
                <KeyValue label="Entitlement Provider" value={detail.billing_entitlement?.provider} />
                <KeyValue label="Active Until" value={date(detail.billing_entitlement?.active_until)} />
              </View>

              <View style={styles.actionBox}>
                <Text style={styles.actionTitle}>Safe admin actions</Text>
                <Text style={adminStyles.muted}>Existing admin actions are unchanged. Every action requires a reason and writes `admin_audit_log`.</Text>
                <TextInput
                  value={actionReason}
                  onChangeText={setActionReason}
                  placeholder="Reason, e.g. Support quota compensation"
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="sentences"
                  style={adminStyles.input}
                  editable={!actionLoading}
                />
                {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
                {actionSuccess ? <Text style={styles.actionSuccess}>{actionSuccess}</Text> : null}
                <View style={styles.actionRow}>
                  <TouchableOpacity disabled={Boolean(actionLoading)} style={[adminStyles.primaryButton, actionLoading && styles.disabledButton]} onPress={() => runAdminAction('grant')}>
                    <Text style={adminStyles.primaryButtonText}>{actionLoading === 'grant' ? 'Granting...' : 'Grant Premium'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={Boolean(actionLoading)} style={[styles.dangerButton, actionLoading && styles.disabledButton]} onPress={() => runAdminAction('revoke')}>
                    <Text style={adminStyles.dangerText}>{actionLoading === 'revoke' ? 'Revoking...' : 'Revoke Premium'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={Boolean(actionLoading)} style={[styles.quotaButton, actionLoading && styles.disabledButton]} onPress={() => runAdminAction('resetDaily')}>
                    <Text style={styles.quotaText}>{actionLoading === 'resetDaily' ? 'Resetting...' : 'Reset Daily Quota'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={Boolean(actionLoading)} style={[styles.quotaButton, actionLoading && styles.disabledButton]} onPress={() => runAdminAction('resetMonthly')}>
                    <Text style={styles.quotaText}>{actionLoading === 'resetMonthly' ? 'Resetting...' : 'Reset Monthly Quota'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </AdminSectionCard>

          <AdminSectionCard title="Billing & PayOS" subtitle="Latest invoice/subscription, PayOS order code and renewal reminder state.">
            {hasBillingData(detail) ? (
              <View style={styles.sectionBody}>
                <Text style={styles.groupTitle}>Latest invoice</Text>
                {detail.latest_billing_invoice ? (
                  <View style={adminStyles.grid}>
                    <KeyValue label="Provider" value={detail.latest_billing_invoice.provider} />
                    <KeyValue label="Status" value={detail.latest_billing_invoice.status} />
                    <KeyValue label="Amount VND" value={n(detail.latest_billing_invoice.amount_vnd)} />
                    <KeyValue label="Order Code" value={detail.latest_billing_invoice.order_code ?? detail.latest_billing_invoice.provider_invoice_id} />
                    <KeyValue label="Tier" value={detail.latest_billing_invoice.tier} />
                    <KeyValue label="Interval" value={detail.latest_billing_invoice.interval} />
                    <KeyValue label="Paid At" value={date(detail.latest_billing_invoice.paid_at)} />
                    <KeyValue label="Created" value={date(detail.latest_billing_invoice.created_at)} />
                  </View>
                ) : <Text style={adminStyles.muted}>No billing invoice found.</Text>}

                <Text style={styles.groupTitle}>Latest billing subscription</Text>
                {detail.latest_billing_subscription ? (
                  <View style={adminStyles.grid}>
                    <KeyValue label="Provider" value={detail.latest_billing_subscription.provider} />
                    <KeyValue label="Tier" value={detail.latest_billing_subscription.tier} />
                    <KeyValue label="Status" value={detail.latest_billing_subscription.status} />
                    <KeyValue label="Paid" value={detail.latest_billing_subscription.is_paid ? 'Yes' : 'No'} />
                    <KeyValue label="Period End" value={date(detail.latest_billing_subscription.billing_period_end)} />
                    <KeyValue label="Period Start" value={date(detail.latest_billing_subscription.billing_period_start)} />
                    <KeyValue label="Cancelled" value={date(detail.latest_billing_subscription.cancelled_at)} />
                  </View>
                ) : <Text style={adminStyles.muted}>No billing subscription found.</Text>}

                <Text style={styles.groupTitle}>Renewal reminder</Text>
                {detail.latest_renewal_reminder?.has_reminder ? (
                  <View style={styles.reminderBox}>
                    <Text style={adminStyles.rowTitle}>{detail.latest_renewal_reminder.message}</Text>
                    <Text style={adminStyles.muted}>
                      {detail.latest_renewal_reminder.reminder_window ?? '--'} · {n(detail.latest_renewal_reminder.days_remaining)} days remaining
                    </Text>
                  </View>
                ) : <Text style={adminStyles.muted}>No renewal reminder.</Text>}
              </View>
            ) : <Text style={adminStyles.muted}>Chưa có dữ liệu thanh toán.</Text>}
          </AdminSectionCard>

          <AdminSectionCard title="AI usage" subtitle="Quota snapshot and recent AI request history for this user.">
            {quota ? (
              <View style={styles.sectionBody}>
                <View style={adminStyles.grid}>
                  <KeyValue label="Plan" value={quota.plan_tier} />
                  <KeyValue label="Daily credits left" value={`${n(quota.daily_credits_remaining)} / ${n(quota.daily_credit_limit)}`} />
                  <KeyValue label="Monthly credits left" value={`${n(quota.monthly_credits_remaining)} / ${n(quota.monthly_credit_limit)}`} />
                </View>
                {(quota.quotas ?? []).map((item: any) => (
                  <Row key={item.feature} left={item.feature_label ?? item.feature} sub={`${item.credits_per_request ?? 1} credit/request · ${usd(item.estimated_cost_usd)}`} right={`${n(item.daily_remaining)} / ${n(item.daily_limit)} today`} />
                ))}
                {(detail.recent_ai_usage ?? []).length === 0 ? <Text style={adminStyles.muted}>No recent AI usage.</Text> : detail.recent_ai_usage.map((row: any) => (
                  <Row key={row.id ?? `${row.feature}-${row.created_at}`} left={`${row.feature ?? 'AI request'} · ${row.status ?? '--'}`} sub={`${row.provider ?? '--'} / ${row.model ?? '--'} · ${date(row.created_at)}`} right={`${usd(row.estimated_cost_usd)} · ${n(row.credits_consumed ?? 1)} cr`} />
                ))}
              </View>
            ) : <Text style={adminStyles.muted}>No quota data available.</Text>}
          </AdminSectionCard>

          <AdminSectionCard title="Recent activity" subtitle="Recent food logs and telemetry used for support context only.">
            <View style={styles.sectionBody}>
              <Text style={styles.groupTitle}>Food logs</Text>
              {(detail.recent_food_logs ?? []).length === 0 ? <Text style={adminStyles.muted}>No recent food logs.</Text> : detail.recent_food_logs.map((row: any) => (
                <Row key={row.id ?? `${row.food_name}-${row.created_at}`} left={row.food_name ?? row.name ?? 'Food log'} sub={`${row.meal_type ?? '--'} · ${date(row.created_at)}`} right={`${n(row.calories)} kcal`} />
              ))}
              <Text style={styles.groupTitle}>Telemetry</Text>
              {(detail.recent_telemetry ?? []).length === 0 ? <Text style={adminStyles.muted}>No recent telemetry.</Text> : detail.recent_telemetry.map((row: any) => (
                <Row key={row.id ?? `${row.event_type}-${row.created_at}`} left={row.event_name ?? row.event_type ?? 'Event'} sub={`${row.event_type ?? '--'} · ${date(row.created_at)}`} />
              ))}
            </View>
          </AdminSectionCard>
        </View>
      ) : (
        <AdminStateCard state="empty" />
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  sectionBody: { gap: 12 },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  groupTitle: { color: theme.colors.textSoft, fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
  reminderBox: { gap: 4, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderWarning, backgroundColor: theme.colors.surfaceWarning, padding: 12 },
  actionBox: { gap: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surfaceAlt, padding: 14 },
  actionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '900' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dangerButton: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.danger, paddingHorizontal: 16, paddingVertical: 11 },
  quotaButton: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.accentCyan, paddingHorizontal: 16, paddingVertical: 11 },
  quotaText: { color: theme.colors.accentCyan, fontWeight: '900' },
  disabledButton: { opacity: 0.55 },
  actionError: { color: theme.colors.danger, fontSize: 12, fontWeight: '800' },
  actionSuccess: { color: theme.colors.accentMint, fontSize: 12, fontWeight: '800' },
});
