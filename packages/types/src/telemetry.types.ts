// Telemetry and correction event tracking types

export type CorrectionEventType = 'item_mismatch' | 'portion_adjusted' | 'confidence_low' | 'ai_result_corrected';

export type LoggingEventType = 'log_attempted' | 'log_parsed' | 'log_failed';

export type LoggingInputMode =
  | 'image'
  | 'text'
  | 'voice'
  | 'receipt'
  | 'barcode'
  | 'search';

export interface CorrectionEvent {
  id?: string;
  user_id: string;
  event_type: CorrectionEventType;
  food_id?: string;
  food_name?: string;
  original_calories?: number;
  corrected_calories?: number;
  original_portion?: number;
  corrected_portion?: number;
  original_portion_unit?: string;
  ai_confidence?: number;
  notes?: string;
  created_at?: string;
}

export interface CorrectionEventDto {
  event_type: CorrectionEventType;
  food_id?: string;
  food_name?: string;
  original_calories?: number;
  corrected_calories?: number;
  original_portion?: number;
  corrected_portion?: number;
  original_portion_unit?: string;
  ai_confidence?: number;
  notes?: string;
}

export interface CorrectionStats {
  total_corrections: number;
  corrected_items_percentage: number;
  most_common_correction_type: CorrectionEventType;
  avg_ai_confidence: number;
}

export interface LoggingEvent {
  id?: string;
  user_id: string;
  event_type: LoggingEventType;
  input_mode: LoggingInputMode;
  elapsed_ms?: number;
  correction_count?: number;
  item_count?: number;
  ai_confidence?: number;
  reason_code?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface LoggingEventDto {
  event_type: LoggingEventType;
  input_mode: LoggingInputMode;
  elapsed_ms?: number;
  correction_count?: number;
  item_count?: number;
  ai_confidence?: number;
  reason_code?: string;
  metadata?: Record<string, unknown>;
}

export type ForecastSnapshotSource = 'today' | 'coach';

export interface ForecastSnapshot {
  id?: string;
  user_id: string;
  local_date: string;
  source: ForecastSnapshotSource;
  forecast_score: number;
  forecast_label: string;
  risk_level: string;
  confidence: string;
  health_score_overall?: number;
  adherence_score?: number;
  weakest_area?: string;
  forecast?: Record<string, unknown>;
  health_score?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ForecastSnapshotDto {
  local_date: string;
  source: ForecastSnapshotSource;
  forecast_score: number;
  forecast_label: string;
  risk_level: string;
  confidence: string;
  health_score_overall?: number;
  adherence_score?: number;
  weakest_area?: string;
  forecast?: Record<string, unknown>;
  health_score?: Record<string, unknown>;
}

export interface BetaAnalyticsInterventionItem {
  intervention_type: string;
  mode: string;
  primary_action: string;
  shown: number;
  acted: number;
  dismissed: number;
  action_rate: number;
  dismiss_rate: number;
  sample_status: 'insufficient' | 'learning' | 'ready';
}

export interface BetaAnalyticsDailyEngagementItem {
  local_date: string;
  active_users: number;
  food_logs: number;
  activity_logs: number;
  roadmap_completed: number;
  interventions_shown: number;
  interventions_acted: number;
  forecast_snapshots: number;
}

export interface BetaAnalyticsCalibrationBucket {
  bucket_order: number;
  forecast_bucket: string;
  samples: number;
  avg_forecast_score: number;
  actual_success_rate: number;
  calibration_error: number;
  calibration_status: 'insufficient' | 'underconfident' | 'calibrated' | 'overconfident';
  confidence_level: 'low' | 'medium' | 'high';
}

export interface BetaAnalyticsSummary {
  generated_at: string;
  window_days: number;
  access: 'admin';
  forecast: {
    snapshots: number;
    avg_absolute_error: number;
    classification_accuracy: number;
    avg_forecast_score: number;
    avg_actual_adherence: number;
    sample_status: 'insufficient' | 'learning' | 'ready';
  };
  calibration: {
    buckets: BetaAnalyticsCalibrationBucket[];
    total_samples: number;
    avg_calibration_error: number;
    worst_bucket: string | null;
    status: 'insufficient' | 'needs_attention' | 'calibrated';
  };
  interventions: {
    total_shown: number;
    total_acted: number;
    total_dismissed: number;
    action_rate: number;
    dismiss_rate: number;
    ready_count: number;
    top_effective: BetaAnalyticsInterventionItem[];
    top_ignored: BetaAnalyticsInterventionItem[];
  };
  reminders: {
    weeks: number;
    avg_open_rate: number;
    avg_action_rate: number;
    fatigue_weeks: number;
    fatigue_level: 'low' | 'medium' | 'high';
  };
  engagement: {
    active_users_7d: number;
    active_users_30d: number;
    avg_food_logs_per_active_day: number;
    avg_activity_logs_per_active_day: number;
    recent_daily: BetaAnalyticsDailyEngagementItem[];
  };
  recommendations: string[];
}
