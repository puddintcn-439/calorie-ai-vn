import React from 'react';
import {
  StyleSheet,
  View
} from 'react-native';
import { SurfaceCard } from './ui-shell';
import { useAppTheme } from './theme';
import { Text } from './i18n-text';
import { I18nKey } from './i18n';
import { formatMacro, formatNumberVi, formatPercent, roundTo, safeNumber, safePositiveNumber, safeRound, toFiniteNumber } from '../services/number-format';

type NutritionTargets = {
  fiber_g_min: number;
  sodium_mg_max: number;
  free_sugar_g_max: number;
  added_sugar_g_max: number;
  saturated_fat_g_max: number;
  free_sugar_pct_max: number;
  saturated_fat_pct_max: number;
  basis: string;
};

type CalorieTargetResponse = {
  daily_calorie_target: number;
  bmr: number;
  tdee: number;
  bmi: number;
  body_status: string;
  weight_recommendation: string;
  recommended_goal: string;
  effective_goal?: string;
  recommendation_note: string;
  bmi_standard?: 'global_adult';
  bmi_interpretation?: 'screening_risk_not_diagnosis';
  target_breakfast_cal: number;
  target_lunch_cal: number;
  target_dinner_cal: number;
  target_snack_cal: number;
  calculation_date: string;
  protein_target_g?: number;
  protein_g_per_kg?: number;
  fat_pct?: number;
  fat_g?: number;
  carbs_g?: number;
  carbs_pct?: number;
  is_estimate?: boolean;
  safety_warnings?: string[];
  macro_warnings?: string[];
  medical_review_recommended?: boolean;
  nutrition_targets?: NutritionTargets;
};

type Props = {
  target?: CalorieTargetResponse | null;
  daily_calorie_target?: number;
  weight_kg?: number;
  goal?: 'lose_weight' | 'maintain' | 'gain_muscle';
};

const PROTEIN_G_PER_KG: Record<string, number> = {
  lose_weight: 1.6,
  maintain: 1.6,
  gain_muscle: 1.9,
};

function computeMacros(daily: number, weightKg: number | undefined, goal?: string) {
  const safeDaily = safePositiveNumber(daily, 0);
  const safeWeightKg = safePositiveNumber(weightKg, 70);
  const protein_g_per_kg = PROTEIN_G_PER_KG[goal ?? 'maintain'] ?? 1.6;
  const protein_target_g = safeRound(protein_g_per_kg * safeWeightKg);
  const fat_pct = 25;
  const fat_kcal = safeRound((fat_pct / 100) * safeDaily);
  const fat_g = safeRound(fat_kcal / 9);
  const protein_kcal = protein_target_g * 4;
  const remaining_kcal = Math.max(0, safeDaily - (protein_kcal + fat_kcal));
  const carbs_g = safeRound(remaining_kcal / 4);
  const carbs_pct = safeRound(((carbs_g * 4) / Math.max(1, safeDaily)) * 100);

  return { protein_target_g, protein_g_per_kg, fat_pct, fat_g, carbs_g, carbs_pct };
}

function computeNutritionTargets(daily: number): NutritionTargets {
  const safeDaily = safePositiveNumber(daily, 1800);
  return {
    fiber_g_min: safeRound((safeDaily / 1000) * 14),
    sodium_mg_max: 2300,
    free_sugar_g_max: safeRound((safeDaily * 0.1) / 4),
    added_sugar_g_max: safeRound((safeDaily * 0.1) / 4),
    saturated_fat_g_max: safeRound((safeDaily * 0.1) / 9),
    free_sugar_pct_max: 10,
    saturated_fat_pct_max: 10,
    basis: 'screen.components.macrosCard.basis',
  };
}

export default function MacrosCard({ target, daily_calorie_target, weight_kg, goal }: Props) {
  const { colors } = useAppTheme();
  const daily = safeNumber(target?.daily_calorie_target ?? daily_calorie_target);

  let protein_target_g = toFiniteNumber(target?.protein_target_g);
  let protein_g_per_kg = toFiniteNumber(target?.protein_g_per_kg);
  let fat_pct = toFiniteNumber(target?.fat_pct);
  let fat_g = toFiniteNumber(target?.fat_g);
  let carbs_g = toFiniteNumber(target?.carbs_g);
  let carbs_pct = toFiniteNumber(target?.carbs_pct);

  if ((!protein_target_g || !fat_g || !carbs_g) && daily && weight_kg) {
    const computed = computeMacros(daily, weight_kg, goal);
    protein_target_g = protein_target_g ?? computed.protein_target_g;
    protein_g_per_kg = protein_g_per_kg ?? computed.protein_g_per_kg;
    fat_pct = fat_pct ?? computed.fat_pct;
    fat_g = fat_g ?? computed.fat_g;
    carbs_g = carbs_g ?? computed.carbs_g;
    carbs_pct = carbs_pct ?? computed.carbs_pct;
  }

  if (!daily) {
    return (
      <SurfaceCard style={[styles.card, { borderColor: colors.borderInfo }]}>
        <Text style={[styles.title, { color: colors.text }]} i18nKey="screen.components.macrosCard.text.001" />
        <Text style={[styles.empty, { color: colors.textMuted }]} i18nKey="screen.components.macrosCard.text.002" />
      </SurfaceCard>
    );
  }

  const nutrition = target?.nutrition_targets ?? computeNutritionTargets(daily);

  return (
    <SurfaceCard style={[styles.card, { borderColor: colors.borderInfo }]}>
      <Text style={[styles.title, { color: colors.text }]} i18nKey="screen.components.macrosCard.text.001" />
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={[styles.label, { color: colors.textSoft }]} i18nKey="screen.components.macrosCard.text.003" />
          <Text style={[styles.value, { color: colors.text }]}>{formatNumberVi(daily)} kcal</Text>
        </View>
        <View style={styles.col}>
          <Text style={[styles.label, { color: colors.textSoft }]} i18nKey="screen.components.macrosCard.text.004" />
          <Text style={[styles.value, { color: colors.text }]}>
            {protein_target_g !== null ? formatMacro(protein_target_g) : '-'} {protein_g_per_kg ? `(${roundTo(protein_g_per_kg, 1)} g/kg)` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={[styles.label, { color: colors.textSoft }]} i18nKey="screen.components.macrosCard.text.005" />
          <Text style={[styles.value, { color: colors.text }]}>{fat_pct !== null ? formatPercent(fat_pct) : '-'} · {fat_g !== null ? formatMacro(fat_g) : '-'}</Text>
        </View>
        <View style={styles.col}>
          <Text style={[styles.label, { color: colors.textSoft }]} i18nKey="screen.components.macrosCard.text.006" />
          <Text style={[styles.value, { color: colors.text }]}>{carbs_g !== null ? formatMacro(carbs_g) : '-'} · {carbs_pct !== null ? formatPercent(carbs_pct) : '-'}</Text>
        </View>
      </View>

      <View style={[styles.qualityBlock, { borderTopColor: colors.borderSubtle }]}>
        <Text style={[styles.qualityTitle, { color: colors.text }]} i18nKey="screen.components.macrosCard.text.007" />
        <View style={styles.qualityGrid}>
          <Metric label="screen.components.macrosCard.label.001" value={`>= ${formatMacro(nutrition.fiber_g_min)}`} tone="good" />
          <Metric label="screen.components.macrosCard.label.002" value={`< ${formatNumberVi(nutrition.sodium_mg_max)} mg`} tone="limit" />
          <Metric label="screen.components.macrosCard.label.003" value={`< ${formatMacro(nutrition.free_sugar_g_max)}`} tone="limit" />
          <Metric label="screen.components.macrosCard.label.004" value={`< ${formatMacro(nutrition.saturated_fat_g_max)}`} tone="limit" />
        </View>
        <Text style={[styles.qualityNote, { color: colors.textMuted }]} i18nKey="screen.components.macrosCard.qualityNote" />
      </View>

      {!!target?.medical_review_recommended && (
        <Text style={[styles.warning, { color: colors.warning }]} i18nKey="screen.components.macrosCard.medicalWarning" />
      )}
      {!!target?.macro_warnings?.length && (
        <Text style={[styles.warning, { color: colors.warning }]}>{target.macro_warnings[0]}</Text>
      )}
    </SurfaceCard>
  );
}

function Metric({ label, value, tone }: { label: I18nKey; value: string; tone: 'good' | 'limit' }) {
  const { colors } = useAppTheme();
  const toneStyle = tone === 'good'
    ? { backgroundColor: colors.surfaceSuccess, borderColor: colors.borderSuccess }
    : { backgroundColor: colors.surfaceInfo, borderColor: colors.borderInfo };

  return (
    <View style={[styles.metricPill, toneStyle]}>
      <Text style={[styles.metricLabel, { color: colors.textMuted }]} i18nKey={label} />
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12 },
  title: { fontWeight: '700', fontSize: 14, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, gap: 10 },
  col: { flex: 1 },
  label: { fontSize: 12 },
  value: { fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 13 },
  qualityBlock: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  qualityTitle: { fontSize: 12, fontWeight: '800' },
  qualityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricPill: {
    minWidth: 118,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 2,
  },
  metricLabel: { fontSize: 11, fontWeight: '700' },
  metricValue: { fontSize: 13, fontWeight: '800' },
  qualityNote: { fontSize: 11, lineHeight: 16 },
  warning: { fontSize: 12, marginTop: 6, lineHeight: 17 },
});
