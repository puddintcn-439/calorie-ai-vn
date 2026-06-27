import { useMemo } from 'react';
import { GoalPlan, UserGoal } from '@calorie-ai/types';
import { Locale, tr } from '../components/i18n';

export type TodayHeroTone = 'good' | 'steady' | 'near' | 'over';

export type TodayHeroModel = {
  greeting: string;
  remainingCalories: number;
  calorieLabel: string;
  statusLabel: string;
  statusTone: TodayHeroTone;
  proteinStatus: string;
  proteinReached: boolean;
  activityStatus: string;
  activityReached: boolean;
  motivation: string;
};

export type TodayHeroInput = {
  consumedCalories: number;
  targetCalories: number;
  proteinG: number;
  proteinTargetG: number;
  activityMinutes: number;
  activityTargetMinutes: number;
  logsCount: number;
  streak: number;
  firstName?: string;
  locale: Locale;
  now?: Date;
};

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function format(value: number, locale: Locale) {
  return Math.round(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US');
}

export function getProteinTarget(
  goal?: UserGoal,
  direction?: GoalPlan['direction'],
  weightKg = 65,
) {
  const kg = Math.max(35, finite(weightKg, 65));
  if (goal === 'gain_muscle' || direction === 'gain') return Math.round(kg * 1.6);
  if (goal === 'lose_weight' || direction === 'loss') return Math.round(kg * 1.4);
  return Math.round(kg * 1.2);
}

export function buildTodayHero(input: TodayHeroInput): TodayHeroModel {
  const target = Math.max(1, finite(input.targetCalories, 1800));
  const consumed = Math.max(0, finite(input.consumedCalories));
  const remaining = target - consumed;
  const remainingRatio = remaining / target;
  const proteinTarget = Math.max(1, finite(input.proteinTargetG, 78));
  const proteinGap = Math.max(0, proteinTarget - Math.max(0, finite(input.proteinG)));
  const activityTarget = Math.max(1, finite(input.activityTargetMinutes, 25));
  const activityGap = Math.max(0, activityTarget - Math.max(0, finite(input.activityMinutes)));
  const hour = (input.now ?? new Date()).getHours();
  const dayPart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const name = input.firstName?.trim() || tr('screen.tabs.index.todayHero.fallbackName', input.locale);

  let statusTone: TodayHeroTone;
  let statusLabel: string;
  if (remaining < 0) {
    statusTone = 'over';
    statusLabel = tr('screen.tabs.index.todayHero.status.over', input.locale);
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

  const proteinReached = proteinGap <= 0;
  const activityReached = activityGap <= 0;
  let motivation: string;
  if (remaining < 0) {
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
    remainingCalories: Math.max(0, remaining),
    calorieLabel: remaining < 0
      ? tr('screen.tabs.index.todayHero.exceededBy', input.locale, { kcal: format(Math.abs(remaining), input.locale) })
      : tr('screen.tabs.index.todayHero.remaining', input.locale),
    statusLabel,
    statusTone,
    proteinStatus: proteinReached
      ? tr('screen.tabs.index.todayHero.protein.reached', input.locale)
      : tr('screen.tabs.index.todayHero.protein.low', input.locale, { grams: format(proteinGap, input.locale) }),
    proteinReached,
    activityStatus: activityReached
      ? tr('screen.tabs.index.todayHero.activity.reached', input.locale)
      : tr('screen.tabs.index.todayHero.activity.low', input.locale, { minutes: format(activityGap, input.locale) }),
    activityReached,
    motivation,
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
    ],
  );
}
