import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text as NativeText,
  ScrollView,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BodyProgressSummary, BodyProgressTrend, TodaySummary } from '@calorie-ai/types';
import { ScreenShell, SurfaceCard, Eyebrow, HeroTitle, BodyText, useBottomNavContentPadding } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import MacrosCard from '../../components/macros-card';
import AdherenceCard from '../../components/adherence-card';
import { createThemedStyles, useAppTheme } from '../../components/theme';
import { apiClient } from '../../services/api';
import {
  calorieTargetService,
  isCalorieTargetReady,
  CalorieTargetRequiredField,
  CalorieTargetResponse,
  WeeklyAdaptiveResult,
} from '../../services/calorie-target.service';
import { getLocalDateYmd, getLocalTimezoneOffsetMinutes } from '../../services/date';
import { formatNumberVi, formatPercent, safeNumber, toFiniteNumber } from '../../services/number-format';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';
import { useI18n } from '../../components/i18n';
import { appLogger } from '../../services/logger.service';

function formatDecimal(value: unknown, fallback = '--') {
  const numeric = toFiniteNumber(value);
  return numeric === null ? fallback : numeric.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

const TARGET_FIELD_LABEL_KEYS: Record<CalorieTargetRequiredField, any> = {
  weight_kg: 'screen.tabs.progress.target.field.weight',
  height_cm: 'screen.tabs.progress.target.field.height',
  age: 'screen.tabs.progress.target.field.age',
  gender: 'screen.tabs.progress.target.field.gender',
  activity_level: 'screen.tabs.progress.target.field.activity',
  goal: 'screen.tabs.progress.target.field.goal',
};

function DeltaBadge({ value, unit, lowerIsBetter = false }: { value: number | null; unit: string; lowerIsBetter?: boolean }) {
  const { colors: c } = useAppTheme();
  if (value === null) return null;
  const numeric = toFiniteNumber(value);
  if (numeric === null) return null;
  const isPositive = numeric > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;
  const color = numeric === 0 ? c.textMuted : isGood ? c.accentMint : c.danger;
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '—';
  return (
    <Text style={[styles.deltaBadge, { color }]}>
      {arrow} {Math.abs(value)}{unit}
    </Text>
  );
}

function progressStatusKey(summary?: BodyProgressSummary) {
  if (!summary) return 'screen.tabs.progress.status.noSummary';
  if (summary.data_status === 'no_logs') return 'screen.tabs.progress.status.noLogs';
  if (summary.data_status === 'no_weight') return 'screen.tabs.progress.status.noWeight';
  if (summary.data_status === 'missing_goal') return 'screen.tabs.progress.status.missingGoal';
  if (summary.data_status === 'insufficient_data') return 'screen.tabs.progress.status.insufficientData';
  return 'screen.tabs.progress.status.ready';
}

function ProgressMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.progressMetric}>
      <Text style={styles.progressMetricLabel}>{label}</Text>
      <Text style={styles.progressMetricValue}>{value}</Text>
      {hint ? <Text style={styles.progressMetricHint}>{hint}</Text> : null}
    </View>
  );
}

function ProgressSummaryCard({ summary }: { summary?: BodyProgressSummary }) {
  const { t } = useI18n();
  return (
    <SurfaceCard style={styles.progressSummaryCard}>
      <Text style={styles.trendTitle} i18nKey="screen.tabs.progress.summary.title" />
      <View style={styles.progressSummaryGrid}>
        <ProgressMetric
          label={t('screen.tabs.progress.summary.adherence')}
          value={summary?.average_weekly_adherence_pct == null ? '--' : formatPercent(summary.average_weekly_adherence_pct)}
          hint={summary?.average_weekly_adherence_pct == null
            ? t('screen.tabs.progress.summary.adherenceEmpty')
            : t('screen.tabs.progress.summary.weeksWithData', { weeks: safeNumber(summary?.weeks_with_logs) })}
        />
        <ProgressMetric
          label={t('screen.tabs.progress.summary.loggedDays')}
          value={summary ? formatNumberVi(summary.logged_days, '0') : '--'}
          hint={t('screen.tabs.progress.summary.periodDays', { days: summary?.period_days ?? 90 })}
        />
        <ProgressMetric
          label={t('screen.tabs.progress.summary.weightDelta')}
          value={summary?.weight_delta_kg == null ? '--' : `${formatDecimal(summary.weight_delta_kg)} kg`}
          hint={summary?.weight_delta_kg == null ? t('screen.tabs.progress.summary.weightDeltaEmpty') : t('screen.tabs.progress.summary.weightDeltaHint')}
        />
        <ProgressMetric
          label={t('screen.tabs.progress.summary.goalProgress')}
          value={summary?.weight_goal_progress_pct == null ? '--' : formatPercent(summary.weight_goal_progress_pct)}
          hint={summary?.weight_goal_kg ? t('screen.tabs.progress.summary.goalKg', { kg: formatDecimal(summary.weight_goal_kg) }) : t('screen.tabs.progress.summary.goalMissing')}
        />
      </View>
      <Text style={styles.progressStatus}>{t(progressStatusKey(summary) as any)}</Text>
    </SurfaceCard>
  );
}

export default function BodyProgressScreen() {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const bottomContentPadding = useBottomNavContentPadding();
  const [trend, setTrend] = useState<BodyProgressTrend | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [preview, setPreview] = useState<WeeklyAdaptiveResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [myTarget, setMyTarget] = useState<CalorieTargetResponse | null>(null);
  const [targetMissingFields, setTargetMissingFields] = useState<CalorieTargetRequiredField[]>([]);
  const [targetLoading, setTargetLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const today = getLocalDateYmd();
      const tzOffset = getLocalTimezoneOffsetMinutes();
      const [trendResult, summaryResult] = await Promise.allSettled([
        apiClient.get('/body-progress/trend'),
        apiClient.get(`/today/summary?date=${today}&tz_offset_minutes=${tzOffset}`),
      ]);

      if (trendResult.status === 'fulfilled') {
        setTrend(trendResult.value.data);
      }

      if (summaryResult.status === 'fulfilled') {
        setTodaySummary(summaryResult.value.data);
      }
    } catch (error) {
      appLogger.warn('Progress', 'Failed to load body progress', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchMyTarget = useCallback(async () => {
    setTargetLoading(true);
    try {
      const res = await calorieTargetService.getMyTarget();
      if (isCalorieTargetReady(res)) {
        setMyTarget(res);
        setTargetMissingFields([]);
      } else {
        setMyTarget(null);
        setTargetMissingFields(res.missing_fields);
      }
    } catch {
      setTargetMissingFields([]);
    } finally {
      setTargetLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    fetchMyTarget();
  }, [fetchMyTarget]);

  const fetchPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await calorieTargetService.getWeeklyAdjustmentPreview();
      setPreview(res);
    } catch (error) {
      Alert.alert('screen.tabs.progress.alert.001', 'screen.tabs.progress.alert.002');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApplyAdjustment = () => {
    if (!preview) return Alert.alert('screen.tabs.progress.alert.003', 'screen.tabs.progress.alert.004');
    Alert.alert(
      'screen.tabs.progress.alert.005',
      t('screen.tabs.progress.adjustment.applyMessage', { target: preview.adjusted_daily_target }),
      [
        { text: 'screen.tabs.progress.alert.006', style: 'cancel' },
        {
          text: 'screen.tabs.progress.alert.007',
          onPress: async () => {
            setSaving(true);
            try {
              const res = await calorieTargetService.applyWeeklyAdjustment();
              Alert.alert('screen.tabs.progress.alert.008', 'screen.tabs.progress.alert.009');
              setPreview(res);
              loadData();
            } catch (err) {
              Alert.alert('screen.tabs.progress.alert.010', 'screen.tabs.progress.alert.011');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    fetchMyTarget().catch(() => {});
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentMint} />
        </View>
      </ScreenShell>
    );
  }

  const latest = trend?.latest_entry;
  const progressSummary = trend?.progress_summary;
  const healthScore = todaySummary?.health_score;
  const healthTrendDelta = healthScore?.trend.delta_vs_7d ?? null;
  const healthTrendLabel = healthScore && healthScore.trend.average_7d !== null && healthTrendDelta !== null
    ? t('screen.tabs.progress.behavior.trend', {
        score: formatNumberVi(healthScore.overall, '0'),
        average: formatNumberVi(healthScore.trend.average_7d, '0'),
        delta: `${healthTrendDelta >= 0 ? '+' : ''}${formatNumberVi(healthTrendDelta, '0')}`,
      })
    : t('screen.tabs.progress.behavior.trendEmpty');
  const weakestBehavior = healthScore
    ? t(`screen.tabs.progress.behavior.weakest.${healthScore.weekly_adherence.weakest_area}` as any)
    : '';

  return (
    <ScreenShell scroll={false} reserveBottomNav={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomContentPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Eyebrow>screen.tabs.progress.hero.eyebrow</Eyebrow>
        <HeroTitle>screen.tabs.progress.hero.title</HeroTitle>
        <BodyText style={styles.heroBody}>screen.tabs.progress.hero.body</BodyText>

        {/* ── Trend Summary ── */}
        {trend && trend.days_tracked > 0 && (
          <SurfaceCard style={styles.trendCard}>
            <Text style={styles.trendTitle} i18nKey="screen.tabs.progress.text.001" />
            <View style={styles.trendGrid}>
              <View style={styles.trendItem}>
                <Text style={styles.trendLabel} i18nKey="screen.tabs.progress.text.002" />
                <Text style={styles.trendValue}>
                  {latest?.weight_kg != null ? `${formatDecimal(latest.weight_kg)} kg` : '--'}
                </Text>
                <DeltaBadge value={trend.weight_change_7d} unit="kg" lowerIsBetter />
              </View>
              <View style={styles.trendItem}>
                <Text style={styles.trendLabel} i18nKey="screen.tabs.progress.text.003" />
                <Text style={styles.trendValue}>
                  {latest?.waist_cm != null ? `${formatDecimal(latest.waist_cm)} cm` : '--'}
                </Text>
                <DeltaBadge value={trend.waist_change_cm} unit="cm" lowerIsBetter />
              </View>
              <View style={styles.trendItem}>
                <Text style={styles.trendLabel} i18nKey="screen.tabs.progress.text.004" />
                <Text style={styles.trendValue}>{formatNumberVi(trend.days_tracked, '0')}</Text>
              </View>
            </View>
            {trend.weight_change_kg !== null && (
              <Text style={styles.totalChange}>
                {t('screen.tabs.progress.totalChange')}{' '}
                <Text style={{ color: safeNumber(trend.weight_change_kg) < 0 ? colors.accentMint : colors.danger }}>
                  {safeNumber(trend.weight_change_kg) > 0 ? '+' : ''}{formatDecimal(trend.weight_change_kg)} kg
                </Text>
              </Text>
            )}
          </SurfaceCard>
        )}

        <ProgressSummaryCard summary={progressSummary} />

        {healthScore ? (
          <SurfaceCard style={styles.behaviorCard}>
            <View style={styles.behaviorHeader}>
              <View style={styles.behaviorCopy}>
                <Text style={styles.trendTitle} i18nKey="screen.tabs.progress.behavior.title" />
                <Text style={styles.behaviorBody}>{healthTrendLabel}</Text>
              </View>
              <View style={styles.behaviorScoreBadge}>
                <Text style={styles.behaviorScoreValue}>{formatNumberVi(healthScore.weekly_adherence.overall, '0')}/100</Text>
                <Text style={styles.behaviorScoreLabel} i18nKey="screen.tabs.progress.behavior.adherence" />
              </View>
            </View>
            <View style={styles.behaviorGrid}>
              <ProgressMetric
                label={t('screen.tabs.progress.behavior.logging')}
                value={formatPercent(healthScore.weekly_adherence.logging)}
                hint={t('screen.tabs.progress.behavior.daysWithLogs', {
                  days: healthScore.weekly_adherence.days_with_logs,
                })}
              />
              <ProgressMetric
                label={t('screen.tabs.progress.behavior.activity')}
                value={formatPercent(healthScore.weekly_adherence.activity)}
                hint={t('screen.tabs.progress.behavior.daysWithActivity', {
                  days: healthScore.weekly_adherence.days_with_activity,
                })}
              />
              <ProgressMetric
                label={t('screen.tabs.progress.behavior.weakest')}
                value={weakestBehavior}
                hint={t('screen.tabs.progress.behavior.weakestHint')}
              />
            </View>
            {healthScore.weekly_adherence.patterns.length > 0 ? (
              <View style={styles.behaviorPatternList}>
                {healthScore.weekly_adherence.patterns.map((pattern) => (
                  <View key={pattern} style={styles.behaviorPatternChip}>
                    <Ionicons name="analytics-outline" size={14} color={colors.accentCyan} />
                    <Text style={styles.behaviorPatternText}>{pattern}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </SurfaceCard>
        ) : null}

        {/* ── Why This Target (Preview) ── */}
        <SurfaceCard style={styles.previewCard}>
          <Text style={styles.trendTitle} i18nKey="screen.tabs.progress.text.005" />
          <BodyText style={{ marginTop: 6 }}>screen.tabs.progress.preview.body</BodyText>
          <View style={{ marginTop: 10 }}>
            <UiButton label={preview ? 'screen.tabs.progress.preview.refresh' : 'screen.tabs.progress.preview.reason'} onPress={fetchPreview} loading={previewLoading} />
            {preview && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.previewRow}>{t('screen.tabs.progress.preview.version', { version: preview.algorithm_version })}</Text>
                <Text style={styles.previewRow}>{t('screen.tabs.progress.preview.tdee', { tdee: preview.actual_tdee ?? '—' })}</Text>
                <Text style={styles.previewRow}>{t('screen.tabs.progress.preview.clamp', { reason: preview.clamp_reason ?? '—' })}</Text>
                <Text style={styles.previewRow}>{t('screen.tabs.progress.preview.currentTarget', { target: preview.original_daily_target })}</Text>
                <Text style={styles.previewRow}>{t('screen.tabs.progress.preview.suggestedTarget', { target: preview.adjusted_daily_target, percent: preview.adjustment_percentage })}</Text>
                <NativeText style={styles.previewRow}>{preview.recommendation}</NativeText>
                <UiButton label="screen.tabs.progress.label.001" onPress={handleApplyAdjustment} loading={saving} style={{ marginTop: 8 }} />
              </View>
            )}
            {myTarget && <MacrosCard target={myTarget} />}
            {!targetLoading && targetMissingFields.length > 0 && (
              <View style={styles.targetNotice}>
                <Text style={styles.targetNoticeTitle} i18nKey="screen.tabs.progress.target.incompleteTitle" />
                <Text style={styles.targetNoticeBody}>
                  {t('screen.tabs.progress.target.incompleteBody' as any, {
                    fields: targetMissingFields.map((field) => t(TARGET_FIELD_LABEL_KEYS[field])).join(', '),
                  })}
                </Text>
              </View>
            )}
          </View>
        </SurfaceCard>

        {/* ── Adherence Summary ── */}
        <AdherenceCard />

        {/* Body-composition data is managed on its dedicated screen. */}
        <SurfaceCard style={styles.compositionCta}>
          <View style={styles.compositionCtaCopy}>
            <View style={styles.compositionCtaIcon}>
              <Ionicons name="body-outline" size={22} color={colors.accentCyan} />
            </View>
            <View style={styles.compositionCtaText}>
              <Text style={styles.compositionCtaTitle} i18nKey="progress.composition.title" />
              <Text style={styles.compositionCtaBody} i18nKey="progress.composition.body" />
            </View>
          </View>
          <UiButton
            label="progress.composition.action"
            onPress={() => router.push('/body-composition' as never)}
            style={styles.compositionCtaButton}
          />
        </SurfaceCard>

      </ScrollView>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingTop: 14 },
  heroBody: { marginBottom: 16, maxWidth: 720 },
  trendCard: { marginBottom: 14, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  trendTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 12 },
  targetNotice: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    padding: 12,
  },
  targetNoticeTitle: { color: colors.warning, fontSize: 13, fontWeight: '800', marginBottom: 4 },
  targetNoticeBody: { color: colors.textSoft, fontSize: 12, lineHeight: 17 },
  trendGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  trendItem: { alignItems: 'center', flex: 1 },
  trendLabel: { color: colors.textSoft, fontSize: 12, marginBottom: 4 },
  trendValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  deltaBadge: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  totalChange: { color: colors.textSoft, fontSize: 13, marginTop: 8, textAlign: 'center' },
  compositionCta: {
    marginTop: 2,
    marginBottom: 14,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
  },
  compositionCtaCopy: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  compositionCtaIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderInfo,
  },
  compositionCtaText: { flex: 1, minWidth: 0 },
  compositionCtaTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginBottom: 4 },
  compositionCtaBody: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  compositionCtaButton: { marginTop: 14 },
  previewCard: { marginBottom: 14, borderColor: colors.borderInfo, backgroundColor: colors.surface },
  previewRow: { color: colors.textSoft, fontSize: 13, marginTop: 4 },
  progressSummaryCard: { marginBottom: 14, borderColor: colors.borderInfo, backgroundColor: colors.surface },
  progressSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  behaviorCard: { marginBottom: 14, borderColor: colors.borderSuccess, backgroundColor: colors.surfaceSuccess },
  behaviorHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  behaviorCopy: { flex: 1, minWidth: 0 },
  behaviorBody: { color: colors.textSoft, fontSize: 13, lineHeight: 19 },
  behaviorScoreBadge: {
    minWidth: 84,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  behaviorScoreValue: { color: colors.accentMint, fontSize: 24, lineHeight: 28, fontWeight: '900' },
  behaviorScoreLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  behaviorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  behaviorPatternList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  behaviorPatternChip: {
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  behaviorPatternText: { color: colors.textSoft, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  progressMetric: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    padding: 10,
  },
  progressMetricLabel: { color: colors.textSoft, fontSize: 11, fontWeight: '700' },
  progressMetricValue: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
  progressMetricHint: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  progressStatus: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 10 },
}));


