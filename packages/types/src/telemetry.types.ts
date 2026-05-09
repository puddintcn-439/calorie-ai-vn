// Telemetry and correction event tracking types

export type CorrectionEventType = 'item_mismatch' | 'portion_adjusted' | 'confidence_low' | 'ai_result_corrected';

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
