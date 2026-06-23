import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
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
import { EmptyState } from '../../components/empty-state';
import { createThemedStyles, useAppTheme } from '../../components/theme';
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
  }, [authLoading, fetchActivityLogs, fetchBehaviorMemory, fetchProfileMeta, fetchReminderEffectiveness, fetchSummary, fetchTodaySummary, token]);

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

  const GOAL_PRESET_KEYS: Record<'lose' | 'maintain' | 'gain', string> = {
    lose: 'loss_0.5',
    maintain: 'maintain',
    gain: 'gain_0.25',
  };

  async function applyGoalPreset(preset: 'lose' | 'maintain' | 'gain') {
    const option = QUICK_GOAL_OPTIONS.find((o) => o.key === GOAL_PRESET_KEYS[preset]) ?? QUICK_GOAL_OPTIONS[3];
    setIsApplyingTarget(true);
    try {
      const res = await apiClient.patch<User>('/user/profile', {
        goal: goalFromQuickOption(option.type),
        goal_plan: buildQuickGoalPlan(option),
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
        full_name: res.data.full_name,
      });
      await Promise.all([
        fetchDailyLog(),
        fetchRecommendations().catch(() => {}),
        fetchWeeklyInsights().catch(() => {}),
      ]);
    } catch {
      // silently fail â€” ring stays at current target
    } finally {
      setIsApplyingTarget(false);
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


  // Header date: use Intl to avoid hardcoded locale strings in source
  const todayDateObj = new Date();
  const intlLocale = locale === 'vi' ? 'vi-VN' : 'en-US';
  const headerDateLabel = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'long', day: 'numeric', month: 'numeric',
  }).format(todayDateObj);

  // User first name (last word of full_name = Vietnamese given name)
  const firstName = profileMeta?.full_name?.trim().split(/\s+/).pop() ?? '';

  // Macro targets derived from calorie target
  const proteinTargetG = buildProteinTarget(profileMeta?.goal, profileMeta?.goal_plan?.direction, profileMeta?.weight_kg);
  const carbsTargetG = Math.round((target * 0.5) / 4);
  const fatTargetG = Math.round((target * 0.25) / 9);

  // Active preset from user saved goal plan direction
  const activeGoalPreset: 'lose' | 'maintain' | 'gain' =
    profileMeta?.goal_plan?.direction === 'loss' ? 'lose' :
    profileMeta?.goal_plan?.direction === 'gain' ? 'gain' : 'maintain';

  return (
    <ScreenShell contentStyle={styles.screen}>

      {/* 1. Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerDate, { color: colors.accentCyan }]}>{headerDateLabel}</Text>
          <Text style={[styles.headerGreeting, { color: colors.text }]}>
            {firstName
              ? t('screen.tabs.index.hifi.header.greeting' as any, { name: firstName })
              : t('screen.tabs.index.hero.title')}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.streakPill, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          onPress={() => router.push('/achievements' as never)}
        >
          <Ionicons name="flame" size={13} color={colors.accentAmber} />
          <Text style={[styles.streakText, { color: colors.text }]}> {displayStreak}</Text>
        </TouchableOpacity>
      </View>

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

      {/* 3. Hero calorie ring */}
      <SurfaceCard revealDelay={40} style={[styles.heroCard, { padding: 22 }]}>
        <CaloriesRingHero consumed={consumed} burned={burned} target={target} />
      </SurfaceCard>

      {/* 4. Preset goal chips */}
      <View style={styles.presetRow}>
        {(['lose', 'maintain', 'gain'] as const).map((preset) => {
          const active = activeGoalPreset === preset;
          return (
            <TouchableOpacity
              key={preset}
              style={[
                styles.presetChip,
                active
                  ? [styles.presetChipActive, { backgroundColor: colors.surfaceAlt, borderColor: colors.surfaceAlt }]
                  : { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                isApplyingTarget && styles.disabledButton,
              ]}
              onPress={() => { void applyGoalPreset(preset); }}
              disabled={isApplyingTarget}
            >
              <Text style={[styles.presetChipText, { color: active ? colors.accentMint : colors.textSoft }]}>
                {t(`screen.tabs.index.hifi.preset.${preset}` as any)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
        <TouchableOpacity onPress={() => router.push('/log' as never)}>
          <Text style={[styles.sectionLink, { color: colors.accentCyan }]}>
            {t('screen.tabs.index.hifi.meals.viewLog' as any)}
          </Text>
        </TouchableOpacity>
      </View>
      {logs.length > 0 ? (
        <SurfaceCard revealDelay={180} style={[styles.mealListCard, { borderRadius: 20 }]}>
          {logs.slice(0, 5).map((log, idx) => (
            <MealListRow
              key={(log as any).id ?? idx}
              log={log}
              isLast={idx === Math.min(logs.length, 5) - 1}
            />
          ))}
        </SurfaceCard>
      ) : (
        <EmptyState
          imageSource={todayHeroIllustration}
          icon="restaurant-outline"
          title="screen.tabs.index.title.001"
          description="screen.tabs.index.description.001"
        />
      )}

      {/* 9. Shortcut tiles */}
      <View style={styles.shortcutGrid}>
        <ShortcutTile
          iconName="trending-up-outline"
          labelKey={'screen.tabs.index.hifi.shortcut.progress' as any}
          onPress={() => router.push('/progress' as never)}
        />
        <ShortcutTile
          iconName="search-outline"
          labelKey={'screen.tabs.index.hifi.shortcut.insights' as any}
          onPress={() => router.push('/insights' as never)}
        />
        <ShortcutTile
          iconName="trophy-outline"
          labelKey={'screen.tabs.index.hifi.shortcut.achievements' as any}
          onPress={() => router.push('/achievements' as never)}
        />
        <ShortcutTile
          iconName="heart-outline"
          labelKey={'screen.tabs.index.hifi.shortcut.health' as any}
          onPress={() => router.push('/progress' as never)}
        />
      </View>

      <RewardToast reward={reward} onHide={() => setReward(null)} />
    </ScreenShell>
  );
}

// --- Sub-components ---

const RING_GRAD_START = '#7cc04f';
const RING_GRAD_END = '#4f9b6e';
const NEXT_STEP_GRAD: [string, string] = ['#1d291f', '#27331f'];

function CaloriesRingHero({
  consumed,
  burned,
  target,
}: {
  consumed: number;
  burned: number;
  target: number;
}) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const safeConsumed = safeNumber(consumed);
  const safeBurned = safeNumber(burned);
  const safeTarget = safePositiveNumber(target, 1800);
  const remaining = Math.max(0, safeTarget - safeConsumed);
  const net = safeConsumed - safeBurned;
  const progress = clampProgress(safeConsumed / safeTarget);
  const SIZE = 128;
  const STROKE = 13;
  const RADIUS = 56;
  const CIRC = 2 * Math.PI * RADIUS;

  return (
    <View style={styles.ringHeroRow}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Defs>
            <SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={RING_GRAD_START} />
              <Stop offset="1" stopColor={RING_GRAD_END} />
            </SvgLinearGradient>
          </Defs>
          <Circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            stroke={colors.progressBg} strokeWidth={STROKE} fill="none"
          />
          <Circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            stroke="url(#ringGrad)" strokeWidth={STROKE} fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC}`}
            strokeDashoffset={CIRC * (1 - progress)}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.ringHeroCenter}>
          <Text style={[styles.ringHeroValue, { color: colors.text }]}>
            {formatNumber(remaining)}
          </Text>
          <Text style={[styles.ringHeroLabel, { color: colors.textMuted }]}>
            {t('screen.tabs.index.hifi.ring.remainingOf' as any, { target: formatNumber(safeTarget) })}
          </Text>
        </View>
      </View>
      <View style={styles.ringHeroMetrics}>
        <HeroMetricRow
          iconName="restaurant-outline"
          label={t('screen.tabs.index.hifi.ring.eaten' as any)}
          value={formatNumber(safeConsumed)}
          bg={colors.surfaceSuccess}
          iconColor={colors.accentLeaf}
        />
        <HeroMetricRow
          iconName="walk-outline"
          label={t('screen.tabs.index.hifi.ring.activity' as any)}
          value={`+${formatNumber(safeBurned)}`}
          bg={colors.surfaceInfo}
          iconColor={colors.accentCyan}
        />
        <HeroMetricRow
          iconName="scale-outline"
          label={t('screen.tabs.index.hifi.ring.net' as any)}
          value={formatNumber(net)}
          bg={colors.surfaceWarm}
          iconColor={colors.accentAmber}
        />
      </View>
    </View>
  );
}

function HeroMetricRow({
  iconName,
  label,
  value,
  bg,
  iconColor,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  bg: string;
  iconColor: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.heroMetric}>
      <View style={[styles.heroMetricIconBox, { backgroundColor: bg }]}>
        <Ionicons name={iconName} size={16} color={iconColor} />
      </View>
      <View>
        <Text style={[styles.heroMetricLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.heroMetricValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

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
  return (
    <View style={[styles.macroBarCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
      <Text style={[styles.macroBarLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.macroBarValue, { color: colors.text }]}>
        {formatNumber(eaten)}
        <Text style={[styles.macroBarGoal, { color: colors.textDisabled }]}>/{goal}g</Text>
      </Text>
      <View style={[styles.macroBarTrack, { backgroundColor: colors.progressBg }]}>
        <View style={[styles.macroBarFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: color }]} />
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
  log: 'checkmark-circle-outline',
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
  const { t } = useI18n();
  const iconName = NEXT_STEP_ICON_MAP[kind] ?? 'bulb-outline';
  const isDone = kind === 'movement' && completed;
  const isDisabled = kind === 'movement' && (isLogging || completed);

  return (
    <LinearGradient
      colors={NEXT_STEP_GRAD}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.nextStepCard}
    >
      <View style={styles.nextStepRow}>
        <View style={styles.nextStepIconWrap}>
          <Ionicons name={iconName} size={20} color="#b9df78" />
        </View>
        <View style={styles.nextStepCopy}>
          <Text style={styles.nextStepEyebrow}>
            {t('screen.tabs.index.hifi.nextstep.eyebrow' as any)}
          </Text>
          <Text style={styles.nextStepTitle}>{title}</Text>
          <Text style={styles.nextStepBody}>{body}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[
          styles.nextStepButton,
          isDone && styles.nextStepButtonDone,
          isDisabled && styles.disabledButton,
        ]}
        onPress={onPress}
        disabled={isDisabled}
      >
        <Text style={[styles.nextStepButtonText, isDone && styles.nextStepButtonTextDone]}>
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

function MealListRow({ log, isLast }: { log: FoodLog; isLast: boolean }) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const name = (log as any).name_vi ?? log.name;
  const mealLabel = t(MEAL_LABEL_KEYS[log.meal_type]);
  const kcal = safeNumber((log as any).calories ?? (log as any).total_calories ?? 0);
  const isAi = !!(log as any).ai_scan_id;

  const MEAL_BG: Record<MealType, string> = {
    breakfast: colors.surfaceSuccess,
    lunch: colors.surfaceInfo,
    dinner: colors.surfaceWarning,
    snack: colors.surfaceMuted,
  };
  const MEAL_ICON_COLOR: Record<MealType, string> = {
    breakfast: colors.accentLeaf,
    lunch: colors.accentCyan,
    dinner: colors.accentAmber,
    snack: colors.textMuted,
  };

  return (
    <View style={[styles.mealRow, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }]}>
      <View style={[styles.mealRowIconBox, { backgroundColor: MEAL_BG[log.meal_type] }]}>
        <Ionicons
          name={MEAL_ICON_MAP[log.meal_type]}
          size={18}
          color={MEAL_ICON_COLOR[log.meal_type]}
        />
      </View>
      <View style={styles.mealRowCopy}>
        <Text style={[styles.mealRowName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.mealRowMeta, { color: colors.textMuted }]}>
          {mealLabel} - {formatNumber(kcal)} kcal
        </Text>
      </View>
      {isAi && (
        <View style={[styles.aiBadge, { backgroundColor: colors.surfaceSuccess, borderColor: colors.borderSuccess }]}>
          <Text style={[styles.aiBadgeText, { color: colors.accentLeaf }]}>
            {t('screen.tabs.index.hifi.meals.aiBadge' as any)}
          </Text>
        </View>
      )}
    </View>
  );
}

function ShortcutTile({
  iconName,
  labelKey,
  onPress,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  labelKey: any;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  return (
    <TouchableOpacity
      style={[styles.shortcutTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
      onPress={onPress}
    >
      <Ionicons name={iconName} size={20} color={colors.accentCyan} />
      <Text style={[styles.shortcutLabel, { color: colors.textSoft }]}>{t(labelKey)}</Text>
    </TouchableOpacity>
  );
}

// --- Styles ---

const styles = createThemedStyles((colors) => ({
  screen: { paddingBottom: 28 },

  // Header
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    marginBottom: 14,
  },
  headerLeft: { flex: 1 },
  headerDate: {
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  headerGreeting: {
    fontSize: 25,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    marginTop: 3,
  },
  streakPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  streakText: { fontSize: 14, fontWeight: '800' as const },

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

  // Hero card
  heroCard: { marginBottom: 12, borderRadius: 28 },

  // Ring hero
  ringHeroRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 20,
  },
  ringHeroCenter: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  ringHeroValue: {
    fontSize: 29,
    fontWeight: '800' as const,
    letterSpacing: -1,
    lineHeight: 32,
  },
  ringHeroLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    marginTop: 2,
    textAlign: 'center' as const,
  },
  ringHeroMetrics: { flex: 1, gap: 11 },
  heroMetric: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  heroMetricIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroMetricLabel: { fontSize: 11, fontWeight: '600' as const },
  heroMetricValue: { fontSize: 16, fontWeight: '800' as const },

  // Preset chips
  presetRow: { flexDirection: 'row' as const, gap: 8, marginBottom: 12 },
  presetChip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    alignItems: 'center' as const,
  },
  presetChipActive: {},
  presetChipText: {
    fontSize: 12.5,
    fontWeight: '800' as const,
    textAlign: 'center' as const,
  },

  // Macro bars
  macroBarRow: { flexDirection: 'row' as const, gap: 10, marginBottom: 12 },
  macroBarCard: { flex: 1, borderRadius: 20, borderWidth: 1, padding: 13 },
  macroBarLabel: { fontSize: 11, fontWeight: '700' as const },
  macroBarValue: { fontSize: 17, fontWeight: '800' as const, marginVertical: 3 },
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
      ? ({ boxShadow: '0 18px 38px rgba(20,32,24,.22)' } as any)
      : {
          shadowColor: '#142018',
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
    backgroundColor: 'rgba(185,223,120,.18)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  nextStepCopy: { flex: 1 },
  nextStepEyebrow: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: '#b9df78',
  },
  nextStepTitle: {
    fontSize: 13.5,
    fontWeight: '600' as const,
    color: '#f3f5ee',
    marginTop: 3,
    lineHeight: 19,
  },
  nextStepBody: { fontSize: 12, color: '#c5cec3', marginTop: 2, lineHeight: 17 },
  nextStepButton: {
    height: 42,
    borderRadius: 14,
    backgroundColor: '#b9df78',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  nextStepButtonDone: { backgroundColor: 'rgba(185,223,120,.18)' },
  nextStepButtonText: {
    fontSize: 13.5,
    fontWeight: '800' as const,
    color: '#16200f',
  },
  nextStepButtonTextDone: { color: '#b9df78' },

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

  // Meal list
  mealListCard: { padding: 6, marginBottom: 14 },
  mealRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 10,
  },
  mealRowIconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  mealRowCopy: { flex: 1, minWidth: 0 },
  mealRowName: { fontSize: 13.5, fontWeight: '700' as const },
  mealRowMeta: { fontSize: 11, marginTop: 1 },
  aiBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  aiBadgeText: { fontSize: 10, fontWeight: '800' as const },

  // Shortcuts
  shortcutGrid: { flexDirection: 'row' as const, gap: 9, marginBottom: 8 },
  shortcutTile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center' as const,
    gap: 4,
  },
  shortcutLabel: {
    fontSize: 10.5,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
  },

  disabledButton: { opacity: 0.6 },
}));
