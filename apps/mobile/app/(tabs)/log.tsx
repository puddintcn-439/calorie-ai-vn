import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useLogStore } from '../../store/log.store';
import { FoodLog, MealType, SavedMeal, ActivityLog, ActivityType, ACTIVITY_LABELS, User, ActivityLevel, UserGoal, HealthFlag } from '@calorie-ai/types';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { apiClient } from '../../services/api';
import { formatKcal, formatMacro, safeNumber, safeRound, toFiniteNumber } from '../../services/number-format';
import { VisualHeroCard } from '../../components/visual-hero-card';
import { AnimatedIonicon } from '../../components/animated-icon';
import { RewardToast, RewardToastData } from '../../components/reward-toast';
import { useI18n } from '../../components/i18n';
import type { I18nKey } from '../../components/i18n';
import { TextInput } from '../../components/i18n-text-input';

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
          { title: 'Buổi sức mạnh tăng cơ', detail: 'Gym toàn thân nhẹ để kích thích tăng cân theo hướng tăng cơ.', activity_type: 'gym', duration_min: 35 },
          { title: 'Đi bộ hồi phục', detail: 'Đi bộ nhẹ sau bữa tối để tiêu hóa và phục hồi.', activity_type: 'walking', duration_min: 20 },
          { title: 'Yoga linh hoạt', detail: 'Mở khớp và giãn cơ để tập sức mạnh an toàn hơn.', activity_type: 'yoga', duration_min: 18 },
        ]
      : bodyStatus === 'normal'
        ? [
            { title: 'Cardio duy trì', detail: 'Đi bộ nhanh hoặc chạy chậm giữ nhịp tim mạch ổn định.', activity_type: 'walking', duration_min: 30 },
            { title: 'Sức mạnh toàn thân', detail: 'Push-pull-legs cơ bản để duy trì khối cơ.', activity_type: 'gym', duration_min: 30 },
            { title: 'Giãn cơ chủ động', detail: 'Yoga hoặc mobility giúp hạn chế đau cơ.', activity_type: 'yoga', duration_min: 20 },
          ]
        : bodyStatus === 'obese'
          ? [
              { title: 'Đi bộ chia chặng', detail: '3 phiên ngắn trong ngày giúp giảm áp lực khớp.', activity_type: 'walking', duration_min: 35 },
              { title: 'Sức mạnh tác động thấp', detail: 'Động tác thân người, ghế, dây kháng lực ở cường độ vừa.', activity_type: 'gym', duration_min: 25 },
              { title: 'Đạp xe nhẹ', detail: 'Cardio ít tác động, dễ duy trì đều đặn mỗi tuần.', activity_type: 'cycling', duration_min: 20 },
            ]
          : goal === 'lose_weight'
            ? [
                { title: 'Chạy/đi bộ đốt mỡ', detail: 'Cardio nền tảng để tạo thâm hụt ổn định.', activity_type: 'running', duration_min: 30 },
                { title: 'Buổi tạ giữ cơ', detail: 'Tập sức mạnh ngắn để bảo toàn cơ trong giai đoạn giảm cân.', activity_type: 'gym', duration_min: 30 },
                { title: 'Đi bộ bổ sung', detail: 'Thêm bước chân trong ngày để tăng tổng tiêu hao.', activity_type: 'walking', duration_min: 20 },
              ]
            : [
                { title: 'Cardio nhẹ', detail: 'Vận động đều để giữ nền tim mạch.', activity_type: 'walking', duration_min: 25 },
                { title: 'Sức mạnh cơ bản', detail: 'Bài toàn thân giúp duy trì trao đổi chất.', activity_type: 'gym', duration_min: 25 },
                { title: 'Yoga phục hồi', detail: 'Giảm mỏi cơ, tăng chất lượng giấc ngủ.', activity_type: 'yoga', duration_min: 15 },
              ];

  return base.map((item, index) => ({
    ...item,
    id: `${key}-${index + 1}`,
    estimated_kcal: estimateExerciseCalories(item.activity_type, item.duration_min, weightKg),
  }));
}

export default function LogScreen() {
  useAppTheme();
  const { t, tx } = useI18n();
  const { dailyLog, savedMeals, activityLogs, activityPreferences, isLoading, fetchDailyLog, fetchSavedMeals, fetchActivityLogs, fetchActivityPreferences, updateLog, removeLog, restoreLog, logSavedMeal, updateSavedMeal, deleteSavedMeal, addActivity, deleteActivity } = useLogStore();
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
  const [editGrams, setEditGrams] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCarbs, setEditCarbs] = useState('');
  const [editFat, setEditFat] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editingSavedMeal, setEditingSavedMeal] = useState<SavedMeal | null>(null);
  const [editSavedMealName, setEditSavedMealName] = useState('');
  const [reward, setReward] = useState<RewardToastData | null>(null);

  const loadLogData = useCallback(() => {
    fetchDailyLog().catch(() => {});
    fetchSavedMeals().catch(() => {});
    fetchActivityLogs().catch(() => {});
    fetchActivityPreferences().catch(() => {});
    apiClient.get('/user/profile').then((res) => {
      const u = res.data as User;
      setProfileMeta(u);
      setPerMealTargets({
        breakfast: u.target_breakfast_cal ?? 400,
        lunch: u.target_lunch_cal ?? 600,
        dinner: u.target_dinner_cal ?? 600,
        snack: u.target_snack_cal ?? 200,
      });
    }).catch(() => {});
  }, [fetchActivityLogs, fetchActivityPreferences, fetchDailyLog, fetchSavedMeals]);

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
      detail: `${item.duration_min} phút · ~${estimateExerciseCalories(item.activity_type as ActivityType, item.duration_min, profileMeta.weight_kg ?? 65)} kcal`,
      activity_type: item.activity_type as ActivityType,
      duration_min: item.duration_min,
      estimated_kcal: estimateExerciseCalories(item.activity_type as ActivityType, item.duration_min, profileMeta.weight_kg ?? 65),
      is_custom: true,
    })),
    [activityPreferences, profileMeta.weight_kg],
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
    setEditingLog(log);
    setEditMealType(log.meal_type);
    setEditName(log.name_vi ?? log.name);
    setEditGrams(String(safeRound(log.estimated_grams)));
    setEditCalories(String(safeRound(log.calories)));
    setEditProtein(String(safeRound(log.protein_g)));
    setEditCarbs(String(safeRound(log.carbs_g)));
    setEditFat(String(safeRound(log.fat_g)));
    setEditNotes(log.notes ?? '');
  };

  const updateEditGrams = (value: string) => {
    setEditGrams(value);
    if (!editingLog) return;

    const grams = Number(value);
    if (!Number.isFinite(grams) || grams < 0 || editingLog.estimated_grams <= 0) return;

    const ratio = grams / editingLog.estimated_grams;
    setEditCalories(String(safeRound(safeNumber(editingLog.calories) * ratio)));
    setEditProtein(String(safeRound(safeNumber(editingLog.protein_g) * ratio)));
    setEditCarbs(String(safeRound(safeNumber(editingLog.carbs_g) * ratio)));
    setEditFat(String(safeRound(safeNumber(editingLog.fat_g) * ratio)));
  };

  const handleSaveEditedLog = async () => {
    if (!editingLog) return;

    const grams = Number(editGrams);
    const calories = Number(editCalories);
    const protein = Number(editProtein);
    const carbs = Number(editCarbs);
    const fat = Number(editFat);

    if (![grams, calories, protein, carbs, fat].every((value) => Number.isFinite(value) && value >= 0)) {
      Alert.alert('screen.tabs.log.alert.invalidLogTitle', 'screen.tabs.log.alert.invalidLogBody');
      return;
    }

    try {
      await updateLog(editingLog.id, {
        meal_type: editMealType,
        name: editName.trim() || editingLog.name,
        name_vi: editName.trim() || editingLog.name_vi,
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
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
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
                      <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View>
                <TouchableOpacity style={styles.catalogBack} onPress={() => setCatalogSelectedType(null)}>
                  <Ionicons name="arrow-back" size={16} color={theme.colors.accentMint} />
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
              <TouchableOpacity onPress={() => setEditingLog(null)}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="screen.tabs.log.edit.foodName"
              placeholderTextColor={theme.colors.textDisabled}
              style={styles.editInput}
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

            <View style={styles.editGrid}>
              <View style={styles.editField}>
                <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.grams" />
                <TextInput value={editGrams} onChangeText={updateEditGrams} keyboardType="numeric" style={styles.editInput} />
              </View>
              <View style={styles.editField}>
                <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.kcal" />
                <TextInput value={editCalories} onChangeText={setEditCalories} keyboardType="numeric" style={styles.editInput} />
              </View>
              <View style={styles.editField}>
                <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.protein" />
                <TextInput value={editProtein} onChangeText={setEditProtein} keyboardType="numeric" style={styles.editInput} />
              </View>
              <View style={styles.editField}>
                <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.carbs" />
                <TextInput value={editCarbs} onChangeText={setEditCarbs} keyboardType="numeric" style={styles.editInput} />
              </View>
              <View style={styles.editField}>
                <Text style={styles.editLabel} i18nKey="screen.tabs.log.edit.fat" />
                <TextInput value={editFat} onChangeText={setEditFat} keyboardType="numeric" style={styles.editInput} />
              </View>
            </View>

            <TextInput
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="screen.tabs.log.edit.notes"
              placeholderTextColor={theme.colors.textDisabled}
              style={[styles.editInput, styles.editNotes]}
              multiline
            />

            <TouchableOpacity style={styles.catalogConfirmBtn} onPress={() => void handleSaveEditedLog()}>
              <Text style={styles.catalogConfirmText} i18nKey="screen.tabs.log.edit.save" />
            </TouchableOpacity>
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
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={editSavedMealName}
              onChangeText={setEditSavedMealName}
              placeholder="screen.tabs.log.edit.savedMealName"
              placeholderTextColor={theme.colors.textDisabled}
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

      {isLoading && <ActivityIndicator color={theme.colors.success} style={{ marginTop: 40 }} />}

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
                      <Ionicons name="create-outline" size={15} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.savedDelete} onPress={() => handleDeleteSaved(meal)}>
                      <Ionicons name="close-circle" size={16} color={theme.colors.textDisabled} />
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
                    backgroundColor: total > mealTarget ? theme.colors.danger : theme.colors.success,
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
                      <TouchableOpacity onPress={() => openEditLog(log)}>
                        <Ionicons name="create-outline" size={18} color={theme.colors.accentCyan} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => void handleRemoveLog(log)}>
                        <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
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
              <AnimatedIonicon name="add" size={18} color={theme.colors.textOnAccent} motion="pulse" />
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
                  <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
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

const styles = createThemedStyles((colors, radii) => ({
  heroBody: { marginBottom: 18, maxWidth: 700 },
  savedSection: { marginBottom: 16 },
  savedTitle: { color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 10 },
  savedList: { gap: 10, paddingRight: 16 },
  savedCard: { backgroundColor: colors.surfaceLifted, borderRadius: 8, padding: 14, width: 160, position: 'relative', borderWidth: 1, borderColor: colors.border },
  savedName: { color: colors.text, fontWeight: '700', fontSize: 13, marginBottom: 6, paddingRight: 16 },
  savedCalorie: { color: colors.accentMint, fontWeight: '800', fontSize: 18, marginBottom: 4 },
  savedMacro: { color: colors.textMuted, fontSize: 11 },
  savedEdit: { position: 'absolute', top: 8, right: 28 },
  savedDelete: { position: 'absolute', top: 8, right: 8 },
  logSummaryCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 14,
    marginBottom: 16,
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
    fontWeight: '800',
    marginBottom: 4,
  },
  logSummaryValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  logSummaryValueWarn: {
    color: colors.accentAmber,
  },
  logSummaryValueBurned: {
    color: colors.accentMint,
    fontSize: 20,
    fontWeight: '900',
  },
  logSummaryUnit: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  mealSection: { marginBottom: 12 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  mealHeaderRight: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  mealLabel: { color: colors.text, fontWeight: '700', fontSize: 15 },
  mealTotal: { color: colors.accentMint, fontWeight: '800' },
  mealTarget: { color: colors.textMuted, fontSize: 12 },
  mealProgressBar: { height: 6, backgroundColor: colors.border, borderRadius: 999, marginBottom: 10, overflow: 'hidden' },
  mealProgressFill: { height: '100%', borderRadius: 2 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  logInfo: { flex: 1 },
  logName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  logDetail: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  logRight: { alignItems: 'flex-end', gap: 4 },
  logActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logCalorie: { color: colors.accentMint, fontWeight: '700' },
  emptyStateCard: { marginTop: 8 },
  activitySection: { marginBottom: 20, marginTop: 4 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  activityTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  addActivityBtn: { backgroundColor: colors.accentMint, borderRadius: 16, width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  activityName: { color: colors.text, fontWeight: '600', fontSize: 14 },
  activityDetail: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
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
  activityBurned: { color: colors.warning, fontWeight: '700', fontSize: 13, marginTop: 8, textAlign: 'right' },
  // Exercise catalog modal
  catalogOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  catalogSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  catalogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  catalogTitle: { color: colors.text, fontWeight: '800', fontSize: 18 },
  catalogHint: { color: colors.textMuted, fontSize: 12, marginBottom: 12 },
  catalogItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  catalogItemName: { color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  catalogItemKcal: { color: colors.accentMint, fontSize: 12, fontWeight: '700' },
  catalogBack: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  catalogBackText: { color: colors.accentMint, fontSize: 13, fontWeight: '700' },
  catalogSelectedLabel: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  durationRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  durationBtn: { flex: 1, minWidth: 70, backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  durationBtnActive: { borderColor: colors.accentMint, backgroundColor: colors.surfaceSuccess },
  durationBtnMin: { color: colors.text, fontWeight: '700', fontSize: 14 },
  durationBtnKcal: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  durationBtnTextActive: { color: colors.accentMint },
  catalogConfirmBtn: { backgroundColor: colors.accentMint, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  catalogConfirmText: { color: colors.textOnAccent, fontWeight: '800', fontSize: 14 },
  editInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  editMealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  editMealBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  editMealBtnActive: { backgroundColor: colors.surfaceSuccess, borderColor: colors.accentMint },
  editMealBtnText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  editMealBtnTextActive: { color: colors.accentMint },
  editGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  editField: { flexBasis: '30%', flexGrow: 1, minWidth: 92 },
  editLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 5 },
  editNotes: { minHeight: 72, textAlignVertical: 'top', marginBottom: 14 },
}));


