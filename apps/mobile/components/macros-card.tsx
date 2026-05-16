import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SurfaceCard } from './ui-shell';

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
  const protein_g_per_kg = PROTEIN_G_PER_KG[goal ?? 'maintain'] ?? 1.6;
  const protein_target_g = Math.round(protein_g_per_kg * (weightKg ?? 70));
  const fat_pct = 25;
  const fat_kcal = Math.round((fat_pct / 100) * daily);
  const fat_g = Math.round(fat_kcal / 9);
  const protein_kcal = protein_target_g * 4;
  const remaining_kcal = Math.max(0, daily - (protein_kcal + fat_kcal));
  const carbs_g = Math.round(remaining_kcal / 4);
  const carbs_pct = Math.round(((carbs_g * 4) / Math.max(1, daily)) * 100);

  return { protein_target_g, protein_g_per_kg, fat_pct, fat_g, carbs_g, carbs_pct };
}

function computeNutritionTargets(daily: number): NutritionTargets {
  return {
    fiber_g_min: Math.round((daily / 1000) * 14),
    sodium_mg_max: 2300,
    free_sugar_g_max: Math.round((daily * 0.1) / 4),
    added_sugar_g_max: Math.round((daily * 0.1) / 4),
    saturated_fat_g_max: Math.round((daily * 0.1) / 9),
    free_sugar_pct_max: 10,
    saturated_fat_pct_max: 10,
    basis: 'Mục tiêu tổng quát: fiber 14 g/1000 kcal, sodium <2300 mg/ngày, đường tự do/added sugar <10% kcal, saturated fat <10% kcal.',
  };
}

export default function MacrosCard({ target, daily_calorie_target, weight_kg, goal }: Props) {
  const daily = target?.daily_calorie_target ?? daily_calorie_target ?? 0;

  let protein_target_g = target?.protein_target_g ?? null;
  let protein_g_per_kg = target?.protein_g_per_kg ?? null;
  let fat_pct = target?.fat_pct ?? null;
  let fat_g = target?.fat_g ?? null;
  let carbs_g = target?.carbs_g ?? null;
  let carbs_pct = target?.carbs_pct ?? null;

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
      <SurfaceCard style={styles.card}>
        <Text style={styles.title}>Phân bổ dinh dưỡng</Text>
        <Text style={styles.empty}>Chưa có mục tiêu calo để tính macros.</Text>
      </SurfaceCard>
    );
  }

  const nutrition = target?.nutrition_targets ?? computeNutritionTargets(daily);

  return (
    <SurfaceCard style={styles.card}>
      <Text style={styles.title}>Phân bổ dinh dưỡng</Text>
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Calo/ngày</Text>
          <Text style={styles.value}>{daily} kcal</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Protein</Text>
          <Text style={styles.value}>{protein_target_g ?? '-'} g {protein_g_per_kg ? `(${protein_g_per_kg} g/kg)` : ''}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Chất béo</Text>
          <Text style={styles.value}>{fat_pct ?? '-'}% · {fat_g ?? '-'} g</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Carbs</Text>
          <Text style={styles.value}>{carbs_g ?? '-'} g · {carbs_pct ?? '-'}%</Text>
        </View>
      </View>

      <View style={styles.qualityBlock}>
        <Text style={styles.qualityTitle}>Mục tiêu chất lượng</Text>
        <View style={styles.qualityGrid}>
          <Metric label="Fiber" value={`>= ${nutrition.fiber_g_min} g`} tone="good" />
          <Metric label="Sodium" value={`< ${nutrition.sodium_mg_max} mg`} tone="limit" />
          <Metric label="Đường tự do" value={`< ${nutrition.free_sugar_g_max} g`} tone="limit" />
          <Metric label="Sat fat" value={`< ${nutrition.saturated_fat_g_max} g`} tone="limit" />
        </View>
        <Text style={styles.qualityNote}>
          Đường trên nhãn/barcode có thể là total sugar; app chưa luôn phân biệt được free sugar và added sugar.
        </Text>
      </View>

      {!!target?.medical_review_recommended && (
        <Text style={styles.warning}>Hồ sơ có yếu tố sức khỏe cần chuyên gia xem lại trước khi dùng mục tiêu này.</Text>
      )}
      {!!target?.macro_warnings?.length && (
        <Text style={styles.warning}>{target.macro_warnings[0]}</Text>
      )}
    </SurfaceCard>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'good' | 'limit' }) {
  return (
    <View style={[styles.metricPill, tone === 'good' ? styles.metricGood : styles.metricLimit]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, borderColor: '#243a59' },
  title: { color: '#eff6ff', fontWeight: '700', fontSize: 14, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, gap: 10 },
  col: { flex: 1 },
  label: { color: '#b8c8e8', fontSize: 12 },
  value: { color: '#eff6ff', fontSize: 14, fontWeight: '700' },
  empty: { color: '#7082a9', fontSize: 13 },
  qualityBlock: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#243a59',
    gap: 8,
  },
  qualityTitle: { color: '#dbeafe', fontSize: 12, fontWeight: '800' },
  qualityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricPill: {
    minWidth: 118,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 2,
  },
  metricGood: { backgroundColor: '#0f2f22', borderColor: '#22c55e66' },
  metricLimit: { backgroundColor: '#172033', borderColor: '#3b82f666' },
  metricLabel: { color: '#9fb1d1', fontSize: 11, fontWeight: '700' },
  metricValue: { color: '#eff6ff', fontSize: 13, fontWeight: '800' },
  qualityNote: { color: '#8ea2c8', fontSize: 11, lineHeight: 16 },
  warning: { color: '#fcd34d', fontSize: 12, marginTop: 6, lineHeight: 17 },
});
