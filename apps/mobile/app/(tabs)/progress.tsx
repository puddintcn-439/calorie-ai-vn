import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BodyProgressEntry, BodyProgressSummary, BodyProgressTrend, CreateBodyProgressDto } from '@calorie-ai/types';
import { ScreenShell, SurfaceCard, Eyebrow, HeroTitle, BodyText, useBottomNavContentPadding } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import MacrosCard from '../../components/macros-card';
import AdherenceCard from '../../components/adherence-card';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { apiClient } from '../../services/api';
import {
  calorieTargetService,
  isCalorieTargetReady,
  CalorieTargetRequiredField,
  CalorieTargetResponse,
  WeeklyAdaptiveResult,
} from '../../services/calorie-target.service';
import { getLocalDateYmd } from '../../services/date';
import { formatNumberVi, formatPercent, safeNumber, toFiniteNumber } from '../../services/number-format';
import { Text } from '../../components/i18n-text';
import { TextInput } from '../../components/i18n-text-input';
import { Alert } from '../../components/i18n-alert';
import { useI18n } from '../../components/i18n';
import { appLogger } from '../../services/logger.service';

function formatDecimal(value: unknown, fallback = '--') {
  const numeric = toFiniteNumber(value);
  return numeric === null ? fallback : numeric.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

function parseOptionalInput(value: string): number | undefined {
  const numeric = toFiniteNumber(value.replace(',', '.'));
  return numeric === null ? undefined : numeric;
}

const ENERGY_LABEL_KEYS = [
  '',
  'screen.tabs.progress.energy.1',
  'screen.tabs.progress.energy.2',
  'screen.tabs.progress.energy.3',
  'screen.tabs.progress.energy.4',
  'screen.tabs.progress.energy.5',
] as const;

const TARGET_FIELD_LABEL_KEYS: Record<CalorieTargetRequiredField, any> = {
  weight_kg: 'screen.tabs.progress.target.field.weight',
  height_cm: 'screen.tabs.progress.target.field.height',
  age: 'screen.tabs.progress.target.field.age',
  gender: 'screen.tabs.progress.target.field.gender',
  activity_level: 'screen.tabs.progress.target.field.activity',
  goal: 'screen.tabs.progress.target.field.goal',
};

function DeltaBadge({ value, unit, lowerIsBetter = false }: { value: number | null; unit: string; lowerIsBetter?: boolean }) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return null;
  if (value === null) return null;
  const isPositive = numeric > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;
  const color = numeric === 0 ? theme.colors.textMuted : isGood ? theme.colors.accentMint : theme.colors.danger;
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
  useAppTheme();
  const { t } = useI18n();
  const bottomContentPadding = useBottomNavContentPadding();
  const [trend, setTrend] = useState<BodyProgressTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [weightKg, setWeightKg] = useState('');
  const [waistCm, setWaistCm] = useState('');
  const [hipCm, setHipCm] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [energyLevel, setEnergyLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [note, setNote] = useState('');

  const loadData = useCallback(async () => {
    try {
      const res = await apiClient.get('/body-progress/trend');
      setTrend(res.data);

      // Pre-fill form with today's entry if exists
      const todayEntry = res.data?.entries?.find(
        (e: BodyProgressEntry) => e.recorded_at === getLocalDateYmd(),
      );
      if (todayEntry) {
        setWeightKg(todayEntry.weight_kg?.toString() ?? '');
        setWaistCm(todayEntry.waist_cm?.toString() ?? '');
        setHipCm(todayEntry.hip_cm?.toString() ?? '');
        setBodyFatPct(todayEntry.body_fat_pct?.toString() ?? '');
        setEnergyLevel((todayEntry.energy_level ?? 3) as 1 | 2 | 3 | 4 | 5);
        setNote(todayEntry.note ?? '');
      }
    } catch (error) {
      appLogger.warn('Progress', 'Failed to load body progress', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    fetchMyTarget();
  }, []);

  const [preview, setPreview] = useState<WeeklyAdaptiveResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [myTarget, setMyTarget] = useState<CalorieTargetResponse | null>(null);
  const [targetMissingFields, setTargetMissingFields] = useState<CalorieTargetRequiredField[]>([]);
  const [targetLoading, setTargetLoading] = useState(false);

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

  const fetchMyTarget = async () => {
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
    } catch (err) {
      setTargetMissingFields([]);
    } finally {
      setTargetLoading(false);
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
  };

  const handleSave = async () => {
    const parsedWeight = parseOptionalInput(weightKg);
    const parsedWaist = parseOptionalInput(waistCm);
    const parsedHip = parseOptionalInput(hipCm);
    const parsedBodyFat = parseOptionalInput(bodyFatPct);

    if (parsedWeight === undefined && parsedWaist === undefined) {
      Alert.alert('screen.tabs.progress.alert.012', 'screen.tabs.progress.alert.013');
      return;
    }

    setSaving(true);
    try {
      const dto: CreateBodyProgressDto = {
        recorded_at: getLocalDateYmd(),
        energy_level: energyLevel,
      };
      if (parsedWeight !== undefined) dto.weight_kg = parsedWeight;
      if (parsedWaist !== undefined) dto.waist_cm = parsedWaist;
      if (parsedHip !== undefined) dto.hip_cm = parsedHip;
      if (parsedBodyFat !== undefined) dto.body_fat_pct = parsedBodyFat;
      if (note.trim()) dto.note = note.trim();

      await apiClient.post('/body-progress', dto);
      Alert.alert('screen.tabs.progress.alert.014', 'screen.tabs.progress.alert.015');
      setShowForm(false);
      loadData();
    } catch (error) {
      Alert.alert('screen.tabs.progress.alert.016', 'screen.tabs.progress.alert.017');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = (entry: BodyProgressEntry) => {
    Alert.alert(
      'screen.tabs.progress.alert.018',
      t('screen.tabs.progress.delete.message', { date: entry.recorded_at }),
      [
        { text: 'screen.tabs.progress.alert.019', style: 'cancel' },
        {
          text: 'screen.tabs.progress.alert.020',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/body-progress/${entry.id}`);
              loadData();
            } catch {
              Alert.alert('screen.tabs.progress.alert.021', 'screen.tabs.progress.alert.022');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.accentMint} />
        </View>
      </ScreenShell>
    );
  }

  const latest = trend?.latest_entry;
  const progressSummary = trend?.progress_summary;

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
                <Text style={{ color: safeNumber(trend.weight_change_kg) < 0 ? theme.colors.accentMint : theme.colors.danger }}>
                  {safeNumber(trend.weight_change_kg) > 0 ? '+' : ''}{formatDecimal(trend.weight_change_kg)} kg
                </Text>
              </Text>
            )}
          </SurfaceCard>
        )}

        <ProgressSummaryCard summary={progressSummary} />

        {/* ── Why This Target (Preview) ── */}
        <SurfaceCard style={styles.previewCard}>
          <Text style={styles.trendTitle} i18nKey="screen.tabs.progress.text.005" />
          <BodyText style={{ marginTop: 6 }}>screen.tabs.progress.preview.body</BodyText>
          <View style={{ marginTop: 10 }}>
            <UiButton label={preview ? 'screen.tabs.progress.preview.refresh' : 'screen.tabs.progress.preview.reason'} onPress={fetchPreview} loading={previewLoading} />
            {preview && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.previewRow}>{t('screen.tabs.progress.preview.version', { version: preview.algorithm_version })}</Text>
                <Text style={styles.previewRow}>Actual TDEE: {preview.actual_tdee ?? '—'} kcal</Text>
                <Text style={styles.previewRow}>Clamp: {preview.clamp_reason ?? '—'}</Text>
                <Text style={styles.previewRow}>{t('screen.tabs.progress.preview.currentTarget', { target: preview.original_daily_target })}</Text>
                <Text style={styles.previewRow}>{t('screen.tabs.progress.preview.suggestedTarget', { target: preview.adjusted_daily_target, percent: preview.adjustment_percentage })}</Text>
                <Text style={[styles.previewRow, { marginTop: 6 }]}>{preview.recommendation}</Text>
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

        {/* ── Log Today Button ── */}
        <UiButton
          label={showForm ? 'screen.tabs.progress.form.toggleHide' : 'screen.tabs.progress.form.toggleShow'}
          onPress={() => setShowForm(!showForm)}
          style={styles.logButton}
        />

        {/* ── Input Form ── */}
        {showForm && (
          <SurfaceCard style={styles.formCard}>
            <Text style={styles.formTitle}>{t('screen.tabs.progress.form.title', { date: new Date().toLocaleDateString('vi-VN') })}</Text>

            <View style={styles.formRow}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel} i18nKey="screen.tabs.progress.text.006" />
                <TextInput
                  style={styles.textInput}
                  value={weightKg}
                  onChangeText={setWeightKg}
                  keyboardType="decimal-pad"
                  placeholder="screen.tabs.progress.placeholder.001"
                  placeholderTextColor={theme.colors.textMuted}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel} i18nKey="screen.tabs.progress.text.007" />
                <TextInput
                  style={styles.textInput}
                  value={waistCm}
                  onChangeText={setWaistCm}
                  keyboardType="decimal-pad"
                  placeholder="screen.tabs.progress.placeholder.002"
                  placeholderTextColor={theme.colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel} i18nKey="screen.tabs.progress.text.008" />
                <TextInput
                  style={styles.textInput}
                  value={hipCm}
                  onChangeText={setHipCm}
                  keyboardType="decimal-pad"
                  placeholder="screen.tabs.progress.placeholder.003"
                  placeholderTextColor={theme.colors.textMuted}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel} i18nKey="screen.tabs.progress.text.009" />
                <TextInput
                  style={styles.textInput}
                  value={bodyFatPct}
                  onChangeText={setBodyFatPct}
                  keyboardType="decimal-pad"
                  placeholder="screen.tabs.progress.placeholder.004"
                  placeholderTextColor={theme.colors.textMuted}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel} i18nKey="screen.tabs.progress.text.010" />
            <View style={styles.energyRow}>
              {([1, 2, 3, 4, 5] as const).map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[styles.energyChip, energyLevel === level && styles.energyChipActive]}
                  onPress={() => setEnergyLevel(level)}
                >
                  <Text style={styles.energyLabel}>{t(ENERGY_LABEL_KEYS[level] as any)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel} i18nKey="screen.tabs.progress.text.011" />
            <TextInput
              style={[styles.textInput, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="screen.tabs.progress.placeholder.005"
              placeholderTextColor={theme.colors.textMuted}
              multiline
            />

            <UiButton
              label="screen.tabs.progress.label.002"
              onPress={handleSave}
              loading={saving}
              style={styles.saveButton}
            />
          </SurfaceCard>
        )}

        {/* ── History List ── */}
        {trend && trend.entries.length > 0 && (
          <>
            <Text style={styles.historyTitle}>{t('screen.tabs.progress.history.title', { count: trend.entries.length })}</Text>
            {trend.entries.slice(0, 30).map((entry) => (
              <SurfaceCard key={entry.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>{entry.recorded_at}</Text>
                  <View style={styles.historyRight}>
                    {entry.energy_level && (
                      <Text style={styles.energyEmoji}>
                        {t(ENERGY_LABEL_KEYS[entry.energy_level] as any).split(' ')[0]}
                      </Text>
                    )}
                    <TouchableOpacity
                      onPress={() => handleDeleteEntry(entry)}
                      style={styles.deleteButton}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.metricsRow}>
                  {entry.weight_kg != null && (
                    <Text style={styles.metricChip}>⚖️ {entry.weight_kg} kg</Text>
                  )}
                  {entry.waist_cm != null && (
                    <Text style={styles.metricChip}>📏 {entry.waist_cm} cm</Text>
                  )}
                  {entry.body_fat_pct != null && (
                    <Text style={styles.metricChip}>💧 {entry.body_fat_pct}%</Text>
                  )}
                </View>
                {entry.note && <Text style={styles.historyNote}>{entry.note}</Text>}
              </SurfaceCard>
            ))}
          </>
        )}

        {trend?.days_tracked === 0 && !showForm && (
          <SurfaceCard style={styles.emptyCard}>
            <Text style={styles.emptyText} i18nKey="screen.tabs.progress.empty" />
          </SurfaceCard>
        )}
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
  logButton: { marginBottom: 14 },
  formCard: { marginBottom: 14, borderColor: colors.textMuted },
  formTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 14 },
  formRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  formField: { flex: 1 },
  fieldLabel: { color: colors.textSoft, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  textInput: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noteInput: { minHeight: 60, textAlignVertical: 'top' },
  energyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  energyChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  energyChipActive: { borderColor: colors.accentMint, backgroundColor: colors.surfaceSuccess },
  energyLabel: { color: colors.textSoft, fontSize: 11 },
  saveButton: { marginTop: 8 },
  historyTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 10 },
  historyCard: { marginBottom: 10, borderColor: colors.border },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  historyDate: { color: colors.info, fontSize: 13, fontWeight: '600' },
  historyRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  energyEmoji: { fontSize: 18 },
  deleteButton: { padding: 4 },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricChip: { color: colors.text, fontSize: 13, backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  historyNote: { color: colors.textMuted, fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  emptyCard: { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  previewCard: { marginBottom: 14, borderColor: colors.borderInfo, backgroundColor: colors.surface },
  previewRow: { color: colors.textSoft, fontSize: 13, marginTop: 4 },
  progressSummaryCard: { marginBottom: 14, borderColor: colors.borderInfo, backgroundColor: colors.surface },
  progressSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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


