import { IsNumber, IsPositive, IsEnum, IsOptional } from 'class-validator';
import { UserGoal, ActivityLevel } from '@calorie-ai/types';

export type BodyStatus = 'underweight' | 'normal' | 'overweight' | 'obese';
export type WeightRecommendation = 'increase' | 'maintain' | 'decrease';

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
}

export interface CalorieTargetResponse {
  daily_calorie_target: number;
  bmr: number;
  tdee: number;
  bmi: number;
  body_status: BodyStatus;
  weight_recommendation: WeightRecommendation;
  recommended_goal: UserGoal;
  recommendation_note: string;
  target_breakfast_cal: number;
  target_lunch_cal: number;
  target_dinner_cal: number;
  target_snack_cal: number;
  calculation_date: string;
}
