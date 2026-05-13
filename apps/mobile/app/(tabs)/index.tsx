import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal, Platform, LayoutAnimation, UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLogStore } from '../../store/log.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import {
  ActivityLog,
  ActivitySyncResult,
  ActivityType,
  ACTIVITY_LABELS,
  ACTIVITY_MET,
  ActivityLevel,
  CoachingInsight,
  User,
  UserGoal,
} from '@calorie-ai/types';
import { useGamificationStore } from '../../store/gamification.store';
import { useCalorieTargetStore } from '../../store/calorie-target.store';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';
import { apiClient } from '../../services/api';
import { activitySyncService, ActivitySyncPhoneCheckInfo } from '../../services/activity-sync.service';
import { getLocalDateYmd } from '../../services/date';

function buildDailyReassurance(remaining: number, progress: number) {
  if (remaining >= 350) {
    return {
      title: 'Bạn đang đi đúng hướng',
      body: 'Hôm nay còn khá nhiều khoảng trống để ăn thoải mái. Cứ giữ nhịp như hiện tại.',
      deltaText: `Bạn vẫn còn khoảng ${remaining} kcal trong vùng an toàn hôm nay.`,
      toneColor: '#6ee7b7',
    };
  }

  if (remaining >= 0) {
    return {
      title: 'Tiến độ hôm nay ổn rồi',
      body: 'Chỉ cần ưu tiên món nhẹ ở bữa tới là bạn vẫn bám mục tiêu rất tốt.',
      deltaText: `Còn khoảng ${remaining} kcal, bạn vẫn đang kiểm soát tốt.`,
      toneColor: '#7dd3fc',
    };
  }

  if (progress <= 1.15) {
    return {
      title: 'Hơi dư một chút, vẫn cứu được',
      body: 'Không sao cả. Chỉ cần điều chỉnh nhẹ ở bữa tiếp theo hoặc tăng vận động chút là ổn.',
      deltaText: `Hôm nay dư khoảng ${Math.abs(remaining)} kcal, nhưng tuần này bạn vẫn có thể đi đúng hướng.`,
      toneColor: '#fbbf24',
    };
  }

  return {
    title: 'Một ngày chưa như ý, nhưng chưa hề thất bại',
    body: 'Bỏ qua cảm giác tội lỗi. Mục tiêu là quay lại nhịp đều từ bữa kế tiếp.',
    deltaText: `Hôm nay dư khoảng ${Math.abs(remaining)} kcal. Tập trung vào 1 điều chỉnh nhỏ ngay bây giờ.`,
    toneColor: '#fda4af',
  };
}

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

import { estimateExerciseCalories as _estimateExerciseCalories } from '../../services/exercise.service';

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

export default function DashboardScreen() {
  const { dailyLog, activityLogs, dailyRoadmap, isLoading, fetchDailyLog, fetchActivityLogs, fetchDailyRoadmap, syncActivity, addActivity, deleteActivity, addRoadmapItem, deleteRoadmapItem } = useLogStore();
  const { features, fetchSubscription } = useSubscriptionStore();
  const { summary, fetchSummary } = useGamificationStore();
  const {
    recommendations,
    latestAdjustment,
    isLoadingRecommendations,
    isApplyingAdjustment,
    fetchRecommendations,
    applyWeeklyAdjustment,
  } = useCalorieTargetStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<ActivitySyncResult | null>(null);
  const [topInsight, setTopInsight] = useState<CoachingInsight | null>(null);
  const [phoneCheckInfo, setPhoneCheckInfo] = useState<ActivitySyncPhoneCheckInfo | null>(null);
  const [profileMeta, setProfileMeta] = useState<Partial<User>>({});
  const [processingRoadmapId, setProcessingRoadmapId] = useState<string | null>(null);
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [catalogSelectedType, setCatalogSelectedType] = useState<ActivityType | null>(null);
  const [catalogDuration, setCatalogDuration] = useState<15 | 30 | 45 | 60>(30);

  const fetchTopInsight = useCallback(async () => {
    try {
      const res = await apiClient.get('/coaching/insights');
      const insights: CoachingInsight[] = res.data ?? [];
      // Pick highest impact unacknowledged insight
      const sorted = insights.sort((a, b) => b.impact_score - a.impact_score);
      setTopInsight(sorted[0] ?? null);
    } catch {
      // Non-critical, ignore
    }
  }, []);

  useEffect(() => {
    fetchDailyLog().catch(() => {});
    fetchActivityLogs().catch(() => {});
    fetchDailyRoadmap().catch(() => {});
    fetchSubscription().catch(() => {});
    fetchSummary().catch(() => {});
    fetchRecommendations().catch(() => {});
    fetchTopInsight().catch(() => {});
    activitySyncService.getPhoneCheckInfo().then(setPhoneCheckInfo).catch(() => {});
    apiClient.get('/user/profile').then((res) => {
      setProfileMeta(res.data as User);
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

  // Convert backend roadmap items to ExerciseRoadmapItem format
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
    () => [...baseRoadmap.filter((item) => !removedBaseRoadmapTaskIds.has(item.id)), ...customRoadmapItems],
    [baseRoadmap, customRoadmapItems, removedBaseRoadmapTaskIds],
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

  const completedRoadmapKcal = useMemo(
    () => roadmap.reduce((sum, item) => sum + (roadmapActivityByTaskId[item.id] ? item.estimated_kcal : 0), 0),
    [roadmap, roadmapActivityByTaskId],
  );

  const userWeight = profileMeta.weight_kg ?? 65;
  const catalogTypes = Object.keys(ACTIVITY_LABELS) as ActivityType[];

  const consumed = dailyLog?.total_calories ?? 0;
  const burned = activityLogs.reduce((s, a) => s + a.calories_burned, 0);
  const net = consumed - burned;
  const target = dailyLog?.target_calories ?? 1800;
  const remaining = target - net;
  const progress = Math.min(net / target, 1);
  const hasHealthSync = features?.healthkit_sync ?? false;
  const reassurance = buildDailyReassurance(target - net, net / target);

  const handleSyncActivity = async () => {
    setIsSyncing(true);
    try {
      const result = await syncActivity();
      setLastSyncResult(result);
      Alert.alert('Đồng bộ thành công', `Đã nhập ${result.imported_count} hoạt động và ${result.total_calories_burned} kcal tiêu hao.`);
    } catch (error: any) {
      Alert.alert('Không thể đồng bộ', error?.message ?? 'Vui lòng thử lại.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleApplyWeeklyAdjustment = async () => {
    try {
      await applyWeeklyAdjustment();
      Alert.alert('Đã cập nhật', 'Mục tiêu calo tuần này đã được điều chỉnh theo mức độ bám kế hoạch.');
      await Promise.all([
        fetchDailyLog(),
        fetchRecommendations(),
      ]);
    } catch (error: any) {
      Alert.alert('Không thể cập nhật', error?.message ?? 'Vui lòng thử lại sau.');
    }
  };

  const handleOpenProviderSettings = async () => {
    try {
      await activitySyncService.openProviderSettings();
    } catch (error: any) {
      Alert.alert('Khong mo duoc', error?.message ?? 'Vui long thu lai tren phone native.');
    }
  };

  const handleOpenSupportLink = async () => {
    try {
      await activitySyncService.openSupportUrl();
    } catch (error: any) {
      Alert.alert('Khong mo duoc link', error?.message ?? 'Vui long thu lai sau.');
    }
  };

  const openAddRoadmapExercise = () => {
    setCatalogSelectedType(null);
    setCatalogDuration(30);
    setCatalogVisible(true);
  };

  const handleCatalogConfirm = async () => {
    if (!catalogSelectedType) return;
    const activityLabel = ACTIVITY_LABELS[catalogSelectedType] ?? catalogSelectedType;
    try {
      await addRoadmapItem({
        logged_date: getLocalDateYmd(),
        task_id: `custom-${Date.now()}`,
        task_title: `${activityLabel} tự chọn`,
        activity_type: catalogSelectedType,
        duration_min: catalogDuration,
        estimated_kcal: estimateExerciseCalories(catalogSelectedType, catalogDuration, userWeight),
        is_custom: true,
      });
      setCatalogVisible(false);
    } catch (error: any) {
      Alert.alert('Lỗi', error?.message ?? 'Không thể thêm bài tập. Vui lòng thử lại.');
    }
  };

  const handleToggleRoadmapTask = async (task: ExerciseRoadmapItem) => {
    if (processingRoadmapId) return;

    setProcessingRoadmapId(task.id);
    try {
      const existing = roadmapActivityByTaskId[task.id];
      if (existing) {
        await deleteActivity(existing.id);
      } else {
        await addActivity({
          activity_type: task.activity_type,
          duration_min: task.duration_min,
          calories_burned: task.estimated_kcal,
          notes: `ROADMAP_TASK:${task.id}|${task.title}`,
        });
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể cập nhật lộ trình tập lúc này.');
    } finally {
      setProcessingRoadmapId(null);
    }
  };

  const handleRemoveRoadmapTask = async (task: ExerciseRoadmapItem) => {
    const applyRemove = async () => {
      const linked = roadmapActivityByTaskId[task.id];
      if (linked) {
        void deleteActivity(linked.id);
      }

      if (!task.is_custom) {
        if (removedBaseRoadmapTaskIds.has(task.id)) return;

        await addRoadmapItem({
          logged_date: getLocalDateYmd(),
          task_id: `removed:${task.id}`,
          task_title: `Removed:${task.title}`,
          activity_type: task.activity_type,
          duration_min: 0,
          estimated_kcal: 0,
          is_custom: true,
        });
        return;
      }

      // For custom items, delete from backend
      try {
        await deleteRoadmapItem(task.id);
      } catch (error: any) {
        Alert.alert('Lỗi', error?.message ?? 'Không thể xóa bài tập. Vui lòng thử lại.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm?.(`Xóa "${task.title}" khỏi lộ trình?`) ?? false;
      if (confirmed) void applyRemove();
      return;
    }

    Alert.alert('Xóa bài tập', `Xóa "${task.title}" khỏi lộ trình?`, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => void applyRemove(),
      },
    ]);
  };

  return (
    <ScreenShell>
      <Modal
        visible={catalogVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCatalogVisible(false)}
      >
        <View style={styles.catalogOverlay}>
          <View style={styles.catalogSheet}>
            <View style={styles.catalogHeader}>
              <Text style={styles.catalogTitle}>🧩 Thêm bài vào lộ trình</Text>
              <TouchableOpacity onPress={() => setCatalogVisible(false)}>
                <Ionicons name="close" size={22} color="#9fb1d1" />
              </TouchableOpacity>
            </View>

            {catalogSelectedType === null ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.catalogHint}>Chọn bài để thêm vào lộ trình cá nhân ({userWeight} kg)</Text>
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
                <TouchableOpacity style={styles.catalogConfirmBtn} onPress={handleCatalogConfirm}>
                  <Text style={styles.catalogConfirmText}>
                    Thêm vào lộ trình {ACTIVITY_LABELS[catalogSelectedType]} · {catalogDuration} phút · ~{estimateExerciseCalories(catalogSelectedType, catalogDuration, userWeight)} kcal
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Eyebrow>Daily Overview</Eyebrow>
      <HeroTitle>Bạn đang tiến bộ từng ngày, theo cách thực tế.</HeroTitle>
      <BodyText style={styles.heroBody}>Không cần hoàn hảo. Chỉ cần biết hôm nay nên giữ gì và chỉnh gì, vậy là đủ để đẹp dáng bền vững.</BodyText>

        <SurfaceCard style={styles.reassuranceCard}>
          <Text style={[styles.reassuranceTitle, { color: reassurance.toneColor }]}>{reassurance.title}</Text>
          <Text style={styles.reassuranceBody}>{reassurance.body}</Text>
        </SurfaceCard>

        {/* ─── Coach Insight Widget ─── */}
        {topInsight && (
          <TouchableOpacity onPress={() => router.push('/(tabs)/coach')} activeOpacity={0.85}>
            <SurfaceCard style={styles.insightWidget}>
              <View style={styles.insightWidgetHeader}>
                <Text style={styles.insightWidgetEmoji}>{topInsight.emoji ?? '💡'}</Text>
                <View style={styles.insightWidgetContent}>
                  <Text style={styles.insightWidgetLabel}>Coach insight</Text>
                  <Text style={styles.insightWidgetTitle}>{topInsight.title}</Text>
                </View>
                <Text style={styles.insightWidgetArrow}>›</Text>
              </View>
              <Text style={styles.insightWidgetDesc} numberOfLines={2}>{topInsight.description}</Text>
            </SurfaceCard>
          </TouchableOpacity>
        )}

        <SurfaceCard style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Text style={styles.calorieNumber}>{net}</Text>
          <Text style={styles.calorieLabel}>kcal net (đã ăn - đốt)</Text>
          {burned > 0 && (
            <Text style={styles.burnedLabel}>🔥 Đốt {burned} kcal · Nạp {consumed} kcal</Text>
          )}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.remaining}>{reassurance.deltaText}</Text>
          <View style={styles.miniStats}>
            <View style={styles.statChip}><Text style={styles.statValue}>{target}</Text><Text style={styles.statLabel}>Target</Text></View>
            <View style={styles.statChip}><Text style={styles.statValue}>{consumed}</Text><Text style={styles.statLabel}>Nạp</Text></View>
            <View style={styles.statChip}><Text style={styles.statValue}>{burned}</Text><Text style={styles.statLabel}>Đốt</Text></View>
          </View>
        </SurfaceCard>

        <View style={styles.macroRow}>
          <MacroCard label="Protein" value={dailyLog?.total_protein_g ?? 0} unit="g" color="#f97316" />
          <MacroCard label="Carbs" value={dailyLog?.total_carbs_g ?? 0} unit="g" color="#3b82f6" />
          <MacroCard label="Fat" value={dailyLog?.total_fat_g ?? 0} unit="g" color="#eab308" />
        </View>

        <TouchableOpacity style={styles.scanButton} onPress={() => router.push('/(tabs)/scan')}>
          <Text style={styles.scanButtonText}>📸 Scan đồ ăn</Text>
          <Text style={styles.scanButtonSubtext}>Thêm bữa ăn mới chỉ với vài giây</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Hôm nay</Text>
        {isLoading && <ActivityIndicator color="#4ade80" />}
        {dailyLog?.logs.map((log) => (
          <SurfaceCard key={log.id} style={styles.logItem}>
            <Text style={styles.logName}>{log.name_vi ?? log.name}</Text>
            <Text style={styles.logCalorie}>{log.calories} kcal</Text>
          </SurfaceCard>
        ))}
        {dailyLog?.logs.length === 0 && (
          <EmptyState
            icon="🍽️"
            title="Hôm nay chưa có bữa nào"
            description="Scan món ăn đầu tiên để bắt đầu theo dõi calo và macro trong ngày."
          />
        )}

        <View style={{ height: 8 }} />

        <CollapsibleSection
          title="🗓️ Lộ trình tập hôm nay"
          badge={`${Object.keys(roadmapActivityByTaskId).filter((id) => roadmap.some((t) => t.id === id)).length}/${roadmap.length}`}
          defaultOpen
        >
          <SurfaceCard style={styles.roadmapSection}>
            <View style={styles.roadmapHeader}>
              <View style={styles.roadmapHeaderTopRow}>
                <Text style={styles.roadmapSummary}>
                  Hoàn thành {Object.keys(roadmapActivityByTaskId).filter((id) => roadmap.some((t) => t.id === id)).length}/{roadmap.length} · {completedRoadmapKcal} kcal
                </Text>
                <TouchableOpacity style={styles.roadmapAddBtn} onPress={openAddRoadmapExercise}>
                  <Ionicons name="add" size={16} color="#0b1020" />
                  <Text style={styles.roadmapAddBtnText}>Thêm bài</Text>
                </TouchableOpacity>
              </View>
            </View>

            {roadmap.length === 0 ? (
              <EmptyState
                icon="🎯"
                title="Chưa đủ dữ liệu để tạo lộ trình"
                description="Vào Hồ sơ nhập chiều cao, cân nặng, mục tiêu và mức vận động để app tạo checklist tập phù hợp."
              />
            ) : (
              roadmap.map((task) => {
                const completed = !!roadmapActivityByTaskId[task.id];
                const isBusy = processingRoadmapId === task.id;
                return (
                  <View key={task.id} style={[styles.roadmapItem, completed && styles.roadmapItemCompleted]}>
                    <TouchableOpacity
                      activeOpacity={0.86}
                      onPress={() => void handleToggleRoadmapTask(task)}
                      disabled={!!processingRoadmapId}
                    >
                      <View style={styles.roadmapLeft}>
                        <View style={[styles.roadmapCheckbox, completed && styles.roadmapCheckboxCompleted]}>
                          {completed ? <Ionicons name="checkmark" size={14} color="#0b1020" /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.roadmapItemTitle}>{task.title}</Text>
                          <Text style={styles.roadmapItemDetail}>{task.detail}</Text>
                          <Text style={styles.roadmapItemMeta}>{task.duration_min} phút · ~{task.estimated_kcal} kcal</Text>
                        </View>
                      </View>
                      <Text style={styles.roadmapCta}>{isBusy ? 'Đang cập nhật...' : completed ? 'Bỏ tích' : 'Tích hoàn thành'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.roadmapRemoveBtn}
                      onPress={() => handleRemoveRoadmapTask(task)}
                      disabled={!!processingRoadmapId}
                    >
                      <Ionicons name="trash-outline" size={14} color="#fda4af" />
                      <Text style={styles.roadmapRemoveText}>Xóa bài</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </SurfaceCard>
        </CollapsibleSection>

        {summary && (
          <CollapsibleSection
            title="🔥 Streak & Thành tích"
            badge={summary.current_streak > 0 ? `${summary.current_streak} ngày` : undefined}
          >
            <SurfaceCard style={styles.streakCard}>
              <View style={styles.streakHeader}>
                <View>
                  <Text style={styles.streakTitle}>Streak & Thành tích</Text>
                  <Text style={styles.streakSubtitle}>
                    {summary.current_streak > 0
                      ? `Bạn đang giữ ${summary.current_streak} ngày liên tiếp.`
                      : 'Bắt đầu một streak mới ngay hôm nay.'}
                  </Text>
                </View>
                <View style={styles.streakPill}>
                  <Text style={styles.streakPillValue}>🔥 {summary.current_streak}</Text>
                </View>
                {phoneCheckInfo.today ? (
                  <View style={styles.syncResultRow}>
                    <Text style={styles.syncResultText}>
                      Hôm nay: {phoneCheckInfo.today.steps} bước · ~{phoneCheckInfo.today.steps_estimated_kcal ?? 0} kcal từ bước · Đốt: {phoneCheckInfo.today.caloriesBurned} kcal
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.streakStatsRow}>
                <View style={styles.streakStatBox}>
                  <Text style={styles.streakStatValue}>{summary.longest_streak}</Text>
                  <Text style={styles.streakStatLabel}>Best streak</Text>
                </View>
                <View style={styles.streakStatBox}>
                  <Text style={styles.streakStatValue}>{summary.active_days_last_30}</Text>
                  <Text style={styles.streakStatLabel}>Ngày active / 30</Text>
                </View>
                <View style={styles.streakStatBox}>
                  <Text style={styles.streakStatValue}>{summary.total_food_logs}</Text>
                  <Text style={styles.streakStatLabel}>Food logs</Text>
                </View>
              </View>

              {summary.next_streak_milestone && (
                <Text style={styles.nextMilestoneText}>
                  Còn {Math.max(0, summary.next_streak_milestone - summary.current_streak)} ngày để chạm mốc {summary.next_streak_milestone}.
                </Text>
              )}

              <View style={styles.badgesRow}>
                {summary.badges.slice(0, 4).map((badge) => (
                  <View key={badge.id} style={[styles.badgeChip, badge.unlocked ? styles.badgeChipUnlocked : styles.badgeChipLocked]}>
                    <Text style={styles.badgeIcon}>{badge.icon}</Text>
                    <Text style={[styles.badgeLabel, !badge.unlocked && styles.badgeLabelLocked]}>{badge.label}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.achievementLink} onPress={() => router.push('../achievements')}>
                <Text style={styles.achievementLinkText}>Xem toàn bộ thành tích</Text>
              </TouchableOpacity>
            </SurfaceCard>
          </CollapsibleSection>
        )}

        <CollapsibleSection title="📊 Gợi ý & Điều chỉnh tuần">
          <SurfaceCard style={styles.recommendationCard}>
            <View style={styles.recommendationHeader}>
              <View>
                <Text style={styles.recommendationTitle}>Gợi ý tuần này</Text>
                <Text style={styles.recommendationSubtitle}>
                  {recommendations
                    ? `Hôm nay còn ${recommendations.remaining_calories} kcal · xu hướng tuần: ${recommendations.weekly_insights.trend}`
                    : 'Nhận gợi ý thực tế để giữ nhịp mà không quá áp lực'}
                </Text>
              </View>
              {isLoadingRecommendations ? <ActivityIndicator color="#6ee7b7" /> : null}
            </View>

            {recommendations?.meals.slice(0, 2).map((meal) => (
              <View key={meal.meal_type} style={styles.recommendationRow}>
                <Text style={styles.recommendationMeal}>
                  {meal.meal_type === 'breakfast'
                    ? '🌅 Sáng'
                    : meal.meal_type === 'lunch'
                      ? '🌤️ Trưa'
                      : meal.meal_type === 'dinner'
                        ? '🌙 Tối'
                        : '🍿 Vặt'}
                </Text>
                <Text style={styles.recommendationValue}>{meal.recommended_calories} kcal</Text>
              </View>
            ))}

            {recommendations?.weekly_insights?.suggestion ? (
              <Text style={styles.recommendationHint}>{recommendations.weekly_insights.suggestion}</Text>
            ) : null}

            {latestAdjustment ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.recommendationAdjustment}>
                  Điều chỉnh mới: {latestAdjustment.adjustment_percentage > 0 ? '+' : ''}
                  {latestAdjustment.adjustment_percentage}% → {latestAdjustment.adjusted_daily_target} kcal/ngày
                </Text>
                {latestAdjustment.actual_tdee != null ? (
                  <Text style={styles.recommendationDetail}>Actual TDEE: {latestAdjustment.actual_tdee} kcal</Text>
                ) : null}
                {latestAdjustment.clamp_reason ? (
                  <Text style={styles.recommendationDetail}>Lý do giới hạn: {latestAdjustment.clamp_reason}</Text>
                ) : null}
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.adjustButton}
              onPress={handleApplyWeeklyAdjustment}
              disabled={isApplyingAdjustment}
            >
              <Text style={styles.adjustButtonText}>
                {isApplyingAdjustment ? 'Đang điều chỉnh...' : 'Áp dụng điều chỉnh tuần'}
              </Text>
            </TouchableOpacity>
          </SurfaceCard>
        </CollapsibleSection>

        <CollapsibleSection title="💪 Health Activity Sync" badge={hasHealthSync ? 'PRO' : 'LOCKED'}>
          <SurfaceCard style={styles.syncCard}>
            <View style={styles.syncHeader}>
              <View>
                <Text style={styles.syncTitle}>Health Activity Sync</Text>
                <Text style={styles.syncDescription}>
                  {hasHealthSync
                    ? 'Đồng bộ bước đi và vận động vào calories burned trên dashboard.'
                    : 'Mở khóa đồng bộ HealthKit / Google Fit với gói Pro.'}
                </Text>
              </View>
            </View>

            {phoneCheckInfo && (
              <View style={styles.syncStatusCard}>
                <View style={styles.syncStatusHeader}>
                  <Text style={styles.syncStatusTitle}>{phoneCheckInfo.providerName}</Text>
                  <Text style={styles.syncStatusPill}>{phoneCheckInfo.statusLabel}</Text>
                </View>
                <Text style={styles.syncStatusDetail}>{phoneCheckInfo.detail}</Text>
                <Text style={styles.syncLinkLabel}>Link mo app tren phone</Text>
                <Text style={styles.syncLinkValue}>{phoneCheckInfo.deepLink}</Text>
                <View style={styles.syncActionRow}>
                  <TouchableOpacity style={styles.syncSecondaryButton} onPress={handleOpenProviderSettings}>
                    <Text style={styles.syncSecondaryButtonText}>{phoneCheckInfo.actionLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.syncGhostButton} onPress={handleOpenSupportLink}>
                    <Text style={styles.syncGhostButtonText}>{phoneCheckInfo.installLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.syncGhostButton} onPress={() => router.push('/health-sync' as never)}>
                    <Text style={styles.syncGhostButtonText}>Mo trang test</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {lastSyncResult && hasHealthSync && (
              <View style={styles.syncResultRow}>
                <Text style={styles.syncResultText}>
                  Lần gần nhất: +{lastSyncResult.total_calories_burned} kcal · {lastSyncResult.imported_count} mục mới
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.syncButton, !hasHealthSync && styles.syncButtonLocked]}
              onPress={() => (hasHealthSync ? handleSyncActivity() : router.push('/paywall'))}
              disabled={isSyncing}
            >
              <Text style={[styles.syncButtonText, !hasHealthSync && styles.syncButtonTextLocked]}>
                {isSyncing ? 'Đang đồng bộ...' : hasHealthSync ? 'Đồng bộ hoạt động' : 'Nâng cấp để dùng'}
              </Text>
            </TouchableOpacity>
          </SurfaceCard>
        </CollapsibleSection>
    </ScreenShell>
  );
}

function CollapsibleSection({ title, badge, defaultOpen = false, children }: { title: string; badge?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };
  return (
    <View style={styles.accordionWrapper}>
      <TouchableOpacity style={styles.accordionHeader} onPress={toggle} activeOpacity={0.8}>
        <Text style={styles.accordionTitle}>{title}</Text>
        <View style={styles.accordionRight}>
          {badge ? <Text style={styles.accordionBadge}>{badge}</Text> : null}
          <Text style={styles.accordionChevron}>{open ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>
      {open && <View style={styles.accordionBody}>{children}</View>}
    </View>
  );
}

function MacroCard({ label, value, unit, color }: any) {
  return (
    <SurfaceCard style={[styles.macroCard, { borderTopColor: color }]}> 
      <Text style={styles.macroValue}>{Math.round(value)}{unit}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  heroBody: { marginBottom: 16, maxWidth: 640 },
  reassuranceCard: { marginBottom: 14, borderWidth: 1, borderColor: '#223a70', backgroundColor: '#101d3a' },
  reassuranceTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  reassuranceBody: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  insightWidget: { marginBottom: 14, borderColor: '#6ee7b7', backgroundColor: '#0f2d2a' },
  insightWidgetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  insightWidgetEmoji: { fontSize: 22, marginRight: 10 },
  insightWidgetContent: { flex: 1 },
  insightWidgetLabel: { color: '#6ee7b7', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  insightWidgetTitle: { color: '#eff6ff', fontSize: 14, fontWeight: '700' },
  insightWidgetArrow: { color: '#6ee7b7', fontSize: 22, fontWeight: '300' },
  insightWidgetDesc: { color: '#b8c8e8', fontSize: 13, lineHeight: 19 },
  heroCard: { marginBottom: 16, alignItems: 'center', overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: -40, right: -20, width: 160, height: 160, borderRadius: 80, backgroundColor: '#6ee7b730' },
  calorieNumber: { fontSize: 56, fontWeight: '800', color: '#6ee7b7' },
  calorieLabel: { color: '#b4c5e4', marginBottom: 4, fontSize: 15 },
  burnedLabel: { color: '#fbbf24', fontSize: 12, marginBottom: 12, fontWeight: '600' },
  progressBar: { height: 10, backgroundColor: '#213055', borderRadius: 999, width: '100%', marginBottom: 10, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#4ade80', borderRadius: 4 },
  remaining: { color: '#9fb1d1', fontSize: 13 },
  miniStats: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  statChip: { flex: 1, backgroundColor: '#122041', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#223a70' },
  statValue: { color: '#eff6ff', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#8ca0c3', fontSize: 12, marginTop: 2 },
  macroRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  macroCard: { flex: 1, minWidth: 100, borderTopWidth: 3, alignItems: 'center' },
  macroValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
  macroLabel: { color: '#9fb1d1', fontSize: 12 },
  roadmapSection: { marginBottom: 16, marginTop: 2 },
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
  streakCard: { marginBottom: 16 },
  streakHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 },
  streakTitle: { color: '#eff6ff', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  streakSubtitle: { color: '#9fb1d1', fontSize: 13, lineHeight: 19, maxWidth: 250 },
  streakPill: { backgroundColor: '#25133f', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#6d28d9' },
  streakPillValue: { color: '#f0abfc', fontSize: 18, fontWeight: '800' },
  streakStatsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  streakStatBox: { flex: 1, backgroundColor: '#122041', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: '#223a70', alignItems: 'center' },
  streakStatValue: { color: '#fff', fontSize: 18, fontWeight: '800' },
  streakStatLabel: { color: '#8ca0c3', fontSize: 11, marginTop: 4, textAlign: 'center' },
  nextMilestoneText: { color: '#c4b5fd', fontSize: 12, fontWeight: '600', marginBottom: 12 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  badgeChipUnlocked: { backgroundColor: '#13291f', borderColor: '#14532d' },
  badgeChipLocked: { backgroundColor: '#172033', borderColor: '#24324f' },
  badgeIcon: { fontSize: 13 },
  badgeLabel: { color: '#d1fae5', fontSize: 12, fontWeight: '700' },
  badgeLabelLocked: { color: '#94a3b8' },
  achievementLink: { marginTop: 14, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  achievementLinkText: { color: '#e2e8f0', fontSize: 12, fontWeight: '700' },
  syncCard: { marginBottom: 16 },
  syncHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  syncTitle: { color: '#eff6ff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  syncDescription: { color: '#9fb1d1', fontSize: 13, lineHeight: 19, maxWidth: 260 },
  syncBadge: { color: '#6ee7b7', fontSize: 12, fontWeight: '800', backgroundColor: '#122041', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  syncStatusCard: { marginTop: 12, padding: 12, backgroundColor: '#0e1a33', borderRadius: 14, borderWidth: 1, borderColor: '#223a70' },
  syncStatusHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8 },
  syncStatusTitle: { color: '#eff6ff', fontSize: 13, fontWeight: '800', flex: 1 },
  syncStatusPill: { color: '#dbeafe', fontSize: 11, fontWeight: '700', backgroundColor: '#1d4ed8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  syncStatusDetail: { color: '#b4c5e4', fontSize: 12, lineHeight: 18 },
  syncLinkLabel: { color: '#7dd3fc', fontSize: 11, fontWeight: '700', marginTop: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  syncLinkValue: { color: '#e2e8f0', fontSize: 13, fontWeight: '700' },
  syncActionRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  syncSecondaryButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#1d4ed8' },
  syncSecondaryButtonText: { color: '#eff6ff', fontSize: 12, fontWeight: '800' },
  syncGhostButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#122041', borderWidth: 1, borderColor: '#334155' },
  syncGhostButtonText: { color: '#dbeafe', fontSize: 12, fontWeight: '700' },
  syncResultRow: { marginTop: 12, padding: 10, backgroundColor: '#122041', borderRadius: 12, borderWidth: 1, borderColor: '#223a70' },
  syncResultText: { color: '#b4c5e4', fontSize: 12, fontWeight: '600' },
  syncButton: { marginTop: 14, backgroundColor: '#60a5fa', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  syncButtonLocked: { backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151' },
  syncButtonText: { color: '#07111f', fontSize: 14, fontWeight: '800' },
  syncButtonTextLocked: { color: '#d1d5db' },
  recommendationCard: { marginBottom: 16 },
  recommendationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 },
  recommendationTitle: { color: '#eff6ff', fontSize: 16, fontWeight: '700' },
  recommendationSubtitle: { color: '#9fb1d1', fontSize: 12, marginTop: 3 },
  recommendationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recommendationMeal: { color: '#dbeafe', fontSize: 13, fontWeight: '700' },
  recommendationValue: { color: '#6ee7b7', fontSize: 13, fontWeight: '800' },
  recommendationHint: { color: '#cbd5e1', fontSize: 12, marginTop: 2, lineHeight: 18 },
  recommendationDetail: { color: '#9fb1d1', fontSize: 12, marginTop: 4 },
  recommendationAdjustment: { color: '#c4b5fd', fontSize: 12, marginTop: 10, fontWeight: '600' },
  adjustButton: { marginTop: 12, borderRadius: 12, backgroundColor: '#22d3ee', paddingVertical: 12, alignItems: 'center' },
  adjustButtonText: { color: '#06202a', fontSize: 13, fontWeight: '800' },
  scanButton: { backgroundColor: '#6ee7b7', borderRadius: 18, padding: 18, alignItems: 'center', marginBottom: 20 },
  scanButtonText: { color: '#07111f', fontWeight: '800', fontSize: 17 },
  scanButtonSubtext: { color: '#0f2a1b', marginTop: 4, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#eff6ff', marginBottom: 12 },
  logItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  logName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  logCalorie: { color: '#6ee7b7', fontWeight: '700' },
  accordionWrapper: { marginBottom: 12, marginTop: 4 },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111b38',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#223a70',
  },
  accordionTitle: { color: '#dbeafe', fontWeight: '800', fontSize: 14, flex: 1 },
  accordionRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accordionBadge: { color: '#6ee7b7', fontSize: 11, fontWeight: '800', backgroundColor: '#122041', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  accordionChevron: { color: '#5f76a6', fontSize: 11 },
  accordionBody: { paddingTop: 6 },
});
