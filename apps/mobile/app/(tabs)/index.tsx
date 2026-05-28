import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ACTIVITY_MET, ActivityLog, ActivityPreference, ActivityType, FoodLog, GoalPlan, MealType, User, UserGoal } from '@calorie-ai/types';
import { BodyText, Eyebrow, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { useGamificationStore } from '../../store/gamification.store';
import { useLogStore } from '../../store/log.store';
import { useCalorieTargetStore } from '../../store/calorie-target.store';
import { useInsightsStore } from '../../store/insights.store';
import { apiClient } from '../../services/api';
import { estimateExerciseCalories } from '../../services/exercise.service';
import { formatNumberVi, safeNumber, safePositiveNumber, toFiniteNumber } from '../../services/number-format';
import { AnimatedIonicon } from '../../components/animated-icon';
import { RewardToast, RewardToastData } from '../../components/reward-toast';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';
import { useI18n } from '../../components/i18n';

const mealIllustration = require('../../assets/images/vietnamese-meal.jpg') as number;
const todayHeroIllustration = require('../../assets/images/today-hero.jpg') as number;

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Sáng',
  lunch: 'Trưa',
  dinner: 'Tối',
  snack: 'Vặt',
};

const MEAL_HINTS: Record<MealType, string> = {
  breakfast: 'Bắt nhịp ngày mới',
  lunch: 'Giữ năng lượng ổn',
  dinner: 'Nhẹ nhưng đủ chất',
  snack: 'Chống đói thông minh',
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
  const vegWords = ['rau', 'salad', 'xà lách', 'dưa leo', 'cải', 'canh', 'bông cải', 'giá'];
  return logs.some((log) => vegWords.some((word) => `${log.name_vi ?? ''} ${log.name}`.toLowerCase().includes(word)));
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
  const items: DailyFocusItem[] = [
    {
      key: 'calories',
      label: 'Net kcal',
      value: remaining >= 0 ? `còn ${formatNumber(remaining)}` : `dư ${formatNumber(Math.abs(remaining))}`,
      hint: consumedKcal <= 0
        ? 'Log bữa đầu để mục tiêu rõ hơn'
        : remaining >= 0
          ? calorieRatio >= 0.75
            ? 'Đang sát nhịp hôm nay'
            : 'Còn room cho bữa sau'
          : 'Bữa sau giảm dầu/ngọt',
      icon: remaining >= 0 ? 'pulse-outline' : 'alert-circle-outline',
      tone: remaining < 0 ? 'warn' : calorieRatio >= 0.75 ? 'good' : 'info',
      progress: clampProgress(calorieRatio),
    },
    {
      key: 'protein',
      label: 'Protein',
      value: `${formatNumber(proteinG)}/${proteinTarget}g`,
      hint: proteinGap <= 0 ? 'Đủ nền phục hồi' : `Cần thêm khoảng ${Math.round(proteinGap)}g`,
      icon: 'barbell-outline',
      tone: proteinGap <= 0 ? 'good' : 'info',
      progress: clampProgress(proteinG / Math.max(proteinTarget, 1)),
    },
  ];

  if (activityMinutes < 25) {
    items.push({
      key: 'movement',
      label: 'Vận động',
      value: `${formatNumber(activityMinutes)}/25p`,
      hint: 'Đi bộ ngắn là đủ',
      icon: 'walk-outline',
      tone: 'info',
      progress: clampProgress(activityMinutes / 25),
    });
  } else if (qualityCoverageItems > 0 && sodiumMg > args.qualityTargets.sodium_mg_max) {
    items.push({
      key: 'sodium',
      label: 'Muối',
      value: `${formatNumber(sodiumMg)}mg`,
      hint: 'Bữa sau giảm đồ mặn',
      icon: 'water-outline',
      tone: 'warn',
      progress: clampProgress(args.qualityTargets.sodium_mg_max / Math.max(sodiumMg, 1)),
    });
  } else if (qualityCoverageItems > 0 && sugarG > args.qualityTargets.sugar_g_max) {
    items.push({
      key: 'sugar',
      label: 'Đường',
      value: `${formatNumber(sugarG)}g`,
      hint: 'Ưu tiên nước lọc',
      icon: 'ice-cream-outline',
      tone: 'warn',
      progress: clampProgress(args.qualityTargets.sugar_g_max / Math.max(sugarG, 1)),
    });
  } else if (qualityCoverageItems > 0) {
    items.push({
      key: 'fiber',
      label: 'Chất xơ',
      value: `${formatNumber(fiberG)}/${args.qualityTargets.fiber_g_min}g`,
      hint: fiberG >= args.qualityTargets.fiber_g_min ? 'Fiber ổn' : 'Thêm rau/đậu/trái cây',
      icon: 'leaf-outline',
      tone: fiberG >= args.qualityTargets.fiber_g_min ? 'good' : 'info',
      progress: clampProgress(fiberG / Math.max(args.qualityTargets.fiber_g_min, 1)),
    });
  } else {
    items.push({
      key: 'quality',
      label: 'Chất lượng',
      value: 'thiếu dữ liệu',
      hint: 'Scan/database để rõ sodium, fiber',
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
    items.push({ title: 'Ăn đủ protein', body: 'Bữa tới giữ rau và nước là ổn.', tone: 'good', icon: 'checkmark-circle' });
  } else {
    items.push({ title: 'Thêm protein', body: '+1 trứng, sữa chua hoặc đậu hũ.', tone: 'info', icon: 'barbell' });
  }

  if (!hasVeg(logs)) {
    items.push({ title: 'Thiếu rau', body: 'Thêm canh hoặc rau luộc ở bữa kế.', tone: 'warn', icon: 'leaf' });
  }

  if (safeCalories > 0 && fatCalories / Math.max(safeCalories, 1) > 0.38) {
    items.push({ title: 'Fat hơi lệch', body: 'Ưu tiên hấp, luộc hoặc nướng.', tone: 'warn', icon: 'flame' });
  }

  if (safeQuality.coverage_items > 0 && safeQuality.sodium_mg > quality.targets.sodium_mg_max) {
    items.push({ title: 'Sodium cao', body: 'Bữa sau giảm đồ mặn/đồ đóng gói.', tone: 'warn', icon: 'water' });
  }

  if (safeQuality.coverage_items > 0 && safeQuality.sugar_g > quality.targets.sugar_g_max) {
    items.push({ title: 'Đường hơi cao', body: 'Đổi sang nước lọc hoặc trái cây nguyên miếng.', tone: 'warn', icon: 'ice-cream' });
  }

  if (safeQuality.coverage_items > 0 && safeCalories > safeTarget * 0.45 && safeQuality.fiber_g < quality.targets.fiber_g_min * 0.45) {
    items.push({ title: 'Fiber còn thấp', body: 'Thêm rau, đậu hoặc trái cây ít ngọt.', tone: 'info', icon: 'leaf' });
  }

  if (safeTarget - safeCalories > 350) {
    items.push({ title: 'Còn dư calo đẹp', body: 'Chọn bữa sau đủ đạm, ít dầu.', tone: 'good', icon: 'sparkles' });
  }

  return items.slice(0, 3);
}

function CaloriesRing({ consumed, burned, target, compact = false }: { consumed: number; burned: number; target: number; compact?: boolean }) {
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
          {remaining >= 0 ? `còn ${formatNumber(remaining)}` : `dư ${formatNumber(Math.abs(remaining))}`}
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
  label: string;
  type: 'loss' | 'maintain' | 'gain';
  kgPerWeek: number;
};

const QUICK_GOAL_OPTIONS: QuickGoalOption[] = [
  { key: 'loss_0.25', label: 'Giảm 0.25 kg/tuần', type: 'loss', kgPerWeek: 0.25 },
  { key: 'loss_0.5', label: 'Giảm 0.5 kg/tuần', type: 'loss', kgPerWeek: 0.5 },
  { key: 'loss_1', label: 'Giảm 1.0 kg/tuần', type: 'loss', kgPerWeek: 1 },
  { key: 'maintain', label: 'Giữ dáng', type: 'maintain', kgPerWeek: 0 },
  { key: 'gain_0.25', label: 'Tăng 0.25 kg/tuần', type: 'gain', kgPerWeek: 0.25 },
];

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

function describeGoalPlan(plan: GoalPlan) {
  if (plan.direction === 'maintain') {
    return 'Duy trì cân nặng';
  }

  const verb = plan.direction === 'gain' ? 'Tăng' : 'Giảm';
  const targetKg = safeNumber(plan.target_kg);
  const durationWeeks = safeNumber(plan.duration_weeks);
  return `${verb} ${targetKg} kg${durationWeeks ? ` trong ${durationWeeks} tuần` : ''}`;
}

function statusLabel(status?: GoalPlan['safety_status']) {
  if (status === 'adjusted') return 'Đã clamp';
  if (status === 'maintenance_only') return 'Maintenance';
  if (status === 'incomplete') return 'Thiếu hồ sơ';
  return 'Đang dùng';
}

function getMissingProfileFields(profile: DashboardProfileMeta): string[] {
  const missing: string[] = [];
  if (!safePositiveNumber(profile.age, 0)) missing.push('tuổi');
  if (!profile.gender) missing.push('giới tính');
  if (!safePositiveNumber(profile.height_cm, 0)) missing.push('chiều cao');
  if (!safePositiveNumber(profile.weight_kg, 0)) missing.push('cân nặng');
  if (!profile.goal) missing.push('mục tiêu');
  if (!profile.activity_level) missing.push('mức vận động');
  if (!safePositiveNumber(profile.daily_calorie_target, 0) && !safePositiveNumber(profile.goal_plan?.computed_daily_calorie_target, 0)) {
    missing.push('mục tiêu kcal');
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
}): TodayCoachBridge {
  const logsCount = safeNumber(args.logsCount);
  const consumed = safeNumber(args.consumed);
  const burned = safeNumber(args.burned);
  const target = safePositiveNumber(args.target, 1800);
  const protein = safeNumber(args.protein);
  const streak = safeNumber(args.streak);
  const net = Math.max(0, consumed - burned);
  const remaining = target - net;
  const proteinTarget = Math.max(70, Math.round(target * 0.075 / 4));

  if (logsCount === 0 && streak === 0) {
    return {
      title: 'Quay lai nhip trong 1 phut',
      body: 'Coach da co ke hoach restart 7 ngay: log 1 bua truoc, roi moi toi uu calories.',
      status: 'Restart nhe',
      tone: 'info',
    };
  }

  if (logsCount === 0) {
    return {
      title: 'Dung de trong ngay hom nay',
      body: 'Mo Coach de chon buoc nho nhat: log bua gan nhat hoac lap ke hoach bua tiep theo.',
      status: `${formatNumber(streak)} ngay streak`,
      tone: 'info',
    };
  }

  if (remaining < -150) {
    return {
      title: 'Can cuu ngay, khong can bo bua',
      body: 'Coach se goi y bua tiep theo nhe hon va cach bu lai bang van dong vua phai.',
      status: `Du ${formatNumber(Math.abs(remaining))} kcal`,
      tone: 'warn',
    };
  }

  if (protein < proteinTarget * 0.65) {
    return {
      title: 'Them protein de do them an vat',
      body: 'Coach co goi y mon re, de mua, giu no lau cho muc tieu giam can.',
      status: `${formatNumber(protein)}/${proteinTarget}g`,
      tone: 'info',
    };
  }

  return {
    title: 'Hom nay dang on, giu dung da',
    body: 'Coach da chuan bi ke hoach hom nay va 7 ngay de ban khong phai tu nghi tiep.',
    status: `Con ${formatNumber(Math.max(0, remaining))} kcal`,
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
): MovementPlan | null {
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
  let title = 'Đi bộ duy trì';
  let detail = 'Giữ nhịp vận động vừa phải để hỗ trợ tim mạch và đủ vận động nền.';
  let calorieStatus = gapToTarget >= 0
    ? `Net còn ${formatNumber(gapToTarget)} kcal trước mục tiêu.`
    : `Net đang cao hơn mục tiêu ${formatNumber(overTarget)} kcal. Không cần bù toàn bộ bằng tập.`;
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
      ? `Dựa trên lộ trình Profile; hôm nay chỉ cần nhắm khoảng ${formatNumber(surplusBurnTarget)} kcal vận động.`
      : 'Bài này nằm trong lộ trình bạn đã chọn ở Profile.';
  }

  if (caution) {
    durationMin = preferredActivity ? Math.min(preferredActivity.duration_min, 20) : 12;
    title = preferredActivity?.title ?? 'Vận động nhẹ an toàn';
    detail = 'Ưu tiên nhịp nhẹ; hỏi chuyên gia nếu đang có tình trạng sức khỏe đặc biệt.';
    calorieStatus = `${calorieStatus} Ưu tiên an toàn, không dùng tập luyện để bù calo mạnh.`;
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
      title = activityType === 'running' ? 'Cardio vừa sức' : 'Đi bộ nhanh';
    }
    detail = overTarget > targetBurn + 80
      ? `Mục tiêu là giảm khoảng ${formatNumber(targetBurn)} kcal; phần còn lại xử lý bằng bữa sau nhẹ hơn.`
      : preferredActivity ? 'Bài đã set trong Profile giúp đưa ngày hôm nay về gần mục tiêu.' : 'Bài này giúp đưa ngày hôm nay về gần mục tiêu.';
    tone = 'surplus';
  } else if (effectiveGoal === 'gain_muscle' && !preferredActivity) {
    activityType = 'gym';
    durationMin = activityLevel === 'sedentary' ? 20 : 30;
    title = 'Sức mạnh cho tăng cơ';
    detail = gapToTarget > 250
      ? 'Tập strength ngắn, rồi ưu tiên ăn đủ protein và phần calo còn lại.'
      : 'Tập strength để kích thích cơ; tránh cardio dài nếu đang cần surplus.';
    tone = gapToTarget > 250 ? 'fuel' : 'normal';
  } else if (effectiveGoal === 'lose_weight' && !preferredActivity) {
    activityType = activityLevel === 'active' || activityLevel === 'very_active' ? 'running' : 'walking';
    durationMin = gapToTarget > 300 ? 20 : activityType === 'running' ? 25 : 30;
    title = gapToTarget > 300 ? 'Giữ thâm hụt, vận động nhẹ' : activityType === 'running' ? 'Cardio zone 2' : 'Đi bộ nhanh';
    detail = gapToTarget > 300
      ? 'Bạn đang dưới mục tiêu; chỉ cần vận động nền để giữ sức khỏe và phục hồi.'
      : 'Tạo thêm tiêu hao nhẹ, không cần ép cường độ cao.';
  } else if (activityLevel === 'sedentary' && !preferredActivity) {
    durationMin = 20;
    title = 'Đi bộ phá ngồi lâu';
    detail = 'Chia 2 chặng 10 phút cũng được tính.';
  } else if (gapToTarget > 300 && !preferredActivity) {
    title = 'Vận động nền, không cần đốt thêm';
    detail = 'Bạn còn nhiều kcal trước mục tiêu; làm bài sức khỏe vừa đủ và ăn bữa sau cân bằng.';
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
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const isCompact = width < 480;
  const {
    dailyLog,
    activityLogs,
    activityPreferences,
    fetchDailyLog,
    fetchActivityLogs,
    fetchActivityPreferences,
    addActivity,
  } = useLogStore();
  const { summary, fetchSummary } = useGamificationStore();
  const { fetchRecommendations } = useCalorieTargetStore();
  const { fetchWeeklyInsights } = useInsightsStore();
  const [profileMeta, setProfileMeta] = useState<DashboardProfileMeta | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string>(QUICK_GOAL_OPTIONS[1].key);
  const [isApplyingTarget, setIsApplyingTarget] = useState(false);
  const [isLoggingMovement, setIsLoggingMovement] = useState(false);
  const [reward, setReward] = useState<RewardToastData | null>(null);

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

  const refreshDashboardData = useCallback(() => {
    fetchDailyLog().catch(() => {});
    fetchActivityLogs().catch(() => {});
    fetchActivityPreferences().catch(() => {});
    fetchSummary().catch(() => {});
    fetchProfileMeta().catch(() => {});
  }, [fetchActivityLogs, fetchActivityPreferences, fetchDailyLog, fetchProfileMeta, fetchSummary]);

  useEffect(() => {
    refreshDashboardData();
  }, [refreshDashboardData]);

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
    () => buildMovementPlan(profileMeta, activityPreferences, activityMinutes, consumed, burned, target),
    [activityMinutes, activityPreferences, burned, consumed, profileMeta, target],
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
  }), [
    activityMinutes,
    burned,
    consumed,
    fiber,
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
  ), [consumed, fat, fiber, logs, protein, qualityCoverageItems, qualityTargets, sodium, sugar, target]);
  const latestMeals = logs.slice(0, 4);
  const safetyCard = useMemo(() => {
    if (!profileMeta) return null;

    const flagsKnown = Array.isArray(profileMeta.health_flags);
    const flags = flagsKnown ? profileMeta.health_flags ?? [] : [];
    const missingFields = getMissingProfileFields(profileMeta);

    if (missingFields.length > 0) {
      return {
        tone: 'setup' as const,
        icon: 'shield-checkmark' as const,
        title: 'Thiếu thông tin tính mục tiêu',
        body: `Bổ sung ${missingFields.join(', ')} để app tính kcal và gợi ý vận động chính xác hơn.`,
        action: 'Cập nhật Profile',
      };
    }

    if (!flagsKnown) {
      return {
        tone: 'setup' as const,
        icon: 'shield-checkmark' as const,
        title: 'Xác nhận yếu tố sức khỏe',
        body: 'Mở Profile và chọn các yếu tố sức khỏe nếu có, hoặc lưu hồ sơ để xác nhận không có yếu tố rủi ro.',
        action: 'Xác nhận an toàn',
      };
    }

    if ((profileMeta.age ?? 99) < 18 || flags.length > 0) {
      return {
        tone: 'review' as const,
        icon: 'medical' as const,
        title: 'Cần rà soát y tế',
        body: 'Mục tiêu đang ưu tiên an toàn. Hỏi bác sĩ/dietitian trước khi giảm hoặc tăng cân mạnh.',
        action: 'Xem cảnh báo',
      };
    }

    return null;
  }, [profileMeta]);

  const selectedGoalOption = QUICK_GOAL_OPTIONS.find((goal) => goal.key === selectedGoal) ?? QUICK_GOAL_OPTIONS[1];
  const selectedGoalPlan = buildQuickGoalPlan(selectedGoalOption);
  const selectedDailyDelta = computeDailyDelta(selectedGoalOption.kgPerWeek);
  const activeGoalPlan = profileMeta?.goal_plan ?? null;

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
  const movementSourceLabel = movementPlan?.preference_id ? 'Từ Profile' : 'Gợi ý sức khỏe';
  const movementButtonLabel = movementPlanCompleted
    ? 'Đã log'
    : isLoggingMovement
      ? 'Đang log'
      : 'Hoàn thành';
  const nextAction = useMemo(() => {
    if (safetyCard) {
      return {
        kind: 'profile' as const,
        tone: safetyCard.tone === 'review' ? 'warn' as const : 'info' as const,
        icon: safetyCard.icon,
        label: 'Ưu tiên ngay',
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
        label: 'Bắt đầu ngày',
        title: 'Log bữa đầu tiên',
        body: 'Scan ảnh hoặc nhập nhanh để app tính phần còn lại trong ngày chính xác hơn.',
        primaryLabel: 'Scan bữa ăn',
      };
    }

    if (movementPlan && !movementPlanCompleted) {
      return {
        kind: 'movement' as const,
        tone: movementPlan.tone === 'caution' || movementPlan.tone === 'surplus' ? 'warn' as const : 'good' as const,
        icon: 'walk-outline' as const,
        label: 'Việc nên làm tiếp',
        title: movementPlan.title,
        body: `${movementPlan.duration_min} phút · ~${formatNumber(movementPlan.estimated_kcal)} kcal. ${movementPlan.calorie_status}`,
        primaryLabel: movementButtonLabel,
      };
    }

    const nudge = nudges[0];
    if (nudge) {
      return {
        kind: 'nudge' as const,
        tone: nudge.tone === 'warn' ? 'warn' as const : nudge.tone === 'good' ? 'good' as const : 'info' as const,
        icon: nudge.icon,
        label: 'Bữa kế tiếp',
        title: nudge.title,
        body: nudge.body,
        primaryLabel: 'Xem nhật ký',
      };
    }

    return {
      kind: 'log' as const,
      tone: 'good' as const,
      icon: 'checkmark-circle' as const,
      label: 'Ổn định',
      title: 'Giữ nhịp hôm nay',
      body: 'Tiếp tục log bữa kế tiếp và duy trì vận động nền.',
      primaryLabel: 'Mở nhật ký',
    };
  }, [logs.length, movementButtonLabel, movementPlan, movementPlanCompleted, nudges, safetyCard]);
  const coachBridge = useMemo(() => buildTodayCoachBridge({
    logsCount: logs.length,
    consumed,
    burned,
    target,
    protein,
    streak: displayStreak,
  }), [burned, consumed, displayStreak, logs.length, protein, target]);
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
          <Eyebrow>Hôm nay</Eyebrow>
          <Text style={[styles.dashboardTitle, isCompact && styles.dashboardTitleCompact]}>Tổng quan hôm nay</Text>
          <BodyText style={[styles.heroBody, isCompact && styles.heroBodyCompact]}>Nhìn nhanh calo, bữa ăn và việc cần chỉnh ở bữa kế tiếp.</BodyText>
        </View>
        <TouchableOpacity style={[styles.streakPill, isCompact && styles.streakPillCompact]} onPress={() => router.push('/achievements' as never)}>
          <AnimatedIonicon name="flame" size={16} color={theme.colors.accentAmber} motion="pulse" />
          <Text style={styles.streakText}>{formatNumber(displayStreak)} ngày</Text>
        </TouchableOpacity>
      </View>

      <SurfaceCard style={[
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

      <SurfaceCard style={[
        styles.coachBridgeCard,
        coachBridge.tone === 'good' && styles.coachBridgeGood,
        coachBridge.tone === 'warn' && styles.coachBridgeWarn,
      ]}>
        <View style={styles.coachBridgeCopy}>
          <View style={styles.coachBridgeHeader}>
            <Text style={styles.coachBridgeEyebrow}>TRO LY GIAM CAN</Text>
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
          <Text style={styles.coachBridgeButtonText}>Mo Coach</Text>
        </TouchableOpacity>
      </SurfaceCard>

      <View style={[styles.actionGrid, isCompact && styles.actionGridCompact]}>
        <TouchableOpacity style={[styles.primaryAction, isCompact && styles.primaryActionCompact]} onPress={() => router.push('/scan' as never)}>
          <AnimatedIonicon name="camera" size={20} color={theme.colors.textOnAccent} motion="pulse" />
          <Text style={styles.primaryActionText} i18nKey="screen.tabs.index.text.002" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryAction, isCompact && styles.secondaryActionCompact]} onPress={() => router.push('/log' as never)}>
          <AnimatedIonicon name="create-outline" size={18} color={theme.colors.accentMint} motion="float" />
          <Text style={styles.secondaryActionText} i18nKey="screen.tabs.index.text.003" />
        </TouchableOpacity>
      </View>

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
            <Text style={styles.goalPlanTitle}>Mục tiêu hôm nay {formatNumber(target)} kcal</Text>
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
                {statusLabel(activeGoalPlan.safety_status)}
              </Text>
            </View>
          )}
        </View>

        {profileMeta ? (
          <>
            {activeGoalPlan?.computed_daily_calorie_target ? (
              <View style={styles.activeGoalPlanBox}>
                <Text style={styles.activeGoalPlanTitle}>{describeGoalPlan(activeGoalPlan)}</Text>
                <Text style={styles.activeGoalPlanMeta}>
                  Đang dùng {formatNumber(activeGoalPlan.computed_daily_calorie_target)} kcal/ngày
                  {activeGoalPlan.weekly_rate_kg ? ` · ${activeGoalPlan.weekly_rate_kg} kg/tuần` : ''}
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
                    <Text style={[styles.goalOptionText, selected && styles.goalOptionTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.goalPlanPreview}>
              <View style={styles.goalPlanPreviewCopy}>
                <Text style={styles.goalPlanPreviewTitle}>Chuẩn bị lưu: {describeGoalPlan(selectedGoalPlan)}</Text>
                <Text style={styles.goalPlanPreviewText}>
                  {selectedGoalOption.type === 'maintain'
                    ? 'Backend sẽ tính mục tiêu duy trì từ hồ sơ hiện tại.'
                    : `Delta tham khảo ${selectedGoalOption.type === 'loss' ? '-' : '+'}${formatNumber(selectedDailyDelta)} kcal/ngày trước khi clamp.`}
                </Text>
              </View>
              <TouchableOpacity style={[styles.applyButton, isApplyingTarget && styles.disabledButton]} onPress={applySelectedTarget} disabled={isApplyingTarget}>
                <Text style={styles.applyButtonText}>{isApplyingTarget ? 'Đang lưu...' : 'Lưu'}</Text>
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
                  <Text style={styles.movementMetaText}>{movementPlan.duration_min} phút</Text>
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
              <Text style={styles.movementMetric}>{formatNumber(activityMinutes)}/{formatNumber(movementPlan.daily_minutes_target)} phút</Text>
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
                      <Text style={styles.mealName}>{MEAL_LABELS[meal]}</Text>
                      <Text style={styles.mealHint}>{MEAL_HINTS[meal]}</Text>
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
    paddingBottom: 24,
  },
  screenCompact: {
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  headerRowCompact: {
    gap: 8,
    marginBottom: 10,
  },
  headerCopy: {
    flex: 1,
  },
  dashboardTitle: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    marginBottom: 8,
  },
  dashboardTitleCompact: {
    fontSize: 25,
    lineHeight: 31,
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
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
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
    fontWeight: '800',
  },
  nextActionCard: {
    marginBottom: 12,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
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
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  nextActionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  nextActionTitleCompact: {
    fontSize: 16,
    lineHeight: 20,
  },
  nextActionBody: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  nextActionBodyCompact: {
    lineHeight: 16,
  },
  nextActionButton: {
    minHeight: 38,
    minWidth: 112,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 12,
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
    fontSize: 12,
    fontWeight: '900',
  },
  coachBridgeCard: {
    marginBottom: 12,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    lineHeight: 18,
    marginTop: 3,
  },
  coachBridgeButton: {
    minHeight: 38,
    minWidth: 92,
    borderRadius: radii.lg,
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
  cockpitCard: {
    marginBottom: 16,
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    padding: 18,
  },
  cockpitCardCompact: {
    marginBottom: 12,
    padding: 12,
  },
  cockpitMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 13,
    paddingVertical: 11,
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
    gap: 8,
    marginTop: 16,
  },
  macroRowCompact: {
    gap: 6,
    marginTop: 12,
  },
  macroPill: {
    flex: 1,
    minHeight: 58,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 5,
  },
  macroValue: {
    color: colors.text,
    fontSize: 17,
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
    gap: 8,
    marginTop: 14,
  },
  focusPill: {
    flex: 1,
    minWidth: 104,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 10,
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
    borderColor: colors.border,
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
    textTransform: 'uppercase',
  },
  focusValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  focusHint: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
    minHeight: 30,
    marginTop: 2,
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
    gap: 8,
    marginTop: 10,
  },
  qualityPill: {
    minWidth: '47%',
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  qualityPillMuted: {
    borderColor: colors.border,
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
    gap: 10,
    marginBottom: 12,
  },
  actionGridCompact: {
    gap: 8,
    marginBottom: 10,
  },
  movementCard: {
    marginBottom: 12,
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
    gap: 10,
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
    marginBottom: 10,
  },
  movementTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  movementTitle: {
    color: colors.text,
    fontSize: 15,
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
    padding: 12,
    gap: 8,
  },
  movementActionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
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
    backgroundColor: colors.border,
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
    fontWeight: '900',
  },
  movementCalorieStatus: {
    color: colors.accentCyan,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  movementPlanDetail: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  movementPlanMeta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  movementLogButton: {
    minHeight: 38,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  movementActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  movementSecondaryButton: {
    minHeight: 38,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    paddingHorizontal: 10,
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
    gap: 9,
    marginBottom: 12,
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
    lineHeight: 18,
  },
  safetySetupButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
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
    minHeight: 56,
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
    minHeight: 56,
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
    fontSize: 15,
    fontWeight: '800',
  },
  nudgeRow: {
    gap: 8,
    marginBottom: 16,
  },
  nudgeChip: {
    minHeight: 58,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    lineHeight: 17,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
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
    gap: 10,
  },
  mealCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  mealImage: {
    width: 78,
    height: 78,
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
    lineHeight: 18,
    marginTop: 8,
  },
  mealItemsMuted: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 8,
  },
  quickLinks: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  quickLink: {
    flex: 1,
    minHeight: 48,
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


