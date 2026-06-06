export type SuccessForecastRiskLevel = 'low' | 'medium' | 'high';

export type SuccessForecastLabel = 'at_risk' | 'needs_attention' | 'on_track' | 'strong';

export type SuccessForecastConfidence = 'low' | 'medium' | 'high';

export type SuccessForecastReason =
  | 'limited_data'
  | 'low_weekly_adherence'
  | 'declining_health_score'
  | 'ignored_reminders'
  | 'low_reminder_action'
  | 'nutrition_gap'
  | 'activity_gap'
  | 'logging_gap'
  | 'plan_gap';

export interface SuccessForecast {
  score: number;
  label: SuccessForecastLabel;
  risk_level: SuccessForecastRiskLevel;
  confidence: SuccessForecastConfidence;
  drivers: {
    adherence: number;
    trend: number;
    reminder_response: number;
    pattern_risk: number;
  };
  reasons: SuccessForecastReason[];
  patterns: string[];
  recovery_plan: {
    title: string;
    steps: string[];
    primary_action: 'log_meal' | 'move' | 'complete_plan' | 'adjust_reminders' | 'maintain';
  };
}

export interface BehaviorMemory {
  days_analyzed: number;
  data_quality: 'low' | 'medium' | 'high';
  best_reminder_hour: number | null;
  often_skips_breakfast: boolean;
  often_skips_lunch: boolean;
  often_skips_dinner: boolean;
  low_activity_days: Array<'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'>;
  best_logging_streak: number;
  high_protein_adherence: number;
  activity_adherence: number;
  meal_skip_rates: {
    breakfast: number;
    lunch: number;
    dinner: number;
    snack: number;
  };
  memory_notes: string[];
  updated_at: string;
}

export type DynamicInterventionMode =
  | 'silent'
  | 'light_nudge'
  | 'coach_action'
  | 'recovery_plan'
  | 'high_risk';

export type DynamicInterventionPriority = 'low' | 'medium' | 'high' | 'critical';

export type DynamicInterventionAction =
  | 'none'
  | 'log_meal'
  | 'move'
  | 'complete_plan'
  | 'adjust_reminders'
  | 'open_coach';

export interface DynamicIntervention {
  mode: DynamicInterventionMode;
  priority: DynamicInterventionPriority;
  should_surface: boolean;
  intervention_type:
    | 'maintain'
    | 'protein_nudge'
    | 'meal_logging'
    | 'activity_recovery'
    | 'plan_completion'
    | 'reminder_tuning'
    | 'high_risk_recovery';
  title: string;
  body: string;
  primary_action: DynamicInterventionAction;
  action_label: string;
  reasons: SuccessForecastReason[];
  recovery_steps: string[];
  cooldown_hours: number;
  generated_at: string;
}
