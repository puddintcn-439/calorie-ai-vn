import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLogStore } from '../../store/log.store';
import { FoodLog, MealType, SavedMeal, ActivityLog, ActivityType, ACTIVITY_LABELS, User, ActivityLevel, UserGoal, ACTIVITY_MET } from '@calorie-ai/types';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';
import { apiClient } from '../../services/api';
import { getLocalDateYmd } from '../../services/date';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '🌅 Bữa sáng',
  lunch: '☀️ Bữa trưa',
  dinner: '🌙 Bữa tối',
  snack: '🍎 Ăn vặt',
};

type BodyStatus = 'underweight' | 'normal' | 'overweight' | 'obese';
type WeightRecommendation = 'increase' | 'maintain' | 'decrease';

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
  const [taskId, taskTitle = 'Bai tap lo trinh'] = payload.split('|');
  if (!taskId) return null;
  return { taskId, taskTitle };
}

function inferBodyStatus(weightKg?: number, heightCm?: number): BodyStatus | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null;
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  if (bmi < 18.5) return 'underweight';
  if (bmi < 23) return 'normal';
  if (bmi < 25) return 'overweight';
  return 'obese';
}

function inferWeightRecommendation(bodyStatus: BodyStatus): WeightRecommendation {
  if (bodyStatus === 'underweight') return 'increase';
  if (bodyStatus === 'normal') return 'maintain';
  return 'decrease';
}

function estimateExerciseCalories(activityType: ActivityType, durationMin: number, weightKg: number): number {
  const met = ACTIVITY_MET[activityType] ?? 5;
  const safeWeight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 65;
  return Math.max(1, Math.round(met * safeWeight * (durationMin / 60)));
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
  const { dailyLog, savedMeals, activityLogs, dailyRoadmap, isLoading, fetchDailyLog, fetchSavedMeals, fetchActivityLogs, fetchDailyRoadmap, removeLog, logSavedMeal, deleteSavedMeal, addActivity, deleteActivity, addRoadmapItem, deleteRoadmapItem } = useLogStore();
  const [perMealTargets, setPerMealTargets] = useState<Record<MealType, number>>({
    breakfast: 400, lunch: 600, dinner: 600, snack: 200,
  });
  const [profileMeta, setProfileMeta] = useState<Partial<User>>({});
  const [processingRoadmapId, setProcessingRoadmapId] = useState<string | null>(null);
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [catalogMode, setCatalogMode] = useState<'activity' | 'roadmap'>('activity');
  const [catalogSelectedType, setCatalogSelectedType] = useState<ActivityType | null>(null);
  const [catalogDuration, setCatalogDuration] = useState<15 | 30 | 45 | 60>(30);
  const [removedRoadmapTaskIds, setRemovedRoadmapTaskIds] = useState<string[]>([]);

  useEffect(() => {
    fetchDailyLog().catch(() => {});
    fetchSavedMeals().catch(() => {});
    fetchActivityLogs().catch(() => {});
    fetchDailyRoadmap().catch(() => {});
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
  }, []);

  const baseRoadmap = useMemo(() => {
    const bodyStatus = inferBodyStatus(profileMeta.weight_kg, profileMeta.height_cm);
    if (!bodyStatus || !profileMeta.activity_level || !profileMeta.goal) {
      return [];
    }
    return buildExerciseRoadmap(
      bodyStatus,
      profileMeta.activity_level,
      profileMeta.goal,
      profileMeta.weight_kg ?? 65,
    );
  }, [profileMeta.weight_kg, profileMeta.height_cm, profileMeta.activity_level, profileMeta.goal]);

  const customRoadmapItems = useMemo(() => {
    return dailyRoadmap
      .filter((item) => item.is_custom && !item.task_id.startsWith('removed:'))
      .map((item) => ({
        id: item.id,
        title: item.task_title,
        detail: `${item.duration_min} phút · ~${item.estimated_kcal} kcal`,
        activity_type: item.activity_type as ActivityType,
        duration_min: item.duration_min,
        estimated_kcal: item.estimated_kcal,
        is_custom: true,
      }));
  }, [dailyRoadmap]);

  const removedBaseRoadmapTaskIds = useMemo(() => {
    return new Set(
      dailyRoadmap
        .filter((item) => item.is_custom && item.task_id.startsWith('removed:'))
        .map((item) => item.task_id.replace('removed:', '')),
    );
  }, [dailyRoadmap]);

  const roadmap = useMemo(
    () => [
      ...baseRoadmap.filter((item) => !removedRoadmapTaskIds.includes(item.id) && !removedBaseRoadmapTaskIds.has(item.id)),
      ...customRoadmapItems,
    ],
    [baseRoadmap, customRoadmapItems, removedRoadmapTaskIds, removedBaseRoadmapTaskIds],
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

  const completedRoadmapKcal = useMemo(
    () => roadmap.reduce((sum, item) => sum + (roadmapActivityByTaskId[item.id] ? item.estimated_kcal : 0), 0),
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

  const handleQuickLog = (meal: SavedMeal) => {
    Alert.alert(
      `Log "${meal.name}"`,
      `${meal.total_calories} kcal · Vào bữa nào?`,
      (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((m) => ({
        text: MEAL_LABELS[m],
        onPress: async () => {
          try {
            await logSavedMeal(meal.id, m);
            Alert.alert('✅', `Đã log "${meal.name}" vào ${MEAL_LABELS[m]}`);
          } catch {
            Alert.alert('Lỗi', 'Không thể log bữa ăn.');
          }
        },
      })),
    );
  };

  const handleDeleteSaved = (meal: SavedMeal) => {
    Alert.alert('Xoá bộ sưu tập', `Xoá "${meal.name}"?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: () => deleteSavedMeal(meal.id) },
    ]);
  };

  const submitQuickActivity = async (activityType: ActivityType, minsRaw?: string | number | null) => {
    const mins = Number(minsRaw);
    if (!Number.isFinite(mins) || mins <= 0) {
      Alert.alert('Thiếu dữ liệu', 'Vui lòng nhập số phút hợp lệ.');
      return;
    }

    try {
      await addActivity({ activity_type: activityType, duration_min: Math.round(mins) });
    } catch {
      Alert.alert('Lỗi', 'Không thể ghi hoạt động');
    }
  };

  const openRoadmapQuickAdd = () => {
    if (unfinishedRoadmap.length === 0) {
      Alert.alert('Lộ trình đã hoàn thành', 'Bạn đã tick hết bài trong lộ trình hôm nay.');
      return;
    }

    Alert.alert('📋 Thêm từ lộ trình', 'Chọn bài tập để thêm vào mục Hoạt động:', [
      ...unfinishedRoadmap.slice(0, 3).map((task) => ({
        text: `${task.title} (${task.duration_min}p · ${task.estimated_kcal} kcal)`,
        onPress: () => void handleToggleRoadmapTask(task),
      })),
      { text: 'Huỷ', style: 'cancel' },
    ]);
  };

  const openManualAddActivity = () => {
    setCatalogMode('activity');
    setCatalogSelectedType(null);
    setCatalogDuration(30);
    setCatalogVisible(true);
  };

  const openAddRoadmapExercise = () => {
    setCatalogMode('roadmap');
    setCatalogSelectedType(null);
    setCatalogDuration(30);
    setCatalogVisible(true);
  };

  const handleCatalogConfirm = async () => {
    if (!catalogSelectedType) return;
    setCatalogVisible(false);

    if (catalogMode === 'roadmap') {
      const activityLabel = ACTIVITY_LABELS[catalogSelectedType] ?? catalogSelectedType;
      await addRoadmapItem({
        logged_date: getLocalDateYmd(),
        task_id: `custom-${Date.now()}`,
        task_title: `${activityLabel} tự chọn`,
        activity_type: catalogSelectedType,
        duration_min: catalogDuration,
        estimated_kcal: estimateExerciseCalories(catalogSelectedType, catalogDuration, userWeight),
        is_custom: true,
      });
      return;
    }

    await submitQuickActivity(catalogSelectedType, catalogDuration);
  };

  const handleAddActivity = () => {
    if (roadmap.length === 0) {
      openManualAddActivity();
      return;
    }

    Alert.alert('➕ Thêm hoạt động', 'Bạn muốn thêm theo cách nào?', [
      { text: 'Theo lộ trình', onPress: openRoadmapQuickAdd },
      { text: 'Thủ công', onPress: openManualAddActivity },
      { text: 'Huỷ', style: 'cancel' },
    ]);
  };

  const handleToggleRoadmapTask = async (task: ExerciseRoadmapItem) => {
    if (processingRoadmapId) return;

    setProcessingRoadmapId(task.id);
    try {
      const existing = roadmapActivityByTaskId[task.id];

      if (existing) {
        await deleteActivity(existing.id);
        Alert.alert('Đã bỏ hoàn thành', `Đã trừ ${task.estimated_kcal} kcal của "${task.title}".`);
      } else {
        await addActivity({
          activity_type: task.activity_type,
          duration_min: task.duration_min,
          calories_burned: task.estimated_kcal,
          notes: `ROADMAP_TASK:${task.id}|${task.title}`,
        });
        Alert.alert('Đã cập nhật calo đốt', `+${task.estimated_kcal} kcal từ "${task.title}".`);
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể cập nhật lộ trình tập lúc này.');
    } finally {
      setProcessingRoadmapId(null);
    }
  };

  const handleRemoveRoadmapTask = (task: ExerciseRoadmapItem) => {
    Alert.alert('Xóa bài tập', `Xóa "${task.title}" khỏi lộ trình?`, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          const linked = roadmapActivityByTaskId[task.id];
          if (linked) {
            void deleteActivity(linked.id);
          }

          if (task.is_custom) {
            void deleteRoadmapItem(task.id);
            return;
          }

          if (!removedBaseRoadmapTaskIds.has(task.id)) {
            void addRoadmapItem({
              logged_date: getLocalDateYmd(),
              task_id: `removed:${task.id}`,
              task_title: `Removed:${task.title}`,
              activity_type: task.activity_type,
              duration_min: 0,
              estimated_kcal: 0,
              is_custom: true,
            });
          }

          setRemovedRoadmapTaskIds((prev) => (prev.includes(task.id) ? prev : [...prev, task.id]));
        },
      },
    ]);
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
              <Text style={styles.catalogTitle}>{catalogMode === 'roadmap' ? '🧩 Thêm bài vào lộ trình' : '🏋️ Chọn bài tập'}</Text>
              <TouchableOpacity onPress={() => setCatalogVisible(false)}>
                <Ionicons name="close" size={22} color="#9fb1d1" />
              </TouchableOpacity>
            </View>

            {catalogSelectedType === null ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.catalogHint}>
                  {catalogMode === 'roadmap'
                    ? `Chọn bài để thêm vào lộ trình cá nhân (${userWeight} kg)`
                    : `Chọn loại hoạt động — calo tính theo cân nặng của bạn (${userWeight} kg)`}
                </Text>
                {catalogTypes.map((type) => {
                  const kcal30 = estimateExerciseCalories(type, 30, userWeight);
                  return (
                    <TouchableOpacity
                      key={type}
                      style={styles.catalogItem}
                      onPress={() => setCatalogSelectedType(type)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.catalogItemName}>{ACTIVITY_LABELS[type]}</Text>
                        <Text style={styles.catalogItemKcal}>~{kcal30} kcal / 30 phút</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#5f76a6" />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View>
                <TouchableOpacity style={styles.catalogBack} onPress={() => setCatalogSelectedType(null)}>
                  <Ionicons name="arrow-back" size={16} color="#6ee7b7" />
                  <Text style={styles.catalogBackText}>Chọn lại loại bài</Text>
                </TouchableOpacity>
                <Text style={styles.catalogSelectedLabel}>{ACTIVITY_LABELS[catalogSelectedType]}</Text>
                <Text style={styles.catalogHint}>Chọn thời gian tập:</Text>
                <View style={styles.durationRow}>
                  {([15, 30, 45, 60] as const).map((d) => {
                    const kcal = estimateExerciseCalories(catalogSelectedType, d, userWeight);
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[styles.durationBtn, catalogDuration === d && styles.durationBtnActive]}
                        onPress={() => setCatalogDuration(d)}
                      >
                        <Text style={[styles.durationBtnMin, catalogDuration === d && styles.durationBtnTextActive]}>{d} phút</Text>
                        <Text style={[styles.durationBtnKcal, catalogDuration === d && styles.durationBtnTextActive]}>~{kcal} kcal</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={styles.catalogConfirmBtn} onPress={() => void handleCatalogConfirm()}>
                  <Text style={styles.catalogConfirmText}>
                    {catalogMode === 'roadmap' ? 'Thêm vào lộ trình' : 'Thêm'} {ACTIVITY_LABELS[catalogSelectedType]} · {catalogDuration} phút · ~{estimateExerciseCalories(catalogSelectedType, catalogDuration, userWeight)} kcal
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Eyebrow>Timeline</Eyebrow>
      <HeroTitle>Nhật ký ăn uống và vận động trong ngày.</HeroTitle>
      <BodyText style={styles.heroBody}>Mỗi bữa được nhóm rõ ràng, có target theo từng meal và log nhanh từ bộ sưu tập.</BodyText>

      {isLoading && <ActivityIndicator color="#4ade80" style={{ marginTop: 40 }} />}

        {/* ---- Saved Meals Quick Log ---- */}
        {savedMeals.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.savedTitle}>⚡ Log nhanh</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedList}>
              {savedMeals.map((meal) => (
                <TouchableOpacity key={meal.id} style={styles.savedCard} onPress={() => handleQuickLog(meal)}>
                  <Text style={styles.savedName} numberOfLines={1}>{meal.name}</Text>
                  <Text style={styles.savedCalorie}>{meal.total_calories} kcal</Text>
                  <Text style={styles.savedMacro}>P:{Math.round(meal.total_protein_g)} C:{Math.round(meal.total_carbs_g)} F:{Math.round(meal.total_fat_g)}</Text>
                  <TouchableOpacity style={styles.savedDelete} onPress={() => handleDeleteSaved(meal)}>
                    <Ionicons name="close-circle" size={16} color="#6b7280" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ---- Daily Logs by Meal ---- */}
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((meal) => {
          const logs = logsByMeal[meal] ?? [];
          const total = logs.reduce((s, l) => s + l.calories, 0);
          return (
            <SurfaceCard key={meal} style={styles.mealSection}>
              <View style={styles.mealHeader}>
                <Text style={styles.mealLabel}>{MEAL_LABELS[meal]}</Text>
                <View style={styles.mealHeaderRight}>
                  {total > 0 && <Text style={styles.mealTotal}>{total} kcal</Text>}
                  <Text style={styles.mealTarget}>/{perMealTargets[meal]}</Text>
                </View>
              </View>
              {total > 0 && (
                <View style={styles.mealProgressBar}>
                  <View style={[styles.mealProgressFill, {
                    width: `${Math.min(total / perMealTargets[meal] * 100, 100)}%` as any,
                    backgroundColor: total > perMealTargets[meal] ? '#ef4444' : '#4ade80',
                  }]} />
                </View>
              )}
              {logs.map((log) => (
                <View key={log.id} style={styles.logRow}>
                  <View style={styles.logInfo}>
                    <Text style={styles.logName}>{log.name_vi ?? log.name}</Text>
                    <Text style={styles.logDetail}>
                      {log.estimated_grams}g · P:{Math.round(log.protein_g)}g C:{Math.round(log.carbs_g)}g F:{Math.round(log.fat_g)}g
                    </Text>
                  </View>
                  <View style={styles.logRight}>
                    <Text style={styles.logCalorie}>{log.calories} kcal</Text>
                    <TouchableOpacity onPress={() => removeLog(log.id)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {logs.length === 0 && (
                <EmptyState
                  icon="🥢"
                  title="Chưa có món nào"
                  description="Bạn có thể scan đồ ăn mới hoặc log nhanh từ bộ sưu tập ở phía trên."
                  style={styles.emptyStateCard}
                />
              )}
            </SurfaceCard>
          );
        })}

        {/* ---- Exercise Roadmap Section ---- */}
        <SurfaceCard style={styles.roadmapSection}>
          <View style={styles.roadmapHeader}>
            <View style={styles.roadmapHeaderTopRow}>
              <Text style={styles.roadmapTitle}>🧭 Lộ trình tập hôm nay</Text>
              <TouchableOpacity style={styles.roadmapAddBtn} onPress={openAddRoadmapExercise}>
                <Ionicons name="add" size={14} color="#0b1020" />
                <Text style={styles.roadmapAddBtnText}>Thêm bài</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.roadmapSummary}>
              Hoàn thành {Object.keys(roadmapActivityByTaskId).length}/{roadmap.length} bài · +{completedRoadmapKcal} kcal
            </Text>
          </View>

          {roadmap.length === 0 ? (
            <EmptyState
              icon="🧘"
              title="Chưa có lộ trình hôm nay"
              description="Hãy cập nhật hồ sơ hoặc thêm bài thủ công để bắt đầu."
              style={styles.emptyStateCard}
            />
          ) : (
            roadmap.map((task) => {
              const done = Boolean(roadmapActivityByTaskId[task.id]);
              return (
                <View key={task.id} style={[styles.roadmapItem, done && styles.roadmapItemCompleted]}>
                  <TouchableOpacity style={styles.roadmapLeft} onPress={() => void handleToggleRoadmapTask(task)}>
                    <View style={[styles.roadmapCheckbox, done && styles.roadmapCheckboxCompleted]}>
                      {done ? <Ionicons name="checkmark" size={14} color="#0b1020" /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roadmapItemTitle}>{task.title}</Text>
                      <Text style={styles.roadmapItemDetail}>{task.detail}</Text>
                      <Text style={styles.roadmapItemMeta}>~{task.estimated_kcal} kcal</Text>
                      <Text style={styles.roadmapCta}>{done ? 'Đã ghi vào mục Hoạt động' : 'Nhấn để cộng calories burned vào Activity'}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.roadmapRemoveBtn} onPress={() => handleRemoveRoadmapTask(task)}>
                    <Ionicons name="trash-outline" size={12} color="#fda4af" />
                    <Text style={styles.roadmapRemoveText}>Xóa bài</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </SurfaceCard>

        {/* ---- Activity Section ---- */}
        <SurfaceCard style={styles.activitySection}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>🏃 Hoạt động đã hoàn thành</Text>
            <TouchableOpacity style={styles.addActivityBtn} onPress={handleAddActivity}>
              <Ionicons name="add" size={18} color="#0f0f1a" />
            </TouchableOpacity>
          </View>
          {activityLogs.length === 0 ? (
            <EmptyState
              icon="🏃"
              title="Chưa có hoạt động"
              description="Thêm vận động để app tính calories burned và net calories chính xác hơn."
              style={styles.emptyStateCard}
            />
          ) : (
            activityLogs.map((act) => (
              <View key={act.id} style={styles.activityRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityName}>{ACTIVITY_LABELS[act.activity_type] ?? act.activity_type}</Text>
                  <Text style={styles.activityDetail}>{act.duration_min} phút · -{act.calories_burned} kcal</Text>
                  {parseRoadmapNote(act.notes) ? (
                    <Text style={styles.activityRoadmapBadge}>Liên kết lộ trình</Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => deleteActivity(act.id)}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))
          )}
          {activityLogs.length > 0 && (
            <Text style={styles.activityBurned}>
              Đã đốt: {activityLogs.reduce((s, a) => s + a.calories_burned, 0)} kcal
            </Text>
          )}
        </SurfaceCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  heroBody: { marginBottom: 18, maxWidth: 700 },
  savedSection: { marginBottom: 16 },
  savedTitle: { color: '#eff6ff', fontWeight: '700', fontSize: 15, marginBottom: 10 },
  savedList: { gap: 10, paddingRight: 16 },
  savedCard: { backgroundColor: '#0f1b3b', borderRadius: 18, padding: 14, width: 160, position: 'relative', borderWidth: 1, borderColor: '#21376b' },
  savedName: { color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 6, paddingRight: 16 },
  savedCalorie: { color: '#6ee7b7', fontWeight: '800', fontSize: 18, marginBottom: 4 },
  savedMacro: { color: '#8ca0c3', fontSize: 11 },
  savedDelete: { position: 'absolute', top: 8, right: 8 },
  mealSection: { marginBottom: 12 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  mealHeaderRight: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  mealLabel: { color: '#eff6ff', fontWeight: '700', fontSize: 15 },
  mealTotal: { color: '#6ee7b7', fontWeight: '800' },
  mealTarget: { color: '#7f91b5', fontSize: 12 },
  mealProgressBar: { height: 6, backgroundColor: '#213055', borderRadius: 999, marginBottom: 10, overflow: 'hidden' },
  mealProgressFill: { height: '100%', borderRadius: 2 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#213055' },
  logInfo: { flex: 1 },
  logName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  logDetail: { color: '#8ca0c3', fontSize: 12, marginTop: 2 },
  logRight: { alignItems: 'flex-end', gap: 4 },
  logCalorie: { color: '#6ee7b7', fontWeight: '700' },
  emptyStateCard: { marginTop: 8 },
  roadmapSection: { marginBottom: 14, marginTop: 2 },
  roadmapHeader: { marginBottom: 10 },
  roadmapHeaderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  roadmapTitle: { color: '#dbeafe', fontWeight: '800', fontSize: 15, marginBottom: 4 },
  roadmapAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6ee7b7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roadmapAddBtnText: { color: '#0b1020', fontSize: 12, fontWeight: '800' },
  roadmapSummary: { color: '#8ca0c3', fontSize: 12, fontWeight: '700' },
  roadmapItem: {
    borderWidth: 1,
    borderColor: '#2a3d73',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: 8,
    backgroundColor: '#111b38',
  },
  roadmapItemCompleted: {
    borderColor: '#6ee7b7',
    backgroundColor: '#123329',
  },
  roadmapLeft: { flexDirection: 'row', gap: 10 },
  roadmapCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#5f76a6',
    marginTop: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roadmapCheckboxCompleted: {
    borderColor: '#6ee7b7',
    backgroundColor: '#6ee7b7',
  },
  roadmapItemTitle: { color: '#eff6ff', fontSize: 13, fontWeight: '700' },
  roadmapItemDetail: { color: '#9fb1d1', fontSize: 12, lineHeight: 17, marginTop: 2 },
  roadmapItemMeta: { color: '#6ee7b7', fontSize: 12, fontWeight: '700', marginTop: 4 },
  roadmapCta: { color: '#9dd6b4', fontSize: 11, fontWeight: '700', marginTop: 6 },
  roadmapRemoveBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#2c1117',
  },
  roadmapRemoveText: { color: '#fda4af', fontSize: 11, fontWeight: '700' },
  activitySection: { marginBottom: 20, marginTop: 4 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  activityTitle: { color: '#eff6ff', fontWeight: '700', fontSize: 15 },
  addActivityBtn: { backgroundColor: '#6ee7b7', borderRadius: 16, width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#213055' },
  activityName: { color: '#fff', fontWeight: '600', fontSize: 14 },
  activityDetail: { color: '#9fb1d1', fontSize: 12, marginTop: 2 },
  activityRoadmapBadge: {
    marginTop: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#173f30',
    color: '#86efac',
    fontSize: 11,
    fontWeight: '700',
  },
  activityBurned: { color: '#fbbf24', fontWeight: '700', fontSize: 13, marginTop: 8, textAlign: 'right' },
  // Exercise catalog modal
  catalogOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  catalogSheet: { backgroundColor: '#0d1530', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  catalogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  catalogTitle: { color: '#eff6ff', fontWeight: '800', fontSize: 18 },
  catalogHint: { color: '#7f91b5', fontSize: 12, marginBottom: 12 },
  catalogItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111b38', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, borderWidth: 1, borderColor: '#21376b' },
  catalogItemName: { color: '#eff6ff', fontWeight: '700', fontSize: 14, marginBottom: 2 },
  catalogItemKcal: { color: '#6ee7b7', fontSize: 12, fontWeight: '700' },
  catalogBack: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  catalogBackText: { color: '#6ee7b7', fontSize: 13, fontWeight: '700' },
  catalogSelectedLabel: { color: '#eff6ff', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  durationRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  durationBtn: { flex: 1, minWidth: 70, backgroundColor: '#111b38', borderWidth: 1.5, borderColor: '#2a3d73', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  durationBtnActive: { borderColor: '#6ee7b7', backgroundColor: '#123329' },
  durationBtnMin: { color: '#eff6ff', fontWeight: '700', fontSize: 14 },
  durationBtnKcal: { color: '#8ca0c3', fontSize: 11, marginTop: 2 },
  durationBtnTextActive: { color: '#6ee7b7' },
  catalogConfirmBtn: { backgroundColor: '#6ee7b7', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  catalogConfirmText: { color: '#0b1020', fontWeight: '800', fontSize: 14 },
});
