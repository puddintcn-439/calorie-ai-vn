import { GoalPlanDirection } from './user.types';

export interface BodyProgressEntry {
  id: number;
  user_id: string;
  recorded_at: string; // ISO date string YYYY-MM-DD
  weight_kg?: number;
  waist_cm?: number;
  hip_cm?: number;
  chest_cm?: number;
  arm_cm?: number;
  thigh_cm?: number;
  body_fat_pct?: number;
  muscle_mass_kg?: number;
  note?: string;
  energy_level?: 1 | 2 | 3 | 4 | 5;
  created_at: string;
  updated_at: string;
}

export interface CreateBodyProgressDto {
  recorded_at?: string;
  weight_kg?: number;
  waist_cm?: number;
  hip_cm?: number;
  chest_cm?: number;
  arm_cm?: number;
  thigh_cm?: number;
  body_fat_pct?: number;
  muscle_mass_kg?: number;
  note?: string;
  energy_level?: 1 | 2 | 3 | 4 | 5;
}

export type BodyProgressDataStatus =
  | 'ready'
  | 'no_logs'
  | 'no_weight'
  | 'missing_goal'
  | 'insufficient_data';

export interface BodyProgressSummary {
  period_days: number;
  logged_days: number;
  weeks_with_logs: number;
  average_weekly_adherence_pct: number | null;
  average_daily_calories: number | null;
  calorie_target: number | null;
  weight_delta_kg: number | null;
  weight_goal_kg: number | null;
  weight_goal_direction: GoalPlanDirection | null;
  weight_goal_progress_pct: number | null;
  data_status: BodyProgressDataStatus;
}

export interface BodyProgressTrend {
  entries: BodyProgressEntry[];
  weight_change_kg: number | null;    // vs first entry
  weight_change_7d: number | null;    // vs 7 days ago
  waist_change_cm: number | null;     // vs first entry
  days_tracked: number;
  latest_entry: BodyProgressEntry | null;
  first_entry: BodyProgressEntry | null;
  progress_summary?: BodyProgressSummary;
}
