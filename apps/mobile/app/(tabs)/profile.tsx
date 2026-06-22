import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  View,
  ActivityIndicator,
  useWindowDimensions,
  Switch,
  ScrollView,
  TouchableOpacity,
  Modal
} from 'react-native';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { useReminderStore } from '../../store/reminder.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import { useLogStore } from '../../store/log.store';
import { useCalorieTargetStore } from '../../store/calorie-target.store';
import { useInsightsStore } from '../../store/insights.store';
import { useThemeStore } from '../../store/theme.store';
import { apiClient } from '../../services/api';
import { User, ActivityLevel, UserGoal, HealthFlag, GoalPlan, ReminderPreferences, ActivityType, ActivityLog, ACTIVITY_LABELS as EXERCISE_ACTIVITY_LABELS, SUBSCRIPTION_TIERS, SubscriptionTier } from '@calorie-ai/types';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiChip } from '../../components/ui-chip';
import { UiInput } from '../../components/ui-input';
import MacrosCard from '../../components/macros-card';
import { VisualHeroCard } from '../../components/visual-hero-card';
import { AnimatedMaterialIcon } from '../../components/animated-icon';
import { RewardToast, RewardToastData } from '../../components/reward-toast';
import { createThemedStyles, useAppTheme } from '../../components/theme';
import { useI18n } from '../../components/i18n';
import type { I18nKey } from '../../components/i18n';

const profileHeroIllustration = require('../../assets/images/profile-hero.jpg') as number;

const ACTIVITY_LABELS: Record<ActivityLevel, I18nKey> = {
  sedentary: 'profile.activityLabel.sedentary',
  light: 'profile.activityLabel.light',
  moderate: 'profile.activityLabel.moderate',
  active: 'profile.activityLabel.active',
  very_active: 'profile.activityLabel.veryActive',
};

const GOAL_LABELS: Record<UserGoal, I18nKey> = {
  lose_weight: 'profile.goalLabel.loseWeight',
  maintain: 'profile.goalLabel.maintain',
  gain_muscle: 'profile.goalLabel.gainMuscle',
};

const HEALTH_FLAG_LABELS: Record<HealthFlag, I18nKey> = {
  pregnant: 'profile.healthFlag.pregnant',
  breastfeeding: 'profile.healthFlag.breastfeeding',
  kidney_disease: 'profile.healthFlag.kidneyDisease',
  diabetes: 'profile.healthFlag.diabetes',
  eating_disorder_history: 'profile.healthFlag.eatingDisorder',
  weight_affecting_medication: 'profile.healthFlag.weightMedication',
};

const HEALTH_FLAGS: HealthFlag[] = [
  'pregnant',
  'breastfeeding',
  'kidney_disease',
  'diabetes',
  'eating_disorder_history',
  'weight_affecting_medication',
];

type BodyStatus = 'underweight' | 'normal' | 'overweight' | 'obese';
type WeightRecommendation = 'increase' | 'maintain' | 'decrease';

type CalorieAssessment = {
  bmi: number;
  body_status: BodyStatus;
  weight_recommendation: WeightRecommendation;
  recommended_goal: UserGoal;
  recommendation_note: string;
  safety_warnings: string[];
  health_flags: HealthFlag[];
  medical_review_recommended: boolean;
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
  task_id?: string;
  title: string;
  detail: string;
  activity_type: ActivityType;
  duration_min: number;
  estimated_kcal: number;
  is_custom?: boolean;
  persisted_item_id?: string;
};

const BODY_STATUS_LABELS: Record<BodyStatus, I18nKey> = {
  underweight: 'profile.bodyStatus.underweight',
  normal: 'profile.bodyStatus.normal',
  overweight: 'profile.bodyStatus.overweight',
  obese: 'profile.bodyStatus.obese',
};

const WEIGHT_RECOMMENDATION_LABELS: Record<WeightRecommendation, I18nKey> = {
  increase: 'profile.weightRecommendation.increase',
  maintain: 'profile.weightRecommendation.maintain',
  decrease: 'profile.weightRecommendation.decrease',
};

const ACTIVITY_RECOMMENDATION_LABELS: Record<ActivityLevel, I18nKey> = {
  sedentary: 'profile.activityRecommendation.sedentary',
  light: 'profile.activityRecommendation.light',
  moderate: 'profile.activityRecommendation.moderate',
  active: 'profile.activityRecommendation.active',
  very_active: 'profile.activityRecommendation.veryActive',
};

function getBodyStatusTone(status: BodyStatus, colors: Record<string, string>): { bg: string; border: string; accent: string; text: string; badgeBg: string } {
  const tones: Record<BodyStatus, { bg: string; border: string; accent: string; text: string; badgeBg: string }> = {
    underweight: {
      bg: colors.surfaceInfo,
      border: colors.borderInfo,
      accent: colors.info,
      text: colors.textSoft,
      badgeBg: colors.surfaceInfo,
    },
    normal: {
      bg: colors.surfaceSuccess,
      border: colors.success,
      accent: colors.success,
      text: colors.textSoft,
      badgeBg: colors.surfaceSuccess,
    },
    overweight: {
      bg: colors.surfaceWarning,
      border: colors.warning,
      accent: colors.warning,
      text: colors.textSoft,
      badgeBg: colors.surfaceWarning,
    },
    obese: {
      bg: colors.surfaceDanger,
      border: colors.danger,
      accent: colors.danger,
      text: colors.borderDanger,
      badgeBg: colors.surfaceDanger,
    },
  };
  return tones[status];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildExercisePlan(
  level: ActivityLevel,
  recommendation: WeightRecommendation,
  bodyStatus: BodyStatus,
): I18nKey[] {
  if (bodyStatus === 'underweight') {
    return [
      'profile.exercisePlan.underweight.1',
      'profile.exercisePlan.underweight.2',
      'profile.exercisePlan.underweight.3',
      'profile.exercisePlan.underweight.4',
    ];
  }

  if (bodyStatus === 'normal') {
    return [
      'profile.exercisePlan.normal.1',
      'profile.exercisePlan.normal.2',
      'profile.exercisePlan.normal.3',
      'profile.exercisePlan.normal.4',
    ];
  }

  if (bodyStatus === 'obese') {
    return [
      'profile.exercisePlan.obese.1',
      'profile.exercisePlan.obese.2',
      'profile.exercisePlan.obese.3',
      'profile.exercisePlan.obese.4',
    ];
  }

  if (level === 'active' || level === 'very_active') {
    return [
      'profile.exercisePlan.active.1',
      'profile.exercisePlan.active.2',
      'profile.exercisePlan.active.3',
      'profile.exercisePlan.active.4',
    ];
  }

  if (level === 'moderate') {
    return [
      'profile.exercisePlan.moderate.1',
      'profile.exercisePlan.moderate.2',
      'profile.exercisePlan.moderate.3',
      'profile.exercisePlan.moderate.4',
    ];
  }

  if (recommendation === 'decrease') {
    return [
      'profile.exercisePlan.decrease.1',
      'profile.exercisePlan.decrease.2',
      'profile.exercisePlan.decrease.3',
      'profile.exercisePlan.decrease.4',
    ];
  }

  return [
    'profile.exercisePlan.default.1',
    'profile.exercisePlan.default.2',
    'profile.exercisePlan.default.3',
  ];
}

import { estimateExerciseCalories as _estimateExerciseCalories } from '../../services/exercise.service';
import { Text } from '../../components/i18n-text';
import { Alert } from '../../components/i18n-alert';

function estimateExerciseCalories(activityType: ActivityType, durationMin: number, weightKg: number): number {
  return _estimateExerciseCalories(activityType, durationMin, weightKg);
}

function parseRoadmapNote(notes?: string): { taskId: string; taskTitle: string } | null {
  if (!notes || !notes.startsWith('ROADMAP_TASK:')) return null;
  const payload = notes.replace('ROADMAP_TASK:', '');
  const [taskId, taskTitle = 'profile.roadmap.defaultTask'] = payload.split('|');
  if (!taskId) return null;
  return { taskId, taskTitle };
}

function nearestCatalogDuration(durationMin: number): 15 | 30 | 45 | 60 {
  const options = [15, 30, 45, 60] as const;
  return options.reduce((best, option) => (
    Math.abs(option - durationMin) < Math.abs(best - durationMin) ? option : best
  ), 30 as 15 | 30 | 45 | 60);
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
            title: 'profile.roadmap.underweight.1.title',
            detail: 'profile.roadmap.underweight.1.detail',
            activity_type: 'gym',
            duration_min: 35,
          },
          {
            title: 'profile.roadmap.underweight.2.title',
            detail: 'profile.roadmap.underweight.2.detail',
            activity_type: 'walking',
            duration_min: 20,
          },
          {
            title: 'Core + mobility',
            detail: 'profile.roadmap.underweight.3.detail',
            activity_type: 'yoga',
            duration_min: 18,
          },
        ]
      : bodyStatus === 'normal'
        ? [
            {
              title: 'profile.roadmap.normal.1.title',
              detail: 'profile.roadmap.normal.1.detail',
              activity_type: 'walking',
              duration_min: 30,
            },
            {
              title: 'profile.roadmap.normal.2.title',
              detail: 'profile.roadmap.normal.2.detail',
              activity_type: 'gym',
              duration_min: 30,
            },
            {
              title: 'profile.roadmap.normal.3.title',
              detail: 'profile.roadmap.normal.3.detail',
              activity_type: 'yoga',
              duration_min: 20,
            },
          ]
        : bodyStatus === 'obese'
          ? [
              {
                title: 'profile.roadmap.obese.1.title',
                detail: 'profile.roadmap.obese.1.detail',
                activity_type: 'walking',
                duration_min: 35,
              },
              {
                title: 'profile.roadmap.obese.2.title',
                detail: 'profile.roadmap.obese.2.detail',
                activity_type: 'gym',
                duration_min: 25,
              },
              {
                title: 'profile.roadmap.obese.3.title',
                detail: 'profile.roadmap.obese.3.detail',
                activity_type: 'cycling',
                duration_min: 20,
              },
            ]
          : activityLevel === 'active' || activityLevel === 'very_active'
            ? [
                {
                  title: 'profile.roadmap.active.1.title',
                  detail: 'profile.roadmap.active.1.detail',
                  activity_type: 'running',
                  duration_min: 35,
                },
                {
                  title: 'profile.roadmap.active.2.title',
                  detail: 'profile.roadmap.active.2.detail',
                  activity_type: 'gym',
                  duration_min: 35,
                },
                {
                  title: 'profile.roadmap.active.3.title',
                  detail: 'profile.roadmap.active.3.detail',
                  activity_type: 'walking',
                  duration_min: 20,
                },
              ]
            : [
                {
                  title: 'profile.roadmap.default.1.title',
                  detail: 'profile.roadmap.default.1.detail',
                  activity_type: 'walking',
                  duration_min: 30,
                },
                {
                  title: 'profile.roadmap.default.2.title',
                  detail: 'profile.roadmap.default.2.detail',
                  activity_type: 'gym',
                  duration_min: 25,
                },
                {
                  title: 'profile.roadmap.default.3.title',
                  detail: 'profile.roadmap.default.3.detail',
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

function normaliseHealthFlags(flags: unknown): HealthFlag[] {
  if (!Array.isArray(flags)) return [];
  return [...new Set(flags.filter((flag): flag is HealthFlag => HEALTH_FLAGS.includes(flag as HealthFlag)))];
}

function requiresMedicalReview(age: number | undefined, flags: HealthFlag[]): boolean {
  return (!!age && age < 18) || flags.length > 0;
}

function forcesMaintenanceGoal(age: number | undefined, flags: HealthFlag[]): boolean {
  return (!!age && age < 18)
    || flags.includes('pregnant')
    || flags.includes('breastfeeding')
    || flags.includes('eating_disorder_history');
}

function buildInstantAssessment(profile: Partial<User>): InstantAssessmentResult {
  const weight = profile.weight_kg;
  const height = profile.height_cm;
  const healthFlags = normaliseHealthFlags(profile.health_flags);

  if (!weight || !height || weight <= 0 || height <= 0) {
    return {
      assessment: null,
      hint: 'profile.assessment.missingHint',
    };
  }

  const heightM = height / 100;
  const bmi = round1(weight / (heightM * heightM));
  const healthyMinWeight = round1(18.5 * heightM * heightM);
  const healthyMaxWeight = round1(24.9 * heightM * heightM);
  const safetyWarnings: string[] = [
    'profile.assessment.safety.bmi',
  ];
  if (profile.age && profile.age < 18) {
    safetyWarnings.push('profile.assessment.safety.minorTarget');
    safetyWarnings.push('profile.assessment.safety.minorBmi');
  }
  if (healthFlags.includes('pregnant') || healthFlags.includes('breastfeeding')) {
    safetyWarnings.push('profile.assessment.safety.pregnancy');
  }
  if (healthFlags.includes('kidney_disease')) {
    safetyWarnings.push('profile.assessment.safety.kidney');
  }
  if (healthFlags.includes('diabetes')) {
    safetyWarnings.push('profile.assessment.safety.diabetes');
  }
  if (healthFlags.includes('eating_disorder_history')) {
    safetyWarnings.push('profile.assessment.safety.eatingDisorder');
  }
  if (healthFlags.includes('weight_affecting_medication')) {
    safetyWarnings.push('profile.assessment.safety.medication');
  }

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
    recommendationNote = 'profile.assessment.note.underweight';
    activityNote = 'profile.assessment.activityNote.underweight';
  } else if (bmi < 25) {
    bodyStatus = 'normal';
    weightRecommendation = 'maintain';
    recommendedGoal = 'maintain';
    targetWeightKg = round1(weight);
    recommendedActivityLevel = 'moderate';
    recommendationNote = 'profile.assessment.note.normal';
    activityNote = 'profile.assessment.activityNote.normal';
  } else if (bmi < 30) {
    bodyStatus = 'overweight';
    weightRecommendation = 'decrease';
    recommendedGoal = 'lose_weight';
    targetWeightKg = healthyMaxWeight;
    recommendedActivityLevel = 'moderate';
    recommendationNote = 'profile.assessment.note.overweight';
    activityNote = 'profile.assessment.activityNote.overweight';
  } else {
    bodyStatus = 'obese';
    weightRecommendation = 'decrease';
    recommendedGoal = 'lose_weight';
    targetWeightKg = healthyMaxWeight;
    recommendedActivityLevel = 'active';
    recommendationNote = 'profile.assessment.note.obese';
    activityNote = 'profile.assessment.activityNote.obese';
  }

  if (forcesMaintenanceGoal(profile.age, healthFlags)) {
    weightRecommendation = 'maintain';
    recommendedGoal = 'maintain';
    recommendationNote = 'profile.assessment.note.medicalReview';
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
      safety_warnings: safetyWarnings,
      health_flags: healthFlags,
      medical_review_recommended: requiresMedicalReview(profile.age, healthFlags),
      target_weight_kg: targetWeightKg,
      weight_delta_kg: weightDeltaKg,
      recommended_activity_level: recommendedActivityLevel,
      activity_note: activityNote,
      exercise_plan: exercisePlan,
    },
    hint: 'profile.assessment.healthyRangeHint',
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
  if (typeof bodyFat === 'number' && bodyFat >= 3 && bodyFat <= 70) {
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
  const { requestedMode, colors } = useAppTheme();
  const { setThemeMode } = useThemeStore();
  const { logout } = useAuthStore();
  const { locale, setLocale, t, tx } = useI18n();
  const {
    preferences: reminderPrefs,
    effectiveness: reminderEffectiveness,
    previewNudge,
    isPreviewLoading,
    fetchPreferences: fetchReminders,
    fetchEffectiveness: fetchReminderEffectiveness,
    updatePreferences: updateReminders,
    fetchPreviewNudge,
  } = useReminderStore();
  const { subscription, features, fetchSubscription, changeTier, isLoading: isSubscriptionLoading } = useSubscriptionStore();
  const {
    activityLogs,
    activityPreferences,
    fetchDailyLog,
    fetchActivityLogs,
    deleteActivity,
    fetchActivityPreferences,
    addActivityPreference,
    updateActivityPreference,
    deleteActivityPreference,
  } = useLogStore();
  const { fetchRecommendations } = useCalorieTargetStore();
  const { fetchWeeklyInsights } = useInsightsStore();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<Partial<User>>({});
  const [reminders, setReminders] = useState<Partial<ReminderPreferences>>({});
  const [previewMeal, setPreviewMeal] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [basicCollapsed, setBasicCollapsed] = useState(true);
  const [assessmentCollapsed, setAssessmentCollapsed] = useState(true);
  const [notificationsCollapsed, setNotificationsCollapsed] = useState(true);
  const [goalCollapsed, setGoalCollapsed] = useState(true);
  const [calorieCollapsed, setCalorieCollapsed] = useState(true);
  const [subscriptionCollapsed, setSubscriptionCollapsed] = useState(true);
  const [goalPlanTargetKg, setGoalPlanTargetKg] = useState<number | undefined>(undefined);
  const [goalPlanDurationWeeks, setGoalPlanDurationWeeks] = useState<number | undefined>(undefined);
  const [goalPlanDirection, setGoalPlanDirection] = useState<'loss' | 'maintain' | 'gain'>('loss');
  const [goalPlanCleared, setGoalPlanCleared] = useState(false);
  const [roadmapCatalogVisible, setRoadmapCatalogVisible] = useState(false);
  const [roadmapCatalogType, setRoadmapCatalogType] = useState<ActivityType | null>(null);
  const [roadmapCatalogDuration, setRoadmapCatalogDuration] = useState<15 | 30 | 45 | 60>(30);
  const [editingRoadmapTask, setEditingRoadmapTask] = useState<ExerciseRoadmapItem | null>(null);
  const [reward, setReward] = useState<RewardToastData | null>(null);
  const highlightAnim = React.useRef(new Animated.Value(0)).current;
  const highlightLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const useNativeHighlightDriver = Platform.OS !== 'web';
  const basicIncomplete = !profile.weight_kg || !profile.height_cm || !profile.age || !profile.gender;
  const isDesktop = width >= 900;
  const selectedHealthFlags = normaliseHealthFlags(profile.health_flags);
  const activeGoalPlan = profile.goal_plan ?? null;
  const instantAssessment = useMemo(() => buildInstantAssessment(profile), [
    profile.weight_kg,
    profile.height_cm,
    profile.age,
    profile.health_flags,
  ]);
  const assessmentTone = instantAssessment.assessment
    ? getBodyStatusTone(instantAssessment.assessment.body_status, colors as Record<string, string>)
    : null;
  const assessmentHintText = useMemo(() => {
    if (!instantAssessment.assessment) return tx(instantAssessment.hint);
    const heightM = profile.height_cm ? profile.height_cm / 100 : 0;
    if (!heightM) return tx(instantAssessment.hint);
    return t('profile.assessment.healthyRangeHint', {
      min: round1(18.5 * heightM * heightM),
      max: round1(24.9 * heightM * heightM),
    });
  }, [instantAssessment.assessment, instantAssessment.hint, profile.height_cm, t, tx]);
  const roadmap = useMemo<ExerciseRoadmapItem[]>(() => {
    return activityPreferences.map((item) => ({
      id: item.id,
      task_id: item.id,
      title: item.title,
      detail: 'profile.roadmap.customDetail',
      activity_type: item.activity_type as ActivityType,
      duration_min: item.duration_min,
      estimated_kcal: estimateExerciseCalories(item.activity_type as ActivityType, item.duration_min, profile.weight_kg ?? 65),
      is_custom: true,
      persisted_item_id: item.id,
    }));
  }, [activityPreferences, profile.weight_kg]);

  const roadmapActivityByTaskId = useMemo(() => {
    const map: Record<string, ActivityLog> = {};
    activityLogs.forEach((log) => {
      const parsed = parseRoadmapNote(log.notes);
      if (!parsed) return;
      map[parsed.taskId] = log;
    });
    return map;
  }, [activityLogs]);

  const completedRoadmapTaskIds = useMemo(() => {
    const ids = new Set<string>();
    activityLogs.forEach((log) => {
      const parsed = parseRoadmapNote(log.notes);
      if (parsed?.taskId) ids.add(parsed.taskId);
    });
    return ids;
  }, [activityLogs]);

  const completedRoadmapKcal = useMemo(
    () => roadmap.reduce((sum, item) => sum + (completedRoadmapTaskIds.has(item.id) ? item.estimated_kcal : 0), 0),
    [roadmap, completedRoadmapTaskIds],
  );
  const completedRoadmapCount = useMemo(
    () => roadmap.filter((item) => completedRoadmapTaskIds.has(item.id)).length,
    [roadmap, completedRoadmapTaskIds],
  );
  const setupSteps = useMemo(() => [
    {
      key: 'basic',
      label: t('profile.setup.basic'),
      detail: profile.weight_kg && profile.height_cm && profile.age && profile.gender
        ? t('profile.setup.basicDetail', {
            weight: profile.weight_kg,
            height: profile.height_cm,
            age: profile.age,
            gender: profile.gender === 'male' ? t('profile.gender.male').replace('👨 ', '') : t('profile.gender.female').replace('👩 ', ''),
          })
        : t('profile.setup.basicMissing'),
      done: Boolean(profile.weight_kg && profile.height_cm && profile.age && profile.gender),
      icon: 'monitor-weight',
    },
    {
      key: 'safety',
      label: t('profile.setup.safety'),
      detail: Array.isArray(profile.health_flags)
        ? (selectedHealthFlags.length > 0 ? t('profile.setup.safetyFlags', { count: selectedHealthFlags.length }) : t('profile.setup.safetyClear'))
        : t('profile.setup.safetyMissing'),
      done: Array.isArray(profile.health_flags),
      icon: 'health-and-safety',
    },
    {
      key: 'goal',
      label: t('profile.setup.goal'),
      detail: activeGoalPlan?.computed_daily_calorie_target
        ? t('profile.goalPlan.statusTitle', { target: activeGoalPlan.computed_daily_calorie_target })
        : profile.goal ? tx(GOAL_LABELS[profile.goal]) : t('profile.setup.goalMissing'),
      done: Boolean(profile.goal && profile.daily_calorie_target),
      icon: 'track-changes',
    },
    {
      key: 'roadmap',
      label: t('profile.setup.movement'),
      detail: roadmap.length > 0 ? t('profile.setup.movementDetail', { count: roadmap.length }) : t('profile.setup.movementMissing'),
      done: roadmap.length > 0,
      icon: 'directions-run',
    },
    {
      key: 'notifications',
      label: t('profile.setup.reminders'),
      detail: (reminders.allow_push_notifications ?? true) ? t('profile.setup.on') : t('profile.setup.off'),
      done: reminders.allow_push_notifications ?? true,
      icon: 'notifications-active',
    },
    {
      key: 'subscription',
      label: t('profile.setup.subscription'),
      detail: subscription?.tier && subscription.tier !== 'free'
        ? t('profile.setup.subscriptionUpgraded', { tier: subscription.tier === 'premium' ? 'Premium' : 'Pro' })
        : t('profile.setup.subscriptionFree'),
      done: Boolean(subscription?.tier && subscription.tier !== 'free'),
      icon: 'workspace-premium',
    },
  ] as const, [
    activeGoalPlan?.computed_daily_calorie_target,
    profile.age,
    profile.daily_calorie_target,
    profile.goal,
    profile.gender,
    profile.health_flags,
    profile.height_cm,
    profile.weight_kg,
    reminders.allow_push_notifications,
    roadmap.length,
    selectedHealthFlags.length,
    subscription?.tier,
    t,
    tx,
  ]);
  const completedSetupCount = setupSteps.filter((step) => step.done).length;
  const setupProgressPct = Math.round((completedSetupCount / setupSteps.length) * 100);
  const existingRoadmapActivityTypes = useMemo(
    () => new Set(roadmap.map((item) => item.activity_type)),
    [roadmap],
  );
  const catalogTypes = Object.keys(EXERCISE_ACTIVITY_LABELS) as ActivityType[];
  const userWeight = profile.weight_kg ?? 65;

  // Refs for scrolling to sections
  const scrollRef = React.useRef<any>(null);
  const basicRef = React.useRef<any>(null);
  const assessmentRef = React.useRef<any>(null);
  const goalRef = React.useRef<any>(null);
  const roadmapRef = React.useRef<any>(null);
  const notificationsRef = React.useRef<any>(null);
  const subscriptionRef = React.useRef<any>(null);

  const scrollToSection = (ref: any) => {
    if (!ref || !ref.current || !scrollRef.current) return;
    try {
      // Native measure then scroll
      (ref.current as any).measure((fx: any, fy: any, width: any, height: any, px: any, py: any) => {
        try {
          (scrollRef.current as any).scrollTo({ y: Math.max(0, py - 24), animated: true });
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
      // Fallback for web: try element scrollIntoView
      try {
        const el = (ref.current as any);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {}
    }
  };

  const openSetupStep = (key: typeof setupSteps[number]['key']) => {
    if (key === 'basic' || key === 'safety') {
      setBasicCollapsed(false);
      setAssessmentCollapsed(false);
      // allow UI to expand then scroll
      setTimeout(() => scrollToSection(key === 'basic' ? basicRef : assessmentRef), 160);
      return;
    }
    if (key === 'goal' || key === 'roadmap') {
      setGoalCollapsed(false);
      // scroll to roadmap panel when roadmap requested
      setTimeout(() => scrollToSection(key === 'goal' ? goalRef : roadmapRef), 160);
      return;
    }
    if (key === 'notifications') {
      setNotificationsCollapsed(false);
      setTimeout(() => scrollToSection(notificationsRef), 160);
      return;
    }
    if (key === 'subscription') {
      setSubscriptionCollapsed(false);
      setTimeout(() => scrollToSection(subscriptionRef), 160);
    }
  };

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
      fetchReminderEffectiveness(30).catch(() => {}),
      fetchPreviewNudge('lunch').catch(() => {}),
      fetchActivityLogs().catch(() => {}),
      fetchActivityPreferences().catch(() => {}),
    ]).finally(() => setIsLoading(false));
  }, []);

  // Sync local goal plan inputs when profile is loaded
  useEffect(() => {
    const gp = profile.goal_plan;
    if (gp) {
      setGoalPlanTargetKg(gp.target_kg ?? undefined);
      setGoalPlanDurationWeeks(gp.duration_weeks ?? undefined);
      setGoalPlanDirection(gp.direction ?? (profile.goal === 'lose_weight' ? 'loss' : (profile.goal === 'gain_muscle' ? 'gain' : 'maintain')));
      setGoalPlanCleared(false);
    }
  }, [profile.goal_plan, profile.goal]);

  // Update local reminders state when reminder prefs are fetched
  useEffect(() => {
    if (reminderPrefs) {
      setReminders(reminderPrefs);
    }
  }, [reminderPrefs]);

  // Highlight basic info card when required fields are missing
  useEffect(() => {
    if (basicIncomplete && basicCollapsed) {
      if (!highlightLoopRef.current) {
        highlightLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(highlightAnim, { toValue: 1, duration: 700, useNativeDriver: useNativeHighlightDriver }),
            Animated.timing(highlightAnim, { toValue: 0, duration: 700, useNativeDriver: useNativeHighlightDriver }),
          ]),
        );
        highlightLoopRef.current.start();
      }
    } else if (highlightLoopRef.current) {
      highlightLoopRef.current.stop();
      highlightLoopRef.current = null;
      highlightAnim.setValue(0);
    }
  }, [basicIncomplete, basicCollapsed, highlightAnim, useNativeHighlightDriver]);

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
    profile.health_flags,
  ]);

  const toggleHealthFlag = (flag: HealthFlag) => {
    setProfile((prev) => {
      const current = normaliseHealthFlags(prev.health_flags);
      const nextFlags = current.includes(flag)
        ? current.filter((item) => item !== flag)
        : [...current, flag];

      return { ...prev, health_flags: nextFlags };
    });
  };

  const clearGoalPlan = () => {
    setGoalPlanTargetKg(undefined);
    setGoalPlanDurationWeeks(undefined);
    setGoalPlanDirection('maintain');
    setGoalPlanCleared(true);
    setProfile((prev) => ({ ...prev, goal_plan: null }));
  };

  const buildGoalPlanPayload = (): GoalPlan | null | undefined => {
    if (goalPlanCleared) return null;

    const targetKg = Number(goalPlanTargetKg ?? 0);
    const durationWeeks = Number(goalPlanDurationWeeks ?? 0);
    const hasPlanInput = goalPlanDirection === 'maintain' || targetKg > 0 || durationWeeks > 0;
    if (!hasPlanInput) return undefined;

    const now = new Date();
    const safeDuration = durationWeeks > 0 ? durationWeeks : 4;
    return {
      target_kg: goalPlanDirection === 'maintain' ? 0 : Math.max(0, targetKg),
      duration_weeks: safeDuration,
      direction: goalPlanDirection,
      start_date: now.toISOString().split('T')[0],
      end_date: new Date(now.getTime() + (safeDuration * 7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
    };
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const goalPlanPayload = buildGoalPlanPayload();
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
        goal_plan: goalPlanPayload,
        health_flags: selectedHealthFlags,
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

      await Promise.all([
        updateReminders(reminderUpdates),
        fetchPreviewNudge(previewMeal),
        fetchDailyLog().catch(() => {}),
        fetchActivityLogs().catch(() => {}),
        fetchActivityPreferences().catch(() => {}),
        fetchRecommendations().catch(() => {}),
        fetchWeeklyInsights().catch(() => {}),
      ]);

      setReward({
        title: 'reward.profileSaved.title',
        body: 'reward.profileSaved.body',
        icon: 'checkmark-circle',
      });
    } catch (e: any) {
      Alert.alert('common.error', e?.response?.data?.message ?? 'profile.save.failed');
    } finally {
      setIsSaving(false);
    }
  };

  const openAddRoadmapExercise = () => {
    setEditingRoadmapTask(null);
    setRoadmapCatalogType(null);
    setRoadmapCatalogDuration(30);
    setRoadmapCatalogVisible(true);
  };

  const openEditRoadmapExercise = (task: ExerciseRoadmapItem) => {
    setEditingRoadmapTask(task);
    setRoadmapCatalogType(task.activity_type);
    setRoadmapCatalogDuration(nearestCatalogDuration(task.duration_min));
    setRoadmapCatalogVisible(true);
  };

  const handleRoadmapCatalogConfirm = async () => {
    if (!roadmapCatalogType) return;

    const activityLabel = tx(EXERCISE_ACTIVITY_LABELS[roadmapCatalogType] ?? roadmapCatalogType);
    const durationMin = roadmapCatalogDuration;
    const duplicate = roadmap.find((item) => (
      item.activity_type === roadmapCatalogType
      && item.id !== editingRoadmapTask?.id
    ));
    if (duplicate) {
      Alert.alert(
        'profile.roadmap.duplicateTitle',
        'profile.roadmap.duplicateBody',
      );
      return;
    }

    try {
      const linkedActivity = editingRoadmapTask ? roadmapActivityByTaskId[editingRoadmapTask.id] : null;

      // Update/add the preference first; only delete the linked activity log after success
      if (editingRoadmapTask?.persisted_item_id) {
        await updateActivityPreference(editingRoadmapTask.persisted_item_id, {
          title: t('profile.roadmap.customTitle', { activity: activityLabel }),
          activity_type: roadmapCatalogType,
          duration_min: durationMin,
        });
      } else {
        await addActivityPreference({
          title: t('profile.roadmap.customTitle', { activity: activityLabel }),
          activity_type: roadmapCatalogType,
          duration_min: durationMin,
          sort_order: activityPreferences.length,
        });
      }

      if (linkedActivity) {
        await deleteActivity(linkedActivity.id);
      }

      await fetchActivityPreferences();
      await fetchActivityLogs();
      await fetchDailyLog();
      setRoadmapCatalogVisible(false);
      setEditingRoadmapTask(null);
      setRoadmapCatalogType(null);
      setRoadmapCatalogDuration(30);
      setReward({
        title: editingRoadmapTask ? 'profile.roadmap.editSaved' : 'profile.roadmap.exerciseAdded',
        body: t('profile.roadmap.rewardBody', { activity: activityLabel, minutes: durationMin }),
        icon: 'walk',
      });
    } catch (error: any) {
      Alert.alert('profile.roadmap.saveExerciseFailed', error?.response?.data?.message ?? 'common.tryAgain');
    }
  };

  const removeRoadmapTask = async (task: ExerciseRoadmapItem) => {
    try {
      const linked = roadmapActivityByTaskId[task.id];
      if (linked) {
        await deleteActivity(linked.id);
      }

      if (task.is_custom && task.persisted_item_id) {
        await deleteActivityPreference(task.persisted_item_id);
      }

      await Promise.all([
        fetchActivityPreferences().catch(() => {}),
        fetchActivityLogs().catch(() => {}),
        fetchDailyLog().catch(() => {}),
      ]);
      setReward({
        title: 'profile.roadmap.exerciseDeleted',
        body: task.title,
        icon: 'trash-outline',
      });
    } catch (error: any) {
      Alert.alert('profile.roadmap.deleteExerciseFailed', error?.response?.data?.message ?? 'common.tryAgain');
    }
  };

  const handleRemoveRoadmapTask = (task: ExerciseRoadmapItem) => {
    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm?.(t('profile.roadmap.deleteConfirm', { title: task.title })) ?? false;
      if (confirmed) {
        void removeRoadmapTask(task);
      }
      return;
    }

    Alert.alert('profile.roadmap.deleteTitle', t('profile.roadmap.deleteConfirm', { title: task.title }), [
      { text: 'common.cancel', style: 'cancel' },
      {
        text: 'common.delete',
        style: 'destructive',
        onPress: () => void removeRoadmapTask(task),
      },
    ]);
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm?.(t('profile.logout.confirmMessage')) ?? false;
      if (confirmed) {
        void logout();
      }
      return;
    }

    Alert.alert('profile.logout.confirmTitle', 'profile.logout.confirmMessage', [
      { text: 'common.cancel', style: 'cancel' },
      { text: 'profile.logout', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const handleChangeSubscriptionTier = async (tier: SubscriptionTier) => {
    if (tier === subscription?.tier) {
      return;
    }

    try {
      await changeTier(tier);
      Alert.alert('profile.subscription.updated', t('profile.subscription.updatedBody', { tier: SUBSCRIPTION_TIERS[tier].name }));
    } catch (error: any) {
      Alert.alert('profile.subscription.updateFailed', error?.response?.data?.message ?? error?.message ?? 'common.tryAgain');
    }
  };

  if (isLoading) {
    return (
      <ScreenShell scrollRef={scrollRef}>
        <ActivityIndicator color={colors.success} style={{ marginTop: 80 }} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell scrollRef={scrollRef}>
      <Modal
        visible={roadmapCatalogVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRoadmapCatalogVisible(false)}
      >
        <View style={styles.catalogOverlay}>
          <View style={styles.catalogSheet}>
            <View style={styles.catalogHeader}>
              <Text style={styles.catalogTitle}>{editingRoadmapTask ? t('profile.roadmap.catalogTitleEdit') : t('profile.roadmap.catalogTitleAdd')}</Text>
              <TouchableOpacity onPress={() => setRoadmapCatalogVisible(false)}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {roadmapCatalogType === null ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.catalogHint}>{t('profile.roadmap.catalogHint', { weight: userWeight })}</Text>
                {catalogTypes.map((type) => {
                  const kcal30 = estimateExerciseCalories(type, 30, userWeight);
                  const alreadyAdded = existingRoadmapActivityTypes.has(type) && type !== editingRoadmapTask?.activity_type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.catalogItem, alreadyAdded && styles.catalogItemDisabled]}
                      onPress={() => setRoadmapCatalogType(type)}
                      disabled={alreadyAdded}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.catalogItemName, alreadyAdded && styles.catalogItemNameDisabled]}>
                          {tx(EXERCISE_ACTIVITY_LABELS[type])}
                        </Text>
                        <Text style={[styles.catalogItemKcal, alreadyAdded && styles.catalogItemKcalDisabled]}>
                          {alreadyAdded ? t('profile.roadmap.catalogAlreadyAdded') : t('profile.roadmap.catalogKcal', { kcal: kcal30, minutes: 30 })}
                        </Text>
                      </View>
                      <MaterialIcons name={alreadyAdded ? 'check-circle' : 'chevron-right'} size={18} color={alreadyAdded ? colors.accentMint : colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View>
                <TouchableOpacity style={styles.catalogBack} onPress={() => setRoadmapCatalogType(null)}>
                  <MaterialIcons name="arrow-back" size={16} color={colors.accentMint} />
                  <Text style={styles.catalogBackText} i18nKey="screen.tabs.profile.text.001" />
                </TouchableOpacity>
                <Text style={styles.catalogSelectedLabel}>{tx(EXERCISE_ACTIVITY_LABELS[roadmapCatalogType])}</Text>
                <Text style={styles.catalogHint} i18nKey="screen.tabs.profile.text.002" />
                <View style={styles.durationRow}>
                  {([15, 30, 45, 60] as const).map((duration) => {
                    const kcal = estimateExerciseCalories(roadmapCatalogType, duration, userWeight);
                    return (
                      <TouchableOpacity
                        key={duration}
                        style={[styles.durationBtn, roadmapCatalogDuration === duration && styles.durationBtnActive]}
                        onPress={() => setRoadmapCatalogDuration(duration)}
                      >
                        <Text style={[styles.durationBtnMin, roadmapCatalogDuration === duration && styles.durationBtnTextActive]}>{t('profile.roadmap.catalogDuration', { minutes: duration })}</Text>
                        <Text style={[styles.durationBtnKcal, roadmapCatalogDuration === duration && styles.durationBtnTextActive]}>~{kcal} kcal</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={styles.catalogConfirmBtn} onPress={() => void handleRoadmapCatalogConfirm()}>
                  <Text style={styles.catalogConfirmText}>
                    {t('profile.roadmap.catalogConfirm', {
                      action: editingRoadmapTask ? t('profile.roadmap.catalogConfirmSave') : t('profile.roadmap.catalogConfirmAdd'),
                      minutes: roadmapCatalogDuration,
                      kcal: estimateExerciseCalories(roadmapCatalogType, roadmapCatalogDuration, userWeight),
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <View>
        <VisualHeroCard
          imageSource={profileHeroIllustration}
          eyebrow={t('profile.hero.eyebrow')}
          title={t('profile.hero.title')}
          body={t('profile.hero.body')}
        />

        <View style={styles.profileShortcutRow}>
          <TouchableOpacity style={styles.profileShortcut} onPress={() => router.push('/progress' as never)}>
            <AnimatedMaterialIcon name="monitor-weight" size={18} color={colors.accentCyan} motion="float" />
            <Text style={styles.profileShortcutText} i18nKey="profile.shortcut.body" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileShortcut} onPress={() => router.push('/insights' as never)}>
            <AnimatedMaterialIcon name="insights" size={18} color={colors.accentCyan} motion="pulse" />
            <Text style={styles.profileShortcutText} i18nKey="profile.shortcut.insights" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileShortcut} onPress={() => router.push('/achievements' as never)}>
            <AnimatedMaterialIcon name="emoji-events" size={18} color={colors.accentAmber} motion="float" />
            <Text style={styles.profileShortcutText} i18nKey="profile.shortcut.achievements" />
          </TouchableOpacity>
        </View>

        <SurfaceCard style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>{t('profile.language.title')}</Text>
            <View style={styles.settingsChips}>
              <UiChip label={t('locale.vi')} selected={locale === 'vi'} onPress={() => void setLocale('vi')} style={styles.settingsChip} />
              <UiChip label={t('locale.en')} selected={locale === 'en'} onPress={() => void setLocale('en')} style={styles.settingsChip} />
            </View>
          </View>
          <View style={styles.settingsDivider} />
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>{t('profile.appearance.title')}</Text>
            <View style={styles.settingsChips}>
              <UiChip label={t('profile.appearance.light')} selected={requestedMode === 'light'} onPress={() => void setThemeMode('light')} style={styles.settingsChip} />
              <UiChip label={t('profile.appearance.dark')} selected={requestedMode === 'dark'} onPress={() => void setThemeMode('dark')} style={styles.settingsChip} />
              <UiChip label={t('profile.appearance.system')} selected={requestedMode === 'system'} onPress={() => void setThemeMode('system')} style={styles.settingsChip} />
            </View>
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.setupCard}>
          <View style={styles.setupHeader}>
            <View>
              <Text style={styles.setupEyebrow} i18nKey="profile.setup.eyebrow" />
              <Text style={styles.setupTitle} i18nKey="profile.setup.title" values={{ completed: completedSetupCount, total: setupSteps.length }} />
            </View>
            <View style={styles.setupPercentPill}>
              <Text style={styles.setupPercentText}>{setupProgressPct}%</Text>
            </View>
          </View>
          <View style={styles.setupProgressTrack}>
            <View style={[styles.setupProgressFill, { width: `${setupProgressPct}%` as any }]} />
          </View>
          <View style={styles.setupStepGrid}>
            {setupSteps.map((step) => (
              <TouchableOpacity key={step.key} style={[styles.setupStep, step.done && styles.setupStepDone]} onPress={() => openSetupStep(step.key)}>
                <View style={[styles.setupStepIcon, step.done && styles.setupStepIconDone]}>
                  <MaterialIcons name={step.done ? 'check' : step.icon as any} size={16} color={step.done ? colors.textOnAccent : colors.accentCyan} />
                </View>
                <View style={styles.setupStepCopy}>
                  <Text style={styles.setupStepLabel}>{step.label}</Text>
                  <Text style={styles.setupStepDetail} numberOfLines={1}>{step.detail}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.setupActionRow}>
            <UiButton
              label={isSaving ? 'profile.setup.saving' : 'profile.setup.save'}
              onPress={handleSaveProfile}
              loading={isSaving}
              style={[styles.profileSaveButton, isDesktop && styles.setupSaveButtonDesktop]}
            />
          </View>
        </SurfaceCard>

        <View ref={basicRef}>
          <SurfaceCard style={[styles.sectionCard, basicCollapsed && styles.sectionCardCompact]}>
          <Animated.View style={[styles.highlightOverlay, styles.pointerEventsNone, { opacity: highlightAnim }]} />
          <TouchableOpacity onPress={() => setBasicCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle} i18nKey="screen.tabs.profile.text.003" />
              {basicCollapsed && (
                <Text style={styles.sectionSubtitle}>
                  {profile.weight_kg
                    ? t('profile.basic.collapsed', { weight: profile.weight_kg, height: profile.height_cm ?? '--', age: profile.age ?? '--' })
                    : t('profile.basic.unset')}
                </Text>
              )}
            </View>
            <MaterialIcons name={basicCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
          </TouchableOpacity>

          {!basicCollapsed && (
            <>
              <View style={[styles.metricsGrid, isDesktop && styles.metricsGridDesktop]}>
                <Field label="screen.tabs.profile.label.001" value={profile.full_name ?? ''} onChangeText={(v) => setProfile((p) => ({ ...p, full_name: v }))} placeholder="screen.tabs.profile.placeholder.001" fullWidth />
                <Field label="screen.tabs.profile.label.002" value={String(profile.weight_kg ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, weight_kg: Number(v) || undefined }))} keyboardType="numeric" placeholder="65" />
                <Field label="screen.tabs.profile.label.003" value={String(profile.height_cm ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, height_cm: Number(v) || undefined }))} keyboardType="numeric" placeholder="170" />
                <Field label="screen.tabs.profile.label.004" value={String(profile.age ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, age: Number(v) || undefined }))} keyboardType="numeric" placeholder="25" />
              </View>

              <Text style={styles.label} i18nKey="screen.tabs.profile.text.004" />
              <View style={styles.chipRow}>
                {(['male', 'female'] as const).map((g) => (
                  <UiChip key={g} label={g === 'male' ? t('profile.gender.male') : t('profile.gender.female')} selected={profile.gender === g} onPress={() => setProfile((p) => ({ ...p, gender: g }))} />
                ))}
              </View>

              <Text style={styles.label} i18nKey="screen.tabs.profile.text.005" />
              <Text style={styles.helperText} i18nKey="profile.health.helper" />
              <View style={styles.chipRow}>
                {HEALTH_FLAGS.map((flag) => (
                  <UiChip
                    key={flag}
                    label={tx(HEALTH_FLAG_LABELS[flag])}
                    selected={selectedHealthFlags.includes(flag)}
                    onPress={() => toggleHealthFlag(flag)}
                    style={styles.healthChip}
                  />
                ))}
              </View>
            </>
          )}
          </SurfaceCard>
        </View>

        <View ref={assessmentRef}>
          <SurfaceCard style={[styles.sectionCard, assessmentCollapsed && styles.sectionCardCompact]}>
          <TouchableOpacity onPress={() => setAssessmentCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle} i18nKey="screen.tabs.profile.text.006" />
              {assessmentCollapsed && (
                <Text style={styles.sectionSubtitle}>
                  {instantAssessment.assessment
                    ? `BMI ${instantAssessment.assessment.bmi} · ${tx(BODY_STATUS_LABELS[instantAssessment.assessment.body_status])}`
                    : t('profile.assessment.collapsedMissing')}
                </Text>
              )}
            </View>
            <MaterialIcons name={assessmentCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
          </TouchableOpacity>

          {!assessmentCollapsed && (
            <>
              <Text style={styles.helperText} i18nKey="profile.assessment.helper" />

              {!!instantAssessment.assessment && (
                <View
                  style={[
                    styles.assessmentCard,
                    { backgroundColor: assessmentTone?.bg, borderColor: assessmentTone?.border },
                  ]}
                >
                  <View style={styles.assessmentTopRow}>
                    <View>
                      <Text style={[styles.assessmentBmiLabel, { color: assessmentTone?.accent }]} i18nKey="screen.tabs.profile.text.007" />
                      <Text style={[styles.assessmentBmiValue, { color: assessmentTone?.text }]}>{instantAssessment.assessment.bmi}</Text>
                    </View>
                    <View style={styles.assessmentMeta}>
                      <Text style={styles.assessmentMetaLabel} i18nKey="screen.tabs.profile.text.008" />
                      <Text style={[styles.assessmentMetaValue, { color: assessmentTone?.accent }]}> 
                        {tx(BODY_STATUS_LABELS[instantAssessment.assessment.body_status])}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.assessmentGuidesRow}>
                    <View style={[styles.assessmentBadge, { backgroundColor: assessmentTone?.badgeBg, borderColor: assessmentTone?.border }]}>
                      <Text style={[styles.assessmentBadgeText, { color: assessmentTone?.text }]}> 
                        {tx(WEIGHT_RECOMMENDATION_LABELS[instantAssessment.assessment.weight_recommendation])}
                      </Text>
                    </View>
                    <View style={[styles.assessmentBadge, { backgroundColor: assessmentTone?.badgeBg, borderColor: assessmentTone?.border }]}>
                      <Text style={[styles.assessmentBadgeText, { color: assessmentTone?.text }]}> 
                        {t('profile.assessment.recommendedGoal', { goal: tx(GOAL_LABELS[instantAssessment.assessment.recommended_goal]) })}
                      </Text>
                    </View>
                    <View style={[styles.assessmentBadge, { backgroundColor: assessmentTone?.badgeBg, borderColor: assessmentTone?.border }]}>
                      <Text style={[styles.assessmentBadgeText, { color: assessmentTone?.text }]}> 
                        {t('profile.assessment.recommendedActivity', { activity: tx(ACTIVITY_RECOMMENDATION_LABELS[instantAssessment.assessment.recommended_activity_level]) })}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.assessmentNote, { color: assessmentTone?.text }]}> 
                    {tx(instantAssessment.assessment.recommendation_note)}
                  </Text>

                  <View style={styles.safetyNotice}>
                    {instantAssessment.assessment.medical_review_recommended && (
                      <Text style={styles.safetyNoticeText}>
                        {t('profile.assessment.medicalReview')}
                      </Text>
                    )}
                    {instantAssessment.assessment.safety_warnings.map((warning, index) => (
                      <Text key={`safety-${index}`} style={styles.safetyNoticeText}>
                        {tx(warning)}
                      </Text>
                    ))}
                  </View>

                  <Text style={[styles.assessmentWeightPlan, { color: assessmentTone?.text }]}> 
                    {instantAssessment.assessment.weight_recommendation === 'maintain'
                      ? t('profile.assessment.weightPlanMaintain', { target: instantAssessment.assessment.target_weight_kg })
                      : t('profile.assessment.weightPlanChange', {
                          direction: instantAssessment.assessment.weight_recommendation === 'increase'
                            ? t('profile.assessment.direction.increase')
                            : t('profile.assessment.direction.decrease'),
                          delta: instantAssessment.assessment.weight_delta_kg,
                          target: instantAssessment.assessment.target_weight_kg,
                        })}
                  </Text>

                  <Text style={[styles.assessmentActivityNote, { color: assessmentTone?.text }]}> 
                    {tx(instantAssessment.assessment.activity_note)}
                  </Text>

                  <View style={styles.exerciseListWrap}>
                    <Text style={[styles.exerciseListTitle, { color: assessmentTone?.accent }]} i18nKey="screen.tabs.profile.text.009" />
                    {instantAssessment.assessment.exercise_plan.map((item, index) => (
                      <Text key={`exercise-${index}`} style={[styles.exerciseListItem, { color: assessmentTone?.text }]}> 
                        {index + 1}. {tx(item)}
                      </Text>
                    ))}
                  </View>

                  <Text style={styles.assessmentHint}>{assessmentHintText}</Text>
                </View>
              )}

              {!instantAssessment.assessment && !!instantAssessment.hint && (
                <Text style={styles.assessmentHint}>{assessmentHintText}</Text>
              )}
            </>
          )}
          </SurfaceCard>
        </View>

        <View style={[styles.summaryRow, isDesktop && styles.summaryRowDesktop]}>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{profile.daily_calorie_target ?? '--'}</Text>
            <Text style={styles.summaryLabel} i18nKey="screen.tabs.profile.text.010" />
          </SurfaceCard>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{profile.goal ? tx(GOAL_LABELS[profile.goal]) : '--'}</Text>
            <Text style={styles.summaryLabel} i18nKey="screen.tabs.profile.text.011" />
          </SurfaceCard>
          <SurfaceCard style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{profile.activity_level ? tx(ACTIVITY_LABELS[profile.activity_level]) : '--'}</Text>
            <Text style={styles.summaryLabel} i18nKey="screen.tabs.profile.text.012" />
          </SurfaceCard>
        </View>

      <View ref={goalRef}>
        <SurfaceCard style={[styles.sectionCard, goalCollapsed && styles.sectionCardCompact]}>
        <TouchableOpacity onPress={() => setGoalCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle} i18nKey="screen.tabs.profile.text.013" />
            {goalCollapsed && (
              <Text style={styles.sectionSubtitle}>{profile.goal ? tx(GOAL_LABELS[profile.goal]) : t('profile.setup.goalMissing')} · {profile.activity_level ? tx(ACTIVITY_LABELS[profile.activity_level]) : '...'}</Text>
            )}
          </View>
          <MaterialIcons name={goalCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
        </TouchableOpacity>

        {!goalCollapsed && (
          <>
            <Text style={styles.helperText} i18nKey="screen.tabs.profile.text.014" />

            <Text style={styles.label} i18nKey="screen.tabs.profile.text.015" />
            <View style={styles.chipRow}>
              {(Object.keys(GOAL_LABELS) as UserGoal[]).map((g) => (
                <UiChip key={g} label={tx(GOAL_LABELS[g])} selected={profile.goal === g} onPress={() => setProfile((p) => ({ ...p, goal: g }))} />
              ))}
            </View>

            <Text style={styles.label} i18nKey="screen.tabs.profile.text.016" />
            <View style={styles.chipRow}>
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
                <UiChip key={a} label={tx(ACTIVITY_LABELS[a])} selected={profile.activity_level === a} onPress={() => setProfile((p) => ({ ...p, activity_level: a }))} style={styles.activityChip} />
              ))}
            </View>

            <View style={[styles.goalPlanningGrid, isDesktop && styles.goalPlanningGridDesktop]}>
              <View style={styles.goalPlanPanel}>
                <Text style={styles.label} i18nKey="screen.tabs.profile.text.017" />
                <View style={styles.goalPlanRow}>
                  <UiInput label="screen.tabs.profile.label.005" value={String(goalPlanTargetKg ?? '')} onChangeText={(v) => setGoalPlanTargetKg(Number(v) || undefined)} keyboardType="numeric" style={{ flex: 1 }} />
                  <UiInput label="screen.tabs.profile.label.006" value={String(goalPlanDurationWeeks ?? '')} onChangeText={(v) => setGoalPlanDurationWeeks(Number(v) || undefined)} keyboardType="numeric" style={{ width: 140 }} />
                </View>
                <View style={styles.chipRow}>
                  <UiChip label="screen.tabs.profile.label.007" selected={goalPlanDirection === 'loss'} onPress={() => setGoalPlanDirection('loss')} />
                  <UiChip label="screen.tabs.profile.label.008" selected={goalPlanDirection === 'maintain'} onPress={() => setGoalPlanDirection('maintain')} />
                  <UiChip label="screen.tabs.profile.label.009" selected={goalPlanDirection === 'gain'} onPress={() => setGoalPlanDirection('gain')} />
                </View>
                <Text style={styles.helperText} i18nKey="screen.tabs.profile.text.018" />
                {activeGoalPlan?.computed_daily_calorie_target && (
                  <View style={styles.goalPlanStatusBox}>
                    <Text style={styles.goalPlanStatusTitle}>
                      {t('profile.goalPlan.statusTitle', { target: activeGoalPlan.computed_daily_calorie_target })}
                    </Text>
                    <Text style={styles.goalPlanStatusText}>
                      {t('profile.goalPlan.statusText', { rate: activeGoalPlan.weekly_rate_kg ?? 0, status: activeGoalPlan.safety_status ?? 'ok' })}
                    </Text>
                    {activeGoalPlan.warnings?.map((warning, index) => (
                      <Text key={`goal-plan-warning-${index}`} style={styles.goalPlanWarningText}>{warning}</Text>
                    ))}
                  </View>
                )}
                {activeGoalPlan && (
                  <UiButton label="screen.tabs.profile.label.010" variant="ghost" onPress={clearGoalPlan} style={styles.clearGoalPlanButton} />
                )}
              </View>

              <View ref={roadmapRef} style={styles.roadmapPanel}>
                <View style={styles.roadmapHeader}>
                  <View style={styles.roadmapPanelTitleRow}>
                    <Text style={styles.label} i18nKey="screen.tabs.profile.text.019" />
                    <TouchableOpacity style={styles.roadmapAddBtn} onPress={openAddRoadmapExercise}>
                      <MaterialIcons name="add" size={15} color={colors.textOnAccent} />
                      <Text style={styles.roadmapAddBtnText} i18nKey="screen.tabs.profile.text.020" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.roadmapSummary}>
                    {roadmap.length > 0
                      ? t('profile.roadmap.summary', { done: completedRoadmapCount, total: roadmap.length, kcal: completedRoadmapKcal })
                      : t('profile.roadmap.emptySummary')}
                  </Text>
                </View>
                <Text style={styles.helperText} i18nKey="screen.tabs.profile.text.021" />

                {roadmap.length === 0 ? (
                  <View style={styles.roadmapEmptyBox}>
                    <Text style={styles.roadmapEmptyText} i18nKey="screen.tabs.profile.text.022" />
                  </View>
                ) : (
                  <View style={styles.roadmapWrap}>
                    {roadmap.map((item) => {
                      const completed = completedRoadmapTaskIds.has(item.id);
                      return (
                        <View
                          key={item.id}
                          style={[styles.roadmapItem, completed && styles.roadmapItemCompleted]}
                        >
                          <View style={styles.roadmapItemLeft}>
                            <View style={[styles.checkbox, completed && styles.checkboxCompleted]}>
                              {completed && <Text style={styles.checkboxTick}>✓</Text>}
                            </View>
                            <View style={styles.roadmapItemBody}>
                              <Text style={styles.roadmapItemTitle}>{tx(item.title)}</Text>
                              <Text style={styles.roadmapItemDetail}>{tx(item.detail)}</Text>
                              <Text style={styles.roadmapItemMeta}>
                                {t('profile.roadmap.meta', {
                                  minutes: item.duration_min,
                                  kcal: item.estimated_kcal,
                                  activity: tx(EXERCISE_ACTIVITY_LABELS[item.activity_type] ?? item.activity_type),
                                })}
                              </Text>
                              <Text style={styles.roadmapCta}>{completed ? t('profile.roadmap.loggedToday') : t('profile.roadmap.cta')}</Text>
                              <View style={styles.roadmapActionsRow}>
                                <TouchableOpacity
                                  style={styles.roadmapActionBtn}
                                  onPress={() => openEditRoadmapExercise(item)}
                                >
                                  <MaterialIcons name="edit" size={13} color={colors.accentCyan} />
                                  <Text style={styles.roadmapActionText} i18nKey="screen.tabs.profile.text.023" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.roadmapActionBtn, styles.roadmapDeleteBtn]}
                                  onPress={() => handleRemoveRoadmapTask(item)}
                                >
                                  <MaterialIcons name="delete-outline" size={13} color={colors.danger} />
                                  <Text style={styles.roadmapDeleteText} i18nKey="screen.tabs.profile.text.024" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          </>
        )}
        </SurfaceCard>
      </View>

      <SurfaceCard style={[styles.sectionCard, calorieCollapsed && styles.sectionCardCompact]}>
        <TouchableOpacity onPress={() => setCalorieCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle} i18nKey="screen.tabs.profile.text.025" />
            {calorieCollapsed && (
              <Text style={styles.sectionSubtitle}>{profile.daily_calorie_target ? t('profile.calorie.collapsed', { target: profile.daily_calorie_target }) : t('profile.basic.unset')}</Text>
            )}
          </View>
          <MaterialIcons name={calorieCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
        </TouchableOpacity>

        {!calorieCollapsed && (
          <>
            <Text style={styles.helperText} i18nKey="screen.tabs.profile.text.026" />
            <Field label="screen.tabs.profile.label.011" value={String(profile.daily_calorie_target ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, daily_calorie_target: Number(v) || undefined }))} keyboardType="numeric" placeholder="1800" fullWidth />
            <View style={[styles.mealTargetRow, isDesktop && styles.mealTargetRowDesktop]}>
              <MealTargetField label="screen.tabs.profile.label.012" value={String(profile.target_breakfast_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_breakfast_cal: Number(v) || undefined }))} />
              <MealTargetField label="screen.tabs.profile.label.013" value={String(profile.target_lunch_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_lunch_cal: Number(v) || undefined }))} />
              <MealTargetField label="screen.tabs.profile.label.014" value={String(profile.target_dinner_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_dinner_cal: Number(v) || undefined }))} />
              <MealTargetField label="screen.tabs.profile.label.015" value={String(profile.target_snack_cal ?? '')} onChangeText={(v) => setProfile((p) => ({ ...p, target_snack_cal: Number(v) || undefined }))} />
            </View>
            <MacrosCard daily_calorie_target={profile.daily_calorie_target} weight_kg={profile.weight_kg} goal={profile.goal} />
          </>
        )}
      </SurfaceCard>

      <View ref={notificationsRef}>
        <SurfaceCard style={[styles.sectionCard, notificationsCollapsed && styles.sectionCardCompact]}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity onPress={() => setNotificationsCollapsed((s) => !s)} activeOpacity={0.8} style={{ flex: 1 }}>
            <View>
              <Text style={styles.sectionTitle} i18nKey="screen.tabs.profile.text.027" />
              {notificationsCollapsed && (
              <Text style={styles.sectionSubtitle}>{(reminders.allow_push_notifications ?? true) ? t('profile.notification.on') : t('profile.notification.off')}</Text>
              )}
            </View>
          </TouchableOpacity>

          <Switch
            value={reminders.allow_push_notifications ?? true}
            onValueChange={(v) => setReminders((r) => ({ ...r, allow_push_notifications: v }))}
            trackColor={{ false: colors.border, true: colors.success }}
            thumbColor={(reminders.allow_push_notifications ?? true) ? colors.accentMint : colors.textMuted}
          />

          <TouchableOpacity onPress={() => setNotificationsCollapsed((s) => !s)} style={{ paddingLeft: 8 }}>
            <MaterialIcons name={notificationsCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {!notificationsCollapsed && (
          <>
            <Text style={styles.helperText} i18nKey="screen.tabs.profile.text.028" />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel} i18nKey="screen.tabs.profile.text.029" />
              <Switch
                value={reminders.allow_push_notifications ?? true}
                onValueChange={(v) => setReminders((r) => ({ ...r, allow_push_notifications: v }))}
                trackColor={{ false: colors.border, true: colors.success }}
                thumbColor={reminders.allow_push_notifications ? colors.accentMint : colors.textMuted}
              />
            </View>

            <Text style={styles.label} i18nKey="screen.tabs.profile.text.030" />
            <View style={styles.chipRow}>
              {(['encouraging', 'neutral', 'warning'] as const).map((style) => (
                <UiChip
                  key={style}
                  label={style === 'encouraging'
                    ? t('profile.reminderStyle.encouraging')
                    : style === 'neutral'
                      ? t('profile.reminderStyle.neutral')
                      : t('profile.reminderStyle.warning')}
                  selected={reminders.nudge_motivation_style === style}
                  onPress={() => setReminders((r) => ({ ...r, nudge_motivation_style: style }))}
                />
              ))}
            </View>

            <ReminderTimePickerRow
              meal="breakfast"
              mealLabel={t('screen.tabs.profile.label.012')}
              enabled={reminders.breakfast_reminder_enabled ?? true}
              time={reminders.breakfast_reminder_time ?? '07:00'}
              onEnabledChange={(v) => setReminders((r) => ({ ...r, breakfast_reminder_enabled: v }))}
              onTimeChange={(v) => setReminders((r) => ({ ...r, breakfast_reminder_time: v }))}
            />

            <ReminderTimePickerRow
              meal="lunch"
              mealLabel={t('screen.tabs.profile.label.013')}
              enabled={reminders.lunch_reminder_enabled ?? true}
              time={reminders.lunch_reminder_time ?? '12:00'}
              onEnabledChange={(v) => setReminders((r) => ({ ...r, lunch_reminder_enabled: v }))}
              onTimeChange={(v) => setReminders((r) => ({ ...r, lunch_reminder_time: v }))}
            />

            <ReminderTimePickerRow
              meal="dinner"
              mealLabel={t('screen.tabs.profile.label.014')}
              enabled={reminders.dinner_reminder_enabled ?? true}
              time={reminders.dinner_reminder_time ?? '19:00'}
              onEnabledChange={(v) => setReminders((r) => ({ ...r, dinner_reminder_enabled: v }))}
              onTimeChange={(v) => setReminders((r) => ({ ...r, dinner_reminder_time: v }))}
            />

            <ReminderTimePickerRow
              meal="snack"
              mealLabel={t('screen.tabs.profile.label.015')}
              enabled={reminders.snack_reminder_enabled ?? false}
              time={reminders.snack_reminder_time ?? '15:00'}
              onEnabledChange={(v) => setReminders((r) => ({ ...r, snack_reminder_enabled: v }))}
              onTimeChange={(v) => setReminders((r) => ({ ...r, snack_reminder_time: v }))}
            />

            {reminderEffectiveness ? (
              <SurfaceCard style={styles.reminderEffectivenessCard}>
                <View style={styles.reminderEffectivenessHeader}>
                  <View style={styles.reminderEffectivenessCopy}>
                    <Text style={styles.label} i18nKey="profile.reminderEffectiveness.title" />
                    <Text style={styles.helperText}>{reminderEffectiveness.recommendation}</Text>
                  </View>
                  <View style={styles.reminderEffectivenessBadge}>
                    <Text style={styles.reminderEffectivenessScore}>{reminderEffectiveness.effectiveness_score}</Text>
                    <Text style={styles.reminderEffectivenessUnit}>/100</Text>
                  </View>
                </View>
                <View style={styles.reminderEffectivenessGrid}>
                  <View style={styles.reminderEffectivenessMetric}>
                    <Text style={styles.reminderEffectivenessMetricValue}>{reminderEffectiveness.open_rate}%</Text>
                    <Text style={styles.reminderEffectivenessMetricLabel} i18nKey="profile.reminderEffectiveness.openRate" />
                  </View>
                  <View style={styles.reminderEffectivenessMetric}>
                    <Text style={styles.reminderEffectivenessMetricValue}>{reminderEffectiveness.action_rate}%</Text>
                    <Text style={styles.reminderEffectivenessMetricLabel} i18nKey="profile.reminderEffectiveness.actionRate" />
                  </View>
                  <View style={styles.reminderEffectivenessMetric}>
                    <Text style={styles.reminderEffectivenessMetricValue}>{reminderEffectiveness.ignore_rate}%</Text>
                    <Text style={styles.reminderEffectivenessMetricLabel} i18nKey="profile.reminderEffectiveness.ignoreRate" />
                  </View>
                </View>
                <View style={styles.reminderEffectivenessPills}>
                  {reminderEffectiveness.best_meal ? (
                    <Text style={styles.reminderEffectivenessPill}>
                      {t('profile.reminderEffectiveness.bestMeal', { meal: reminderEffectiveness.best_meal })}
                    </Text>
                  ) : null}
                  {reminderEffectiveness.weakest_meal ? (
                    <Text style={styles.reminderEffectivenessPill}>
                      {t('profile.reminderEffectiveness.weakestMeal', { meal: reminderEffectiveness.weakest_meal })}
                    </Text>
                  ) : null}
                </View>
                {reminderEffectiveness.patterns.length > 0 ? (
                  <View style={styles.reminderEffectivenessPatterns}>
                    {reminderEffectiveness.patterns.slice(0, 2).map((pattern) => (
                      <Text key={pattern} style={styles.reminderEffectivenessPattern}>• {pattern}</Text>
                    ))}
                  </View>
                ) : null}
              </SurfaceCard>
            ) : null}

            <View style={styles.previewSection}>
              <Text style={styles.label} i18nKey="screen.tabs.profile.text.031" />
              <View style={styles.chipRow}>
                {([
                  ['breakfast', t('screen.tabs.profile.label.012')],
                  ['lunch', t('screen.tabs.profile.label.013')],
                  ['dinner', t('screen.tabs.profile.label.014')],
                  ['snack', t('screen.tabs.profile.label.015')],
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
                {isPreviewLoading && <ActivityIndicator color={colors.accentMint} />}
                {!isPreviewLoading && previewNudge && (
                  <>
                    <Text style={styles.previewTitle}>{previewNudge.emoji} {previewNudge.title}</Text>
                    <Text style={styles.previewBody}>{previewNudge.body}</Text>
                    {!!previewNudge.streakContext && (
                      <Text style={styles.previewMeta}>
                        {t('profile.preview.streakMeta', {
                          current: previewNudge.streakContext.currentStreak,
                          best: previewNudge.streakContext.longestStreak,
                        })}
                      </Text>
                    )}
                  </>
                )}
              </SurfaceCard>
            </View>
          </>
        )}
        </SurfaceCard>
      </View>

      <View ref={subscriptionRef}>
      <SurfaceCard style={[styles.sectionCard, subscriptionCollapsed && styles.sectionCardCompact]}>
        <TouchableOpacity onPress={() => setSubscriptionCollapsed((s) => !s)} activeOpacity={0.8} style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle} i18nKey="screen.tabs.profile.text.032" />
            {subscriptionCollapsed && (
              <Text style={styles.sectionSubtitle}>
                {subscription?.tier === 'premium' ? 'Premium' : subscription?.tier === 'pro' ? 'Pro' : t('profile.subscription.free')}
                {' · '}
                {subscription?.is_active ? t('profile.subscription.active') : t('profile.subscription.expired')}
              </Text>
            )}
          </View>
          <MaterialIcons name={subscriptionCollapsed ? 'expand-more' : 'expand-less'} size={26} color={colors.textMuted} />
        </TouchableOpacity>

        {!subscriptionCollapsed && (
          <View style={styles.subscriptionCard}>
            <View style={styles.subscriptionHeader}>
              <View>
                <Text style={styles.subscriptionTier}>{subscription?.tier === 'premium' ? 'Premium' : subscription?.tier === 'pro' ? 'Pro' : t('profile.subscription.free')}</Text>
                <Text style={styles.subscriptionStatus}>
                  {subscription?.is_active ? t('profile.subscription.active') : t('profile.subscription.expired')}
                </Text>
              </View>
              <MaterialIcons
                name={subscription?.tier === 'pro' ? 'star' : subscription?.tier === 'premium' ? 'favorite' : 'favorite-border'}
                size={32}
                color={subscription?.tier === 'pro' ? colors.warning : subscription?.tier === 'premium' ? colors.accentCoral : colors.textDisabled}
              />
            </View>

            <Text style={styles.subscriptionHelper} i18nKey="profile.subscription.helper" />

            <View style={[styles.planSelectorRow, isDesktop && styles.planSelectorRowDesktop]}>
              {(Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[]).map((tier) => {
                const tierInfo = SUBSCRIPTION_TIERS[tier];
                const isCurrentTier = subscription?.tier === tier;
                const accent = tier === 'pro' ? colors.warning : tier === 'premium' ? colors.accentCoral : colors.accentMint;

                return (
                  <TouchableOpacity
                    key={tier}
                    style={[
                      styles.planOption,
                      isCurrentTier && styles.planOptionActive,
                      isCurrentTier && { borderColor: accent, backgroundColor: colors.surfaceInfo },
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
                      {tier === 'free' ? t('profile.subscription.free') : t('profile.subscription.priceMonthly', { price: tierInfo.price_usd_monthly })}
                    </Text>
                    <Text style={[styles.planOptionAction, isCurrentTier && { color: accent }]}>
                      {isCurrentTier ? t('profile.subscription.current') : t('profile.subscription.switch')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {features && (
              <View style={styles.featuresPreview}>
                <Text style={styles.featuresLabel} i18nKey="screen.tabs.profile.text.033" />
                <View style={styles.featureGrid}>
                  {[
                    { name: 'ai_coach', label: 'AI Coach' },
                    { name: 'meal_reminders', label: t('profile.feature.reminders') },
                    { name: 'weekly_reports', label: t('profile.feature.reports') },
                    { name: 'healthkit_sync', label: 'HealthKit' },
                  ].map(({ name, label }) => (
                    <View key={name} style={styles.featureCheckItem}>
                      <MaterialIcons
                        name={features[name as keyof typeof features] ? 'check-circle' : 'cancel'}
                        size={18}
                        color={features[name as keyof typeof features] ? colors.success : colors.textDisabled}
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
        )}
      </SurfaceCard>
      </View>

        <SurfaceCard style={styles.accountCard}>
          <View style={styles.accountCopy}>
            <Text style={styles.accountTitle} i18nKey="profile.account.title" />
            <Text style={styles.accountHint} i18nKey="profile.account.hint" />
          </View>
          <TouchableOpacity style={styles.profileLogoutButton} onPress={handleLogout}>
            <MaterialIcons name="logout" size={16} color={colors.danger} />
            <Text style={styles.profileLogoutText} i18nKey="profile.logout" />
          </TouchableOpacity>
        </SurfaceCard>

      </View>
      <RewardToast reward={reward} onHide={() => setReward(null)} />
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
  const { colors } = useAppTheme();
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
          trackColor={{ false: colors.border, true: colors.success }}
          thumbColor={enabled ? colors.accentMint : colors.textMuted}
        />
      </View>

      {enabled && (
        <View style={styles.reminderTimeInputs}>
          <View style={styles.timeInputGroup}>
            <Text style={styles.timeInputLabel} i18nKey="screen.tabs.profile.text.034" />
            <UiInput
              value={String(hours).padStart(2, '0')}
              onChangeText={(v) => {
                const h = Math.max(0, Math.min(23, parseInt(v) || 0));
                handleTimeSelect(h, minutes);
              }}
              keyboardType="number-pad"
              placeholder="screen.tabs.profile.placeholder.hour"
              maxLength={2}
              containerStyle={{ marginBottom: 0 }}
              style={styles.timeInput}
            />
          </View>

          <Text style={styles.timeSeparator}>:</Text>

          <View style={styles.timeInputGroup}>
            <Text style={styles.timeInputLabel} i18nKey="screen.tabs.profile.text.035" />
            <UiInput
              value={String(minutes).padStart(2, '0')}
              onChangeText={(v) => {
                const m = Math.max(0, Math.min(59, parseInt(v) || 0));
                handleTimeSelect(hours, m);
              }}
              keyboardType="number-pad"
              placeholder="screen.tabs.profile.placeholder.minute"
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

const styles = createThemedStyles((colors, radii) => ({
  heroBody: { marginBottom: 18, maxWidth: 720 },
  profileShortcutRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  profileShortcut: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  profileShortcutText: { color: colors.textSoft, fontSize: 12, fontWeight: '800' },
  settingsCard: {
    marginBottom: 14,
    paddingVertical: 12,
    gap: 10,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  settingsLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 96,
  },
  settingsChips: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  settingsChip: {
    marginVertical: 0,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  setupActionRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSuccess,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  setupSaveButtonDesktop: {
    maxWidth: 220,
  },
  profileSaveButton: {
    flex: 1,
  },
  accountCard: {
    marginTop: 2,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.surfaceAlt,
  },
  accountCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  accountHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  profileLogoutButton: {
    minHeight: 40,
    minWidth: 128,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDanger,
    backgroundColor: colors.surfaceDanger,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  profileLogoutText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  setupCard: {
    marginBottom: 14,
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  setupEyebrow: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  setupTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  setupPercentPill: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupPercentText: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontWeight: '900',
  },
  setupProgressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.progressBg,
    marginBottom: 12,
  },
  setupProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accentMint,
  },
  setupStepGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  setupStep: {
    flex: 1,
    minWidth: 156,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setupStepDone: {
    borderColor: colors.accentMint,
    backgroundColor: colors.surfaceSuccess,
  },
  setupStepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceInfo,
    borderWidth: 1,
    borderColor: colors.borderInfo,
  },
  setupStepIconDone: {
    backgroundColor: colors.accentMint,
    borderColor: colors.accentMint,
  },
  setupStepCopy: {
    flex: 1,
    minWidth: 0,
  },
  setupStepLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  setupStepDetail: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  summaryRow: { gap: 12, marginBottom: 14 },
  summaryRowDesktop: { flexDirection: 'row' },
  summaryCard: { flex: 1, minHeight: 106, justifyContent: 'center' },
  summaryValue: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  summaryLabel: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  assessmentCard: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  assessmentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assessmentBmiLabel: { color: colors.info, fontSize: 12, fontWeight: '600' },
  assessmentBmiValue: { color: colors.text, fontSize: 28, fontWeight: '800' },
  assessmentMeta: { alignItems: 'flex-end' },
  assessmentMetaLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  assessmentMetaValue: { color: colors.textSoft, fontSize: 16, fontWeight: '700' },
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
  assessmentNote: { color: colors.textSoft, fontSize: 13, lineHeight: 19 },
  safetyNotice: { borderWidth: 1, borderColor: colors.borderWarning, backgroundColor: colors.surfaceWarning, borderRadius: 8, padding: 8, gap: 4 },
  safetyNoticeText: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  assessmentWeightPlan: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  assessmentActivityNote: { fontSize: 13, lineHeight: 19 },
  exerciseListWrap: { marginTop: 4, gap: 4 },
  exerciseListTitle: { fontSize: 13, fontWeight: '800' },
  exerciseListItem: { fontSize: 13, lineHeight: 18 },
  roadmapWrap: { marginTop: 10, gap: 8 },
  roadmapHeader: { gap: 4 },
  roadmapPanelTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  roadmapTitle: { color: colors.textSoft, fontSize: 13, fontWeight: '800' },
  roadmapSummary: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  roadmapAddBtn: {
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: colors.accentMint,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roadmapAddBtnText: { color: colors.textOnAccent, fontSize: 12, fontWeight: '800' },
  roadmapItem: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  roadmapItemCompleted: {
    borderColor: colors.accentMint,
    backgroundColor: colors.surfaceSuccess,
  },
  roadmapItemLeft: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  roadmapItemBody: { flex: 1, minWidth: 0 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxCompleted: {
    borderColor: colors.accentMint,
    backgroundColor: colors.accentMint,
  },
  checkboxTick: { color: colors.surface, fontSize: 12, fontWeight: '900' },
  roadmapItemTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  roadmapItemDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  roadmapItemMeta: { color: colors.accentMint, fontSize: 12, fontWeight: '700', marginTop: 4 },
  roadmapCta: { color: colors.success, fontSize: 11, fontWeight: '700' },
  roadmapActionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  roadmapActionBtn: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roadmapActionText: { color: colors.accentCyan, fontSize: 11, fontWeight: '800' },
  roadmapDeleteBtn: {
    borderColor: colors.borderDanger,
    backgroundColor: colors.surfaceDanger,
  },
  roadmapDeleteText: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  roadmapEmptyBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    marginTop: 8,
  },
  roadmapEmptyText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  assessmentHint: { color: colors.info, fontSize: 13, lineHeight: 19, marginTop: 10 },
  sectionCard: { marginBottom: 14 },
  highlightOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 12, backgroundColor: colors.surfaceWarning },
  pointerEventsNone: { pointerEvents: 'none' },
  sectionCardCompact: { paddingVertical: 8, paddingHorizontal: 12 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.textSoft, marginBottom: 6 },
  helperText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  label: { color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: 12, fontWeight: '500' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricsGridDesktop: { gap: 14 },
  fieldContainer: { width: '48%' },
  fieldContainerFull: { width: '100%' },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 14,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  activityChip: { marginBottom: 8 },
  healthChip: { marginBottom: 6 },
  goalPlanningGrid: { gap: 12, marginTop: 8 },
  goalPlanningGridDesktop: { flexDirection: 'row', alignItems: 'stretch' },
  goalPlanPanel: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: 12,
  },
  roadmapPanel: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    padding: 12,
  },
  catalogOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  catalogSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  catalogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  catalogTitle: { color: colors.text, fontWeight: '800', fontSize: 18 },
  catalogHint: { color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 18 },
  catalogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catalogItemDisabled: {
    borderColor: colors.borderSuccess,
    backgroundColor: colors.surfaceSuccess,
    opacity: 0.72,
  },
  catalogItemName: { color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  catalogItemKcal: { color: colors.accentMint, fontSize: 12, fontWeight: '700' },
  catalogItemNameDisabled: { color: colors.success },
  catalogItemKcalDisabled: { color: colors.textMuted },
  catalogBack: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  catalogBackText: { color: colors.accentMint, fontSize: 13, fontWeight: '700' },
  catalogSelectedLabel: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  durationRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  durationBtn: {
    flex: 1,
    minWidth: 70,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  durationBtnActive: { borderColor: colors.accentMint, backgroundColor: colors.surfaceSuccess },
  durationBtnMin: { color: colors.text, fontWeight: '700', fontSize: 14 },
  durationBtnKcal: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  durationBtnTextActive: { color: colors.accentMint },
  catalogConfirmBtn: { backgroundColor: colors.accentMint, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  catalogConfirmText: { color: colors.textOnAccent, fontWeight: '800', fontSize: 14 },
  mealTargetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  goalPlanRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
    alignItems: 'center',
  },
  goalPlanStatusBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    padding: 12,
    marginTop: 10,
    gap: 5,
  },
  goalPlanStatusTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  goalPlanStatusText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  goalPlanWarningText: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  clearGoalPlanButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 0,
  },
  mealTargetRowDesktop: {
    gap: 14,
  },
  mealTargetField: {
    width: '48%',
  },
  mealTargetInput: { color: colors.success, fontWeight: '800', fontSize: 18, textAlign: 'center' },
  actionRow: { gap: 10, marginTop: 4, marginBottom: 10 },
  actionRowDesktop: { flexDirection: 'row', alignItems: 'stretch' },
  saveButton: { flex: 1 },
  logoutBtn: { minWidth: 160 },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingVertical: 10 },
  switchLabel: { color: colors.textSoft, fontSize: 14, fontWeight: '600' },

  reminderRow: { marginBottom: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  reminderLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reminderMealLabel: { color: colors.textSoft, fontSize: 14, fontWeight: '600' },
  reminderTimeInputs: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  reminderEffectivenessCard: { marginBottom: 14, borderColor: colors.borderInfo, backgroundColor: colors.surfaceInfo },
  reminderEffectivenessHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  reminderEffectivenessCopy: { flex: 1, minWidth: 0 },
  reminderEffectivenessBadge: {
    minWidth: 70,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surface,
    paddingHorizontal: 9,
    paddingVertical: 8,
    alignItems: 'center',
  },
  reminderEffectivenessScore: { color: colors.accentCyan, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  reminderEffectivenessUnit: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  reminderEffectivenessGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  reminderEffectivenessMetric: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 8,
  },
  reminderEffectivenessMetricValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  reminderEffectivenessMetricLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', marginTop: 2 },
  reminderEffectivenessPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  reminderEffectivenessPill: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: colors.borderInfo,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: colors.surface,
  },
  reminderEffectivenessPatterns: { gap: 4, marginTop: 10 },
  reminderEffectivenessPattern: { color: colors.textSoft, fontSize: 12, lineHeight: 17 },
  timeInputGroup: { flex: 1 },
  timeInputLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 4, fontWeight: '500' },
  timeInput: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.accentMint },
  timeSeparator: { color: colors.textSoft, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  previewSection: { marginTop: 12 },
  previewCard: { marginTop: 10, backgroundColor: colors.surface, borderColor: colors.border },
  previewTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  previewBody: { color: colors.textSoft, fontSize: 13, lineHeight: 20 },
  previewMeta: { color: colors.textMuted, fontSize: 12, marginTop: 10, fontWeight: '600' },
  subscriptionCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  subscriptionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  subscriptionTier: { fontSize: 18, fontWeight: '700', color: colors.textSoft, marginBottom: 2 },
  subscriptionStatus: { fontSize: 12, color: colors.textDisabled },
  subscriptionHelper: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  planSelectorRow: { gap: 10, marginBottom: 14 },
  planSelectorRowDesktop: { flexDirection: 'row' },
  planOption: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  planOptionActive: { borderWidth: 1.5 },
  planOptionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  planOptionName: { fontSize: 15, fontWeight: '800', color: colors.text },
  planOptionTag: { fontSize: 11, fontWeight: '800' },
  planOptionDescription: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  planOptionPrice: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  planOptionAction: { color: colors.accentMint, fontSize: 12, fontWeight: '700', marginTop: 4 },
  featuresPreview: { marginBottom: 14 },
  featuresLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '500', marginBottom: 8 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featureCheckItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: colors.surfaceAlt, borderRadius: 6 },
  featureCheckLabel: { fontSize: 12, color: colors.textSoft, fontWeight: '500' },
  featureCheckLabelDisabled: { color: colors.textDisabled },
}));


