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

class CalorieTargetService {
  async getMyRecommendations(): Promise<WeeklyRecommendations> {
    const res = await apiClient.get<WeeklyRecommendations>('/calorie-target/recommendations/me');
    return res.data;
  }

  async applyWeeklyAdjustment(): Promise<WeeklyAdaptiveResult> {
    const res = await apiClient.post<WeeklyAdaptiveResult>('/calorie-target/weekly-adjustment');
    return res.data;
  }
}

export const calorieTargetService = new CalorieTargetService();
