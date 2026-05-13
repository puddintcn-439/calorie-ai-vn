import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  View, Text, StyleSheet, Alert,
  ActivityIndicator, useWindowDimensions, Switch, ScrollView, TouchableOpacity,
} from 'react-native';
import { Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { useReminderStore } from '../../store/reminder.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import { useLogStore } from '../../store/log.store';
import { apiClient } from '../../services/api';
import { User, ActivityLevel, UserGoal, ReminderPreferences, ActivityType, ACTIVITY_MET, SUBSCRIPTION_TIERS, SubscriptionTier } from '@calorie-ai/types';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiChip } from '../../components/ui-chip';
import { UiInput } from '../../components/ui-input';
import MacrosCard from '../../components/macros-card';

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: '🪑 Ít vận động',
  light: '🚶 Nhẹ (1-3 ngày/tuần)',
  moderate: '🏃 Vừa (3-5 ngày/tuần)',
  active: '💪 Nhiều (6-7 ngày/tuần)',
  very_active: '🔥 Rất nhiều',
};

const GOAL_LABELS: Record<UserGoal, string> = {
  lose_weight: '📉 Giảm cân',
  maintain: '⚖️ Duy trì',
  gain_muscle: '💪 Tăng cơ',
};

type BodyStatus = 'underweight' | 'normal' | 'overweight' | 'obese';
type WeightRecommendation = 'increase' | 'maintain' | 'decrease';

type CalorieAssessment = {
  bmi: number;
  body_status: BodyStatus;
  weight_recommendation: WeightRecommendation;
  recommended_goal: UserGoal;
  recommendation_note: string;
  target_weight_kg: number;
  weight_delta_kg: number;
  recommended_activity_level: ActivityLevel;
  activity_note: string;
  exercise_plan: string[];
};

type InstantAssessmentResult = {
  assessment: CalorieAssessment | null;
  hint: string;
};

type InstantCalorieTargets = {
  daily_calorie_target: number;
  target_breakfast_cal: number;
  target_lunch_cal: number;
  target_dinner_cal: number;
  target_snack_cal: number;
};

type ExerciseRoadmapItem = {
  id: string;
  title: string;
  detail: string;
  activity_type: ActivityType;
  duration_min: number;
  estimated_kcal: number;
};

const BODY_STATUS_LABELS: Record<BodyStatus, string> = {
  underweight: 'Gầy',
  normal: 'Bình thường',
  overweight: 'Thừa cân',
  obese: 'Béo phì',
};

const WEIGHT_RECOMMENDATION_LABELS: Record<WeightRecommendation, string> = {
  increase: 'Nên tăng cân',
  maintain: 'Nên duy trì cân nặng',
  decrease: 'Nên giảm cân',
};

const ACTIVITY_RECOMMENDATION_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Ít vận động',
  light: 'Nhẹ',
  moderate: 'Vừa',
  active: 'Nhiều',
  very_active: 'Rất nhiều',
};

const BODY_STATUS_TONES: Record<
  BodyStatus,
  { bg: string; border: string; accent: string; text: string; badgeBg: string }
> = {
  underweight: {
    bg: '#0f2b3d',
    border: '#2f95c6',
    accent: '#7dd3fc',
    text: '#e0f2fe',
    badgeBg: '#123a53',
  },
  normal: {
    bg: '#0f2f22',
    border: '#22c55e',
    accent: '#86efac',
    text: '#dcfce7',
    badgeBg: '#16442f',
  },
  overweight: {
    bg: '#3a2a12',
    border: '#f59e0b',
    accent: '#fcd34d',
    text: '#fef3c7',
    badgeBg: '#52370f',
  },
  obese: {
    bg: '#3b1720',
    border: '#ef4444',
    accent: '#fca5a5',
    text: '#fee2e2',
    badgeBg: '#5d1f2a',
  },
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildExercisePlan(
  level: ActivityLevel,
  recommendation: WeightRecommendation,
  bodyStatus: BodyStatus,
): string[] {
  if (bodyStatus === 'underweight') {
    return [
      'Tập sức mạnh 3-4 buổi/tuần (squat, push-up, row, hip hinge), tăng tạ nhẹ dần mỗi 1-2 tuần.',
      'Cardio nhẹ 20-25 phút, 2-3 buổi/tuần (đi bộ nhanh hoặc xe đạp nhẹ), tránh đốt quá nhiều calo.',
      'Bài tập core 2 buổi/tuần (plank, dead bug) + mobility 10 phút cuối buổi để hồi phục.',
      'Ưu tiên số lần lặp 8-12 reps, nghỉ đủ 60-90 giây để hỗ trợ tăng cơ.',
    ];
  }

  if (bodyStatus === 'normal') {
    return [
      'Cardio nền tảng 30-40 phút, 3-4 buổi/tuần (đi bộ nhanh, chạy nhẹ, bơi).',
      'Tập sức mạnh toàn thân 2-3 buổi/tuần để duy trì cơ và tư thế tốt.',
      'Thêm 1 buổi hoạt động yêu thích (thể thao, đạp xe, nhảy) để giữ thói quen bền vững.',
      'Mỗi ngày 7.000-10.000 bước, kèm 5-10 phút giãn cơ.',
    ];
  }

  if (bodyStatus === 'obese') {
    return [
      'Tuần 1-2: đi bộ 20-30 phút, 5 buổi/tuần; tăng dần lên 35-45 phút từ tuần 3.',
      'Tập sức mạnh tác động thấp 2-3 buổi/tuần (sit-to-stand, wall push-up, glute bridge).',
      'Thêm vận động ít áp lực khớp như xe đạp tại chỗ hoặc bơi 2 buổi/tuần.',
      'Mục tiêu tăng dần thời gian vận động mỗi tuần, ưu tiên đều đặn hơn là cường độ cao.',
    ];
  }

  if (level === 'active' || level === 'very_active') {
    return [
      'Cardio 45-60 phút, 5-6 buổi/tuần (zone 2 là chính) để giảm mỡ bền vững.',
      'Tập sức mạnh 3-4 buổi/tuần, ưu tiên bài compound để giữ khối cơ khi giảm cân.',
      'HIIT 1 buổi/tuần (12-18 phút) là đủ, tránh quá tải phục hồi.',
      'Theo dõi nhịp tim và ngày nghỉ chủ động để kiểm soát mệt mỏi.',
    ];
  }

  if (level === 'moderate') {
    return [
      'Cardio 35-45 phút, 4-5 buổi/tuần (đi bộ nhanh, đạp xe, elliptical).',
      'Tập sức mạnh toàn thân 3 buổi/tuần, tập trung nhóm cơ lớn.',
      '1 buổi interval nhẹ/tuần (nhanh 1 phút - chậm 2 phút, lặp 6-8 vòng).',
      'Giãn cơ 10 phút sau tập và 1 ngày hồi phục chủ động/tuần.',
    ];
  }

  if (recommendation === 'decrease') {
    return [
      'Đi bộ nhanh 30-40 phút, 5 buổi/tuần để tăng tiêu hao năng lượng ổn định.',
      'Tập sức mạnh cơ bản 2-3 buổi/tuần (squat ghế, kéo dây, chống đẩy biến thể).',
      'Tăng dần số bước hằng ngày (mục tiêu thêm 1.000 bước mỗi 2 tuần).',
      'Ưu tiên kỹ thuật đúng và duy trì lịch tập đều trước khi tăng cường độ.',
    ];
  }

  return [
    'Hoạt động nhẹ 25-35 phút, 4-5 buổi/tuần để duy trì thể lực nền.',
    'Tập sức mạnh cơ bản 2 buổi/tuần để giữ cơ và độ linh hoạt.',
    'Kết hợp 1 buổi kéo giãn hoặc yoga nhẹ giúp phục hồi tốt hơn.',
  ];
}

import { estimateExerciseCalories as _estimateExerciseCalories } from '../../services/exercise.service';

function estimateExerciseCalories(activityType: ActivityType, durationMin: number, weightKg: number): number {
  return _estimateExerciseCalories(activityType, durationMin, weightKg);
}

function buildExerciseRoadmap(
  bodyStatus: BodyStatus,
  activityLevel: ActivityLevel,
  recommendation: WeightRecommendation,
  weightKg: number,
): ExerciseRoadmapItem[] {
  const key = `${bodyStatus}-${activityLevel}-${recommendation}`;

  const basePlan: Omit<ExerciseRoadmapItem, 'id' | 'estimated_kcal'>[] =
    bodyStatus === 'underweight'
      ? [
          {
            title: 'Sức mạnh thân dưới',
            detail: 'Squat, glute bridge, lunge nhẹ để tăng cơ nền.',
            activity_type: 'gym',
            duration_min: 35,
          },
          {
            title: 'Đi bộ hồi phục',
            detail: 'Đi bộ nhẹ sau bữa tối để tăng trao đổi chất nhẹ nhàng.',
            activity_type: 'walking',
            duration_min: 20,
          },
          {
            title: 'Core + mobility',
            detail: 'Plank, dead bug và giãn cơ để cải thiện kỹ thuật tập.',
            activity_type: 'yoga',
            duration_min: 18,
          },
        ]
      : bodyStatus === 'normal'
        ? [
            {
              title: 'Cardio nền tảng',
              detail: 'Đi bộ nhanh hoặc chạy rất nhẹ để giữ tim mạch tốt.',
              activity_type: 'walking',
              duration_min: 30,
            },
            {
              title: 'Sức mạnh toàn thân',
              detail: 'Push-up, row, squat bodyweight để giữ cơ.',
              activity_type: 'gym',
              duration_min: 30,
            },
            {
              title: 'Kéo giãn chủ động',
              detail: 'Yoga nhẹ để phục hồi và duy trì linh hoạt.',
              activity_type: 'yoga',
              duration_min: 20,
            },
          ]
        : bodyStatus === 'obese'
          ? [
              {
                title: 'Đi bộ chia chặng',
                detail: 'Đi bộ 3 chặng ngắn trong ngày để giảm áp lực khớp.',
                activity_type: 'walking',
                duration_min: 35,
              },
              {
                title: 'Sức mạnh tác động thấp',
                detail: 'Sit-to-stand, wall push-up, band pull để tăng nền cơ.',
                activity_type: 'gym',
                duration_min: 25,
              },
              {
                title: 'Đạp xe nhẹ',
                detail: 'Nhịp ổn định, ưu tiên đều đặn hơn cường độ cao.',
                activity_type: 'cycling',
                duration_min: 20,
              },
            ]
          : activityLevel === 'active' || activityLevel === 'very_active'
            ? [
                {
                  title: 'Chạy zone 2',
                  detail: 'Giữ nhịp thở ổn định để đốt mỡ bền vững.',
                  activity_type: 'running',
                  duration_min: 35,
                },
                {
                  title: 'Sức mạnh compound',
                  detail: 'Ưu tiên squat/hinge/push/pull để giữ cơ khi giảm mỡ.',
                  activity_type: 'gym',
                  duration_min: 35,
                },
                {
                  title: 'Đi bộ cooldown',
                  detail: 'Đi bộ nhẹ sau tập để hồi phục và thêm tiêu hao.',
                  activity_type: 'walking',
                  duration_min: 20,
                },
              ]
            : [
                {
                  title: 'Đi bộ nhanh',
                  detail: 'Mục tiêu nhịp tim vừa phải, duy trì đều mỗi ngày.',
                  activity_type: 'walking',
                  duration_min: 30,
                },
                {
                  title: 'Buổi sức mạnh ngắn',
                  detail: 'Bài tập cơ bản toàn thân giúp giữ cơ và tăng trao đổi chất.',
                  activity_type: 'gym',
                  duration_min: 25,
                },
                {
                  title: 'Yoga phục hồi',
                  detail: 'Giảm căng cơ, cải thiện giấc ngủ và độ linh hoạt.',
                  activity_type: 'yoga',
                  duration_min: 15,
                },
              ];

  return basePlan.map((item, index) => ({
    ...item,
    id: `${key}-${index + 1}`,
    estimated_kcal: estimateExerciseCalories(item.activity_type, item.duration_min, weightKg),
  }));
}

function buildInstantAssessment(profile: Partial<User>): InstantAssessmentResult {
  const weight = profile.weight_kg;
  const height = profile.height_cm;

  if (!weight || !height || weight <= 0 || height <= 0) {
    return {
      assessment: null,
      hint: 'Nhập chiều cao và cân nặng để xem BMI, cân nặng mục tiêu và bài tập phù hợp ngay lập tức.',
    };
  }

  const heightM = height / 100;
  const bmi = round1(weight / (heightM * heightM));
  const healthyMinWeight = round1(18.5 * heightM * heightM);
  const healthyMaxWeight = round1(22.9 * heightM * heightM);

  let bodyStatus: BodyStatus;
  let weightRecommendation: WeightRecommendation;
  let recommendedGoal: UserGoal;
  let targetWeightKg: number;
  let recommendedActivityLevel: ActivityLevel;
  let recommendationNote: string;
  let activityNote: string;

  if (bmi < 18.5) {
    bodyStatus = 'underweight';
    weightRecommendation = 'increase';
    recommendedGoal = 'gain_muscle';
    targetWeightKg = healthyMinWeight;
    recommendedActivityLevel = 'light';
    recommendationNote =
      'Thể trạng hiện nghiêng về gầy. Nên tăng cân theo hướng tăng cơ, ưu tiên ăn đủ đạm và tăng calo từ từ.';
    activityNote =
      'Mức vận động nên ở mức nhẹ-vừa, tập sức mạnh có kiểm soát để tăng cơ và hạn chế đốt quá nhiều calo.';
  } else if (bmi < 23) {
    bodyStatus = 'normal';
    weightRecommendation = 'maintain';
    recommendedGoal = 'maintain';
    targetWeightKg = round1(weight);
    recommendedActivityLevel = 'moderate';
    recommendationNote =
      'Thể trạng đang ở vùng khỏe mạnh. Nên duy trì cân nặng hiện tại và giữ thói quen ăn uống-vận động đều đặn.';
    activityNote =
      'Mức vận động vừa là tối ưu để duy trì sức khỏe tim mạch, cơ bắp và độ bền.';
  } else if (bmi < 25) {
    bodyStatus = 'overweight';
    weightRecommendation = 'decrease';
    recommendedGoal = 'lose_weight';
    targetWeightKg = healthyMaxWeight;
    recommendedActivityLevel = 'moderate';
    recommendationNote =
      'Thể trạng hơi thừa cân. Nên giảm cân từ từ với thâm hụt calo vừa phải để bảo vệ sức khỏe lâu dài.';
    activityNote =
      'Bắt đầu ở mức vận động vừa, ưu tiên cardio nền tảng và tập sức mạnh để giữ khối cơ.';
  } else {
    bodyStatus = 'obese';
    weightRecommendation = 'decrease';
    recommendedGoal = 'lose_weight';
    targetWeightKg = healthyMaxWeight;
    recommendedActivityLevel = 'active';
    recommendationNote =
      'Thể trạng đang ở mức béo phì. Nên giảm cân theo lộ trình bền vững, kết hợp dinh dưỡng kiểm soát và vận động đều.';
    activityNote =
      'Nên hướng đến mức vận động cao dần theo từng tuần, tăng từ nhẹ lên vừa rồi đến nhiều để an toàn.';
  }

  const weightDeltaKg = round1(Math.abs(targetWeightKg - weight));
  const exercisePlan = buildExercisePlan(
    recommendedActivityLevel,
    weightRecommendation,
    bodyStatus,
  );

  return {
    assessment: {
      bmi,
      body_status: bodyStatus,
      weight_recommendation: weightRecommendation,
      recommended_goal: recommendedGoal,
      recommendation_note: recommendationNote,
      target_weight_kg: targetWeightKg,
      weight_delta_kg: weightDeltaKg,
      recommended_activity_level: recommendedActivityLevel,
      activity_note: activityNote,
      exercise_plan: exercisePlan,
    },
    hint: `Vùng cân nặng khỏe mạnh ước tính cho chiều cao này: ${healthyMinWeight} - ${healthyMaxWeight} kg.`,
  };
}

function getActivityFactor(level: ActivityLevel): number {
  const factors: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  return factors[level];
}

function getGoalAdjustment(goal: UserGoal): number {
  const adjustments: Record<UserGoal, number> = {
    lose_weight: 0.8,
    maintain: 1,
    gain_muscle: 1.1,
  };
  return adjustments[goal];
}

function calculateInstantCalorieTargets(
  profile: Partial<User>,
  recommendedGoal: UserGoal,
  recommendedActivity: ActivityLevel,
): InstantCalorieTargets | null {
  const weight = profile.weight_kg;
  const height = profile.height_cm;
  const age = profile.age;
  const gender = profile.gender;

  if (!weight || !height || !age || !gender) {
    return null;
  }

  // Prefer Katch–McArdle if body fat is available on profile
  const bodyFat = (profile as any).body_fat_pct;
  let bmr: number;
  if (typeof bodyFat === 'number' && bodyFat > 0 && bodyFat < 100) {
    const lbm = weight * (1 - bodyFat / 100);
    bmr = 370 + 21.6 * lbm;
  } else {
    bmr =
      gender === 'male'
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;
  }

  const tdee = bmr * getActivityFactor(recommendedActivity);
  const raw = Math.round(tdee * getGoalAdjustment(recommendedGoal));

  // Safety clamps (keep parity with backend)
  const floorBySex = gender === 'female' ? 1200 : 1500;
  const minAllowed = Math.max(floorBySex, Math.round(bmr * 1.1));
  const minByDeficit = Math.round(tdee * (1 - 0.2));
  const daily = Math.max(raw, minAllowed, minByDeficit);

  return {
    daily_calorie_target: daily,
    target_breakfast_cal: Math.round(daily * 0.25),
    target_lunch_cal: Math.round(daily * 0.35),
    target_dinner_cal: Math.round(daily * 0.3),
    target_snack_cal: Math.round(daily * 0.1),
  };
}

export default function ProfileScreen() {
  const { logout } = useAuthStore();
  const {
    preferences: reminderPrefs,
    previewNudge,
    isPreviewLoading,
    fetchPreferences: fetchReminders,
    updatePreferences: updateReminders,
    fetchPreviewNudge,
  } = useReminderStore();
  const { subscription, features, fetchSubscription, changeTier, isLoading: isSubscriptionLoading } = useSubscriptionStore();
  const { activityLogs, fetchActivityLogs, addActivity } = useLogStore();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<Partial<User>>({});
  const [reminders, setReminders] = useState<Partial<ReminderPreferences>>({});
  const [previewMeal, setPreviewMeal] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [basicCollapsed, setBasicCollapsed] = useState(true);
  const [assessmentCollapsed, setAssessmentCollapsed] = useState(true);
  const [notificationsCollapsed, setNotificationsCollapsed] = useState(true);
  const [goalCollapsed, setGoalCollapsed] = useState(true);
  const [calorieCollapsed, setCalorieCollapsed] = useState(true);
  const highlightAnim = React.useRef(new Animated.Value(0)).current;
  const highlightLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const basicIncomplete = !profile.weight_kg || !profile.height_cm || !profile.age;
  const isDesktop = width >= 900;
  const instantAssessment = useMemo(() => buildInstantAssessment(profile), [
    profile.weight_kg,
    profile.height_cm,
  ]);
  const assessmentTone = instantAssessment.assessment
    ? BODY_STATUS_TONES[instantAssessment.assessment.body_status]
    : null;
  const exerciseRoadmap = useMemo(() => {
    const assessment = instantAssessment.assessment;
    if (!assessment) return [];
    return buildExerciseRoadmap(
      assessment.body_status,
      assessment.recommended_activity_level,
      assessment.weight_recommendation,
      profile.weight_kg ?? 65,
    );
  }, [
    instantAssessment.assessment?.body_status,
    instantAssessment.assessment?.recommended_activity_level,
    instantAssessment.assessment?.weight_recommendation,
    profile.weight_kg,
  ]);

  const completedRoadmapTaskIds = useMemo(() => {
    const ids = new Set<string>();
    activityLogs.forEach((log) => {
      const note = log.notes ?? '';
      if (!note.startsWith('ROADMAP_TASK:')) return;
      const [taskId] = note.replace('ROADMAP_TASK:', '').split('|');
      if (taskId) ids.add(taskId);
    });
    return ids;
  }, [activityLogs]);

  const completedRoadmapKcal = useMemo(
    () => exerciseRoadmap.reduce((sum, item) => sum + (completedRoadmapTaskIds.has(item.id) ? item.estimated_kcal : 0), 0),
    [exerciseRoadmap, completedRoadmapTaskIds],
  );

  useEffect(() => {
    Promise.all([
      apiClient.get('/user/profile').then((res) => {
        setProfile(res.data);
      }).catch(() => {
        setProfile({});
      }),
      fetchReminders().then(() => {
        if (reminderPrefs) setReminders(reminderPrefs);
      }).catch(() => {
        setReminders({});
      }),
      fetchSubscription(),
      fetchPreviewNudge('lunch').catch(() => {}),
      fetchActivityLogs().catch(() => {}),
    ]).finally(() => setIsLoading(false));
  }, []);

  // Update local reminders state when reminder prefs are fetched
  useEffect(() => {
    if (reminderPrefs) {
      setReminders(reminderPrefs);
    }
  }, [reminderPrefs]);

  // Auto-expand BMI assessment when both weight and height are set
  useEffect(() => {
    if (profile.weight_kg && profile.height_cm) {
      setAssessmentCollapsed(false);
    }
  }, [profile.weight_kg, profile.height_cm]);

  // Highlight basic info card when required fields are missing
  useEffect(() => {
    if (basicIncomplete && basicCollapsed) {
      if (!highlightLoopRef.current) {
        highlightLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(highlightAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(highlightAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
          ]),
        );
        highlightLoopRef.current.start();
      }
    } else if (highlightLoopRef.current) {
      highlightLoopRef.current.stop();
      highlightLoopRef.current = null;
      highlightAnim.setValue(0);
    }
  }, [basicIncomplete, basicCollapsed]);

  useEffect(() => {
    const assessment = instantAssessment.assessment;
    if (!assessment) {
      return;
    }

    const calorieTargets = calculateInstantCalorieTargets(
      profile,
      assessment.recommended_goal,
      assessment.recommended_activity_level,
    );

    setProfile((prev) => {
      const next: Partial<User> = {
        ...prev,
        goal: assessment.recommended_goal,
        activity_level: assessment.recommended_activity_level,
      };

      if (calorieTargets) {
        next.daily_calorie_target = calorieTargets.daily_calorie_target;
        next.target_breakfast_cal = calorieTargets.target_breakfast_cal;
        next.target_lunch_cal = calorieTargets.target_lunch_cal;
        next.target_dinner_cal = calorieTargets.target_dinner_cal;
        next.target_snack_cal = calorieTargets.target_snack_cal;
      }

      return next;
    });
  }, [
    instantAssessment.assessment?.body_status,
    instantAssessment.assessment?.recommended_goal,
    instantAssessment.assessment?.recommended_activity_level,
    profile.age,
    profile.gender,
    profile.weight_kg,
    profile.height_cm,
  ]);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      // Save profile
      const profileRes = await apiClient.patch('/user/profile', {
        full_name: profile.full_name,
        weight_kg: profile.weight_kg ? Number(profile.weight_kg) : undefined,
        height_cm: profile.height_cm ? Number(profile.height_cm) : undefined,
        age: profile.age ? Number(profile.age) : undefined,
        gender: profile.gender,
        activity_level: profile.activity_level,
        goal: profile.goal,
        daily_calorie_target: profile.daily_calorie_target ? Number(profile.daily_calorie_target) : undefined,
        target_breakfast_cal: profile.target_breakfast_cal ? Number(profile.target_breakfast_cal) : undefined,
        target_lunch_cal: profile.target_lunch_cal ? Number(profile.target_lunch_cal) : undefined,
        target_dinner_cal: profile.target_dinner_cal ? Number(profile.target_dinner_cal) : undefined,
        target_snack_cal: profile.target_snack_cal ? Number(profile.target_snack_cal) : undefined,
      });
      setProfile(profileRes.data);

      // Save reminders if changed
      const reminderUpdates = {
        breakfast_reminder_enabled: reminders.breakfast_reminder_enabled,
        breakfast_reminder_time: reminders.breakfast_reminder_time,
        lunch_reminder_enabled: reminders.lunch_reminder_enabled,
        lunch_reminder_time: reminders.lunch_reminder_time,
        dinner_reminder_enabled: reminders.dinner_reminder_enabled,
        dinner_reminder_time: reminders.dinner_reminder_time,
        snack_reminder_enabled: reminders.snack_reminder_enabled,
        snack_reminder_time: reminders.snack_reminder_time,
        allow_push_notifications: reminders.allow_push_notifications,
        nudge_motivation_style: reminders.nudge_motivation_style,
      };

      await updateReminders(reminderUpdates);
      await fetchPreviewNudge(previewMeal);

      Alert.alert('✅', 'Đã lưu hồ sơ và thông báo!');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể lưu.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteRoadmapTask = async (task: ExerciseRoadmapItem) => {
    if (completedRoadmapTaskIds.has(task.id)) {
      return;
    }

    setCompletingTaskId(task.id);
    try {
      await addActivity({
        activity_type: task.activity_type,
        duration_min: task.duration_min,
        calories_burned: task.estimated_kcal,
        notes: `ROADMAP_TASK:${task.id}|${task.title}`,
      });
      Alert.alert('Đã cập nhật calo đốt', `+${task.estimated_kcal} kcal từ "${task.title}".`);
    } catch (error: any) {
      Alert.alert('Không thể cập nhật', error?.response?.data?.message ?? 'Vui lòng thử lại.');
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm?.('Bạn có chắc muốn đăng xuất?') ?? true;
      if (confirmed) {
        void logout();
      }
      return;
    }

    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const handleChangeSubscriptionTier = async (tier: SubscriptionTier) => {
    if (tier === subscription?.tier) {
      return;
    }

    try {
      await changeTier(tier);
      Alert.alert('Đã cập nhật gói', `User hiện đang ở gói ${SUBSCRIPTION_TIERS[tier].name}.`);
    } catch (error: any) {
      Alert.alert('Không thể cập nhật gói', error?.response?.data?.message ?? error?.message ?? 'Vui lòng thử lại.');
    }
  };

  if (isLoading) {
    return (
      <ScreenShell>
        <ActivityIndicator color="#4ade80" style={{ marginTop: 80 }} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Eyebrow>Personal Coach</Eyebrow>
        <HeroTitle>Thiết lập hồ sơ để AI tính target hợp lý hơn.</HeroTitle>
        <BodyText style={styles.heroBody}>
          Điều chỉnh thông tin cơ thể, mục tiêu và phân bổ calo theo từng bữa để dashboard và nhật ký phản ánh sát thực tế hơn.
        </BodyText>

        <SurfaceCard style={[styles.sectionCard, basicCollapsed && styles.sectionCardCompact]}>
          <Animated.View pointerEvents="none" style={[styles.highlightOverlay, { opacity: highlightAnim }]} />
          <TouchableOpacity onPress={() => setBasicCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Thiết lập thông tin thể trạng</Text>
              {basicCollapsed && (
                <Text style={styles.sectionSubtitle}>
                  {profile.weight_kg ? `${profile.weight_kg} kg · ${profile.height_cm ?? '--'} cm · ${profile.age ?? '--'} tuổi` : 'Chưa thiết lập'}
                </Text>
              )}
            </View>
            <MaterialIcons name={basicCollapsed ? 'expand-more' : 'expand-less'} size={26} color="#9fb1d1" />
          </TouchableOpacity>

          {!basicCollapsed && (
            <>
              <View style={[styles.metricsGrid, isDesktop && styles.metricsGridDesktop]}>
                <Field label="Họ và tên" value={profile.full_name ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, full_name: v }))} placeholder="Nguyễn Văn A" fullWidth />
                <Field label="Cân nặng (kg)" value={String(profile.weight_kg ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, weight_kg: Number(v) || undefined }))} keyboardType="numeric" placeholder="65" />
                <Field label="Chiều cao (cm)" value={String(profile.height_cm ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, height_cm: Number(v) || undefined }))} keyboardType="numeric" placeholder="170" />
                <Field label="Tuổi" value={String(profile.age ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, age: Number(v) || undefined }))} keyboardType="numeric" placeholder="25" />
              </View>

              <Text style={styles.label}>Giới tính</Text>
              <View style={styles.chipRow}>
                {(['male', 'female'] as const).map((g) => (
                  <UiChip key={g} label={g === 'male' ? '👨 Nam' : '👩 Nữ'} selected={profile.gender === g} onPress={() => setProfile((p) => ({ ...p, gender: g }))} />
                ))}
              </View>
            </>
          )}
        </SurfaceCard>

        <SurfaceCard style={[styles.sectionCard, assessmentCollapsed && styles.sectionCardCompact]}>
          <TouchableOpacity onPress={() => setAssessmentCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>🩺 Đánh giá BMI & thể trạng</Text>
              {assessmentCollapsed && (
                <Text style={styles.sectionSubtitle}>
                  {instantAssessment.assessment
                    ? `BMI ${instantAssessment.assessment.bmi} · ${BODY_STATUS_LABELS[instantAssessment.assessment.body_status]}`
                    : 'Nhập chiều cao và cân nặng để xem đánh giá'}
                </Text>
              )}
            </View>
            <MaterialIcons name={assessmentCollapsed ? 'expand-more' : 'expand-less'} size={26} color="#9fb1d1" />
          </TouchableOpacity>

          {!assessmentCollapsed && (
            <>
              <Text style={styles.helperText}>
                Tính tức thì theo số bạn vừa nhập, không cần bấm lưu database.
              </Text>

              {!!instantAssessment.assessment && (
                <View
                  style={[
                    styles.assessmentCard,
                    { backgroundColor: assessmentTone?.bg, borderColor: assessmentTone?.border },
                  ]}
                >
                  <View style={styles.assessmentTopRow}>
                    <View>
                      <Text style={[styles.assessmentBmiLabel, { color: assessmentTone?.accent }]}>BMI hiện tại</Text>
                      <Text style={[styles.assessmentBmiValue, { color: assessmentTone?.text }]}>{instantAssessment.assessment.bmi}</Text>
                    </View>
                    <View style={styles.assessmentMeta}>
                      <Text style={styles.assessmentMetaLabel}>Thể trạng</Text>
                      <Text style={[styles.assessmentMetaValue, { color: assessmentTone?.accent }]}> 
                        {BODY_STATUS_LABELS[instantAssessment.assessment.body_status]}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.assessmentGuidesRow}>
                    <View style={[styles.assessmentBadge, { backgroundColor: assessmentTone?.badgeBg, borderColor: assessmentTone?.border }]}>
                      <Text style={[styles.assessmentBadgeText, { color: assessmentTone?.text }]}> 
                        {WEIGHT_RECOMMENDATION_LABELS[instantAssessment.assessment.weight_recommendation]}
                      </Text>
                    </View>
                    <View style={[styles.assessmentBadge, { backgroundColor: assessmentTone?.badgeBg, borderColor: assessmentTone?.border }]}>
                      <Text style={[styles.assessmentBadgeText, { color: assessmentTone?.text }]}> 
                        Goal phù hợp: {GOAL_LABELS[instantAssessment.assessment.recommended_goal]}
                      </Text>
                    </View>
                    <View style={[styles.assessmentBadge, { backgroundColor: assessmentTone?.badgeBg, borderColor: assessmentTone?.border }]}>
                      <Text style={[styles.assessmentBadgeText, { color: assessmentTone?.text }]}> 
                        Vận động gợi ý: {ACTIVITY_RECOMMENDATION_LABELS[instantAssessment.assessment.recommended_activity_level]}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.assessmentNote, { color: assessmentTone?.text }]}> 
                    {instantAssessment.assessment.recommendation_note}
                  </Text>

                  <Text style={[styles.assessmentWeightPlan, { color: assessmentTone?.text }]}> 
                    {instantAssessment.assessment.weight_recommendation === 'maintain'
                      ? `Bạn đang gần mức cân nặng mục tiêu khỏe mạnh (${instantAssessment.assessment.target_weight_kg} kg).`
                      : `Ước tính cần ${instantAssessment.assessment.weight_recommendation === 'increase' ? 'tăng' : 'giảm'} khoảng ${instantAssessment.assessment.weight_delta_kg} kg để về vùng khỏe mạnh (mục tiêu ~${instantAssessment.assessment.target_weight_kg} kg).`}
                  </Text>

                  <Text style={[styles.assessmentActivityNote, { color: assessmentTone?.text }]}> 
                    {instantAssessment.assessment.activity_note}
                  </Text>

                  <View style={styles.exerciseListWrap}>
                    <Text style={[styles.exerciseListTitle, { color: assessmentTone?.accent }]}>Bài tập gợi ý:</Text>
                    {instantAssessment.assessment.exercise_plan.map((item, index) => (
                      <Text key={`exercise-${index}`} style={[styles.exerciseListItem, { color: assessmentTone?.text }]}> 
                        {index + 1}. {item}
                      </Text>
                    ))}
                  </View>

                  <Text style={styles.assessmentHint}>{instantAssessment.hint}</Text>
                </View>
              )}

              {!instantAssessment.assessment && !!instantAssessment.hint && (
                <Text style={styles.assessmentHint}>{instantAssessment.hint}</Text>
              )}
            </>
          )}
        </SurfaceCard>

        <View style={[styles.summaryRow, isDesktop && styles.summaryRowDesktop]}>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{profile.daily_calorie_target ?? '--'}</Text>
            <Text style={styles.summaryLabel}>Kcal mỗi ngày</Text>
          </SurfaceCard>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{profile.goal ? GOAL_LABELS[profile.goal] : '--'}</Text>
            <Text style={styles.summaryLabel}>Mục tiêu hiện tại</Text>
          </SurfaceCard>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{profile.activity_level ? ACTIVITY_LABELS[profile.activity_level] : '--'}</Text>
            <Text style={styles.summaryLabel}>Mức vận động</Text>
          </SurfaceCard>
        </View>

      <SurfaceCard style={[styles.sectionCard, goalCollapsed && styles.sectionCardCompact]}>
        <TouchableOpacity onPress={() => setGoalCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Phong cách mục tiêu</Text>
            {goalCollapsed && (
              <Text style={styles.sectionSubtitle}>{profile.goal ? GOAL_LABELS[profile.goal] : 'Chưa chọn'} · {profile.activity_level ? ACTIVITY_LABELS[profile.activity_level] : '...'}</Text>
            )}
          </View>
          <MaterialIcons name={goalCollapsed ? 'expand-more' : 'expand-less'} size={26} color="#9fb1d1" />
        </TouchableOpacity>

        {!goalCollapsed && (
          <>
            <Text style={styles.helperText}>Chọn kết quả bạn đang muốn đạt được và mức vận động thực tế mỗi tuần.</Text>

            <Text style={styles.label}>Mục tiêu</Text>
            <View style={styles.chipRow}>
              {(Object.keys(GOAL_LABELS) as UserGoal[]).map((g) => (
                <UiChip key={g} label={GOAL_LABELS[g]} selected={profile.goal === g} onPress={() => setProfile((p) => ({ ...p, goal: g }))} />
              ))}
            </View>

            <Text style={styles.label}>Mức độ vận động</Text>
            <View style={styles.chipRow}>
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
                <UiChip key={a} label={ACTIVITY_LABELS[a]} selected={profile.activity_level === a} onPress={() => setProfile((p) => ({ ...p, activity_level: a }))} style={styles.activityChip} />
              ))}
            </View>
          </>
        )}
      </SurfaceCard>

      <SurfaceCard style={[styles.sectionCard, calorieCollapsed && styles.sectionCardCompact]}>
        <TouchableOpacity onPress={() => setCalorieCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>🎯 Mục tiêu calo</Text>
            {calorieCollapsed && (
              <Text style={styles.sectionSubtitle}>{profile.daily_calorie_target ? `${profile.daily_calorie_target} kcal/ngày` : 'Chưa đặt'}</Text>
            )}
          </View>
          <MaterialIcons name={calorieCollapsed ? 'expand-more' : 'expand-less'} size={26} color="#9fb1d1" />
        </TouchableOpacity>

        {!calorieCollapsed && (
          <>
            <Text style={styles.helperText}>Phân bổ mức calo theo từng bữa để app hiển thị tiến độ rõ hơn trong nhật ký.</Text>
            <Field label="Tổng calo/ngày" value={String(profile.daily_calorie_target ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, daily_calorie_target: Number(v) || undefined }))} keyboardType="numeric" placeholder="1800" fullWidth />
            <View style={[styles.mealTargetRow, isDesktop && styles.mealTargetRowDesktop]}>
              <MealTargetField label="🌅 Sáng" value={String(profile.target_breakfast_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_breakfast_cal: Number(v) || undefined }))} />
              <MealTargetField label="☀️ Trưa" value={String(profile.target_lunch_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_lunch_cal: Number(v) || undefined }))} />
              <MealTargetField label="🌙 Tối" value={String(profile.target_dinner_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_dinner_cal: Number(v) || undefined }))} />
              <MealTargetField label="🍎 Vặt" value={String(profile.target_snack_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_snack_cal: Number(v) || undefined }))} />
            </View>
            <MacrosCard daily_calorie_target={profile.daily_calorie_target} weight_kg={profile.weight_kg} goal={profile.goal} />
          </>
        )}
      </SurfaceCard>

      <SurfaceCard style={[styles.sectionCard, notificationsCollapsed && styles.sectionCardCompact]}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity onPress={() => setNotificationsCollapsed((s) => !s)} activeOpacity={0.8} style={{ flex: 1 }}>
            <View>
              <Text style={styles.sectionTitle}>🔔 Nhận thông báo</Text>
              {notificationsCollapsed && (
                <Text style={styles.sectionSubtitle}>{(reminders.allow_push_notifications ?? true) ? 'Bật' : 'Tắt'}</Text>
              )}
            </View>
          </TouchableOpacity>

          <Switch
            value={reminders.allow_push_notifications ?? true}
            onValueChange={(v) => setReminders((r) => ({ ...r, allow_push_notifications: v }))}
            trackColor={{ false: '#203463', true: '#4ade80' }}
            thumbColor={(reminders.allow_push_notifications ?? true) ? '#6ee7b7' : '#7082a9'}
          />

          <TouchableOpacity onPress={() => setNotificationsCollapsed((s) => !s)} style={{ paddingLeft: 8 }}>
            <MaterialIcons name={notificationsCollapsed ? 'expand-more' : 'expand-less'} size={26} color="#9fb1d1" />
          </TouchableOpacity>
        </View>

        {!notificationsCollapsed && (
          <>
            <Text style={styles.helperText}>Bật thông báo mealtime để nhận nhắc nhở ăn và cập nhật tiến độ.</Text>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Cho phép thông báo push</Text>
              <Switch
                value={reminders.allow_push_notifications ?? true}
                onValueChange={(v) => setReminders((r) => ({ ...r, allow_push_notifications: v }))}
                trackColor={{ false: '#203463', true: '#4ade80' }}
                thumbColor={reminders.allow_push_notifications ? '#6ee7b7' : '#7082a9'}
              />
            </View>

            <Text style={styles.label}>Phong cách nhắc nhở</Text>
            <View style={styles.chipRow}>
              {(['encouraging', 'neutral', 'warning'] as const).map((style) => (
                <UiChip
                  key={style}
                  label={style === 'encouraging' ? '💪 Khuyến khích' : style === 'neutral' ? '📝 Trung lập' : '⚠️ Cảnh báo'}
                  selected={reminders.nudge_motivation_style === style}
                  onPress={() => setReminders((r) => ({ ...r, nudge_motivation_style: style }))}
                />
              ))}
            </View>

            <ReminderTimePickerRow
              meal="breakfast"
              mealLabel="🌅 Sáng"
              enabled={reminders.breakfast_reminder_enabled ?? true}
              time={reminders.breakfast_reminder_time ?? '07:00'}
              onEnabledChange={(v) => setReminders((r) => ({ ...r, breakfast_reminder_enabled: v }))}
              onTimeChange={(v) => setReminders((r) => ({ ...r, breakfast_reminder_time: v }))}
            />

            <ReminderTimePickerRow
              meal="lunch"
              mealLabel="🌤️ Trưa"
              enabled={reminders.lunch_reminder_enabled ?? true}
              time={reminders.lunch_reminder_time ?? '12:00'}
              onEnabledChange={(v) => setReminders((r) => ({ ...r, lunch_reminder_enabled: v }))}
              onTimeChange={(v) => setReminders((r) => ({ ...r, lunch_reminder_time: v }))}
            />

            <ReminderTimePickerRow
              meal="dinner"
              mealLabel="🌙 Tối"
              enabled={reminders.dinner_reminder_enabled ?? true}
              time={reminders.dinner_reminder_time ?? '19:00'}
              onEnabledChange={(v) => setReminders((r) => ({ ...r, dinner_reminder_enabled: v }))}
              onTimeChange={(v) => setReminders((r) => ({ ...r, dinner_reminder_time: v }))}
            />

            <ReminderTimePickerRow
              meal="snack"
              mealLabel="🍿 Vặt"
              enabled={reminders.snack_reminder_enabled ?? false}
              time={reminders.snack_reminder_time ?? '15:00'}
              onEnabledChange={(v) => setReminders((r) => ({ ...r, snack_reminder_enabled: v }))}
              onTimeChange={(v) => setReminders((r) => ({ ...r, snack_reminder_time: v }))}
            />

            <View style={styles.previewSection}>
              <Text style={styles.label}>Xem trước nudge theo bữa</Text>
              <View style={styles.chipRow}>
                {([
                  ['breakfast', '🌅 Sáng'],
                  ['lunch', '🌤️ Trưa'],
                  ['dinner', '🌙 Tối'],
                  ['snack', '🍿 Vặt'],
                ] as const).map(([mealType, label]) => (
                  <UiChip
                    key={mealType}
                    label={label}
                    selected={previewMeal === mealType}
                    onPress={() => {
                      setPreviewMeal(mealType);
                      void fetchPreviewNudge(mealType);
                    }}
                  />
                ))}
              </View>

              <SurfaceCard style={styles.previewCard}>
                {isPreviewLoading && <ActivityIndicator color="#6ee7b7" />}
                {!isPreviewLoading && previewNudge && (
                  <>
                    <Text style={styles.previewTitle}>{previewNudge.emoji} {previewNudge.title}</Text>
                    <Text style={styles.previewBody}>{previewNudge.body}</Text>
                    {!!previewNudge.streakContext && (
                      <Text style={styles.previewMeta}>
                        Streak hiện tại {previewNudge.streakContext.currentStreak} ngày · Best {previewNudge.streakContext.longestStreak} ngày
                      </Text>
                    )}
                  </>
                )}
              </SurfaceCard>
            </View>
          </>
        )}
      </SurfaceCard>

      <SurfaceCard style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>💎 Gói dịch vụ</Text>
        <View style={styles.subscriptionCard}>
          <View style={styles.subscriptionHeader}>
            <View>
              <Text style={styles.subscriptionTier}>{subscription?.tier === 'premium' ? 'Premium' : subscription?.tier === 'pro' ? 'Pro' : 'Miễn phí'}</Text>
              <Text style={styles.subscriptionStatus}>
                {subscription?.is_active ? 'Đang hoạt động' : 'Hết hạn'}
              </Text>
            </View>
            <MaterialIcons
              name={subscription?.tier === 'pro' ? 'star' : subscription?.tier === 'premium' ? 'favorite' : 'favorite-border'}
              size={32}
              color={subscription?.tier === 'pro' ? '#fbbf24' : subscription?.tier === 'premium' ? '#f97316' : '#6b7280'}
            />
          </View>

          <Text style={styles.subscriptionHelper}>
            Chọn gói để áp quyền tính năng tương ứng cho user hiện tại.
          </Text>

          <View style={[styles.planSelectorRow, isDesktop && styles.planSelectorRowDesktop]}>
            {(Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[]).map((tier) => {
              const tierInfo = SUBSCRIPTION_TIERS[tier];
              const isCurrentTier = subscription?.tier === tier;
              const accent = tier === 'pro' ? '#fbbf24' : tier === 'premium' ? '#f97316' : '#6ee7b7';

              return (
                <TouchableOpacity
                  key={tier}
                  style={[
                    styles.planOption,
                    isCurrentTier && styles.planOptionActive,
                    isCurrentTier && { borderColor: accent, backgroundColor: '#16213f' },
                  ]}
                  onPress={() => void handleChangeSubscriptionTier(tier)}
                  disabled={isSubscriptionLoading}
                >
                  <View style={styles.planOptionHeader}>
                    <Text style={styles.planOptionName}>{tierInfo.name}</Text>
                    {tierInfo.tag ? <Text style={[styles.planOptionTag, { color: accent }]}>{tierInfo.tag}</Text> : null}
                  </View>
                  <Text style={styles.planOptionDescription}>{tierInfo.description}</Text>
                  <Text style={styles.planOptionPrice}>
                    {tier === 'free' ? 'Miễn phí' : `$${tierInfo.price_usd_monthly}/tháng`}
                  </Text>
                  <Text style={[styles.planOptionAction, isCurrentTier && { color: accent }]}>
                    {isCurrentTier ? 'Đang áp dụng' : 'Chuyển sang gói này'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {features && (
            <View style={styles.featuresPreview}>
              <Text style={styles.featuresLabel}>Các tính năng:</Text>
              <View style={styles.featureGrid}>
                {[
                  { name: 'ai_coach', label: 'AI Coach' },
                  { name: 'meal_reminders', label: 'Nhắc nhở' },
                  { name: 'weekly_reports', label: 'Báo cáo' },
                  { name: 'healthkit_sync', label: 'HealthKit' },
                ].map(({ name, label }) => (
                  <View key={name} style={styles.featureCheckItem}>
                    <MaterialIcons
                      name={features[name as keyof typeof features] ? 'check-circle' : 'cancel'}
                      size={18}
                      color={features[name as keyof typeof features] ? '#10b981' : '#d1d5db'}
                    />
                    <Text style={[styles.featureCheckLabel, !features[name as keyof typeof features] && styles.featureCheckLabelDisabled]}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </SurfaceCard>

      <View style={[styles.actionRow, isDesktop && styles.actionRowDesktop]}>
        <UiButton label="Lưu hồ sơ" onPress={handleSaveProfile} loading={isSaving} style={styles.saveButton} />
        <UiButton label="Đăng xuất" onPress={handleLogout} variant="danger" style={styles.logoutBtn} />
      </View>
      </ScrollView>
    </ScreenShell>
  );
}

function Field({ label, value, onChangeText, keyboardType, placeholder, fullWidth }: { label: string; value: string; onChangeText: (v: string) => void; keyboardType?: any; placeholder?: string; fullWidth?: boolean }) {
  return (
    <View style={[styles.fieldContainer, fullWidth && styles.fieldContainerFull]}>
      <UiInput label={label} value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholder={placeholder} />
    </View>
  );
}

function MealTargetField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={styles.mealTargetField}>
      <UiInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder="0"
        containerStyle={{ marginBottom: 0 }}
        style={styles.mealTargetInput}
      />
    </View>
  );
}

function ReminderTimePickerRow({
  meal,
  mealLabel,
  enabled,
  time,
  onEnabledChange,
  onTimeChange,
}: {
  meal: string;
  mealLabel: string;
  enabled: boolean;
  time: string;
  onEnabledChange: (v: boolean) => void;
  onTimeChange: (v: string) => void;
}) {
  const [showPicker, setShowPicker] = React.useState(false);

  const handleTimeSelect = (hours: number, minutes: number) => {
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    onTimeChange(timeStr);
    setShowPicker(false);
  };

  const hours = parseInt(time.split(':')[0]);
  const minutes = parseInt(time.split(':')[1]);

  return (
    <View style={styles.reminderRow}>
      <View style={styles.reminderLabel}>
        <Text style={styles.reminderMealLabel}>{mealLabel}</Text>
        <Switch
          value={enabled}
          onValueChange={onEnabledChange}
          trackColor={{ false: '#203463', true: '#4ade80' }}
          thumbColor={enabled ? '#6ee7b7' : '#7082a9'}
        />
      </View>

      {enabled && (
        <View style={styles.reminderTimeInputs}>
          <View style={styles.timeInputGroup}>
            <Text style={styles.timeInputLabel}>Giờ</Text>
            <UiInput
              value={String(hours).padStart(2, '0')}
              onChangeText={(v) => {
                const h = Math.max(0, Math.min(23, parseInt(v) || 0));
                handleTimeSelect(h, minutes);
              }}
              keyboardType="number-pad"
              placeholder="HH"
              maxLength={2}
              containerStyle={{ marginBottom: 0 }}
              style={styles.timeInput}
            />
          </View>

          <Text style={styles.timeSeparator}>:</Text>

          <View style={styles.timeInputGroup}>
            <Text style={styles.timeInputLabel}>Phút</Text>
            <UiInput
              value={String(minutes).padStart(2, '0')}
              onChangeText={(v) => {
                const m = Math.max(0, Math.min(59, parseInt(v) || 0));
                handleTimeSelect(hours, m);
              }}
              keyboardType="number-pad"
              placeholder="MM"
              maxLength={2}
              containerStyle={{ marginBottom: 0 }}
              style={styles.timeInput}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heroBody: { marginBottom: 18, maxWidth: 720 },
  summaryRow: { gap: 12, marginBottom: 14 },
  summaryRowDesktop: { flexDirection: 'row' },
  summaryCard: { flex: 1, minHeight: 106, justifyContent: 'center' },
  summaryValue: { color: '#eff6ff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  summaryLabel: { color: '#8ea2c8', fontSize: 13, lineHeight: 18 },
  assessmentCard: {
    marginTop: 10,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  assessmentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assessmentBmiLabel: { color: '#93c5fd', fontSize: 12, fontWeight: '600' },
  assessmentBmiValue: { color: '#e2e8f0', fontSize: 28, fontWeight: '800' },
  assessmentMeta: { alignItems: 'flex-end' },
  assessmentMetaLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 4 },
  assessmentMetaValue: { color: '#dbeafe', fontSize: 16, fontWeight: '700' },
  assessmentGuidesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  assessmentBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  assessmentBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  assessmentNote: { color: '#cbd5e1', fontSize: 13, lineHeight: 19 },
  assessmentWeightPlan: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  assessmentActivityNote: { fontSize: 13, lineHeight: 19 },
  exerciseListWrap: { marginTop: 4, gap: 4 },
  exerciseListTitle: { fontSize: 13, fontWeight: '800' },
  exerciseListItem: { fontSize: 13, lineHeight: 18 },
  roadmapWrap: { marginTop: 10, gap: 8 },
  roadmapHeader: { gap: 4 },
  roadmapTitle: { fontSize: 13, fontWeight: '800' },
  roadmapSummary: { fontSize: 12, fontWeight: '700' },
  roadmapItem: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  roadmapItemLeft: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxTick: { color: '#0f172a', fontSize: 12, fontWeight: '900' },
  roadmapItemTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  roadmapItemDetail: { fontSize: 12, lineHeight: 17 },
  roadmapItemMeta: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  roadmapCta: { fontSize: 11, fontWeight: '700' },
  assessmentHint: { color: '#93c5fd', fontSize: 13, lineHeight: 19, marginTop: 10 },
  sectionCard: { marginBottom: 14 },
  highlightOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 12, backgroundColor: 'rgba(250,204,21,0.12)' },
  sectionCardCompact: { paddingVertical: 8, paddingHorizontal: 12 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionSubtitle: { color: '#9fb1d1', fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#dbeafe', marginBottom: 6 },
  helperText: { color: '#8ea2c8', fontSize: 13, lineHeight: 19, marginBottom: 8 },
  label: { color: '#94a3b8', fontSize: 13, marginBottom: 6, marginTop: 12, fontWeight: '500' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricsGridDesktop: { gap: 14 },
  fieldContainer: { width: '48%' },
  fieldContainerFull: { width: '100%' },
  input: {
    backgroundColor: '#121d3f',
    borderRadius: 14,
    padding: 14,
    color: '#f8fafc',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#23386b',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  activityChip: { marginBottom: 8 },
  mealTargetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  mealTargetRowDesktop: {
    gap: 14,
  },
  mealTargetField: {
    width: '48%',
  },
  mealTargetInput: { color: '#66f0a0', fontWeight: '800', fontSize: 18, textAlign: 'center' },
  actionRow: { gap: 10, marginTop: 4, marginBottom: 10 },
  actionRowDesktop: { flexDirection: 'row', alignItems: 'stretch' },
  saveButton: { flex: 1 },
  logoutBtn: { minWidth: 160 },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingVertical: 10 },
  switchLabel: { color: '#dbeafe', fontSize: 14, fontWeight: '600' },

  reminderRow: { marginBottom: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#203463' },
  reminderLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reminderMealLabel: { color: '#dbeafe', fontSize: 14, fontWeight: '600' },
  reminderTimeInputs: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  timeInputGroup: { flex: 1 },
  timeInputLabel: { color: '#8ea2c8', fontSize: 12, marginBottom: 4, fontWeight: '500' },
  timeInput: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#6ee7b7' },
  timeSeparator: { color: '#dbeafe', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  previewSection: { marginTop: 12 },
  previewCard: { marginTop: 10, backgroundColor: '#0f172a', borderColor: '#1e3a5f' },
  previewTitle: { color: '#eff6ff', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  previewBody: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  previewMeta: { color: '#8ea2c8', fontSize: 12, marginTop: 10, fontWeight: '600' },
  subscriptionCard: { backgroundColor: '#111827', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1f2937' },
  subscriptionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  subscriptionTier: { fontSize: 18, fontWeight: '700', color: '#dbeafe', marginBottom: 2 },
  subscriptionStatus: { fontSize: 12, color: '#6b7280' },
  subscriptionHelper: { color: '#8ea2c8', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  planSelectorRow: { gap: 10, marginBottom: 14 },
  planSelectorRowDesktop: { flexDirection: 'row' },
  planOption: { flex: 1, backgroundColor: '#0f1419', borderRadius: 12, borderWidth: 1, borderColor: '#23386b', padding: 12, gap: 6 },
  planOptionActive: { borderWidth: 1.5 },
  planOptionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  planOptionName: { fontSize: 15, fontWeight: '800', color: '#eff6ff' },
  planOptionTag: { fontSize: 11, fontWeight: '800' },
  planOptionDescription: { color: '#9fb1d1', fontSize: 12, lineHeight: 18 },
  planOptionPrice: { color: '#dbeafe', fontSize: 13, fontWeight: '700' },
  planOptionAction: { color: '#6ee7b7', fontSize: 12, fontWeight: '700', marginTop: 4 },
  featuresPreview: { marginBottom: 14 },
  featuresLabel: { fontSize: 12, color: '#8ea2c8', fontWeight: '500', marginBottom: 8 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featureCheckItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#0f1419', borderRadius: 6 },
  featureCheckLabel: { fontSize: 12, color: '#dbeafe', fontWeight: '500' },
  featureCheckLabelDisabled: { color: '#6b7280' },
});
