import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import type { AiUsageSummary, BetaAnalyticsSummary } from '@calorie-ai/types';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { Text } from '../../components/i18n-text';
import { createThemedStyles, useAppTheme } from '../../components/theme';
import { telemetryService } from '../../services/telemetry.service';

function formatNumber(value: number | null | undefined, suffix = '') {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric}${suffix}` : `--${suffix}`;
}

function formatCurrencyUsd(value: number | null | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return `$${numeric.toFixed(2)}`;
}

function formatName(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusTone(status: string) {
  if (status === 'ready' || status === 'low' || status === 'calibrated') return styles.goodPill;
  if (status === 'learning' || status === 'medium') return styles.warnPill;
  return styles.badPill;
}

export default function BetaAnalyticsScreen() {
  const { colors } = useAppTheme();
  const [summary, setSummary] = useState<BetaAnalyticsSummary | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);
  const [aiUsageWindowDays, setAiUsageWindowDays] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [aiUsageLoading, setAiUsageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiUsageError, setAiUsageError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const betaData = await telemetryService.fetchBetaAnalytics(30);
      setSummary(betaData);
    } catch (err: any) {
      const status = Number(err?.response?.status ?? 0);
      setSummary(null);
      setError(status === 403
        ? 'Beta Analytics is restricted. Add your email to BETA_ANALYTICS_ADMIN_EMAILS or ADMIN_EMAILS.'
        : 'Could not load beta analytics right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAiUsage = useCallback(async () => {
    try {
      setAiUsageLoading(true);
      setAiUsageError(null);
      const aiUsageData = await telemetryService.fetchAiUsageSummary(aiUsageWindowDays);
      setAiUsage(aiUsageData);
    } catch (err: any) {
      const status = Number(err?.response?.status ?? 0);
      setAiUsage(null);
      setAiUsageError(status === 403
        ? 'AI usage summary is restricted for your account.'
        : 'Could not load AI usage summary right now.');
    } finally {
      setAiUsageLoading(false);
    }
  }, [aiUsageWindowDays]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    loadAiUsage().catch(() => {});
  }, [loadAiUsage]);

  const refresh = async () => {
    setLoading(true);
    await Promise.all([load(), loadAiUsage()]);
  };

  return (
    <ScreenShell
      scroll
      scrollContentStyle={styles.scrollContent}
      reserveBottomNav={false}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>PM ANALYTICS</Text>
          <Text style={styles.title}>Beta Measurement</Text>
          <Text style={styles.subtitle}>
            Aggregate health-coach metrics for forecast accuracy, interventions, reminder fatigue, and engagement.
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <SurfaceCard style={styles.centerCard}>
          <ActivityIndicator color={colors.accentMint} />
          <Text style={styles.mutedText}>Loading analytics...</Text>
        </SurfaceCard>
      ) : error ? (
        <SurfaceCard style={styles.centerCard}>
          <Text style={styles.errorTitle}>Locked</Text>
          <Text style={styles.mutedText}>{error}</Text>
        </SurfaceCard>
      ) : summary ? (
        <View style={styles.content}>
          <View style={styles.metricGrid}>
            <MetricCard label="Forecast accuracy" value={formatNumber(summary.forecast.classification_accuracy, '%')} detail={`${summary.forecast.snapshots}/100 outcomes`} status={summary.forecast.sample_status} />
            <MetricCard label="Avg forecast error" value={formatNumber(summary.forecast.avg_absolute_error)} detail="lower is better" status={summary.forecast.avg_absolute_error > 20 ? 'high' : 'low'} />
            <MetricCard label="Calibration error" value={formatNumber(summary.calibration.avg_calibration_error)} detail={`${summary.calibration.total_samples}/100 calibration samples`} status={summary.calibration.status} />
            <MetricCard label="Intervention action" value={formatNumber(summary.interventions.action_rate, '%')} detail={`${summary.interventions.total_shown} shown`} status={summary.interventions.ready_count > 0 ? 'ready' : 'learning'} />
            <MetricCard label="Reminder fatigue" value={summary.reminders.fatigue_level.toUpperCase()} detail={`${summary.reminders.fatigue_weeks} flagged weeks`} status={summary.reminders.fatigue_level} />
          </View>

          <SurfaceCard style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Forecast calibration</Text>
              <Text style={styles.sectionMeta}>{summary.calibration.status}</Text>
            </View>
            {summary.calibration.buckets.length > 0 ? summary.calibration.buckets.map((bucket) => (
              <CalibrationRow key={bucket.forecast_bucket} bucket={bucket} />
            )) : <Text style={styles.mutedText}>No completed forecast outcomes yet.</Text>}
          </SurfaceCard>

          <SurfaceCard style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top effective interventions</Text>
              <Text style={styles.sectionMeta}>{summary.interventions.ready_count} ready</Text>
            </View>
            {summary.interventions.top_effective.length > 0 ? summary.interventions.top_effective.map((item) => (
              <InterventionRow key={`${item.intervention_type}-${item.mode}-good`} item={item} mode="good" />
            )) : <Text style={styles.mutedText}>No intervention events yet.</Text>}
          </SurfaceCard>

          <SurfaceCard style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Most ignored interventions</Text>
              <Text style={styles.sectionMeta}>{summary.interventions.dismiss_rate}% dismissed</Text>
            </View>
            {summary.interventions.top_ignored.length > 0 ? summary.interventions.top_ignored.map((item) => (
              <InterventionRow key={`${item.intervention_type}-${item.mode}-ignored`} item={item} mode="ignored" />
            )) : <Text style={styles.mutedText}>No dismissed interventions yet.</Text>}
          </SurfaceCard>

          <SurfaceCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Recent engagement</Text>
            <View style={styles.dailyRows}>
              {summary.engagement.recent_daily.slice(0, 7).map((day) => (
                <View key={day.local_date} style={styles.dailyRow}>
                  <Text style={styles.dailyDate}>{day.local_date}</Text>
                  <Text style={styles.dailyMetric}>{day.active_users} active</Text>
                  <Text style={styles.dailyMetric}>{day.food_logs} logs</Text>
                  <Text style={styles.dailyMetric}>{day.interventions_acted}/{day.interventions_shown} acted</Text>
                </View>
              ))}
            </View>
          </SurfaceCard>

          <SurfaceCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            {summary.recommendations.length > 0 ? summary.recommendations.map((item) => (
              <Text key={item} style={styles.recommendation}>- {item}</Text>
            )) : <Text style={styles.mutedText}>No warnings. Keep collecting data.</Text>}
          </SurfaceCard>

          <SurfaceCard style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>AI Usage Ledger</Text>
              <View style={styles.sectionHeaderActions}>
                <Text style={styles.sectionMeta}>
                  {aiUsage ? `${aiUsage.total_requests} requests / ${aiUsage.window_days}d` : `${aiUsageWindowDays}d window`}
                </Text>
                <View style={styles.usageWindowPicker}>
                  {[7, 30, 90].map((days) => {
                    const selected = aiUsageWindowDays === days;
                    return (
                      <TouchableOpacity
                        key={`ai-window-${days}`}
                        style={[styles.usageWindowButton, selected && styles.usageWindowButtonActive]}
                        onPress={() => setAiUsageWindowDays(days as 7 | 30 | 90)}
                      >
                        <Text style={[styles.usageWindowLabel, selected && styles.usageWindowLabelActive]}>{days}d</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {aiUsageLoading ? (
              <View style={styles.aiUsageLoader}>
                <ActivityIndicator color={colors.accentMint} />
                <Text style={styles.mutedText}>Loading AI usage...</Text>
              </View>
            ) : aiUsageError ? (
              <Text style={styles.mutedText}>{aiUsageError}</Text>
            ) : aiUsage ? (
              <>
                <View style={styles.metricGrid}>
                  <MetricCard
                    label="AI Requests"
                    value={formatNumber(aiUsage.total_requests)}
                    detail={`Success ${formatNumber(aiUsage.total_success)} / Blocked ${formatNumber(aiUsage.total_blocked)}`}
                    status={aiUsage.total_blocked > 0 ? 'learning' : 'ready'}
                  />
                  <MetricCard
                    label="Estimated cost"
                    value={formatCurrencyUsd(aiUsage.estimated_cost_usd)}
                    detail={`Fallback ${formatNumber(aiUsage.total_fallback)} / Failed ${formatNumber(aiUsage.total_failed)}`}
                    status={aiUsage.total_failed > aiUsage.total_success ? 'learning' : 'ready'}
                  />
                </View>

                <UsageList title="Top AI features" items={aiUsage.top_features} />
                <UsageList title="Top users" items={aiUsage.top_users} />
                <UsageList title="Provider mix" items={aiUsage.providers} />
                <UsageList title="Model mix" items={aiUsage.models} />
              </>
            ) : (
              <Text style={styles.mutedText}>No AI usage data yet.</Text>
            )}
          </SurfaceCard>
        </View>
      ) : null}
    </ScreenShell>
  );
}

function MetricCard({ label, value, detail, status }: { label: string; value: string; detail: string; status: string }) {
  return (
    <SurfaceCard style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <View style={[styles.statusPill, statusTone(status)]}>
        <Text style={styles.statusText}>{status}</Text>
      </View>
      <Text style={styles.metricDetail}>{detail}</Text>
    </SurfaceCard>
  );
}

function InterventionRow({ item, mode }: { item: BetaAnalyticsSummary['interventions']['top_effective'][number]; mode: 'good' | 'ignored' }) {
  return (
    <View style={styles.interventionRow}>
      <View style={styles.interventionCopy}>
        <Text style={styles.interventionName}>{formatName(item.intervention_type)}</Text>
        <Text style={styles.interventionDetail}>{item.mode} / {item.primary_action} / {item.sample_status}</Text>
      </View>
      <View style={styles.interventionStats}>
        <Text style={[styles.interventionRate, mode === 'ignored' && styles.interventionRateWarn]}>
          {mode === 'ignored' ? item.dismiss_rate : item.action_rate}%
        </Text>
        <Text style={styles.interventionShown}>{item.shown} shown</Text>
      </View>
    </View>
  );
}

function CalibrationRow({ bucket }: { bucket: BetaAnalyticsSummary['calibration']['buckets'][number] }) {
  return (
    <View style={styles.calibrationRow}>
      <View style={styles.calibrationCopy}>
        <Text style={styles.calibrationBucket}>{bucket.forecast_bucket}% forecast</Text>
        <Text style={styles.interventionDetail}>{bucket.samples} samples / {bucket.confidence_level} confidence</Text>
      </View>
      <View style={styles.calibrationStats}>
        <Text style={styles.calibrationRate}>Actual {bucket.actual_success_rate}%</Text>
        <Text style={styles.calibrationError}>Error {bucket.calibration_error} / {bucket.calibration_status}</Text>
      </View>
    </View>
  );
}

function UsageList({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; count: number; estimated_cost_usd: number }>;
}) {
  return (
    <View style={styles.usageSection}>
      <Text style={styles.usageTitle}>{title}</Text>
      {items.length > 0 ? items.slice(0, 5).map((item) => (
        <View key={`${title}-${item.label}`} style={styles.usageRow}>
          <Text style={styles.usageLabel}>{item.label}</Text>
          <View style={styles.usageValueWrap}>
            <Text style={styles.usageCount}>{item.count}</Text>
            <Text style={styles.usageCost}>{formatCurrencyUsd(item.estimated_cost_usd)}</Text>
          </View>
        </View>
      )) : <Text style={styles.mutedText}>No data yet.</Text>}
    </View>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  scrollContent: {
    rowGap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: colors.accentCyan,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  refreshButton: {
    minHeight: 38,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: {
    color: colors.info,
    fontSize: 12,
    fontWeight: '900',
  },
  centerCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 180,
  },
  content: {
    gap: 12,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 156,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  metricDetail: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.lg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 8,
  },
  goodPill: {
    backgroundColor: colors.surfaceSuccess,
  },
  warnPill: {
    backgroundColor: colors.surfaceWarning,
  },
  badPill: {
    backgroundColor: colors.surfaceDanger,
  },
  statusText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sectionCard: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  sectionHeaderActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sectionMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  usageWindowPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  usageWindowButton: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  usageWindowButtonActive: {
    borderColor: colors.info,
    backgroundColor: colors.surfaceInfo,
  },
  usageWindowLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  usageWindowLabelActive: {
    color: colors.info,
  },
  aiUsageLoader: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 120,
  },
  interventionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
  },
  interventionCopy: {
    flex: 1,
    minWidth: 0,
  },
  interventionName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  interventionDetail: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  interventionStats: {
    alignItems: 'flex-end',
  },
  interventionRate: {
    color: colors.accentMint,
    fontSize: 16,
    fontWeight: '900',
  },
  interventionRateWarn: {
    color: colors.accentAmber,
  },
  interventionShown: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  calibrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
  },
  calibrationCopy: {
    flex: 1,
    minWidth: 0,
  },
  calibrationBucket: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  calibrationStats: {
    alignItems: 'flex-end',
  },
  calibrationRate: {
    color: colors.accentCyan,
    fontSize: 13,
    fontWeight: '900',
  },
  calibrationError: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  dailyRows: {
    gap: 8,
    marginTop: 10,
  },
  dailyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
  },
  dailyDate: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 92,
  },
  dailyMetric: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  recommendation: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  usageSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 6,
  },
  usageTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  usageLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  usageValueWrap: {
    alignItems: 'flex-end',
  },
  usageCount: {
    color: colors.accentCyan,
    fontSize: 13,
    fontWeight: '900',
  },
  usageCost: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  mutedText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
}));
