import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
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
import { EmptyState } from '../../components/empty-state';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { useGamificationStore } from '../../store/gamification.store';
import { useLogStore } from '../../store/log.store';
import { useAuthStore } from '../../store/auth.store';
import { useCalorieTargetStore } from '../../store/calorie-target.store';
import { useInsightsStore } from '../../store/insights.store';
import { apiClient } from '../../services/api';
import { estimateExerciseCalories } from '../../services/exercise.service';
import { formatNumberVi, safeNumber, safePositiveNumber, toFiniteNumber } from '../../services/number-format';
import { AnimatedIonicon } from '../../components/animated-icon';
import { RewardToast, RewardToastData } from '../../components/reward-toast';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';
import { Locale, tr, useI18n } from '../../components/i18n';
import { buildSuccessForecast } from '../../services/success-forecast.service';
import { buildDynamicIntervention } from '../../services/dynamic-intervention.service';
import { buildInterventionEvent, recordInterventionEvent } from '../../services/intervention-memory.service';
import { telemetryService } from '../../services/telemetry.service';

const mealIllustration = require('../../assets/images/vietnamese-meal.jpg') as number;
const todayHeroIllustration = require('../../assets/images/today-hero.jpg') as number;

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

type TodayCoachBridge = {
  title: string;
  body: string;
  status: string;
  tone: 'good' | 'warn' | 'info';
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

function buildProteinTarget(goal?: UserGoal, direction?: GoalPlan['direction'], weightKg = 65) {
  const kg = Math.max(35, safePositiveNumber(weightKg, 65));
  if (goal === 'gain_muscle' || direction === 'gain') return Math.round(kg * 1.6);
  if (goal === 'lose_weight' || direction === 'loss') return Math.round(kg * 1.4);
  return Math.round(kg * 1.2);
}

function focusToneColor(tone: FocusTone) {
  if (tone === 'good') return theme.colors.accentMint;
  if (tone === 'warn') return theme.colors.accentAmber;
  if (tone === 'muted') return theme.colors.textMuted;
  return theme.colors.accentCyan;
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
  const qualityCoverageItems = safeNumber(args.qualityCoverageItems);
  const netKcal = Math.max(0, consumedKcal - burnedKcal);
  const remaining = targetKcal - netKcal;
  const calorieRatio = netKcal / Math.max(targetKcal, 1);
  const proteinTarget = buildProteinTarget(args.goal, args.goalDirection, args.weightKg);
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

  if (activityMinutes < 25) {
    items.push({
      key: 'movement',
      label: tr('screen.tabs.index.focus.movement.label', locale),
      value: tr('screen.tabs.index.focus.movement.value', locale, { minutes: formatNumber(activityMinutes) }),
      hint: tr('screen.tabs.index.focus.movement.hint', locale),
      icon: 'walk-outline',
      tone: 'info',
      progress: clampProgress(activityMinutes / 25),
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
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.progressBg} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={remaining >= 0 ? theme.colors.accentMint : theme.colors.accentCoral}
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

type DashboardProfileMeta = Pick<User, 'age' | 'gender' | 'height_cm' | 'weight_kg' | 'health_flags' | 'activity_level' | 'goal_plan' | 'daily_calorie_target' | 'goal'>;

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

function buildTodayCoachBridge(args: {
  logsCount: number;
  consumed: number;
  burned: number;
  target: number;
  protein: number;
  streak: number;
  locale: Locale;
}): TodayCoachBridge {
  const logsCount = safeNumber(args.logsCount);
  const consumed = safeNumber(args.consumed);
  const burned = safeNumber(args.burned);
  const target = safePositiveNumber(args.target, 1800);
  const protein = safeNumber(args.protein);
  const streak = safeNumber(args.streak);
  const locale = args.locale;
  const net = Math.max(0, consumed - burned);
  const remaining = target - net;
  const proteinTarget = Math.max(70, Math.round(target * 0.075 / 4));

  if (logsCount === 0 && streak === 0) {
    return {
      title: tr('screen.tabs.index.coach.restart.title', locale),
      body: tr('screen.tabs.index.coach.restart.body', locale),
      status: tr('screen.tabs.index.coach.restart.status', locale),
      tone: 'info',
    };
  }

  if (logsCount === 0) {
    return {
      title: tr('screen.tabs.index.coach.empty.title', locale),
      body: tr('screen.tabs.index.coach.empty.body', locale),
      status: tr('screen.tabs.index.coach.empty.status', locale, { days: formatNumber(streak) }),
      tone: 'info',
    };
  }

  if (remaining < -150) {
    return {
      title: tr('screen.tabs.index.coach.over.title', locale),
      body: tr('screen.tabs.index.coach.over.body', locale),
      status: tr('screen.tabs.index.coach.over.status', locale, { kcal: formatNumber(Math.abs(remaining)) }),
      tone: 'warn',
    };
  }

  if (protein < proteinTarget * 0.65) {
    return {
      title: tr('screen.tabs.index.coach.protein.title', locale),
      body: tr('screen.tabs.index.coach.protein.body', locale),
      status: `${formatNumber(protein)}/${proteinTarget}g`,
      tone: 'info',
    };
  }

  return {
    title: tr('screen.tabs.index.coach.track.title', locale),
    body: tr('screen.tabs.index.coach.track.body', locale),
    status: tr('screen.tabs.index.coach.track.status', locale, { kcal: formatNumber(Math.max(0, remaining)) }),
    tone: 'good',
  };
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

function pickPreferredActivity(
  preferences: PreferredActivity[],
  effectiveGoal: UserGoal,
  overTarget: number,
): PreferredActivity | null {
  if (preferences.length === 0) return null;

  const byType = (types: ActivityType[]) => preferences.find((item) => types.includes(item.activity_type as ActivityType));

  if (overTarget > 75) {
    return [...preferences].sort((a, b) => (ACTIVITY_MET[b.activity_type as ActivityType] ?? 5) - (ACTIVITY_MET[a.activity_type as ActivityType] ?? 5))[0];
  }

  if (effectiveGoal === 'gain_muscle') {
    return byType(['gym']) ?? byType(['yoga', 'swimming']) ?? preferences[0];
  }

  if (effectiveGoal === 'lose_weight') {
    return byType(['walking', 'running', 'cycling', 'swimming']) ?? preferences[0];
  }

  return byType(['walking', 'yoga', 'gym']) ?? preferences[0];
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
  const safeCompletedMin = safeNumber(completedMin);
  const safeConsumedKcal = safeNumber(consumedKcal);
  const safeBurnedKcal = safeNumber(burnedKcal);
  const safeTargetKcal = safePositiveNumber(targetKcal, 1800);
  const remainingToBase = Math.max(0, 25 - safeCompletedMin);
  const netKcal = safeConsumedKcal - safeBurnedKcal;
  const gapToTarget = safeTargetKcal - netKcal;
  const overTarget = Math.max(0, -gapToTarget);
  const surplusBurnTarget = overTarget > 75
    ? Math.min(overTarget, effectiveGoal === 'lose_weight' ? 320 : 220)
    : 0;
  const preferredActivity = pickPreferredActivity(preferences, effectiveGoal, overTarget);

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
        ? 'Cardio zone 2'
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
    daily_minutes_target: 25,
    tone,
  };
}

export default function DashboardScreen() {
  useAppTheme();
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
  const { fetchRecommendations } = useCalorieTargetStore();
  const { fetchWeeklyInsights } = useInsightsStore();
  const [profileMeta, setProfileMeta] = useState<DashboardProfileMeta | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string>(QUICK_GOAL_OPTIONS[1].key);
  const [isApplyingTarget, setIsApplyingTarget] = useState(false);
  const [isLoggingMovement, setIsLoggingMovement] = useState(false);
  const [updatingRoadmapId, setUpdatingRoadmapId] = useState<string | null>(null);
  const [reward, setReward] = useState<RewardToastData | null>(null);
  const [reminderEffectiveness, setReminderEffectiveness] = useState<ReminderEffectivenessSummary | null>(null);
  const [behaviorMemory, setBehaviorMemory] = useState<BehaviorMemory | null>(null);

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
    fetchReminderEffectiveness().catch(() => setReminderEffectiveness(null));
    fetchBehaviorMemory().catch(() => setBehaviorMemory(null));
  }, [authLoading, fetchBehaviorMemory, fetchProfileMeta, fetchReminderEffectiveness, fetchSummary, fetchTodaySummary, token]);

  useEffect(() => {
    refreshDashboardData();
  }, [refreshDashboardData]);

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
  const displayStreak = getDisplayStreak(summary, logs, activityLogs);
  const consumed = safeNumber(dailyLog?.total_calories);
  const burned = activityLogs.reduce((sum, item) => sum + safeNumber(item.calories_burned), 0);
  const activityMinutes = activityLogs.reduce((sum, item) => sum + safeNumber(item.duration_min), 0);
  const target = safePositiveNumber(dailyLog?.target_calories, 1800);
  const movementPlan = useMemo(
    () => buildMovementPlan(profileMeta, activityPreferences, activityMinutes, consumed, burned, target, locale),
    [activityMinutes, activityPreferences, burned, consumed, locale, profileMeta, target],
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
  const todayPlanMetricLabel = hasRoadmapPlan ? 'tasks left' : planRemaining >= 0 ? 'left' : 'over';
  const healthScore = todaySummary?.health_score;
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

  async function applySelectedTarget() {
    setIsApplyingTarget(true);
    try {
      const res = await apiClient.patch<User>('/user/profile', {
        goal: goalFromQuickOption(selectedGoalOption.type),
        goal_plan: selectedGoalPlan,
      });
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
      });
      await Promise.all([
        fetchDailyLog(),
        fetchRecommendations().catch(() => {}),
        fetchWeeklyInsights().catch(() => {}),
      ]);
      const savedTarget = safePositiveNumber(res.data.daily_calorie_target, target);
      const planWarnings = res.data.goal_plan?.warnings?.[0];
      Alert.alert('screen.tabs.index.alert.001', t('screen.tabs.index.alert.savedTargetBody', { target: formatNumber(savedTarget), warnings: planWarnings ? `\n${planWarnings}` : '' }));
    } catch (e: any) {
      Alert.alert('screen.tabs.index.alert.002', e?.response?.data?.message ?? 'screen.tabs.index.alert.003');
    } finally {
      setIsApplyingTarget(false);
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
  const nextAction = useMemo(() => {
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
  }, [locale, logs.length, movementButtonLabel, movementPlan, movementPlanCompleted, nudges, safetyCard, t]);
  const coachBridge = useMemo(() => buildTodayCoachBridge({
    logsCount: logs.length,
    consumed,
    burned,
    target,
    protein,
    streak: displayStreak,
    locale,
  }), [burned, consumed, displayStreak, locale, logs.length, protein, target]);
  const visibleNudges = nextAction.kind === 'nudge' ? nudges.slice(1) : nudges;

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

  return (
    <ScreenShell contentStyle={[styles.screen, isCompact && styles.screenCompact]}>
      <View style={[styles.headerRow, isCompact && styles.headerRowCompact]}>
        <View style={styles.headerCopy}>
          <Eyebrow>{t('screen.tabs.index.hero.eyebrow')}</Eyebrow>
          <Text style={[styles.dashboardTitle, isCompact && styles.dashboardTitleCompact]}>
            {t('screen.tabs.index.hero.title')}
          </Text>
          <BodyText style={[styles.heroBody, isCompact && styles.heroBodyCompact]}>
            {t('screen.tabs.index.hero.body')}
          </BodyText>
        </View>
        <TouchableOpacity style={[styles.streakPill, isCompact && styles.streakPillCompact]} onPress={() => router.push('/achievements' as never)}>
          <AnimatedIonicon name="flame" size={16} color={theme.colors.accentAmber} motion="pulse" />
          <Text style={styles.streakText}>
            {t('screen.tabs.index.streak.days', { days: formatNumber(displayStreak) })}
          </Text>
        </TouchableOpacity>
      </View>

      <SurfaceCard revealDelay={70} style={[
        styles.nextActionCard,
        isCompact && styles.nextActionCardCompact,
        nextAction.tone === 'good' && styles.nextActionCardGood,
        nextAction.tone === 'warn' && styles.nextActionCardWarn,
      ]}>
        <View style={[styles.nextActionIconWrap, isCompact && styles.nextActionIconWrapCompact]}>
          <Ionicons
            name={nextAction.icon}
            size={20}
            color={nextAction.tone === 'warn' ? theme.colors.accentAmber : theme.colors.accentMint}
          />
        </View>
        <View style={[styles.nextActionCopy, isCompact && styles.nextActionCopyCompact]}>
          <Text style={styles.nextActionLabel}>{nextAction.label}</Text>
          <Text style={[styles.nextActionTitle, isCompact && styles.nextActionTitleCompact]}>{nextAction.title}</Text>
          <Text style={[styles.nextActionBody, isCompact && styles.nextActionBodyCompact]}>{nextAction.body}</Text>
        </View>
        <TouchableOpacity
          style={[styles.nextActionButton, isCompact && styles.nextActionButtonCompact, nextAction.kind === 'movement' && (isLoggingMovement || movementPlanCompleted) && styles.disabledButton]}
          onPress={handleNextActionPress}
          disabled={nextAction.kind === 'movement' && (isLoggingMovement || movementPlanCompleted)}
        >
          <Text style={styles.nextActionButtonText}>{nextAction.primaryLabel}</Text>
        </TouchableOpacity>
      </SurfaceCard>

      <SurfaceCard revealDelay={130} style={[
        styles.coachBridgeCard,
        coachBridge.tone === 'good' && styles.coachBridgeGood,
        coachBridge.tone === 'warn' && styles.coachBridgeWarn,
      ]}>
        <View style={styles.coachBridgeCopy}>
          <View style={styles.coachBridgeHeader}>
            <Text style={styles.coachBridgeEyebrow}>{t('screen.tabs.index.coach.eyebrow')}</Text>
            <Text style={[
              styles.coachBridgeStatus,
              coachBridge.tone === 'warn' && styles.coachBridgeStatusWarn,
            ]}>
              {coachBridge.status}
            </Text>
          </View>
          <Text style={styles.coachBridgeTitle}>{coachBridge.title}</Text>
          <Text style={styles.coachBridgeBody}>{coachBridge.body}</Text>
        </View>
        <TouchableOpacity style={styles.coachBridgeButton} onPress={() => router.push('/coach' as never)}>
          <Text style={styles.coachBridgeButtonText}>{t('screen.tabs.index.coach.open')}</Text>
        </TouchableOpacity>
      </SurfaceCard>

      {healthScore ? (
        <SurfaceCard revealDelay={190} style={styles.healthScoreCard}>
          <View style={styles.healthScoreHeader}>
            <View style={styles.healthScoreCopy}>
              <Text style={styles.healthScoreEyebrow} i18nKey="screen.tabs.index.health.eyebrow" />
              <Text style={styles.healthScoreTitle} i18nKey="screen.tabs.index.health.title" />
              <Text style={styles.healthScoreBody}>
                {t(`screen.tabs.index.health.label.${healthScore.label}` as any)}
              </Text>
            </View>
            <View style={styles.healthScoreBadge}>
              <Text style={styles.healthScoreValue}>{formatNumber(healthScore.overall)}</Text>
              <Text style={styles.healthScoreUnit}>/100</Text>
            </View>
          </View>
          <View style={styles.healthTrendRow}>
            <View style={[
              styles.healthTrendPill,
              healthTrendTone === 'good' && styles.healthTrendPillGood,
              healthTrendTone === 'warn' && styles.healthTrendPillWarn,
            ]}>
              <Ionicons
                name={healthTrendTone === 'good' ? 'trending-up' : healthTrendTone === 'warn' ? 'trending-down' : 'remove'}
                size={14}
                color={healthTrendTone === 'warn' ? theme.colors.accentAmber : theme.colors.accentMint}
              />
              <Text style={[
                styles.healthTrendText,
                healthTrendTone === 'warn' && styles.healthTrendTextWarn,
              ]}>
                {healthTrendText}
              </Text>
            </View>
            <Text style={styles.healthAdherenceText}>{healthAdherenceText}</Text>
          </View>
          <View style={styles.healthScoreBreakdown}>
            {healthScoreBreakdown.map((item) => (
              <View key={item.key} style={styles.healthScoreMetric}>
                <View style={styles.healthScoreMetricHeader}>
                  <Text style={styles.healthScoreMetricLabel}>{item.label}</Text>
                  <Text style={styles.healthScoreMetricValue}>{formatNumber(item.value)}</Text>
                </View>
                <View style={styles.healthScoreTrack}>
                  <View style={[styles.healthScoreFill, { width: `${Math.max(0, Math.min(100, item.value))}%` as any }]} />
                </View>
              </View>
            ))}
          </View>
          {healthScore.signals.length > 0 ? (
            <View style={styles.healthSignalList}>
              {healthScore.signals.slice(0, 2).map((signal) => (
                <View key={signal} style={styles.healthSignalChip}>
                  <Ionicons name="sparkles" size={13} color={theme.colors.accentCyan} />
                  <Text style={styles.healthSignalText}>{signal}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.healthScoreAction}
            onPress={() => {
              if (healthScore.next_action === 'log_meal') router.push('/scan' as never);
              else if (healthScore.next_action === 'move' || healthScore.next_action === 'complete_plan') router.push('/log' as never);
              else router.push('/coach' as never);
            }}
          >
            <Text style={styles.healthScoreActionText}>
              {t(`screen.tabs.index.health.action.${healthScore.next_action}` as any)}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={theme.colors.textOnAccent} />
          </TouchableOpacity>
        </SurfaceCard>
      ) : null}

      {successForecast ? (
        <SurfaceCard style={[
          styles.successForecastCard,
          successForecastToneValue === 'good' && styles.successForecastCardGood,
          successForecastToneValue === 'warn' && styles.successForecastCardWarn,
        ]}>
          <View style={styles.successForecastHeader}>
            <View style={styles.successForecastCopy}>
              <Text style={styles.successForecastEyebrow}>{t('screen.tabs.index.success.eyebrow')}</Text>
              <Text style={styles.successForecastTitle}>{t(`screen.tabs.index.success.label.${successForecast.label}` as any)}</Text>
              <Text style={styles.successForecastBody}>{successForecast.recovery_plan.title}</Text>
            </View>
            <View style={styles.successForecastBadge}>
              <Text style={[
                styles.successForecastValue,
                successForecastToneValue === 'warn' && styles.successForecastValueWarn,
              ]}>
                {formatNumber(successForecast.score)}
              </Text>
              <Text style={styles.successForecastUnit}>%</Text>
            </View>
          </View>
          <View style={styles.successForecastDriverGrid}>
            {Object.entries(successForecast.drivers).map(([key, value]) => (
              <View key={key} style={styles.successForecastDriver}>
                <Text style={styles.successForecastDriverLabel}>
                  {t(`screen.tabs.index.success.driver.${key}` as any)}
                </Text>
                <Text style={styles.successForecastDriverValue}>{formatNumber(value)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.successForecastSteps}>
            {successForecast.recovery_plan.steps.map((step) => (
              <View key={step} style={styles.successForecastStep}>
                <Ionicons name="checkmark-circle" size={14} color={theme.colors.accentMint} />
                <Text style={styles.successForecastStepText}>{step}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[
              styles.successForecastAction,
              successForecastToneValue === 'warn' && styles.successForecastActionWarn,
            ]}
            onPress={() => {
              if (successForecast.recovery_plan.primary_action === 'adjust_reminders') router.push('/profile' as never);
              else if (successForecast.recovery_plan.primary_action === 'log_meal') router.push('/scan' as never);
              else if (successForecast.recovery_plan.primary_action === 'move' || successForecast.recovery_plan.primary_action === 'complete_plan') router.push('/log' as never);
              else router.push('/coach' as never);
            }}
          >
            <Text style={styles.successForecastActionText}>
              {successForecastActionLabel(successForecast.recovery_plan.primary_action, locale)}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={theme.colors.textOnAccent} />
          </TouchableOpacity>
        </SurfaceCard>
      ) : null}

      {dynamicIntervention?.should_surface ? (
        <SurfaceCard style={[
          styles.dynamicInterventionCard,
          dynamicInterventionToneValue === 'good' && styles.dynamicInterventionCardGood,
          dynamicInterventionToneValue === 'warn' && styles.dynamicInterventionCardWarn,
        ]}>
          <View style={styles.dynamicInterventionHeader}>
            <View style={styles.dynamicInterventionIcon}>
              <Ionicons
                name={dynamicIntervention.priority === 'critical' ? 'alert-circle' : dynamicIntervention.priority === 'high' ? 'pulse' : 'sparkles'}
                size={18}
                color={dynamicInterventionToneValue === 'warn' ? theme.colors.accentAmber : theme.colors.accentMint}
              />
            </View>
            <View style={styles.dynamicInterventionCopy}>
              <Text style={styles.dynamicInterventionEyebrow}>INTERVENTION</Text>
              <Text style={styles.dynamicInterventionTitle}>{dynamicIntervention.title}</Text>
              <Text style={styles.dynamicInterventionBody}>{dynamicIntervention.body}</Text>
            </View>
          </View>
          {dynamicIntervention.recovery_steps.length > 0 ? (
            <View style={styles.dynamicInterventionSteps}>
              {dynamicIntervention.recovery_steps.map((step) => (
                <View key={step} style={styles.dynamicInterventionStep}>
                  <Ionicons name="arrow-forward-circle" size={14} color={theme.colors.accentCyan} />
                  <Text style={styles.dynamicInterventionStepText}>{step}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <TouchableOpacity
            style={[
              styles.dynamicInterventionAction,
              dynamicInterventionToneValue === 'warn' && styles.dynamicInterventionActionWarn,
            ]}
            onPress={() => {
              void recordInterventionEvent({
                ...buildInterventionEvent(dynamicIntervention, 'acted', 'today', { action_label: dynamicIntervention.action_label }),
                forecast_score: successForecast?.score,
              });
              if (dynamicIntervention.primary_action === 'adjust_reminders') router.push('/profile' as never);
              else if (dynamicIntervention.primary_action === 'log_meal') router.push('/scan' as never);
              else if (dynamicIntervention.primary_action === 'move' || dynamicIntervention.primary_action === 'complete_plan') router.push('/log' as never);
              else router.push('/coach' as never);
            }}
          >
            <Text style={styles.dynamicInterventionActionText}>{dynamicIntervention.action_label}</Text>
            <Ionicons name="chevron-forward" size={15} color={theme.colors.textOnAccent} />
          </TouchableOpacity>
        </SurfaceCard>
      ) : null}

      <View style={[styles.actionGrid, isCompact && styles.actionGridCompact]}>
        <TouchableOpacity style={[styles.primaryAction, isCompact && styles.primaryActionCompact]} onPress={() => router.push('/scan' as never)}>
          <AnimatedIonicon name="camera" size={20} color={theme.colors.textOnAccent} motion="pulse" />
          <Text style={styles.primaryActionText} i18nKey="screen.tabs.index.text.002" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryAction, isCompact && styles.secondaryActionCompact]}
          onPress={() => router.push({ pathname: '/scan', params: { mode: 'text' } } as never)}
          accessibilityRole="button"
          accessibilityLabel={t('screen.tabs.index.text.003')}
          accessibilityHint={t('screen.tabs.index.text.003.hint')}
          testID="dashboard-text-entry-button"
        >
          <AnimatedIonicon name="create-outline" size={18} color={theme.colors.accentMint} motion="float" />
          <View style={styles.secondaryActionCopy}>
            <Text style={styles.secondaryActionText} i18nKey="screen.tabs.index.text.003" />
            <Text style={styles.secondaryActionHint} i18nKey="screen.tabs.index.text.003.hint" />
          </View>
        </TouchableOpacity>
      </View>

      <SurfaceCard style={styles.todayPlanCard}>
        <View style={styles.todayPlanHeader}>
          <View style={styles.todayPlanCopy}>
            <Text style={styles.todayPlanEyebrow}>PLAN</Text>
            <Text style={styles.todayPlanTitle} i18nKey="screen.tabs.index.plan.title" />
            <Text style={styles.todayPlanBody}>{todayPlanBody}</Text>
            {todaySummaryHasPartialError ? (
              <Text style={styles.todayPlanWarning}>{t('screen.tabs.index.plan.partial')}</Text>
            ) : null}
            <Text style={styles.todayPlanGoal}>{t('screen.tabs.index.plan.goal', { goal: planGoalDescription })}</Text>
          </View>
          <View style={styles.todayPlanMetric}>
            <Text style={[styles.todayPlanMetricValue, planRemaining < 0 && styles.todayPlanMetricOver]}>
              {formatNumber(todayPlanMetricValue)}
            </Text>
            <Text style={styles.todayPlanMetricLabel}>{todayPlanMetricLabel}</Text>
          </View>
        </View>
        {visibleRoadmapItems.length > 0 && (
          <View style={styles.todayPlanRoadmapList}>
            {visibleRoadmapItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.todayPlanRoadmapItem, item.is_completed && styles.todayPlanRoadmapItemDone]}
                onPress={() => toggleRoadmapItem(item)}
                disabled={updatingRoadmapId === item.id}
              >
                <Ionicons
                  name={item.is_completed ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={item.is_completed ? theme.colors.accentMint : theme.colors.textMuted}
                />
                <View style={styles.todayPlanRoadmapCopy}>
                  <Text style={styles.todayPlanRoadmapTitle}>{item.task_title}</Text>
                  <Text style={styles.todayPlanRoadmapMeta}>
                    {t('screen.tabs.index.plan.roadmapMeta', {
                      minutes: item.duration_min,
                      kcal: formatNumber(item.estimated_kcal),
                    })}
                  </Text>
                </View>
                <Text style={styles.todayPlanRoadmapAction}>
                  {item.is_completed ? t('screen.tabs.index.plan.done') : t('screen.tabs.index.plan.markDone')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={styles.todayPlanActions}>
          <TouchableOpacity style={styles.todayPlanPrimary} onPress={() => router.push('/log' as never)}>
            <Text style={styles.todayPlanPrimaryText} i18nKey="screen.tabs.index.plan.action" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.todayPlanSecondary} onPress={() => router.push('/coach' as never)}>
            <Text style={styles.todayPlanSecondaryText}>{t('screen.tabs.index.coach.open')}</Text>
          </TouchableOpacity>
        </View>
      </SurfaceCard>

      <SurfaceCard style={[styles.cockpitCard, isCompact && styles.cockpitCardCompact]}>
        <View style={[styles.cockpitMain, isCompact && styles.cockpitMainCompact]}>
          <CaloriesRing consumed={consumed} burned={burned} target={target} compact={isCompact} />
          <View style={[styles.cockpitSide, isCompact && styles.cockpitSideCompact]}>
            <View style={[styles.targetRow, isCompact && styles.targetRowCompact]}>
              <Text style={styles.targetLabel} i18nKey="screen.tabs.index.text.004" />
              <Text style={[styles.targetValue, isCompact && styles.targetValueCompact]}>{formatNumber(target)} kcal</Text>
            </View>
            <View style={[styles.targetRow, isCompact && styles.targetRowCompact]}>
              <Text style={styles.targetLabel} i18nKey="screen.tabs.index.text.005" />
              <Text style={[styles.targetValue, isCompact && styles.targetValueCompact]}>{formatNumber(consumed)}</Text>
            </View>
            <View style={[styles.targetRow, isCompact && styles.targetRowCompact]}>
              <Text style={styles.targetLabel} i18nKey="screen.tabs.index.text.006" />
              <Text style={[styles.targetValueBurned, isCompact && styles.targetValueCompact]}>-{formatNumber(burned)}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.macroRow, isCompact && styles.macroRowCompact]}>
          <MacroPill label="screen.tabs.index.label.001" value={`${formatNumber(protein)}g`} color={theme.colors.accentCoral} />
          <MacroPill label="screen.tabs.index.label.002" value={`${formatNumber(carbs)}g`} color={theme.colors.accentCyan} />
          <MacroPill label="screen.tabs.index.label.003" value={`${formatNumber(fat)}g`} color={theme.colors.accentAmber} />
        </View>

        <View style={styles.focusStrip}>
          {dailyFocusItems.map((item) => (
            <DailyFocusPill key={item.key} item={item} />
          ))}
        </View>

        <View style={styles.qualityRow}>
          <QualityPill label="screen.tabs.index.label.004" value={`${formatNumber(fiber)} / ${qualityTargets.fiber_g_min}g`} active={qualityCoverageItems > 0} />
          <QualityPill label="screen.tabs.index.label.005" value={`${formatNumber(sodium)} / ${qualityTargets.sodium_mg_max}mg`} active={qualityCoverageItems > 0} over={sodium > qualityTargets.sodium_mg_max} />
          <QualityPill label="screen.tabs.index.label.006" value={`${formatNumber(sugar)} / ${qualityTargets.sugar_g_max}g`} active={qualityCoverageItems > 0} over={sugar > qualityTargets.sugar_g_max} />
          <QualityPill label="screen.tabs.index.label.007" value={`${formatNumber(saturatedFat)} / ${qualityTargets.saturated_fat_g_max}g`} active={qualityCoverageItems > 0} over={saturatedFat > qualityTargets.saturated_fat_g_max} />
        </View>
        {qualityCoverageItems === 0 && (
          <Text style={styles.qualityCoverageNote} i18nKey="screen.tabs.index.text.007" />
        )}
      </SurfaceCard>

      <SurfaceCard style={styles.goalPlanCard}>
        <View style={styles.goalPlanHeader}>
          <View style={styles.goalPlanHeaderCopy}>
            <Text style={styles.goalPlanEyebrow} i18nKey="screen.tabs.index.text.008" />
            <Text style={styles.goalPlanTitle}>
              {t('screen.tabs.index.goal.todayTarget', { kcal: formatNumber(target) })}
            </Text>
          </View>
          {activeGoalPlan?.safety_status && (
            <View style={[
              styles.goalPlanStatusPill,
              activeGoalPlan.safety_status !== 'ok' && styles.goalPlanStatusPillWarn,
            ]}>
              <Text style={[
                styles.goalPlanStatusText,
                activeGoalPlan.safety_status !== 'ok' && styles.goalPlanStatusTextWarn,
              ]}>
                {statusLabel(activeGoalPlan.safety_status, locale)}
              </Text>
            </View>
          )}
        </View>

        {profileMeta ? (
          <>
            {activeGoalPlan?.computed_daily_calorie_target ? (
              <View style={styles.activeGoalPlanBox}>
                <Text style={styles.activeGoalPlanTitle}>{describeGoalPlan(activeGoalPlan, locale)}</Text>
                <Text style={styles.activeGoalPlanMeta}>
                  {t('screen.tabs.index.goal.usingTarget', { kcal: formatNumber(activeGoalPlan.computed_daily_calorie_target) })}
                  {activeGoalPlan.weekly_rate_kg ? t('screen.tabs.index.goal.weeklyRate', { rate: activeGoalPlan.weekly_rate_kg }) : ''}
                </Text>
                {!!activeGoalPlan.warnings?.length && (
                  <Text style={styles.activeGoalPlanWarning}>{activeGoalPlan.warnings[0]}</Text>
                )}
              </View>
            ) : (
              <Text style={styles.goalPlanBody} i18nKey="screen.tabs.index.text.009" />
            )}

            <Text style={styles.goalPlanSubhead} i18nKey="screen.tabs.index.text.010" />
            <View style={styles.goalOptionsRow}>
              {QUICK_GOAL_OPTIONS.map((opt) => {
                const selected = selectedGoal === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setSelectedGoal(opt.key)}
                    style={[styles.goalOption, selected && styles.goalOptionSelected]}
                  >
                    <Text style={[styles.goalOptionText, selected && styles.goalOptionTextSelected]}>{formatQuickGoalLabel(opt, locale)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.goalPlanPreview}>
              <View style={styles.goalPlanPreviewCopy}>
                <Text style={styles.goalPlanPreviewTitle}>
                  {t('screen.tabs.index.goal.readyToSave', { plan: describeGoalPlan(selectedGoalPlan, locale) })}
                </Text>
                <Text style={styles.goalPlanPreviewText}>
                  {selectedGoalOption.type === 'maintain'
                    ? t('screen.tabs.index.goal.maintainPreview')
                    : t('screen.tabs.index.goal.deltaPreview', {
                      sign: selectedGoalOption.type === 'loss' ? '-' : '+',
                      kcal: formatNumber(selectedDailyDelta),
                    })}
                </Text>
              </View>
              <TouchableOpacity style={[styles.applyButton, isApplyingTarget && styles.disabledButton]} onPress={applySelectedTarget} disabled={isApplyingTarget}>
                <Text style={styles.applyButtonText}>{isApplyingTarget ? t('common.saving') : t('common.save')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.goalPlanFootnote} i18nKey="screen.tabs.index.text.011" />
          </>
        ) : (
          <Text style={styles.goalPlanBody} i18nKey="screen.tabs.index.text.012" />
        )}
      </SurfaceCard>

      <SurfaceCard style={[
        styles.movementCard,
        movementPlan?.tone === 'caution' && styles.movementCardCaution,
        movementPlan?.tone === 'surplus' && styles.movementCardSurplus,
        movementPlan?.tone === 'fuel' && styles.movementCardFuel,
      ]}>
        <View style={styles.movementHeader}>
          <View style={styles.movementTitleWrap}>
            <AnimatedIonicon
              name="walk-outline"
              size={18}
              color={movementPlan?.tone === 'caution' || movementPlan?.tone === 'surplus' ? theme.colors.accentAmber : theme.colors.accentMint}
              motion="float"
            />
            <Text style={styles.movementTitle} i18nKey="screen.tabs.index.text.013" />
          </View>
          {movementPlan && (
            <View style={styles.movementSourcePill}>
              <Text style={styles.movementSourceText}>{movementSourceLabel}</Text>
            </View>
          )}
        </View>

        {movementPlan ? (
          <>
            <View style={styles.movementNextAction}>
              <Text style={styles.movementActionLabel} i18nKey="screen.tabs.index.text.014" />
              <Text style={styles.movementPlanTitle}>{movementPlan.title}</Text>
              <View style={styles.movementMetaRow}>
                <View style={styles.movementMetaPill}>
                  <Ionicons name="time-outline" size={13} color={theme.colors.accentMint} />
                  <Text style={styles.movementMetaText}>{movementPlan.duration_min} {t('screen.tabs.index.unit.minutes')}</Text>
                </View>
                <View style={styles.movementMetaPill}>
                  <Ionicons name="flame-outline" size={13} color={theme.colors.accentAmber} />
                  <Text style={styles.movementMetaText}>~{formatNumber(movementPlan.estimated_kcal)} kcal</Text>
                </View>
              </View>
            </View>

            <Text style={styles.movementCalorieStatus}>{movementPlan.calorie_status}</Text>
            <Text style={styles.movementPlanDetail}>{movementPlan.detail}</Text>

            <View style={styles.movementProgressHeader}>
              <Text style={styles.movementProgressLabel} i18nKey="screen.tabs.index.text.015" />
              <Text style={styles.movementMetric}>
                {formatNumber(activityMinutes)}/{formatNumber(movementPlan.daily_minutes_target)} {t('screen.tabs.index.unit.minutes')}
              </Text>
            </View>
            <View style={styles.movementProgressBar}>
              <View style={[styles.movementProgressFill, { width: `${movementProgressPct}%` as any }]} />
            </View>

            <View style={styles.movementActionRow}>
              <TouchableOpacity
                style={[styles.movementLogButton, (isLoggingMovement || movementPlanCompleted) && styles.disabledButton]}
                onPress={logMovementPlan}
                disabled={isLoggingMovement || movementPlanCompleted}
              >
                <AnimatedIonicon name="checkmark" size={16} color={theme.colors.textOnAccent} motion="pulse" active={!movementPlanCompleted} />
                <Text style={styles.movementLogText}>{movementButtonLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.movementSecondaryButton} onPress={() => router.push('/profile' as never)}>
                <Ionicons name="options-outline" size={15} color={theme.colors.accentMint} />
                <Text style={styles.movementSecondaryText} i18nKey="screen.tabs.index.text.016" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.movementSecondaryButton} onPress={() => router.push('/log' as never)}>
                <Ionicons name="create-outline" size={15} color={theme.colors.accentMint} />
                <Text style={styles.movementSecondaryText} i18nKey="screen.tabs.index.text.003" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.movementBodyRow}>
            <Text style={styles.movementPlanDetail} i18nKey="screen.tabs.index.text.017" />
            <TouchableOpacity style={styles.movementLogButton} onPress={() => router.push('/profile' as never)}>
              <Text style={styles.movementLogText} i18nKey="screen.tabs.index.text.018" />
            </TouchableOpacity>
          </View>
        )}
      </SurfaceCard>

      {safetyCard && nextAction.kind !== 'profile' && (
        <SurfaceCard style={[styles.safetySetupCard, safetyCard.tone === 'review' && styles.medicalReviewCard]}>
          <View style={styles.safetySetupHeader}>
            <Ionicons
              name={safetyCard.icon}
              size={18}
              color={safetyCard.tone === 'review' ? theme.colors.accentAmber : theme.colors.accentMint}
            />
            <Text style={styles.safetySetupTitle}>{safetyCard.title}</Text>
          </View>
          <Text style={styles.safetySetupBody}>{safetyCard.body}</Text>
          <TouchableOpacity style={styles.safetySetupButton} onPress={() => router.push('/profile' as never)}>
            <Text style={styles.safetySetupButtonText}>{safetyCard.action}</Text>
            <Ionicons name="chevron-forward" size={15} color={theme.colors.textOnAccent} />
          </TouchableOpacity>
        </SurfaceCard>
      )}

      {visibleNudges.length > 0 && (
      <View style={styles.nudgeRow}>
        {visibleNudges.map((nudge) => (
          <View key={nudge.title} style={[styles.nudgeChip, styles[`${nudge.tone}Nudge`]]}>
            <Ionicons name={nudge.icon} size={16} color={nudge.tone === 'warn' ? theme.colors.accentAmber : theme.colors.accentMint} />
            <View style={styles.nudgeCopy}>
              <Text style={styles.nudgeTitle}>{nudge.title}</Text>
              <Text style={styles.nudgeBody}>{nudge.body}</Text>
            </View>
          </View>
        ))}
      </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} i18nKey="screen.tabs.index.text.019" />
        <TouchableOpacity onPress={() => router.push('/log' as never)}>
          <Text style={styles.sectionLink} i18nKey="screen.tabs.index.text.020" />
        </TouchableOpacity>
      </View>

      {latestMeals.length > 0 ? (
        <View style={styles.mealList}>
          {MEAL_ORDER.map((meal) => {
            const mealLogs = logsByMeal[meal];
            const mealCalories = mealLogs.reduce((sum, log) => sum + safeNumber(log.calories), 0);
            return (
              <SurfaceCard key={meal} style={styles.mealCard}>
                <Image source={mealIllustration} style={styles.mealImage} resizeMode="cover" />
                <View style={styles.mealContent}>
                  <View style={styles.mealTopRow}>
                    <View>
                      <Text style={styles.mealName}>{t(MEAL_LABEL_KEYS[meal])}</Text>
                      <Text style={styles.mealHint}>{t(MEAL_HINT_KEYS[meal])}</Text>
                    </View>
                    <Text style={styles.mealCalories}>{formatNumber(mealCalories)} kcal</Text>
                  </View>
                  {mealLogs.length > 0 ? (
                    <Text style={styles.mealItems} numberOfLines={2}>
                      {mealLogs.map((log) => log.name_vi ?? log.name).join(', ')}
                    </Text>
                  ) : (
                    <Text style={styles.mealItemsMuted} i18nKey="screen.tabs.index.text.021" />
                  )}
                </View>
              </SurfaceCard>
            );
          })}
        </View>
      ) : (
        <EmptyState
          imageSource={todayHeroIllustration}
          icon="🍚"
          title="screen.tabs.index.title.001"
          description="screen.tabs.index.description.001"
        />
      )}

      <View style={styles.quickLinks}>
        <QuickLink icon="body" label="screen.tabs.index.label.008" onPress={() => router.push('/progress' as never)} />
        <QuickLink icon="stats-chart" label="screen.tabs.index.label.009" onPress={() => router.push('/insights' as never)} />
        <QuickLink icon="ribbon" label="screen.tabs.index.label.010" onPress={() => router.push('/achievements' as never)} />
      </View>
      <RewardToast reward={reward} onHide={() => setReward(null)} />
    </ScreenShell>
  );
}

function MacroPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.macroPill}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

function DailyFocusPill({ item }: { item: DailyFocusItem }) {
  const accent = focusToneColor(item.tone);
  const toneStyle = item.tone === 'good'
    ? styles.focusPillGood
    : item.tone === 'warn'
      ? styles.focusPillWarn
      : item.tone === 'muted'
        ? styles.focusPillMuted
        : styles.focusPillInfo;

  return (
    <View style={[styles.focusPill, toneStyle]}>
      <View style={styles.focusHeader}>
        <Ionicons name={item.icon} size={15} color={accent} />
        <Text style={styles.focusLabel}>{item.label}</Text>
      </View>
      <Text style={styles.focusValue} numberOfLines={1}>{item.value}</Text>
      <Text style={styles.focusHint} numberOfLines={2}>{item.hint}</Text>
      <View style={styles.focusProgressTrack}>
        <View style={[styles.focusProgressFill, { width: `${Math.round(item.progress * 100)}%` as any, backgroundColor: accent }]} />
      </View>
    </View>
  );
}

function QualityPill({ label, value, active, over }: { label: string; value: string; active: boolean; over?: boolean }) {
  return (
    <View style={[styles.qualityPill, !active && styles.qualityPillMuted, over && styles.qualityPillOver]}>
      <Text style={styles.qualityLabel}>{label}</Text>
      <Text style={styles.qualityValue}>{active ? value : '-'}</Text>
    </View>
  );
}

function QuickLink({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickLink} onPress={onPress}>
      <Ionicons name={icon} size={18} color={theme.colors.accentCyan} />
      <Text style={styles.quickLinkText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  screen: {
    paddingBottom: 28,
  },
  screenCompact: {
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 18,
  },
  headerRowCompact: {
    gap: 8,
    marginBottom: 12,
  },
  headerCopy: {
    flex: 1,
  },
  dashboardTitle: {
    color: colors.text,
    fontSize: 38,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.35,
    marginBottom: 10,
  },
  dashboardTitleCompact: {
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -1,
    marginBottom: 6,
  },
  heroBody: {
    maxWidth: 520,
  },
  heroBodyCompact: {
    fontSize: 13,
    lineHeight: 19,
  },
  streakPill: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 13,
    backgroundColor: colors.surfaceWarning,
    borderWidth: 1,
    borderColor: colors.borderWarning,
  },
  streakPillCompact: {
    minHeight: 34,
    paddingHorizontal: 10,
  },
  streakText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  nextActionCard: {
    marginBottom: 16,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 15,
    overflow: 'hidden',
  },
  nextActionCardCompact: {
    padding: 12,
    gap: 10,
  },
  nextActionCardGood: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  nextActionCardWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  nextActionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  nextActionIconWrapCompact: {
    width: 36,
    height: 36,
  },
  nextActionCopy: {
    flex: 1,
    minWidth: 180,
  },
  nextActionCopyCompact: {
    minWidth: 0,
    flexBasis: 0,
  },
  nextActionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  nextActionTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  nextActionTitleCompact: {
    fontSize: 16,
    lineHeight: 20,
  },
  nextActionBody: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  nextActionBodyCompact: {
    lineHeight: 16,
  },
  nextActionButton: {
    minHeight: 44,
    minWidth: 122,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextActionButtonCompact: {
    minHeight: 36,
    minWidth: 92,
    paddingHorizontal: 10,
  },
  nextActionButtonText: {
    color: colors.textOnAccent,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  coachBridgeCard: {
    marginBottom: 16,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  coachBridgeGood: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  coachBridgeWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  coachBridgeCopy: {
    flex: 1,
    minWidth: 0,
  },
  coachBridgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  coachBridgeEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
  },
  coachBridgeStatus: {
    color: colors.accentCyan,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
  },
  coachBridgeStatusWarn: {
    color: colors.accentAmber,
  },
  coachBridgeTitle: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  coachBridgeBody: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 4,
  },
  coachBridgeButton: {
    minHeight: 42,
    minWidth: 96,
    borderRadius: 999,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachBridgeButtonText: {
    color: colors.textOnAccent,
    fontSize: 12,
    fontWeight: '900',
  },
  healthScoreCard: {
    marginBottom: 16,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    gap: 13,
  },
  healthScoreHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  healthScoreCopy: {
    flex: 1,
    minWidth: 0,
  },
  healthScoreEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  healthScoreTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  healthScoreBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  healthScoreBadge: {
    minWidth: 76,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  healthScoreValue: {
    color: colors.accentMint,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
  },
  healthScoreUnit: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  healthTrendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  healthTrendPill: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surface,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  healthTrendPillGood: {
    borderColor: colors.borderSuccess,
  },
  healthTrendPillWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  healthTrendText: {
    color: colors.accentMint,
    fontSize: 12,
    fontWeight: '900',
  },
  healthTrendTextWarn: {
    color: colors.accentAmber,
  },
  healthAdherenceText: {
    flexShrink: 1,
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  healthScoreBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  healthScoreMetric: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 136,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 10,
  },
  healthScoreMetricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  healthScoreMetricLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  healthScoreMetricValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  healthScoreTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.surfacePressed,
    overflow: 'hidden',
  },
  healthScoreFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accentMint,
  },
  healthSignalList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  healthSignalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  healthSignalText: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  healthScoreAction: {
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  healthScoreActionText: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontWeight: '900',
  },
  successForecastCard: {
    marginBottom: 16,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    gap: 12,
  },
  successForecastCardGood: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  successForecastCardWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  successForecastHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  successForecastCopy: {
    flex: 1,
    minWidth: 0,
  },
  successForecastEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  successForecastTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  successForecastBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  successForecastBadge: {
    minWidth: 76,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  successForecastValue: {
    color: colors.accentMint,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
  },
  successForecastValueWarn: {
    color: colors.accentAmber,
  },
  successForecastUnit: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  successForecastDriverGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  successForecastDriver: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 92,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  successForecastDriverLabel: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  successForecastDriverValue: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  successForecastSteps: {
    gap: 7,
  },
  successForecastStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  successForecastStepText: {
    flex: 1,
    minWidth: 0,
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  successForecastAction: {
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  successForecastActionWarn: {
    backgroundColor: colors.accentAmber,
  },
  successForecastActionText: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontWeight: '900',
  },
  dynamicInterventionCard: {
    marginBottom: 16,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    gap: 12,
  },
  dynamicInterventionCardGood: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  dynamicInterventionCardWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  dynamicInterventionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dynamicInterventionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dynamicInterventionCopy: {
    flex: 1,
    minWidth: 0,
  },
  dynamicInterventionEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  dynamicInterventionTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  dynamicInterventionBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  dynamicInterventionSteps: {
    gap: 7,
  },
  dynamicInterventionStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  dynamicInterventionStepText: {
    flex: 1,
    minWidth: 0,
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  dynamicInterventionAction: {
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dynamicInterventionActionWarn: {
    backgroundColor: colors.accentAmber,
  },
  dynamicInterventionActionText: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontWeight: '900',
  },
  todayPlanCard: {
    marginBottom: 16,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    gap: 12,
  },
  todayPlanHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  todayPlanCopy: {
    flex: 1,
    minWidth: 0,
  },
  todayPlanEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  todayPlanTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  todayPlanBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  todayPlanGoal: {
    color: colors.accentCyan,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 6,
  },
  todayPlanWarning: {
    color: colors.accentAmber,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 5,
  },
  todayPlanMetric: {
    minWidth: 78,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  todayPlanMetricValue: {
    color: colors.accentMint,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
  },
  todayPlanMetricOver: {
    color: colors.accentCoral,
  },
  todayPlanMetricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  todayPlanRoadmapList: {
    gap: 8,
  },
  todayPlanRoadmapItem: {
    minHeight: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  todayPlanRoadmapItemDone: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  todayPlanRoadmapCopy: {
    flex: 1,
    minWidth: 0,
  },
  todayPlanRoadmapTitle: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  todayPlanRoadmapMeta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  todayPlanRoadmapAction: {
    color: colors.accentMint,
    fontSize: 11,
    fontWeight: '900',
  },
  todayPlanActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  todayPlanPrimary: {
    minHeight: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayPlanPrimaryText: {
    color: colors.textOnAccent,
    fontSize: 12,
    fontWeight: '900',
  },
  todayPlanSecondary: {
    minHeight: 40,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayPlanSecondaryText: {
    color: colors.info,
    fontSize: 12,
    fontWeight: '900',
  },
  cockpitCard: {
    marginBottom: 20,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    padding: 22,
  },
  cockpitCardCompact: {
    marginBottom: 12,
    padding: 12,
  },
  cockpitMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cockpitMainCompact: {
    gap: 8,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 46,
  },
  ringValueCompact: {
    fontSize: 32,
    lineHeight: 38,
  },
  ringLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  ringLabelCompact: {
    fontSize: 11,
  },
  ringRemain: {
    color: colors.accentMint,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 7,
  },
  ringRemainCompact: {
    fontSize: 12,
    marginTop: 5,
  },
  ringRemainOver: {
    color: colors.accentCoral,
  },
  cockpitSide: {
    flex: 1,
    gap: 8,
  },
  cockpitSideCompact: {
    gap: 6,
  },
  targetRow: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  targetRowCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  targetLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  targetValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  targetValueCompact: {
    fontSize: 16,
  },
  targetValueBurned: {
    color: colors.accentAmber,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  macroRowCompact: {
    gap: 6,
    marginTop: 12,
  },
  macroPill: {
    flex: 1,
    minHeight: 64,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 12,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 5,
  },
  macroValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  macroLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  focusStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
    marginTop: 18,
  },
  focusPill: {
    flex: 1,
    minWidth: 112,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 12,
  },
  focusPillGood: {
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
  },
  focusPillInfo: {
    backgroundColor: colors.surfaceInfo,
    borderColor: colors.borderInfo,
  },
  focusPillWarn: {
    backgroundColor: colors.surfaceWarning,
    borderColor: colors.borderWarning,
  },
  focusPillMuted: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderSubtle,
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  focusLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  focusValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  focusHint: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
    minHeight: 32,
    marginTop: 3,
  },
  focusProgressTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.progressBg,
    marginTop: 8,
  },
  focusProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  qualityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
    marginTop: 14,
  },
  qualityPill: {
    minWidth: '47%',
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  qualityPillMuted: {
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceMuted,
  },
  qualityPillOver: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  qualityLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  qualityValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  qualityCoverageNote: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 11,
    marginBottom: 16,
  },
  actionGridCompact: {
    gap: 8,
    marginBottom: 10,
  },
  movementCard: {
    marginBottom: 16,
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
    gap: 12,
  },
  movementCardCaution: {
    backgroundColor: colors.surfaceWarning,
    borderColor: colors.borderWarning,
  },
  movementCardSurplus: {
    backgroundColor: colors.surfaceWarning,
    borderColor: colors.borderWarning,
  },
  movementCardFuel: {
    backgroundColor: colors.surfaceInfo,
    borderColor: colors.borderInfo,
  },
  movementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  movementTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  movementTitle: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  movementMetric: {
    color: colors.accentMint,
    fontSize: 12,
    fontWeight: '900',
  },
  movementSourcePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  movementSourceText: {
    color: colors.accentMint,
    fontSize: 11,
    fontWeight: '900',
  },
  movementNextAction: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    padding: 13,
    gap: 9,
  },
  movementActionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  movementMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  movementMetaPill: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  movementMetaText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  movementProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginTop: 3,
  },
  movementProgressLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  movementProgressBar: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.progressBg,
  },
  movementProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accentMint,
  },
  movementBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  movementCopy: {
    flex: 1,
    minWidth: 0,
  },
  movementPlanTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  movementCalorieStatus: {
    color: colors.accentCyan,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  movementPlanDetail: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 19,
  },
  movementPlanMeta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  movementLogButton: {
    minHeight: 42,
    maxWidth: '100%',
    flexShrink: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  movementActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxWidth: '100%',
    gap: 8,
    marginTop: 2,
  },
  movementSecondaryButton: {
    minHeight: 42,
    maxWidth: '100%',
    flexShrink: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  movementSecondaryText: {
    color: colors.accentMint,
    fontSize: 12,
    fontWeight: '900',
  },
  movementLogText: {
    color: colors.textOnAccent,
    fontSize: 12,
    fontWeight: '900',
  },
  safetySetupCard: {
    gap: 10,
    marginBottom: 14,
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
  },
  medicalReviewCard: {
    backgroundColor: colors.surfaceWarning,
    borderColor: colors.borderWarning,
  },
  safetySetupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  safetySetupTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  safetySetupBody: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 19,
  },
  safetySetupButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  safetySetupButtonText: {
    color: colors.textOnAccent,
    fontSize: 12,
    fontWeight: '900',
  },
  primaryAction: {
    flex: 1.25,
    minHeight: 58,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionCompact: {
    minHeight: 50,
    gap: 6,
  },
  primaryActionText: {
    color: colors.textOnAccent,
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryAction: {
    flex: 1,
    minHeight: 58,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryActionCompact: {
    minHeight: 50,
    gap: 6,
  },
  secondaryActionText: {
    color: colors.accentMint,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryActionCopy: {
    flexShrink: 1,
    alignItems: 'flex-start',
  },
  secondaryActionHint: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 1,
  },
  nudgeRow: {
    gap: 10,
    marginBottom: 18,
  },
  nudgeChip: {
    minHeight: 62,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  goodNudge: {
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
  },
  infoNudge: {
    backgroundColor: colors.surfaceInfo,
    borderColor: colors.borderInfo,
  },
  warnNudge: {
    backgroundColor: colors.surfaceWarning,
    borderColor: colors.borderWarning,
  },
  nudgeCopy: {
    flex: 1,
  },
  nudgeTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  nudgeBody: {
    color: colors.textSoft,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionLink: {
    color: colors.accentCyan,
    fontSize: 13,
    fontWeight: '800',
  },
  mealList: {
    gap: 12,
  },
  mealCard: {
    flexDirection: 'row',
    gap: 13,
    padding: 13,
  },
  mealImage: {
    width: 82,
    height: 82,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
  },
  mealContent: {
    flex: 1,
    justifyContent: 'center',
  },
  mealTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'flex-start',
  },
  mealName: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  mealHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  mealCalories: {
    color: colors.accentMint,
    fontSize: 13,
    fontWeight: '900',
  },
  mealItems: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  mealItemsMuted: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 8,
  },
  quickLinks: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  quickLink: {
    flex: 1,
    minHeight: 50,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  quickLinkText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  goalPlanCard: {
    marginBottom: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSuccess,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
  },
  goalPlanHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  goalPlanHeaderCopy: {
    flex: 1,
  },
  goalPlanEyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  goalPlanTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  goalPlanBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  goalPlanStatusPill: {
    minHeight: 28,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalPlanStatusPillWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  goalPlanStatusText: {
    color: colors.accentMint,
    fontSize: 12,
    fontWeight: '900',
  },
  goalPlanStatusTextWarn: {
    color: colors.accentAmber,
  },
  activeGoalPlanBox: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    padding: 10,
    gap: 4,
  },
  activeGoalPlanTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  activeGoalPlanMeta: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  activeGoalPlanWarning: {
    color: colors.accentAmber,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  goalPlanSubhead: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 12,
  },
  goalOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  goalOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  goalOptionSelected: {
    backgroundColor: colors.accentMint,
    borderColor: colors.borderSuccess,
  },
  goalOptionText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  goalOptionTextSelected: {
    color: colors.textOnAccent,
  },
  goalPlanPreview: {
    marginTop: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  goalPlanPreviewCopy: {
    flex: 1,
    minWidth: 180,
  },
  goalPlanPreviewTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  goalPlanPreviewText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  goalPlanFootnote: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  applyButton: {
    minWidth: 108,
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    color: colors.textOnAccent,
    fontSize: 14,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.6,
  },
}));


