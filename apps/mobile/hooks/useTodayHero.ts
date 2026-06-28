import { useMemo } from 'react';
import { Locale, tr } from '../components/i18n';

export type TodayHeroTone = 'good' | 'steady' | 'near' | 'over' | 'complete';

export type TodayHeroModel = {
  greeting: string;
  calorieTargetAvailable: boolean;
  remainingCalories: number;
  remainingCaloriesLabel: string;
  calorieLabel: string;
  progressPercent: number;
  progressLabel: string;
  calorieProgressDetail: string;
  statusLabel: string;
  statusTone: TodayHeroTone;
  proteinTitle: string;
  proteinDetail: string;
  proteinReached: boolean;
  activityTitle: string;
  activityDetail: string;
  activityReached: boolean;
  motivation: string;
  sensitiveNutritionMode: boolean;
};

export type TodayHeroInput = {
  consumedCalories: number;
  targetCalories: number;
  proteinG: number;
  proteinTargetG?: number;
  activityMinutes: number;
  activityTargetMinutes: number;
  logsCount: number;
  streak: number;
  firstName?: string;
  locale: Locale;
  now?: Date;
  sensitiveNutritionMode?: boolean;
};

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function format(value: number, locale: Locale) {
  return Math.round(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US');
}

export function buildTodayHero(input: TodayHeroInput): TodayHeroModel {
  const rawTarget = finite(input.targetCalories, 0);
  const calorieTargetAvailable = rawTarget > 0;
  const target = calorieTargetAvailable ? rawTarget : 0;
  const consumed = Math.max(0, finite(input.consumedCalories));
  const remaining = calorieTargetAvailable ? target - consumed : 0;
  const remainingRatio = calorieTargetAvailable ? remaining / target : 0;
  const consumedPercent = calorieTargetAvailable
    ? Math.max(0, Math.round((consumed / target) * 100))
    : 0;
  const proteinTarget = input.proteinTargetG && input.proteinTargetG > 0 ? input.proteinTargetG : null;
  const proteinGap = proteinTarget
    ? Math.max(0, proteinTarget - Math.max(0, finite(input.proteinG)))
    : 0;
  const activityTarget = Math.max(1, finite(input.activityTargetMinutes, 25));
  const activityGap = Math.max(0, activityTarget - Math.max(0, finite(input.activityMinutes)));
  const hour = (input.now ?? new Date()).getHours();
  const dayPart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const name = input.firstName?.trim() || tr('screen.tabs.index.todayHero.fallbackName', input.locale);

  let statusTone: TodayHeroTone;
  let statusLabel: string;
  if (!calorieTargetAvailable) {
    statusTone = 'steady';
    statusLabel = input.locale === 'vi' ? 'Cần hoàn tất hồ sơ' : 'Complete your profile';
  } else if (remaining < 0) {
    statusTone = 'over';
    statusLabel = tr('screen.tabs.index.todayHero.status.over', input.locale);
  } else if (remaining === 0 && consumed > 0) {
    statusTone = 'complete';
    statusLabel = tr('screen.tabs.index.todayHero.status.complete', input.locale);
  } else if (remainingRatio > 0.6) {
    statusTone = 'good';
    statusLabel = tr('screen.tabs.index.todayHero.status.onTrack', input.locale);
  } else if (remainingRatio >= 0.3) {
    statusTone = 'steady';
    statusLabel = tr('screen.tabs.index.todayHero.status.steady', input.locale);
  } else {
    statusTone = 'near';
    statusLabel = tr('screen.tabs.index.todayHero.status.near', input.locale);
  }

  const proteinReached = proteinTarget !== null && proteinGap <= 0;
  const activityReached = activityGap <= 0;
  let motivation: string;
  if (!calorieTargetAvailable) {
    motivation = input.locale === 'vi'
      ? 'Hoàn tất hồ sơ để AI tính mục tiêu phù hợp.'
      : 'Complete your profile for a personalized target.';
  } else if (remaining < 0) {
    motivation = tr('screen.tabs.index.todayHero.motivation.over', input.locale);
  } else if (input.logsCount === 0) {
    motivation = tr('screen.tabs.index.todayHero.motivation.firstMeal', input.locale);
  } else if (input.streak >= 2) {
    motivation = tr('screen.tabs.index.todayHero.motivation.streak', input.locale, {
      days: format(input.streak, input.locale),
    });
  } else if (remainingRatio < 0.3) {
    motivation = tr('screen.tabs.index.todayHero.motivation.close', input.locale);
  } else if (!proteinReached) {
    motivation = tr('screen.tabs.index.todayHero.motivation.protein', input.locale);
  } else {
    motivation = tr('screen.tabs.index.todayHero.motivation.keepGoing', input.locale);
  }

  return {
    greeting: tr(`screen.tabs.index.todayHero.greeting.${dayPart}` as any, input.locale, { name }),
    calorieTargetAvailable,
    remainingCalories: remaining,
    remainingCaloriesLabel: calorieTargetAvailable ? format(remaining, input.locale) : '--',
    calorieLabel: !calorieTargetAvailable
      ? (input.locale === 'vi' ? 'Chưa có mục tiêu calorie' : 'No calorie target yet')
      : remaining < 0
      ? tr('screen.tabs.index.todayHero.exceededBy', input.locale, { kcal: format(Math.abs(remaining), input.locale) })
      : tr('screen.tabs.index.todayHero.remaining', input.locale),
    progressPercent: consumedPercent,
    progressLabel: calorieTargetAvailable ? `${consumedPercent}%` : '--',
    calorieProgressDetail: calorieTargetAvailable
      ? tr('screen.tabs.index.todayHero.progressDetail', input.locale, {
          consumed: format(consumed, input.locale),
          target: format(target, input.locale),
        })
      : (input.locale === 'vi' ? 'Bổ sung hồ sơ để bắt đầu theo dõi tiến độ.' : 'Complete your profile to track progress.'),
    statusLabel,
    statusTone,
    proteinTitle: proteinTarget === null
      ? tr('screen.tabs.index.todayHero.protein.guidance', input.locale)
      : proteinReached
        ? tr('screen.tabs.index.todayHero.protein.reached', input.locale)
        : tr('screen.tabs.index.todayHero.protein.low', input.locale, { grams: format(proteinGap, input.locale) }),
    proteinDetail: proteinTarget === null
      ? tr('screen.tabs.index.todayHero.protein.guidanceDetail', input.locale)
      : proteinReached
        ? tr('screen.tabs.index.todayHero.protein.reachedDetail', input.locale)
        : tr('screen.tabs.index.todayHero.protein.lowDetail', input.locale),
    proteinReached,
    activityTitle: activityReached
      ? tr('screen.tabs.index.todayHero.activity.reached', input.locale)
      : tr('screen.tabs.index.todayHero.activity.low', input.locale, { minutes: format(activityGap, input.locale) }),
    activityDetail: activityReached
      ? tr('screen.tabs.index.todayHero.activity.reachedDetail', input.locale)
      : tr('screen.tabs.index.todayHero.activity.lowDetail', input.locale),
    activityReached,
    motivation,
    sensitiveNutritionMode: Boolean(input.sensitiveNutritionMode),
  };
}

export function useTodayHero(input: TodayHeroInput) {
  return useMemo(
    () => buildTodayHero(input),
    [
      input.activityMinutes,
      input.activityTargetMinutes,
      input.consumedCalories,
      input.firstName,
      input.locale,
      input.logsCount,
      input.now,
      input.proteinG,
      input.proteinTargetG,
      input.streak,
      input.targetCalories,
      input.sensitiveNutritionMode,
    ],
  );
}
