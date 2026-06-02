import { apiClient } from './api';

export interface MealRecommendation {
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recommended_calories: number;
  suggested_foods: {
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }[];
  tips: string;
}

export interface WeeklyRecommendations {
  user_id: string;
  date: string;
  daily_target: number;
  remaining_calories: number;
  meals: MealRecommendation[];
  weekly_insights: {
    average_adherence: number;
    trend: 'improving' | 'stable' | 'declining';
    suggestion: string;
  };
}

export interface WeeklyAdaptiveResult {
  user_id: string;
  original_daily_target: number;
  adjusted_daily_target: number;
  adjustment_percentage: number;
  adherence_last_week: number;
  recommendation: string;
  last_updated: string;
  algorithm_version?: string;
  clamp_reason?: string | null;
  actual_tdee?: number | null;
  days_logged?: number;
  weight_logs?: number;
}

export interface NutritionTargets {
  fiber_g_min: number;
  sodium_mg_max: number;
  free_sugar_g_max: number;
  added_sugar_g_max: number;
  saturated_fat_g_max: number;
  free_sugar_pct_max: number;
  saturated_fat_pct_max: number;
  basis: string;
}

export interface CalorieTargetResponse {
  daily_calorie_target: number;
  bmr: number;
  tdee: number;
  bmi: number;
  body_status: string;
  weight_recommendation: string;
  recommended_goal: string;
  effective_goal?: string;
  recommendation_note: string;
  bmi_standard?: 'global_adult';
  bmi_interpretation?: 'screening_risk_not_diagnosis';
  target_breakfast_cal: number;
  target_lunch_cal: number;
  target_dinner_cal: number;
  target_snack_cal: number;
  calculation_date: string;
  protein_target_g?: number;
  protein_g_per_kg?: number;
  fat_pct?: number;
  fat_g?: number;
  carbs_g?: number;
  carbs_pct?: number;
  is_estimate?: boolean;
  safety_warnings?: string[];
  macro_warnings?: string[];
  health_flags?: string[];
  medical_review_recommended?: boolean;
  nutrition_targets?: NutritionTargets;
}

export type CalorieTargetRequiredField =
  | 'weight_kg'
  | 'height_cm'
  | 'age'
  | 'gender'
  | 'activity_level'
  | 'goal';

export interface CalorieTargetUnavailableResponse {
  status: 'incomplete_profile';
  target: null;
  missing_fields: CalorieTargetRequiredField[];
  message: string;
}

export type MyCalorieTargetResponse = CalorieTargetResponse | CalorieTargetUnavailableResponse;

export function isCalorieTargetReady(response: MyCalorieTargetResponse): response is CalorieTargetResponse {
  return 'daily_calorie_target' in response && typeof response.daily_calorie_target === 'number';
}

class CalorieTargetService {
  async getMyRecommendations(): Promise<WeeklyRecommendations> {
    const res = await apiClient.get<WeeklyRecommendations>('/calorie-target/recommendations/me');
    return res.data;
  }

  async applyWeeklyAdjustment(): Promise<WeeklyAdaptiveResult> {
    const res = await apiClient.post<WeeklyAdaptiveResult>('/calorie-target/weekly-adjustment');
    return res.data;
  }

  async getWeeklyAdjustmentPreview(): Promise<WeeklyAdaptiveResult> {
    const res = await apiClient.get<WeeklyAdaptiveResult>('/calorie-target/weekly-adjustment/preview');
    return res.data;
  }

  async getMyTarget(): Promise<MyCalorieTargetResponse> {
    const res = await apiClient.get<MyCalorieTargetResponse>('/calorie-target/me');
    return res.data;
  }
}

export const calorieTargetService = new CalorieTargetService();
