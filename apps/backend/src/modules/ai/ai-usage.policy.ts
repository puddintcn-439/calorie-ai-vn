import { AiUsageFeature } from '@calorie-ai/types';

export type AiQuotaWindow = 'daily' | 'monthly';

export interface AiQuotaLimit {
  daily: number;
  monthly: number;
}

export interface AiUsagePolicyEntry {
  quota: AiQuotaLimit;
  estimated_cost_usd: number;
  model: string;
  provider: string;
}

export type AiUsagePolicy = Record<string, Record<AiUsageFeature, AiUsagePolicyEntry>>;

const defaultTextModel = process.env.AI_MODEL ?? 'gemini-2.5-flash';
const defaultImageModel = process.env.AI_IMAGE_MODEL ?? 'gemini-2.5-flash-lite';
const provider = 'gemini';

export const AI_USAGE_POLICY: AiUsagePolicy = {
  free: {
    scan_image: { quota: { daily: 5, monthly: 100 }, estimated_cost_usd: 0.03, model: defaultImageModel, provider },
    scan_text: { quota: { daily: 10, monthly: 200 }, estimated_cost_usd: 0.01, model: defaultTextModel, provider },
    scan_voice: { quota: { daily: 5, monthly: 80 }, estimated_cost_usd: 0.015, model: defaultTextModel, provider },
    scan_receipt: { quota: { daily: 3, monthly: 50 }, estimated_cost_usd: 0.035, model: defaultImageModel, provider },
    scan_refine: { quota: { daily: 10, monthly: 150 }, estimated_cost_usd: 0.008, model: defaultTextModel, provider },
    coach: { quota: { daily: 20, monthly: 300 }, estimated_cost_usd: 0.012, model: defaultTextModel, provider },
  },
  premium: {
    scan_image: { quota: { daily: 50, monthly: 1500 }, estimated_cost_usd: 0.03, model: defaultImageModel, provider },
    scan_text: { quota: { daily: 100, monthly: 3000 }, estimated_cost_usd: 0.01, model: defaultTextModel, provider },
    scan_voice: { quota: { daily: 30, monthly: 800 }, estimated_cost_usd: 0.015, model: defaultTextModel, provider },
    scan_receipt: { quota: { daily: 20, monthly: 400 }, estimated_cost_usd: 0.035, model: defaultImageModel, provider },
    scan_refine: { quota: { daily: 100, monthly: 3000 }, estimated_cost_usd: 0.008, model: defaultTextModel, provider },
    coach: { quota: { daily: 300, monthly: 3000 }, estimated_cost_usd: 0.012, model: defaultTextModel, provider },
  },
  pro: {
    scan_image: { quota: { daily: 150, monthly: 5000 }, estimated_cost_usd: 0.03, model: defaultImageModel, provider },
    scan_text: { quota: { daily: 300, monthly: 9000 }, estimated_cost_usd: 0.01, model: defaultTextModel, provider },
    scan_voice: { quota: { daily: 100, monthly: 2500 }, estimated_cost_usd: 0.015, model: defaultTextModel, provider },
    scan_receipt: { quota: { daily: 60, monthly: 1200 }, estimated_cost_usd: 0.035, model: defaultImageModel, provider },
    scan_refine: { quota: { daily: 250, monthly: 6000 }, estimated_cost_usd: 0.008, model: defaultTextModel, provider },
    coach: { quota: { daily: 1000, monthly: 12000 }, estimated_cost_usd: 0.012, model: defaultTextModel, provider },
  },
};

export function getAiPolicy(tier: string, feature: AiUsageFeature): AiUsagePolicyEntry {
  return AI_USAGE_POLICY[tier]?.[feature] ?? AI_USAGE_POLICY.free[feature];
}