import type { DailyNutritionTarget, NutritionEvidenceLevel } from './nutrition-target.types';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  weight_kg?: number;
  height_cm?: number;
  body_fat_pct?: number;
  date_of_birth?: string;
  age?: number;
  gender?: 'male' | 'female';
  work_activity_level?: WorkActivityLevel;
  exercise_sessions_per_week?: number;
  exercise_minutes_per_session?: number;
  sweat_level?: SweatLevel;
  pregnancy_trimester?: 1 | 2 | 3;
  breastfeeding_level?: 'exclusive' | 'partial';
  diabetes_type?: 'type_1' | 'type_2' | 'gestational';
  kidney_care_status?: 'not_on_dialysis' | 'hemodialysis' | 'peritoneal_dialysis' | 'unknown';
  athlete_level?: 'recreational' | 'competitive' | 'elite';
  clinician_nutrition_targets?: ClinicianNutritionTargets | null;
  sensitive_nutrition_mode?: boolean;
  activity_level?: ActivityLevel;
  goal?: UserGoal;
  daily_calorie_target?: number;
  target_breakfast_cal?: number;
  target_lunch_cal?: number;
  target_dinner_cal?: number;
  target_snack_cal?: number;
  nutrition_target_snapshot?: DailyNutritionTarget | null;
  nutrition_algorithm_version?: string;
  nutrition_target_calculated_at?: string;
  /**
   * Optional personalized goal plan persisted as JSONB in the DB.
   * Example: { target_kg: 3, duration_weeks: 8, direction: 'loss', start_date: '2026-05-16', end_date: '2026-07-11' }
   */
  goal_plan?: GoalPlan | null;
  health_flags?: HealthFlag[];
  created_at: string;
  updated_at: string;
}

export type GoalPlanDirection = 'loss' | 'maintain' | 'gain';

export type GoalPlanSafetyStatus = 'ok' | 'adjusted' | 'maintenance_only' | 'incomplete';

export interface GoalPlan {
  /**
   * Total planned weight change in kg, not destination body weight.
   * Example: target_kg: 3 with direction: 'loss' means "lose 3 kg".
   */
  target_kg?: number;
  /** duration in weeks */
  duration_weeks?: number;
  start_date?: string; // ISO date
  end_date?: string; // ISO date
  direction?: GoalPlanDirection;
  weekly_rate_kg?: number;
  daily_calorie_delta?: number;
  computed_daily_calorie_target?: number;
  safety_status?: GoalPlanSafetyStatus;
  warnings?: string[];
  calculation_method?: 'dynamic_estimate' | 'static_7700_reference';
  calculation_evidence_level?: NutritionEvidenceLevel;
  reference_energy_kcal_per_kg?: number;
  applied_at?: string;
  note?: string;
}

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type WorkActivityLevel = 'sedentary' | 'light' | 'moderate' | 'heavy';
export type SweatLevel = 'low' | 'moderate' | 'high';

export interface ClinicianNutritionTargets {
  calories_kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  water_ml?: number;
  sodium_mg_max?: number;
  source: string;
  provider_type?: 'doctor' | 'dietitian' | 'care_team';
  plan_reference?: string;
  reason?: string;
  effective_from?: string;
  expires_at?: string | null;
  confirmed_at?: string;
  provenance?: 'user_reported' | 'provider_verified';
  verification_status?: 'self_attested' | 'verified';
  verified_at?: string;
  verified_by?: string;
  status?: 'active' | 'revoked';
  plan_version?: number;
}

export type UserGoal = 'lose_weight' | 'maintain' | 'gain_muscle';

export const HEALTH_FLAGS = [
  'pregnant',
  'breastfeeding',
  'kidney_disease',
  'diabetes',
  'eating_disorder_history',
  'weight_affecting_medication',
] as const;

export type HealthFlag = (typeof HEALTH_FLAGS)[number];

export interface UserProfile extends User {
  bmr?: number;       // Basal Metabolic Rate
  tdee?: number;      // Total Daily Energy Expenditure
}
