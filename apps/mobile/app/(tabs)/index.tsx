import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ACTIVITY_MET,
  ActivityLog,
  ActivityPreference,
  BehaviorMemory,
  ActivityType,
  DailyRoadmapItem,
  DynamicIntervention,
  FoodLog,
  GoalPlan,
  MealType,
  ReminderEffectivenessSummary,
  SuccessForecast,
  User,
  UserGoal,
} from '@calorie-ai/types';
import { BodyText, Eyebrow, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { createThemedStyles, useAppTheme } from '../../components/theme';
import { useGamificationStore } from '../../store/gamification.store';
import { useLogStore } from '../../store/log.store';
import { useAuthStore } from '../../store/auth.store';
import { useCalorieTargetStore } from '../../store/calorie-target.store';
import { useInsightsStore } from '../../store/insights.store';
import { apiClient } from '../../services/api';
import { estimateExerciseCalories } from '../../services/exercise.service';
import { formatNumberVi, safeNumber, safePositiveNumber, toFiniteNumber } from '../../services/number-format';
import { RewardToast, RewardToastData } from '../../components/reward-toast';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';
import { Locale, tr, useI18n } from '../../components/i18n';
import { buildSuccessForecast } from '../../services/success-forecast.service';
import { buildDynamicIntervention } from '../../services/dynamic-intervention.service';
import { buildInterventionEvent, recordInterventionEvent } from '../../services/intervention-memory.service';
import { telemetryService } from '../../services/telemetry.service';
import { TodayHero } from '../../components/today/TodayHero';
import { getProteinTarget, useTodayHero } from '../../hooks/useTodayHero';
import { TodayCoachCard } from '../../components/today/TodayCoachCard';
import { TodayCoachSuggestion, useTodayCoach } from '../../hooks/useTodayCoach';
import { MealRecommendation } from '../../services/calorie-target.service';


const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_LABEL_KEYS: Record<MealType, Parameters<typeof tr>[0]> = {
  breakfast: 'screen.tabs.index.meal.breakfast',
  lunch: 'screen.tabs.index.meal.lunch',
  dinner: 'screen.tabs.index.meal.dinner',
  snack: 'screen.tabs.index.meal.snack',
};

const MEAL_HINT_KEYS: Record<MealType, Parameters<typeof tr>[0]> = {
  breakfast: 'screen.tabs.index.mealHint.breakfast',
  lunch: 'screen.tabs.index.mealHint.lunch',
  dinner: 'screen.tabs.index.mealHint.dinner',
  snack: 'screen.tabs.index.mealHint.snack',
};

type NudgeTone = 'good' | 'warn' | 'info';
type FocusTone = 'good' | 'warn' | 'info' | 'muted';

type DailyFocusItem = {
  key: string;
  label: string;
  value: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: FocusTone;
  progress: number;
};

function successForecastTone(forecast: SuccessForecast) {
  if (forecast.risk_level === 'high') return 'warn';
  if (forecast.risk_level === 'medium') return 'info';
  return 'good';
}

function successForecastActionLabel(action: SuccessForecast['recovery_plan']['primary_action'], locale: Locale) {
  if (action === 'adjust_reminders') return tr('screen.tabs.index.success.action.reminders', locale);
  if (action === 'move') return tr('screen.tabs.index.success.action.move', locale);
  if (action === 'complete_plan') return tr('screen.tabs.index.success.action.plan', locale);
  if (action === 'maintain') return tr('screen.tabs.index.success.action.maintain', locale);
  return tr('screen.tabs.index.success.action.log', locale);
}

function dynamicInterventionTone(intervention: DynamicIntervention) {
  if (intervention.priority === 'critical' || intervention.priority === 'high') return 'warn';
  if (intervention.priority === 'medium') return 'info';
  return 'good';
}

function formatNumber(value: unknown, fallback = '0') {
  return formatNumberVi(value, fallback);
}

function groupLogsByMeal(logs: FoodLog[]) {
  return logs.reduce<Record<MealType, FoodLog[]>>(
    (acc, log) => {
      acc[log.meal_type].push(log);
      return acc;
    },
    { breakfast: [], lunch: [], dinner: [], snack: [] },
  );
}

type MealTimelineEntry = {
  mealType: MealType;
  logs: FoodLog[];
  loggedAt: string;
  calories: number;
  imageUrl: string | undefined;
};

function buildMealTimeline(logs: FoodLog[]): MealTimelineEntry[] {
  const grouped = groupLogsByMeal(logs);

  return MEAL_ORDER
    .map((mealType) => {
      const mealLogs = [...grouped[mealType]].sort(
        (a, b) => Date.parse(a.logged_at) - Date.parse(b.logged_at),
      );
      if (mealLogs.length === 0) return null;

      return {
        mealType,
        logs: mealLogs,
        loggedAt: mealLogs[0].logged_at,
        calories: mealLogs.reduce((sum, log) => sum + safeNumber(log.calories), 0),
        imageUrl: mealLogs.find((log) => Boolean(log.image_url))?.image_url,
      };
    })
    .filter((entry): entry is MealTimelineEntry => entry !== null)
    .sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
}

function hasVeg(logs: FoodLog[]) {
  const vegWords = ['rau', 'salad', 'xa lach', 'dua leo', 'cai', 'canh', 'bong cai', 'gia'];
  return logs.some((log) => {
    const normalizedName = `${log.name_vi ?? ''} ${log.name}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return vegWords.some((word) => normalizedName.includes(word));
  });
}

function buildNutritionTargets(target: number) {
  const safeTarget = safePositiveNumber(target, 1800);
  return {
    fiber_g_min: Math.round((safeTarget / 1000) * 14),
    sodium_mg_max: 2300,
    sugar_g_max: Math.round((safeTarget * 0.1) / 4),
    saturated_fat_g_max: Math.round((safeTarget * 0.1) / 9),
  };
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function focusToneColor(tone: FocusTone, colors: Record<string, string>) {
  if (tone === 'good') return colors.accentMint;
  if (tone === 'warn') return colors.accentAmber;
  if (tone === 'muted') return colors.textMuted;
  return colors.accentCyan;
}

function buildDailyFocusItems(args: {
  consumedKcal: number;
  burnedKcal: number;
  targetKcal: number;
  proteinG: number;
  fiberG: number;
  sodiumMg: number;
  sugarG: number;
  activityMinutes: number;
  movementTargetMinutes: number;
  qualityCoverageItems: number;
  qualityTargets: ReturnType<typeof buildNutritionTargets>;
  goal?: UserGoal;
  goalDirection?: GoalPlan['direction'];
  weightKg?: number;
  locale: Locale;
}): DailyFocusItem[] {
  const consumedKcal = safeNumber(args.consumedKcal);
  const burnedKcal = safeNumber(args.burnedKcal);
  const targetKcal = safePositiveNumber(args.targetKcal, 1800);
  const proteinG = safeNumber(args.proteinG);
  const fiberG = safeNumber(args.fiberG);
  const sodiumMg = safeNumber(args.sodiumMg);
  const sugarG = safeNumber(args.sugarG);
  const activityMinutes = safeNumber(args.activityMinutes);
  const movementTargetMinutes = safePositiveNumber(args.movementTargetMinutes, 25);
  const qualityCoverageItems = safeNumber(args.qualityCoverageItems);
  const netKcal = Math.max(0, consumedKcal - burnedKcal);
  const remaining = targetKcal - netKcal;
  const calorieRatio = netKcal / Math.max(targetKcal, 1);
  const proteinTarget = getProteinTarget(args.goal, args.goalDirection, args.weightKg);
  const proteinGap = Math.max(0, proteinTarget - proteinG);
  const locale = args.locale;
  const items: DailyFocusItem[] = [
    {
      key: 'calories',
      label: 'Net kcal',
      value: remaining >= 0
        ? tr('screen.tabs.index.focus.calories.left', locale, { kcal: formatNumber(remaining) })
        : tr('screen.tabs.index.focus.calories.over', locale, { kcal: formatNumber(Math.abs(remaining)) }),
      hint: consumedKcal <= 0
        ? tr('screen.tabs.index.focus.calories.empty', locale)
        : remaining >= 0
          ? calorieRatio >= 0.75
            ? tr('screen.tabs.index.focus.calories.onPace', locale)
            : tr('screen.tabs.index.focus.calories.room', locale)
          : tr('screen.tabs.index.focus.calories.reduce', locale),
      icon: remaining >= 0 ? 'pulse-outline' : 'alert-circle-outline',
      tone: remaining < 0 ? 'warn' : calorieRatio >= 0.75 ? 'good' : 'info',
      progress: clampProgress(calorieRatio),
    },
    {
      key: 'protein',
      label: 'Protein',
      value: `${formatNumber(proteinG)}/${proteinTarget}g`,
      hint: proteinGap <= 0
        ? tr('screen.tabs.index.focus.protein.good', locale)
        : tr('screen.tabs.index.focus.protein.gap', locale, { grams: Math.round(proteinGap) }),
      icon: 'barbell-outline',
      tone: proteinGap <= 0 ? 'good' : 'info',
      progress: clampProgress(proteinG / Math.max(proteinTarget, 1)),
    },
  ];

  if (activityMinutes < movementTargetMinutes) {
    items.push({
      key: 'movement',
      label: tr('screen.tabs.index.focus.movement.label', locale),
      value: tr('screen.tabs.index.focus.movement.value', locale, {
        minutes: formatNumber(activityMinutes),
        target: formatNumber(movementTargetMinutes),
      }),
      hint: tr('screen.tabs.index.focus.movement.hint', locale),
      icon: 'walk-outline',
      tone: 'info',
      progress: clampProgress(activityMinutes / movementTargetMinutes),
    });
  } else if (qualityCoverageItems > 0 && sodiumMg > args.qualityTargets.sodium_mg_max) {
    items.push({
      key: 'sodium',
      label: tr('screen.tabs.index.focus.sodium.label', locale),
      value: `${formatNumber(sodiumMg)}mg`,
      hint: tr('screen.tabs.index.focus.sodium.hint', locale),
      icon: 'water-outline',
      tone: 'warn',
      progress: clampProgress(args.qualityTargets.sodium_mg_max / Math.max(sodiumMg, 1)),
    });
  } else if (qualityCoverageItems > 0 && sugarG > args.qualityTargets.sugar_g_max) {
    items.push({
      key: 'sugar',
      label: tr('screen.tabs.index.focus.sugar.label', locale),
      value: `${formatNumber(sugarG)}g`,
      hint: tr('screen.tabs.index.focus.sugar.hint', locale),
      icon: 'ice-cream-outline',
      tone: 'warn',
      progress: clampProgress(args.qualityTargets.sugar_g_max / Math.max(sugarG, 1)),
    });
  } else if (qualityCoverageItems > 0) {
    items.push({
      key: 'fiber',
      label: tr('screen.tabs.index.focus.fiber.label', locale),
      value: `${formatNumber(fiberG)}/${args.qualityTargets.fiber_g_min}g`,
      hint: fiberG >= args.qualityTargets.fiber_g_min
        ? tr('screen.tabs.index.focus.fiber.good', locale)
        : tr('screen.tabs.index.focus.fiber.add', locale),
      icon: 'leaf-outline',
      tone: fiberG >= args.qualityTargets.fiber_g_min ? 'good' : 'info',
      progress: clampProgress(fiberG / Math.max(args.qualityTargets.fiber_g_min, 1)),
    });
  } else {
    items.push({
      key: 'quality',
      label: tr('screen.tabs.index.focus.quality.label', locale),
      value: tr('screen.tabs.index.focus.quality.value', locale),
      hint: tr('screen.tabs.index.focus.quality.hint', locale),
      icon: 'scan-outline',
      tone: 'muted',
      progress: 0,
    });
  }

  return items;
}

function buildNutritionNudges(
  logs: FoodLog[],
  protein: number,
  fat: number,
  calories: number,
  target: number,
  quality: {
    fiber_g: number;
    sugar_g: number;
    sodium_mg: number;
    targets: ReturnType<typeof buildNutritionTargets>;
    coverage_items: number;
  },
  locale: Locale,
) {
  const safeProtein = safeNumber(protein);
  const safeFat = safeNumber(fat);
  const safeCalories = safeNumber(calories);
  const safeTarget = safePositiveNumber(target, 1800);
  const safeQuality = {
    fiber_g: safeNumber(quality.fiber_g),
    sugar_g: safeNumber(quality.sugar_g),
    sodium_mg: safeNumber(quality.sodium_mg),
    coverage_items: safeNumber(quality.coverage_items),
  };
  const fatCalories = safeFat * 9;
  const items: { title: string; body: string; tone: NudgeTone; icon: keyof typeof Ionicons.glyphMap }[] = [];

  if (safeProtein >= 75) {
    items.push({
      title: tr('screen.tabs.index.nudge.proteinGood.title', locale),
      body: tr('screen.tabs.index.nudge.proteinGood.body', locale),
      tone: 'good',
      icon: 'checkmark-circle',
    });
  } else {
    items.push({
      title: tr('screen.tabs.index.nudge.addProtein.title', locale),
      body: tr('screen.tabs.index.nudge.addProtein.body', locale),
      tone: 'info',
      icon: 'barbell',
    });
  }

  if (!hasVeg(logs)) {
    items.push({
      title: tr('screen.tabs.index.nudge.lowVeg.title', locale),
      body: tr('screen.tabs.index.nudge.lowVeg.body', locale),
      tone: 'warn',
      icon: 'leaf',
    });
  }

  if (safeCalories > 0 && fatCalories / Math.max(safeCalories, 1) > 0.38) {
    items.push({
      title: tr('screen.tabs.index.nudge.highFat.title', locale),
      body: tr('screen.tabs.index.nudge.highFat.body', locale),
      tone: 'warn',
      icon: 'flame',
    });
  }

  if (safeQuality.coverage_items > 0 && safeQuality.sodium_mg > quality.targets.sodium_mg_max) {
    items.push({
      title: tr('screen.tabs.index.nudge.highSodium.title', locale),
      body: tr('screen.tabs.index.nudge.highSodium.body', locale),
      tone: 'warn',
      icon: 'water',
    });
  }

  if (safeQuality.coverage_items > 0 && safeQuality.sugar_g > quality.targets.sugar_g_max) {
    items.push({
      title: tr('screen.tabs.index.nudge.highSugar.title', locale),
      body: tr('screen.tabs.index.nudge.highSugar.body', locale),
      tone: 'warn',
      icon: 'ice-cream',
    });
  }

  if (safeQuality.coverage_items > 0 && safeCalories > safeTarget * 0.45 && safeQuality.fiber_g < quality.targets.fiber_g_min * 0.45) {
    items.push({
      title: tr('screen.tabs.index.nudge.lowFiber.title', locale),
      body: tr('screen.tabs.index.nudge.lowFiber.body', locale),
      tone: 'info',
      icon: 'leaf',
    });
  }

  if (safeTarget - safeCalories > 350) {
    items.push({
      title: tr('screen.tabs.index.nudge.calorieRoom.title', locale),
      body: tr('screen.tabs.index.nudge.calorieRoom.body', locale),
      tone: 'good',
      icon: 'sparkles',
    });
  }

  return items.slice(0, 3);
}

function CaloriesRing({ consumed, burned, target, compact = false }: { consumed: number; burned: number; target: number; compact?: boolean }) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const size = compact ? 154 : 214;
  const stroke = compact ? 12 : 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeConsumed = safeNumber(consumed);
  const safeBurned = safeNumber(burned);
  const safeTarget = safePositiveNumber(target, 1800);
  const net = Math.max(0, safeConsumed - safeBurned);
  const progress = clampProgress(net / Math.max(safeTarget, 1));
  const remaining = safeTarget - net;

  return (
    <View style={[styles.ringWrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.progressBg} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={remaining >= 0 ? colors.accentMint : colors.accentCoral}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringValue, compact && styles.ringValueCompact]}>{formatNumber(net)}</Text>
        <Text style={[styles.ringLabel, compact && styles.ringLabelCompact]} i18nKey="screen.tabs.index.text.001" />
        <Text style={[styles.ringRemain, compact && styles.ringRemainCompact, remaining < 0 && styles.ringRemainOver]}>
          {remaining >= 0
            ? t('screen.tabs.index.ring.remaining', { kcal: formatNumber(remaining) })
            : t('screen.tabs.index.ring.over', { kcal: formatNumber(Math.abs(remaining)) })}
        </Text>
      </View>
    </View>
  );
}

function computeDailyDelta(kgPerWeek: number) {
  const KCAL_PER_KG = 7700; // approximate kcal per 1 kg of fat
  return Math.round((kgPerWeek * KCAL_PER_KG) / 7);
}

type QuickGoalOption = {
  key: string;
  labelKey: Parameters<typeof tr>[0];
  type: 'loss' | 'maintain' | 'gain';
  kgPerWeek: number;
};

const QUICK_GOAL_OPTIONS: QuickGoalOption[] = [
  { key: 'loss_0.25', labelKey: 'screen.tabs.index.quickGoal.loss025', type: 'loss', kgPerWeek: 0.25 },
  { key: 'loss_0.5', labelKey: 'screen.tabs.index.quickGoal.loss05', type: 'loss', kgPerWeek: 0.5 },
  { key: 'loss_1', labelKey: 'screen.tabs.index.quickGoal.loss1', type: 'loss', kgPerWeek: 1 },
  { key: 'maintain', labelKey: 'screen.tabs.index.quickGoal.maintain', type: 'maintain', kgPerWeek: 0 },
  { key: 'gain_0.25', labelKey: 'screen.tabs.index.quickGoal.gain025', type: 'gain', kgPerWeek: 0.25 },
];

function formatQuickGoalLabel(option: QuickGoalOption, locale: Locale) {
  return tr(option.labelKey, locale);
}

type DashboardProfileMeta = Pick<User, 'age' | 'gender' | 'height_cm' | 'weight_kg' | 'health_flags' | 'activity_level' | 'goal_plan' | 'daily_calorie_target' | 'goal' | 'full_name'>;

function goalFromQuickOption(type: QuickGoalOption['type']): UserGoal {
  if (type === 'loss') return 'lose_weight';
  if (type === 'gain') return 'gain_muscle';
  return 'maintain';
}

function buildQuickGoalPlan(option: QuickGoalOption): GoalPlan {
  const durationWeeks = 4;
  return {
    direction: option.type,
    target_kg: Number((option.kgPerWeek * durationWeeks).toFixed(1)),
    duration_weeks: durationWeeks,
    start_date: new Date().toISOString().split('T')[0],
  };
}

function describeGoalPlan(plan: GoalPlan, locale: Locale) {
  if (plan.direction === 'maintain') {
    return tr('screen.tabs.index.goal.maintain', locale);
  }

  const verb = plan.direction === 'gain'
    ? tr('screen.tabs.index.goal.gain', locale)
    : tr('screen.tabs.index.goal.lose', locale);
  const targetKg = safeNumber(plan.target_kg);
  const durationWeeks = safeNumber(plan.duration_weeks);
  const duration = durationWeeks ? tr('screen.tabs.index.goal.durationWeeks', locale, { weeks: durationWeeks }) : '';
  return `${verb} ${targetKg} kg${duration}`;
}

function statusLabel(status: GoalPlan['safety_status'] | undefined, locale: Locale) {
  if (status === 'adjusted') return tr('screen.tabs.index.goal.status.adjusted', locale);
  if (status === 'maintenance_only') return tr('screen.tabs.index.goal.status.maintenance', locale);
  if (status === 'incomplete') return tr('screen.tabs.index.goal.status.incomplete', locale);
  return tr('screen.tabs.index.goal.status.active', locale);
}

function getMissingProfileFields(profile: DashboardProfileMeta, locale: Locale): string[] {
  const missing: string[] = [];
  if (!safePositiveNumber(profile.age, 0)) missing.push(tr('screen.tabs.index.profileMissing.age', locale));
  if (!profile.gender) missing.push(tr('screen.tabs.index.profileMissing.sex', locale));
  if (!safePositiveNumber(profile.height_cm, 0)) missing.push(tr('screen.tabs.index.profileMissing.height', locale));
  if (!safePositiveNumber(profile.weight_kg, 0)) missing.push(tr('screen.tabs.index.profileMissing.weight', locale));
  if (!profile.goal) missing.push(tr('screen.tabs.index.profileMissing.goal', locale));
  if (!profile.activity_level) missing.push(tr('screen.tabs.index.profileMissing.activity', locale));
  if (!safePositiveNumber(profile.daily_calorie_target, 0) && !safePositiveNumber(profile.goal_plan?.computed_daily_calorie_target, 0)) {
    missing.push(tr('screen.tabs.index.profileMissing.calorieTarget', locale));
  }
  return missing;
}

function getDisplayStreak(summary: { current_streak?: unknown } | null | undefined, logs: FoodLog[], activityLogs: ActivityLog[]) {
  const currentStreak = safeNumber(summary?.current_streak);
  const hasFoodLogToday = logs.some((log) => !log.deleted_at && !!log.logged_at);
  const hasActivityLogToday = activityLogs.some((log) => !!log.logged_at);
  return Math.max(currentStreak, hasFoodLogToday || hasActivityLogToday ? 1 : 0);
}

type MovementPlan = {
  preference_id?: string;
  title: string;
  detail: string;
  calorie_status: string;
  activity_type: ActivityType;
  duration_min: number;
  estimated_kcal: number;
  daily_minutes_target: number;
  target_guidance: string;
  tone: 'normal' | 'caution' | 'surplus' | 'fuel';
};

type PreferredActivity = Pick<ActivityPreference, 'id' | 'title' | 'activity_type' | 'duration_min'>;

function estimateDurationForBurn(activityType: ActivityType, targetKcal: number, weightKg: number) {
  const met = ACTIVITY_MET[activityType] ?? 5;
  const safeTargetKcal = Math.max(0, safeNumber(targetKcal));
  const safeWeightKg = safePositiveNumber(weightKg, 65);
  const kcalPerMinute = Math.max(1, (met * safeWeightKg) / 60);
  const rawMinutes = safeTargetKcal / kcalPerMinute;
  const roundedToFive = Math.round(rawMinutes / 5) * 5;
  return Math.max(10, Math.min(60, roundedToFive));
}

function buildDailyMovementRecommendation(
  activityLevel: User['activity_level'],
  effectiveGoal: UserGoal,
  caution: boolean,
  locale: Locale,
) {
  if (caution) {
    return {
      minutes: 15,
      guidance: tr('screen.tabs.index.movement.guidance.caution', locale, { minutes: 15 }),
    };
  }

  const baseMinutesByLevel: Record<NonNullable<User['activity_level']>, number> = {
    sedentary: 20,
    light: 25,
    moderate: 30,
    active: 35,
    very_active: 40,
  };
  const baseMinutes = baseMinutesByLevel[activityLevel ?? 'light'];

  if (effectiveGoal === 'lose_weight') {
    const minutes = Math.min(45, baseMinutes + 5);
    return {
      minutes,
      guidance: tr('screen.tabs.index.movement.guidance.loss', locale, { minutes }),
    };
  }

  if (effectiveGoal === 'gain_muscle') {
    const minutes = Math.max(30, baseMinutes);
    return {
      minutes,
      guidance: tr('screen.tabs.index.movement.guidance.gain', locale, { minutes }),
    };
  }

  return {
    minutes: baseMinutes,
    guidance: tr('screen.tabs.index.movement.guidance.maintain', locale, { minutes: baseMinutes }),
  };
}

function pickPreferredActivity(preferences: PreferredActivity[]): PreferredActivity | null {
  if (preferences.length === 0) return null;
  return preferences[0];
}

function buildMovementPlan(
  profile: DashboardProfileMeta | null,
  preferences: PreferredActivity[],
  completedMin: number,
  consumedKcal: number,
  burnedKcal: number,
  targetKcal: number,
  locale: Locale,
): MovementPlan | null {
  if (!profile) return null;
  const weightKg = toFiniteNumber(profile?.weight_kg);
  if (weightKg === null || weightKg <= 0) return null;

  const flags = Array.isArray(profile.health_flags) ? profile.health_flags : [];
  const caution = (!!profile.age && profile.age < 18) || flags.length > 0;
  const activityLevel = profile.activity_level ?? 'light';
  const goal = profile.goal ?? 'maintain';
  const planDirection = profile.goal_plan?.direction;
  const effectiveGoal = planDirection === 'loss'
    ? 'lose_weight'
    : planDirection === 'gain'
      ? 'gain_muscle'
      : goal;
  const dailyRecommendation = buildDailyMovementRecommendation(activityLevel, effectiveGoal, caution, locale);
  const safeCompletedMin = safeNumber(completedMin);
  const safeConsumedKcal = safeNumber(consumedKcal);
  const safeBurnedKcal = safeNumber(burnedKcal);
  const safeTargetKcal = safePositiveNumber(targetKcal, 1800);
  const remainingToBase = Math.max(0, dailyRecommendation.minutes - safeCompletedMin);
  const netKcal = safeConsumedKcal - safeBurnedKcal;
  const gapToTarget = safeTargetKcal - netKcal;
  const overTarget = Math.max(0, -gapToTarget);
  const surplusBurnTarget = overTarget > 75
    ? Math.min(overTarget, effectiveGoal === 'lose_weight' ? 320 : 220)
    : 0;
  const preferredActivity = pickPreferredActivity(preferences);

  let activityType: ActivityType = 'walking';
  let durationMin = remainingToBase > 0 ? Math.max(15, Math.min(30, remainingToBase)) : 15;
  let title = tr('screen.tabs.index.movement.maintenanceWalk.title', locale);
  let detail = tr('screen.tabs.index.movement.maintenanceWalk.detail', locale);
  let calorieStatus = gapToTarget >= 0
    ? tr('screen.tabs.index.movement.status.left', locale, { kcal: formatNumber(gapToTarget) })
    : tr('screen.tabs.index.movement.status.over', locale, { kcal: formatNumber(overTarget) });
  let tone: MovementPlan['tone'] = 'normal';

  if (preferredActivity) {
    activityType = preferredActivity.activity_type as ActivityType;
    const healthMinutes = remainingToBase > 0
      ? Math.max(preferredActivity.duration_min, Math.min(30, remainingToBase))
      : preferredActivity.duration_min;
    durationMin = surplusBurnTarget > 0
      ? estimateDurationForBurn(activityType, surplusBurnTarget, weightKg)
      : healthMinutes;
    title = preferredActivity.title;
    detail = overTarget > 75
      ? tr('screen.tabs.index.movement.profileOver.detail', locale, { kcal: formatNumber(surplusBurnTarget) })
      : tr('screen.tabs.index.movement.profile.detail', locale);
  }

  if (caution) {
    durationMin = preferredActivity ? Math.min(preferredActivity.duration_min, 20) : 12;
    title = preferredActivity?.title ?? tr('screen.tabs.index.movement.safe.title', locale);
    detail = tr('screen.tabs.index.movement.safe.detail', locale);
    calorieStatus = `${calorieStatus} ${tr('screen.tabs.index.movement.safe.statusSuffix', locale)}`;
    tone = 'caution';
  } else if (overTarget > 75) {
    const targetBurn = surplusBurnTarget;
    if (!preferredActivity) {
      activityType = effectiveGoal === 'gain_muscle'
        ? 'walking'
        : activityLevel === 'active' || activityLevel === 'very_active'
          ? 'running'
          : 'walking';
      durationMin = estimateDurationForBurn(activityType, targetBurn, weightKg);
      title = activityType === 'running'
        ? tr('screen.tabs.index.movement.moderateCardio.title', locale)
        : tr('screen.tabs.index.movement.briskWalk.title', locale);
    }
    detail = overTarget > targetBurn + 80
      ? tr('screen.tabs.index.movement.over.detailLarge', locale, { kcal: formatNumber(targetBurn) })
      : preferredActivity
        ? tr('screen.tabs.index.movement.over.detailProfile', locale)
        : tr('screen.tabs.index.movement.over.detailGeneric', locale);
    tone = 'surplus';
  } else if (effectiveGoal === 'gain_muscle' && !preferredActivity) {
    activityType = 'gym';
    durationMin = activityLevel === 'sedentary' ? 20 : 30;
    title = tr('screen.tabs.index.movement.strength.title', locale);
    detail = gapToTarget > 250
      ? tr('screen.tabs.index.movement.strength.detailFuel', locale)
      : tr('screen.tabs.index.movement.strength.detail', locale);
    tone = gapToTarget > 250 ? 'fuel' : 'normal';
  } else if (effectiveGoal === 'lose_weight' && !preferredActivity) {
    activityType = activityLevel === 'active' || activityLevel === 'very_active' ? 'running' : 'walking';
    durationMin = gapToTarget > 300 ? 20 : activityType === 'running' ? 25 : 30;
    title = gapToTarget > 300
      ? tr('screen.tabs.index.movement.deficit.title', locale)
      : activityType === 'running'
        ? tr('screen.tabs.index.movement.cardioZone2.title', locale)
        : tr('screen.tabs.index.movement.briskWalk.title', locale);
    detail = gapToTarget > 300
      ? tr('screen.tabs.index.movement.deficit.detail', locale)
      : tr('screen.tabs.index.movement.lightBurn.detail', locale);
  } else if (activityLevel === 'sedentary' && !preferredActivity) {
    durationMin = 20;
    title = tr('screen.tabs.index.movement.sedentary.title', locale);
    detail = tr('screen.tabs.index.movement.sedentary.detail', locale);
  } else if (gapToTarget > 300 && !preferredActivity) {
    title = tr('screen.tabs.index.movement.baseline.title', locale);
    detail = tr('screen.tabs.index.movement.baseline.detail', locale);
    tone = 'fuel';
  }

  return {
    preference_id: preferredActivity?.id,
    title,
    detail,
    calorie_status: calorieStatus,
    activity_type: activityType,
    duration_min: durationMin,
    estimated_kcal: estimateExerciseCalories(activityType, durationMin, weightKg),
    daily_minutes_target: dailyRecommendation.minutes,
    target_guidance: dailyRecommendation.guidance,
    tone,
  };
}

export default function DashboardScreen() {
  const { colors } = useAppTheme();
  const shownInterventionKeysRef = useRef<Set<string>>(new Set());
  const forecastSnapshotKeysRef = useRef<Set<string>>(new Set());
  const { locale, t } = useI18n();
  const { width } = useWindowDimensions();
  const isCompact = width < 480;
  const {
    dailyLog,
    activityLogs,
    dailyRoadmap,
    activityPreferences,
    todaySummary,
    fetchTodaySummary,
    fetchDailyLog,
    fetchActivityLogs,
    addActivity,
    updateRoadmapItem,
  } = useLogStore();
  const { summary, fetchSummary } = useGamificationStore();
  const { token, isLoading: authLoading } = useAuthStore();
  const { recommendations, fetchRecommendations } = useCalorieTargetStore();
  const { fetchWeeklyInsights } = useInsightsStore();
  const [profileMeta, setProfileMeta] = useState<DashboardProfileMeta | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string>(QUICK_GOAL_OPTIONS[1].key);
  const [isLoggingMovement, setIsLoggingMovement] = useState(false);
  const [updatingRoadmapId, setUpdatingRoadmapId] = useState<string | null>(null);
  const [reward, setReward] = useState<RewardToastData | null>(null);
  const [reminderEffectiveness, setReminderEffectiveness] = useState<ReminderEffectivenessSummary | null>(null);
  const [behaviorMemory, setBehaviorMemory] = useState<BehaviorMemory | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const fetchProfileMeta = useCallback(async () => {
    const res = await apiClient.get<User>('/user/profile');
    setProfileMeta({
      age: res.data.age,
      gender: res.data.gender,
      height_cm: res.data.height_cm,
      weight_kg: res.data.weight_kg,
      health_flags: res.data.health_flags,
      activity_level: res.data.activity_level,
      goal_plan: res.data.goal_plan,
      daily_calorie_target: res.data.daily_calorie_target,
      goal: res.data.goal,
      full_name: res.data.full_name,
    });
  }, []);

  const fetchReminderEffectiveness = useCallback(async () => {
    const res = await apiClient.get<ReminderEffectivenessSummary>('/reminders/effectiveness?days=30');
    setReminderEffectiveness(res.data);
  }, []);

  const fetchBehaviorMemory = useCallback(async () => {
    const res = await apiClient.get<BehaviorMemory>('/coaching/behavior-memory');
    setBehaviorMemory(res.data);
  }, []);

  const refreshDashboardData = useCallback(() => {
    if (authLoading || !token) return;
    fetchTodaySummary().catch(() => {});
    fetchSummary().catch(() => {});
    fetchProfileMeta().catch(() => {});
    fetchActivityLogs().catch(() => {});
    fetchReminderEffectiveness().catch(() => setReminderEffectiveness(null));
    fetchBehaviorMemory().catch(() => setBehaviorMemory(null));
    fetchRecommendations().catch(() => {});
  }, [authLoading, fetchActivityLogs, fetchBehaviorMemory, fetchProfileMeta, fetchRecommendations, fetchReminderEffectiveness, fetchSummary, fetchTodaySummary, token]);

  useEffect(() => {
    if (todaySummary?.profile) {
      setProfileMeta({
        age: todaySummary.profile.age,
        gender: todaySummary.profile.gender,
        height_cm: todaySummary.profile.height_cm,
        weight_kg: todaySummary.profile.weight_kg,
        health_flags: todaySummary.profile.health_flags,
        activity_level: todaySummary.profile.activity_level,
        goal_plan: todaySummary.profile.goal_plan,
        daily_calorie_target: todaySummary.profile.daily_calorie_target,
        goal: todaySummary.profile.goal,
        full_name: (todaySummary.profile as any).full_name,
      });
    }
  }, [todaySummary?.profile]);

  useFocusEffect(
    useCallback(() => {
      refreshDashboardData();
    }, [refreshDashboardData]),
  );

  const logs = dailyLog?.logs ?? [];
  const logsByMeal = useMemo(() => groupLogsByMeal(logs), [logs]);
  const mealTimeline = useMemo(() => buildMealTimeline(logs), [logs]);
  const suggestedMeal = useMemo(() => {
    if (logs.length > 0 || !recommendations?.meals?.length) return null;
    const hour = new Date().getHours();
    const mealType: MealType = hour < 10 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 20 ? 'dinner' : 'snack';
    const meal = recommendations.meals.find((item) => item.meal_type === mealType);
    const food = meal?.suggested_foods?.[0];
    return meal && food ? { meal, food } : null;
  }, [logs.length, recommendations]);
  const displayStreak = getDisplayStreak(summary, logs, activityLogs);
  const consumed = safeNumber(dailyLog?.total_calories);
  const burned = activityLogs.reduce((sum, item) => sum + safeNumber(item.calories_burned), 0);
  const activityMinutes = activityLogs.reduce((sum, item) => sum + safeNumber(item.duration_min), 0);
  const target = safePositiveNumber(dailyLog?.target_calories, 1800);
  const completedActivityPreferenceIds = useMemo(() => {
    const ids = new Set<string>();
    activityLogs.forEach((log) => {
      const match = (log.notes ?? '').match(/^ROADMAP_TASK:([^|]+)\|/);
      if (match?.[1]) ids.add(match[1]);
    });
    return ids;
  }, [activityLogs]);
  const movementPreferences = useMemo(() => {
    const activePreferences = activityPreferences
      .filter((item) => item.is_active !== false)
      .sort((a, b) => a.sort_order - b.sort_order);
    const pendingPreferences = activePreferences.filter((item) => !completedActivityPreferenceIds.has(item.id));
    return pendingPreferences.length > 0 ? pendingPreferences : activePreferences;
  }, [activityPreferences, completedActivityPreferenceIds]);
  const movementPlan = useMemo(
    () => buildMovementPlan(profileMeta, movementPreferences, activityMinutes, consumed, burned, target, locale),
    [activityMinutes, burned, consumed, locale, movementPreferences, profileMeta, target],
  );
  const movementPlanCompleted = useMemo(() => {
    if (!movementPlan) return false;
    const linkedPrefix = movementPlan.preference_id ? `ROADMAP_TASK:${movementPlan.preference_id}|` : `MOVEMENT_PLAN:${movementPlan.title}`;
    return activityLogs.some((log) => (log.notes ?? '').startsWith(linkedPrefix));
  }, [activityLogs, movementPlan]);
  const protein = safeNumber(dailyLog?.total_protein_g);
  const carbs = safeNumber(dailyLog?.total_carbs_g);
  const fat = safeNumber(dailyLog?.total_fat_g);
  const fiber = safeNumber(dailyLog?.total_fiber_g);
  const sugar = safeNumber(dailyLog?.total_sugar_g);
  const sodium = safeNumber(dailyLog?.total_sodium_mg);
  const saturatedFat = safeNumber(dailyLog?.total_saturated_fat_g);
  const qualityTargets = useMemo(() => buildNutritionTargets(target), [target]);
  const qualityCoverageItems = dailyLog?.nutrition_quality_coverage
    ? Math.max(
        safeNumber(dailyLog.nutrition_quality_coverage.fiber_items),
        safeNumber(dailyLog.nutrition_quality_coverage.sugar_items),
        safeNumber(dailyLog.nutrition_quality_coverage.sodium_items),
        safeNumber(dailyLog.nutrition_quality_coverage.saturated_fat_items),
      )
    : 0;
  const dailyFocusItems = useMemo(() => buildDailyFocusItems({
    consumedKcal: consumed,
    burnedKcal: burned,
    targetKcal: target,
    proteinG: protein,
    fiberG: fiber,
    sodiumMg: sodium,
    sugarG: sugar,
    activityMinutes,
    movementTargetMinutes: movementPlan?.daily_minutes_target ?? 25,
    qualityCoverageItems,
    qualityTargets,
    goal: profileMeta?.goal,
    goalDirection: profileMeta?.goal_plan?.direction,
    weightKg: profileMeta?.weight_kg,
    locale,
  }), [
    activityMinutes,
    burned,
    consumed,
    fiber,
    locale,
    movementPlan?.daily_minutes_target,
    profileMeta?.goal,
    profileMeta?.goal_plan?.direction,
    profileMeta?.weight_kg,
    protein,
    qualityCoverageItems,
    qualityTargets,
    sodium,
    sugar,
    target,
  ]);
  const nudges = useMemo(() => buildNutritionNudges(
    logs,
    protein,
    fat,
    consumed,
    target,
    {
      fiber_g: fiber,
      sugar_g: sugar,
      sodium_mg: sodium,
      targets: qualityTargets,
      coverage_items: qualityCoverageItems,
    },
    locale,
  ), [consumed, fat, fiber, locale, logs, protein, qualityCoverageItems, qualityTargets, sodium, sugar, target]);
  const latestMeals = logs.slice(0, 4);
  const safetyCard = useMemo(() => {
    if (!profileMeta) return null;

    const flagsKnown = Array.isArray(profileMeta.health_flags);
    const flags = flagsKnown ? profileMeta.health_flags ?? [] : [];
    const missingFields = getMissingProfileFields(profileMeta, locale);

    if (missingFields.length > 0) {
      return {
        tone: 'setup' as const,
        icon: 'shield-checkmark' as const,
        title: tr('screen.tabs.index.safety.missing.title', locale),
        body: tr('screen.tabs.index.safety.missing.body', locale, { fields: missingFields.join(', ') }),
        action: tr('screen.tabs.index.safety.missing.action', locale),
      };
    }

    if (!flagsKnown) {
      return {
        tone: 'setup' as const,
        icon: 'shield-checkmark' as const,
        title: tr('screen.tabs.index.safety.confirm.title', locale),
        body: tr('screen.tabs.index.safety.confirm.body', locale),
        action: tr('screen.tabs.index.safety.confirm.action', locale),
      };
    }

    if ((profileMeta.age ?? 99) < 18 || flags.length > 0) {
      return {
        tone: 'review' as const,
        icon: 'medical' as const,
        title: tr('screen.tabs.index.safety.review.title', locale),
        body: tr('screen.tabs.index.safety.review.body', locale),
        action: tr('screen.tabs.index.safety.review.action', locale),
      };
    }

    return null;
  }, [locale, profileMeta]);

  const selectedGoalOption = QUICK_GOAL_OPTIONS.find((goal) => goal.key === selectedGoal) ?? QUICK_GOAL_OPTIONS[1];
  const selectedGoalPlan = buildQuickGoalPlan(selectedGoalOption);
  const selectedDailyDelta = computeDailyDelta(selectedGoalOption.kgPerWeek);
  const activeGoalPlan = profileMeta?.goal_plan ?? null;
  const netCalories = Math.max(0, consumed - burned);
  const planRemaining = target - netCalories;
  const todaySummaryHasPartialError = todaySummary
    ? Object.values(todaySummary.status).some((value) => value === 'error')
    : false;
  const planGoalDescription = activeGoalPlan ? describeGoalPlan(activeGoalPlan, locale) : describeGoalPlan(selectedGoalPlan, locale);
  const activeRoadmapItems = useMemo(
    () => dailyRoadmap.filter((item: DailyRoadmapItem) => !item.is_removed),
    [dailyRoadmap],
  );
  const remainingRoadmapItems = activeRoadmapItems.filter((item: DailyRoadmapItem) => !item.is_completed);
  const plannedRoadmapKcal = activeRoadmapItems.reduce((sum, item) => sum + safeNumber(item.estimated_kcal), 0);
  const visibleRoadmapItems = remainingRoadmapItems.length > 0 ? remainingRoadmapItems.slice(0, 2) : activeRoadmapItems.slice(0, 2);
  const hasRoadmapPlan = activeRoadmapItems.length > 0;
  const todayPlanBody = hasRoadmapPlan
    ? t('screen.tabs.index.plan.roadmapBody', {
        remaining: remainingRoadmapItems.length,
        total: activeRoadmapItems.length,
        kcal: formatNumber(plannedRoadmapKcal),
      })
    : t('screen.tabs.index.plan.body', {
        remaining: formatNumber(planRemaining),
        meals: logs.length,
        activity: formatNumber(activityMinutes),
      });
  const todayPlanMetricValue = hasRoadmapPlan ? remainingRoadmapItems.length : Math.abs(planRemaining);
  const todayPlanMetricLabel = hasRoadmapPlan
    ? t('screen.tabs.index.plan.metricTasks')
    : planRemaining >= 0
      ? t('screen.tabs.index.plan.metricLeft')
      : t('screen.tabs.index.plan.metricOver');
  const healthScore = todaySummary?.health_score;
  const waterIntakeL = Math.max(0, safeNumber(
    todaySummary?.waterIntake ?? todaySummary?.water_intake_l,
  ));
  const waterGoalL = safePositiveNumber(
    todaySummary?.waterGoal ?? todaySummary?.water_goal_l,
    2.5,
  );
  const healthTrendDelta = healthScore?.trend.delta_vs_7d ?? null;
  const healthTrendTone = healthScore?.trend.direction === 'up'
    ? 'good'
    : healthScore?.trend.direction === 'down'
      ? 'warn'
      : 'neutral';
  const healthTrendText = healthScore && healthScore.trend.average_7d !== null && healthTrendDelta !== null
    ? t('screen.tabs.index.health.trend', {
        average: formatNumber(healthScore.trend.average_7d),
        delta: `${healthTrendDelta >= 0 ? '+' : ''}${formatNumber(healthTrendDelta)}`,
      })
    : t('screen.tabs.index.health.trend.empty');
  const healthAdherenceText = healthScore
    ? t('screen.tabs.index.health.adherence', {
        score: formatNumber(healthScore.weekly_adherence.overall),
        weakest: t(`screen.tabs.index.health.weakest.${healthScore.weekly_adherence.weakest_area}` as any),
      })
    : '';
  const healthScoreBreakdown = healthScore
    ? [
        { key: 'nutrition', label: t('screen.tabs.index.health.nutrition'), value: healthScore.nutrition },
        { key: 'activity', label: t('screen.tabs.index.health.activity'), value: healthScore.activity },
        { key: 'consistency', label: t('screen.tabs.index.health.consistency'), value: healthScore.consistency },
        { key: 'recovery', label: t('screen.tabs.index.health.recovery'), value: healthScore.recovery },
        { key: 'weekly', label: t('screen.tabs.index.health.weekly'), value: healthScore.weekly_adherence.overall },
      ]
    : [];
  const successForecast = useMemo(() => buildSuccessForecast({
    healthScore,
    reminderEffectiveness,
    locale,
  }), [healthScore, locale, reminderEffectiveness]);

  useEffect(() => {
    if (!successForecast || !healthScore || !todaySummary?.date) return;
    const key = `${todaySummary.date}:today:${successForecast.score}:${successForecast.risk_level}`;
    if (forecastSnapshotKeysRef.current.has(key)) return;
    forecastSnapshotKeysRef.current.add(key);

    void telemetryService.emitForecastSnapshot({
      local_date: todaySummary.date,
      source: 'today',
      forecast_score: successForecast.score,
      forecast_label: successForecast.label,
      risk_level: successForecast.risk_level,
      confidence: successForecast.confidence,
      health_score_overall: healthScore.overall,
      adherence_score: healthScore.weekly_adherence.overall,
      weakest_area: healthScore.weekly_adherence.weakest_area,
      forecast: successForecast as unknown as Record<string, unknown>,
      health_score: healthScore as unknown as Record<string, unknown>,
    });
  }, [healthScore, successForecast, todaySummary?.date]);

  const successForecastToneValue = successForecast ? successForecastTone(successForecast) : 'info';
  const dynamicIntervention = useMemo(() => buildDynamicIntervention({
    successForecast,
    behaviorMemory,
    locale,
  }), [behaviorMemory, locale, successForecast]);
  const dynamicInterventionToneValue = dynamicIntervention ? dynamicInterventionTone(dynamicIntervention) : 'info';

  useEffect(() => {
    if (!dynamicIntervention?.should_surface) return;
    const key = `${dynamicIntervention.generated_at}:${dynamicIntervention.intervention_type}:${dynamicIntervention.mode}`;
    if (shownInterventionKeysRef.current.has(key)) return;
    shownInterventionKeysRef.current.add(key);

    void recordInterventionEvent({
      ...buildInterventionEvent(dynamicIntervention, 'shown', 'today'),
      forecast_score: successForecast?.score,
    });
  }, [dynamicIntervention, successForecast?.score]);

  async function toggleRoadmapItem(item: DailyRoadmapItem) {
    setUpdatingRoadmapId(item.id);
    try {
      await updateRoadmapItem(item.id, { is_completed: !item.is_completed });
    } finally {
      setUpdatingRoadmapId(null);
    }
  }

  async function logMovementPlan() {
    if (!movementPlan || movementPlanCompleted || isLoggingMovement) return;

    setIsLoggingMovement(true);
    try {
      await addActivity({
        activity_type: movementPlan.activity_type,
        duration_min: movementPlan.duration_min,
        calories_burned: movementPlan.estimated_kcal,
        notes: movementPlan.preference_id
          ? `ROADMAP_TASK:${movementPlan.preference_id}|${movementPlan.title}`
          : `MOVEMENT_PLAN:${movementPlan.title}`,
      });
      await Promise.all([
        fetchActivityLogs().catch(() => {}),
        fetchSummary().catch(() => {}),
      ]);
      setReward({
        title: 'screen.tabs.index.reward.movementTitle',
        body: t('screen.tabs.index.reward.movementBody', { title: movementPlan.title, calories: formatNumber(movementPlan.estimated_kcal) }),
        icon: 'checkmark-circle',
      });
    } catch {
      Alert.alert('screen.tabs.index.alert.004', 'screen.tabs.index.alert.005');
    } finally {
      setIsLoggingMovement(false);
    }
  }

  const movementProgressPct = movementPlan
    ? clampProgress(activityMinutes / Math.max(safeNumber(movementPlan.daily_minutes_target), 1)) * 100
    : 0;
  const movementSourceLabel = movementPlan?.preference_id
    ? t('screen.tabs.index.movement.source.profile')
    : t('screen.tabs.index.movement.source.suggestion');
  const movementButtonLabel = movementPlanCompleted
    ? t('screen.tabs.index.movement.button.logged')
    : isLoggingMovement
      ? t('screen.tabs.index.movement.button.logging')
      : t('screen.tabs.index.movement.button.complete');
  const firstName = profileMeta?.full_name?.trim().split(/\s+/).pop() ?? '';
  const proteinTargetG = getProteinTarget(
    profileMeta?.goal,
    profileMeta?.goal_plan?.direction,
    profileMeta?.weight_kg,
  );
  const proteinGapG = Math.max(0, proteinTargetG - protein);
  const todayHero = useTodayHero({
    consumedCalories: consumed,
    targetCalories: target,
    proteinG: protein,
    proteinTargetG,
    activityMinutes,
    activityTargetMinutes: movementPlan?.daily_minutes_target ?? 25,
    logsCount: logs.length,
    streak: displayStreak,
    firstName,
    locale,
  });
  const todayCoach = useTodayCoach({
    logsCount: logs.length,
    remainingCalories: target - consumed,
    proteinGapG,
    activityGapMinutes: Math.max(0, (movementPlan?.daily_minutes_target ?? 25) - activityMinutes),
    locale,
  });
  const coachUpdatedAt = t('screen.tabs.index.aiCoach.updatedAt', {
    time: new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date()),
  });
  const nextAction = useMemo(() => {
    if (logs.length === 0) {
      return {
        kind: 'scan' as const,
        tone: 'info' as const,
        icon: 'camera' as const,
        label: t('screen.tabs.index.next.startDay'),
        title: t('screen.tabs.index.next.firstMeal.title'),
        body: t('screen.tabs.index.next.firstMeal.body'),
        primaryLabel: t('screen.tabs.index.next.firstMeal.primary'),
      };
    }

    if (proteinGapG > 0) {
      return {
        kind: 'scan' as const,
        tone: 'info' as const,
        icon: 'barbell-outline' as const,
        label: t('screen.tabs.index.next.action'),
        title: t('screen.tabs.index.next.protein.title', { grams: formatNumber(proteinGapG) }),
        body: t('screen.tabs.index.next.protein.body'),
        primaryLabel: t('screen.tabs.index.next.protein.primary'),
      };
    }

    if (safetyCard) {
      return {
        kind: 'profile' as const,
        tone: safetyCard.tone === 'review' ? 'warn' as const : 'info' as const,
        icon: safetyCard.icon,
        label: t('screen.tabs.index.next.priority'),
        title: safetyCard.title,
        body: safetyCard.body,
        primaryLabel: safetyCard.action,
      };
    }

    if (movementPlan && !movementPlanCompleted) {
      return {
        kind: 'movement' as const,
        tone: movementPlan.tone === 'caution' || movementPlan.tone === 'surplus' ? 'warn' as const : 'good' as const,
        icon: 'walk-outline' as const,
        label: t('screen.tabs.index.next.action'),
        title: movementPlan.title,
        body: t('screen.tabs.index.next.movementBody', {
          minutes: movementPlan.duration_min,
          kcal: formatNumber(movementPlan.estimated_kcal),
          status: movementPlan.calorie_status,
        }),
        primaryLabel: movementButtonLabel,
      };
    }

    const nudge = nudges[0];
    if (nudge) {
      return {
        kind: 'nudge' as const,
        tone: nudge.tone === 'warn' ? 'warn' as const : nudge.tone === 'good' ? 'good' as const : 'info' as const,
        icon: nudge.icon,
        label: t('screen.tabs.index.next.meal'),
        title: nudge.title,
        body: nudge.body,
        primaryLabel: t('screen.tabs.index.next.viewJournal'),
      };
    }

    return {
      kind: 'log' as const,
      tone: 'good' as const,
      icon: 'checkmark-circle' as const,
      label: t('screen.tabs.index.next.steady'),
      title: t('screen.tabs.index.next.steady.title'),
      body: t('screen.tabs.index.next.steady.body'),
      primaryLabel: t('screen.tabs.index.next.openJournal'),
    };
  }, [logs.length, movementButtonLabel, movementPlan, movementPlanCompleted, nudges, proteinGapG, safetyCard, t]);
  const handleNextActionPress = () => {
    if (nextAction.kind === 'profile') {
      router.push('/profile' as never);
      return;
    }
    if (nextAction.kind === 'scan') {
      router.push('/scan' as never);
      return;
    }
    if (nextAction.kind === 'movement') {
      void logMovementPlan();
      return;
    }
    router.push('/log' as never);
  };

  const handleCoachSuggestionPress = (suggestion: TodayCoachSuggestion) => {
    if (suggestion.type === 'scan' || suggestion.type === 'protein') {
      router.push('/scan' as never);
      return;
    }
    if (suggestion.type === 'calories') {
      router.push('/log' as never);
      return;
    }
    router.push('/coach' as never);
  };

  // Macro targets derived from calorie target
  const carbsTargetG = Math.round((target * 0.5) / 4);
  const fatTargetG = Math.round((target * 0.25) / 9);

  return (
    <ScreenShell contentStyle={styles.screen}>

      {/* 1. AI health assistant hero */}
      <TodayHero
        model={todayHero}
        streak={displayStreak}
        waterIntakeL={waterIntakeL}
        waterGoalL={waterGoalL}
        onPressStreak={() => router.push('/achievements' as never)}
      />

      <TodayCoachCard
        suggestions={todayCoach.suggestions}
        motivation={todayCoach.motivation}
        updatedAt={coachUpdatedAt}
        onPress={handleCoachSuggestionPress}
      />

      {/* 2. Safety banner — only when profile incomplete or has medical flags */}
      {safetyCard && !bannerDismissed && (
        <View style={[
          styles.safetyBanner,
          {
            borderColor: safetyCard.tone === 'review' ? colors.borderWarning : colors.borderInfo,
            backgroundColor: safetyCard.tone === 'review' ? colors.surfaceWarning : colors.surfaceInfo,
          },
        ]}>
          <Ionicons
            name={safetyCard.tone === 'review' ? 'medical' : 'shield-checkmark-outline'}
            size={18}
            color={safetyCard.tone === 'review' ? colors.accentAmber : colors.accentCyan}
          />
          <View style={styles.bannerTextCol}>
            <Text style={[styles.bannerTitle, { color: colors.text }]}>{safetyCard.title}</Text>
            <Text style={[styles.bannerSubtitle, { color: colors.textMuted }]}>{safetyCard.body}</Text>
          </View>
          <TouchableOpacity
            style={[styles.bannerButton, { backgroundColor: colors.accentAmber }]}
            onPress={() => { setBannerDismissed(true); router.push('/profile' as never); }}
          >
            <Text style={[styles.bannerButtonText, { color: colors.textOnAccent }]}>{safetyCard.action}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 5. Macro bars */}
      <View style={styles.macroBarRow}>
        <MacroBarCard
          label={t('screen.tabs.index.hifi.macro.protein' as any)}
          eaten={protein} goal={proteinTargetG} color={colors.accentCoral}
        />
        <MacroBarCard
          label={t('screen.tabs.index.hifi.macro.carbs' as any)}
          eaten={carbs} goal={carbsTargetG} color={colors.accentLeaf}
        />
        <MacroBarCard
          label={t('screen.tabs.index.hifi.macro.fat' as any)}
          eaten={fat} goal={fatTargetG} color={colors.accentAmber}
        />
      </View>

      {/* 6. Nutrition quality card */}
      {qualityCoverageItems > 0 && (
        <SurfaceCard revealDelay={120} style={[styles.qualityCard, { borderRadius: 22 }]}>
          <View style={styles.qualityCardHeader}>
            <Text style={[styles.qualityCardTitle, { color: colors.text }]}>
              {t('screen.tabs.index.hifi.quality.title' as any)}
            </Text>
            <Text style={[styles.qualityCardSub, { color: colors.textDisabled }]}>
              {t('screen.tabs.index.hifi.quality.today' as any)}
            </Text>
          </View>
          <View style={styles.qualityGrid}>
            <QualityGridCell
              label={t('screen.tabs.index.hifi.quality.fiber' as any)}
              value={`${formatNumber(fiber)}g`}
              threshold={`>= ${qualityTargets.fiber_g_min}g`}
              tone="good"
            />
            <QualityGridCell
              label={t('screen.tabs.index.hifi.quality.sodium' as any)}
              value={`${formatNumber(sodium)}mg`}
              threshold={`< ${formatNumber(qualityTargets.sodium_mg_max)}mg`}
              tone="limit"
            />
            <QualityGridCell
              label={t('screen.tabs.index.hifi.quality.sugar' as any)}
              value={`${formatNumber(sugar)}g`}
              threshold={`< ${qualityTargets.sugar_g_max}g`}
              tone="limit"
            />
            <QualityGridCell
              label={t('screen.tabs.index.hifi.quality.satFat' as any)}
              value={`${formatNumber(saturatedFat)}g`}
              threshold={`< ${qualityTargets.saturated_fat_g_max}g`}
              tone="limit"
            />
          </View>
        </SurfaceCard>
      )}

      {/* 6.5 Today's plan — roadmap tick-box list */}
      {hasRoadmapPlan && (
        <SurfaceCard revealDelay={130} style={{ borderRadius: 20 }}>
          <View style={styles.roadmapHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('screen.tabs.index.plan.title')}
            </Text>
            <Text style={[styles.roadmapCounter, { color: colors.textMuted }]}>
              {remainingRoadmapItems.length}/{activeRoadmapItems.length}
            </Text>
          </View>
          {visibleRoadmapItems.map((item, idx) => (
            <RoadmapRow
              key={item.id}
              item={item}
              isLast={idx === visibleRoadmapItems.length - 1}
              updating={updatingRoadmapId === item.id}
              onToggle={() => { void toggleRoadmapItem(item); }}
            />
          ))}
        </SurfaceCard>
      )}

      {/* 7. Next step dark card */}
      <NextStepDarkCard
        kind={nextAction.kind}
        title={nextAction.title}
        body={nextAction.body}
        primaryLabel={nextAction.primaryLabel}
        isLogging={isLoggingMovement}
        completed={movementPlanCompleted}
        onPress={handleNextActionPress}
      />

      {/* 8. Meals today */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('screen.tabs.index.hifi.meals.title' as any)}
        </Text>
        {mealTimeline.length > 3 && (
          <TouchableOpacity onPress={() => router.push('/log' as never)}>
            <Text style={[styles.sectionLink, { color: colors.accentCyan }]}>
              {t('screen.tabs.index.hifi.meals.viewAll' as any)}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {mealTimeline.length > 0 ? (
        <SurfaceCard revealDelay={180} style={[styles.mealTimelineCard, { borderRadius: 20 }]}>
          {mealTimeline.slice(0, 3).map((entry, idx) => (
            <MealTimelineRow
              key={entry.mealType}
              entry={entry}
              isLast={idx === Math.min(mealTimeline.length, 3) - 1}
            />
          ))}
        </SurfaceCard>
      ) : (
        <MealTimelineEmpty
          suggestion={suggestedMeal}
          onViewSuggestion={() => router.push('/insights' as never)}
        />
      )}

      {/* 9a. Health support */}
      {healthScore && (
        <SurfaceCard revealDelay={200} style={[styles.supportPanel, { borderRadius: 20 }]}>
          <CompactHealthScoreCard
            score={healthScore}
            proteinGapG={proteinGapG}
            activityGapMinutes={Math.max(0, (movementPlan?.daily_minutes_target ?? 25) - activityMinutes)}
            logsCount={logs.length}
          />
        </SurfaceCard>
      )}

      {/* 9. Shortcut tiles */}
      <View style={styles.shortcutGrid}>
        <ShortcutTile
          iconName="trending-up-outline"
          tone="progress"
          labelKey={'screen.tabs.index.hifi.shortcut.progress' as any}
          onPress={() => router.push('/progress' as never)}
        />
        <ShortcutTile
          iconName="search-outline"
          tone="insights"
          labelKey={'screen.tabs.index.hifi.shortcut.insights' as any}
          onPress={() => router.push('/insights' as never)}
        />
        <ShortcutTile
          iconName="trophy-outline"
          tone="achievement"
          labelKey={'screen.tabs.index.hifi.shortcut.achievements' as any}
          onPress={() => router.push('/achievements' as never)}
        />
        <ShortcutTile
          iconName="heart-outline"
          tone="health"
          labelKey={'screen.tabs.index.hifi.shortcut.health' as any}
          onPress={() => router.push('/health-sync' as never)}
        />
      </View>

      <RewardToast reward={reward} onHide={() => setReward(null)} />
    </ScreenShell>
  );
}

// --- Sub-components ---

function MacroBarCard({
  label,
  eaten,
  goal,
  color,
}: {
  label: string;
  eaten: number;
  goal: number;
  color: string;
}) {
  const { colors } = useAppTheme();
  const pct = clampProgress(safeNumber(eaten) / Math.max(safePositiveNumber(goal, 1), 1));
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: pct, duration: 340, useNativeDriver: false }).start();
  }, [pct, progress]);
  const stateColor = pct >= 1 ? colors.success : pct >= 0.75 ? colors.warning : colors.textDisabled;
  return (
    <View style={[styles.macroBarCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
      <Text style={[styles.macroBarLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.macroBarValue, { color: colors.text }]}>
        {formatNumber(eaten)}
        <Text style={[styles.macroBarGoal, { color: colors.textDisabled }]}>/{goal}g</Text>
      </Text>
      <View style={[styles.macroBarTrack, { backgroundColor: colors.progressBg }]}>
        <Animated.View style={[styles.macroBarFill, {
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: stateColor,
        }]} />
      </View>
    </View>
  );
}

function QualityGridCell({
  label,
  value,
  threshold,
  tone,
}: {
  label: string;
  value: string;
  threshold: string;
  tone: 'good' | 'limit';
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[
      styles.qualityCell,
      {
        backgroundColor: tone === 'good' ? colors.surfaceSuccess : colors.surfaceInfo,
        borderColor: tone === 'good' ? colors.borderSuccess : colors.borderInfo,
      },
    ]}>
      <Text style={[styles.qualityCellLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.qualityCellValue, { color: colors.text }]}>
        {value}{' '}
        <Text style={[styles.qualityCellThreshold, { color: tone === 'good' ? colors.accentLeaf : colors.textMuted }]}>
          {threshold}
        </Text>
      </Text>
    </View>
  );
}

const NEXT_STEP_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  profile: 'shield-checkmark-outline',
  scan: 'camera-outline',
  movement: 'walk-outline',
  nudge: 'bulb-outline',
  log: 'checkmark-circle',
};

function NextStepDarkCard({
  kind,
  title,
  body,
  primaryLabel,
  isLogging,
  completed,
  onPress,
}: {
  kind: 'profile' | 'scan' | 'movement' | 'nudge' | 'log';
  title: string;
  body: string;
  primaryLabel: string;
  isLogging: boolean;
  completed: boolean;
  onPress: () => void;
}) {
  const { colors, mode } = useAppTheme();
  const { t } = useI18n();
  const iconName = NEXT_STEP_ICON_MAP[kind] ?? 'bulb-outline';
  const isDone = kind === 'movement' && completed;
  const isDisabled = kind === 'movement' && (isLogging || completed);
  const cardGradient: [string, string] = mode === 'dark'
    ? [colors.surfaceAlt, colors.surfacePressed]
    : [colors.text, colors.accentCyan];
  const secondaryText = mode === 'dark' ? colors.textSoft : colors.surfaceMuted;

  return (
    <LinearGradient
      colors={cardGradient}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.nextStepCard}
    >
      <View style={styles.nextStepRow}>
        <View style={[styles.nextStepIconWrap, { backgroundColor: mode === 'dark' ? colors.surfaceSuccess : colors.surfaceAlt }]}>
          <Ionicons name={iconName} size={20} color={colors.accentMint} />
        </View>
        <View style={styles.nextStepCopy}>
          <Text style={[styles.nextStepEyebrow, { color: colors.accentMint }]}>
            {t('screen.tabs.index.hifi.nextstep.eyebrow' as any)}
          </Text>
          <Text style={[styles.nextStepTitle, { color: mode === 'dark' ? colors.text : colors.surface }]}>{title}</Text>
          <Text style={[styles.nextStepBody, { color: secondaryText }]}>{body}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[
          styles.nextStepButton,
          { backgroundColor: colors.accentMint },
          isDone && styles.nextStepButtonDone,
          isDone && { backgroundColor: mode === 'dark' ? colors.surfaceSuccess : colors.surfaceAlt },
          isDisabled && styles.disabledButton,
        ]}
        onPress={onPress}
        disabled={isDisabled}
      >
        <Text style={[styles.nextStepButtonText, { color: colors.textOnAccent }, isDone && { color: colors.accentMint }]}>
          {isDone
            ? t('screen.tabs.index.hifi.nextstep.done' as any)
            : primaryLabel}
        </Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const MEAL_ICON_MAP: Record<MealType, keyof typeof Ionicons.glyphMap> = {
  breakfast: 'sunny-outline',
  lunch: 'partly-sunny-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
};

function formatMealTime(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function MealTimelineRow({ entry, isLast }: { entry: MealTimelineEntry; isLast: boolean }) {
  const { colors } = useAppTheme();
  const { locale, t } = useI18n();
  const mealLabel = t(MEAL_LABEL_KEYS[entry.mealType]);
  const names = entry.logs
    .map((log) => (locale === 'vi' ? log.name_vi ?? log.name : log.name))
    .join(', ');
  const isAi = entry.logs.some((log) => Boolean(log.ai_scan_id));

  return (
    <TouchableOpacity
      style={styles.mealTimelineRow}
      onPress={() => router.push('/log' as never)}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={`${mealLabel}, ${formatNumber(entry.calories)} kcal`}
    >
      <View style={styles.mealTimelineRail}>
        <View style={[styles.mealTimelineDot, { backgroundColor: colors.accentLeaf, borderColor: colors.surface }]} />
        {!isLast && <View style={[styles.mealTimelineLine, { backgroundColor: colors.borderSuccess }]} />}
      </View>
      <View style={[styles.mealTimelineIcon, { backgroundColor: colors.surfaceSuccess }]}>
        <Ionicons name={MEAL_ICON_MAP[entry.mealType]} size={19} color={colors.accentLeaf} />
      </View>
      <View style={styles.mealTimelineCopy}>
        <View style={styles.mealTimelineTitleRow}>
          <Text style={[styles.mealTimelineTitle, { color: colors.text }]}>{mealLabel}</Text>
          <Text style={[styles.mealTimelineTime, { color: colors.textMuted }]}>
            {formatMealTime(entry.loggedAt, locale)}
          </Text>
        </View>
        <Text style={[styles.mealTimelineNames, { color: colors.textSoft }]} numberOfLines={2}>
          {names}
        </Text>
        <Text style={[styles.mealTimelineKcal, { color: colors.accentLeaf }]}>
          {formatNumber(entry.calories)} kcal
        </Text>
      </View>
      {isAi && (
        <View style={[styles.aiBadge, { backgroundColor: colors.surfaceSuccess }]}>
          <Ionicons name="sparkles-outline" size={10} color={colors.accentLeaf} />
          <Text style={[styles.aiBadgeText, { color: colors.accentLeaf }]}>
            {t('screen.tabs.index.hifi.meals.aiBadge' as any)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function MealTimelineEmpty({
  suggestion,
  onViewSuggestion,
}: {
  suggestion: { meal: MealRecommendation; food: MealRecommendation['suggested_foods'][number] } | null;
  onViewSuggestion: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useI18n();

  return (
    <SurfaceCard revealDelay={180} style={[styles.mealTimelineEmpty, { borderRadius: 20 }]}>
      <View style={[styles.mealEmptyIcon, { backgroundColor: colors.surfaceSuccess }]}>
        <Ionicons name={suggestion ? 'sparkles-outline' : 'restaurant-outline'} size={22} color={colors.accentLeaf} />
      </View>
      <View style={styles.mealEmptyCopy}>
        <Text style={[styles.mealEmptyTitle, { color: colors.text }]}>
          {suggestion
            ? t('screen.tabs.index.hifi.meals.suggestionTitle' as any)
            : t('screen.tabs.index.hifi.meals.emptyStatusTitle' as any)}
        </Text>
        <Text style={[styles.mealEmptyBody, { color: colors.textMuted }]}>
          {suggestion
            ? `${suggestion.food.name} · ${formatNumber(suggestion.meal.recommended_calories)} kcal · ${formatNumber(suggestion.food.protein_g)}g protein · ${formatNumber(suggestion.food.fat_g)}g fat`
            : t('screen.tabs.index.hifi.meals.emptyStatusBody' as any)}
        </Text>
      </View>
      {suggestion && (
        <TouchableOpacity
          style={[styles.mealSuggestionLink, { backgroundColor: colors.surfaceSuccess }]}
          onPress={onViewSuggestion}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={[styles.mealSuggestionLinkText, { color: colors.success }]}>
            {t('screen.tabs.index.hifi.meals.viewSuggestion' as any)}
          </Text>
          <Ionicons name="arrow-forward" size={14} color={colors.success} />
        </TouchableOpacity>
      )}
    </SurfaceCard>
  );
}

function ShortcutTile({
  iconName,
  tone,
  labelKey,
  onPress,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  tone: 'progress' | 'insights' | 'achievement' | 'health';
  labelKey: any;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const toneMap: Record<typeof tone, { bg: string; icon: string }> = {
    progress: { bg: colors.surfaceSuccess, icon: colors.accentLeaf },
    insights: { bg: colors.surfaceInfo, icon: colors.accentCyan },
    achievement: { bg: colors.surfaceWarning, icon: colors.accentAmber },
    health: { bg: colors.surfaceSuccess, icon: colors.accentLeaf },
  };
  const toneStyle = toneMap[tone];
  return (
    <TouchableOpacity
      style={[styles.shortcutTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={[styles.shortcutIconBubble, { backgroundColor: toneStyle.bg }]}>
        <Ionicons name={iconName} size={18} color={toneStyle.icon} />
      </View>
      <Text style={[styles.shortcutLabel, { color: colors.textSoft }]}>{t(labelKey)}</Text>
    </TouchableOpacity>
  );
}

function RoadmapRow({
  item,
  isLast,
  updating,
  onToggle,
}: {
  item: DailyRoadmapItem;
  isLast: boolean;
  updating: boolean;
  onToggle: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  return (
    <TouchableOpacity
      style={[styles.roadmapRow, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }]}
      onPress={onToggle}
      disabled={updating}
      activeOpacity={0.7}
    >
      <Ionicons
        name={item.is_completed ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={item.is_completed ? colors.accentLeaf : colors.borderStrong}
      />
      <View style={styles.roadmapRowCopy}>
        <Text
          style={[
            styles.roadmapRowTitle,
            { color: item.is_completed ? colors.textMuted : colors.text },
            item.is_completed && { textDecorationLine: 'line-through' as const },
          ]}
          numberOfLines={1}
        >
          {item.task_title}
        </Text>
        {(item.duration_min || item.estimated_kcal) ? (
          <Text style={[styles.roadmapRowMeta, { color: colors.textDisabled }]}>
            {t('screen.tabs.index.plan.roadmapMeta', {
              minutes: item.duration_min ?? 0,
              kcal: formatNumber(item.estimated_kcal ?? 0),
            })}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.roadmapRowAction, { color: item.is_completed ? colors.accentLeaf : colors.textMuted }]}>
        {item.is_completed
          ? t('screen.tabs.index.plan.done')
          : updating ? '...' : t('screen.tabs.index.plan.markDone')}
      </Text>
    </TouchableOpacity>
  );
}

function CompactHealthScoreCard({
  score,
  proteinGapG,
  activityGapMinutes,
  logsCount,
}: {
  score: NonNullable<ReturnType<typeof useAppTheme> extends never ? never : any>;
  proteinGapG: number;
  activityGapMinutes: number;
  logsCount: number;
}) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const overall = safeNumber(score.overall);
  const ringScale = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    Animated.spring(ringScale, { toValue: 1, speed: 18, bounciness: 3, useNativeDriver: true }).start();
  }, [overall, ringScale]);
  const level = overall >= 80 ? 'good' : overall >= 50 ? 'average' : 'improve';
  const levelColor = level === 'good' ? colors.success : level === 'average' ? colors.warning : colors.danger;
  const levelSurface = level === 'good' ? colors.surfaceSuccess : level === 'average' ? colors.surfaceWarning : colors.surfaceDanger;
  const reasons = [
    proteinGapG > 0 ? t('screen.tabs.index.health.reason.protein', { grams: formatNumber(proteinGapG) }) : null,
    activityGapMinutes > 0 ? t('screen.tabs.index.health.reason.activity', { minutes: formatNumber(activityGapMinutes) }) : null,
    logsCount < 3 ? t('screen.tabs.index.health.reason.meals') : null,
  ].filter((item): item is string => Boolean(item)).slice(0, 3);
  return (
    <View style={styles.healthRow}>
      <Animated.View style={[styles.healthScoreCircle, {
        backgroundColor: levelSurface,
        borderColor: levelColor,
        transform: [{ scale: ringScale }],
      }]}>
        <Text style={[styles.healthScoreValue, { color: levelColor }]}>{formatNumber(overall)}</Text>
        <Text style={[styles.healthScoreMax, { color: colors.textDisabled }]}>/100</Text>
      </Animated.View>
      <View style={styles.healthRight}>
        <Text style={[styles.healthEyebrow, { color: colors.accentCyan }]}>
          {t('screen.tabs.index.health.eyebrow')}
        </Text>
        <Text style={[styles.healthRating, { color: levelColor }]}>
          {formatNumber(overall)} /100 – {t(`screen.tabs.index.health.rating.${level}` as any)}
        </Text>
        <Text style={[styles.healthExplanation, { color: colors.textMuted }]} numberOfLines={2}>
          {t(`screen.tabs.index.health.rating.${level}.body` as any)}
        </Text>
        {reasons.length > 0 && (
          <View style={styles.healthReasons}>
            {reasons.map((reason) => (
              <Text key={reason} style={[styles.healthReason, { color: colors.textSoft }]}>• {reason}</Text>
            ))}
          </View>
        )}
        <View style={styles.healthScale}>
          <View style={[styles.healthScaleSegment, { backgroundColor: colors.danger }]} />
          <View style={[styles.healthScaleSegment, { backgroundColor: colors.warning }]} />
          <View style={[styles.healthScaleSegment, { backgroundColor: colors.success }]} />
        </View>
        <View style={styles.healthScaleLabels}>
          <Text style={[styles.healthScaleLabel, { color: colors.textDisabled }]}>{t('screen.tabs.index.health.rating.improve' as any)}</Text>
          <Text style={[styles.healthScaleLabel, { color: colors.textDisabled }]}>{t('screen.tabs.index.health.rating.average' as any)}</Text>
          <Text style={[styles.healthScaleLabel, { color: colors.textDisabled }]}>{t('screen.tabs.index.health.rating.good' as any)}</Text>
        </View>
      </View>
    </View>
  );
}

// --- Styles ---

const styles = createThemedStyles((colors) => ({
  screen: { paddingBottom: 28 },

  // Safety banner
  safetyBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 11,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  bannerTextCol: { flex: 1 },
  bannerTitle: { fontSize: 12.5, fontWeight: '700' as const },
  bannerSubtitle: { fontSize: 11, marginTop: 1 },
  bannerButton: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 6 },
  bannerButtonText: { fontSize: 12, fontWeight: '800' as const },

  // Macro bars
  macroBarRow: { flexDirection: 'row' as const, gap: 10, marginBottom: 13 },
  macroBarCard: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14, minHeight: 84 },
  macroBarLabel: { fontSize: 12, fontWeight: '700' as const },
  macroBarValue: { fontSize: 22, fontWeight: '800' as const, marginTop: 4, marginBottom: 8, lineHeight: 26 },
  macroBarGoal: { fontSize: 11, fontWeight: '600' as const },
  macroBarTrack: { height: 6, borderRadius: 3, overflow: 'hidden' as const },
  macroBarFill: { height: '100%' as any, borderRadius: 3 },

  // Nutrition quality
  qualityCard: { marginBottom: 12 },
  qualityCardHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  qualityCardTitle: { fontSize: 13, fontWeight: '800' as const },
  qualityCardSub: { fontSize: 11 },
  qualityGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  qualityCell: {
    flex: 1,
    minWidth: '46%' as any,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  qualityCellLabel: { fontSize: 10.5, fontWeight: '700' as const },
  qualityCellValue: { fontSize: 13, fontWeight: '800' as const, marginTop: 2 },
  qualityCellThreshold: { fontSize: 10, fontWeight: '700' as const },

  // Next step dark card
  nextStepCard: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 18px 38px ${colors.shadow}38` } as any)
      : {
          shadowColor: colors.shadow,
          shadowOpacity: 0.22,
          shadowRadius: 19,
          shadowOffset: { width: 0, height: 9 },
          elevation: 8,
        }),
  },
  nextStepRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    marginBottom: 14,
  },
  nextStepIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  nextStepCopy: { flex: 1 },
  nextStepEyebrow: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: colors.accentMint,
  },
  nextStepTitle: {
    fontSize: 13.5,
    fontWeight: '600' as const,
    color: colors.text,
    marginTop: 3,
    lineHeight: 19,
  },
  nextStepBody: { fontSize: 12, color: colors.textSoft, marginTop: 2, lineHeight: 17 },
  nextStepButton: {
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.accentMint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  nextStepButtonDone: {},
  nextStepButtonText: {
    fontSize: 13.5,
    fontWeight: '800' as const,
    color: colors.textOnAccent,
  },
  nextStepButtonTextDone: {},

  // Section header
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800' as const },
  sectionLink: { fontSize: 12, fontWeight: '700' as const },

  // Meal timeline
  mealTimelineCard: { paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12 },
  mealTimelineRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    minHeight: 88,
    paddingVertical: 9,
  },
  mealTimelineRail: {
    width: 18,
    alignSelf: 'stretch' as const,
    alignItems: 'center' as const,
  },
  mealTimelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, marginTop: 22, zIndex: 1 },
  mealTimelineLine: { position: 'absolute' as const, top: 34, bottom: -18, width: 2 },
  mealTimelineIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    marginLeft: 7,
    marginRight: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  mealTimelineCopy: { flex: 1, minWidth: 0, paddingTop: 1 },
  mealTimelineTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
  },
  mealTimelineTitle: { fontSize: 14, fontWeight: '800' as const },
  mealTimelineTime: { fontSize: 11, fontWeight: '700' as const, fontVariant: ['tabular-nums'] as any },
  mealTimelineNames: { fontSize: 11.5, lineHeight: 16, marginTop: 3, paddingRight: 4 },
  mealTimelineKcal: { fontSize: 11.5, fontWeight: '800' as const, marginTop: 3 },
  aiBadge: {
    position: 'absolute' as const,
    right: 0,
    bottom: 9,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  aiBadgeText: { fontSize: 10, fontWeight: '800' as const },
  mealTimelineEmpty: { marginBottom: 14, alignItems: 'center' as const, paddingVertical: 20 },
  mealEmptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  mealEmptyCopy: { alignItems: 'center' as const, marginTop: 11, marginBottom: 15, maxWidth: 280 },
  mealEmptyTitle: { fontSize: 14, fontWeight: '800' as const, textAlign: 'center' as const },
  mealEmptyBody: { fontSize: 11.5, lineHeight: 17, textAlign: 'center' as const, marginTop: 4 },
  mealSuggestionLink: {
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 7,
  },
  mealSuggestionLinkText: { fontSize: 12, fontWeight: '800' as const },

  // Shortcuts
  shortcutGrid: { flexDirection: 'row' as const, gap: 9, marginBottom: 8 },
  shortcutTile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingTop: 11,
    paddingBottom: 10,
    paddingHorizontal: 6,
    alignItems: 'center' as const,
    gap: 6,
  },
  shortcutIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  shortcutLabel: {
    fontSize: 10.5,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
  },

  disabledButton: { opacity: 0.6 },

  supportPanel: {
    marginTop: 16,
    marginBottom: 12,
  },
  supportDivider: {
    height: 1,
    marginVertical: 14,
  },

  // Roadmap plan
  roadmapHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
  },
  roadmapCounter: { fontSize: 12, fontWeight: '700' as const },
  roadmapRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 11,
  },
  roadmapRowCopy: { flex: 1, minWidth: 0 },
  roadmapRowTitle: { fontSize: 13.5, fontWeight: '700' as const },
  roadmapRowMeta: { fontSize: 11, marginTop: 2 },
  roadmapRowAction: { fontSize: 11.5, fontWeight: '700' as const },

  // Compact health score card
  healthRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 16,
  },
  healthScoreCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  healthScoreValue: { fontSize: 22, fontWeight: '900' as const, lineHeight: 26 },
  healthScoreMax: { fontSize: 10, fontWeight: '600' as const },
  healthRight: { flex: 1, minWidth: 0 },
  healthEyebrow: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  healthRating: { fontSize: 13.5, fontWeight: '900' as const, marginTop: 2 },
  healthExplanation: { fontSize: 10.5, lineHeight: 15, fontWeight: '500' as const, marginTop: 3 },
  healthReasons: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 6 },
  healthReason: { fontSize: 9.5, lineHeight: 13, fontWeight: '600' as const },
  healthScale: { flexDirection: 'row' as const, gap: 3, marginTop: 9 },
  healthScaleSegment: { flex: 1, height: 4, borderRadius: 2 },
  healthScaleLabels: { flexDirection: 'row' as const, gap: 4, marginTop: 4 },
  healthScaleLabel: { flex: 1, fontSize: 8, fontWeight: '600' as const, textAlign: 'center' as const },
}));
