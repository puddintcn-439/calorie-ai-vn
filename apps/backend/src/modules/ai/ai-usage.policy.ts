import { AiUsageFeature } from '@calorie-ai/types';

export type AiQuotaWindow = 'daily' | 'monthly';

export interface AiQuotaLimit {
  daily: number;
  monthly: number;
}

export interface AiCreditLimit {
  daily: number;
  monthly: number;
}

export interface AiUsagePolicyEntry {
  quota: AiQuotaLimit;
  credits: number;
  estimated_cost_usd: number;
  model: string;
  provider: string;
}

export interface AiTierCreditBudget {
  daily: number;
  monthly: number;
}

export type AiUsagePolicy = Record<string, Record<AiUsageFeature, AiUsagePolicyEntry>>;

const defaultTextModel = process.env.AI_MODEL ?? 'gemini-2.5-flash-lite';
const defaultImageModel = process.env.AI_IMAGE_MODEL ?? 'gemini-2.5-flash-lite';
const provider = 'gemini';

// Gemini 2.5 Flash-Lite public reference pricing is roughly $0.10 / 1M input tokens
// and $0.40 / 1M output tokens. These per-call estimates are intentionally padded
// for prompts, JSON retries, image payload overhead, and provider pricing changes.
// Keep them conservative until actual token usage is captured from provider metadata.
export const GEMINI_FLASH_LITE_REFERENCE_PRICE_USD = {
  input_per_1m_tokens: 0.10,
  output_per_1m_tokens: 0.40,
};

export const ESTIMATED_COST_USD: Record<AiUsageFeature, number> = {
  scan_text: 0.0008,
  scan_refine: 0.0008,
  coach: 0.0012,
  scan_voice: 0.0012,
  scan_image: 0.003,
  scan_receipt: 0.004,
};

// Credit weights make production pricing safer than independent per-feature quotas.
// A paid user can spend their monthly budget flexibly, while expensive image/receipt
// features consume more budget than text/coach requests.
export const AI_FEATURE_CREDITS: Record<AiUsageFeature, number> = {
  scan_text: 1,
  scan_refine: 1,
  coach: 1,
  scan_voice: 2,
  scan_image: 3,
  scan_receipt: 5,
};

export const AI_TIER_CREDIT_BUDGETS: Record<string, AiTierCreditBudget> = {
  free: { daily: 3, monthly: 20 },
  premium: { daily: 50, monthly: 600 },
  pro: { daily: 150, monthly: 1800 },
};

export const AI_USAGE_POLICY: AiUsagePolicy = {
  free: {
    scan_image: { quota: { daily: 1, monthly: 10 }, credits: AI_FEATURE_CREDITS.scan_image, estimated_cost_usd: ESTIMATED_COST_USD.scan_image, model: defaultImageModel, provider },
    scan_text: { quota: { daily: 3, monthly: 30 }, credits: AI_FEATURE_CREDITS.scan_text, estimated_cost_usd: ESTIMATED_COST_USD.scan_text, model: defaultTextModel, provider },
    scan_voice: { quota: { daily: 1, monthly: 10 }, credits: AI_FEATURE_CREDITS.scan_voice, estimated_cost_usd: ESTIMATED_COST_USD.scan_voice, model: defaultTextModel, provider },
    scan_receipt: { quota: { daily: 1, monthly: 5 }, credits: AI_FEATURE_CREDITS.scan_receipt, estimated_cost_usd: ESTIMATED_COST_USD.scan_receipt, model: defaultImageModel, provider },
    scan_refine: { quota: { daily: 3, monthly: 30 }, credits: AI_FEATURE_CREDITS.scan_refine, estimated_cost_usd: ESTIMATED_COST_USD.scan_refine, model: defaultTextModel, provider },
    coach: { quota: { daily: 5, monthly: 80 }, credits: AI_FEATURE_CREDITS.coach, estimated_cost_usd: ESTIMATED_COST_USD.coach, model: defaultTextModel, provider },
  },
  premium: {
    scan_image: { quota: { daily: 10, monthly: 200 }, credits: AI_FEATURE_CREDITS.scan_image, estimated_cost_usd: ESTIMATED_COST_USD.scan_image, model: defaultImageModel, provider },
    scan_text: { quota: { daily: 30, monthly: 900 }, credits: AI_FEATURE_CREDITS.scan_text, estimated_cost_usd: ESTIMATED_COST_USD.scan_text, model: defaultTextModel, provider },
    scan_voice: { quota: { daily: 10, monthly: 200 }, credits: AI_FEATURE_CREDITS.scan_voice, estimated_cost_usd: ESTIMATED_COST_USD.scan_voice, model: defaultTextModel, provider },
    scan_receipt: { quota: { daily: 5, monthly: 100 }, credits: AI_FEATURE_CREDITS.scan_receipt, estimated_cost_usd: ESTIMATED_COST_USD.scan_receipt, model: defaultImageModel, provider },
    scan_refine: { quota: { daily: 30, monthly: 900 }, credits: AI_FEATURE_CREDITS.scan_refine, estimated_cost_usd: ESTIMATED_COST_USD.scan_refine, model: defaultTextModel, provider },
    coach: { quota: { daily: 50, monthly: 1200 }, credits: AI_FEATURE_CREDITS.coach, estimated_cost_usd: ESTIMATED_COST_USD.coach, model: defaultTextModel, provider },
  },
  pro: {
    scan_image: { quota: { daily: 30, monthly: 800 }, credits: AI_FEATURE_CREDITS.scan_image, estimated_cost_usd: ESTIMATED_COST_USD.scan_image, model: defaultImageModel, provider },
    scan_text: { quota: { daily: 100, monthly: 3000 }, credits: AI_FEATURE_CREDITS.scan_text, estimated_cost_usd: ESTIMATED_COST_USD.scan_text, model: defaultTextModel, provider },
    scan_voice: { quota: { daily: 30, monthly: 800 }, credits: AI_FEATURE_CREDITS.scan_voice, estimated_cost_usd: ESTIMATED_COST_USD.scan_voice, model: defaultTextModel, provider },
    scan_receipt: { quota: { daily: 15, monthly: 300 }, credits: AI_FEATURE_CREDITS.scan_receipt, estimated_cost_usd: ESTIMATED_COST_USD.scan_receipt, model: defaultImageModel, provider },
    scan_refine: { quota: { daily: 100, monthly: 3000 }, credits: AI_FEATURE_CREDITS.scan_refine, estimated_cost_usd: ESTIMATED_COST_USD.scan_refine, model: defaultTextModel, provider },
    coach: { quota: { daily: 150, monthly: 4000 }, credits: AI_FEATURE_CREDITS.coach, estimated_cost_usd: ESTIMATED_COST_USD.coach, model: defaultTextModel, provider },
  },
};

export function getAiPolicy(tier: string, feature: AiUsageFeature): AiUsagePolicyEntry {
  return AI_USAGE_POLICY[tier]?.[feature] ?? AI_USAGE_POLICY.free[feature];
}

export function getAiTierCreditBudget(tier: string): AiTierCreditBudget {
  return AI_TIER_CREDIT_BUDGETS[tier] ?? AI_TIER_CREDIT_BUDGETS.free;
}
