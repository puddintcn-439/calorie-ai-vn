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
