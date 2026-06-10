import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AiQuotaRemainingResponse, AiUsageEvent, AiUsageFeature, AiUsageStatus, AiUsageSummary } from '@calorie-ai/types';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { AI_USAGE_POLICY, getAiPolicy } from './ai-usage.policy';

type ReserveResult = AiUsageEvent & {
  reserved: boolean;
};

type QuotaBlockedEvent = Partial<AiUsageEvent> & {
  quota_window?: 'daily' | 'monthly';
  quota_limit?: number;
  quota_used?: number;
  reset_at?: string;
};

const FEATURE_LABELS: Record<AiUsageFeature, string> = {
  scan_image: 'quét ảnh món ăn',
  scan_text: 'nhập món ăn bằng chữ',
  scan_voice: 'nhập món ăn bằng giọng nói',
  scan_receipt: 'quét hóa đơn',
  scan_refine: 'chỉnh kết quả AI',
  coach: 'AI Coach',
};

const QUOTA_COUNTED_STATUSES: AiUsageStatus[] = ['reserved', 'success', 'failed', 'fallback'];

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly subscriptionService: SubscriptionService,
    private readonly config: ConfigService,
  ) {}

  async reserveUsage(userId: string, feature: AiUsageFeature): Promise<ReserveResult> {
    const subscription = await this.subscriptionService.getUserSubscription(userId);
    const policy = getAiPolicy(subscription.tier, feature);
    const requestId = randomUUID();

    const { data, error } = await this.supabase.db.rpc('reserve_ai_usage_event', {
      p_request_id: requestId,
      p_user_id: userId,
      p_feature: feature,
      p_plan_tier: subscription.tier,
      p_provider: policy.provider,
      p_model: policy.model,
      p_daily_limit: policy.quota.daily,
      p_monthly_limit: policy.quota.monthly,
      p_estimated_cost_usd: policy.estimated_cost_usd,
    });

    if (error) {
      this.logger.warn(`reserve_ai_usage_event failed for ${feature}: ${String(error?.message ?? error)}`);
      throw error;
    }

    const event = this.extractEvent(data);
    if (!event) {
      throw new Error('AI usage reservation did not return an event');
    }

    if (event.status === 'blocked') {
      this.throwQuotaExceeded(feature, event as QuotaBlockedEvent);
    }

    return { ...event, reserved: true };
  }

  async finalizeUsage(
    usageEventId: string,
    payload: {
      status: Exclude<AiUsageStatus, 'blocked' | 'reserved'>;
      provider?: string;
      model?: string;
      cacheHit?: boolean;
      estimatedCostUsd?: number;
      inputTokens?: number | null;
      outputTokens?: number | null;
      errorCategory?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<void> {
    const updatePayload = {
      status: payload.status,
      provider: payload.provider ?? null,
      model: payload.model ?? null,
      cache_hit: payload.cacheHit ?? false,
      estimated_cost_usd: payload.estimatedCostUsd ?? null,
      input_tokens: payload.inputTokens ?? null,
      output_tokens: payload.outputTokens ?? null,
      error_category: payload.errorCategory ?? null,
      error_message: payload.errorMessage ? String(payload.errorMessage).slice(0, 500) : null,
      completed_at: new Date().toISOString(),
    };

    const { error } = await this.supabase.db
      .from('ai_usage_events')
      .update(updatePayload)
      .eq('id', usageEventId);

    if (error) {
      this.logger.warn(`Failed to finalize AI usage ${usageEventId}: ${String(error?.message ?? error)}`);
    }
  }

  async getQuotaRemaining(userId: string): Promise<AiQuotaRemainingResponse> {
    const subscription = await this.subscriptionService.getUserSubscription(userId);
    const tier = AI_USAGE_POLICY[subscription.tier] ? subscription.tier : 'free';
    const features = Object.keys(AI_USAGE_POLICY[tier]) as AiUsageFeature[];
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const nextMonthStart = new Date(monthStart);
    nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

    const { data, error } = await this.supabase.db
      .from('ai_usage_events')
      .select('feature, status, created_at')
      .eq('user_id', userId)
      .in('feature', features)
      .in('status', QUOTA_COUNTED_STATUSES)
      .gte('created_at', monthStart.toISOString());

    if (error) {
      throw error;
    }

    const dailyUsed = new Map<AiUsageFeature, number>();
    const monthlyUsed = new Map<AiUsageFeature, number>();

    for (const row of Array.isArray(data) ? data : []) {
      const feature = row.feature as AiUsageFeature;
      const createdAt = new Date(String(row.created_at));
      monthlyUsed.set(feature, (monthlyUsed.get(feature) ?? 0) + 1);
      if (createdAt >= todayStart) {
        dailyUsed.set(feature, (dailyUsed.get(feature) ?? 0) + 1);
      }
    }

    return {
      generated_at: now.toISOString(),
      plan_tier: tier,
      quotas: features.map((feature) => {
        const policy = getAiPolicy(tier, feature);
        const usedToday = dailyUsed.get(feature) ?? 0;
        const usedMonth = monthlyUsed.get(feature) ?? 0;
        return {
          feature,
          feature_label: FEATURE_LABELS[feature] ?? feature,
          plan_tier: tier,
          daily_limit: policy.quota.daily,
          daily_used: usedToday,
          daily_remaining: Math.max(0, policy.quota.daily - usedToday),
          monthly_limit: policy.quota.monthly,
          monthly_used: usedMonth,
          monthly_remaining: Math.max(0, policy.quota.monthly - usedMonth),
          reset_at_daily: tomorrowStart.toISOString(),
          reset_at_monthly: nextMonthStart.toISOString(),
          estimated_cost_usd: policy.estimated_cost_usd,
        };
      }),
    };
  }

  async getUsageSummary(requesterEmail: string | undefined, days = 30): Promise<AiUsageSummary> {
    this.assertAdmin(requesterEmail);

    const windowDays = Math.max(1, Math.min(180, Math.round(Number(days) || 30)));
    const since = new Date(Date.now() - (windowDays - 1) * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase.db
      .from('ai_usage_events')
      .select('user_id, feature, provider, model, status, estimated_cost_usd, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const summary = rows.reduce(
      (acc, row: any) => {
        const status = String(row.status ?? 'failed') as AiUsageStatus;
        const feature = String(row.feature ?? 'unknown');
        const provider = String(row.provider ?? 'unknown');
        const model = String(row.model ?? 'unknown');
        const userId = String(row.user_id ?? 'unknown');
        const createdAt = new Date(String(row.created_at ?? new Date().toISOString()));
        const cost = Number(row.estimated_cost_usd ?? 0) || 0;

        acc.total_requests += 1;
        acc.estimated_cost_usd += cost;
        acc.status[status] = (acc.status[status] ?? 0) + 1;
        this.bump(acc.features, feature, cost);
        this.bump(acc.providers, provider, cost);
        this.bump(acc.models, model, cost);
        this.bump(acc.users, userId, cost);

        if (createdAt >= todayStart) {
          acc.today += 1;
        }
        if (createdAt >= monthStart) {
          acc.month += 1;
        }

        return acc;
      },
      {
        total_requests: 0,
        today: 0,
        month: 0,
        estimated_cost_usd: 0,
        status: {} as Record<string, number>,
        features: new Map<string, { count: number; estimated_cost_usd: number }>(),
        providers: new Map<string, { count: number; estimated_cost_usd: number }>(),
        models: new Map<string, { count: number; estimated_cost_usd: number }>(),
        users: new Map<string, { count: number; estimated_cost_usd: number }>(),
      },
    );

    const toItems = (entries: Map<string, { count: number; estimated_cost_usd: number }>) =>
      [...entries.entries()]
        .map(([label, item]) => ({ label, count: item.count, estimated_cost_usd: this.roundCost(item.estimated_cost_usd) }))
        .sort((a, b) => b.count - a.count || b.estimated_cost_usd - a.estimated_cost_usd)
        .slice(0, 10);

    return {
      generated_at: new Date().toISOString(),
      window_days: windowDays,
      total_requests: summary.total_requests,
      total_success: summary.status.success ?? 0,
      total_fallback: summary.status.fallback ?? 0,
      total_failed: summary.status.failed ?? 0,
      total_blocked: summary.status.blocked ?? 0,
      estimated_cost_usd: this.roundCost(summary.estimated_cost_usd),
      top_features: toItems(summary.features),
      top_users: toItems(summary.users),
      providers: toItems(summary.providers),
      models: toItems(summary.models),
    };
  }

  private throwQuotaExceeded(feature: AiUsageFeature, event: QuotaBlockedEvent): never {
    const featureLabel = FEATURE_LABELS[feature] ?? feature;
    const window = event.quota_window ?? 'daily';
    const windowLabel = window === 'monthly' ? 'tháng này' : 'hôm nay';

    throw new HttpException(
      {
        code: 'AI_QUOTA_EXCEEDED',
        message: `Bạn đã dùng hết lượt AI ${windowLabel} cho tính năng ${featureLabel}. Hãy thử lại sau hoặc nâng cấp gói.`,
        feature,
        feature_label: featureLabel,
        window,
        limit: event.quota_limit ?? null,
        used: event.quota_used ?? null,
        reset_at: event.reset_at ?? null,
        upgrade_required: true,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private extractEvent(data: unknown): AiUsageEvent | null {
    if (Array.isArray(data)) {
      return (data[0] ?? null) as AiUsageEvent | null;
    }

    if (data && typeof data === 'object') {
      return data as AiUsageEvent;
    }

    return null;
  }

  private bump(
    map: Map<string, { count: number; estimated_cost_usd: number }>,
    key: string,
    cost: number,
  ) {
    const current = map.get(key) ?? { count: 0, estimated_cost_usd: 0 };
    current.count += 1;
    current.estimated_cost_usd += cost;
    map.set(key, current);
  }

  private roundCost(value: number): number {
    return Math.round(value * 1000000) / 1000000;
  }

  private assertAdmin(email: string | undefined) {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const raw = [
      this.config.get<string>('BETA_ANALYTICS_ADMIN_EMAILS'),
      this.config.get<string>('ADMIN_EMAILS'),
    ].filter(Boolean).join(',');
    const admins = raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (!normalizedEmail || admins.length === 0 || (!admins.includes('*') && !admins.includes(normalizedEmail))) {
      throw new ForbiddenException('AI usage summary is restricted to configured admin emails');
    }
  }
}
