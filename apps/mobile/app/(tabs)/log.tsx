import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useLogStore } from '../../store/log.store';
import { useAuthStore } from '../../store/auth.store';
import { FoodLog, MealType, SavedMeal, ActivityLog, ActivityType, ACTIVITY_LABELS, User, ActivityLevel, UserGoal, HealthFlag } from '@calorie-ai/types';
import { ScreenShell, SkeletonBlock, SurfaceCard } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';
import { createThemedStyles, useAppTheme } from '../../components/theme';
import { apiClient } from '../../services/api';
import { formatKcal, formatMacro, safeNumber, safeRound, toFiniteNumber } from '../../services/number-format';
import { VisualHeroCard } from '../../components/visual-hero-card';
import { AnimatedIonicon } from '../../components/animated-icon';
import { RewardToast, RewardToastData } from '../../components/reward-toast';
import { useI18n } from '../../components/i18n';
import type { I18nKey } from '../../components/i18n';
import { TextInput } from '../../components/i18n-text-input';
import { PortionInput } from '../../components/portion-input';
import { scaleNutrition } from '../../services/portion.service';
import { HydrationScheduleCard } from '../../components/today/HydrationScheduleCard';
import { buildSystemHydrationSlots, normalizeHydrationSlots } from '../../services/hydration-schedule';
import { pushNotificationService } from '../../services/push-notification.service';

const logHeroIllustration = require('../../assets/images/log-hero.jpg') as number;

const MEAL_LABELS: Record<MealType, I18nKey> = {
  breakfast: 'screen.tabs.log.meal.breakfast',
  lunch: 'screen.tabs.log.meal.lunch',
  dinner: 'screen.tabs.log.meal.dinner',
  snack: 'screen.tabs.log.meal.snack',
};

type SavedMealNutrientKey = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g';

function sumSavedMealItems(meal: SavedMeal, key: SavedMealNutrientKey): number | null {
  if (!Array.isArray(meal.items) || meal.items.length === 0) return null;

  let hasValue = false;
  const total = meal.items.reduce((sum, item) => {
    const value = toFiniteNumber(item[key]);
    if (value === null) return sum;
    hasValue = true;
    return sum + value;
  }, 0);

  return hasValue ? total : null;
}

function getSavedMealDisplayTotals(meal: SavedMeal) {
  const calories = toFiniteNumber((meal as Partial<SavedMeal>).total_calories) ?? sumSavedMealItems(meal, 'calories');
  const protein = toFiniteNumber((meal as Partial<SavedMeal>).total_protein_g) ?? sumSavedMealItems(meal, 'protein_g');
  const carbs = toFiniteNumber((meal as Partial<SavedMeal>).total_carbs_g) ?? sumSavedMealItems(meal, 'carbs_g');
  const fat = toFiniteNumber((meal as Partial<SavedMeal>).total_fat_g) ?? sumSavedMealItems(meal, 'fat_g');

  return {
    calories: calories === null ? null : safeRound(calories),
    protein: protein === null ? null : safeRound(protein),
    carbs: carbs === null ? null : safeRound(carbs),
    fat: fat === null ? null : safeRound(fat),
  };
}

function formatSavedMealNumber(value: number | null): string {
  return value === null ? '--' : String(value);
}

type BodyStatus = 'underweight' | 'normal' | 'overweight' | 'obese';
type WeightRecommendation = 'increase' | 'maintain' | 'decrease';

const HEALTH_FLAGS: HealthFlag[] = [
  'pregnant',
  'breastfeeding',
  'kidney_disease',
  'diabetes',
  'eating_disorder_history',
  'weight_affecting_medication',
];

type ExerciseRoadmapItem = {
  id: string;
  title: string;
  detail: string;
  activity_type: ActivityType;
  duration_min: number;
  estimated_kcal: number;
  is_custom?: boolean;
};

function parseRoadmapNote(notes?: string): { taskId: string; taskTitle: string } | null {
  if (!notes || !notes.startsWith('ROADMAP_TASK:')) return null;
  const payload = notes.replace('ROADMAP_TASK:', '');
  const [taskId, taskTitle = 'screen.tabs.log.roadmap.defaultTask'] = payload.split('|');
  if (!taskId) return null;
  return { taskId, taskTitle };
}

function inferBodyStatus(weightKg?: number, heightCm?: number): BodyStatus | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null;
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  return 'obese';
}

function inferWeightRecommendation(bodyStatus: BodyStatus): WeightRecommendation {
  if (bodyStatus === 'underweight') return 'increase';
  if (bodyStatus === 'normal') return 'maintain';
  return 'decrease';
}

function normaliseHealthFlags(flags: unknown): HealthFlag[] {
  if (!Array.isArray(flags)) return [];
  return [...new Set(flags.filter((flag): flag is HealthFlag => HEALTH_FLAGS.includes(flag as HealthFlag)))];
}

function getSafeRoadmapGoal(profile: Partial<User>, bodyStatus: BodyStatus): UserGoal {
  const flags = normaliseHealthFlags(profile.health_flags);
  if (
    (profile.age && profile.age < 18)
    || flags.includes('pregnant')
    || flags.includes('breastfeeding')
    || flags.includes('eating_disorder_history')
    || (bodyStatus === 'underweight' && profile.goal === 'lose_weight')
  ) {
    return 'maintain';
  }

  return profile.goal ?? 'maintain';
}

import { estimateExerciseCalories as _estimateExerciseCalories } from '../../services/exercise.service';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';

function estimateExerciseCalories(activityType: ActivityType, durationMin: number, weightKg: number): number {
  return _estimateExerciseCalories(activityType, durationMin, weightKg);
}

function buildExerciseRoadmap(
  bodyStatus: BodyStatus,
  activityLevel: ActivityLevel,
  goal: UserGoal,
  weightKg: number,
): ExerciseRoadmapItem[] {
  const recommendation = inferWeightRecommendation(bodyStatus);
  const key = `${bodyStatus}-${activityLevel}-${goal}-${recommendation}`;

  const base: Omit<ExerciseRoadmapItem, 'id' | 'estimated_kcal'>[] =
    bodyStatus === 'underweight'
      ? [
          { title: 'log.roadmap.underweight.1.title', detail: 'log.roadmap.underweight.1.detail', activity_type: 'gym', duration_min: 35 },
          { title: 'log.roadmap.underweight.2.title', detail: 'log.roadmap.underweight.2.detail', activity_type: 'walking', duration_min: 20 },
          { title: 'log.roadmap.underweight.3.title', detail: 'log.roadmap.underweight.3.detail', activity_type: 'yoga', duration_min: 18 },
        ]
      : bodyStatus === 'normal'
        ? [
            { title: 'log.roadmap.normal.1.title', detail: 'log.roadmap.normal.1.detail', activity_type: 'walking', duration_min: 30 },
            { title: 'log.roadmap.normal.2.title', detail: 'log.roadmap.normal.2.detail', activity_type: 'gym', duration_min: 30 },
            { title: 'log.roadmap.normal.3.title', detail: 'log.roadmap.normal.3.detail', activity_type: 'yoga', duration_min: 20 },
          ]
        : bodyStatus === 'obese'
          ? [
              { title: 'log.roadmap.obese.1.title', detail: 'log.roadmap.obese.1.detail', activity_type: 'walking', duration_min: 35 },
              { title: 'log.roadmap.obese.2.title', detail: 'log.roadmap.obese.2.detail', activity_type: 'gym', duration_min: 25 },
              { title: 'log.roadmap.obese.3.title', detail: 'log.roadmap.obese.3.detail', activity_type: 'cycling', duration_min: 20 },
            ]
          : goal === 'lose_weight'
            ? [
                { title: 'log.roadmap.loss.1.title', detail: 'log.roadmap.loss.1.detail', activity_type: 'running', duration_min: 30 },
                { title: 'log.roadmap.loss.2.title', detail: 'log.roadmap.loss.2.detail', activity_type: 'gym', duration_min: 30 },
                { title: 'log.roadmap.loss.3.title', detail: 'log.roadmap.loss.3.detail', activity_type: 'walking', duration_min: 20 },
              ]
            : [
                { title: 'log.roadmap.default.1.title', detail: 'log.roadmap.default.1.detail', activity_type: 'walking', duration_min: 25 },
                { title: 'log.roadmap.default.2.title', detail: 'log.roadmap.default.2.detail', activity_type: 'gym', duration_min: 25 },
                { title: 'log.roadmap.default.3.title', detail: 'log.roadmap.default.3.detail', activity_type: 'yoga', duration_min: 15 },
              ];

  return base.map((item, index) => ({
    ...item,
    id: `${key}-${index + 1}`,
    estimated_kcal: estimateExerciseCalories(item.activity_type, item.duration_min, weightKg),
  }));
}

export default function LogScreen() {
  const { colors } = useAppTheme();
  const { t, tx } = useI18n();
  const { token, isLoading: authLoading } = useAuthStore();
  const { dailyLog, savedMeals, activityLogs, activityPreferences, todaySummary, isLoading, fetchTodaySummary, fetchDailyLog, fetchSavedMeals, fetchActivityLogs, fetchActivityPreferences, updateLog, removeLog, restoreLog, logSavedMeal, updateSavedMeal, deleteSavedMeal, addActivity, addWater, deleteActivity } = useLogStore();
  const [perMealTargets, setPerMealTargets] = useState<Record<MealType, number>>({
    breakfast: 400, lunch: 600, dinner: 600, snack: 200,
  });
  const [profileMeta, setProfileMeta] = useState<Partial<User>>({});
  const [processingRoadmapId, setProcessingRoadmapId] = useState<string | null>(null);
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [catalogSelectedType, setCatalogSelectedType] = useState<ActivityType | null>(null);
  const [catalogDuration, setCatalogDuration] = useState<15 | 30 | 45 | 60>(30);
  const [editingLog, setEditingLog] = useState<FoodLog | null>(null);
  const [editMealType, setEditMealType] = useState<MealType>('lunch');
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editGrams, setEditGrams] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCarbs, setEditCarbs] = useState('');
  const [editFat, setEditFat] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editingSavedMeal, setEditingSavedMeal] = useState<SavedMeal | null>(null);
  const [editSavedMealName, setEditSavedMealName] = useState('');
  const [reward, setReward] = useState<RewardToastData | null>(null);
  const [isLoggingWater, setIsLoggingWater] = useState(false);
  const editNutritionBase = useRef({ grams: 1, calories: 0, protein: 0, carbs: 0, fat: 0 });

  const loadLogData = useCallback(() => {
    if (authLoading || !token) return;
    fetchDailyLog().catch(() => {});
    fetchTodaySummary().catch(() => {});
    fetchSavedMeals().catch(() => {});
    fetchActivityLogs().catch(() => {});
    fetchActivityPreferences().catch(() => {});
    Promise.all([
      apiClient.get('/user/profile'),
      apiClient.get('/reminders/preferences').catch(() => ({ data: null })),
    ]).then(([res, reminderResponse]) => {
      const u = res.data as User;
      setProfileMeta(u);
      setPerMealTargets({
        breakfast: u.target_breakfast_cal ?? 400,
        lunch: u.target_lunch_cal ?? 600,
        dinner: u.target_dinner_cal ?? 600,
        snack: u.target_snack_cal ?? 200,
      });
      const targetMl = Number(u.nutrition_target_snapshot?.water_ml ?? 0);
      const reminderSlots = u.hydration_schedule?.mode === 'custom' && u.hydration_schedule.slots.length > 0
        ? normalizeHydrationSlots(u.hydration_schedule.slots)
        : buildSystemHydrationSlots(targetMl);
      const reminderPrefs = reminderResponse.data as { allow_push_notifications?: boolean; hydration_reminder_enabled?: boolean } | null;
      void pushNotificationService.syncHydrationReminders(
        reminderSlots,
        (reminderPrefs?.allow_push_notifications ?? true) && (reminderPrefs?.hydration_reminder_enabled ?? true),
      );
    }).catch(() => {});
  }, [authLoading, fetchActivityLogs, fetchActivityPreferences, fetchDailyLog, fetchSavedMeals, fetchTodaySummary, token]);

  useEffect(() => {
    loadLogData();
  }, [loadLogData]);

  useFocusEffect(
    useCallback(() => {
      loadLogData();
    }, [loadLogData]),
  );

  const roadmap = useMemo(
    () => activityPreferences.map((item) => ({
      id: item.id,
      title: item.title,
      detail: t('screen.tabs.log.roadmap.detail', {
        minutes: item.duration_min,
        kcal: estimateExerciseCalories(item.activity_type as ActivityType, item.duration_min, profileMeta.weight_kg ?? 65),
      }),
      activity_type: item.activity_type as ActivityType,
      duration_min: item.duration_min,
      estimated_kcal: estimateExerciseCalories(item.activity_type as ActivityType, item.duration_min, profileMeta.weight_kg ?? 65),
      is_custom: true,
    })),
    [activityPreferences, profileMeta.weight_kg, t],
  );

  const roadmapActivityByTaskId = useMemo(() => {
    const map: Record<string, ActivityLog> = {};
    activityLogs.forEach((log) => {
      const parsed = parseRoadmapNote(log.notes);
      if (!parsed) return;
      map[parsed.taskId] = log;
    });
    return map;
  }, [activityLogs]);

  const unfinishedRoadmap = useMemo(
    () => roadmap.filter((item) => !roadmapActivityByTaskId[item.id]),
    [roadmap, roadmapActivityByTaskId],
  );

  const logsSource: FoodLog[] = dailyLog?.logs ?? [];
  const logsByMeal = logsSource.reduce<Record<MealType, FoodLog[]>>(
    (acc, log) => {
      if (!acc[log.meal_type]) acc[log.meal_type] = [];
      acc[log.meal_type].push(log);
      return acc;
    },
    {} as Record<MealType, FoodLog[]>,
  );
  const loggedCalories = safeNumber(dailyLog?.total_calories);
  const targetCalories = safeNumber(dailyLog?.target_calories, Object.values(perMealTargets).reduce((sum, value) => sum + safeNumber(value), 0));
  const burnedCalories = activityLogs.reduce((sum, item) => sum + safeNumber(item.calories_burned), 0);
  const netCalories = loggedCalories - burnedCalories;
  const waterTargetMl = Math.max(0, Number(todaySummary?.daily_nutrition_target?.water_ml ?? profileMeta.nutrition_target_snapshot?.water_ml ?? 0));
  const waterIntakeMl = Math.max(0, Number(todaySummary?.water_intake_ml ?? 0));

  const handleLogWater = async (amountMl: number) => {
    if (isLoggingWater || amountMl <= 0) return;
    setIsLoggingWater(true);
    try {
      await addWater(amountMl);
      setReward({
        title: 'screen.tabs.index.hydration.title',
        body: `${amountMl}ml · ${(Math.min(waterTargetMl, waterIntakeMl + amountMl) / 1000).toLocaleString('vi-VN')} / ${(waterTargetMl / 1000).toLocaleString('vi-VN')} L`,
        icon: 'water',
      });
    } catch {
      Alert.alert('Không thể ghi nhận nước', 'Vui lòng thử lại sau.');
    } finally {
      setIsLoggingWater(false);
    }
  };

  const handleQuickLog = (meal: SavedMeal) => {
    const totals = getSavedMealDisplayTotals(meal);
    Alert.alert(
      t('screen.tabs.log.alert.quickLogTitle', { name: meal.name }),
      t('screen.tabs.log.alert.quickLogMealPrompt', { calories: formatSavedMealNumber(totals.calories) }),
      (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((m) => ({
        text: t(MEAL_LABELS[m]),
        onPress: async () => {
          try {
            await logSavedMeal(meal.id, m);
            setReward({
              title: 'screen.tabs.log.alert.006',
              body: t('screen.tabs.log.reward.quickMealBody', { name: meal.name, meal: t(MEAL_LABELS[m]) }),
              icon: 'checkmark-circle',
            });
          } catch {
            Alert.alert('screen.tabs.log.alert.008', 'screen.tabs.log.alert.009');
          }
        },
      })),
    );
  };

  const handleDeleteSaved = (meal: SavedMeal) => {
    Alert.alert('screen.tabs.log.alert.010', t('screen.tabs.log.alert.deleteSavedBody', { name: meal.name }), [
      { text: 'screen.tabs.log.alert.012', style: 'cancel' },
      { text: 'screen.tabs.log.alert.013', style: 'destructive', onPress: () => deleteSavedMeal(meal.id) },
    ]);
  };

  const openEditSavedMeal = (meal: SavedMeal) => {
    setEditingSavedMeal(meal);
    setEditSavedMealName(meal.name);
  };

  const handleSaveSavedMeal = async () => {
    if (!editingSavedMeal) return;
    const name = editSavedMealName.trim();
    if (!name) {
      Alert.alert('screen.tabs.log.alert.invalidSavedMealTitle', 'screen.tabs.log.alert.nameRequired');
      return;
    }

    try {
      await updateSavedMeal(editingSavedMeal.id, { name });
      setEditingSavedMeal(null);
      setReward({
        title: t('screen.tabs.log.reward.savedMealUpdated'),
        body: name,
        icon: 'bookmark',
      });
    } catch {
      Alert.alert('screen.tabs.log.alert.updateSavedMealFailed', 'common.tryAgain');
    }
  };

  const openEditLog = (log: FoodLog) => {
    const quantity = Math.max(1, safeNumber(log.quantity, 1));
    const totalGrams = Math.max(1, safeNumber(log.estimated_grams, 1));
    setEditingLog(log);
    setEditMealType(log.meal_type);
    setEditName(log.name_vi ?? log.name);
    setEditQuantity(String(quantity));
    setEditGrams(String(safeRound(totalGrams / quantity)));
    setEditCalories(String(safeRound(log.calories)));
    setEditProtein(String(safeRound(log.protein_g)));
    setEditCarbs(String(safeRound(log.carbs_g)));
    setEditFat(String(safeRound(log.fat_g)));
    setEditNotes(log.notes ?? '');
    editNutritionBase.current = {
      grams: totalGrams,
      calories: safeNumber(log.calories),
      protein: safeNumber(log.protein_g),
      carbs: safeNumber(log.carbs_g),
      fat: safeNumber(log.fat_g),
    };
  };

  const recalculateEditNutrition = (gramsPerPortion: number, quantity: number) => {
    if (!Number.isFinite(gramsPerPortion) || gramsPerPortion <= 0 || !Number.isFinite(quantity) || quantity <= 0) return;
    const scaled = scaleNutrition(editNutritionBase.current, gramsPerPortion * quantity);
    setEditCalories(String(scaled.calories));
    setEditProtein(String(scaled.protein));
    setEditCarbs(String(scaled.carbs));
    setEditFat(String(scaled.fat));
  };

  const updateEditGrams = (grams: number) => {
    setEditGrams(String(grams));
    recalculateEditNutrition(grams, Math.max(1, Number(editQuantity) || 1));
  };

  const updateEditQuantity = (value: string) => {
    const sanitized = value.replace(/[^\d.]/g, '');
    setEditQuantity(sanitized);
    const quantity = Number(sanitized);
    recalculateEditNutrition(Math.max(1, Number(editGrams) || 1), quantity);
  };

  const handleSaveEditedLog = async () => {
    if (!editingLog) return;

    const gramsPerPortion = Number(editGrams);
    const quantity = Number(editQuantity);
    const grams = gramsPerPortion * quantity;
    const calories = Number(editCalories);
    const protein = Number(editProtein);
    const carbs = Number(editCarbs);
    const fat = Number(editFat);

    if (
      !Number.isFinite(quantity)
      || quantity <= 0
      || !Number.isFinite(gramsPerPortion)
      || gramsPerPortion <= 0
      || ![grams, calories, protein, carbs, fat].every((value) => Number.isFinite(value) && value >= 0)
    ) {
      Alert.alert('screen.tabs.log.alert.invalidLogTitle', 'screen.tabs.log.alert.invalidLogBody');
      return;
    }

    try {
      await updateLog(editingLog.id, {
        meal_type: editMealType,
        name: editName.trim() || editingLog.name,
        name_vi: editName.trim() || editingLog.name_vi,
        quantity,
        estimated_grams: grams,
        calories,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
        notes: editNotes.trim() || undefined,
      });
      setEditingLog(null);
      setReward({
        title: t('screen.tabs.log.reward.logUpdated'),
        body: `${editName || editingLog.name} · ${formatKcal(calories)}`,
        icon: 'create',
      });
    } catch {
      Alert.alert('screen.tabs.log.alert.updateLogFailed', 'common.tryAgain');
    }
  };

  const handleRemoveLog = async (log: FoodLog) => {
    try {
      const deleted = await removeLog(log.id);
      setReward({
        title: t('screen.tabs.log.reward.logDeleted'),
        body: `${log.name_vi ?? log.name} · ${formatKcal(log.calories)}`,
        icon: 'trash',
      });
      if (deleted) {
        Alert.alert('screen.tabs.log.alert.logDeleted', 'screen.tabs.log.alert.undoDelete', [
          { text: t('screen.tabs.log.alert.keepDeleted'), style: 'cancel' },
          {
            text: t('screen.tabs.log.alert.undo'),
            onPress: async () => {
              try {
                await restoreLog(log.id);
              } catch {
                Alert.alert('screen.tabs.log.alert.undoFailed', 'common.tryAgain');
              }
            },
          },
        ]);
      }
    } catch {
      Alert.alert('screen.tabs.log.alert.deleteLogFailed', 'common.tryAgain');
    }
  };

  const submitQuickActivity = async (activityType: ActivityType, minsRaw?: string | number | null) => {
    const mins = Number(minsRaw);
    if (!Number.isFinite(mins) || mins <= 0) {
      Alert.alert('screen.tabs.log.alert.014', 'screen.tabs.log.alert.015');
      return;
    }

    try {
      const minutes = safeRound(mins);
      await addActivity({ activity_type: activityType, duration_min: minutes });
      setReward({
        title: 'screen.tabs.log.reward.activityTitle',
        body: t('screen.tabs.log.reward.activityBody', { activity: tx(ACTIVITY_LABELS[activityType]), minutes }),
        icon: 'checkmark-circle',
      });
    } catch {
      Alert.alert('screen.tabs.log.alert.016', 'screen.tabs.log.alert.017');
    }
  };

  const openRoadmapQuickAdd = () => {
    if (unfinishedRoadmap.length === 0) {
      Alert.alert('screen.tabs.log.alert.018', 'screen.tabs.log.alert.019');
      return;
    }

    Alert.alert('screen.tabs.log.alert.020', 'screen.tabs.log.alert.021', [
      ...unfinishedRoadmap.slice(0, 3).map((task) => ({
        text: `${tx(task.title)} (${task.duration_min}p · ${task.estimated_kcal} kcal)`,
        onPress: () => void handleToggleRoadmapTask(task),
      })),
      { text: 'screen.tabs.log.alert.022', style: 'cancel' },
    ]);
  };

  const openManualAddActivity = () => {
    setCatalogSelectedType(null);
    setCatalogDuration(30);
    setCatalogVisible(true);
  };

  const handleCatalogConfirm = async () => {
    if (!catalogSelectedType) return;
    setCatalogVisible(false);

    await submitQuickActivity(catalogSelectedType, catalogDuration);
  };

  const handleAddActivity = () => {
    if (roadmap.length === 0) {
      openManualAddActivity();
      return;
    }

    Alert.alert('screen.tabs.log.alert.023', 'screen.tabs.log.alert.024', [
      { text: 'screen.tabs.log.alert.025', onPress: openRoadmapQuickAdd },
      { text: 'screen.tabs.log.alert.026', onPress: openManualAddActivity },
      { text: 'screen.tabs.log.alert.027', onPress: () => router.push('/strength') },
      { text: 'screen.tabs.log.alert.029', style: 'cancel' },
    ]);
  };

  const handleToggleRoadmapTask = async (task: ExerciseRoadmapItem) => {
    if (processingRoadmapId) return;

    setProcessingRoadmapId(task.id);
    try {
      const existing = roadmapActivityByTaskId[task.id];

      if (existing) {
        await deleteActivity(existing.id);
        setReward({
          title: t('screen.tabs.log.reward.roadmapIncomplete'),
          body: t('screen.tabs.log.reward.roadmapIncompleteBody', { title: tx(task.title), kcal: task.estimated_kcal }),
          icon: 'remove-circle',
        });
      } else {
        await addActivity({
          activity_type: task.activity_type,
          duration_min: task.duration_min,
          calories_burned: task.estimated_kcal,
          notes: `ROADMAP_TASK:${task.id}|${task.title}`,
        });
        setReward({
          title: t('screen.tabs.log.reward.roadmapUpdated'),
          body: t('screen.tabs.log.reward.roadmapUpdatedBody', { title: tx(task.title), kcal: task.estimated_kcal }),
          icon: 'flame',
        });
      }
    } catch {
      Alert.alert('screen.tabs.log.alert.030', 'screen.tabs.log.alert.031');
    } finally {
      setProcessingRoadmapId(null);
    }
  };

  const catalogTypes = Object.keys(ACTIVITY_LABELS) as ActivityType[];
  const userWeight = profileMeta.weight_kg ?? 65;

  return (
    <ScreenShell>
      {/* ---- Exercise Catalog Modal ---- */}
      <Modal
        visible={catalogVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCatalogVisible(false)}
      >
        <View style={styles.catalogOverlay}>
          <View style={styles.catalogSheet}>
            <View style={styles.catalogHeader}>
              <Text style={styles.catalogTitle} i18nKey="screen.tabs.log.text.001" />
              <TouchableOpacity onPress={() => setCatalogVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {catalogSelectedType === null ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.catalogHint} i18nKey="screen.tabs.log.catalog.hint" />
                {catalogTypes.map((type) => {
                  const kcal30 = estimateExerciseCalories(type, 30, userWeight);
                  return (
                    <TouchableOpacity
                      key={type}
                      style={styles.catalogItem}
                      onPress={() => setCatalogSelectedType(type)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.catalogItemName}>{tx(ACTIVITY_LABELS[type])}</Text>
                        <Text style={styles.catalogItemKcal}>{t('screen.tabs.log.catalog.kcalPerMinutes', { kcal: kcal30, minutes: 30 })}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View>
                <TouchableOpacity style={styles.catalogBack} onPress={() => setCatalogSelectedType(null)}>
                  <Ionicons name="arrow-back" size={16} color={colors.accentMint} />
                  <Text style={styles.catalogBackText} i18nKey="screen.tabs.log.text.002" />
                </TouchableOpacity>
                <Text style={styles.catalogSelectedLabel}>{tx(ACTIVITY_LABELS[catalogSelectedType])}</Text>
                <Text style={styles.catalogHint} i18nKey="screen.tabs.log.text.003" />
                <View style={styles.durationRow}>
                  {([15, 30, 45, 60] as const).map((d) => {
                    const kcal = estimateExerciseCalories(catalogSelectedType, d, userWeight);
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[styles.durationBtn, catalogDuration === d && styles.durationBtnActive]}
                        onPress={() => setCatalogDuration(d)}
                      >
                        <Text style={[styles.durationBtnMin, catalogDuration === d && styles.durationBtnTextActive]}>{t('screen.tabs.log.catalog.duration', { minutes: d })}</Text>
                        <Text style={[styles.durationBtnKcal, catalogDuration === d && styles.durationBtnTextActive]}>~{kcal} kcal</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={styles.catalogConfirmBtn} onPress={() => void handleCatalogConfirm()}>
                  <Text style={styles.catalogConfirmText}>
                    {t('screen.tabs.log.catalog.add', {
                      activity: tx(ACTIVITY_LABELS[catalogSelectedType]),
                      minutes: catalogDuration,
                      kcal: estimateExerciseCalories(catalogSelectedType, catalogDuration, userWeight),
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingLog !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingLog(null)}
      >
        <View style={styles.catalogOverlay}>
          <View style={styles.catalogSheet}>
            <View style={styles.catalogHeader}>
              <Text style={styles.catalogTitle} i18nKey="screen.tabs.log.edit.title" />
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setEditingLog(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editForm}>
              <View style={styles.editFullField}>
                <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.foodName" />
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="screen.tabs.log.edit.foodName"
                  placeholderTextColor={colors.textDisabled}
                  style={styles.editInput}
                  testID="log-edit-name"
                />
              </View>

              <View style={styles.editFullField}>
                <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.quantity" />
                <TextInput
                  value={editQuantity}
                  onChangeText={updateEditQuantity}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  style={styles.editInput}
                  testID="log-edit-quantity"
                />
              </View>

              <PortionInput
                value={Math.max(1, Number(editGrams) || 1)}
                onChange={updateEditGrams}
                label="screen.tabs.log.edit.gramsPerPortion"
                testID="log-edit-portion"
              />

              <View style={styles.editMealRow}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((meal) => (
                  <TouchableOpacity
                    key={meal}
                    style={[styles.editMealBtn, editMealType === meal && styles.editMealBtnActive]}
                    onPress={() => setEditMealType(meal)}
                  >
                    <Text style={[styles.editMealBtnText, editMealType === meal && styles.editMealBtnTextActive]}>
                      {t(MEAL_LABELS[meal])}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.macroPreview}>
                <Text style={styles.macroPreviewTitle} i18nKey="screen.tabs.log.edit.nutritionPreview" />
                <View style={styles.editGrid}>
                  <View style={styles.editField}>
                    <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.kcal" />
                    <TextInput value={editCalories} onChangeText={setEditCalories} keyboardType="numeric" style={styles.editInput} testID="log-edit-calories" />
                  </View>
                  <View style={styles.editField}>
                    <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.protein" />
                    <TextInput value={editProtein} onChangeText={setEditProtein} keyboardType="numeric" style={styles.editInput} testID="log-edit-protein" />
                  </View>
                  <View style={styles.editField}>
                    <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.carbs" />
                    <TextInput value={editCarbs} onChangeText={setEditCarbs} keyboardType="numeric" style={styles.editInput} testID="log-edit-carbs" />
                  </View>
                  <View style={styles.editField}>
                    <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.fat" />
                    <TextInput value={editFat} onChangeText={setEditFat} keyboardType="numeric" style={styles.editInput} testID="log-edit-fat" />
                  </View>
                </View>
              </View>

              <View style={styles.editFullField}>
                <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.notes" />
                <TextInput
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="screen.tabs.log.edit.notes"
                  placeholderTextColor={colors.textDisabled}
                  style={[styles.editInput, styles.editNotes]}
                  multiline
                />
              </View>

              <TouchableOpacity style={styles.catalogConfirmBtn} onPress={() => void handleSaveEditedLog()} testID="log-edit-save">
                <Text style={styles.catalogConfirmText} i18nKey="screen.tabs.log.edit.save" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingSavedMeal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingSavedMeal(null)}
      >
        <View style={styles.catalogOverlay}>
          <View style={styles.catalogSheet}>
            <View style={styles.catalogHeader}>
              <Text style={styles.catalogTitle} i18nKey="screen.tabs.log.edit.savedMealTitle" />
              <TouchableOpacity onPress={() => setEditingSavedMeal(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={editSavedMealName}
              onChangeText={setEditSavedMealName}
              placeholder="screen.tabs.log.edit.savedMealName"
              placeholderTextColor={colors.textDisabled}
              style={[styles.editInput, { marginBottom: 14 }]}
            />
            <TouchableOpacity style={styles.catalogConfirmBtn} onPress={() => void handleSaveSavedMeal()}>
              <Text style={styles.catalogConfirmText} i18nKey="screen.tabs.log.edit.saveSavedMeal" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <VisualHeroCard
        imageSource={logHeroIllustration}
        eyebrow="screen.tabs.log.eyebrow.001"
        title="screen.tabs.log.title.001"
        body="screen.tabs.log.body.001"
      />

      {isLoading && <LogLoadingState />}

      <SurfaceCard style={styles.logSummaryCard}>
        <View style={styles.logSummaryItem}>
          <Text style={styles.logSummaryLabel} i18nKey="screen.tabs.log.text.004" />
          <Text style={styles.logSummaryValue}>{formatKcal(loggedCalories).replace(' kcal', '')}</Text>
          <Text style={styles.logSummaryUnit} i18nKey="screen.tabs.log.text.005" />
        </View>
        <View style={styles.logSummaryDivider} />
        <View style={styles.logSummaryItem}>
          <Text style={styles.logSummaryLabel} i18nKey="screen.tabs.log.text.006" />
          <Text style={[styles.logSummaryValue, netCalories > targetCalories && styles.logSummaryValueWarn]}>{formatKcal(netCalories).replace(' kcal', '')}</Text>
          <Text style={styles.logSummaryUnit}>/{formatKcal(targetCalories).replace(' kcal', '')}</Text>
        </View>
        <View style={styles.logSummaryDivider} />
        <View style={styles.logSummaryItem}>
          <Text style={styles.logSummaryLabel} i18nKey="screen.tabs.log.text.007" />
          <Text style={styles.logSummaryValueBurned}>-{formatKcal(burnedCalories).replace(' kcal', '')}</Text>
          <Text style={styles.logSummaryUnit} i18nKey="screen.tabs.log.text.005" />
        </View>
      </SurfaceCard>

      {waterTargetMl > 0 ? (
        <HydrationScheduleCard
          targetMl={waterTargetMl}
          intakeMl={waterIntakeMl}
          logs={todaySummary?.hydration_logs ?? []}
          schedule={todaySummary?.profile?.hydration_schedule ?? profileMeta.hydration_schedule}
          saving={isLoggingWater}
          onAddWater={(amountMl) => void handleLogWater(amountMl)}
        />
      ) : null}

        {/* ---- Saved Meals Quick Log ---- */}
        {savedMeals.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.savedTitle} i18nKey="screen.tabs.log.text.008" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedList}>
              {savedMeals.map((meal) => {
                const totals = getSavedMealDisplayTotals(meal);
                return (
                  <TouchableOpacity key={meal.id} style={styles.savedCard} onPress={() => handleQuickLog(meal)}>
                    <Text style={styles.savedName} numberOfLines={1}>{meal.name}</Text>
                    <Text style={styles.savedCalorie}>{formatSavedMealNumber(totals.calories)} kcal</Text>
                    <Text style={styles.savedMacro}>
                      P:{formatSavedMealNumber(totals.protein)} C:{formatSavedMealNumber(totals.carbs)} F:{formatSavedMealNumber(totals.fat)}
                    </Text>
                    <TouchableOpacity style={styles.savedEdit} onPress={() => openEditSavedMeal(meal)}>
                      <Ionicons name="create-outline" size={15} color={colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.savedDelete} onPress={() => handleDeleteSaved(meal)}>
                      <Ionicons name="close-circle" size={16} color={colors.textDisabled} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ---- Daily Logs by Meal ---- */}
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((meal) => {
          const logs = logsByMeal[meal] ?? [];
          const total = logs.reduce((s, l) => s + safeNumber(l.calories), 0);
          const mealTarget = safeNumber(perMealTargets[meal], 1);
          return (
            <SurfaceCard key={meal} style={styles.mealSection}>
              <View style={styles.mealHeader}>
                <Text style={styles.mealLabel}>{t(MEAL_LABELS[meal])}</Text>
                <View style={styles.mealHeaderRight}>
                  {total > 0 && <Text style={styles.mealTotal}>{formatKcal(total)}</Text>}
                  <Text style={styles.mealTarget}>/{formatKcal(mealTarget).replace(' kcal', '')}</Text>
                </View>
              </View>
              {total > 0 && (
                <View style={styles.mealProgressBar}>
                  <View style={[styles.mealProgressFill, {
                    width: `${Math.min(total / Math.max(mealTarget, 1) * 100, 100)}%` as any,
                    backgroundColor: total > mealTarget ? colors.danger : colors.success,
                  }]} />
                </View>
              )}
              {logs.map((log) => (
                <View key={log.id} style={styles.logRow}>
                  <View style={styles.logInfo}>
                    <Text style={styles.logName}>{log.name_vi ?? log.name}</Text>
                    <Text style={styles.logDetail}>
                      {formatMacro(log.estimated_grams)} · P:{formatMacro(log.protein_g)} C:{formatMacro(log.carbs_g)} F:{formatMacro(log.fat_g)}
                    </Text>
                  </View>
                  <View style={styles.logRight}>
                    <Text style={styles.logCalorie}>{formatKcal(log.calories)}</Text>
                    <View style={styles.logActions}>
                      <TouchableOpacity
                        style={styles.logActionButton}
                        onPress={() => openEditLog(log)}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.edit')}
                        testID={`log-edit-${log.id}`}
                      >
                        <Ionicons name="create-outline" size={18} color={colors.accentCyan} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.logActionButton}
                        onPress={() => void handleRemoveLog(log)}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.delete')}
                        testID={`log-delete-${log.id}`}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
              {logs.length === 0 && (
                <EmptyState
                  imageSource={logHeroIllustration}
                  icon="🥢"
                  title="screen.tabs.log.title.002"
                  description="screen.tabs.log.description.001"
                  variant="compact"
                  style={styles.emptyStateCard}
                />
              )}
            </SurfaceCard>
          );
        })}

        {/* ---- Activity Section ---- */}
        <SurfaceCard style={styles.activitySection}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle} i18nKey="screen.tabs.log.text.009" />
            <TouchableOpacity style={styles.addActivityBtn} onPress={handleAddActivity}>
              <AnimatedIonicon name="add" size={18} color={colors.textOnAccent} motion="pulse" />
            </TouchableOpacity>
          </View>
          {activityLogs.length === 0 ? (
            <EmptyState
              icon="🏃"
              title="screen.tabs.log.title.003"
              description="screen.tabs.log.description.002"
              variant="compact"
              style={styles.emptyStateCard}
            />
          ) : (
            activityLogs.map((act) => (
              <View key={act.id} style={styles.activityRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityName}>{tx(ACTIVITY_LABELS[act.activity_type] ?? act.activity_type)}</Text>
                  <Text style={styles.activityDetail}>{t('screen.tabs.log.activity.duration', { minutes: act.duration_min, kcal: safeRound(act.calories_burned) })}</Text>
                  {parseRoadmapNote(act.notes) ? (
                    <Text style={styles.activityRoadmapBadge} i18nKey="screen.tabs.log.text.010" />
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => deleteActivity(act.id)}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
          {activityLogs.length > 0 && (
            <Text style={styles.activityBurned}>
              {t('screen.tabs.log.activity.burned', { kcal: formatKcal(activityLogs.reduce((s, a) => s + safeNumber(a.calories_burned), 0)) })}
            </Text>
          )}
        </SurfaceCard>
        <RewardToast reward={reward} onHide={() => setReward(null)} />
    </ScreenShell>
  );
}

function LogLoadingState() {
  return (
    <SurfaceCard style={styles.logLoadingCard}>
      <View style={styles.loadingSummaryRow}>
        <SkeletonBlock height={54} width="31%" />
        <SkeletonBlock height={54} width="31%" />
        <SkeletonBlock height={54} width="31%" />
      </View>
      <View style={styles.loadingMealList}>
        <SkeletonBlock height={18} width="42%" />
        <SkeletonBlock height={48} />
        <SkeletonBlock height={48} />
      </View>
    </SurfaceCard>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  heroBody: { marginBottom: 18, maxWidth: 700 },
  savedSection: { marginBottom: 18 },
  savedTitle: { color: colors.text, fontWeight: '900', fontSize: 16, lineHeight: 21, marginBottom: 11 },
  savedList: { gap: 12, paddingRight: 18 },
  savedCard: { backgroundColor: colors.surfaceLifted, borderRadius: 8, padding: 15, width: 170, minHeight: 112, position: 'relative', borderWidth: 1, borderColor: colors.borderSubtle },
  savedName: { color: colors.text, fontWeight: '800', fontSize: 13, lineHeight: 18, marginBottom: 7, paddingRight: 20 },
  savedCalorie: { color: colors.accentMint, fontWeight: '900', fontSize: 20, lineHeight: 25, marginBottom: 4 },
  savedMacro: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  savedEdit: { position: 'absolute', top: 9, right: 30 },
  savedDelete: { position: 'absolute', top: 9, right: 9 },
  logSummaryCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
    marginBottom: 18,
    backgroundColor: colors.surfaceLifted,
  },
  logSummaryItem: {
    flex: 1,
    minWidth: 0,
  },
  logSummaryDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  logSummaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 5,
    letterSpacing: 0.2,
  },
  logSummaryValue: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
  },
  logSummaryValueWarn: {
    color: colors.accentAmber,
  },
  logSummaryValueBurned: {
    color: colors.accentMint,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
  },
  logSummaryUnit: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  logLoadingCard: { marginTop: 14, marginBottom: 18, gap: 16 },
  loadingSummaryRow: { flexDirection: 'row', gap: 10 },
  loadingMealList: { gap: 10 },
  mealSection: { marginBottom: 14 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' },
  mealHeaderRight: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  mealLabel: { color: colors.text, fontWeight: '900', fontSize: 16, lineHeight: 21 },
  mealTotal: { color: colors.accentMint, fontWeight: '900' },
  mealTarget: { color: colors.textMuted, fontSize: 12 },
  mealProgressBar: { height: 7, backgroundColor: colors.progressBg, borderRadius: 999, marginBottom: 12, overflow: 'hidden' },
  mealProgressFill: { height: '100%', borderRadius: 2 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle, gap: 12 },
  logInfo: { flex: 1 },
  logName: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  logDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  logRight: { alignItems: 'flex-end', gap: 4 },
  logActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logActionButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  logCalorie: { color: colors.accentMint, fontWeight: '900' },
  emptyStateCard: { marginTop: 8 },
  activitySection: { marginBottom: 22, marginTop: 4 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  activityTitle: { color: colors.text, fontWeight: '900', fontSize: 16, lineHeight: 21 },
  addActivityBtn: { backgroundColor: colors.accentMint, borderRadius: 8, width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle, gap: 12 },
  activityName: { color: colors.text, fontWeight: '800', fontSize: 14, lineHeight: 19 },
  activityDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  activityRoadmapBadge: {
    marginTop: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surfaceSuccess,
    color: colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  activityBurned: { color: colors.warning, fontWeight: '800', fontSize: 13, marginTop: 10, textAlign: 'right' },
  // Exercise catalog modal
  catalogOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  catalogSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '90%', borderWidth: 1, borderColor: colors.borderSubtle },
  catalogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalCloseButton: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderSubtle },
  catalogTitle: { color: colors.text, fontWeight: '900', fontSize: 19, lineHeight: 24 },
  catalogHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  catalogItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 13, marginBottom: 9, borderWidth: 1, borderColor: colors.borderSubtle },
  catalogItemName: { color: colors.text, fontWeight: '800', fontSize: 14, marginBottom: 3 },
  catalogItemKcal: { color: colors.accentMint, fontSize: 12, fontWeight: '700' },
  catalogBack: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  catalogBackText: { color: colors.accentMint, fontSize: 13, fontWeight: '700' },
  catalogSelectedLabel: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  durationRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  durationBtn: { flex: 1, minWidth: 70, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  durationBtnActive: { borderColor: colors.accentMint, backgroundColor: colors.surfaceSuccess },
  durationBtnMin: { color: colors.text, fontWeight: '700', fontSize: 14 },
  durationBtnKcal: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  durationBtnTextActive: { color: colors.accentMint },
  catalogConfirmBtn: { backgroundColor: colors.accentMint, borderRadius: 8, paddingVertical: 15, alignItems: 'center' },
  catalogConfirmText: { color: colors.textOnAccent, fontWeight: '900', fontSize: 14 },
  editInput: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 13,
    minHeight: 48,
    paddingVertical: 12,
    fontSize: 15,
  },
  editForm: { gap: 16, paddingBottom: 8 },
  editFullField: { gap: 8 },
  editMealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editMealBtn: { minHeight: 44, minWidth: 72, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  editMealBtnActive: { backgroundColor: colors.accentMint, borderColor: colors.accentMint },
  editMealBtnText: { color: colors.textMuted, fontWeight: '800', fontSize: 12 },
  editMealBtnTextActive: { color: colors.textOnAccent },
  macroPreview: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderSubtle },
  macroPreviewTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  editGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editField: { flexBasis: '46%', flexGrow: 1, minWidth: 112 },
  editLabel: { color: colors.textSoft, fontSize: 12, fontWeight: '800' },
  editNotes: { minHeight: 72, textAlignVertical: 'top' },
}));


