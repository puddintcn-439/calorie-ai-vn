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
  credits_consumed?: number;
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

export interface AiQuotaRemainingItem {
  feature: AiUsageFeature;
  feature_label: string;
  plan_tier: string;
  credits_per_request: number;
  daily_limit: number;
  daily_used: number;
  daily_remaining: number;
  monthly_limit: number;
  monthly_used: number;
  monthly_remaining: number;
  reset_at_daily: string;
  reset_at_monthly: string;
  estimated_cost_usd: number;
}

export interface AiQuotaRemainingResponse {
  generated_at: string;
  plan_tier: string;
  daily_credit_limit: number;
  daily_credits_used: number;
  daily_credits_remaining: number;
  monthly_credit_limit: number;
  monthly_credits_used: number;
  monthly_credits_remaining: number;
  reset_at_daily: string;
  reset_at_monthly: string;
  quotas: AiQuotaRemainingItem[];
}
