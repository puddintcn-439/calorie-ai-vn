import { IsNumber, IsPositive, IsEnum, IsOptional, IsArray, IsIn } from 'class-validator';
import { UserGoal, ActivityLevel, HealthFlag, HEALTH_FLAGS } from '@calorie-ai/types';

export type BodyStatus = 'underweight' | 'normal' | 'overweight' | 'obese';
export type WeightRecommendation = 'increase' | 'maintain' | 'decrease';
export type BmiInterpretation = 'screening_risk_not_diagnosis';

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

export class CalculateTargetDto {
  @IsNumber()
  @IsPositive()
  weight_kg: number;

  @IsNumber()
  @IsPositive()
  height_cm: number;

  @IsNumber()
  @IsPositive()
  age: number;

  @IsEnum(['male', 'female'])
  gender: 'male' | 'female';

  @IsEnum(['sedentary', 'light', 'moderate', 'active', 'very_active'])
  activity_level: ActivityLevel;

  @IsEnum(['lose_weight', 'maintain', 'gain_muscle'])
  goal: UserGoal;

  @IsOptional()
  @IsNumber()
  body_fat_pct?: number;

  @IsOptional()
  @IsArray()
  @IsIn(HEALTH_FLAGS, { each: true })
  health_flags?: HealthFlag[];
}

export interface CalorieTargetResponse {
  daily_calorie_target: number;
  bmr: number;
  tdee: number;
  bmi: number;
  body_status: BodyStatus;
  weight_recommendation: WeightRecommendation;
  recommended_goal: UserGoal;
  effective_goal?: UserGoal;
  recommendation_note: string;
  bmi_standard?: 'global_adult';
  bmi_interpretation?: BmiInterpretation;
  target_breakfast_cal: number;
  target_lunch_cal: number;
  target_dinner_cal: number;
  target_snack_cal: number;
  calculation_date: string;
  // Macros
  protein_target_g?: number;
  protein_g_per_kg?: number;
  fat_pct?: number; // target fat percent of kcal
  fat_g?: number;
  carbs_g?: number;
  carbs_pct?: number;
  is_estimate?: boolean;
  safety_warnings?: string[];
  macro_warnings?: string[];
  health_flags?: HealthFlag[];
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
