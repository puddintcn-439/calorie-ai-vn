import { Food, FoodCategory } from './food.types';
import type { TodaySummary } from './log.types';
import type { ReminderEffectivenessSummary } from './reminder.types';
import type { BehaviorMemory, DynamicIntervention, InterventionAnalytics, SuccessForecast } from './behavior.types';

// ---- Request Types ----

export interface AIScanRequest {
  image_base64?: string;    // Scan ảnh
  image_url?: string;
  text_input?: string;      // Nhập text: "1 tô phở bò"
  user_id: string;
}

// ---- Response Types ----

export interface AIScanResponse {
  success: boolean;
  scan_id: string;
  items: AIDetectedItem[];
  unresolved_items?: AIUnresolvedItem[];
  total_calories: number;
  total_calories_min?: number;
  total_calories_max?: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  ai_confidence: number;     // 0–1
  metadata?: Record<string, unknown>;
  raw_ai_response?: string;  // Debug
  processing_ms: number;
}

export interface AIDetectedItem {
  name: string;
  name_vi: string;
  category: FoodCategory;
  quantity: number;
  unit: string;              // "gram" | "ml" | "cái" | "tô" | "bát"
  estimated_grams: number;
  calories: number;
  calories_min?: number;
  calories_max?: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  saturated_fat_g?: number;
  sodium_mg?: number;
  confidence: number;        // 0–1
  matched_food_id?: string;  // Nếu match được trong DB
}

export interface AIUnresolvedItem {
  raw_text: string;
  reason: string;
  confidence: number;
}

// ---- AI Coach Types ----

export interface AICoachRequest {
  user_id: string;
  message: string;
  context?: {
    today_calories: number;
    target_calories: number;
    recent_logs?: string[];
    health_score?: TodaySummary['health_score'];
    reminder_effectiveness?: ReminderEffectivenessSummary;
    success_forecast?: SuccessForecast;
    behavior_memory?: BehaviorMemory;
    intervention_analytics?: InterventionAnalytics;
    dynamic_intervention?: DynamicIntervention;
  };
}

export interface AICoachResponse {
  message: string;
  suggestions?: string[];
  meal_suggestions?: string[];
  actions?: AICoachAction[];
}

export type AICoachActionType =
  | 'open_scan'
  | 'open_log'
  | 'open_progress'
  | 'open_reminders'
  | 'open_paywall'
  | 'add_activity';

export interface AICoachAction {
  type: AICoachActionType;
  label: string;
  description?: string;
  payload?: {
    activity_type?: string;
    activity_name?: string;
    duration_min?: number;
    calories_burned?: number;
    meal_type?: string;
    return_to?: string;
  };
}


export type AiUsageFeature =
  | 'scan_image'
  | 'scan_text'
  | 'scan_voice'
  | 'scan_receipt'
  | 'scan_refine'
  | 'coach';

export type AiUsageStatus = 'reserved' | 'success' | 'failed' | 'fallback' | 'blocked';

export interface AiUsageEvent {
  id?: string;
  request_id: string;
  user_id: string;
  feature: AiUsageFeature;
  plan_tier: string;
  provider?: string;
  model?: string;
  status: AiUsageStatus;
  cache_hit: boolean;
  estimated_cost_usd: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  error_category?: string | null;
  error_message?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

export interface AiUsageSummaryItem {
  label: string;
  count: number;
  estimated_cost_usd: number;
}

export interface AiUsageSummary {
  generated_at: string;
  window_days: number;
  total_requests: number;
  total_success: number;
  total_fallback: number;
  total_failed: number;
  total_blocked: number;
  estimated_cost_usd: number;
  top_features: AiUsageSummaryItem[];
  top_users: AiUsageSummaryItem[];
  providers: AiUsageSummaryItem[];
  models: AiUsageSummaryItem[];
}
