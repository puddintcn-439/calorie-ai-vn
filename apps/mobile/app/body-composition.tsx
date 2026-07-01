import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  BodyProgressEntry,
  BodyProgressTrend,
  CreateBodyProgressDto,
} from '@calorie-ai/types';
import {
  BodyText,
  Eyebrow,
  HeroTitle,
  ScreenShell,
  SurfaceCard,
} from '../components/ui-shell';
import { UiButton } from '../components/ui-button';
import { createThemedStyles, useAppTheme } from '../components/theme';
import { Text } from '../components/i18n-text';
import { TextInput } from '../components/i18n-text-input';
import { Alert } from '../components/i18n-alert';
import { useI18n } from '../components/i18n';
import { apiClient } from '../services/api';
import { getLocalDateYmd } from '../services/date';
import { toFiniteNumber } from '../services/number-format';
import { appLogger } from '../services/logger.service';

type MetricField = {
  key: 'weightKg' | 'bodyFatPct' | 'muscleMassKg' | 'waistCm' | 'hipCm';
  label: string;
  unit: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
};

const ENERGY_LABEL_KEYS = [
  '',
  'screen.tabs.progress.energy.1',
  'screen.tabs.progress.energy.2',
  'screen.tabs.progress.energy.3',
  'screen.tabs.progress.energy.4',
  'screen.tabs.progress.energy.5',
] as const;

function parseOptionalInput(value: string): number | undefined {
  const numeric = toFiniteNumber(value.replace(',', '.'));
  return numeric === null ? undefined : numeric;
}

function formatMetric(value: unknown, unit: string) {
  const numeric = toFiniteNumber(value);
  return numeric === null
    ? '—'
    : `${numeric.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${unit}`;
}

function CurrentMetric({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.currentMetric}>
      <View style={styles.metricIcon}>
        <MaterialCommunityIcons name={icon} size={17} color={colors.accentCyan} />
      </View>
      <Text style={styles.currentMetricLabel}>{label}</Text>
      <Text style={styles.currentMetricValue}>{value}</Text>
    </View>
  );
}

export default function BodyCompositionScreen() {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const [trend, setTrend] = useState<BodyProgressTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [weightKg, setWeightKg] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [muscleMassKg, setMuscleMassKg] = useState('');
  const [waistCm, setWaistCm] = useState('');
  const [hipCm, setHipCm] = useState('');
  const [energyLevel, setEnergyLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [note, setNote] = useState('');

  const hydrateForm = useCallback((entry: BodyProgressEntry | null | undefined) => {
    if (!entry) return;
    setWeightKg(entry.weight_kg?.toString() ?? '');
    setBodyFatPct(entry.body_fat_pct?.toString() ?? '');
    setMuscleMassKg(entry.muscle_mass_kg?.toString() ?? '');
    setWaistCm(entry.waist_cm?.toString() ?? '');
    setHipCm(entry.hip_cm?.toString() ?? '');
    setEnergyLevel((entry.energy_level ?? 3) as 1 | 2 | 3 | 4 | 5);
    setNote(entry.note ?? '');
  }, []);

  const loadData = useCallback(async () => {
    try {
      const response = await apiClient.get('/body-progress/trend');
      const nextTrend = response.data as BodyProgressTrend;
      setTrend(nextTrend);
      setLoadFailed(false);
      const todayEntry = nextTrend.entries?.find(
        (entry) => entry.recorded_at === getLocalDateYmd(),
      );
      hydrateForm(todayEntry);
    } catch (error) {
      setLoadFailed(true);
      appLogger.warn('BodyComposition', 'Failed to load body measurements', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hydrateForm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSave = async () => {
    const parsedWeight = parseOptionalInput(weightKg);
    const parsedBodyFat = parseOptionalInput(bodyFatPct);
    const parsedMuscleMass = parseOptionalInput(muscleMassKg);
    const parsedWaist = parseOptionalInput(waistCm);
    const parsedHip = parseOptionalInput(hipCm);

    if (
      parsedWeight === undefined &&
      parsedBodyFat === undefined &&
      parsedMuscleMass === undefined &&
      parsedWaist === undefined &&
      parsedHip === undefined
    ) {
      Alert.alert('bodyComposition.validation.title', 'bodyComposition.validation.body');
      return;
    }

    setSaving(true);
    try {
      const dto: CreateBodyProgressDto = {
        recorded_at: getLocalDateYmd(),
        energy_level: energyLevel,
      };
      if (parsedWeight !== undefined) dto.weight_kg = parsedWeight;
      if (parsedBodyFat !== undefined) dto.body_fat_pct = parsedBodyFat;
      if (parsedMuscleMass !== undefined) dto.muscle_mass_kg = parsedMuscleMass;
      if (parsedWaist !== undefined) dto.waist_cm = parsedWaist;
      if (parsedHip !== undefined) dto.hip_cm = parsedHip;
      if (note.trim()) dto.note = note.trim();

      await apiClient.post('/body-progress', dto);
      await loadData();
      Alert.alert('bodyComposition.saved.title', 'bodyComposition.saved.body');
    } catch (error) {
      Alert.alert('common.error', 'bodyComposition.saveFailed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = (entry: BodyProgressEntry) => {
    Alert.alert(
      'bodyComposition.delete.title',
      t('bodyComposition.delete.body', { date: entry.recorded_at }),
      [
        { text: 'common.cancel', style: 'cancel' },
        {
          text: 'common.delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/body-progress/${entry.id}`);
              await loadData();
            } catch {
              Alert.alert('common.error', 'bodyComposition.deleteFailed');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <ScreenShell reserveBottomNav={false}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentMint} />
        </View>
      </ScreenShell>
    );
  }

  const latest = trend?.latest_entry;
  const fields: MetricField[] = [
    {
      key: 'weightKg',
      label: t('bodyComposition.field.weight'),
      unit: 'kg',
      placeholder: '65,5',
      value: weightKg,
      onChangeText: setWeightKg,
    },
    {
      key: 'bodyFatPct',
      label: t('bodyComposition.field.bodyFat'),
      unit: '%',
      placeholder: '22,5',
      value: bodyFatPct,
      onChangeText: setBodyFatPct,
    },
    {
      key: 'muscleMassKg',
      label: t('bodyComposition.field.muscle'),
      unit: 'kg',
      placeholder: '42,0',
      value: muscleMassKg,
      onChangeText: setMuscleMassKg,
    },
    {
      key: 'waistCm',
      label: t('bodyComposition.field.waist'),
      unit: 'cm',
      placeholder: '78',
      value: waistCm,
      onChangeText: setWaistCm,
    },
    {
      key: 'hipCm',
      label: t('bodyComposition.field.hip'),
      unit: 'cm',
      placeholder: '92',
      value: hipCm,
      onChangeText: setHipCm,
    },
  ];

  return (
    <ScreenShell scroll={false} reserveBottomNav={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TouchableOpacity
          style={styles.backLink}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <Ionicons name="arrow-back" size={18} color={colors.textSoft} />
          <Text style={styles.backText} i18nKey="common.goBack" />
        </TouchableOpacity>

        <Eyebrow>bodyComposition.eyebrow</Eyebrow>
        <HeroTitle>bodyComposition.title</HeroTitle>
        <BodyText style={styles.heroBody}>bodyComposition.body</BodyText>

        {loadFailed ? (
          <SurfaceCard style={styles.errorCard}>
            <Text style={styles.errorTitle} i18nKey="bodyComposition.loadFailed.title" />
            <Text style={styles.errorBody} i18nKey="bodyComposition.loadFailed.body" />
            <UiButton label="common.retry" onPress={loadData} style={styles.retryButton} />
          </SurfaceCard>
        ) : null}

        <SurfaceCard style={styles.snapshotCard}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionEyebrow} i18nKey="bodyComposition.current.eyebrow" />
              <Text style={styles.sectionTitle}>
                {latest?.recorded_at
                  ? t('bodyComposition.current.updated', { date: latest.recorded_at })
                  : t('bodyComposition.current.empty')}
              </Text>
            </View>
            <View style={styles.statusMark}>
              <MaterialCommunityIcons name="human-male" size={22} color={colors.accentCyan} />
            </View>
          </View>
          <View style={styles.currentGrid}>
            <CurrentMetric
              icon="scale-bathroom"
              label={t('bodyComposition.field.weight')}
              value={formatMetric(latest?.weight_kg, 'kg')}
            />
            <CurrentMetric
              icon="percent-outline"
              label={t('bodyComposition.field.bodyFat')}
              value={formatMetric(latest?.body_fat_pct, '%')}
            />
            <CurrentMetric
              icon="arm-flex-outline"
              label={t('bodyComposition.field.muscle')}
              value={formatMetric(latest?.muscle_mass_kg, 'kg')}
            />
            <CurrentMetric
              icon="tape-measure"
              label={t('bodyComposition.field.waist')}
              value={formatMetric(latest?.waist_cm, 'cm')}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.formCard}>
          <Text style={styles.sectionEyebrow} i18nKey="bodyComposition.form.eyebrow" />
          <Text style={styles.formTitle}>
            {t('bodyComposition.form.title', {
              date: new Date().toLocaleDateString('vi-VN'),
            })}
          </Text>
          <Text style={styles.formHelper} i18nKey="bodyComposition.form.helper" />

          <View style={styles.formGrid}>
            {fields.map((field) => (
              <View key={field.key} style={styles.formField}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <View style={styles.inputShell}>
                  <TextInput
                    style={styles.input}
                    value={field.value}
                    onChangeText={field.onChangeText}
                    keyboardType="decimal-pad"
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel={field.label}
                  />
                  <Text style={styles.inputUnit}>{field.unit}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.fieldLabel} i18nKey="bodyComposition.field.energy" />
          <View style={styles.energyRow}>
            {([1, 2, 3, 4, 5] as const).map((level) => (
              <TouchableOpacity
                key={level}
                style={[styles.energyChip, energyLevel === level && styles.energyChipActive]}
                onPress={() => setEnergyLevel(level)}
                accessibilityRole="button"
                accessibilityState={{ selected: energyLevel === level }}
              >
                <Text style={[styles.energyLabel, energyLevel === level && styles.energyLabelActive]}>
                  {t(ENERGY_LABEL_KEYS[level] as any)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel} i18nKey="bodyComposition.field.note" />
          <TextInput
            style={[styles.inputShell, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="bodyComposition.field.notePlaceholder"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <UiButton
            label={saving ? 'common.saving' : 'bodyComposition.save'}
            onPress={handleSave}
            loading={saving}
            style={styles.saveButton}
          />
        </SurfaceCard>

        <View style={styles.guidance}>
          <MaterialCommunityIcons name="weather-sunset-up" size={21} color={colors.accentAmber} />
          <View style={styles.guidanceCopy}>
            <Text style={styles.guidanceTitle} i18nKey="bodyComposition.guidance.title" />
            <Text style={styles.guidanceBody} i18nKey="bodyComposition.guidance.body" />
          </View>
        </View>

        <View style={styles.historyHeading}>
          <View>
            <Text style={styles.sectionEyebrow} i18nKey="bodyComposition.history.eyebrow" />
            <Text style={styles.historyTitle}>
              {t('bodyComposition.history.title', { count: trend?.entries.length ?? 0 })}
            </Text>
          </View>
          <TouchableOpacity style={styles.progressLink} onPress={() => router.push('/progress' as never)}>
            <Text style={styles.progressLinkText} i18nKey="bodyComposition.history.progress" />
            <Ionicons name="arrow-forward" size={15} color={colors.accentCyan} />
          </TouchableOpacity>
        </View>

        {trend?.entries.length ? (
          trend.entries.slice(0, 30).map((entry) => (
            <SurfaceCard key={entry.id} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <View>
                  <Text style={styles.historyDate}>{entry.recorded_at}</Text>
                  <Text style={styles.historyMeta}>
                    {entry.energy_level
                      ? t('bodyComposition.history.energy', { level: entry.energy_level })
                      : t('bodyComposition.history.manual')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteEntry(entry)}
                  style={styles.deleteButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                >
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </TouchableOpacity>
              </View>
              <View style={styles.historyMetrics}>
                {entry.weight_kg != null ? (
                  <Text style={styles.historyMetric}>{formatMetric(entry.weight_kg, 'kg')}</Text>
                ) : null}
                {entry.body_fat_pct != null ? (
                  <Text style={styles.historyMetric}>
                    {formatMetric(entry.body_fat_pct, '%')} · {t('bodyComposition.history.bodyFat')}
                  </Text>
                ) : null}
                {entry.muscle_mass_kg != null ? (
                  <Text style={styles.historyMetric}>
                    {formatMetric(entry.muscle_mass_kg, 'kg')} · {t('bodyComposition.history.muscle')}
                  </Text>
                ) : null}
                {entry.waist_cm != null ? (
                  <Text style={styles.historyMetric}>
                    {formatMetric(entry.waist_cm, 'cm')} · {t('bodyComposition.history.waist')}
                  </Text>
                ) : null}
                {entry.hip_cm != null ? (
                  <Text style={styles.historyMetric}>
                    {formatMetric(entry.hip_cm, 'cm')} · {t('bodyComposition.history.hip')}
                  </Text>
                ) : null}
              </View>
              {entry.note ? <Text style={styles.historyNote}>{entry.note}</Text> : null}
            </SurfaceCard>
          ))
        ) : (
          <SurfaceCard style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="chart-timeline-variant"
              size={28}
              color={colors.accentCyan}
            />
            <Text style={styles.emptyTitle} i18nKey="bodyComposition.empty.title" />
            <Text style={styles.emptyBody} i18nKey="bodyComposition.empty.body" />
          </SurfaceCard>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  center: { minHeight: 320, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingTop: 8, paddingBottom: 48 },
  backLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  backText: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  heroBody: { maxWidth: 680, marginBottom: 22 },
  snapshotCard: {
    marginBottom: 16,
    backgroundColor: colors.surfaceInfo,
    borderColor: colors.borderInfo,
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  sectionEyebrow: {
    color: colors.accentCyan,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionTitle: { color: colors.textSoft, fontSize: 13, lineHeight: 18, marginTop: 4 },
  statusMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderInfo,
  },
  currentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  currentMetric: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 130,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceInfo,
    marginBottom: 10,
  },
  currentMetricLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  currentMetricValue: {
    color: colors.text,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  formCard: { marginBottom: 16, borderColor: colors.border },
  formTitle: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 4,
  },
  formHelper: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 18 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  formField: { flexGrow: 1, flexBasis: 190, minWidth: 145 },
  fieldLabel: { color: colors.textSoft, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  inputShell: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
  },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 11, minWidth: 0 },
  inputUnit: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginLeft: 8 },
  energyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 },
  energyChip: {
    minHeight: 38,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
  },
  energyChipActive: { borderColor: colors.borderSuccess, backgroundColor: colors.surfaceSuccess },
  energyLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  energyLabelActive: { color: colors.success },
  noteInput: {
    minHeight: 82,
    alignItems: 'flex-start',
    color: colors.text,
    fontSize: 14,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  saveButton: { marginTop: 16 },
  guidance: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 10,
    marginBottom: 18,
  },
  guidanceCopy: { flex: 1 },
  guidanceTitle: { color: colors.text, fontSize: 13, fontWeight: '800', marginBottom: 3 },
  guidanceBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  historyHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  historyTitle: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.3, marginTop: 3 },
  progressLink: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5 },
  progressLinkText: { color: colors.accentCyan, fontSize: 12, fontWeight: '800' },
  historyCard: { marginBottom: 10, borderColor: colors.borderSubtle },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  historyDate: { color: colors.text, fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  historyMeta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDanger,
  },
  historyMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  historyMetric: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontVariant: ['tabular-nums'],
  },
  historyNote: { color: colors.textMuted, fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginTop: 10 },
  emptyCard: { alignItems: 'center', paddingVertical: 28, backgroundColor: colors.surfaceAlt },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 10 },
  emptyBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 420, marginTop: 5 },
  errorCard: { marginBottom: 16, borderColor: colors.borderDanger, backgroundColor: colors.surfaceDanger },
  errorTitle: { color: colors.danger, fontSize: 14, fontWeight: '900' },
  errorBody: { color: colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 5 },
  retryButton: { marginTop: 12 },
}));
