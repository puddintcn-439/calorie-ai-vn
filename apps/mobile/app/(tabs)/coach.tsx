import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ScreenShell, SurfaceCard, useBottomNavContentPadding } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiInput } from '../../components/ui-input';
import { askCoach } from '../../services/ai.service';
import { useLogStore } from '../../store/log.store';
import { CoachingInsight, CoachingSummary, DailyLog } from '@calorie-ai/types';
import { apiClient } from '../../services/api';
import { VisualHeroCard } from '../../components/visual-hero-card';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { Text } from '../../components/i18n-text';
import { Locale, tr, translateText, useI18n } from '../../components/i18n';
import { formatPercent, safeRound, toFiniteNumber } from '../../services/number-format';
import { appLogger } from '../../services/logger.service';

const coachHeroIllustration = require('../../assets/images/coach-hero.jpg') as number;

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  text: string;
}

type ActivePlan = {
  title: string;
  body: string;
  status: string;
  tone: 'good' | 'warn' | 'info';
  steps: string[];
  prompts: string[];
  primaryRoute: '/scan' | '/log' | '/progress';
  primaryLabel: string;
};

type WeeklyPlan = {
  title: string;
  body: string;
  status: string;
  tone: 'good' | 'warn' | 'info';
  days: Array<{
    label: string;
    title: string;
    body: string;
  }>;
};

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const MEAL_LABEL_KEYS: Record<(typeof MEAL_ORDER)[number], Parameters<typeof tr>[0]> = {
  breakfast: 'screen.tabs.coach.meal.breakfast',
  lunch: 'screen.tabs.coach.meal.lunch',
  dinner: 'screen.tabs.coach.meal.dinner',
  snack: 'screen.tabs.coach.meal.snack',
};

function getNextMealLabel(logs: Array<{ meal_type?: string }> = [], locale: Locale) {
  const loggedMeals = new Set(logs.map((log) => log.meal_type).filter(Boolean));
  const nextMeal = MEAL_ORDER.find((meal) => !loggedMeals.has(meal)) ?? 'snack';
  return tr(MEAL_LABEL_KEYS[nextMeal], locale);
}

function buildActivePlan(dailyLog: DailyLog | null, locale: Locale): ActivePlan {
  const logs = dailyLog?.logs ?? [];
  const consumed = toFiniteNumber(dailyLog?.total_calories) ?? 0;
  const target = toFiniteNumber(dailyLog?.target_calories) ?? 1800;
  const protein = toFiniteNumber(dailyLog?.total_protein_g) ?? 0;
  const remaining = target - consumed;
  const mealCount = logs.length;
  const nextMeal = getNextMealLabel(logs, locale);
  const proteinTarget = Math.max(70, Math.round(target * 0.075 / 4));

  if (mealCount === 0) {
    return {
      title: tr('screen.tabs.coach.active.empty.title', locale),
      body: tr('screen.tabs.coach.active.empty.body', locale),
      status: tr('screen.tabs.coach.active.empty.status', locale),
      tone: 'info',
      steps: [
        tr('screen.tabs.coach.active.empty.step1', locale),
        tr('screen.tabs.coach.active.empty.step2', locale, { min: Math.round(target * 0.3), max: Math.round(target * 0.4) }),
        tr('screen.tabs.coach.active.empty.step3', locale),
      ],
      prompts: [
        tr('screen.tabs.coach.active.empty.prompt1', locale),
        tr('screen.tabs.coach.active.empty.prompt2', locale, { target }),
      ],
      primaryRoute: '/scan',
      primaryLabel: tr('screen.tabs.coach.active.empty.primary', locale),
    };
  }

  if (remaining < -150) {
    const kcal = Math.abs(Math.round(remaining));
    return {
      title: tr('screen.tabs.coach.active.over.title', locale),
      body: tr('screen.tabs.coach.active.over.body', locale),
      status: tr('screen.tabs.coach.active.over.status', locale, { kcal }),
      tone: 'warn',
      steps: [
        tr('screen.tabs.coach.active.over.step1', locale),
        tr('screen.tabs.coach.active.over.step2', locale),
        tr('screen.tabs.coach.active.over.step3', locale),
      ],
      prompts: [
        tr('screen.tabs.coach.active.over.prompt1', locale),
        tr('screen.tabs.coach.active.over.prompt2', locale),
      ],
      primaryRoute: '/log',
      primaryLabel: tr('screen.tabs.coach.active.over.primary', locale),
    };
  }

  if (remaining > 450) {
    const kcal = Math.round(remaining);
    const snackKcal = Math.min(450, Math.max(250, Math.round(remaining * 0.55)));
    return {
      title: tr('screen.tabs.coach.active.room.title', locale, { meal: nextMeal }),
      body: tr('screen.tabs.coach.active.room.body', locale),
      status: tr('screen.tabs.coach.active.room.status', locale, { kcal }),
      tone: 'good',
      steps: [
        tr('screen.tabs.coach.active.room.step1', locale, { meal: nextMeal }),
        tr('screen.tabs.coach.active.room.step2', locale, { kcal: snackKcal }),
        tr('screen.tabs.coach.active.room.step3', locale),
      ],
      prompts: [
        tr('screen.tabs.coach.active.room.prompt1', locale, { kcal, meal: nextMeal }),
        tr('screen.tabs.coach.active.room.prompt2', locale),
      ],
      primaryRoute: '/scan',
      primaryLabel: tr('screen.tabs.coach.active.room.primary', locale, { meal: nextMeal }),
    };
  }

  if (protein < proteinTarget * 0.65) {
    return {
      title: tr('screen.tabs.coach.active.protein.title', locale),
      body: tr('screen.tabs.coach.active.protein.body', locale),
      status: `${Math.round(protein)}/${proteinTarget}g protein`,
      tone: 'info',
      steps: [
        tr('screen.tabs.coach.active.protein.step1', locale),
        tr('screen.tabs.coach.active.protein.step2', locale),
        tr('screen.tabs.coach.active.protein.step3', locale),
      ],
      prompts: [
        tr('screen.tabs.coach.active.protein.prompt1', locale, { protein: Math.round(protein) }),
        tr('screen.tabs.coach.active.protein.prompt2', locale),
      ],
      primaryRoute: '/scan',
      primaryLabel: tr('screen.tabs.coach.active.protein.primary', locale),
    };
  }

  const kcal = Math.max(0, Math.round(remaining));
  return {
    title: tr('screen.tabs.coach.active.track.title', locale),
    body: tr('screen.tabs.coach.active.track.body', locale),
    status: tr('screen.tabs.coach.active.track.status', locale, { kcal }),
    tone: 'good',
    steps: [
      tr('screen.tabs.coach.active.track.step1', locale, { meal: nextMeal }),
      tr('screen.tabs.coach.active.track.step2', locale),
      tr('screen.tabs.coach.active.track.step3', locale),
    ],
    prompts: [
      tr('screen.tabs.coach.active.track.prompt1', locale),
      tr('screen.tabs.coach.active.track.prompt2', locale),
    ],
    primaryRoute: '/scan',
    primaryLabel: tr('screen.tabs.coach.active.track.primary', locale, { meal: nextMeal }),
  };
}

function buildWeeklyPlan(summary: CoachingSummary | null, dailyLog: DailyLog | null, locale: Locale): WeeklyPlan {
  const logsCount = toFiniteNumber(summary?.logs_count) ?? 0;
  const adherence = toFiniteNumber(summary?.adherence_percentage);
  const averageDailyCalories = toFiniteNumber(summary?.average_daily_calories);
  const target = toFiniteNumber(dailyLog?.target_calories) ?? 1800;
  const todayLogs = dailyLog?.logs?.length ?? 0;

  if (!summary || logsCount < 7) {
    const missingLogs = Math.max(0, 7 - logsCount);
    return {
      title: tr('screen.tabs.coach.week.restart.title', locale),
      body: tr('screen.tabs.coach.week.restart.body', locale),
      status: logsCount > 0
        ? tr('screen.tabs.coach.week.restart.statusMissing', locale, { count: missingLogs })
        : tr('screen.tabs.coach.week.restart.statusEmpty', locale),
      tone: 'info',
      days: [
        {
          label: tr('screen.tabs.coach.week.restart.d1.label', locale),
          title: tr('screen.tabs.coach.week.restart.d1.title', locale),
          body: todayLogs > 0
            ? tr('screen.tabs.coach.week.restart.d1.bodyHasData', locale)
            : tr('screen.tabs.coach.week.restart.d1.bodyEmpty', locale),
        },
        {
          label: tr('screen.tabs.coach.week.restart.d2.label', locale),
          title: tr('screen.tabs.coach.week.restart.d2.title', locale),
          body: tr('screen.tabs.coach.week.restart.d2.body', locale),
        },
        {
          label: tr('screen.tabs.coach.week.restart.d3.label', locale),
          title: tr('screen.tabs.coach.week.restart.d3.title', locale),
          body: tr('screen.tabs.coach.week.restart.d3.body', locale),
        },
      ],
    };
  }

  if (adherence !== null && adherence > 115) {
    return {
      title: tr('screen.tabs.coach.week.reduce.title', locale),
      body: tr('screen.tabs.coach.week.reduce.body', locale),
      status: tr('screen.tabs.coach.week.adherence', locale, { percent: Math.round(adherence) }),
      tone: 'warn',
      days: [
        {
          label: tr('screen.tabs.coach.week.restart.d1.label', locale),
          title: tr('screen.tabs.coach.week.reduce.d1.title', locale),
          body: tr('screen.tabs.coach.week.reduce.d1.body', locale),
        },
        {
          label: tr('screen.tabs.coach.week.restart.d2.label', locale),
          title: tr('screen.tabs.coach.week.reduce.d2.title', locale),
          body: tr('screen.tabs.coach.week.reduce.d2.body', locale, { min: Math.round(target * 0.28), max: Math.round(target * 0.34) }),
        },
        {
          label: tr('screen.tabs.coach.week.restart.d3.label', locale),
          title: tr('screen.tabs.coach.week.reduce.d3.title', locale),
          body: tr('screen.tabs.coach.week.reduce.d3.body', locale),
        },
      ],
    };
  }

  if (adherence !== null && adherence < 80) {
    return {
      title: tr('screen.tabs.coach.week.enough.title', locale),
      body: tr('screen.tabs.coach.week.enough.body', locale),
      status: tr('screen.tabs.coach.week.adherence', locale, { percent: Math.round(adherence) }),
      tone: 'info',
      days: [
        {
          label: tr('screen.tabs.coach.week.restart.d1.label', locale),
          title: tr('screen.tabs.coach.week.enough.d1.title', locale),
          body: tr('screen.tabs.coach.week.enough.d1.body', locale),
        },
        {
          label: tr('screen.tabs.coach.week.restart.d2.label', locale),
          title: tr('screen.tabs.coach.week.enough.d2.title', locale),
          body: tr('screen.tabs.coach.week.enough.d2.body', locale),
        },
        {
          label: tr('screen.tabs.coach.week.restart.d3.label', locale),
          title: tr('screen.tabs.coach.week.enough.d3.title', locale),
          body: tr('screen.tabs.coach.week.enough.d3.body', locale, { min: Math.round(target * 0.85), max: Math.round(target) }),
        },
      ],
    };
  }

  return {
    title: tr('screen.tabs.coach.week.momentum.title', locale),
    body: tr('screen.tabs.coach.week.momentum.body', locale),
    status: averageDailyCalories !== null
      ? tr('screen.tabs.coach.week.momentum.statusCalories', locale, { kcal: Math.round(averageDailyCalories) })
      : tr('screen.tabs.coach.week.momentum.statusStable', locale),
    tone: 'good',
    days: [
      {
        label: tr('screen.tabs.coach.week.restart.d1.label', locale),
        title: tr('screen.tabs.coach.week.momentum.d1.title', locale),
        body: tr('screen.tabs.coach.week.momentum.d1.body', locale),
      },
      {
        label: tr('screen.tabs.coach.week.restart.d2.label', locale),
        title: tr('screen.tabs.coach.week.momentum.d2.title', locale),
        body: tr('screen.tabs.coach.week.momentum.d2.body', locale),
      },
      {
        label: tr('screen.tabs.coach.week.restart.d3.label', locale),
        title: tr('screen.tabs.coach.week.momentum.d3.title', locale),
        body: tr('screen.tabs.coach.week.momentum.d3.body', locale),
      },
    ],
  };
}

function getInsightContentKey(insight: Pick<CoachingInsight, 'title' | 'description' | 'action_suggestion'>): string {
  return [
    insight.title,
    insight.description,
    insight.action_suggestion ?? '',
  ].map((value) => String(value).trim().toLowerCase()).join('|');
}

function dedupeInsights(items: CoachingInsight[]) {
  const byContent = new Map<string, CoachingInsight>();

  for (const item of items) {
    const key = getInsightContentKey(item);
    const existing = byContent.get(key);

    if (!existing) {
      byContent.set(key, item);
      continue;
    }

    const existingScore = existing.impact_score ?? 0;
    const itemScore = item.impact_score ?? 0;
    const existingDate = Date.parse(existing.created_at ?? '') || 0;
    const itemDate = Date.parse(item.created_at ?? '') || 0;

    if (itemScore > existingScore || (itemScore === existingScore && itemDate > existingDate)) {
      byContent.set(key, item);
    }
  }

  return [...byContent.values()];
}

const INSIGHT_TYPE_LABEL_KEYS: Record<string, Parameters<typeof tr>[0]> = {
  pattern_alert: 'screen.tabs.coach.insightType.pattern_alert',
  recommendation: 'screen.tabs.coach.insightType.recommendation',
  achievement: 'screen.tabs.coach.insightType.achievement',
  warning: 'screen.tabs.coach.insightType.warning',
  prediction: 'screen.tabs.coach.insightType.prediction',
};

function getLocalizedInsightTypeLabel(type: string, locale: Locale) {
  return tr(INSIGHT_TYPE_LABEL_KEYS[type] ?? 'screen.tabs.coach.insightType.fallback', locale);
}

function localizeInsightTextForLocale(text: string | null | undefined, locale: Locale) {
  return text ? translateText(text, locale) : '';
}
function formatSummaryNumber(value: unknown, fallback = '--') {
  const numeric = toFiniteNumber(value);
  return numeric === null ? fallback : String(safeRound(numeric));
}

function formatSummaryPercent(value: unknown) {
  return formatPercent(value);
}

function getCoachErrorMessage(error: unknown, locale: Locale): string {
  const fallback = tr('screen.tabs.coach.error.connection', locale);

  const err: any = error;
  const rawMessage = String(err?.message ?? '').toLowerCase();
  const status = Number(err?.response?.status ?? 0);
  const backendMessage = String(err?.response?.data?.message ?? '').trim();

  if (rawMessage.includes('only available on premium') || rawMessage.includes('premium or pro')) {
    return tr('screen.tabs.coach.error.premium', locale);
  }

  if (status === 401) {
    return tr('screen.tabs.coach.error.session', locale);
  }

  if (status >= 500 && backendMessage) {
    return tr('screen.tabs.coach.error.backend', locale, { message: backendMessage });
  }

  if (backendMessage) {
    return backendMessage;
  }

  if (rawMessage.includes('network')) {
    return tr('screen.tabs.coach.error.network', locale);
  }

  return fallback;
}

export default function CoachScreen() {
  useAppTheme();
  const coachScrollRef = useRef<ScrollView>(null);
  const bottomContentPadding = useBottomNavContentPadding();
  const { locale, t } = useI18n();
  const { dailyLog, fetchDailyLog } = useLogStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<CoachingInsight[]>([]);
  const [summary, setSummary] = useState<CoachingSummary | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'coach',
      text: tr('screen.tabs.coach.message.welcome'),
    },
  ]);

  useEffect(() => {
    setMessages((prev) => prev.map((message) => (
      message.id === 'welcome'
        ? { ...message, text: t('screen.tabs.coach.message.welcome') }
        : message
    )));
  }, [t]);

  const loadInsights = useCallback(async () => {
    try {
      setLoadingInsights(true);
      setInsightsError(null);
      const [insightsResult, summaryResult] = await Promise.allSettled([
        apiClient.get('/coaching/insights'),
        apiClient.get('/coaching/weekly-summary'),
      ]);

      if (insightsResult.status === 'fulfilled') {
        setInsights(dedupeInsights(insightsResult.value.data || []));
      } else {
        setInsights([]);
        setInsightsError(getCoachErrorMessage(insightsResult.reason, locale));
      }

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value.data || null);
      } else {
        setSummary(null);
        if (insightsResult.status === 'fulfilled') {
          setInsightsError(getCoachErrorMessage(summaryResult.reason, locale));
        }
      }
    } catch (error) {
      setInsights([]);
      setSummary(null);
      setInsightsError(getCoachErrorMessage(error, locale));
    } finally {
      setLoadingInsights(false);
    }
  }, []);

  const refreshCoachData = useCallback(() => {
    fetchDailyLog().catch(() => {});
    loadInsights().catch(() => {});
  }, [fetchDailyLog, loadInsights]);

  useEffect(() => {
    refreshCoachData();
  }, [refreshCoachData]);

  useFocusEffect(
    useCallback(() => {
      refreshCoachData();
    }, [refreshCoachData]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchDailyLog(), loadInsights()]);
    } finally {
      setRefreshing(false);
    }
  };

  const context = useMemo(() => {
    const consumed = dailyLog?.total_calories ?? 0;
    const target = dailyLog?.target_calories ?? 1800;
    return {
      today_calories: consumed,
      target_calories: target,
    };
  }, [dailyLog]);
  const activePlan = useMemo(() => buildActivePlan(dailyLog, locale), [dailyLog, locale]);
  const weeklyPlan = useMemo(() => buildWeeklyPlan(summary, dailyLog, locale), [summary, dailyLog, locale]);
  const summaryRecommendation = localizeInsightTextForLocale(summary?.recommended_action, locale) || t('screen.tabs.coach.summaryFallback');

  const handleSend = async () => {
    const message = input.trim();
    if (!message || loading) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: message,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await askCoach(message, context);
      const coachMessage: ChatMessage = {
        id: `c-${Date.now()}`,
        role: 'coach',
        text: res.message,
      };
      setMessages((prev) => [...prev, coachMessage]);
    } catch (error) {
      const fallback: ChatMessage = {
        id: `c-${Date.now()}`,
        role: 'coach',
        text: getCoachErrorMessage(error, locale),
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeInsight = async (insightId: number) => {
    try {
      await apiClient.post(`/coaching/insights/${insightId}/acknowledge`);
      const acknowledged = insights.find((insight) => insight.id === insightId);
      const acknowledgedKey = acknowledged ? getInsightContentKey(acknowledged) : null;
      setInsights((prev) => prev.filter((insight) => (
        insight.id !== insightId && (!acknowledgedKey || getInsightContentKey(insight) !== acknowledgedKey)
      )));
    } catch (error) {
      appLogger.warn('Coach', 'Failed to acknowledge insight', error);
    }
  };

  const handleUsePrompt = (prompt: string) => {
    setInput(prompt);
  };

  const scrollToInput = useCallback(() => {
    setTimeout(() => {
      coachScrollRef.current?.scrollToEnd({ animated: true });
    }, Platform.OS === 'ios' ? 280 : 180);
  }, [locale]);

  const renderInsightCard = (insight: CoachingInsight) => (
    <View key={insight.id} style={styles.insightCard}>
      <View style={styles.insightHeader}>
        <Text style={styles.insightEmoji}>{insight.emoji || '💡'}</Text>
        <View style={styles.insightTitleContainer}>
          <Text style={styles.insightTitle}>{localizeInsightTextForLocale(insight.title, locale)}</Text>
          <Text style={styles.insightType}>{getLocalizedInsightTypeLabel(insight.insight_type, locale)}</Text>
        </View>
      </View>
      <Text style={styles.insightDescription}>{localizeInsightTextForLocale(insight.description, locale)}</Text>
      {insight.action_suggestion && (
        <Text style={styles.insightAction}>💡 {localizeInsightTextForLocale(insight.action_suggestion, locale)}</Text>
      )}
      <UiButton
        label="screen.tabs.coach.label.001"
        onPress={() => handleAcknowledgeInsight(insight.id)}
        style={styles.acknowledgeButton}
      />
    </View>
  );

  return (
    <ScreenShell scroll={false} reserveBottomNav={false}>
      <ScrollView
        ref={coachScrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomContentPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <VisualHeroCard
          imageSource={coachHeroIllustration}
          eyebrow="screen.tabs.coach.eyebrow.001"
          title="screen.tabs.coach.title.001"
          body="screen.tabs.coach.body.001"
        />

        <SurfaceCard
          style={[
            styles.activePlanCard,
            activePlan.tone === 'good' && styles.activePlanGood,
            activePlan.tone === 'warn' && styles.activePlanWarn,
          ]}
        >
          <View style={styles.activePlanHeader}>
            <View style={styles.activePlanCopy}>
              <Text style={styles.activePlanEyebrow}>{t('screen.tabs.coach.plan.todayEyebrow')}</Text>
              <Text style={styles.activePlanTitle}>{activePlan.title}</Text>
              <Text style={styles.activePlanBody}>{activePlan.body}</Text>
            </View>
            <View style={[
              styles.activePlanStatusPill,
              activePlan.tone === 'warn' && styles.activePlanStatusPillWarn,
            ]}>
              <Text style={[
                styles.activePlanStatusText,
                activePlan.tone === 'warn' && styles.activePlanStatusTextWarn,
              ]}>
                {activePlan.status}
              </Text>
            </View>
          </View>

          <View style={styles.planSteps}>
            {activePlan.steps.map((step, index) => (
              <View key={`${step}-${index}`} style={styles.planStep}>
                <Text style={styles.planStepIndex}>{index + 1}</Text>
                <Text style={styles.planStepText}>{step}</Text>
              </View>
            ))}
          </View>

          <View style={styles.planActions}>
            <UiButton
              label={activePlan.primaryLabel}
              onPress={() => router.push(activePlan.primaryRoute)}
              style={styles.planPrimaryAction}
            />
            <UiButton
              label="screen.tabs.coach.plan.viewToday"
              variant="secondary"
              onPress={() => router.push('/')}
              style={styles.planSecondaryAction}
            />
          </View>

          <View style={styles.promptRow}>
            {activePlan.prompts.map((prompt) => (
              <TouchableOpacity key={prompt} style={styles.promptChip} onPress={() => handleUsePrompt(prompt)}>
                <Text style={styles.promptChipText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </SurfaceCard>

        <SurfaceCard
          style={[
            styles.weeklyPlanCard,
            weeklyPlan.tone === 'good' && styles.weeklyPlanGood,
            weeklyPlan.tone === 'warn' && styles.weeklyPlanWarn,
          ]}
        >
          <View style={styles.weeklyPlanHeader}>
            <View style={styles.weeklyPlanCopy}>
              <Text style={styles.weeklyPlanEyebrow}>{t('screen.tabs.coach.plan.weekEyebrow')}</Text>
              <Text style={styles.weeklyPlanTitle}>{weeklyPlan.title}</Text>
              <Text style={styles.weeklyPlanBody}>{weeklyPlan.body}</Text>
            </View>
            <Text style={[
              styles.weeklyPlanStatus,
              weeklyPlan.tone === 'warn' && styles.weeklyPlanStatusWarn,
            ]}>
              {weeklyPlan.status}
            </Text>
          </View>

          <View style={styles.weeklyPlanGrid}>
            {weeklyPlan.days.map((day) => (
              <View key={day.label} style={styles.weeklyPlanDay}>
                <Text style={styles.weeklyPlanDayLabel}>{day.label}</Text>
                <Text style={styles.weeklyPlanDayTitle}>{day.title}</Text>
                <Text style={styles.weeklyPlanDayBody}>{day.body}</Text>
              </View>
            ))}
          </View>
        </SurfaceCard>

        {/* Weekly Summary */}
        {summary && (
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryTitle} i18nKey="screen.tabs.coach.text.001" />
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel} i18nKey="screen.tabs.coach.text.002" />
                <Text style={styles.summaryValue}>{formatSummaryPercent(summary.adherence_percentage)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel} i18nKey="screen.tabs.coach.text.003" />
                <Text style={styles.summaryValue}>{formatSummaryNumber(summary.logs_count, '0')}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel} i18nKey="screen.tabs.coach.text.004" />
                <Text style={styles.summaryValue}>
                  {formatSummaryNumber(summary.average_daily_calories)}
                </Text>
              </View>
            </View>
            <Text style={styles.summaryRecommendation}>{summaryRecommendation}</Text>
          </SurfaceCard>
        )}

        {/* Insights List */}
        {loadingInsights ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={theme.colors.accentMint} size="large" />
          </View>
        ) : insightsError ? (
          <SurfaceCard style={styles.noInsightsCard}>
            <Text style={styles.noInsightsText}>{insightsError}</Text>
            <UiButton label="common.tryAgain" onPress={() => loadInsights().catch(() => {})} />
          </SurfaceCard>
        ) : insights.length > 0 ? (
          <View style={styles.insightsContainer}>
            <Text style={styles.insightsTitle} i18nKey="screen.tabs.coach.text.005" />
            {insights.map((insight) => renderInsightCard(insight))}
          </View>
        ) : (
          <SurfaceCard style={styles.noInsightsCard}>
            <Text style={styles.noInsightsText}>
              {t('screen.tabs.coach.emptyInsights')}
            </Text>
          </SurfaceCard>
        )}

        {/* Context Card */}
        <SurfaceCard style={styles.contextCard}>
          <Text style={styles.contextTitle} i18nKey="screen.tabs.coach.text.006" />
          <Text style={styles.contextLine}>{t('screen.tabs.coach.context.consumedLine', { kcal: context.today_calories })}</Text>
          <Text style={styles.contextLine}>{t('screen.tabs.coach.context.targetLine', { kcal: context.target_calories })}</Text>
          <Text style={styles.contextLine}>
            {t('screen.tabs.coach.context.remainingLine', { kcal: context.target_calories - context.today_calories })}
          </Text>
          <View style={styles.contextActions}>
            <UiButton
              label="screen.tabs.coach.action.logMeal"
              onPress={() => router.push('/scan')}
              style={styles.contextActionButton}
            />
            <UiButton
              label="screen.tabs.coach.action.today"
              variant="secondary"
              onPress={() => router.push('/')}
              style={styles.contextActionButton}
            />
          </View>
        </SurfaceCard>

        {/* Chat Messages */}
        <View style={styles.chatList}>
          {messages.map((msg) => (
            <SurfaceCard
              key={msg.id}
              style={[
                styles.messageCard,
                msg.role === 'user' ? styles.userCard : styles.coachCard,
              ]}
            >
              <Text style={styles.roleLabel}>{msg.role === 'user' ? t('screen.tabs.coach.role.user') : 'Coach'}</Text>
              <Text style={styles.messageText}>{msg.text}</Text>
            </SurfaceCard>
          ))}
        </View>

        {/* Input Area */}
        <SurfaceCard style={styles.inputCard}>
          <UiInput
            label="screen.tabs.coach.label.002"
            value={input}
            onChangeText={setInput}
            placeholder="screen.tabs.coach.placeholder.001"
            multiline
            onFocus={scrollToInput}
            style={styles.input}
          />
          <UiButton label="screen.tabs.coach.label.003" onPress={handleSend} loading={loading} />
          {loading ? <ActivityIndicator color={theme.colors.accentMint} style={styles.loading} /> : null}
        </SurfaceCard>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  scrollContent: {
    flexGrow: 1,
    paddingTop: 14,
  },
  heroBody: {
    marginBottom: 14,
    maxWidth: 720,
  },
  activePlanCard: {
    marginBottom: 12,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
  },
  activePlanGood: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  activePlanWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  activePlanHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  activePlanCopy: {
    flex: 1,
    minWidth: 0,
  },
  activePlanEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
  },
  activePlanTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  activePlanBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  activePlanStatusPill: {
    minHeight: 30,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePlanStatusPillWarn: {
    borderColor: colors.borderWarning,
  },
  activePlanStatusText: {
    color: colors.accentCyan,
    fontSize: 12,
    fontWeight: '900',
  },
  activePlanStatusTextWarn: {
    color: colors.accentAmber,
  },
  planSteps: {
    gap: 8,
  },
  planStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  planStepIndex: {
    width: 22,
    height: 22,
    borderRadius: 999,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 22,
    color: colors.textOnAccent,
    backgroundColor: colors.accentMint,
    fontSize: 12,
    fontWeight: '900',
  },
  planStepText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  planActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  planPrimaryAction: {
    flex: 1.1,
    paddingVertical: 11,
  },
  planSecondaryAction: {
    flex: 0.9,
    paddingVertical: 11,
  },
  promptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  promptChip: {
    flexGrow: 1,
    flexBasis: '46%',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  promptChipText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  weeklyPlanCard: {
    marginBottom: 12,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
  },
  weeklyPlanGood: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
  },
  weeklyPlanWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  weeklyPlanHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  weeklyPlanCopy: {
    flex: 1,
    minWidth: 0,
  },
  weeklyPlanEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
  },
  weeklyPlanTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  weeklyPlanBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  weeklyPlanStatus: {
    color: colors.accentCyan,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    maxWidth: 128,
  },
  weeklyPlanStatusWarn: {
    color: colors.accentAmber,
  },
  weeklyPlanGrid: {
    gap: 8,
  },
  weeklyPlanDay: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
  },
  weeklyPlanDayLabel: {
    color: colors.accentCyan,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
  },
  weeklyPlanDayTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  weeklyPlanDayBody: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  summaryCard: {
    marginBottom: 12,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    color: colors.accentMint,
    fontSize: 18,
    fontWeight: '700',
  },
  summaryRecommendation: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  insightsContainer: {
    marginBottom: 12,
  },
  insightsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  insightCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.accentMint,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  insightEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  insightTitleContainer: {
    flex: 1,
  },
  insightTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  insightType: {
    color: colors.accentMint,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  insightDescription: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  insightAction: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
    backgroundColor: colors.surfaceSuccess,
    padding: 8,
    borderRadius: 8,
  },
  acknowledgeButton: {
    marginTop: 8,
  },
  noInsightsCard: {
    marginBottom: 12,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSuccess,
  },
  noInsightsText: {
    color: colors.accentMint,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  loadingContainer: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },
  contextCard: {
    marginBottom: 12,
    borderColor: colors.border,
  },
  contextTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  contextLine: {
    color: colors.textSoft,
    fontSize: 13,
    marginBottom: 4,
  },
  contextActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  contextActionButton: {
    flex: 1,
    paddingVertical: 11,
  },
  chatList: {
    gap: 10,
    marginBottom: 12,
  },
  messageCard: {
    borderWidth: 1,
  },
  userCard: {
    borderColor: colors.accentMint,
    backgroundColor: colors.surfaceSuccess,
  },
  coachCard: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  roleLabel: {
    color: colors.info,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  messageText: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  inputCard: {
    marginBottom: 20,
  },
  input: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  loading: {
    marginTop: 10,
  },
}));


