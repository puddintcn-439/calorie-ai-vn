import { useMemo } from 'react';
import { Locale, tr } from '../components/i18n';

export type TodayCoachSuggestion = {
  type: 'scan' | 'protein' | 'calories' | 'movement' | 'complete';
  title: string;
  detail: string;
  value?: string;
  icon: 'scan-outline' | 'restaurant-outline' | 'flame' | 'walk-outline' | 'checkmark-circle';
  tone: 'nutrition' | 'calories' | 'movement' | 'success';
};

type TodayCoachInput = {
  logsCount: number;
  remainingCalories: number;
  proteinGapG: number;
  activityGapMinutes: number;
  locale: Locale;
};

function number(value: number, locale: Locale) {
  return Math.round(Math.abs(value)).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US');
}

export function buildTodayCoach(input: TodayCoachInput) {
  const suggestions: TodayCoachSuggestion[] = [];

  if (input.logsCount === 0) {
    suggestions.push({
      type: 'scan',
      title: tr('screen.tabs.index.aiCoach.firstMeal.title', input.locale),
      detail: tr('screen.tabs.index.aiCoach.firstMeal.detail', input.locale),
      icon: 'scan-outline',
      tone: 'nutrition',
    });
  } else if (input.remainingCalories < 0) {
    suggestions.push({
      type: 'calories',
      title: tr('screen.tabs.index.aiCoach.over.title', input.locale, {
        kcal: number(input.remainingCalories, input.locale),
      }),
      detail: tr('screen.tabs.index.aiCoach.over.detail', input.locale),
      value: `${number(input.remainingCalories, input.locale)} kcal`,
      icon: 'flame',
      tone: 'calories',
    });
  } else if (input.proteinGapG > 0) {
    suggestions.push({
      type: 'protein',
      title: tr('screen.tabs.index.aiCoach.protein.title', input.locale, {
        grams: number(input.proteinGapG, input.locale),
      }),
      detail: tr('screen.tabs.index.aiCoach.protein.detail', input.locale),
      value: `${number(input.proteinGapG, input.locale)}g`,
      icon: 'restaurant-outline',
      tone: 'nutrition',
    });
  }

  if (input.remainingCalories > 0 && input.logsCount > 0) {
    suggestions.push({
      type: 'calories',
      title: tr('screen.tabs.index.aiCoach.remaining.title', input.locale, {
        kcal: number(input.remainingCalories, input.locale),
      }),
      detail: tr('screen.tabs.index.aiCoach.remaining.detail', input.locale, {
        kcal: number(Math.min(input.remainingCalories, 500), input.locale),
      }),
      value: `${number(input.remainingCalories, input.locale)} kcal`,
      icon: 'flame',
      tone: 'calories',
    });
  }

  if (suggestions.length < 2 && input.activityGapMinutes > 0) {
    suggestions.push({
      type: 'movement',
      title: tr('screen.tabs.index.aiCoach.movement.title', input.locale, {
        minutes: number(input.activityGapMinutes, input.locale),
      }),
      detail: tr('screen.tabs.index.aiCoach.movement.detail', input.locale),
      value: tr('screen.tabs.index.aiCoach.movement.value', input.locale, {
        minutes: number(input.activityGapMinutes, input.locale),
      }),
      icon: 'walk-outline',
      tone: 'movement',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      type: 'complete',
      title: tr('screen.tabs.index.aiCoach.complete.title', input.locale),
      detail: tr('screen.tabs.index.aiCoach.complete.detail', input.locale),
      icon: 'checkmark-circle',
      tone: 'success',
    });
  }

  const motivation = input.remainingCalories < 0
    ? tr('screen.tabs.index.aiCoach.motivation.recover', input.locale)
    : suggestions[0]?.type === 'complete'
      ? tr('screen.tabs.index.aiCoach.motivation.complete', input.locale)
      : tr('screen.tabs.index.aiCoach.motivation.default', input.locale);

  return { suggestions: suggestions.slice(0, 2), motivation };
}

export function useTodayCoach(input: TodayCoachInput) {
  return useMemo(
    () => buildTodayCoach(input),
    [input.activityGapMinutes, input.locale, input.logsCount, input.proteinGapG, input.remainingCalories],
  );
}
