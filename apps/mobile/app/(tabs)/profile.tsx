import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  View,
  ActivityIndicator,
  useWindowDimensions,
  Switch,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput
} from 'react-native';
import { Linking, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { useReminderStore } from '../../store/reminder.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import { useLogStore } from '../../store/log.store';
import { useCalorieTargetStore } from '../../store/calorie-target.store';
import { useInsightsStore } from '../../store/insights.store';
import { useThemeStore } from '../../store/theme.store';
import { apiClient } from '../../services/api';
import { User, ActivityLevel, UserGoal, HealthFlag, GoalPlan, ReminderPreferences, ActivityType, ActivityLog, HydrationScheduleSlot, ACTIVITY_LABELS as EXERCISE_ACTIVITY_LABELS, SUBSCRIPTION_TIERS, SubscriptionFeatures, SubscriptionTier, DailyNutritionTarget } from '@calorie-ai/types';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiChip } from '../../components/ui-chip';
import { UiInput } from '../../components/ui-input';
import MacrosCard from '../../components/macros-card';
import { AnimatedMaterialIcon } from '../../components/animated-icon';
import { RewardToast, RewardToastData } from '../../components/reward-toast';
import { createThemedStyles, useAppTheme } from '../../components/theme';
import { useI18n } from '../../components/i18n';
import type { I18nKey } from '../../components/i18n';
import {
  calorieTargetService,
  CalorieCalculationMethodology,
  isCalorieTargetReady,
} from '../../services/calorie-target.service';
import { buildSystemHydrationSlots, hydrationScheduleTotal, normalizeHydrationSlots } from '../../services/hydration-schedule';
import { pushNotificationService } from '../../services/push-notification.service';

const TARGET_METRIC_LABELS: Record<string, string> = {
  calories_kcal: 'Năng lượng',
  protein_g: 'Protein',
  carbs_g: 'Carbohydrate',
  fat_g: 'Chất béo',
  fiber_g: 'Chất xơ',
  water_ml: 'Nước',
  sodium_mg_max: 'Natri tối đa',
  free_sugar_g_max: 'Đường tự do tối đa',
  saturated_fat_g_max: 'Chất béo bão hòa tối đa',
};

const EVIDENCE_LEVEL_LABELS: Record<string, string> = {
  guideline: 'Theo hướng dẫn',
  validated_equation: 'Phương trình đã kiểm chứng',
  guideline_range_with_product_default: 'Mặc định trong khoảng hướng dẫn',
  evidence_informed_heuristic: 'Ước tính có tham chiếu',
  product_guardrail: 'Giới hạn an toàn của sản phẩm',
  clinician_target: 'Kế hoạch chuyên gia',
};

const ACTIVITY_LABELS: Record<ActivityLevel, I18nKey> = {
  sedentary: 'profile.activityLabel.sedentary',
  light: 'profile.activityLabel.light',
  moderate: 'profile.activityLabel.moderate',
  active: 'profile.activityLabel.active',
  very_active: 'profile.activityLabel.veryActive',
};
const WORK_ACTIVITY_LABELS: Record<NonNullable<User['work_activity_level']>, string> = {
  sedentary: 'Chủ yếu ngồi',
  light: 'Đi lại nhẹ',
  moderate: 'Lao động vừa',
  heavy: 'Lao động nặng',
};
const SWEAT_LEVEL_LABELS: Record<NonNullable<User['sweat_level']>, string> = {
  low: 'Ít đổ mồ hôi',
  moderate: 'Trung bình',
  high: 'Đổ mồ hôi nhiều',
};

const CLIMATE_OPTIONS: Array<{
  key: NonNullable<User['climate_exposure']>;
  label: string;
  description: string;
  adjustmentMl: number;
  icon: keyof typeof MaterialIcons.glyphMap;
}> = [
  { key: 'cool_controlled', label: 'Mát / điều hòa', description: 'Phần lớn thời gian trong môi trường mát', adjustmentMl: 0, icon: 'ac-unit' },
  { key: 'temperate', label: 'Ôn hòa', description: 'Nhiệt độ dễ chịu, ít đổ mồ hôi vì nóng', adjustmentMl: 0, icon: 'wb-cloudy' },
  { key: 'hot_humid', label: 'Nóng ẩm', description: 'Khí hậu nóng ẩm thường ngày', adjustmentMl: 250, icon: 'water-drop' },
  { key: 'extreme_heat', label: 'Rất nóng / ngoài trời', description: 'Phơi nóng kéo dài hoặc làm việc ngoài trời', adjustmentMl: 500, icon: 'wb-sunny' },
];

const GOAL_LABELS: Record<UserGoal, I18nKey> = {
  lose_weight: 'profile.goalLabel.loseWeight',
  maintain: 'profile.goalLabel.maintain',
  gain_muscle: 'profile.goalLabel.gainMuscle',
};

type ProfileDetailAnchor =
  | 'body'
  | 'health'
  | 'water'
  | 'activity'
  | 'goalPlan'
  | 'roadmap'
  | 'notifications'
  | 'subscription';

const PROFILE_DETAIL_TITLES: Record<ProfileDetailAnchor, string> = {
  body: 'Chi tiết: Cơ thể',
  health: 'Chi tiết: Sức khỏe & an toàn',
  water: 'Chi tiết: Nước',
  activity: 'Chi tiết: Hoạt động',
  goalPlan: 'Chi tiết: Lộ trình mục tiêu',
  roadmap: 'Chi tiết: Lịch vận động',
  notifications: 'Chi tiết: Nhắc nhở',
  subscription: 'Chi tiết: Gói dịch vụ',
};

const HEALTH_FLAG_LABELS: Record<HealthFlag, I18nKey> = {
  pregnant: 'profile.healthFlag.pregnant',
  breastfeeding: 'profile.healthFlag.breastfeeding',
  kidney_disease: 'profile.healthFlag.kidneyDisease',
  diabetes: 'profile.healthFlag.diabetes',
  eating_disorder_history: 'profile.healthFlag.eatingDisorder',
  weight_affecting_medication: 'profile.healthFlag.weightMedication',
};

const HEALTH_FLAGS: HealthFlag[] = [
  'pregnant',
  'breastfeeding',
  'kidney_disease',
  'diabetes',
  'eating_disorder_history',
  'weight_affecting_medication',
];

type BodyStatus = 'underweight' | 'normal' | 'overweight' | 'obese';
type WeightRecommendation = 'increase' | 'maintain' | 'decrease';

type CalorieAssessment = {
  bmi: number;
  body_status: BodyStatus;
  weight_recommendation: WeightRecommendation;
  recommended_goal: UserGoal;
  recommendation_note: string;
  safety_warnings: string[];
  health_flags: HealthFlag[];
  medical_review_recommended: boolean;
  target_weight_kg: number;
  weight_delta_kg: number;
  recommended_activity_level: ActivityLevel;
  activity_note: string;
  exercise_plan: string[];
};

type InstantAssessmentResult = {
  assessment: CalorieAssessment | null;
  hint: string;
};

type ProfileCompletionStatus = 'required' | 'partial' | 'complete';

function getProfileCompletionStatus(
  currentChecks: boolean[],
  savedChecks: boolean[],
  matchesSaved: boolean,
): ProfileCompletionStatus {
  const hasCurrentData = currentChecks.some(Boolean);
  const currentComplete = currentChecks.every(Boolean);
  const savedComplete = savedChecks.every(Boolean);

  if (currentComplete && savedComplete && matchesSaved) return 'complete';
  return hasCurrentData ? 'partial' : 'required';
}

function valuesMatch(current: unknown[], saved: unknown[]): boolean {
  return JSON.stringify(current) === JSON.stringify(saved);
}

type ExerciseRoadmapItem = {
  id: string;
  task_id?: string;
  title: string;
  detail: string;
  activity_type: ActivityType;
  duration_min: number;
  estimated_kcal: number;
  is_custom?: boolean;
  persisted_item_id?: string;
};

const BODY_STATUS_LABELS: Record<BodyStatus, I18nKey> = {
  underweight: 'profile.bodyStatus.underweight',
  normal: 'profile.bodyStatus.normal',
  overweight: 'profile.bodyStatus.overweight',
  obese: 'profile.bodyStatus.obese',
};

const WEIGHT_RECOMMENDATION_LABELS: Record<WeightRecommendation, I18nKey> = {
  increase: 'profile.weightRecommendation.increase',
  maintain: 'profile.weightRecommendation.maintain',
  decrease: 'profile.weightRecommendation.decrease',
};

const ACTIVITY_RECOMMENDATION_LABELS: Record<ActivityLevel, I18nKey> = {
  sedentary: 'profile.activityRecommendation.sedentary',
  light: 'profile.activityRecommendation.light',
  moderate: 'profile.activityRecommendation.moderate',
  active: 'profile.activityRecommendation.active',
  very_active: 'profile.activityRecommendation.veryActive',
};

function getBodyStatusTone(status: BodyStatus, colors: Record<string, string>): { bg: string; border: string; accent: string; text: string; badgeBg: string } {
  const tones: Record<BodyStatus, { bg: string; border: string; accent: string; text: string; badgeBg: string }> = {
    underweight: {
      bg: colors.surfaceInfo,
      border: colors.borderInfo,
      accent: colors.info,
      text: colors.textSoft,
      badgeBg: colors.surfaceInfo,
    },
    normal: {
      bg: colors.surfaceSuccess,
      border: colors.success,
      accent: colors.success,
      text: colors.textSoft,
      badgeBg: colors.surfaceSuccess,
    },
    overweight: {
      bg: colors.surfaceWarning,
      border: colors.warning,
      accent: colors.warning,
      text: colors.textSoft,
      badgeBg: colors.surfaceWarning,
    },
    obese: {
      bg: colors.surfaceDanger,
      border: colors.danger,
      accent: colors.danger,
      text: colors.borderDanger,
      badgeBg: colors.surfaceDanger,
    },
  };
  return tones[status];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseOptionalNumberInput(value: string): number | undefined {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

type GoalPaceSuggestion = {
  weeklyRange: string;
  durationRange: string;
  suggestedDurationWeeks?: number;
  context: string;
  needsClinicalReview: boolean;
};

function buildGoalPaceSuggestion(
  profile: Partial<User>,
  direction: 'loss' | 'maintain' | 'gain',
  targetKg?: number,
): GoalPaceSuggestion {
  const sessions = Math.max(0, Number(profile.exercise_sessions_per_week ?? 0));
  const minutes = Math.max(0, Number(profile.exercise_minutes_per_session ?? 0));
  const weeklyExerciseMinutes = sessions * minutes;
  const flags = normaliseHealthFlags(profile.health_flags);
  const needsClinicalReview = flags.length > 0 || Boolean(profile.age && (profile.age < 18 || profile.age >= 65));

  if (direction === 'maintain') {
    return {
      weeklyRange: 'Giữ cân trong biên độ khoảng ±0,5 kg',
      durationRange: 'Theo dõi 4–8 tuần rồi đánh giá lại',
      suggestedDurationWeeks: 6,
      context: weeklyExerciseMinutes >= 150
        ? 'Bạn đang vận động khá đều; ưu tiên giữ lượng ăn và lịch tập ổn định.'
        : 'Ưu tiên một lịch ăn và vận động đều đặn trước khi đánh giá xu hướng cân nặng.',
      needsClinicalReview,
    };
  }

  let minRate = direction === 'loss' ? 0.25 : 0.1;
  let maxRate = direction === 'loss' ? 0.75 : 0.25;
  const activityContext = weeklyExerciseMinutes >= 300
    ? 'tần suất vận động cao'
    : weeklyExerciseMinutes >= 150
      ? 'tần suất vận động đạt mức khá'
      : weeklyExerciseMinutes > 0
        ? 'tần suất vận động còn nhẹ'
        : 'chưa có lịch vận động rõ ràng';

  if (weeklyExerciseMinutes < 90) {
    maxRate = direction === 'loss' ? 0.5 : 0.2;
  } else if (weeklyExerciseMinutes >= 300 && direction === 'gain') {
    maxRate = 0.3;
  }

  if (profile.age && profile.age >= 65) {
    minRate = 0.1;
    maxRate = direction === 'loss' ? 0.25 : 0.2;
  }

  if (flags.length > 0 || (profile.age && profile.age < 18)) {
    minRate = 0.1;
    maxRate = 0.25;
  }

  const validTarget = targetKg && targetKg >= 0.1 ? targetKg : undefined;
  const minWeeks = validTarget ? Math.max(1, Math.ceil(validTarget / maxRate)) : undefined;
  const maxWeeks = validTarget ? Math.max(minWeeks ?? 1, Math.ceil(validTarget / minRate)) : undefined;

  return {
    weeklyRange: `${round1(minRate)}–${round1(maxRate)} kg/tuần`,
    durationRange: minWeeks && maxWeeks
      ? `Khoảng ${minWeeks}–${maxWeeks} tuần cho ${round1(validTarget ?? 0)} kg`
      : 'Nhập số kg để ước tính khoảng thời gian phù hợp',
    suggestedDurationWeeks: minWeeks && maxWeeks ? Math.round((minWeeks + maxWeeks) / 2) : undefined,
    context: direction === 'loss'
      ? `Khoảng này ưu tiên giữ cơ và được điều chỉnh theo ${activityContext}.`
      : `Tăng chậm giúp hạn chế tăng mỡ; kết quả còn phụ thuộc tập sức mạnh và protein (${activityContext}).`,
    needsClinicalReview,
  };
}

function ageFromDateOfBirth(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const birthDate = new Date(`${value}T00:00:00.000Z`);
  const now = new Date();
  if (Number.isNaN(birthDate.getTime()) || birthDate > now) return undefined;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayPassed = now.getUTCMonth() > birthDate.getUTCMonth()
    || (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age >= 13 && age <= 120 ? age : undefined;
}

function buildExercisePlan(
  level: ActivityLevel,
  recommendation: WeightRecommendation,
  bodyStatus: BodyStatus,
): I18nKey[] {
  if (bodyStatus === 'underweight') {
    return [
      'profile.exercisePlan.underweight.1',
      'profile.exercisePlan.underweight.2',
      'profile.exercisePlan.underweight.3',
      'profile.exercisePlan.underweight.4',
    ];
  }

  if (bodyStatus === 'normal') {
    return [
      'profile.exercisePlan.normal.1',
      'profile.exercisePlan.normal.2',
      'profile.exercisePlan.normal.3',
      'profile.exercisePlan.normal.4',
    ];
  }

  if (bodyStatus === 'obese') {
    return [
      'profile.exercisePlan.obese.1',
      'profile.exercisePlan.obese.2',
      'profile.exercisePlan.obese.3',
      'profile.exercisePlan.obese.4',
    ];
  }

  if (level === 'active' || level === 'very_active') {
    return [
      'profile.exercisePlan.active.1',
      'profile.exercisePlan.active.2',
      'profile.exercisePlan.active.3',
      'profile.exercisePlan.active.4',
    ];
  }

  if (level === 'moderate') {
    return [
      'profile.exercisePlan.moderate.1',
      'profile.exercisePlan.moderate.2',
      'profile.exercisePlan.moderate.3',
      'profile.exercisePlan.moderate.4',
    ];
  }

  if (recommendation === 'decrease') {
    return [
      'profile.exercisePlan.decrease.1',
      'profile.exercisePlan.decrease.2',
      'profile.exercisePlan.decrease.3',
      'profile.exercisePlan.decrease.4',
    ];
  }

  return [
    'profile.exercisePlan.default.1',
    'profile.exercisePlan.default.2',
    'profile.exercisePlan.default.3',
  ];
}

import { estimateExerciseCalories as _estimateExerciseCalories } from '../../services/exercise.service';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';

function estimateExerciseCalories(activityType: ActivityType, durationMin: number, weightKg: number): number {
  return _estimateExerciseCalories(activityType, durationMin, weightKg);
}

function parseRoadmapNote(notes?: string): { taskId: string; taskTitle: string } | null {
  if (!notes || !notes.startsWith('ROADMAP_TASK:')) return null;
  const payload = notes.replace('ROADMAP_TASK:', '');
  const [taskId, taskTitle = 'profile.roadmap.defaultTask'] = payload.split('|');
  if (!taskId) return null;
  return { taskId, taskTitle };
}

function nearestCatalogDuration(durationMin: number): 15 | 30 | 45 | 60 {
  const options = [15, 30, 45, 60] as const;
  return options.reduce((best, option) => (
    Math.abs(option - durationMin) < Math.abs(best - durationMin) ? option : best
  ), 30 as 15 | 30 | 45 | 60);
}

function buildExerciseRoadmap(
  bodyStatus: BodyStatus,
  activityLevel: ActivityLevel,
  recommendation: WeightRecommendation,
  weightKg: number,
): ExerciseRoadmapItem[] {
  const key = `${bodyStatus}-${activityLevel}-${recommendation}`;

  const basePlan: Omit<ExerciseRoadmapItem, 'id' | 'estimated_kcal'>[] =
    bodyStatus === 'underweight'
      ? [
          {
            title: 'profile.roadmap.underweight.1.title',
            detail: 'profile.roadmap.underweight.1.detail',
            activity_type: 'gym',
            duration_min: 35,
          },
          {
            title: 'profile.roadmap.underweight.2.title',
            detail: 'profile.roadmap.underweight.2.detail',
            activity_type: 'walking',
            duration_min: 20,
          },
          {
            title: 'Core + mobility',
            detail: 'profile.roadmap.underweight.3.detail',
            activity_type: 'yoga',
            duration_min: 18,
          },
        ]
      : bodyStatus === 'normal'
        ? [
            {
              title: 'profile.roadmap.normal.1.title',
              detail: 'profile.roadmap.normal.1.detail',
              activity_type: 'walking',
              duration_min: 30,
            },
            {
              title: 'profile.roadmap.normal.2.title',
              detail: 'profile.roadmap.normal.2.detail',
              activity_type: 'gym',
              duration_min: 30,
            },
            {
              title: 'profile.roadmap.normal.3.title',
              detail: 'profile.roadmap.normal.3.detail',
              activity_type: 'yoga',
              duration_min: 20,
            },
          ]
        : bodyStatus === 'obese'
          ? [
              {
                title: 'profile.roadmap.obese.1.title',
                detail: 'profile.roadmap.obese.1.detail',
                activity_type: 'walking',
                duration_min: 35,
              },
              {
                title: 'profile.roadmap.obese.2.title',
                detail: 'profile.roadmap.obese.2.detail',
                activity_type: 'gym',
                duration_min: 25,
              },
              {
                title: 'profile.roadmap.obese.3.title',
                detail: 'profile.roadmap.obese.3.detail',
                activity_type: 'cycling',
                duration_min: 20,
              },
            ]
          : activityLevel === 'active' || activityLevel === 'very_active'
            ? [
                {
                  title: 'profile.roadmap.active.1.title',
                  detail: 'profile.roadmap.active.1.detail',
                  activity_type: 'running',
                  duration_min: 35,
                },
                {
                  title: 'profile.roadmap.active.2.title',
                  detail: 'profile.roadmap.active.2.detail',
                  activity_type: 'gym',
                  duration_min: 35,
                },
                {
                  title: 'profile.roadmap.active.3.title',
                  detail: 'profile.roadmap.active.3.detail',
                  activity_type: 'walking',
                  duration_min: 20,
                },
              ]
            : [
                {
                  title: 'profile.roadmap.default.1.title',
                  detail: 'profile.roadmap.default.1.detail',
                  activity_type: 'walking',
                  duration_min: 30,
                },
                {
                  title: 'profile.roadmap.default.2.title',
                  detail: 'profile.roadmap.default.2.detail',
                  activity_type: 'gym',
                  duration_min: 25,
                },
                {
                  title: 'profile.roadmap.default.3.title',
                  detail: 'profile.roadmap.default.3.detail',
                  activity_type: 'yoga',
                  duration_min: 15,
                },
              ];

  return basePlan.map((item, index) => ({
    ...item,
    id: `${key}-${index + 1}`,
    estimated_kcal: estimateExerciseCalories(item.activity_type, item.duration_min, weightKg),
  }));
}

function normaliseHealthFlags(flags: unknown): HealthFlag[] {
  if (!Array.isArray(flags)) return [];
  return [...new Set(flags.filter((flag): flag is HealthFlag => HEALTH_FLAGS.includes(flag as HealthFlag)))];
}

function requiresMedicalReview(age: number | undefined, flags: HealthFlag[]): boolean {
  return (!!age && age < 18) || flags.length > 0;
}

function forcesMaintenanceGoal(age: number | undefined, flags: HealthFlag[]): boolean {
  return (!!age && age < 18)
    || flags.includes('pregnant')
    || flags.includes('breastfeeding')
    || flags.includes('eating_disorder_history');
}

function buildInstantAssessment(profile: Partial<User>): InstantAssessmentResult {
  const weight = profile.weight_kg;
  const height = profile.height_cm;
  const healthFlags = normaliseHealthFlags(profile.health_flags);

  if (!weight || !height || weight <= 0 || height <= 0) {
    return {
      assessment: null,
      hint: 'profile.assessment.missingHint',
    };
  }

  const heightM = height / 100;
  const bmi = round1(weight / (heightM * heightM));
  const healthyMinWeight = round1(18.5 * heightM * heightM);
  const healthyMaxWeight = round1(24.9 * heightM * heightM);
  const safetyWarnings: string[] = [
    'profile.assessment.safety.bmi',
  ];
  if (profile.age && profile.age < 18) {
    safetyWarnings.push('profile.assessment.safety.minorTarget');
    safetyWarnings.push('profile.assessment.safety.minorBmi');
  }
  if (healthFlags.includes('pregnant') || healthFlags.includes('breastfeeding')) {
    safetyWarnings.push('profile.assessment.safety.pregnancy');
  }
  if (healthFlags.includes('kidney_disease')) {
    safetyWarnings.push('profile.assessment.safety.kidney');
  }
  if (healthFlags.includes('diabetes')) {
    safetyWarnings.push('profile.assessment.safety.diabetes');
  }
  if (healthFlags.includes('eating_disorder_history')) {
    safetyWarnings.push('profile.assessment.safety.eatingDisorder');
  }
  if (healthFlags.includes('weight_affecting_medication')) {
    safetyWarnings.push('profile.assessment.safety.medication');
  }

  let bodyStatus: BodyStatus;
  let weightRecommendation: WeightRecommendation;
  let recommendedGoal: UserGoal;
  let targetWeightKg: number;
  let recommendedActivityLevel: ActivityLevel;
  let recommendationNote: string;
  let activityNote: string;

  if (bmi < 18.5) {
    bodyStatus = 'underweight';
    weightRecommendation = 'increase';
    recommendedGoal = 'gain_muscle';
    targetWeightKg = healthyMinWeight;
    recommendedActivityLevel = 'light';
    recommendationNote = 'profile.assessment.note.underweight';
    activityNote = 'profile.assessment.activityNote.underweight';
  } else if (bmi < 25) {
    bodyStatus = 'normal';
    weightRecommendation = 'maintain';
    recommendedGoal = 'maintain';
    targetWeightKg = round1(weight);
    recommendedActivityLevel = 'moderate';
    recommendationNote = 'profile.assessment.note.normal';
    activityNote = 'profile.assessment.activityNote.normal';
  } else if (bmi < 30) {
    bodyStatus = 'overweight';
    weightRecommendation = 'decrease';
    recommendedGoal = 'lose_weight';
    targetWeightKg = healthyMaxWeight;
    recommendedActivityLevel = 'moderate';
    recommendationNote = 'profile.assessment.note.overweight';
    activityNote = 'profile.assessment.activityNote.overweight';
  } else {
    bodyStatus = 'obese';
    weightRecommendation = 'decrease';
    recommendedGoal = 'lose_weight';
    targetWeightKg = healthyMaxWeight;
    recommendedActivityLevel = 'active';
    recommendationNote = 'profile.assessment.note.obese';
    activityNote = 'profile.assessment.activityNote.obese';
  }

  if (forcesMaintenanceGoal(profile.age, healthFlags)) {
    weightRecommendation = 'maintain';
    recommendedGoal = 'maintain';
    recommendationNote = 'profile.assessment.note.medicalReview';
  }

  const weightDeltaKg = round1(Math.abs(targetWeightKg - weight));
  const exercisePlan = buildExercisePlan(
    recommendedActivityLevel,
    weightRecommendation,
    bodyStatus,
  );

  return {
    assessment: {
      bmi,
      body_status: bodyStatus,
      weight_recommendation: weightRecommendation,
      recommended_goal: recommendedGoal,
      recommendation_note: recommendationNote,
      safety_warnings: safetyWarnings,
      health_flags: healthFlags,
      medical_review_recommended: requiresMedicalReview(profile.age, healthFlags),
      target_weight_kg: targetWeightKg,
      weight_delta_kg: weightDeltaKg,
      recommended_activity_level: recommendedActivityLevel,
      activity_note: activityNote,
      exercise_plan: exercisePlan,
    },
    hint: 'profile.assessment.healthyRangeHint',
  };
}

export default function ProfileScreen() {
  const { requestedMode, colors } = useAppTheme();
  const completionParams = useLocalSearchParams<{ focus?: string; focusAt?: string }>();
  const { setThemeMode } = useThemeStore();
  const { logout } = useAuthStore();
  const { locale, setLocale, t, tx } = useI18n();
  const {
    preferences: reminderPrefs,
    effectiveness: reminderEffectiveness,
    previewNudge,
    isPreviewLoading,
    fetchPreferences: fetchReminders,
    fetchEffectiveness: fetchReminderEffectiveness,
    updatePreferences: updateReminders,
    fetchPreviewNudge,
  } = useReminderStore();
  const { subscription, features, fetchSubscription, changeTier, isLoading: isSubscriptionLoading } = useSubscriptionStore();
  const {
    activityLogs,
    activityPreferences,
    fetchDailyLog,
    fetchActivityLogs,
    deleteActivity,
    fetchActivityPreferences,
    addActivityPreference,
    updateActivityPreference,
    deleteActivityPreference,
  } = useLogStore();
  const { fetchRecommendations } = useCalorieTargetStore();
  const { fetchWeeklyInsights } = useInsightsStore();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<Partial<User>>({});
  const [savedProfile, setSavedProfile] = useState<Partial<User>>({});
  const [nutritionTarget, setNutritionTarget] = useState<DailyNutritionTarget | null>(null);
  const [reminders, setReminders] = useState<Partial<ReminderPreferences>>({});
  const [previewMeal, setPreviewMeal] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [basicCollapsed, setBasicCollapsed] = useState(true);
  const [assessmentCollapsed, setAssessmentCollapsed] = useState(true);
  const [notificationsCollapsed, setNotificationsCollapsed] = useState(true);
  const [goalCollapsed, setGoalCollapsed] = useState(true);
  const [calorieCollapsed, setCalorieCollapsed] = useState(true);
  const [subscriptionCollapsed, setSubscriptionCollapsed] = useState(true);
  const [quickSetting, setQuickSetting] = useState<'language' | 'appearance' | null>(null);
  const [showProfileDetails, setShowProfileDetails] = useState(false);
  const [activeProfileDetailAnchor, setActiveProfileDetailAnchor] = useState<ProfileDetailAnchor>('body');
  const [showTargetEvidence, setShowTargetEvidence] = useState(false);
  const [showTargetCalculation, setShowTargetCalculation] = useState(false);
  const [waterMethodExpanded, setWaterMethodExpanded] = useState(false);
  const [calorieMethodology, setCalorieMethodology] = useState<CalorieCalculationMethodology | null>(null);
  const [clinicalPlanConfirmed, setClinicalPlanConfirmed] = useState(false);
  const [goalPlanTargetKg, setGoalPlanTargetKg] = useState<number | undefined>(undefined);
  const [goalPlanDurationWeeks, setGoalPlanDurationWeeks] = useState<number | undefined>(undefined);
  const [goalPlanDurationEdited, setGoalPlanDurationEdited] = useState(false);
  const [goalPlanDirection, setGoalPlanDirection] = useState<'loss' | 'maintain' | 'gain'>('loss');
  const [goalPlanCleared, setGoalPlanCleared] = useState(false);
  const [roadmapCatalogVisible, setRoadmapCatalogVisible] = useState(false);
  const [roadmapCatalogType, setRoadmapCatalogType] = useState<ActivityType | null>(null);
  const [roadmapCatalogDuration, setRoadmapCatalogDuration] = useState<15 | 30 | 45 | 60>(30);
  const [editingRoadmapTask, setEditingRoadmapTask] = useState<ExerciseRoadmapItem | null>(null);
  const [reward, setReward] = useState<RewardToastData | null>(null);
  const highlightAnim = React.useRef(new Animated.Value(0)).current;
  const highlightLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const useNativeHighlightDriver = Platform.OS !== 'web';
  const isDesktop = width >= 900;
  const selectedHealthFlags = normaliseHealthFlags(profile.health_flags);
  const savedHealthFlags = normaliseHealthFlags(savedProfile.health_flags);
  const activeGoalPlan = profile.goal_plan ?? null;
  const goalPaceSuggestion = useMemo(
    () => buildGoalPaceSuggestion(profile, goalPlanDirection, goalPlanTargetKg),
    [
      goalPlanDirection,
      goalPlanTargetKg,
      profile.age,
      profile.exercise_minutes_per_session,
      profile.exercise_sessions_per_week,
      profile.health_flags,
    ],
  );
  const bodyCompletionStatus = getProfileCompletionStatus(
    [Boolean(profile.weight_kg), Boolean(profile.height_cm), Boolean(profile.age), Boolean(profile.gender)],
    [Boolean(savedProfile.weight_kg), Boolean(savedProfile.height_cm), Boolean(savedProfile.age), Boolean(savedProfile.gender)],
    valuesMatch(
      [profile.weight_kg, profile.height_cm, profile.age, profile.gender],
      [savedProfile.weight_kg, savedProfile.height_cm, savedProfile.age, savedProfile.gender],
    ),
  );
  const activityCompletionStatus = getProfileCompletionStatus(
    [
      Boolean(profile.work_activity_level),
      profile.exercise_sessions_per_week !== undefined,
      profile.exercise_minutes_per_session !== undefined,
    ],
    [
      Boolean(savedProfile.work_activity_level),
      savedProfile.exercise_sessions_per_week !== undefined,
      savedProfile.exercise_minutes_per_session !== undefined,
    ],
    valuesMatch(
      [profile.work_activity_level, profile.exercise_sessions_per_week, profile.exercise_minutes_per_session],
      [savedProfile.work_activity_level, savedProfile.exercise_sessions_per_week, savedProfile.exercise_minutes_per_session],
    ),
  );
  const safetyCompletionStatus = getProfileCompletionStatus(
    [Array.isArray(profile.health_flags)],
    [Array.isArray(savedProfile.health_flags)],
    valuesMatch(selectedHealthFlags, savedHealthFlags),
  );
  const currentGoalPlanComplete = Boolean(profile.goal)
    && Boolean(goalPlanDurationWeeks && goalPlanDurationWeeks > 0)
    && (goalPlanDirection === 'maintain' || Boolean(goalPlanTargetKg && goalPlanTargetKg >= 0.1));
  const savedGoalPlanComplete = Boolean(savedProfile.goal)
    && Boolean(savedProfile.goal_plan?.duration_weeks)
    && (savedProfile.goal_plan?.direction === 'maintain' || Boolean(savedProfile.goal_plan?.target_kg));
  const goalPlanCompletionStatus = getProfileCompletionStatus(
    [
      Boolean(profile.goal),
      Boolean(goalPlanDurationWeeks && goalPlanDurationWeeks > 0),
      goalPlanDirection === 'maintain' || Boolean(goalPlanTargetKg && goalPlanTargetKg >= 0.1),
    ],
    [
      Boolean(savedProfile.goal),
      Boolean(savedProfile.goal_plan?.duration_weeks),
      savedProfile.goal_plan?.direction === 'maintain' || Boolean(savedProfile.goal_plan?.target_kg),
    ],
    currentGoalPlanComplete
      && savedGoalPlanComplete
      && valuesMatch(
        [profile.goal, goalPlanDirection, goalPlanTargetKg ?? 0, goalPlanDurationWeeks],
        [
          savedProfile.goal,
          savedProfile.goal_plan?.direction,
          savedProfile.goal_plan?.target_kg ?? 0,
          savedProfile.goal_plan?.duration_weeks,
        ],
      ),
  );
  const basicIncomplete = bodyCompletionStatus !== 'complete';
  const instantAssessment = useMemo(() => buildInstantAssessment(profile), [
    profile.weight_kg,
    profile.height_cm,
    profile.age,
    profile.health_flags,
  ]);
  const assessmentTone = instantAssessment.assessment
    ? getBodyStatusTone(instantAssessment.assessment.body_status, colors as Record<string, string>)
    : null;
  const bodyAssessment = instantAssessment.assessment as CalorieAssessment;
  const assessmentHintText = useMemo(() => {
    if (!instantAssessment.assessment) return tx(instantAssessment.hint);
    const heightM = profile.height_cm ? profile.height_cm / 100 : 0;
    if (!heightM) return tx(instantAssessment.hint);
    return t('profile.assessment.healthyRangeHint', {
      min: round1(18.5 * heightM * heightM),
      max: round1(24.9 * heightM * heightM),
    });
  }, [instantAssessment.assessment, instantAssessment.hint, profile.height_cm, t, tx]);
  const roadmap = useMemo<ExerciseRoadmapItem[]>(() => {
    return activityPreferences.map((item) => ({
      id: item.id,
      task_id: item.id,
      title: item.title,
      detail: 'profile.roadmap.customDetail',
      activity_type: item.activity_type as ActivityType,
      duration_min: item.duration_min,
      estimated_kcal: estimateExerciseCalories(item.activity_type as ActivityType, item.duration_min, profile.weight_kg ?? 65),
      is_custom: true,
      persisted_item_id: item.id,
    }));
  }, [activityPreferences, profile.weight_kg]);
  const movementCompletionStatus: ProfileCompletionStatus = roadmap.length > 0
    ? 'complete'
    : roadmapCatalogType
      ? 'partial'
      : 'required';

  const roadmapActivityByTaskId = useMemo(() => {
    const map: Record<string, ActivityLog> = {};
    activityLogs.forEach((log) => {
      const parsed = parseRoadmapNote(log.notes);
      if (!parsed) return;
      map[parsed.taskId] = log;
    });
    return map;
  }, [activityLogs]);

  const completedRoadmapTaskIds = useMemo(() => {
    const ids = new Set<string>();
    activityLogs.forEach((log) => {
      const parsed = parseRoadmapNote(log.notes);
      if (parsed?.taskId) ids.add(parsed.taskId);
    });
    return ids;
  }, [activityLogs]);

  const completedRoadmapKcal = useMemo(
    () => roadmap.reduce((sum, item) => sum + (completedRoadmapTaskIds.has(item.id) ? item.estimated_kcal : 0), 0),
    [roadmap, completedRoadmapTaskIds],
  );
  const completedRoadmapCount = useMemo(
    () => roadmap.filter((item) => completedRoadmapTaskIds.has(item.id)).length,
    [roadmap, completedRoadmapTaskIds],
  );
  const setupSteps = useMemo(() => [
    {
      key: 'basic',
      label: t('profile.setup.basic'),
      detail: profile.weight_kg && profile.height_cm && profile.age && profile.gender
        ? t('profile.setup.basicDetail', {
            weight: profile.weight_kg,
            height: profile.height_cm,
            age: profile.age,
            gender: profile.gender === 'male' ? t('profile.gender.male').replace('👨 ', '') : t('profile.gender.female').replace('👩 ', ''),
          })
        : t('profile.setup.basicMissing'),
      done: Boolean(profile.weight_kg && profile.height_cm && profile.age && profile.gender),
      icon: 'monitor-weight',
    },
    {
      key: 'safety',
      label: t('profile.setup.safety'),
      detail: Array.isArray(profile.health_flags)
        ? (selectedHealthFlags.length > 0 ? t('profile.setup.safetyFlags', { count: selectedHealthFlags.length }) : t('profile.setup.safetyClear'))
        : t('profile.setup.safetyMissing'),
      done: Array.isArray(profile.health_flags),
      icon: 'health-and-safety',
    },
    {
      key: 'goal',
      label: t('profile.setup.goal'),
      detail: activeGoalPlan?.computed_daily_calorie_target
        ? t('profile.goalPlan.statusTitle', { target: activeGoalPlan.computed_daily_calorie_target })
        : profile.goal ? tx(GOAL_LABELS[profile.goal]) : t('profile.setup.goalMissing'),
      done: Boolean(profile.goal && profile.daily_calorie_target),
      icon: 'track-changes',
    },
    {
      key: 'roadmap',
      label: t('profile.setup.movement'),
      detail: roadmap.length > 0 ? t('profile.setup.movementDetail', { count: roadmap.length }) : t('profile.setup.movementMissing'),
      done: roadmap.length > 0,
      icon: 'directions-run',
    },
    {
      key: 'notifications',
      label: t('profile.setup.reminders'),
      detail: (reminders.allow_push_notifications ?? true) ? t('profile.setup.on') : t('profile.setup.off'),
      done: reminders.allow_push_notifications ?? true,
      icon: 'notifications-active',
    },
    {
      key: 'subscription',
      label: t('profile.setup.subscription'),
      detail: subscription?.tier && subscription.tier !== 'free'
        ? t('profile.setup.subscriptionUpgraded', { tier: subscription.tier === 'premium' ? 'Premium' : 'Pro' })
        : t('profile.setup.subscriptionFree'),
      done: Boolean(subscription?.tier && subscription.tier !== 'free'),
      icon: 'workspace-premium',
    },
  ] as const, [
    activeGoalPlan?.computed_daily_calorie_target,
    profile.age,
    profile.daily_calorie_target,
    profile.goal,
    profile.gender,
    profile.health_flags,
    profile.height_cm,
    profile.weight_kg,
    reminders.allow_push_notifications,
    roadmap.length,
    selectedHealthFlags.length,
    subscription?.tier,
    t,
    tx,
  ]);
  const completedSetupCount = setupSteps.filter((step) => step.done).length;
  const setupProgressPct = Math.round((completedSetupCount / setupSteps.length) * 100);
  const existingRoadmapActivityTypes = useMemo(
    () => new Set(roadmap.map((item) => item.activity_type)),
    [roadmap],
  );
  const catalogTypes = Object.keys(EXERCISE_ACTIVITY_LABELS) as ActivityType[];
  const userWeight = profile.weight_kg ?? 65;
  const coreProfileChecks = [
    Boolean(profile.weight_kg),
    Boolean(profile.height_cm),
    Boolean(profile.age),
    Boolean(profile.gender),
    Boolean(profile.goal),
    Boolean(profile.work_activity_level)
      && profile.exercise_sessions_per_week !== undefined
      && profile.exercise_minutes_per_session !== undefined,
    Array.isArray(profile.health_flags),
  ];
  const coreProfileCompleted = coreProfileChecks.filter(Boolean).length;
  const coreProfileProgress = Math.round((coreProfileCompleted / coreProfileChecks.length) * 100);
  const goalHeadline = nutritionTarget?.status === 'clinician_target'
    ? profile.clinician_nutrition_targets?.verification_status === 'verified'
      ? 'Mục tiêu chuyên gia đã xác minh'
      : 'Mục tiêu chuyên gia do bạn khai báo'
    : nutritionTarget?.status === 'clinician_guidance'
    ? 'Cần tư vấn chuyên môn'
    : profile.goal === 'lose_weight'
      ? 'Giảm mỡ · Giữ cơ'
      : profile.goal === 'gain_muscle'
        ? 'Tăng cơ · Tăng năng lượng'
        : 'Giữ dáng · Ổn định';
  const healthNeedsAttention = nutritionTarget?.status === 'clinician_guidance'
    || (profile.age !== undefined && profile.age < 18)
    || selectedHealthFlags.some((flag) => ['pregnant', 'breastfeeding', 'kidney_disease', 'eating_disorder_history'].includes(flag));
  const profileInitials = (profile.full_name || 'Bạn')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const firstMissingProfileLabel = bodyCompletionStatus !== 'complete'
    ? !profile.weight_kg
      ? 'cân nặng'
      : !profile.height_cm
        ? 'chiều cao'
        : !profile.age
          ? 'tuổi'
          : !profile.gender
            ? 'giới tính sinh học'
            : 'thông tin cơ thể chưa lưu'
    : activityCompletionStatus !== 'complete'
      ? !profile.work_activity_level
        ? 'mức vận động công việc'
        : profile.exercise_sessions_per_week === undefined || profile.exercise_minutes_per_session === undefined
          ? 'lịch tập luyện'
          : 'thông tin vận động chưa lưu'
      : safetyCompletionStatus !== 'complete'
        ? Array.isArray(profile.health_flags) ? 'thông tin an toàn chưa lưu' : 'thông tin an toàn'
        : goalPlanCompletionStatus !== 'complete'
          ? 'lộ trình mục tiêu'
          : movementCompletionStatus !== 'complete'
            ? 'lịch vận động'
            : null;
  const displayedCalorieTarget = profile.daily_calorie_target ?? nutritionTarget?.calories_kcal;
  const selectedClimate = profile.climate_exposure ?? 'temperate';
  const selectedClimateAdjustment = CLIMATE_OPTIONS.find((item) => item.key === selectedClimate)?.adjustmentMl ?? 0;
  const savedClimateAdjustment = CLIMATE_OPTIONS.find((item) => item.key === savedProfile.climate_exposure)?.adjustmentMl ?? 0;
  const displayedWaterTargetMl = nutritionTarget?.water_ml && nutritionTarget.status === 'ready'
    ? nutritionTarget.water_ml - savedClimateAdjustment + selectedClimateAdjustment
    : nutritionTarget?.water_ml;
  const systemHydrationSlots = buildSystemHydrationSlots(displayedWaterTargetMl ?? 0);
  const isCustomHydrationSchedule = profile.hydration_schedule?.mode === 'custom';
  const activeHydrationSlots = isCustomHydrationSchedule && profile.hydration_schedule?.slots?.length
    ? profile.hydration_schedule.slots
    : systemHydrationSlots;
  const hydrationScheduleTotalMl = hydrationScheduleTotal(activeHydrationSlots);
  const hydrationScheduleGapMl = Math.round((displayedWaterTargetMl ?? 0) - hydrationScheduleTotalMl);
  const hasMacroTarget = (nutritionTarget?.status === 'ready' || nutritionTarget?.status === 'clinician_target')
    && nutritionTarget.protein_g !== undefined
    && nutritionTarget.carbs_g !== undefined
    && nutritionTarget.fat_g !== undefined;
  const targetMethodologyEntries = Object.entries(nutritionTarget?.methodology ?? {})
    .filter((entry): entry is [string, NonNullable<DailyNutritionTarget['methodology'][keyof DailyNutritionTarget['methodology']]>] => Boolean(entry[1]));
  const activitySummary = profile.work_activity_level
    ? `${WORK_ACTIVITY_LABELS[profile.work_activity_level]} · Tập ${profile.exercise_sessions_per_week ?? 0} buổi/tuần`
    : profile.activity_level
      ? tx(ACTIVITY_LABELS[profile.activity_level])
      : 'Chưa thiết lập';
  const hasClinicianNutritionContext = selectedHealthFlags.some((flag) => ['pregnant', 'breastfeeding', 'kidney_disease', 'diabetes', 'eating_disorder_history'].includes(flag));
  const isBodyDetail = activeProfileDetailAnchor === 'body';
  const isHealthDetail = activeProfileDetailAnchor === 'health';
  const isWaterDetail = activeProfileDetailAnchor === 'water';
  const isActivityDetail = activeProfileDetailAnchor === 'activity';
  const isGoalPlanDetail = activeProfileDetailAnchor === 'goalPlan';
  const isRoadmapDetail = activeProfileDetailAnchor === 'roadmap';
  const isNotificationsDetail = activeProfileDetailAnchor === 'notifications';
  const isSubscriptionDetail = activeProfileDetailAnchor === 'subscription';
  const profileDetailTabs: Array<{ key: ProfileDetailAnchor; label: string; icon: keyof typeof MaterialIcons.glyphMap }> = [
    { key: 'body', label: 'Cơ thể', icon: 'person-outline' },
    { key: 'activity', label: 'Hoạt động', icon: 'directions-run' },
    { key: 'health', label: 'Sức khỏe', icon: 'health-and-safety' },
    { key: 'water', label: 'Nước', icon: 'water-drop' },
    { key: 'goalPlan', label: 'Lộ trình', icon: 'track-changes' },
    { key: 'roadmap', label: 'Lịch tập', icon: 'event-available' },
  ];
  const formErrors: Record<string, string> = {};
  const validateRange = (key: string, value: number | undefined, min: number, max: number, label: string, integer = false) => {
    if (value === undefined) return;
    if (!Number.isFinite(value) || value < min || value > max) {
      formErrors[key] = `${label} phải từ ${min.toLocaleString('vi-VN')} đến ${max.toLocaleString('vi-VN')}.`;
    } else if (integer && !Number.isInteger(value)) {
      formErrors[key] = `${label} phải là số nguyên.`;
    }
  };

  if (profile.full_name !== undefined && profile.full_name.trim().length > 0 && profile.full_name.trim().length < 2) {
    formErrors.full_name = 'Họ tên cần ít nhất 2 ký tự.';
  } else if ((profile.full_name?.trim().length ?? 0) > 100) {
    formErrors.full_name = 'Họ tên không được quá 100 ký tự.';
  }
  validateRange('weight_kg', profile.weight_kg, 20, 300, 'Cân nặng');
  validateRange('height_cm', profile.height_cm, 50, 250, 'Chiều cao');
  validateRange('body_fat_pct', profile.body_fat_pct, 3, 70, 'Tỷ lệ mỡ');
  validateRange('age', profile.age, 13, 120, 'Tuổi', true);
  if (profile.date_of_birth) {
    const derivedAge = ageFromDateOfBirth(profile.date_of_birth);
    if (!isRealIsoDate(profile.date_of_birth)) {
      formErrors.date_of_birth = 'Dùng định dạng YYYY-MM-DD và nhập một ngày hợp lệ.';
    } else if (profile.date_of_birth > new Date().toISOString().slice(0, 10)) {
      formErrors.date_of_birth = 'Ngày sinh không thể nằm trong tương lai.';
    } else if (derivedAge === undefined || derivedAge < 13 || derivedAge > 120) {
      formErrors.date_of_birth = 'Hồ sơ hỗ trợ người dùng từ 13 đến 120 tuổi.';
    }
  }

  validateRange('exercise_sessions_per_week', profile.exercise_sessions_per_week, 0, 21, 'Số buổi tập', true);
  validateRange('exercise_minutes_per_session', profile.exercise_minutes_per_session, 0, 600, 'Số phút mỗi buổi', true);
  if ((profile.exercise_sessions_per_week ?? 0) === 0 && (profile.exercise_minutes_per_session ?? 0) > 0) {
    formErrors.exercise_minutes_per_session = 'Hãy nhập số buổi lớn hơn 0 hoặc đặt số phút về 0.';
  }
  if ((profile.exercise_sessions_per_week ?? 0) > 0 && (profile.exercise_minutes_per_session ?? 0) === 0) {
    formErrors.exercise_minutes_per_session = 'Hãy nhập thời lượng lớn hơn 0 cho mỗi buổi tập.';
  }

  if (selectedHealthFlags.includes('pregnant') && !profile.pregnancy_trimester) {
    formErrors.pregnancy_trimester = 'Chọn tam cá nguyệt để tính mục tiêu an toàn.';
  }
  if (selectedHealthFlags.includes('breastfeeding') && !profile.breastfeeding_level) {
    formErrors.breastfeeding_level = 'Chọn mức cho con bú.';
  }
  if (selectedHealthFlags.includes('diabetes') && !profile.diabetes_type) {
    formErrors.diabetes_type = 'Chọn loại tiểu đường.';
  }
  if (selectedHealthFlags.includes('kidney_disease') && !profile.kidney_care_status) {
    formErrors.kidney_care_status = 'Chọn tình trạng điều trị thận.';
  }

  const hasGoalPlanInput = goalPlanTargetKg !== undefined
    || goalPlanDurationWeeks !== undefined
    || Boolean(activeGoalPlan);
  if (hasGoalPlanInput) {
    if (goalPlanDirection !== 'maintain' && (!goalPlanTargetKg || goalPlanTargetKg < 0.1 || goalPlanTargetKg > 100)) {
      formErrors.goal_plan_target = 'Số kg muốn thay đổi phải từ 0,1 đến 100 kg.';
    }
    if (!goalPlanDurationWeeks || goalPlanDurationWeeks < 1 || goalPlanDurationWeeks > 260 || !Number.isInteger(goalPlanDurationWeeks)) {
      formErrors.goal_plan_duration = 'Thời gian phải là số nguyên từ 1 đến 260 tuần.';
    }
  }

  const clinicianPlan = profile.clinician_nutrition_targets;
  if (clinicianPlan) {
    if (!clinicianPlan.source?.trim()) formErrors.clinician_source = 'Nhập nguồn hướng dẫn từ chuyên gia.';
    if (!clinicianPlan.provider_type) formErrors.clinician_provider = 'Chọn người cung cấp kế hoạch.';
    const clinicalRanges = [
      ['clinician_calories', clinicianPlan.calories_kcal, 500, 10000, 'Calories/ngày'],
      ['clinician_protein', clinicianPlan.protein_g, 1, 500, 'Protein'],
      ['clinician_water', clinicianPlan.water_ml, 250, 10000, 'Nước'],
      ['clinician_sodium', clinicianPlan.sodium_mg_max, 100, 10000, 'Sodium'],
    ] as const;
    clinicalRanges.forEach(([key, value, min, max, label]) => validateRange(key, value, min, max, label));
    if (![clinicianPlan.calories_kcal, clinicianPlan.protein_g, clinicianPlan.water_ml, clinicianPlan.sodium_mg_max].some((value) => value !== undefined)) {
      formErrors.clinician_targets = 'Nhập ít nhất một mục tiêu dinh dưỡng từ chuyên gia.';
    }
    if (!clinicianPlan.confirmed_at && !clinicalPlanConfirmed) {
      formErrors.clinician_confirm = 'Xác nhận đây là số liệu bạn nhận từ chuyên gia.';
    }
  }

  const hasFormErrors = Object.keys(formErrors).length > 0;
  const currentEditSnapshot = JSON.stringify([
    profile,
    [...selectedHealthFlags].sort(),
    hasGoalPlanInput ? goalPlanDirection : null,
    hasGoalPlanInput ? goalPlanTargetKg ?? null : null,
    hasGoalPlanInput ? goalPlanDurationWeeks ?? null : null,
    goalPlanCleared,
  ]);
  const savedEditSnapshot = JSON.stringify([
    savedProfile,
    [...savedHealthFlags].sort(),
    savedProfile.goal_plan?.direction ?? null,
    savedProfile.goal_plan?.target_kg ?? null,
    savedProfile.goal_plan?.duration_weeks ?? null,
    false,
  ]);
  const hasUnsavedProfileChanges = currentEditSnapshot !== savedEditSnapshot;
  const firstErrorTab: ProfileDetailAnchor = formErrors.full_name
    || formErrors.weight_kg
    || formErrors.height_cm
    || formErrors.body_fat_pct
    || formErrors.age
    || formErrors.date_of_birth
    ? 'body'
    : formErrors.exercise_sessions_per_week || formErrors.exercise_minutes_per_session
      ? 'activity'
      : formErrors.pregnancy_trimester || formErrors.breastfeeding_level || formErrors.diabetes_type || formErrors.kidney_care_status
        ? 'health'
        : formErrors.clinician_source || formErrors.clinician_provider || formErrors.clinician_targets || formErrors.clinician_confirm
          || formErrors.clinician_calories || formErrors.clinician_protein || formErrors.clinician_water || formErrors.clinician_sodium
          ? 'water'
          : 'goalPlan';

  // Refs for scrolling to sections
  const scrollRef = React.useRef<any>(null);
  const detailScrollRef = React.useRef<any>(null);
  const profileOverviewRef = React.useRef<any>(null);
  const basicRef = React.useRef<any>(null);
  const bodyFieldsRef = React.useRef<any>(null);
  const healthFieldsRef = React.useRef<any>(null);
  const waterFieldsRef = React.useRef<any>(null);
  const assessmentRef = React.useRef<any>(null);
  const goalRef = React.useRef<any>(null);
  const activityFieldsRef = React.useRef<any>(null);
  const goalPlanRef = React.useRef<any>(null);
  const roadmapRef = React.useRef<any>(null);
  const notificationsRef = React.useRef<any>(null);
  const subscriptionRef = React.useRef<any>(null);
  const detailAnchorOffsetsRef = React.useRef<Partial<Record<ProfileDetailAnchor, number>>>({});
  const pendingDetailAnchorRef = React.useRef<ProfileDetailAnchor | null>(null);

  const scrollToSection = (ref: any) => {
    if (!ref || !ref.current || !scrollRef.current) return;
    try {
      // Native measure then scroll
      (ref.current as any).measure((fx: any, fy: any, width: any, height: any, px: any, py: any) => {
        try {
          (scrollRef.current as any).scrollTo({ y: Math.max(0, py - 24), animated: true });
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
      // Fallback for web: try element scrollIntoView
      try {
        const el = (ref.current as any);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {}
    }
  };

  const scrollToProfileOverview = () => {
    setTimeout(() => scrollToSection(profileOverviewRef), 80);
  };

  const scrollToDetailAnchor = (anchor: ProfileDetailAnchor) => {
    const y = detailAnchorOffsetsRef.current[anchor];
    const scrollNode = detailScrollRef.current as any;
    if (typeof y !== 'number' || !scrollNode?.scrollTo) return false;
    scrollNode.scrollTo({ y: Math.max(0, y - 12), animated: true });
    return true;
  };

  const requestDetailAnchorScroll = (anchor: ProfileDetailAnchor, attempt = 0) => {
    pendingDetailAnchorRef.current = anchor;
    setTimeout(() => {
      if (scrollToDetailAnchor(anchor)) {
        pendingDetailAnchorRef.current = null;
        return;
      }
      if (attempt < 6) {
        requestDetailAnchorScroll(anchor, attempt + 1);
      }
    }, attempt === 0 ? 220 : 120);
  };

  const registerDetailAnchor = (anchor: ProfileDetailAnchor) => (event: any) => {
    detailAnchorOffsetsRef.current[anchor] = event.nativeEvent.layout.y;
    if (pendingDetailAnchorRef.current === anchor) {
      requestDetailAnchorScroll(anchor);
    }
  };

  const openProfileDetailAnchor = (anchor: ProfileDetailAnchor) => {
    setActiveProfileDetailAnchor(anchor);
    setShowProfileDetails(true);
    if (anchor === 'body' || anchor === 'health' || anchor === 'water') {
      setBasicCollapsed(false);
      setAssessmentCollapsed(false);
    }
    if (anchor === 'activity' || anchor === 'goalPlan' || anchor === 'roadmap') {
      setGoalCollapsed(false);
    }
    if (anchor === 'notifications') {
      setNotificationsCollapsed(false);
    }
    if (anchor === 'subscription') {
      setSubscriptionCollapsed(false);
    }

    requestDetailAnchorScroll(anchor);
  };

  const openSetupStep = (key: typeof setupSteps[number]['key']) => {
    if (key === 'basic') {
      openProfileDetailAnchor('body');
      return;
    }
    if (key === 'safety') {
      openProfileDetailAnchor('health');
      return;
    }
    if (key === 'goal') {
      openProfileDetailAnchor('goalPlan');
      return;
    }
    if (key === 'roadmap') {
      openProfileDetailAnchor('roadmap');
      return;
    }
    if (key === 'notifications') {
      openProfileDetailAnchor('notifications');
      return;
    }
    openProfileDetailAnchor('subscription');
  };

  useEffect(() => {
    Promise.all([
      apiClient.get('/user/profile').then((res) => {
        setProfile(res.data);
        setSavedProfile(res.data);
        if (res.data?.nutrition_target_snapshot) {
          setNutritionTarget(res.data.nutrition_target_snapshot);
        }
      }).catch(() => {
        setProfile({});
        setSavedProfile({});
      }),
      fetchReminders().then(() => {
        if (reminderPrefs) setReminders(reminderPrefs);
      }).catch(() => {
        setReminders({});
      }),
      fetchSubscription(),
      fetchReminderEffectiveness(30).catch(() => {}),
      fetchPreviewNudge('lunch').catch(() => {}),
      fetchActivityLogs().catch(() => {}),
      fetchActivityPreferences().catch(() => {}),
      calorieTargetService.getMyTarget().then((target) => {
        if (isCalorieTargetReady(target)) {
          setNutritionTarget(target.daily_nutrition_target ?? null);
          setCalorieMethodology(target.calculation_methodology ?? null);
        } else {
          setNutritionTarget(null);
          setCalorieMethodology(null);
        }
      }).catch(() => {
        setNutritionTarget(null);
        setCalorieMethodology(null);
      }),
    ]).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (isLoading || completionParams.focus !== 'completion') return;
    const timer = setTimeout(() => scrollToSection(profileOverviewRef), 320);
    return () => clearTimeout(timer);
  }, [completionParams.focus, completionParams.focusAt, isLoading]);

  // Sync local goal plan inputs when profile is loaded
  useEffect(() => {
    const gp = profile.goal_plan;
    if (gp) {
      setGoalPlanTargetKg(gp.direction === 'maintain' ? 0 : (gp.target_kg ?? undefined));
      setGoalPlanDurationWeeks(gp.duration_weeks ?? undefined);
      setGoalPlanDurationEdited(true);
      setGoalPlanDirection(gp.direction ?? (profile.goal === 'lose_weight' ? 'loss' : (profile.goal === 'gain_muscle' ? 'gain' : 'maintain')));
      setGoalPlanCleared(false);
    }
  }, [profile.goal_plan]);

  useEffect(() => {
    if (goalPlanDurationEdited || profile.goal_plan) return;
    setGoalPlanDurationWeeks(goalPaceSuggestion.suggestedDurationWeeks);
  }, [goalPaceSuggestion.suggestedDurationWeeks, goalPlanDurationEdited, profile.goal_plan]);

  // Update local reminders state when reminder prefs are fetched
  useEffect(() => {
    if (reminderPrefs) {
      setReminders(reminderPrefs);
    }
  }, [reminderPrefs]);

  // Highlight basic info card when required fields are missing
  useEffect(() => {
    if (basicIncomplete && basicCollapsed) {
      if (!highlightLoopRef.current) {
        highlightLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(highlightAnim, { toValue: 1, duration: 700, useNativeDriver: useNativeHighlightDriver }),
            Animated.timing(highlightAnim, { toValue: 0, duration: 700, useNativeDriver: useNativeHighlightDriver }),
          ]),
        );
        highlightLoopRef.current.start();
      }
    } else if (highlightLoopRef.current) {
      highlightLoopRef.current.stop();
      highlightLoopRef.current = null;
      highlightAnim.setValue(0);
    }
  }, [basicIncomplete, basicCollapsed, highlightAnim, useNativeHighlightDriver]);

  const toggleHealthFlag = (flag: HealthFlag) => {
    setProfile((prev) => {
      const current = normaliseHealthFlags(prev.health_flags);
      const nextFlags = current.includes(flag)
        ? current.filter((item) => item !== flag)
        : [...current, flag];

      return {
        ...prev,
        health_flags: nextFlags,
        ...(flag === 'pregnant' && current.includes(flag) ? { pregnancy_trimester: undefined } : {}),
        ...(flag === 'breastfeeding' && current.includes(flag) ? { breastfeeding_level: undefined } : {}),
        ...(flag === 'diabetes' && current.includes(flag) ? { diabetes_type: undefined } : {}),
        ...(flag === 'kidney_disease' && current.includes(flag) ? { kidney_care_status: undefined } : {}),
        ...(flag === 'eating_disorder_history' && !current.includes(flag)
          ? { sensitive_nutrition_mode: true }
          : flag === 'eating_disorder_history' && current.includes(flag)
            ? { sensitive_nutrition_mode: false }
          : {}),
      };
    });
  };

  const clearGoalPlan = () => {
    setGoalPlanTargetKg(undefined);
    setGoalPlanDurationWeeks(undefined);
    setGoalPlanDurationEdited(false);
    setGoalPlanDirection('maintain');
    setGoalPlanCleared(true);
    setProfile((prev) => ({ ...prev, goal_plan: null }));
  };

  const buildGoalPlanPayload = (): GoalPlan | null | undefined => {
    if (goalPlanCleared) return null;

    const targetKg = Number(goalPlanTargetKg ?? 0);
    const durationWeeks = Number(goalPlanDurationWeeks ?? 0);
    const hasPlanInput = goalPlanDirection === 'maintain' || targetKg > 0 || durationWeeks > 0;
    if (!hasPlanInput) return undefined;

    const now = new Date();
    const safeDuration = durationWeeks > 0 ? durationWeeks : 4;
    return {
      target_kg: goalPlanDirection === 'maintain' ? 0 : Math.max(0.1, targetKg),
      duration_weeks: safeDuration,
      direction: goalPlanDirection,
      start_date: now.toISOString().split('T')[0],
      end_date: new Date(now.getTime() + (safeDuration * 7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
    };
  };

  const setHydrationScheduleMode = (mode: 'system' | 'custom') => {
    setProfile((current) => ({
      ...current,
      hydration_schedule: mode === 'custom'
        ? {
            mode: 'custom',
            slots: current.hydration_schedule?.mode === 'custom' && current.hydration_schedule.slots.length
              ? current.hydration_schedule.slots
              : buildSystemHydrationSlots(displayedWaterTargetMl ?? 0),
          }
        : { mode: 'system', slots: [] },
    }));
  };

  const updateHydrationSlot = (index: number, patch: Partial<HydrationScheduleSlot>) => {
    setProfile((current) => {
      const slots = current.hydration_schedule?.mode === 'custom'
        ? [...current.hydration_schedule.slots]
        : buildSystemHydrationSlots(displayedWaterTargetMl ?? 0);
      slots[index] = { ...slots[index], ...patch };
      return { ...current, hydration_schedule: { mode: 'custom', slots } };
    });
  };

  const addHydrationSlot = () => {
    if (activeHydrationSlots.length >= 12) return;
    setProfile((current) => ({
      ...current,
      hydration_schedule: {
        mode: 'custom',
        slots: [...activeHydrationSlots, { time: '22:00', amount_ml: 250 }],
      },
    }));
  };

  const removeHydrationSlot = (index: number) => {
    if (activeHydrationSlots.length <= 1) return;
    setProfile((current) => ({
      ...current,
      hydration_schedule: {
        mode: 'custom',
        slots: activeHydrationSlots.filter((_, slotIndex) => slotIndex !== index),
      },
    }));
  };

  const handleSaveProfile = async () => {
    setSaveAttempted(true);
    setProfileSaveError(null);
    if (hasFormErrors) {
      setActiveProfileDetailAnchor(firstErrorTab);
      return;
    }
    if (isCustomHydrationSchedule) {
      const invalidSlot = activeHydrationSlots.some((slot) => (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time)
        || Number(slot.amount_ml) < 50
        || Number(slot.amount_ml) > 1000
      ));
      const uniqueTimes = new Set(activeHydrationSlots.map((slot) => slot.time));
      if (invalidSlot || uniqueTimes.size !== activeHydrationSlots.length) {
        Alert.alert(
          'Lịch uống nước chưa hợp lệ',
          'Mỗi mốc cần một giờ khác nhau theo định dạng HH:MM và lượng nước từ 50–1000ml.',
        );
        return;
      }
    }
    if (
      profile.clinician_nutrition_targets?.source
      && !profile.clinician_nutrition_targets.confirmed_at
      && !clinicalPlanConfirmed
    ) {
      Alert.alert(
        'Xác nhận kế hoạch chuyên gia',
        'Bạn cần xác nhận các số liệu này đến từ bác sĩ hoặc chuyên gia dinh dưỡng.',
      );
      return;
    }
    setIsSaving(true);
    try {
      const goalPlanPayload = buildGoalPlanPayload();
      // Save profile
      const profileRes = await apiClient.patch('/user/profile', {
        full_name: profile.full_name,
        weight_kg: profile.weight_kg ? Number(profile.weight_kg) : undefined,
        height_cm: profile.height_cm ? Number(profile.height_cm) : undefined,
        body_fat_pct: profile.body_fat_pct ? Number(profile.body_fat_pct) : undefined,
        date_of_birth: profile.date_of_birth || undefined,
        age: profile.age ? Number(profile.age) : undefined,
        gender: profile.gender,
        work_activity_level: profile.work_activity_level,
        exercise_sessions_per_week: profile.exercise_sessions_per_week,
        exercise_minutes_per_session: profile.exercise_minutes_per_session,
        sweat_level: profile.sweat_level,
        climate_exposure: profile.climate_exposure ?? 'temperate',
        hydration_schedule: isCustomHydrationSchedule
          ? { mode: 'custom', slots: normalizeHydrationSlots(activeHydrationSlots) }
          : { mode: 'system', slots: [] },
        pregnancy_trimester: profile.pregnancy_trimester,
        breastfeeding_level: profile.breastfeeding_level,
        diabetes_type: profile.diabetes_type,
        kidney_care_status: profile.kidney_care_status,
        athlete_level: profile.athlete_level,
        clinician_nutrition_targets: profile.clinician_nutrition_targets,
        sensitive_nutrition_mode: profile.sensitive_nutrition_mode,
        goal: profile.goal,
        goal_plan: goalPlanPayload,
        health_flags: selectedHealthFlags,
      });
      setProfile(profileRes.data);
      setSavedProfile(profileRes.data);
      if (profileRes.data?.nutrition_target_snapshot) {
        setNutritionTarget(profileRes.data.nutrition_target_snapshot);
      }
      const savedWaterTarget = Number(profileRes.data?.nutrition_target_snapshot?.water_ml ?? displayedWaterTargetMl ?? 0);
      const savedHydrationSchedule = profileRes.data?.hydration_schedule;
      const hydrationReminderSlots = savedHydrationSchedule?.mode === 'custom' && savedHydrationSchedule.slots?.length
        ? normalizeHydrationSlots(savedHydrationSchedule.slots)
        : buildSystemHydrationSlots(savedWaterTarget);
      void pushNotificationService.syncHydrationReminders(
        hydrationReminderSlots,
        (reminders.allow_push_notifications ?? true) && (reminders.hydration_reminder_enabled ?? true),
      );
      setGoalPlanCleared(false);
      setSaveAttempted(false);
      setProfileSaveError(null);

      // Save reminders if changed
      const reminderUpdates = {
        breakfast_reminder_enabled: reminders.breakfast_reminder_enabled,
        breakfast_reminder_time: reminders.breakfast_reminder_time,
        lunch_reminder_enabled: reminders.lunch_reminder_enabled,
        lunch_reminder_time: reminders.lunch_reminder_time,
        dinner_reminder_enabled: reminders.dinner_reminder_enabled,
        dinner_reminder_time: reminders.dinner_reminder_time,
        snack_reminder_enabled: reminders.snack_reminder_enabled,
        snack_reminder_time: reminders.snack_reminder_time,
        hydration_reminder_enabled: reminders.hydration_reminder_enabled ?? true,
        allow_push_notifications: reminders.allow_push_notifications,
        nudge_motivation_style: reminders.nudge_motivation_style,
      };

      await Promise.all([
        updateReminders(reminderUpdates),
        fetchPreviewNudge(previewMeal),
        fetchDailyLog().catch(() => {}),
        fetchActivityLogs().catch(() => {}),
        fetchActivityPreferences().catch(() => {}),
        fetchRecommendations().catch(() => {}),
        fetchWeeklyInsights().catch(() => {}),
        calorieTargetService.getMyTarget().then((target) => {
          setNutritionTarget(isCalorieTargetReady(target) ? target.daily_nutrition_target ?? null : null);
        }).catch(() => {}),
      ]);

      setReward({
        title: 'reward.profileSaved.title',
        body: 'reward.profileSaved.body',
        icon: 'checkmark-circle',
      });
    } catch (e: any) {
      setProfileSaveError(e?.response?.data?.message ?? 'Không thể lưu hồ sơ. Kiểm tra kết nối và thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  const openAddRoadmapExercise = () => {
    setEditingRoadmapTask(null);
    setRoadmapCatalogType(null);
    setRoadmapCatalogDuration(30);
    setRoadmapCatalogVisible(true);
  };

  const openEditRoadmapExercise = (task: ExerciseRoadmapItem) => {
    setEditingRoadmapTask(task);
    setRoadmapCatalogType(task.activity_type);
    setRoadmapCatalogDuration(nearestCatalogDuration(task.duration_min));
    setRoadmapCatalogVisible(true);
  };

  const handleRoadmapCatalogConfirm = async () => {
    if (!roadmapCatalogType) return;

    const activityLabel = tx(EXERCISE_ACTIVITY_LABELS[roadmapCatalogType] ?? roadmapCatalogType);
    const durationMin = roadmapCatalogDuration;
    const duplicate = roadmap.find((item) => (
      item.activity_type === roadmapCatalogType
      && item.id !== editingRoadmapTask?.id
    ));
    if (duplicate) {
      Alert.alert(
        'profile.roadmap.duplicateTitle',
        'profile.roadmap.duplicateBody',
      );
      return;
    }

    try {
      const linkedActivity = editingRoadmapTask ? roadmapActivityByTaskId[editingRoadmapTask.id] : null;

      // Update/add the preference first; only delete the linked activity log after success
      if (editingRoadmapTask?.persisted_item_id) {
        await updateActivityPreference(editingRoadmapTask.persisted_item_id, {
          title: t('profile.roadmap.customTitle', { activity: activityLabel }),
          activity_type: roadmapCatalogType,
          duration_min: durationMin,
        });
      } else {
        await addActivityPreference({
          title: t('profile.roadmap.customTitle', { activity: activityLabel }),
          activity_type: roadmapCatalogType,
          duration_min: durationMin,
          sort_order: activityPreferences.length,
        });
      }

      if (linkedActivity) {
        await deleteActivity(linkedActivity.id);
      }

      await fetchActivityPreferences();
      await fetchActivityLogs();
      await fetchDailyLog();
      setRoadmapCatalogVisible(false);
      setEditingRoadmapTask(null);
      setRoadmapCatalogType(null);
      setRoadmapCatalogDuration(30);
      setReward({
        title: editingRoadmapTask ? 'profile.roadmap.editSaved' : 'profile.roadmap.exerciseAdded',
        body: t('profile.roadmap.rewardBody', { activity: activityLabel, minutes: durationMin }),
        icon: 'walk',
      });
    } catch (error: any) {
      Alert.alert('profile.roadmap.saveExerciseFailed', error?.response?.data?.message ?? 'common.tryAgain');
    }
  };

  const removeRoadmapTask = async (task: ExerciseRoadmapItem) => {
    try {
      const linked = roadmapActivityByTaskId[task.id];
      if (linked) {
        await deleteActivity(linked.id);
      }

      if (task.is_custom && task.persisted_item_id) {
        await deleteActivityPreference(task.persisted_item_id);
      }

      await Promise.all([
        fetchActivityPreferences().catch(() => {}),
        fetchActivityLogs().catch(() => {}),
        fetchDailyLog().catch(() => {}),
      ]);
      setReward({
        title: 'profile.roadmap.exerciseDeleted',
        body: task.title,
        icon: 'trash-outline',
      });
    } catch (error: any) {
      Alert.alert('profile.roadmap.deleteExerciseFailed', error?.response?.data?.message ?? 'common.tryAgain');
    }
  };

  const handleRemoveRoadmapTask = (task: ExerciseRoadmapItem) => {
    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm?.(t('profile.roadmap.deleteConfirm', { title: task.title })) ?? false;
      if (confirmed) {
        void removeRoadmapTask(task);
      }
      return;
    }

    Alert.alert('profile.roadmap.deleteTitle', t('profile.roadmap.deleteConfirm', { title: task.title }), [
      { text: 'common.cancel', style: 'cancel' },
      {
        text: 'common.delete',
        style: 'destructive',
        onPress: () => void removeRoadmapTask(task),
      },
    ]);
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm?.(t('profile.logout.confirmMessage')) ?? false;
      if (confirmed) {
        void logout();
      }
      return;
    }

    Alert.alert('profile.logout.confirmTitle', 'profile.logout.confirmMessage', [
      { text: 'common.cancel', style: 'cancel' },
      { text: 'profile.logout', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const handleChangeSubscriptionTier = (tier: SubscriptionTier) => {
    if (tier === subscription?.tier) {
      return;
    }

    if (tier !== 'free') {
      router.push({
        pathname: '/paywall',
        params: { returnTo: '/profile', feature: tier },
      } as never);
      return;
    }

    // Downgrade to free — call directly
    changeTier(tier).then(() => {
      Alert.alert('profile.subscription.updated', t('profile.subscription.updatedBody', { tier: SUBSCRIPTION_TIERS[tier].name }));
    }).catch((error: any) => {
      Alert.alert('profile.subscription.updateFailed', error?.response?.data?.message ?? error?.message ?? 'common.tryAgain');
    });
  };

  if (isLoading) {
    return (
      <ScreenShell scrollRef={scrollRef}>
        <ActivityIndicator color={colors.success} style={{ marginTop: 80 }} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell scrollRef={scrollRef}>
      <Modal
        visible={roadmapCatalogVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRoadmapCatalogVisible(false)}
      >
        <View style={styles.catalogOverlay}>
          <View style={styles.catalogSheet}>
            <View style={styles.catalogHeader}>
              <Text style={styles.catalogTitle}>{editingRoadmapTask ? t('profile.roadmap.catalogTitleEdit') : t('profile.roadmap.catalogTitleAdd')}</Text>
              <TouchableOpacity onPress={() => setRoadmapCatalogVisible(false)}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {roadmapCatalogType === null ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.catalogHint}>{t('profile.roadmap.catalogHint', { weight: userWeight })}</Text>
                {catalogTypes.map((type) => {
                  const kcal30 = estimateExerciseCalories(type, 30, userWeight);
                  const alreadyAdded = existingRoadmapActivityTypes.has(type) && type !== editingRoadmapTask?.activity_type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.catalogItem, alreadyAdded && styles.catalogItemDisabled]}
                      onPress={() => setRoadmapCatalogType(type)}
                      disabled={alreadyAdded}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.catalogItemName, alreadyAdded && styles.catalogItemNameDisabled]}>
                          {tx(EXERCISE_ACTIVITY_LABELS[type])}
                        </Text>
                        <Text style={[styles.catalogItemKcal, alreadyAdded && styles.catalogItemKcalDisabled]}>
                          {alreadyAdded ? t('profile.roadmap.catalogAlreadyAdded') : t('profile.roadmap.catalogKcal', { kcal: kcal30, minutes: 30 })}
                        </Text>
                      </View>
                      <MaterialIcons name={alreadyAdded ? 'check-circle' : 'chevron-right'} size={18} color={alreadyAdded ? colors.accentMint : colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View>
                <TouchableOpacity style={styles.catalogBack} onPress={() => setRoadmapCatalogType(null)}>
                  <MaterialIcons name="arrow-back" size={16} color={colors.accentMint} />
                  <Text style={styles.catalogBackText} i18nKey="screen.tabs.profile.text.001" />
                </TouchableOpacity>
                <Text style={styles.catalogSelectedLabel}>{tx(EXERCISE_ACTIVITY_LABELS[roadmapCatalogType])}</Text>
                <Text style={styles.catalogHint} i18nKey="screen.tabs.profile.text.002" />
                <View style={styles.durationRow}>
                  {([15, 30, 45, 60] as const).map((duration) => {
                    const kcal = estimateExerciseCalories(roadmapCatalogType, duration, userWeight);
                    return (
                      <TouchableOpacity
                        key={duration}
                        style={[styles.durationBtn, roadmapCatalogDuration === duration && styles.durationBtnActive]}
                        onPress={() => setRoadmapCatalogDuration(duration)}
                      >
                        <Text style={[styles.durationBtnMin, roadmapCatalogDuration === duration && styles.durationBtnTextActive]}>{t('profile.roadmap.catalogDuration', { minutes: duration })}</Text>
                        <Text style={[styles.durationBtnKcal, roadmapCatalogDuration === duration && styles.durationBtnTextActive]}>~{kcal} kcal</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={styles.catalogConfirmBtn} onPress={() => void handleRoadmapCatalogConfirm()}>
                  <Text style={styles.catalogConfirmText}>
                    {t('profile.roadmap.catalogConfirm', {
                      action: editingRoadmapTask ? t('profile.roadmap.catalogConfirmSave') : t('profile.roadmap.catalogConfirmAdd'),
                      minutes: roadmapCatalogDuration,
                      kcal: estimateExerciseCalories(roadmapCatalogType, roadmapCatalogDuration, userWeight),
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <View>
        <View style={styles.profileHeader}>
          <Text style={styles.profileHeaderTitle}>Hồ sơ của bạn</Text>
          <Text style={styles.profileHeaderSubtitle}>Cá nhân hóa mục tiêu sức khỏe</Text>
          <View style={styles.profileIdentityRow}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{profileInitials}</Text>
            </View>
            <View style={styles.profileIdentityCopy}>
              <Text style={styles.profileName}>{profile.full_name || 'Bạn'}</Text>
              <Text style={styles.profileCompletionLabel}>Hồ sơ cốt lõi {coreProfileCompleted}/{coreProfileChecks.length}</Text>
              <View style={styles.profileCompletionTrack}>
                <View style={[styles.profileCompletionFill, { width: `${coreProfileProgress}%` as any }]} />
              </View>
              <Text style={[styles.profileMissingText, !firstMissingProfileLabel && styles.profileCompleteText]}>
                {firstMissingProfileLabel ? `Còn thiếu ${firstMissingProfileLabel}` : 'Thông tin cốt lõi đã hoàn tất'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.profilePrimaryAction}
            onPress={firstMissingProfileLabel ? scrollToProfileOverview : () => openSetupStep('basic')}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={firstMissingProfileLabel ? `Hoàn tất hồ sơ, còn thiếu ${firstMissingProfileLabel}` : 'Chỉnh sửa hồ sơ'}
          >
            <Text style={styles.profilePrimaryActionText}>
              {firstMissingProfileLabel ? 'Hoàn tất hồ sơ' : 'Chỉnh sửa hồ sơ'}
            </Text>
          </TouchableOpacity>
        </View>

        <ProfileSectionLabel label="Mục tiêu hiện tại" />
        <SurfaceCard style={[styles.aiTargetCard, healthNeedsAttention && styles.aiTargetCardWarning]}>
          <View style={styles.aiTargetHeader}>
            <View style={styles.aiTargetCopy}>
              <Text style={styles.aiTargetEyebrow}>Mục tiêu calories hôm nay</Text>
              <Text style={styles.aiTargetGoal}>{goalHeadline}</Text>
            </View>
            <View style={[styles.aiTargetIcon, healthNeedsAttention && styles.aiTargetIconWarning]}>
              <MaterialIcons name={healthNeedsAttention ? 'health-and-safety' : 'auto-awesome'} size={22} color={healthNeedsAttention ? colors.warning : colors.success} />
            </View>
          </View>
          {healthNeedsAttention ? (
            <Text style={styles.aiTargetWarningText}>Calorie AI không áp dụng công thức dinh dưỡng phổ thông cho hồ sơ này.</Text>
          ) : (
            <>
              <View style={styles.aiTargetNumberRow}>
                <Text style={styles.aiTargetNumber}>{displayedCalorieTarget ? Math.round(displayedCalorieTarget).toLocaleString('vi-VN') : '--'}</Text>
                <Text style={styles.aiTargetUnit}>kcal/ngày</Text>
              </View>
              {hasMacroTarget && (
                <View style={styles.macroMiniRow}>
                  <Text style={styles.macroMiniText}>Đạm {nutritionTarget.protein_g}g</Text>
                  <Text style={styles.macroMiniText}>Carb {nutritionTarget.carbs_g}g</Text>
                  <Text style={styles.macroMiniText}>Béo {nutritionTarget.fat_g}g</Text>
                </View>
              )}
              <Text style={styles.aiTargetBasis}>
                Dựa trên: {profile.weight_kg ?? '--'} kg · {profile.age ?? '--'} tuổi · {profile.activity_level ? tx(ACTIVITY_LABELS[profile.activity_level]) : 'chưa có mức vận động'}
              </Text>
              {!!nutritionTarget?.calculated_at && (
                <Text style={styles.aiTargetUpdated}>
                  Cập nhật lúc {new Date(nutritionTarget.calculated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} hôm nay
                </Text>
              )}
            </>
          )}
          <TouchableOpacity
            onPress={() => setShowTargetCalculation((value) => !value)}
            style={styles.aiTargetLink}
            accessibilityRole="button"
            accessibilityState={{ expanded: showTargetCalculation }}
            accessibilityLabel="Xem cách tính mục tiêu dinh dưỡng"
          >
            <Text style={styles.aiTargetLinkText}>Xem cách tính</Text>
            <MaterialIcons name={showTargetCalculation ? 'expand-less' : 'expand-more'} size={18} color={colors.success} />
          </TouchableOpacity>
          {showTargetCalculation && (
            <View style={styles.calculationPanel}>
              <View style={styles.calculationHeaderRow}>
                <Text style={styles.calculationTitle}>Phiên bản {nutritionTarget?.algorithm_version ?? 'chưa có'}</Text>
                <Text style={styles.calculationCaption}>
                  {nutritionTarget?.status === 'clinician_target' ? 'Kế hoạch chuyên gia' : 'Ước tính sức khỏe tổng quát'}
                </Text>
              </View>
              {!!calorieMethodology && (
                <>
                  <View style={styles.calculationItem}>
                    <View style={styles.calculationItemHeader}>
                      <Text style={styles.calculationMetric}>BMR</Text>
                      <Text style={styles.calculationEvidenceBadge}>
                        {EVIDENCE_LEVEL_LABELS[calorieMethodology.bmr.evidence_level]}
                      </Text>
                    </View>
                    <Text style={styles.calculationMethod}>
                      {calorieMethodology.bmr.method === 'mifflin_st_jeor'
                        ? 'Phương trình Mifflin–St Jeor'
                        : 'Phương trình Katch–McArdle từ khối nạc'}
                    </Text>
                    {calorieMethodology.bmr.assumptions.map((item, index) => (
                      <Text key={`bmr-${index}`} style={styles.calculationAssumption}>• {item}</Text>
                    ))}
                  </View>
                  <View style={styles.calculationItem}>
                    <View style={styles.calculationItemHeader}>
                      <Text style={styles.calculationMetric}>Vận động ×{calorieMethodology.activity.factor}</Text>
                      <Text style={styles.calculationEvidenceBadge}>
                        {EVIDENCE_LEVEL_LABELS[calorieMethodology.activity.evidence_level]}
                      </Text>
                    </View>
                    {calorieMethodology.activity.assumptions.map((item, index) => (
                      <Text key={`activity-method-${index}`} style={styles.calculationAssumption}>• {item}</Text>
                    ))}
                  </View>
                  <View style={styles.calculationItem}>
                    <View style={styles.calculationItemHeader}>
                      <Text style={styles.calculationMetric}>Điều chỉnh mục tiêu ×{calorieMethodology.goal_adjustment.multiplier}</Text>
                      <Text style={styles.calculationEvidenceBadge}>
                        {EVIDENCE_LEVEL_LABELS[calorieMethodology.goal_adjustment.evidence_level]}
                      </Text>
                    </View>
                    {calorieMethodology.goal_adjustment.assumptions.map((item, index) => (
                      <Text key={`goal-adjustment-${index}`} style={styles.calculationAssumption}>• {item}</Text>
                    ))}
                  </View>
                  <View style={styles.calculationItem}>
                    <View style={styles.calculationItemHeader}>
                      <Text style={styles.calculationMetric}>Sàn sản phẩm {calorieMethodology.calorie_floor.value_kcal} kcal</Text>
                      <Text style={styles.calculationEvidenceBadge}>
                        {EVIDENCE_LEVEL_LABELS[calorieMethodology.calorie_floor.evidence_level]}
                      </Text>
                    </View>
                    <Text style={styles.calculationGuardrail}>Không phải giới hạn sinh lý hay chỉ định y khoa.</Text>
                  </View>
                  <View style={styles.calculationItem}>
                    <View style={styles.calculationItemHeader}>
                      <Text style={styles.calculationMetric}>Phân bổ bữa mặc định</Text>
                      <Text style={styles.calculationEvidenceBadge}>
                        {EVIDENCE_LEVEL_LABELS[calorieMethodology.meal_distribution.evidence_level]}
                      </Text>
                    </View>
                    <Text style={styles.calculationMethod}>
                      Sáng {calorieMethodology.meal_distribution.breakfast_pct}% · Trưa {calorieMethodology.meal_distribution.lunch_pct}% · Tối {calorieMethodology.meal_distribution.dinner_pct}% · Phụ {calorieMethodology.meal_distribution.snack_pct}%
                    </Text>
                  </View>
                </>
              )}
              {targetMethodologyEntries.length > 0 ? targetMethodologyEntries.map(([metric, method]) => (
                <View key={metric} style={styles.calculationItem}>
                  <View style={styles.calculationItemHeader}>
                    <Text style={styles.calculationMetric}>{TARGET_METRIC_LABELS[metric] ?? metric}</Text>
                    <Text style={styles.calculationEvidenceBadge}>
                      {EVIDENCE_LEVEL_LABELS[method.evidence_level] ?? method.evidence_level}
                    </Text>
                  </View>
                  <Text style={styles.calculationMethod}>{method.method}</Text>
                  {!!method.reference_range && (
                    <Text style={styles.calculationAssumption}>
                      Khoảng tham chiếu: {method.reference_range.min ?? 0}–{method.reference_range.max ?? 'không giới hạn'} {method.reference_range.unit}
                    </Text>
                  )}
                  {method.assumptions.slice(0, 2).map((assumption, index) => (
                    <Text key={`${metric}-assumption-${index}`} style={styles.calculationAssumption}>• {assumption}</Text>
                  ))}
                  {method.is_product_guardrail && (
                    <Text style={styles.calculationGuardrail}>Đây là guardrail sản phẩm, không phải giới hạn sinh lý.</Text>
                  )}
                </View>
              )) : (
                <Text style={styles.calculationEmpty}>Chưa đủ dữ liệu để giải thích cách tính. Hãy hoàn tất hồ sơ trước.</Text>
              )}
            </View>
          )}
          {!!nutritionTarget?.evidence?.length && (
            <>
              <TouchableOpacity
                style={styles.evidenceToggle}
                onPress={() => setShowTargetEvidence((value) => !value)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showTargetEvidence }}
                accessibilityLabel="Cơ sở tham khảo cho mục tiêu dinh dưỡng"
              >
                <MaterialIcons name="menu-book" size={16} color={colors.textMuted} />
                <Text style={styles.evidenceToggleText}>Cơ sở tham khảo ({nutritionTarget.evidence.length})</Text>
                <MaterialIcons name={showTargetEvidence ? 'expand-less' : 'expand-more'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {showTargetEvidence && (
                <View style={styles.evidenceList}>
                  {nutritionTarget.evidence.map((item) => (
                    <TouchableOpacity key={item.id} style={styles.evidenceItem} onPress={() => void Linking.openURL(item.url)}>
                      <Text style={styles.evidenceOrganization}>{item.organization}</Text>
                      <Text style={styles.evidenceTitle}>{item.title}</Text>
                      <Text style={styles.evidenceLevel}>{EVIDENCE_LEVEL_LABELS[item.evidence_level] ?? item.evidence_level}</Text>
                      <MaterialIcons name="open-in-new" size={14} color={colors.success} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </SurfaceCard>

        <View ref={profileOverviewRef} collapsable={false} testID="profile-completion-overview">
          <ProfileSectionLabel label="Thông tin của bạn" />
          <SurfaceCard style={styles.profileGroupCard}>
            <ProfileOverviewRow icon="person-outline" label="Cơ thể" value={`${profile.height_cm ?? '--'} cm · ${profile.weight_kg ?? '--'} kg · ${profile.age ?? '--'} tuổi`} completionStatus={bodyCompletionStatus} completionTestID="profile-incomplete-body" onPress={() => openProfileDetailAnchor('body')} />
            <ProfileOverviewRow icon="directions-run" label="Hoạt động" value={activitySummary} completionStatus={activityCompletionStatus} completionTestID="profile-incomplete-activity" onPress={() => openProfileDetailAnchor('activity')} />
            <ProfileOverviewRow icon="health-and-safety" label="Sức khỏe & an toàn" value={healthNeedsAttention ? 'Cần xem lại hướng dẫn' : selectedHealthFlags.length ? `${selectedHealthFlags.length} lưu ý sức khỏe` : 'Không có cảnh báo'} warning={healthNeedsAttention} completionStatus={safetyCompletionStatus} completionTestID="profile-incomplete-safety" onPress={() => openProfileDetailAnchor('health')} />
            <ProfileOverviewRow icon="water-drop" label="Nước" value={(nutritionTarget?.status === 'ready' || nutritionTarget?.status === 'clinician_target') && displayedWaterTargetMl ? `Ước tính ${(displayedWaterTargetMl / 1000).toLocaleString('vi-VN')} L/ngày` : 'Cần hướng dẫn riêng'} warning={nutritionTarget?.status === 'clinician_guidance'} onPress={() => openProfileDetailAnchor('water')} />
          </SurfaceCard>

          <ProfileSectionLabel label="Kế hoạch của bạn" />
          <SurfaceCard style={styles.profileGroupCard}>
            <ProfileOverviewRow icon="track-changes" label="Lộ trình mục tiêu" value={activeGoalPlan?.duration_weeks ? `${activeGoalPlan.direction === 'loss' ? 'Giảm' : activeGoalPlan.direction === 'gain' ? 'Tăng' : 'Duy trì'} ${activeGoalPlan.target_kg ?? 0} kg trong ${activeGoalPlan.duration_weeks} tuần` : 'Chưa thiết lập lộ trình'} completionStatus={goalPlanCompletionStatus} completionTestID="profile-incomplete-goal-plan" onPress={() => openProfileDetailAnchor('goalPlan')} />
            <ProfileOverviewRow icon="event-available" label="Lịch vận động" value={`${roadmap.length} bài · ${completedRoadmapCount} bài hoàn thành hôm nay`} completionStatus={movementCompletionStatus} completionTestID="profile-incomplete-movement" onPress={() => openProfileDetailAnchor('roadmap')} last />
          </SurfaceCard>
        </View>

        <ProfileSectionLabel label="Cá nhân hóa thêm" />
        <SurfaceCard style={styles.personalizationCard}>
          <View style={styles.personalizationHeader}>
            <View style={styles.personalizationIcon}>
              <MaterialIcons name="auto-awesome" size={22} color={colors.success} />
            </View>
            <View style={styles.profileRowCopy}>
              <Text style={styles.personalizationTitle}>Giúp đề xuất phù hợp hơn</Text>
              <Text style={styles.personalizationSubtitle}>Bạn có thể bổ sung bất kỳ lúc nào.</Text>
            </View>
          </View>
          <View style={styles.personalizationRows}>
            <ProfileOverviewRow icon="accessibility-new" label="Thành phần cơ thể" value="Tùy chọn" onPress={() => router.push('/body-composition' as never)} />
            <ProfileOverviewRow icon="watch" label="Kết nối thiết bị" value="Tùy chọn" onPress={() => router.push('/health-sync' as never)} last />
          </View>
        </SurfaceCard>

        <ProfileSectionLabel label="Ứng dụng" />
        <SurfaceCard style={styles.profileGroupCard}>
          <ProfileOverviewRow icon="notifications-none" label="Nhắc nhở" value={(reminders.allow_push_notifications ?? true) ? 'Bật' : 'Tắt'} onPress={() => openSetupStep('notifications')} />
          <ProfileOverviewRow icon="language" label="Ngôn ngữ" value={locale === 'vi' ? 'Tiếng Việt' : 'English'} onPress={() => setQuickSetting((value) => value === 'language' ? null : 'language')} />
          {quickSetting === 'language' && (
            <View style={styles.settingsChips}>
              <UiChip label={t('locale.vi')} selected={locale === 'vi'} onPress={() => void setLocale('vi')} style={styles.settingsChip} />
              <UiChip label={t('locale.en')} selected={locale === 'en'} onPress={() => void setLocale('en')} style={styles.settingsChip} />
            </View>
          )}
          <ProfileOverviewRow icon="palette" label="Giao diện" value={requestedMode === 'system' ? 'Theo máy' : requestedMode === 'light' ? 'Sáng' : 'Tối'} onPress={() => setQuickSetting((value) => value === 'appearance' ? null : 'appearance')} />
          {quickSetting === 'appearance' && (
            <View style={styles.settingsChips}>
              <UiChip label={t('profile.appearance.light')} selected={requestedMode === 'light'} onPress={() => void setThemeMode('light')} style={styles.settingsChip} />
              <UiChip label={t('profile.appearance.dark')} selected={requestedMode === 'dark'} onPress={() => void setThemeMode('dark')} style={styles.settingsChip} />
              <UiChip label={t('profile.appearance.system')} selected={requestedMode === 'system'} onPress={() => void setThemeMode('system')} style={styles.settingsChip} />
            </View>
          )}
          <ProfileOverviewRow icon="privacy-tip" label="Quyền riêng tư & dữ liệu" value="Kiểm soát dữ liệu" onPress={() => router.push('/privacy-data' as never)} last />
        </SurfaceCard>

        <ProfileSectionLabel label="Tài khoản" />
        <SurfaceCard style={styles.profileGroupCard}>
          <ProfileOverviewRow icon="workspace-premium" label="Gói dịch vụ" value={`${subscription?.tier === 'premium' ? 'Premium' : subscription?.tier === 'pro' ? 'Pro' : 'Free'} · ${subscription?.is_active ? 'Đang hoạt động' : 'Chưa kích hoạt'}`} onPress={() => openSetupStep('subscription')} />
          <ProfileOverviewRow icon="help-outline" label="Trợ giúp" value="FAQ · Liên hệ hỗ trợ" onPress={() => router.push('/help' as never)} last />
        </SurfaceCard>
        <TouchableOpacity style={styles.overviewLogoutButton} onPress={handleLogout}>
          <Text style={styles.overviewLogoutText}>Đăng xuất</Text>
        </TouchableOpacity>

        <Modal
          visible={showProfileDetails}
          animationType="slide"
          onRequestClose={() => setShowProfileDetails(false)}
        >
          <View style={styles.detailModalContainer}>
            <View style={styles.detailModalHeader}>
              <TouchableOpacity
                onPress={() => setShowProfileDetails(false)}
                style={styles.detailModalBackBtn}
                accessibilityRole="button"
                accessibilityLabel="Quay lại"
              >
                <MaterialIcons name="arrow-back" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.detailModalTitle}>{PROFILE_DETAIL_TITLES[activeProfileDetailAnchor]}</Text>
              <TouchableOpacity
                style={[styles.profileDetailsSave, !hasUnsavedProfileChanges && styles.profileDetailsSaveDisabled]}
                onPress={handleSaveProfile}
                disabled={isSaving || !hasUnsavedProfileChanges}
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaving || !hasUnsavedProfileChanges }}
                accessibilityLabel={isSaving ? 'Đang lưu hồ sơ' : hasUnsavedProfileChanges ? 'Lưu hồ sơ' : 'Hồ sơ đã lưu'}
              >
                <Text style={[styles.profileDetailsSaveText, !hasUnsavedProfileChanges && styles.profileDetailsSaveTextDisabled]}>
                  {isSaving ? 'Đang lưu...' : hasUnsavedProfileChanges ? 'Lưu' : 'Đã lưu'}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView ref={detailScrollRef} showsVerticalScrollIndicator={false} style={styles.detailModalContent} contentContainerStyle={styles.detailModalContentContainer}>
              {saveAttempted && hasFormErrors && (
                <View style={styles.formErrorSummary} accessibilityRole="alert">
                  <MaterialIcons name="error-outline" size={19} color={colors.danger} />
                  <View style={styles.profileRowCopy}>
                    <Text style={styles.formErrorSummaryTitle}>Chưa thể lưu hồ sơ</Text>
                    <Text style={styles.formErrorSummaryText}>
                      Kiểm tra {Object.keys(formErrors).length} thông tin được đánh dấu bên dưới.
                    </Text>
                  </View>
                </View>
              )}
              {!!profileSaveError && (
                <View style={styles.formErrorSummary} accessibilityRole="alert">
                  <MaterialIcons name="cloud-off" size={19} color={colors.danger} />
                  <View style={styles.profileRowCopy}>
                    <Text style={styles.formErrorSummaryTitle}>Không thể lưu thay đổi</Text>
                    <Text style={styles.formErrorSummaryText}>{profileSaveError}</Text>
                  </View>
                </View>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.detailTabScroll} contentContainerStyle={styles.detailTabRow}>
                {profileDetailTabs.map((tab) => {
                  const selected = activeProfileDetailAnchor === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.detailTab, selected && styles.detailTabActive]}
                      onPress={() => openProfileDetailAnchor(tab.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                    >
                      <MaterialIcons name={tab.icon as any} size={15} color={selected ? colors.textOnAccent : colors.textMuted} />
                      <Text style={[styles.detailTabText, selected && styles.detailTabTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

        {(isBodyDetail || isHealthDetail || isWaterDetail) && (
        <View ref={basicRef}>
          <SurfaceCard style={[styles.sectionCard, basicCollapsed && styles.sectionCardCompact]}>
          <Animated.View style={[styles.highlightOverlay, styles.pointerEventsNone, { opacity: highlightAnim }]} />
          <TouchableOpacity onPress={() => setBasicCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>
                {isBodyDetail ? 'Cơ thể' : isHealthDetail ? 'Sức khỏe & an toàn' : 'Nước'}
              </Text>
              {basicCollapsed && (
                <Text style={styles.sectionSubtitle}>
                  {profile.weight_kg
                    ? t('profile.basic.collapsed', { weight: profile.weight_kg, height: profile.height_cm ?? '--', age: profile.age ?? '--' })
                    : t('profile.basic.unset')}
                </Text>
              )}
            </View>
            <MaterialIcons name={basicCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
          </TouchableOpacity>

          {(isBodyDetail || isHealthDetail || isWaterDetail) && (
            <>
              {isBodyDetail && (
              <>
              <View ref={bodyFieldsRef} onLayout={registerDetailAnchor('body')} style={[styles.metricsGrid, isDesktop && styles.metricsGridDesktop]}>
                <Field label="screen.tabs.profile.label.001" value={profile.full_name ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, full_name: v }))} placeholder="screen.tabs.profile.placeholder.001" error={formErrors.full_name} fullWidth />
                <Field label="screen.tabs.profile.label.002" value={String(profile.weight_kg ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, weight_kg: parseOptionalNumberInput(v) }))} keyboardType="decimal-pad" placeholder="65" error={formErrors.weight_kg} />
                <Field label="screen.tabs.profile.label.003" value={String(profile.height_cm ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, height_cm: parseOptionalNumberInput(v) }))} keyboardType="decimal-pad" placeholder="170" error={formErrors.height_cm} />
                <Field label="Ngày sinh" value={profile.date_of_birth ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, date_of_birth: v || undefined, age: ageFromDateOfBirth(v) ?? p.age }))} placeholder="1997-08-12" error={formErrors.date_of_birth} />
                <Field label="Tỷ lệ mỡ cơ thể · Tùy chọn" value={String(profile.body_fat_pct ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, body_fat_pct: parseOptionalNumberInput(v) }))} keyboardType="decimal-pad" placeholder="20" error={formErrors.body_fat_pct} />
                {!profile.date_of_birth && (
                  <Field label="screen.tabs.profile.label.004" value={String(profile.age ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, age: parseOptionalNumberInput(v) }))} keyboardType="number-pad" placeholder="25" error={formErrors.age} />
                )}
              </View>

              <Text style={styles.label} i18nKey="screen.tabs.profile.text.004" />
              <View style={styles.chipRow}>
                {(['male', 'female'] as const).map((g) => (
                  <UiChip key={g} label={g === 'male' ? t('profile.gender.male') : t('profile.gender.female')} selected={profile.gender === g} onPress={() => setProfile((p) => ({ ...p, gender: g }))} />
                ))}
              </View>
              </>
              )}

              {isHealthDetail && (
              <>
              <View ref={healthFieldsRef} onLayout={registerDetailAnchor('health')}>
                <Text style={styles.label} i18nKey="screen.tabs.profile.text.005" />
                <Text style={styles.helperText} i18nKey="profile.health.helper" />
              </View>
              <View style={styles.chipRow}>
                {HEALTH_FLAGS.map((flag) => (
                  <UiChip
                    key={flag}
                    label={tx(HEALTH_FLAG_LABELS[flag])}
                    selected={selectedHealthFlags.includes(flag)}
                    onPress={() => toggleHealthFlag(flag)}
                    style={styles.healthChip}
                  />
                ))}
              </View>
              {selectedHealthFlags.includes('pregnant') && (
                <>
                  <Text style={styles.label}>Tam cá nguyệt</Text>
                  <View style={styles.chipRow}>
                    {([1, 2, 3] as const).map((trimester) => (
                      <UiChip key={trimester} label={`Tam cá nguyệt ${trimester}`} selected={profile.pregnancy_trimester === trimester} onPress={() => setProfile((p) => ({ ...p, pregnancy_trimester: trimester }))} />
                    ))}
                  </View>
                  {saveAttempted && formErrors.pregnancy_trimester && <Text style={styles.inlineFormError}>{formErrors.pregnancy_trimester}</Text>}
                </>
              )}
              {selectedHealthFlags.includes('breastfeeding') && (
                <>
                  <Text style={styles.label}>Mức cho con bú</Text>
                  <View style={styles.chipRow}>
                    <UiChip label="Hoàn toàn" selected={profile.breastfeeding_level === 'exclusive'} onPress={() => setProfile((p) => ({ ...p, breastfeeding_level: 'exclusive' }))} />
                    <UiChip label="Một phần" selected={profile.breastfeeding_level === 'partial'} onPress={() => setProfile((p) => ({ ...p, breastfeeding_level: 'partial' }))} />
                  </View>
                  {saveAttempted && formErrors.breastfeeding_level && <Text style={styles.inlineFormError}>{formErrors.breastfeeding_level}</Text>}
                </>
              )}
              {selectedHealthFlags.includes('diabetes') && (
                <>
                  <Text style={styles.label}>Loại tiểu đường</Text>
                  <View style={styles.chipRow}>
                    {(['type_1', 'type_2', 'gestational'] as const).map((type) => (
                      <UiChip key={type} label={type === 'type_1' ? 'Type 1' : type === 'type_2' ? 'Type 2' : 'Thai kỳ'} selected={profile.diabetes_type === type} onPress={() => setProfile((p) => ({ ...p, diabetes_type: type }))} />
                    ))}
                  </View>
                  {saveAttempted && formErrors.diabetes_type && <Text style={styles.inlineFormError}>{formErrors.diabetes_type}</Text>}
                </>
              )}
              {selectedHealthFlags.includes('kidney_disease') && (
                <>
                  <Text style={styles.label}>Tình trạng điều trị thận</Text>
                  <View style={styles.chipRow}>
                    {([
                      ['not_on_dialysis', 'Chưa lọc máu'],
                      ['hemodialysis', 'Chạy thận'],
                      ['peritoneal_dialysis', 'Lọc màng bụng'],
                      ['unknown', 'Chưa rõ'],
                    ] as const).map(([status, label]) => (
                      <UiChip key={status} label={label} selected={profile.kidney_care_status === status} onPress={() => setProfile((p) => ({ ...p, kidney_care_status: status }))} />
                    ))}
                  </View>
                  {saveAttempted && formErrors.kidney_care_status && <Text style={styles.inlineFormError}>{formErrors.kidney_care_status}</Text>}
                </>
              )}
              </>
              )}

              {isWaterDetail && (
              <>
              {hasClinicianNutritionContext ? (
                <View ref={waterFieldsRef} onLayout={registerDetailAnchor('water')} style={styles.clinicianOverrideCard}>
                  <Text style={styles.clinicianOverrideTitle}>Mục tiêu từ chuyên gia · Tùy chọn</Text>
                  <Text style={styles.helperText}>Chỉ nhập số liệu đã được bác sĩ hoặc chuyên gia dinh dưỡng cung cấp.</Text>
                  <Text style={styles.label}>Người cung cấp kế hoạch</Text>
                  <View style={styles.chipRow}>
                    {([
                      ['doctor', 'Bác sĩ'],
                      ['dietitian', 'Chuyên gia dinh dưỡng'],
                      ['care_team', 'Nhóm chăm sóc'],
                    ] as const).map(([type, label]) => (
                      <UiChip key={type} label={label} selected={profile.clinician_nutrition_targets?.provider_type === type} onPress={() => setProfile((p) => ({ ...p, clinician_nutrition_targets: { ...p.clinician_nutrition_targets, source: p.clinician_nutrition_targets?.source ?? '', provider_type: type } }))} />
                    ))}
                  </View>
                  {saveAttempted && formErrors.clinician_provider && <Text style={styles.inlineFormError}>{formErrors.clinician_provider}</Text>}
                  <Field label="Nguồn hướng dẫn" value={profile.clinician_nutrition_targets?.source ?? ''} onChangeText={(source) => setProfile((p) => ({ ...p, clinician_nutrition_targets: { ...p.clinician_nutrition_targets, source } }))} placeholder="Bác sĩ / chuyên gia dinh dưỡng" error={saveAttempted ? formErrors.clinician_source : undefined} fullWidth />
                  <Field label="Mã hoặc tên kế hoạch · Tùy chọn" value={profile.clinician_nutrition_targets?.plan_reference ?? ''} onChangeText={(plan_reference) => setProfile((p) => ({ ...p, clinician_nutrition_targets: { ...p.clinician_nutrition_targets, source: p.clinician_nutrition_targets?.source ?? '', plan_reference } }))} placeholder="VD: CKD-plan-2026" fullWidth />
                  <Field label="Lý do / ghi chú · Tùy chọn" value={profile.clinician_nutrition_targets?.reason ?? ''} onChangeText={(reason) => setProfile((p) => ({ ...p, clinician_nutrition_targets: { ...p.clinician_nutrition_targets, source: p.clinician_nutrition_targets?.source ?? '', reason } }))} placeholder="Theo kế hoạch điều trị hiện tại" fullWidth />
                  <View style={styles.metricsGrid}>
                    <Field label="Calories/ngày" value={String(profile.clinician_nutrition_targets?.calories_kcal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, clinician_nutrition_targets: { ...p.clinician_nutrition_targets, source: p.clinician_nutrition_targets?.source ?? '', calories_kcal: parseOptionalNumberInput(v) } }))} keyboardType="decimal-pad" placeholder="2000" error={formErrors.clinician_calories} />
                    <Field label="Protein (g)" value={String(profile.clinician_nutrition_targets?.protein_g ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, clinician_nutrition_targets: { ...p.clinician_nutrition_targets, source: p.clinician_nutrition_targets?.source ?? '', protein_g: parseOptionalNumberInput(v) } }))} keyboardType="decimal-pad" placeholder="80" error={formErrors.clinician_protein} />
                    <Field label="Nước (ml)" value={String(profile.clinician_nutrition_targets?.water_ml ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, clinician_nutrition_targets: { ...p.clinician_nutrition_targets, source: p.clinician_nutrition_targets?.source ?? '', water_ml: parseOptionalNumberInput(v) } }))} keyboardType="decimal-pad" placeholder="2000" error={formErrors.clinician_water} />
                    <Field label="Sodium tối đa (mg)" value={String(profile.clinician_nutrition_targets?.sodium_mg_max ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, clinician_nutrition_targets: { ...p.clinician_nutrition_targets, source: p.clinician_nutrition_targets?.source ?? '', sodium_mg_max: parseOptionalNumberInput(v) } }))} keyboardType="decimal-pad" placeholder="1500" error={formErrors.clinician_sodium} />
                  </View>
                  {saveAttempted && formErrors.clinician_targets && <Text style={styles.inlineFormError}>{formErrors.clinician_targets}</Text>}
                  {!profile.clinician_nutrition_targets?.confirmed_at && (
                    <>
                      <TouchableOpacity
                        style={styles.clinicalConfirmRow}
                        onPress={() => setClinicalPlanConfirmed((value) => !value)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: clinicalPlanConfirmed }}
                        accessibilityLabel="Xác nhận đây là kế hoạch chuyên gia do bạn tự khai báo"
                      >
                        <MaterialIcons name={clinicalPlanConfirmed ? 'check-box' : 'check-box-outline-blank'} size={22} color={clinicalPlanConfirmed ? colors.success : colors.textMuted} />
                        <Text style={styles.clinicalConfirmText}>Tôi xác nhận đây là số liệu tôi nhận từ chuyên gia. Calorie AI chưa xác minh danh tính hoặc tài liệu nguồn.</Text>
                      </TouchableOpacity>
                      {saveAttempted && formErrors.clinician_confirm && <Text style={styles.inlineFormError}>{formErrors.clinician_confirm}</Text>}
                    </>
                  )}
                  {!!profile.clinician_nutrition_targets?.confirmed_at && (
                    <View style={[
                      styles.clinicalActiveRow,
                      profile.clinician_nutrition_targets.verification_status !== 'verified' && styles.clinicalSelfReportedRow,
                    ]}>
                      <MaterialIcons
                        name={profile.clinician_nutrition_targets.verification_status === 'verified' ? 'verified-user' : 'info-outline'}
                        size={18}
                        color={profile.clinician_nutrition_targets.verification_status === 'verified' ? colors.success : colors.warning}
                      />
                      <Text style={[
                        styles.clinicalActiveText,
                        profile.clinician_nutrition_targets.verification_status !== 'verified' && styles.clinicalSelfReportedText,
                      ]}>
                        {profile.clinician_nutrition_targets.verification_status === 'verified'
                          ? `Đã được xác minh · phiên bản ${profile.clinician_nutrition_targets.plan_version ?? 1}`
                          : `Bạn tự khai báo · chưa được Calorie AI xác minh · phiên bản ${profile.clinician_nutrition_targets.plan_version ?? 1}`}
                      </Text>
                    </View>
                  )}
                  {!!profile.clinician_nutrition_targets && (
                    <TouchableOpacity
                      style={styles.clinicalRevokeButton}
                      onPress={() => {
                        setProfile((p) => ({ ...p, clinician_nutrition_targets: null }));
                        setClinicalPlanConfirmed(false);
                      }}
                    >
                      <Text style={styles.clinicalRevokeText}>Thu hồi kế hoạch chuyên gia</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View ref={waterFieldsRef} onLayout={registerDetailAnchor('water')} style={styles.clinicianOverrideCard}>
                  <Text style={styles.clinicianOverrideTitle}>Mục tiêu nước</Text>
                  <Text style={styles.waterMethodSummary}>Ước tính từ cân nặng, vận động, mức đổ mồ hôi và khí hậu thường tiếp xúc.</Text>
                  <TouchableOpacity style={styles.waterMethodToggle} onPress={() => setWaterMethodExpanded((value) => !value)}>
                    <Text style={styles.waterMethodToggleText}>{waterMethodExpanded ? 'Ẩn cách tính' : 'Xem cách tính và lưu ý sức khỏe'}</Text>
                    <MaterialIcons name={waterMethodExpanded ? 'expand-less' : 'expand-more'} size={18} color={colors.success} />
                  </TouchableOpacity>
                  {waterMethodExpanded ? (
                    <Text style={styles.waterMethodDetail}>
                      Mức nền dùng 32,5 ml/kg, cộng điều chỉnh cho vận động, mồ hôi và khí hậu, rồi làm tròn 50 ml.
                      Đây là ước tính tổng nước từ nước uống, đồ uống và thực phẩm. Nếu có chỉ định hạn chế dịch, hãy dùng mục tiêu chuyên gia tại tab Sức khỏe.
                    </Text>
                  ) : null}
                  <View style={styles.derivedTargetHero}>
                    <Text style={styles.derivedTargetLabel}>Mục tiêu sau điều chỉnh</Text>
                    <Text style={styles.derivedTargetValue}>
                      {(nutritionTarget?.status === 'ready' || nutritionTarget?.status === 'clinician_target') && displayedWaterTargetMl
                        ? `${(displayedWaterTargetMl / 1000).toLocaleString('vi-VN')} L/ngày`
                        : 'Chưa đủ dữ liệu'}
                    </Text>
                    {selectedClimateAdjustment > 0 && nutritionTarget?.status === 'ready' ? (
                      <Text style={styles.derivedTargetHint}>Đã gồm +{selectedClimateAdjustment}ml theo khí hậu đã chọn</Text>
                    ) : null}
                  </View>
                  <View style={styles.climateSection}>
                    <Text style={styles.climateTitle}>Khí hậu thường tiếp xúc</Text>
                    <Text style={styles.climateHelper}>Chọn điều kiện bạn gặp trong phần lớn thời gian của ngày.</Text>
                    <View style={styles.climateTwoRowGrid}>
                      {[0, 2].map((startIndex) => (
                        <View key={startIndex} style={styles.climateButtonRow}>
                          {CLIMATE_OPTIONS.slice(startIndex, startIndex + 2).map((option) => {
                            const selected = selectedClimate === option.key;
                            return (
                              <TouchableOpacity
                                key={option.key}
                                style={[styles.climateGridButton, selected && styles.climateGridButtonSelected]}
                                onPress={() => setProfile((current) => ({ ...current, climate_exposure: option.key }))}
                                activeOpacity={0.78}
                              >
                                <View style={[styles.climateGridIcon, selected && styles.climateGridIconSelected]}>
                                  <MaterialIcons name={option.icon} size={18} color={selected ? colors.textOnAccent : colors.success} />
                                </View>
                                <View style={styles.climateGridCopy}>
                                  <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.climateGridLabel, selected && styles.climateLabelSelected]}>{option.label}</Text>
                                  <Text style={[styles.climateGridAdjustment, selected && styles.climateAdjustmentSelected]}>
                                    {option.adjustmentMl > 0 ? `+${option.adjustmentMl}ml` : 'Mức nền'}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={styles.hydrationEditor}>
                    <View style={styles.hydrationEditorHeader}>
                      <View style={styles.hydrationEditorCopy}>
                        <Text style={styles.climateTitle}>Lịch uống nước</Text>
                        <Text style={styles.climateHelper}>
                          Lịch này sẽ xuất hiện trong tab Hôm nay và tự cập nhật khi mục tiêu nước thay đổi.
                        </Text>
                      </View>
                      <View style={styles.scheduleModeRow}>
                        <TouchableOpacity
                          style={[styles.scheduleModeButton, !isCustomHydrationSchedule && styles.scheduleModeButtonActive]}
                          onPress={() => setHydrationScheduleMode('system')}
                        >
                          <Text style={[styles.scheduleModeText, !isCustomHydrationSchedule && styles.scheduleModeTextActive]}>Hệ thống</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.scheduleModeButton, isCustomHydrationSchedule && styles.scheduleModeButtonActive]}
                          onPress={() => setHydrationScheduleMode('custom')}
                        >
                          <Text style={[styles.scheduleModeText, isCustomHydrationSchedule && styles.scheduleModeTextActive]}>Tự chỉnh</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {isCustomHydrationSchedule ? (
                      <View style={styles.customScheduleList}>
                        {activeHydrationSlots.map((slot, index) => (
                          <View key={`${index}-${slot.time}`} style={styles.scheduleEditRow}>
                            <View style={styles.scheduleIndex}>
                              <Text style={styles.scheduleIndexText}>{index + 1}</Text>
                            </View>
                            <View style={styles.scheduleInputGroup}>
                              <Text style={styles.scheduleInputLabel}>Giờ</Text>
                              <TextInput
                                value={slot.time}
                                onChangeText={(time) => updateHydrationSlot(index, { time })}
                                placeholder="08:00"
                                maxLength={5}
                                style={styles.scheduleInput}
                                placeholderTextColor={colors.textDisabled}
                              />
                            </View>
                            <View style={styles.scheduleInputGroup}>
                              <Text style={styles.scheduleInputLabel}>Lượng nước</Text>
                              <View style={styles.amountInputWrap}>
                                <TextInput
                                  value={String(slot.amount_ml)}
                                  onChangeText={(value) => updateHydrationSlot(index, { amount_ml: Number(value.replace(/\D/g, '')) || 0 })}
                                  keyboardType="numeric"
                                  maxLength={4}
                                  style={[styles.scheduleInput, styles.amountInput]}
                                  placeholderTextColor={colors.textDisabled}
                                />
                                <Text style={styles.amountUnit}>ml</Text>
                              </View>
                            </View>
                            <TouchableOpacity
                              style={[styles.removeScheduleButton, activeHydrationSlots.length <= 1 && styles.removeScheduleButtonDisabled]}
                              disabled={activeHydrationSlots.length <= 1}
                              onPress={() => removeHydrationSlot(index)}
                            >
                              <MaterialIcons name="delete-outline" size={19} color={colors.danger} />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity style={styles.addScheduleButton} onPress={addHydrationSlot} disabled={activeHydrationSlots.length >= 12}>
                          <MaterialIcons name="add-circle-outline" size={18} color={colors.success} />
                          <Text style={styles.addScheduleText}>Thêm mốc uống nước</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.systemScheduleGrid}>
                        {systemHydrationSlots.map((slot) => (
                          <View key={slot.time} style={styles.systemScheduleItem}>
                            <MaterialIcons name="schedule" size={15} color={colors.info} />
                            <Text style={styles.systemScheduleTime}>{slot.time}</Text>
                            <Text style={styles.systemScheduleAmount}>{slot.amount_ml}ml</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={[
                      styles.scheduleSummary,
                      Math.abs(hydrationScheduleGapMl) > 50 && styles.scheduleSummaryWarning,
                    ]}>
                      <Text style={styles.scheduleSummaryLabel}>Tổng theo lịch</Text>
                      <Text style={styles.scheduleSummaryValue}>{(hydrationScheduleTotalMl / 1000).toLocaleString('vi-VN')} L</Text>
                      {Math.abs(hydrationScheduleGapMl) > 50 ? (
                        <Text style={styles.scheduleSummaryWarningText}>
                          {hydrationScheduleGapMl > 0
                            ? `Còn thiếu ${hydrationScheduleGapMl}ml so với mục tiêu`
                            : `Cao hơn mục tiêu ${Math.abs(hydrationScheduleGapMl)}ml`}
                        </Text>
                      ) : (
                        <Text style={styles.scheduleSummaryOk}>Đã cân bằng với mục tiêu</Text>
                      )}
                    </View>
                  </View>
                </View>
              )}
              </>
              )}
              {isHealthDetail && selectedHealthFlags.includes('eating_disorder_history') && (
                <TouchableOpacity
                  style={styles.clinicalConfirmRow}
                  onPress={() => setProfile((p) => ({ ...p, sensitive_nutrition_mode: !(p.sensitive_nutrition_mode ?? true) }))}
                >
                  <MaterialIcons name={profile.sensitive_nutrition_mode ? 'visibility-off' : 'visibility'} size={22} color={colors.success} />
                  <View style={styles.profileRowCopy}>
                    <Text style={styles.clinicianOverrideTitle}>Chế độ dinh dưỡng nhạy cảm</Text>
                    <Text style={styles.helperText}>Ẩn calorie và macro nổi bật trên Today, tập trung vào thói quen và hướng dẫn chăm sóc.</Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
          )}
          </SurfaceCard>
        </View>
        )}

        {false && (
        <View ref={assessmentRef}>
          <SurfaceCard style={[styles.sectionCard, assessmentCollapsed && styles.sectionCardCompact]}>
          <TouchableOpacity onPress={() => setAssessmentCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle} i18nKey="screen.tabs.profile.text.006" />
              {assessmentCollapsed && (
                <Text style={styles.sectionSubtitle}>
                  {bodyAssessment
                    ? `BMI ${bodyAssessment.bmi} · ${tx(BODY_STATUS_LABELS[bodyAssessment.body_status])}`
                    : t('profile.assessment.collapsedMissing')}
                </Text>
              )}
            </View>
            <MaterialIcons name={assessmentCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
          </TouchableOpacity>

          {!assessmentCollapsed && (
            <>
              <Text style={styles.helperText} i18nKey="profile.assessment.helper" />

              {!!bodyAssessment && (
                <View
                  style={[
                    styles.assessmentCard,
                    { backgroundColor: assessmentTone?.bg, borderColor: assessmentTone?.border },
                  ]}
                >
                  <View style={styles.assessmentTopRow}>
                    <View>
                      <Text style={[styles.assessmentBmiLabel, { color: assessmentTone?.accent }]} i18nKey="screen.tabs.profile.text.007" />
                      <Text style={[styles.assessmentBmiValue, { color: assessmentTone?.text }]}>{bodyAssessment.bmi}</Text>
                    </View>
                    <View style={styles.assessmentMeta}>
                      <Text style={styles.assessmentMetaLabel} i18nKey="screen.tabs.profile.text.008" />
                      <Text style={[styles.assessmentMetaValue, { color: assessmentTone?.accent }]}> 
                        {tx(BODY_STATUS_LABELS[bodyAssessment.body_status])}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.assessmentGuidesRow}>
                    <View style={[styles.assessmentBadge, { backgroundColor: assessmentTone?.badgeBg, borderColor: assessmentTone?.border }]}>
                      <Text style={[styles.assessmentBadgeText, { color: assessmentTone?.text }]}> 
                        {tx(WEIGHT_RECOMMENDATION_LABELS[bodyAssessment.weight_recommendation])}
                      </Text>
                    </View>
                    <View style={[styles.assessmentBadge, { backgroundColor: assessmentTone?.badgeBg, borderColor: assessmentTone?.border }]}>
                      <Text style={[styles.assessmentBadgeText, { color: assessmentTone?.text }]}> 
                        {t('profile.assessment.recommendedGoal', { goal: tx(GOAL_LABELS[bodyAssessment.recommended_goal]) })}
                      </Text>
                    </View>
                    <View style={[styles.assessmentBadge, { backgroundColor: assessmentTone?.badgeBg, borderColor: assessmentTone?.border }]}>
                      <Text style={[styles.assessmentBadgeText, { color: assessmentTone?.text }]}> 
                        {t('profile.assessment.recommendedActivity', { activity: tx(ACTIVITY_RECOMMENDATION_LABELS[bodyAssessment.recommended_activity_level]) })}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.assessmentNote, { color: assessmentTone?.text }]}> 
                    {tx(bodyAssessment.recommendation_note)}
                  </Text>

                  <View style={styles.safetyNotice}>
                    {bodyAssessment.medical_review_recommended && (
                      <Text style={styles.safetyNoticeText}>
                        {t('profile.assessment.medicalReview')}
                      </Text>
                    )}
                    {bodyAssessment.safety_warnings.map((warning, index) => (
                      <Text key={`safety-${index}`} style={styles.safetyNoticeText}>
                        {tx(warning)}
                      </Text>
                    ))}
                  </View>

                  <Text style={[styles.assessmentWeightPlan, { color: assessmentTone?.text }]}> 
                    {bodyAssessment.weight_recommendation === 'maintain'
                      ? t('profile.assessment.weightPlanMaintain', { target: bodyAssessment.target_weight_kg })
                      : t('profile.assessment.weightPlanChange', {
                          direction: bodyAssessment.weight_recommendation === 'increase'
                            ? t('profile.assessment.direction.increase')
                            : t('profile.assessment.direction.decrease'),
                          delta: bodyAssessment.weight_delta_kg,
                          target: bodyAssessment.target_weight_kg,
                        })}
                  </Text>

                  <Text style={[styles.assessmentActivityNote, { color: assessmentTone?.text }]}> 
                    {tx(bodyAssessment.activity_note)}
                  </Text>

                  <View style={styles.exerciseListWrap}>
                    <Text style={[styles.exerciseListTitle, { color: assessmentTone?.accent }]} i18nKey="screen.tabs.profile.text.009" />
                    {bodyAssessment.exercise_plan.map((item, index) => (
                      <Text key={`exercise-${index}`} style={[styles.exerciseListItem, { color: assessmentTone?.text }]}> 
                        {index + 1}. {tx(item)}
                      </Text>
                    ))}
                  </View>

                  <Text style={styles.assessmentHint}>{assessmentHintText}</Text>
                </View>
              )}

              {!bodyAssessment && !!instantAssessment.hint && (
                <Text style={styles.assessmentHint}>{assessmentHintText}</Text>
              )}
            </>
          )}
          </SurfaceCard>
        </View>
        )}

      {(isActivityDetail || isGoalPlanDetail || isRoadmapDetail) && (
      <View ref={goalRef}>
        <SurfaceCard style={[styles.sectionCard, goalCollapsed && styles.sectionCardCompact]}>
        <TouchableOpacity onPress={() => setGoalCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>
              {isActivityDetail ? 'Hoạt động' : isGoalPlanDetail ? 'Lộ trình mục tiêu' : 'Lịch vận động'}
            </Text>
            {goalCollapsed && (
              <Text style={styles.sectionSubtitle}>{profile.goal ? tx(GOAL_LABELS[profile.goal]) : t('profile.setup.goalMissing')} · {profile.activity_level ? tx(ACTIVITY_LABELS[profile.activity_level]) : '...'}</Text>
            )}
          </View>
          <MaterialIcons name={goalCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
        </TouchableOpacity>

        {(isActivityDetail || isGoalPlanDetail || isRoadmapDetail) && (
          <>
            <Text style={styles.helperText} i18nKey="screen.tabs.profile.text.014" />

            {isGoalPlanDetail && (
            <>
            <Text style={styles.label} i18nKey="screen.tabs.profile.text.015" />
            <View style={styles.chipRow}>
              {(Object.keys(GOAL_LABELS) as UserGoal[]).map((g) => (
                <UiChip
                  key={g}
                  label={tx(GOAL_LABELS[g])}
                  selected={profile.goal === g}
                  onPress={() => {
                    const nextDirection = g === 'lose_weight' ? 'loss' : g === 'gain_muscle' ? 'gain' : 'maintain';
                    setProfile((p) => ({
                      ...p,
                      goal: g,
                      // A server-computed plan for another direction is stale as soon as
                      // the user changes their goal. Keep it hidden until the next save.
                      goal_plan: p.goal_plan?.direction === nextDirection ? p.goal_plan : null,
                    }));
                    setGoalPlanDirection(nextDirection);
                    setGoalPlanDurationEdited(false);
                    if (nextDirection === 'maintain') setGoalPlanTargetKg(0);
                  }}
                />
              ))}
            </View>
            </>
            )}

            {isActivityDetail && (
            <>
            <View ref={activityFieldsRef} onLayout={registerDetailAnchor('activity')}>
              <Text style={styles.label} i18nKey="screen.tabs.profile.text.016" />
              <Text style={styles.helperText}>Tách vận động trong công việc và buổi tập để AI không đánh giá sai nhu cầu năng lượng.</Text>
              <Text style={styles.label}>Vận động trong công việc</Text>
            </View>
            <View style={styles.chipRow}>
              {(Object.keys(WORK_ACTIVITY_LABELS) as Array<NonNullable<User['work_activity_level']>>).map((level) => (
                <UiChip
                  key={level}
                  label={WORK_ACTIVITY_LABELS[level]}
                  selected={profile.work_activity_level === level}
                  onPress={() => setProfile((p) => ({ ...p, work_activity_level: level }))}
                  style={styles.activityChip}
                />
              ))}
            </View>
            <View style={styles.goalPlanRow}>
              <UiInput
                label="Số buổi tập mỗi tuần"
                value={String(profile.exercise_sessions_per_week ?? '')}
                onChangeText={(v) => setProfile((p) => ({ ...p, exercise_sessions_per_week: parseOptionalNumberInput(v) }))}
                keyboardType="number-pad"
                error={formErrors.exercise_sessions_per_week}
                style={{ flex: 1 }}
              />
              <UiInput
                label="Phút mỗi buổi"
                value={String(profile.exercise_minutes_per_session ?? '')}
                onChangeText={(v) => setProfile((p) => ({ ...p, exercise_minutes_per_session: parseOptionalNumberInput(v) }))}
                keyboardType="number-pad"
                error={formErrors.exercise_minutes_per_session}
                style={{ flex: 1 }}
              />
            </View>
            <Text style={styles.label}>Mức đổ mồ hôi thường gặp</Text>
            <View style={styles.chipRow}>
              {(Object.keys(SWEAT_LEVEL_LABELS) as Array<NonNullable<User['sweat_level']>>).map((level) => (
                <UiChip
                  key={level}
                  label={SWEAT_LEVEL_LABELS[level]}
                  selected={profile.sweat_level === level}
                  onPress={() => setProfile((p) => ({ ...p, sweat_level: level }))}
                />
              ))}
            </View>
            <Text style={styles.label}>Cấp độ vận động viên · Tùy chọn</Text>
            <View style={styles.chipRow}>
              {([
                ['recreational', 'Phong trào'],
                ['competitive', 'Thi đấu'],
                ['elite', 'Chuyên nghiệp'],
              ] as const).map(([level, label]) => (
                <UiChip key={level} label={label} selected={profile.athlete_level === level} onPress={() => setProfile((p) => ({ ...p, athlete_level: level }))} />
              ))}
            </View>
            <Text style={styles.label}>Mức vận động tổng hợp</Text>
            <View style={styles.derivedFieldCard} accessibilityRole="summary">
              <View style={styles.derivedFieldIcon}>
                <MaterialIcons name="auto-graph" size={18} color={colors.success} />
              </View>
              <View style={styles.profileRowCopy}>
                <Text style={styles.derivedFieldValue}>
                  {profile.activity_level ? tx(ACTIVITY_LABELS[profile.activity_level]) : 'Sẽ được tính sau khi lưu'}
                </Text>
                <Text style={styles.derivedFieldHint}>
                  Backend tính từ vận động trong công việc và số phút tập mỗi tuần. Trường này không chỉnh trực tiếp.
                </Text>
              </View>
            </View>
            </>
            )}

            {(isGoalPlanDetail || isRoadmapDetail) && (
            <View style={[styles.goalPlanningGrid, isDesktop && styles.goalPlanningGridDesktop]}>
              {isGoalPlanDetail && (
              <View ref={goalPlanRef} onLayout={registerDetailAnchor('goalPlan')} style={[styles.goalPlanPanel, isDesktop && styles.goalPlanningPanelDesktop]}>
                <Text style={styles.label} i18nKey="screen.tabs.profile.text.017" />
                <View style={styles.goalPlanRow}>
                  <UiInput
                    label="screen.tabs.profile.label.005"
                    value={goalPlanDirection === 'maintain' ? '0' : String(goalPlanTargetKg ?? '')}
                    onChangeText={(v) => {
                      const normalized = v.trim().replace(',', '.');
                      const parsed = Number(normalized);
                      setGoalPlanTargetKg(normalized === '' || !Number.isFinite(parsed) ? undefined : parsed);
                    }}
                    keyboardType="decimal-pad"
                    editable={goalPlanDirection !== 'maintain'}
                    error={formErrors.goal_plan_target}
                    style={{ flex: 1, opacity: goalPlanDirection === 'maintain' ? 0.55 : 1 }}
                  />
                  <UiInput
                    label="screen.tabs.profile.label.006"
                    value={String(goalPlanDurationWeeks ?? '')}
                    onChangeText={(v) => {
                      setGoalPlanDurationEdited(true);
                      setGoalPlanDurationWeeks(parseOptionalNumberInput(v));
                    }}
                    keyboardType="numeric"
                    error={formErrors.goal_plan_duration}
                    style={{ width: 140 }}
                  />
                </View>
                <View style={styles.goalPlanStatusBox} accessibilityRole="summary">
                  <Text style={styles.goalPlanStatusTitle}>
                    Nhịp độ gợi ý: {goalPaceSuggestion.weeklyRange}
                  </Text>
                  <Text style={styles.goalPlanStatusText}>{goalPaceSuggestion.durationRange}</Text>
                  <Text style={styles.goalPlanStatusText}>{goalPaceSuggestion.context}</Text>
                  {goalPaceSuggestion.needsClinicalReview && (
                    <Text style={styles.goalPlanWarningText}>
                      Hồ sơ có yếu tố cần thận trọng. Hãy xác nhận mục tiêu và nhịp độ với bác sĩ hoặc chuyên gia dinh dưỡng.
                    </Text>
                  )}
                </View>
                <Text style={styles.helperText} i18nKey="screen.tabs.profile.text.018" />
                {activeGoalPlan?.computed_daily_calorie_target && (
                  <View style={styles.goalPlanStatusBox}>
                    <Text style={styles.goalPlanStatusTitle}>
                      {t('profile.goalPlan.statusTitle', { target: activeGoalPlan.computed_daily_calorie_target })}
                    </Text>
                    <Text style={styles.goalPlanStatusText}>
                      {t('profile.goalPlan.statusText', { rate: activeGoalPlan.weekly_rate_kg ?? 0, status: activeGoalPlan.safety_status ?? 'ok' })}
                    </Text>
                    {activeGoalPlan.warnings?.map((warning, index) => (
                      <Text key={`goal-plan-warning-${index}`} style={styles.goalPlanWarningText}>{warning}</Text>
                    ))}
                  </View>
                )}
                {activeGoalPlan && (
                  <UiButton label="screen.tabs.profile.label.010" variant="ghost" onPress={clearGoalPlan} style={styles.clearGoalPlanButton} />
                )}
              </View>
              )}

              {isRoadmapDetail && (
              <View
                ref={roadmapRef}
                onLayout={registerDetailAnchor('roadmap')}
                style={[styles.roadmapPanel, isDesktop && styles.goalPlanningPanelDesktop]}
              >
                <View style={styles.roadmapHeader}>
                  <View style={styles.roadmapPanelTitleRow}>
                    <Text style={styles.label} i18nKey="screen.tabs.profile.text.019" />
                    <TouchableOpacity style={styles.roadmapAddBtn} onPress={openAddRoadmapExercise}>
                      <MaterialIcons name="add" size={15} color={colors.textOnAccent} />
                      <Text style={styles.roadmapAddBtnText} i18nKey="screen.tabs.profile.text.020" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.roadmapSummary}>
                    {roadmap.length > 0
                      ? t('profile.roadmap.summary', { done: completedRoadmapCount, total: roadmap.length, kcal: completedRoadmapKcal })
                      : t('profile.roadmap.emptySummary')}
                  </Text>
                </View>
                <Text style={styles.helperText} i18nKey="screen.tabs.profile.text.021" />

                {roadmap.length === 0 ? (
                  <View style={styles.roadmapEmptyBox}>
                    <Text style={styles.roadmapEmptyText} i18nKey="screen.tabs.profile.text.022" />
                  </View>
                ) : (
                  <View style={styles.roadmapWrap}>
                    {roadmap.map((item) => {
                      const completed = completedRoadmapTaskIds.has(item.id);
                      return (
                        <View
                          key={item.id}
                          style={[styles.roadmapItem, completed && styles.roadmapItemCompleted]}
                        >
                          <View style={styles.roadmapItemLeft}>
                            <View style={[styles.checkbox, completed && styles.checkboxCompleted]}>
                              {completed && <Text style={styles.checkboxTick}>✓</Text>}
                            </View>
                            <View style={styles.roadmapItemBody}>
                              <Text style={styles.roadmapItemTitle}>{tx(item.title)}</Text>
                              <Text style={styles.roadmapItemDetail}>{tx(item.detail)}</Text>
                              <Text style={styles.roadmapItemMeta}>
                                {t('profile.roadmap.meta', {
                                  minutes: item.duration_min,
                                  kcal: item.estimated_kcal,
                                  activity: tx(EXERCISE_ACTIVITY_LABELS[item.activity_type] ?? item.activity_type),
                                })}
                              </Text>
                              <Text style={styles.roadmapCta}>{completed ? t('profile.roadmap.loggedToday') : t('profile.roadmap.cta')}</Text>
                              <View style={styles.roadmapActionsRow}>
                                <TouchableOpacity
                                  style={styles.roadmapActionBtn}
                                  onPress={() => openEditRoadmapExercise(item)}
                                >
                                  <MaterialIcons name="edit" size={13} color={colors.accentCyan} />
                                  <Text style={styles.roadmapActionText} i18nKey="screen.tabs.profile.text.023" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.roadmapActionBtn, styles.roadmapDeleteBtn]}
                                  onPress={() => handleRemoveRoadmapTask(item)}
                                >
                                  <MaterialIcons name="delete-outline" size={13} color={colors.danger} />
                                  <Text style={styles.roadmapDeleteText} i18nKey="screen.tabs.profile.text.024" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
              )}
            </View>
            )}
          </>
        )}
        </SurfaceCard>
      </View>
      )}

      {false && (
      <SurfaceCard style={[styles.sectionCard, calorieCollapsed && styles.sectionCardCompact]}>
        <TouchableOpacity onPress={() => setCalorieCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle} i18nKey="screen.tabs.profile.text.025" />
            {calorieCollapsed && (
              <Text style={styles.sectionSubtitle}>{profile.daily_calorie_target ? t('profile.calorie.collapsed', { target: profile.daily_calorie_target }) : t('profile.basic.unset')}</Text>
            )}
          </View>
          <MaterialIcons name={calorieCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
        </TouchableOpacity>

        {!calorieCollapsed && (
          <>
            <Text style={styles.helperText}>
              Các mục tiêu dưới đây do backend tính và được lưu cùng phiên bản thuật toán. Muốn thay đổi, hãy cập nhật cơ thể, mục tiêu hoặc vận động.
            </Text>
            <View style={styles.derivedTargetHero}>
              <Text style={styles.derivedTargetLabel}>Mục tiêu calorie hiện tại</Text>
              <Text style={styles.derivedTargetValue}>
                {typeof displayedCalorieTarget === 'number'
                  ? `${Math.round(displayedCalorieTarget ?? 0).toLocaleString('vi-VN')} kcal/ngày`
                  : 'Chưa đủ dữ liệu'}
              </Text>
              <Text style={styles.derivedTargetMeta}>
                {profile.nutrition_algorithm_version
                  ? `Phiên bản ${profile.nutrition_algorithm_version}`
                  : 'Hoàn tất hồ sơ để tạo mục tiêu'}
              </Text>
            </View>
            <View style={[styles.mealTargetReadOnlyGrid, isDesktop && styles.mealTargetRowDesktop]}>
              {[
                ['Sáng', profile.target_breakfast_cal],
                ['Trưa', profile.target_lunch_cal],
                ['Tối', profile.target_dinner_cal],
                ['Bữa phụ', profile.target_snack_cal],
              ].map(([label, value]) => (
                <View key={String(label)} style={styles.mealTargetReadOnlyItem}>
                  <Text style={styles.mealTargetReadOnlyLabel}>{label}</Text>
                  <Text style={styles.mealTargetReadOnlyValue}>
                    {typeof value === 'number' ? `${Math.round(value)} kcal` : '--'}
                  </Text>
                </View>
              ))}
            </View>
            <MacrosCard daily_calorie_target={profile.daily_calorie_target} weight_kg={profile.weight_kg} goal={profile.goal} />
          </>
        )}
      </SurfaceCard>
      )}

      {isNotificationsDetail && (
      <View ref={notificationsRef} onLayout={registerDetailAnchor('notifications')}>
        <SurfaceCard style={[styles.sectionCard, notificationsCollapsed && styles.sectionCardCompact]}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity onPress={() => setNotificationsCollapsed((s) => !s)} activeOpacity={0.8} style={{ flex: 1 }}>
            <View>
              <Text style={styles.sectionTitle} i18nKey="screen.tabs.profile.text.027" />
              {notificationsCollapsed && (
              <Text style={styles.sectionSubtitle}>{(reminders.allow_push_notifications ?? true) ? t('profile.notification.on') : t('profile.notification.off')}</Text>
              )}
            </View>
          </TouchableOpacity>

          <Switch
            value={reminders.allow_push_notifications ?? true}
            onValueChange={(v) => setReminders((r) => ({ ...r, allow_push_notifications: v }))}
            trackColor={{ false: colors.border, true: colors.success }}
            thumbColor={(reminders.allow_push_notifications ?? true) ? colors.accentMint : colors.textMuted}
          />

          <TouchableOpacity onPress={() => setNotificationsCollapsed((s) => !s)} style={{ paddingLeft: 8 }}>
            <MaterialIcons name={notificationsCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {!notificationsCollapsed && (
          <>
            {/* Sub-content dims + blocks interaction when master toggle is off */}
            <View
              style={[styles.notificationSubContent, !(reminders.allow_push_notifications ?? true) && styles.notificationSubContentDisabled]}
              pointerEvents={!(reminders.allow_push_notifications ?? true) ? 'none' : 'auto'}
            >
            <View style={styles.hydrationReminderRow}>
              <View style={styles.hydrationReminderIcon}>
                <MaterialIcons name="water-drop" size={20} color={colors.info} />
              </View>
              <View style={styles.hydrationReminderCopy}>
                <Text style={styles.hydrationReminderTitle}>Nhắc uống nước</Text>
                <Text style={styles.hydrationReminderBody}>
                  Theo {activeHydrationSlots.length} mốc trong lịch nước đã thiết lập
                </Text>
              </View>
              <Switch
                value={(reminders.allow_push_notifications ?? true) && (reminders.hydration_reminder_enabled ?? true)}
                onValueChange={(value) => setReminders((current) => ({ ...current, hydration_reminder_enabled: value }))}
                trackColor={{ false: colors.border, true: colors.success }}
                thumbColor={(reminders.hydration_reminder_enabled ?? true) ? colors.accentMint : colors.textMuted}
              />
            </View>

            <Text style={styles.label} i18nKey="screen.tabs.profile.text.030" />
            <View style={[styles.chipRow, { marginBottom: 12 }]}>
              {(['encouraging', 'neutral', 'warning'] as const).map((style) => (
                <UiChip
                  key={style}
                  label={style === 'encouraging'
                    ? t('profile.reminderStyle.encouraging')
                    : style === 'neutral'
                      ? t('profile.reminderStyle.neutral')
                      : t('profile.reminderStyle.warning')}
                  selected={reminders.nudge_motivation_style === style}
                  onPress={() => setReminders((r) => ({ ...r, nudge_motivation_style: style }))}
                />
              ))}
            </View>

            <View style={styles.reminderMealSection}>
              <ReminderTimePickerRow
                meal="breakfast"
                mealLabel={t('screen.tabs.profile.label.012')}
                enabled={reminders.breakfast_reminder_enabled ?? true}
                time={reminders.breakfast_reminder_time ?? '07:00'}
                onEnabledChange={(v) => setReminders((r) => ({ ...r, breakfast_reminder_enabled: v }))}
                onTimeChange={(v) => setReminders((r) => ({ ...r, breakfast_reminder_time: v }))}
              />
              <ReminderTimePickerRow
                meal="lunch"
                mealLabel={t('screen.tabs.profile.label.013')}
                enabled={reminders.lunch_reminder_enabled ?? true}
                time={reminders.lunch_reminder_time ?? '12:00'}
                onEnabledChange={(v) => setReminders((r) => ({ ...r, lunch_reminder_enabled: v }))}
                onTimeChange={(v) => setReminders((r) => ({ ...r, lunch_reminder_time: v }))}
              />
              <ReminderTimePickerRow
                meal="dinner"
                mealLabel={t('screen.tabs.profile.label.014')}
                enabled={reminders.dinner_reminder_enabled ?? true}
                time={reminders.dinner_reminder_time ?? '19:00'}
                onEnabledChange={(v) => setReminders((r) => ({ ...r, dinner_reminder_enabled: v }))}
                onTimeChange={(v) => setReminders((r) => ({ ...r, dinner_reminder_time: v }))}
              />
              <ReminderTimePickerRow
                meal="snack"
                mealLabel={t('screen.tabs.profile.label.015')}
                enabled={reminders.snack_reminder_enabled ?? false}
                time={reminders.snack_reminder_time ?? '15:00'}
                onEnabledChange={(v) => setReminders((r) => ({ ...r, snack_reminder_enabled: v }))}
                onTimeChange={(v) => setReminders((r) => ({ ...r, snack_reminder_time: v }))}
                isLast
              />
            </View>

            {reminderEffectiveness ? (
              <SurfaceCard style={styles.reminderEffectivenessCard}>
                <View style={styles.reminderEffectivenessHeader}>
                  <View style={styles.reminderEffectivenessCopy}>
                    <Text style={styles.label} i18nKey="profile.reminderEffectiveness.title" />
                    <Text style={styles.helperText}>{reminderEffectiveness.recommendation}</Text>
                  </View>
                  <View style={styles.reminderEffectivenessBadge}>
                    <Text style={styles.reminderEffectivenessScore}>{reminderEffectiveness.effectiveness_score}</Text>
                    <Text style={styles.reminderEffectivenessUnit}>/100</Text>
                  </View>
                </View>
                <View style={styles.reminderEffectivenessGrid}>
                  <View style={styles.reminderEffectivenessMetric}>
                    <Text style={styles.reminderEffectivenessMetricValue}>{reminderEffectiveness.open_rate}%</Text>
                    <Text style={styles.reminderEffectivenessMetricLabel} i18nKey="profile.reminderEffectiveness.openRate" />
                  </View>
                  <View style={styles.reminderEffectivenessMetric}>
                    <Text style={styles.reminderEffectivenessMetricValue}>{reminderEffectiveness.action_rate}%</Text>
                    <Text style={styles.reminderEffectivenessMetricLabel} i18nKey="profile.reminderEffectiveness.actionRate" />
                  </View>
                  <View style={styles.reminderEffectivenessMetric}>
                    <Text style={styles.reminderEffectivenessMetricValue}>{reminderEffectiveness.ignore_rate}%</Text>
                    <Text style={styles.reminderEffectivenessMetricLabel} i18nKey="profile.reminderEffectiveness.ignoreRate" />
                  </View>
                </View>
                <View style={styles.reminderEffectivenessPills}>
                  {reminderEffectiveness.best_meal ? (
                    <Text style={styles.reminderEffectivenessPill}>
                      {t('profile.reminderEffectiveness.bestMeal', { meal: reminderEffectiveness.best_meal })}
                    </Text>
                  ) : null}
                  {reminderEffectiveness.weakest_meal ? (
                    <Text style={styles.reminderEffectivenessPill}>
                      {t('profile.reminderEffectiveness.weakestMeal', { meal: reminderEffectiveness.weakest_meal })}
                    </Text>
                  ) : null}
                </View>
                {reminderEffectiveness.patterns.length > 0 ? (
                  <View style={styles.reminderEffectivenessPatterns}>
                    {reminderEffectiveness.patterns.slice(0, 2).map((pattern) => (
                      <Text key={pattern} style={styles.reminderEffectivenessPattern}>• {pattern}</Text>
                    ))}
                  </View>
                ) : null}
              </SurfaceCard>
            ) : null}

            <View style={styles.previewSection}>
              <Text style={styles.label} i18nKey="screen.tabs.profile.text.031" />
              <View style={styles.chipRow}>
                {([
                  ['breakfast', t('screen.tabs.profile.label.012')],
                  ['lunch', t('screen.tabs.profile.label.013')],
                  ['dinner', t('screen.tabs.profile.label.014')],
                  ['snack', t('screen.tabs.profile.label.015')],
                ] as const).map(([mealType, label]) => (
                  <UiChip
                    key={mealType}
                    label={label}
                    selected={previewMeal === mealType}
                    onPress={() => {
                      setPreviewMeal(mealType);
                      void fetchPreviewNudge(mealType);
                    }}
                  />
                ))}
              </View>

              <SurfaceCard style={styles.previewCard}>
                {isPreviewLoading && <ActivityIndicator color={colors.accentMint} />}
                {!isPreviewLoading && previewNudge && (
                  <>
                    <Text style={styles.previewTitle}>{previewNudge.emoji} {previewNudge.title}</Text>
                    <Text style={styles.previewBody}>{previewNudge.body}</Text>
                    {!!previewNudge.streakContext && (
                      <Text style={styles.previewMeta}>
                        {t('profile.preview.streakMeta', {
                          current: previewNudge.streakContext.currentStreak,
                          best: previewNudge.streakContext.longestStreak,
                        })}
                      </Text>
                    )}
                  </>
                )}
              </SurfaceCard>
            </View>
            </View>{/* end notificationSubContent */}
          </>
        )}
        </SurfaceCard>
      </View>
      )}

      {isSubscriptionDetail && (
      <View ref={subscriptionRef} onLayout={registerDetailAnchor('subscription')}>
      <SurfaceCard style={[styles.sectionCard, subscriptionCollapsed && styles.sectionCardCompact]}>
        <TouchableOpacity onPress={() => setSubscriptionCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle} i18nKey="screen.tabs.profile.text.032" />
            {subscriptionCollapsed && (
              <Text style={styles.sectionSubtitle}>
                {subscription?.tier === 'premium' ? 'Premium' : subscription?.tier === 'pro' ? 'Pro' : t('profile.subscription.free')}
                {' · '}
                {subscription?.is_active ? t('profile.subscription.active') : t('profile.subscription.expired')}
              </Text>
            )}
          </View>
          <MaterialIcons name={subscriptionCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
        </TouchableOpacity>

        {!subscriptionCollapsed && (() => {
          const tier = subscription?.tier ?? 'free';
          const isPaid = tier !== 'free';
          const isActive = subscription?.is_active ?? false;
          const tierColor = tier === 'pro' ? colors.warning : tier === 'premium' ? colors.accentCoral : colors.textMuted;
          const tierName = tier === 'pro' ? 'Pro' : tier === 'premium' ? 'Premium' : t('profile.subscription.free');

          const renewsAt = subscription?.renews_at ? new Date(subscription.renews_at) : null;
          const renewsText = renewsAt && !Number.isNaN(renewsAt.getTime())
            ? renewsAt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : null;

          // AI quota per tier (mirrors ai-usage.policy.ts)
          const AI_QUOTA: Record<string, { scan: number; voice: number; coach: number; text: number }> = {
            free:    { scan: 1,   voice: 1,  coach: 5,   text: 3   },
            premium: { scan: 10,  voice: 10, coach: 50,  text: 30  },
            pro:     { scan: 30,  voice: 30, coach: 150, text: 100 },
          };
          const quota = AI_QUOTA[tier] ?? AI_QUOTA.free;

          // Features: only show meaningful ones, mark pro-exclusive
          type FeatureRow = { key: keyof SubscriptionFeatures; icon: string; label: string; proOnly?: boolean };
          const FEATURE_ROWS: FeatureRow[] = [
            { key: 'ai_coach',          icon: 'smart-toy',         label: 'AI Coach' },
            { key: 'meal_reminders',    icon: 'notifications',     label: 'Nhắc nhở bữa ăn' },
            { key: 'daily_insights',    icon: 'insights',          label: 'Phân tích hàng ngày' },
            { key: 'weekly_reports',    icon: 'bar-chart',         label: 'Báo cáo hàng tuần' },
            { key: 'correction_tracking', icon: 'edit-note',       label: 'Theo dõi chỉnh sửa' },
            { key: 'custom_goals',      icon: 'flag',              label: 'Mục tiêu tuỳ chỉnh' },
            { key: 'healthkit_sync',    icon: 'favorite',          label: 'HealthKit / Sức khoẻ', proOnly: true },
            { key: 'priority_support',  icon: 'headset-mic',       label: 'Hỗ trợ ưu tiên',      proOnly: true },
          ];

          const visibleFeatures = isPaid
            ? FEATURE_ROWS.filter(({ key }) => SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS]?.features[key])
            : FEATURE_ROWS.filter(({ key }) => !SUBSCRIPTION_TIERS.free.features[key]);

          const openPaywall = () => {
            setShowProfileDetails(false);
            setTimeout(() => {
              router.push({ pathname: '/paywall', params: { returnTo: '/profile' } } as never);
            }, 0);
          };

          return (
            <View style={styles.subBody}>

              {/* ── Tier hero ── */}
              <View style={styles.subHeroRow}>
                <View style={[styles.subTierBadge, { backgroundColor: tierColor + '22', borderColor: tierColor + '55' }]}>
                  <MaterialIcons
                    name={(tier === 'pro' ? 'star' : tier === 'premium' ? 'workspace-premium' : 'favorite-border') as any}
                    size={18}
                    color={tierColor}
                  />
                  <Text style={[styles.subTierName, { color: tierColor }]}>{tierName}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <View style={[styles.subStatusPill, isActive ? styles.subStatusPillActive : styles.subStatusPillExpired]}>
                  <Text style={[styles.subStatusText, isActive ? styles.subStatusTextActive : styles.subStatusTextExpired]}>
                    {isActive ? 'Đang hoạt động' : 'Hết hạn'}
                  </Text>
                </View>
              </View>

              {renewsText && isPaid && (
                <Text style={styles.subRenewsText}>
                  {isActive ? `Gia hạn: ${renewsText}` : `Đã hết hạn: ${renewsText}`}
                </Text>
              )}

              {/* ── AI quota grid ── */}
              <View style={styles.subSection}>
                <View style={styles.subSectionHeader}>
                  <MaterialIcons name="smart-toy" size={14} color={colors.info} />
                  <Text style={styles.subSectionTitle}>Giới hạn AI mỗi ngày</Text>
                </View>
                <View style={styles.subQuotaGrid}>
                  {([
                    { icon: 'photo-camera', label: 'Scan ảnh', value: quota.scan },
                    { icon: 'mic',          label: 'Giọng nói', value: quota.voice },
                    { icon: 'chat',         label: 'AI Coach',  value: quota.coach },
                    { icon: 'text-fields',  label: 'Scan text', value: quota.text },
                  ] as const).map(({ icon, label, value }) => (
                    <View key={label} style={styles.subQuotaBox}>
                      <MaterialIcons name={icon as any} size={16} color={tierColor} />
                      <Text style={[styles.subQuotaNum, { color: tierColor }]}>{value}</Text>
                      <Text style={styles.subQuotaLabel}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* ── Feature list ── */}
              <View style={styles.subSection}>
                <View style={styles.subSectionHeader}>
                  <MaterialIcons name="check-circle" size={14} color={colors.success} />
                  <Text style={styles.subSectionTitle}>
                    {isPaid ? 'Tính năng đang dùng' : 'Tính năng cần nâng cấp'}
                  </Text>
                </View>
                <View style={styles.subFeatureList}>
                  {visibleFeatures.map(({ key, icon, label, proOnly }) => (
                    <View key={key} style={styles.subFeatureRow}>
                      <MaterialIcons
                        name={icon as any}
                        size={15}
                        color={isPaid ? colors.success : colors.textMuted}
                      />
                      <Text style={[styles.subFeatureText, !isPaid && styles.subFeatureTextLocked]}>
                        {label}
                      </Text>
                      {proOnly && tier !== 'pro' && !isPaid && (
                        <View style={styles.subProBadge}>
                          <Text style={styles.subProBadgeText}>Pro</Text>
                        </View>
                      )}
                      {proOnly && tier === 'pro' && (
                        <View style={styles.subProBadge}>
                          <Text style={styles.subProBadgeText}>Pro</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>

              {/* ── CTA ── */}
              {(!isPaid || !isActive) ? (
                <TouchableOpacity
                  style={styles.subUpgradeBtn}
                  onPress={openPaywall}
                  activeOpacity={0.85}
                  testID="profile-subscription-upgrade-button"
                  accessibilityRole="button"
                >
                  <MaterialIcons name="workspace-premium" size={16} color="#fff" />
                  <Text style={styles.subUpgradeBtnText}>
                    {!isActive && isPaid ? t('profile.subscription.renewBtn') : t('profile.subscription.upgradeBtn')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.subManageBtn}
                  onPress={openPaywall}
                  activeOpacity={0.7}
                  testID="profile-subscription-manage-button"
                  accessibilityRole="button"
                >
                  <Text style={styles.subManageBtnText}>{t('profile.subscription.manage')}</Text>
                  <MaterialIcons name="chevron-right" size={16} color={colors.accentMint} />
                </TouchableOpacity>
              )}
            </View>
          );
        })()}
      </SurfaceCard>
      </View>
      )}
            </ScrollView>
          </View>
        </Modal>

      </View>
      <RewardToast reward={reward} onHide={() => setReward(null)} />
    </ScreenShell>
  );
}

function ProfileSectionLabel({ label }: { label: string }) {
  return <Text style={styles.profileSectionLabel}>{label.toUpperCase()}</Text>;
}

function ProfileOverviewRow({
  icon,
  label,
  value,
  onPress,
  warning = false,
  completionStatus,
  completionTestID,
  muted = false,
  last = false,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string;
  onPress?: () => void;
  warning?: boolean;
  completionStatus?: ProfileCompletionStatus;
  completionTestID?: string;
  muted?: boolean;
  last?: boolean;
}) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const completionLabel = completionStatus
    ? t(`profile.completion.${completionStatus}` as I18nKey)
    : null;
  const completionColor = completionStatus === 'required'
    ? colors.danger
    : completionStatus === 'partial'
      ? colors.warning
      : colors.success;
  const content = (
    <>
      <View style={[
        styles.profileRowIcon,
        warning && styles.profileRowIconWarning,
        completionStatus === 'required' && styles.profileRowIconIncomplete,
        completionStatus === 'partial' && styles.profileRowIconPartial,
      ]}>
        <MaterialIcons name={icon} size={20} color={completionStatus ? completionColor : warning ? colors.warning : colors.success} />
      </View>
      <View style={styles.profileRowCopy}>
        <Text style={styles.profileRowLabel}>{label}</Text>
        <Text style={[styles.profileRowValue, muted && styles.profileRowValueMuted, warning && styles.profileRowValueWarning]} numberOfLines={2}>{value}</Text>
      </View>
      {completionStatus && <ProfileCompletionBadge status={completionStatus} testID={completionTestID} />}
      {onPress && <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />}
    </>
  );

  if (!onPress) {
    return <View style={[styles.profileOverviewRow, !last && styles.profileOverviewRowBorder]}>{content}</View>;
  }
  return (
    <TouchableOpacity
      style={[styles.profileOverviewRow, !last && styles.profileOverviewRowBorder]}
      onPress={onPress}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${value}${completionLabel ? `. ${completionLabel}` : ''}`}
      accessibilityHint={completionStatus !== 'complete' ? t('profile.incompleteHint') : undefined}
    >
      {content}
    </TouchableOpacity>
  );
}

function ProfileCompletionBadge({
  status,
  testID,
}: {
  status: ProfileCompletionStatus;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const pulse = React.useRef(new Animated.Value(status === 'required' ? 0 : 1)).current;

  React.useEffect(() => {
    if (status !== 'required') {
      pulse.setValue(1);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 650,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, status]);

  const tone = status === 'required'
    ? {
        color: colors.danger,
        backgroundColor: colors.surfaceDanger,
        borderColor: colors.borderDanger,
        icon: 'fiber-manual-record' as const,
      }
    : status === 'partial'
      ? {
          color: colors.warning,
          backgroundColor: colors.surfaceWarning,
          borderColor: colors.borderWarning,
          icon: 'error-outline' as const,
        }
      : {
          color: colors.success,
          backgroundColor: colors.surfaceSuccess,
          borderColor: colors.borderSuccess,
          icon: 'check-circle' as const,
        };

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.profileIncompleteBadge,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
          opacity: status === 'required'
            ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] })
            : 1,
          transform: [{
            scale: status === 'required'
              ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] })
              : 1,
          }],
        },
      ]}
    >
      <MaterialIcons name={tone.icon} size={status === 'required' ? 7 : 12} color={tone.color} />
      <Text style={[styles.profileIncompleteText, { color: tone.color }]}>
        {t(`profile.completion.${status}` as I18nKey)}
      </Text>
    </Animated.View>
  );
}

function Field({ label, value, onChangeText, keyboardType, placeholder, error, fullWidth }: { label: string; value: string; onChangeText: (v: string) => void; keyboardType?: any; placeholder?: string; error?: string; fullWidth?: boolean }) {
  return (
    <View style={[styles.fieldContainer, fullWidth && styles.fieldContainerFull]}>
      <UiInput label={label} value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholder={placeholder} error={error} />
    </View>
  );
}

function ReminderTimePickerRow({
  meal,
  mealLabel,
  enabled,
  time,
  onEnabledChange,
  onTimeChange,
  isLast,
}: {
  meal: string;
  mealLabel: string;
  enabled: boolean;
  time: string;
  onEnabledChange: (v: boolean) => void;
  onTimeChange: (v: string) => void;
  isLast?: boolean;
}) {
  const { colors } = useAppTheme();

  const hours = parseInt(time.split(':')[0]);
  const minutes = parseInt(time.split(':')[1]);

  const handleH = (v: string) => {
    const h = Math.max(0, Math.min(23, parseInt(v) || 0));
    onTimeChange(`${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
  };
  const handleM = (v: string) => {
    const m = Math.max(0, Math.min(59, parseInt(v) || 0));
    onTimeChange(`${String(hours).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  return (
    <View style={[styles.reminderRowCompact, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Text style={[styles.reminderMealLabelCompact, !enabled && { color: colors.textMuted }]}>
        {mealLabel}
      </Text>
      <View style={styles.reminderTimeInline}>
        <TextInput
          style={[styles.timeInputInline, !enabled && { color: colors.textMuted, backgroundColor: colors.surfaceLifted }]}
          value={String(hours).padStart(2, '0')}
          onChangeText={handleH}
          keyboardType="number-pad"
          maxLength={2}
          editable={enabled}
          selectTextOnFocus
        />
        <Text style={[styles.timeSepInline, !enabled && { color: colors.textMuted }]}>:</Text>
        <TextInput
          style={[styles.timeInputInline, !enabled && { color: colors.textMuted, backgroundColor: colors.surfaceLifted }]}
          value={String(minutes).padStart(2, '0')}
          onChangeText={handleM}
          keyboardType="number-pad"
          maxLength={2}
          editable={enabled}
          selectTextOnFocus
        />
      </View>
      <Switch
        value={enabled}
        onValueChange={onEnabledChange}
        trackColor={{ false: colors.border, true: colors.success }}
        thumbColor={enabled ? colors.accentMint : colors.textMuted}
      />
    </View>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  heroBody: { marginBottom: 18, maxWidth: 720 },
  profileHeader: {
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  profileHeaderTitle: {
    color: colors.text,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  profileHeaderSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  profileIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSuccess,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
  },
  profileAvatarText: {
    color: colors.success,
    fontSize: 22,
    fontWeight: '900',
  },
  profileIdentityCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: colors.text,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
  },
  profileCompletionLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  profileCompletionTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.progressBg,
    marginTop: 7,
  },
  profileCompletionFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accentMint,
  },
  profileMissingText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  profileCompleteText: {
    color: colors.success,
  },
  profilePrimaryAction: {
    alignSelf: 'flex-start',
    minHeight: 42,
    marginTop: 12,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: colors.accentMint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePrimaryActionText: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontWeight: '900',
  },
  profileSectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginHorizontal: 4,
    marginBottom: 7,
    marginTop: 4,
  },
  aiTargetCard: {
    marginBottom: 18,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  aiTargetCardWarning: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  aiTargetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  aiTargetCopy: {
    flex: 1,
    minWidth: 0,
  },
  aiTargetEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginBottom: 5,
  },
  aiTargetGoal: {
    color: colors.text,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  aiTargetIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTargetIconWarning: {
    backgroundColor: colors.surfaceWarning,
  },
  aiTargetNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
    marginTop: 13,
  },
  aiTargetNumber: {
    color: colors.text,
    fontSize: 35,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  aiTargetUnit: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  macroMiniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  macroMiniText: {
    color: colors.success,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '800',
  },
  aiTargetBasis: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 11,
  },
  aiTargetUpdated: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  aiTargetWarningText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 13,
  },
  aiTargetLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    marginTop: 4,
  },
  aiTargetLinkText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '900',
  },
  calculationPanel: {
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    padding: 11,
    marginBottom: 6,
  },
  calculationHeaderRow: {
    gap: 2,
  },
  calculationTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  calculationCaption: {
    color: colors.textMuted,
    fontSize: 11,
  },
  calculationItem: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 8,
    gap: 3,
  },
  calculationItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  calculationMetric: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  calculationEvidenceBadge: {
    color: colors.success,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'right',
  },
  calculationMethod: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 16,
  },
  calculationAssumption: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
  },
  calculationGuardrail: {
    color: colors.warning,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '800',
  },
  calculationEmpty: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  evidenceToggle: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
  },
  evidenceToggleText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  evidenceList: {
    gap: 7,
    marginTop: 3,
  },
  evidenceItem: {
    minHeight: 48,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  evidenceOrganization: {
    color: colors.success,
    fontSize: 10,
    fontWeight: '900',
  },
  evidenceTitle: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    paddingRight: 18,
  },
  evidenceLevel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
  profileGroupCard: {
    marginBottom: 18,
    paddingVertical: 2,
    paddingHorizontal: 14,
  },
  profileOverviewRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 8,
  },
  profileOverviewRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  profileRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.surfaceSuccess,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRowIconWarning: {
    backgroundColor: colors.surfaceWarning,
  },
  profileRowIconIncomplete: {
    backgroundColor: colors.surfaceDanger,
  },
  profileRowIconPartial: {
    backgroundColor: colors.surfaceWarning,
  },
  profileRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileRowLabel: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  profileRowValue: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  profileRowValueMuted: {
    color: colors.textMuted,
  },
  profileRowValueWarning: {
    color: colors.warning,
    fontWeight: '700',
  },
  profileIncompleteBadge: {
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 9,
  },
  profileIncompleteText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  personalizationCard: {
    marginBottom: 18,
    padding: 12,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  personalizationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 2,
    paddingBottom: 10,
  },
  personalizationIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  personalizationTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  personalizationSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  personalizationRows: {
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    borderRadius: 14,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  overviewLogoutButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderDanger,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    backgroundColor: colors.surface,
  },
  overviewLogoutText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  detailModalContainer: { flex: 1, backgroundColor: colors.neutralBackground },
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  detailModalBackBtn: { padding: 8 },
  detailModalTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  detailModalContent: { flex: 1 },
  detailModalContentContainer: { paddingHorizontal: 16, paddingBottom: 60 },
  detailTabScroll: {
    marginHorizontal: -16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailTabRow: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  detailTab: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  detailTabActive: {
    borderColor: colors.accentMint,
    backgroundColor: colors.accentMint,
  },
  detailTabText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  detailTabTextActive: {
    color: colors.textOnAccent,
  },
  profileDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
  },
  profileDetailsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileDetailsSave: {
    minHeight: 38,
    borderRadius: 11,
    paddingHorizontal: 13,
    backgroundColor: colors.accentMint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileDetailsSaveText: {
    color: colors.textOnAccent,
    fontSize: 12,
    fontWeight: '900',
  },
  profileDetailsSaveDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  profileDetailsSaveTextDisabled: {
    color: colors.textMuted,
  },
  formErrorSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surfaceDanger,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 2,
  },
  formErrorSummaryTitle: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '900',
  },
  formErrorSummaryText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  inlineFormError: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: -4,
    marginBottom: 10,
  },
  profileDetailsClose: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  profileDetailsCloseText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  profileShortcutRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  profileShortcut: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  profileShortcutText: { color: colors.textSoft, fontSize: 12, fontWeight: '800' },
  settingsCard: {
    marginBottom: 14,
    paddingVertical: 12,
    gap: 10,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  settingsLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 96,
  },
  settingsChips: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  settingsChip: {
    marginTop: 2,
    marginBottom: 0,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  setupActionRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSuccess,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  setupSaveButtonDesktop: {
    maxWidth: 220,
  },
  profileSaveButton: {
    flex: 1,
  },
  accountCard: {
    marginTop: 2,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.surfaceAlt,
  },
  accountCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  accountHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  profileLogoutButton: {
    minHeight: 40,
    minWidth: 128,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDanger,
    backgroundColor: colors.surfaceDanger,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  profileLogoutText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  setupCard: {
    marginBottom: 14,
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  setupEyebrow: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  setupTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  setupPercentPill: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupPercentText: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontWeight: '900',
  },
  setupProgressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.progressBg,
    marginBottom: 12,
  },
  setupProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accentMint,
  },
  setupStepGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  setupStep: {
    flex: 1,
    minWidth: 156,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setupStepDone: {
    borderColor: colors.accentMint,
    backgroundColor: colors.surfaceSuccess,
  },
  setupStepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceInfo,
    borderWidth: 1,
    borderColor: colors.borderInfo,
  },
  setupStepIconDone: {
    backgroundColor: colors.accentMint,
    borderColor: colors.accentMint,
  },
  setupStepCopy: {
    flex: 1,
    minWidth: 0,
  },
  setupStepLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  setupStepDetail: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  summaryRow: { gap: 12, marginBottom: 14 },
  summaryRowDesktop: { flexDirection: 'row' },
  summaryCard: { flex: 1, minHeight: 106, justifyContent: 'center' },
  summaryValue: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  summaryLabel: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  assessmentCard: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  assessmentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assessmentBmiLabel: { color: colors.info, fontSize: 12, fontWeight: '600' },
  assessmentBmiValue: { color: colors.text, fontSize: 28, fontWeight: '800' },
  assessmentMeta: { alignItems: 'flex-end' },
  assessmentMetaLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  assessmentMetaValue: { color: colors.textSoft, fontSize: 16, fontWeight: '700' },
  assessmentGuidesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  assessmentBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  assessmentBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  assessmentNote: { color: colors.textSoft, fontSize: 13, lineHeight: 19 },
  safetyNotice: { borderWidth: 1, borderColor: colors.borderWarning, backgroundColor: colors.surfaceWarning, borderRadius: 8, padding: 8, gap: 4 },
  safetyNoticeText: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  assessmentWeightPlan: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  assessmentActivityNote: { fontSize: 13, lineHeight: 19 },
  exerciseListWrap: { marginTop: 4, gap: 4 },
  exerciseListTitle: { fontSize: 13, fontWeight: '800' },
  exerciseListItem: { fontSize: 13, lineHeight: 18 },
  roadmapWrap: { marginTop: 10, gap: 8 },
  roadmapHeader: { gap: 4 },
  roadmapPanelTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  roadmapTitle: { color: colors.textSoft, fontSize: 13, fontWeight: '800' },
  roadmapSummary: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  roadmapAddBtn: {
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roadmapAddBtnText: { color: colors.textOnAccent, fontSize: 12, fontWeight: '800' },
  roadmapItem: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  roadmapItemCompleted: {
    borderColor: colors.accentMint,
    backgroundColor: colors.surfaceSuccess,
  },
  roadmapItemLeft: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  roadmapItemBody: { flex: 1, minWidth: 0 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxCompleted: {
    borderColor: colors.accentMint,
    backgroundColor: colors.accentMint,
  },
  checkboxTick: { color: colors.surface, fontSize: 12, fontWeight: '900' },
  roadmapItemTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  roadmapItemDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  roadmapItemMeta: { color: colors.accentMint, fontSize: 12, fontWeight: '700', marginTop: 4 },
  roadmapCta: { color: colors.success, fontSize: 11, fontWeight: '700' },
  roadmapActionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  roadmapActionBtn: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roadmapActionText: { color: colors.accentCyan, fontSize: 11, fontWeight: '800' },
  roadmapDeleteBtn: {
    borderColor: colors.borderDanger,
    backgroundColor: colors.surfaceDanger,
  },
  roadmapDeleteText: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  roadmapEmptyBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    marginTop: 8,
  },
  roadmapEmptyText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  assessmentHint: { color: colors.info, fontSize: 13, lineHeight: 19, marginTop: 10 },
  sectionCard: { marginBottom: 14 },
  highlightOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 12, backgroundColor: colors.surfaceWarning },
  pointerEventsNone: { pointerEvents: 'none' },
  sectionCardCompact: { paddingVertical: 8, paddingHorizontal: 12 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.textSoft, marginBottom: 6 },
  helperText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  label: { color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: 12, fontWeight: '500' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricsGridDesktop: { gap: 14 },
  fieldContainer: { width: '48%' },
  fieldContainerFull: { width: '100%' },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 14,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  activityChip: { marginBottom: 8 },
  derivedFieldCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: colors.surfaceSuccess,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    padding: 12,
    marginBottom: 8,
  },
  derivedFieldIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  derivedFieldValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  derivedFieldHint: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  healthChip: { marginBottom: 6 },
  clinicianOverrideCard: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
    padding: 12,
  },
  clinicianOverrideTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  waterMethodSummary: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  waterMethodToggle: { minHeight: 34, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2 },
  waterMethodToggleText: { color: colors.success, fontSize: 11, fontWeight: '800' },
  waterMethodDetail: { color: colors.textMuted, fontSize: 11, lineHeight: 17, padding: 10, borderRadius: 10, backgroundColor: colors.surface, marginBottom: 2 },
  climateSection: { marginTop: 10 },
  climateTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  climateHelper: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3, marginBottom: 10 },
  climateTwoRowGrid: { gap: 7 },
  climateButtonRow: { flexDirection: 'row', gap: 7 },
  climateGridButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  climateGridButtonSelected: { borderColor: colors.accentMint, backgroundColor: colors.surfaceSuccess },
  climateGridIcon: { width: 30, height: 30, borderRadius: 9, flexShrink: 0, backgroundColor: colors.surfaceSuccess, alignItems: 'center', justifyContent: 'center' },
  climateGridIconSelected: { backgroundColor: colors.accentMint },
  climateGridCopy: { flex: 1, minWidth: 0 },
  climateGridLabel: { color: colors.text, fontSize: 11, lineHeight: 14, fontWeight: '800' },
  climateLabelSelected: { color: colors.success },
  climateGridAdjustment: { color: colors.textMuted, fontSize: 8.5, lineHeight: 12, fontWeight: '800', marginTop: 2 },
  climateAdjustmentSelected: { color: colors.success },
  hydrationEditor: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.borderWarning },
  hydrationEditorHeader: { gap: 10, marginBottom: 10 },
  hydrationEditorCopy: { flex: 1 },
  scheduleModeRow: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 10, padding: 3, backgroundColor: colors.surfaceAlt },
  scheduleModeButton: { minHeight: 34, paddingHorizontal: 13, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  scheduleModeButtonActive: { backgroundColor: colors.accentMint },
  scheduleModeText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  scheduleModeTextActive: { color: colors.textOnAccent },
  systemScheduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  systemScheduleItem: {
    flexBasis: '23%',
    flexGrow: 1,
    minWidth: 72,
    minHeight: 54,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemScheduleTime: { color: colors.text, fontSize: 11, fontWeight: '900', marginTop: 2, fontVariant: ['tabular-nums'] },
  systemScheduleAmount: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  customScheduleList: { gap: 7 },
  scheduleEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 9,
  },
  scheduleIndex: { width: 25, height: 35, alignItems: 'center', justifyContent: 'center' },
  scheduleIndexText: { color: colors.textMuted, fontSize: 11, fontWeight: '900' },
  scheduleInputGroup: { flex: 1, minWidth: 75, gap: 3 },
  scheduleInputLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  scheduleInput: {
    height: 35,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceLifted,
    color: colors.text,
    paddingHorizontal: 9,
    fontSize: 12,
    fontWeight: '800',
  },
  amountInputWrap: { position: 'relative' },
  amountInput: { paddingRight: 28 },
  amountUnit: { position: 'absolute', right: 8, top: 10, color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  removeScheduleButton: { width: 35, height: 35, borderRadius: 8, backgroundColor: colors.surfaceDanger, alignItems: 'center', justifyContent: 'center' },
  removeScheduleButtonDisabled: { opacity: 0.35 },
  addScheduleButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderSuccess },
  addScheduleText: { color: colors.success, fontSize: 11, fontWeight: '800' },
  scheduleSummary: { marginTop: 10, borderRadius: 11, backgroundColor: colors.surfaceSuccess, borderWidth: 1, borderColor: colors.borderSuccess, padding: 11 },
  scheduleSummaryWarning: { backgroundColor: colors.surfaceWarning, borderColor: colors.borderWarning },
  scheduleSummaryLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  scheduleSummaryValue: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 1 },
  scheduleSummaryOk: { color: colors.success, fontSize: 10, fontWeight: '700', marginTop: 2 },
  scheduleSummaryWarningText: { color: colors.warning, fontSize: 10, fontWeight: '700', marginTop: 2 },
  clinicalConfirmRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 8,
  },
  clinicalConfirmText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  clinicalActiveRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  clinicalActiveText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '800',
  },
  clinicalSelfReportedRow: {
    borderRadius: 12,
    backgroundColor: colors.surfaceWarning,
    paddingHorizontal: 10,
  },
  clinicalSelfReportedText: {
    flex: 1,
    color: colors.warning,
    lineHeight: 17,
  },
  clinicalRevokeButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    marginTop: 4,
  },
  clinicalRevokeText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  goalPlanningGrid: { gap: 12, marginTop: 8 },
  goalPlanningGridDesktop: { flexDirection: 'row', alignItems: 'stretch' },
  goalPlanPanel: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: 12,
  },
  roadmapPanel: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    padding: 12,
  },
  goalPlanningPanelDesktop: {
    flex: 1,
    width: 'auto',
  },
  catalogOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  catalogSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  catalogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  catalogTitle: { color: colors.text, fontWeight: '800', fontSize: 18 },
  catalogHint: { color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 18 },
  catalogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catalogItemDisabled: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    opacity: 0.72,
  },
  catalogItemName: { color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  catalogItemKcal: { color: colors.accentMint, fontSize: 12, fontWeight: '700' },
  catalogItemNameDisabled: { color: colors.success },
  catalogItemKcalDisabled: { color: colors.textMuted },
  catalogBack: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  catalogBackText: { color: colors.accentMint, fontSize: 13, fontWeight: '700' },
  catalogSelectedLabel: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  durationRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  durationBtn: {
    flex: 1,
    minWidth: 70,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  durationBtnActive: { borderColor: colors.accentMint, backgroundColor: colors.surfaceSuccess },
  durationBtnMin: { color: colors.text, fontWeight: '700', fontSize: 14 },
  durationBtnKcal: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  durationBtnTextActive: { color: colors.accentMint },
  catalogConfirmBtn: { backgroundColor: colors.accentMint, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  catalogConfirmText: { color: colors.textOnAccent, fontWeight: '800', fontSize: 14 },
  mealTargetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  derivedTargetHero: {
    borderRadius: 16,
    backgroundColor: colors.surfaceSuccess,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    padding: 14,
    gap: 3,
    marginTop: 8,
  },
  derivedTargetLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  derivedTargetValue: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  derivedTargetHint: { color: colors.success, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  derivedTargetMeta: {
    color: colors.success,
    fontSize: 10,
    fontWeight: '800',
  },
  mealTargetReadOnlyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  mealTargetReadOnlyItem: {
    width: '48%',
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  mealTargetReadOnlyLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  mealTargetReadOnlyValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 3,
  },
  goalPlanRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
    alignItems: 'center',
  },
  goalPlanStatusBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    padding: 12,
    marginTop: 10,
    gap: 5,
  },
  goalPlanStatusTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  goalPlanStatusText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  goalPlanWarningText: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  clearGoalPlanButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 0,
  },
  mealTargetRowDesktop: {
    gap: 14,
  },
  actionRow: { gap: 10, marginTop: 4, marginBottom: 10 },
  actionRowDesktop: { flexDirection: 'row', alignItems: 'stretch' },
  saveButton: { flex: 1 },
  logoutBtn: { minWidth: 160 },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingVertical: 10 },
  switchLabel: { color: colors.textSoft, fontSize: 14, fontWeight: '600' },
  hydrationReminderRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.borderInfo, backgroundColor: colors.surfaceInfo, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 12 },
  hydrationReminderRowDisabled: { opacity: 0.5 },
  hydrationReminderIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  hydrationReminderCopy: { flex: 1, minWidth: 0 },
  hydrationReminderTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  hydrationReminderBody: { color: colors.textMuted, fontSize: 10.5, lineHeight: 15, marginTop: 2 },

  notificationSubContent: { marginTop: 4 },
  notificationSubContentDisabled: { opacity: 0.4 },

  reminderMealSection: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 12 },
  reminderRowCompact: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, backgroundColor: colors.surface },
  reminderMealLabelCompact: { flex: 1, color: colors.textSoft, fontSize: 14, fontWeight: '600' },
  reminderTimeInline: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  timeInputInline: { width: 36, textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.accentMint, backgroundColor: colors.surfaceLifted, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 2 },
  timeSepInline: { color: colors.textSoft, fontSize: 15, fontWeight: '700', marginHorizontal: 3 },

  reminderRow: { marginBottom: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  reminderLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reminderMealLabel: { color: colors.textSoft, fontSize: 14, fontWeight: '600' },
  reminderTimeInputs: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  reminderEffectivenessCard: { marginBottom: 14, borderColor: colors.borderInfo, backgroundColor: colors.surfaceInfo },
  reminderEffectivenessHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  reminderEffectivenessCopy: { flex: 1, minWidth: 0 },
  reminderEffectivenessBadge: {
    minWidth: 70,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surface,
    paddingHorizontal: 9,
    paddingVertical: 8,
    alignItems: 'center',
  },
  reminderEffectivenessScore: { color: colors.accentCyan, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  reminderEffectivenessUnit: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  reminderEffectivenessGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  reminderEffectivenessMetric: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 8,
  },
  reminderEffectivenessMetricValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  reminderEffectivenessMetricLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', marginTop: 2 },
  reminderEffectivenessPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  reminderEffectivenessPill: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: colors.borderInfo,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: colors.surface,
  },
  reminderEffectivenessPatterns: { gap: 4, marginTop: 10 },
  reminderEffectivenessPattern: { color: colors.textSoft, fontSize: 12, lineHeight: 17 },
  timeInputGroup: { flex: 1 },
  timeInputLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 4, fontWeight: '500' },
  timeInput: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.accentMint },
  timeSeparator: { color: colors.textSoft, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  previewSection: { marginTop: 12 },
  previewCard: { marginTop: 10, backgroundColor: colors.surface, borderColor: colors.border },
  previewTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  previewBody: { color: colors.textSoft, fontSize: 13, lineHeight: 20 },
  previewMeta: { color: colors.textMuted, fontSize: 12, marginTop: 10, fontWeight: '600' },
  subBody: { gap: 12, paddingTop: 4 },
  subHeroRow: { flexDirection: 'row', alignItems: 'center' },
  subTierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  subTierName: { fontSize: 15, fontWeight: '800' },
  subStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  subStatusPillActive: { backgroundColor: colors.surfaceSuccess },
  subStatusPillExpired: { backgroundColor: colors.surfaceDanger },
  subStatusText: { fontSize: 11, fontWeight: '700' },
  subStatusTextActive: { color: colors.success },
  subStatusTextExpired: { color: colors.danger },
  subRenewsText: { fontSize: 12, color: colors.textMuted, marginTop: -4 },
  subSection: { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg, padding: 12, gap: 10 },
  subSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subSectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textSoft, textTransform: 'uppercase', letterSpacing: 0.5 },
  subQuotaGrid: { flexDirection: 'row', gap: 8 },
  subQuotaBox: { flex: 1, alignItems: 'center', gap: 3, backgroundColor: colors.surface, borderRadius: radii.sm, paddingVertical: 10 },
  subQuotaNum: { fontSize: 18, fontWeight: '900' },
  subQuotaLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  subFeatureList: { gap: 8 },
  subFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  subFeatureText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  subFeatureTextLocked: { color: colors.textMuted },
  subProBadge: { backgroundColor: colors.warning + '25', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  subProBadgeText: { fontSize: 10, fontWeight: '800', color: colors.warning },
  subUpgradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accentMint, borderRadius: radii.lg, paddingVertical: 13, marginTop: 2 },
  subUpgradeBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  subManageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, marginTop: 2 },
  subManageBtnText: { fontSize: 14, fontWeight: '700', color: colors.accentMint },
}));


