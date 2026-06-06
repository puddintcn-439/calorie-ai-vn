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
  scan_image_url?: string;
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
  scan_image_url?: string;
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
