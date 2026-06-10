import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AiUsageEvent, AiUsageFeature, AiUsageStatus, AiUsageSummary } from '@calorie-ai/types';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { getAiPolicy } from './ai-usage.policy';

type ReserveResult = AiUsageEvent & {
  reserved: boolean;
};

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
      throw new HttpException(
        `Bạn đã dùng hết quota AI cho ${feature}. Hãy thử lại sau hoặc nâng cấp gói.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
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
      error_message: payload.errorMessage ?? null,
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

  async getUsageSummary(requesterEmail: string | undefined, days = 30): Promise<AiUsageSummary> {
    this.assertAdmin(requesterEmail);

    const windowDays = Math.max(1, Math.min(180, Math.round(days)));
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
        .map(([label, item]) => ({ label, count: item.count, estimated_cost_usd: Math.round(item.estimated_cost_usd * 1000000) / 1000000 }))
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
      estimated_cost_usd: Math.round(summary.estimated_cost_usd * 1000000) / 1000000,
      top_features: toItems(summary.features),
      top_users: toItems(summary.users),
      providers: toItems(summary.providers),
      models: toItems(summary.models),
    };
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