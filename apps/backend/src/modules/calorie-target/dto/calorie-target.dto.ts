import { IsNumber, IsPositive, IsEnum } from 'class-validator';
import { UserGoal, ActivityLevel } from '@calorie-ai/types';

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
}

export interface CalorieTargetResponse {
  daily_calorie_target: number;
  bmr: number;
  tdee: number;
  target_breakfast_cal: number;
  target_lunch_cal: number;
  target_dinner_cal: number;
  target_snack_cal: number;
  calculation_date: string;
}
