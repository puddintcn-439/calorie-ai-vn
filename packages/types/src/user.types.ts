export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  weight_kg?: number;
  height_cm?: number;
  age?: number;
  gender?: 'male' | 'female';
  activity_level?: ActivityLevel;
  goal?: UserGoal;
  daily_calorie_target?: number;
  target_breakfast_cal?: number;
  target_lunch_cal?: number;
  target_dinner_cal?: number;
  target_snack_cal?: number;
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
  applied_at?: string;
  note?: string;
}

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

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
