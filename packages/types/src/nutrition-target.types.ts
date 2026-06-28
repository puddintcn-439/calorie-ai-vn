import { ActivityLevel, HealthFlag, UserGoal } from './user.types';

export type NutritionTargetStatus = 'ready' | 'needs_profile' | 'clinician_guidance';

export interface DailyNutritionTarget {
  date: string;
  status: NutritionTargetStatus;
  calories_kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  water_ml?: number;
  sodium_mg_max?: number;
  free_sugar_g_max?: number;
  saturated_fat_g_max?: number;
  rationale: {
    calories?: string;
    protein?: string;
    carbs?: string;
    fat?: string;
    fiber?: string;
    water?: string;
  };
  factors: {
    age?: number;
    weight_kg?: number;
    activity_level?: ActivityLevel;
    goal?: UserGoal;
    health_flags: HealthFlag[];
    protein_g_per_kg?: number;
    fat_energy_pct?: number;
  };
  missing_fields: string[];
  warnings: string[];
  calculated_at: string;
  algorithm_version: string;
}
