import { NotFoundException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AiUsageService } from '../ai/ai-usage.service';

type SupabaseCountResult = { count: number | null; error: any };

@Injectable()
export class AdminService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly aiUsageService: AiUsageService,
  ) {}

  async getOverview() {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      activeUsersToday,
      activeUsers7d,
      newUsersToday,
      newUsers7d,
      foodLogsToday,
      aiRowsToday,
    ] = await Promise.all([
      this.countDistinct('telemetry_events', 'user_id', todayStart.toISOString()),
      this.countDistinct('telemetry_events', 'user_id', sevenDaysAgo.toISOString()),
      this.countRows('users', todayStart.toISOString()),
      this.countRows('users', sevenDaysAgo.toISOString()),
      this.countRows('food_logs', todayStart.toISOString()),
      this.fetchAiUsageRows(todayStart.toISOString()),
    ]);

    const aiRequestsToday = aiRowsToday.length;
    const aiCostToday = aiRowsToday.reduce((sum, row: any) => sum + Number(row.estimated_cost_usd ?? 0), 0);
    const aiCreditsToday = aiRowsToday.reduce((sum, row: any) => sum + Number(row.credits_consumed ?? 1), 0);

    return {
      generated_at: now.toISOString(),
      active_users_today: activeUsersToday,
      active_users_7d: activeUsers7d,
      new_users_today: newUsersToday,
      new_users_7d: newUsers7d,
      food_logs_today: foodLogsToday,
      ai_requests_today: aiRequestsToday,
      estimated_ai_cost_today_usd: this.roundCost(aiCostToday),
      ai_credits_used_today: aiCreditsToday,
      quota_blocked_today: aiRowsToday.filter((row: any) => row.status === 'blocked').length,
      failed_ai_requests_today: aiRowsToday.filter((row: any) => row.status === 'failed').length,
    };
  }

  async getAiUsage(requesterEmail: string | undefined, days = 30) {
    return this.aiUsageService.getUsageSummary(requesterEmail, days);
  }

  async getUsers(params: { search?: string; plan?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let query: any = this.supabase.db
      .from('users')
      .select('id, email, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    const search = String(params.search ?? '').trim();
    if (search) {
      query = query.ilike('email', `%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) {
      throw error;
    }

    const users = Array.isArray(data) ? data : [];
    const userIds = users.map((user: any) => String(user.id)).filter(Boolean);
    const [subscriptions, aiUsage, foodCounts, lastActive] = await Promise.all([
      this.fetchSubscriptionsForUsers(userIds),
      this.fetchAiUsageForUsers(userIds, monthStart.toISOString()),
      this.fetchFoodLogCountsForUsers(userIds),
      this.fetchLastActiveForUsers(userIds),
    ]);

    let rows = users.map((user: any) => {
      const userId = String(user.id);
      const subscription = subscriptions.get(userId) ?? { tier: 'free', status: 'unknown' };
      return {
        id: userId,
        email: user.email ?? null,
        plan_tier: subscription.tier,
        subscription_status: subscription.status,
        created_at: user.created_at ?? null,
        last_active_at: lastActive.get(userId) ?? user.updated_at ?? null,
        total_ai_requests_month: aiUsage.get(userId)?.requests ?? 0,
        credits_used_month: aiUsage.get(userId)?.credits ?? 0,
        food_logs_count: foodCounts.get(userId) ?? 0,
      };
    });

    const plan = String(params.plan ?? '').trim().toLowerCase();
    if (plan) {
      rows = rows.filter((row) => String(row.plan_tier).toLowerCase() === plan);
    }

    return {
      generated_at: new Date().toISOString(),
      page,
      page_size: pageSize,
      total: count ?? rows.length,
      users: rows,
    };
  }

  async getUserDetail(userId: string) {
    const { data: user, error } = await this.supabase.db
      .from('users')
      .select('id, email, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [subscription, quota, recentFoodLogs, recentAiUsage, recentTelemetry] = await Promise.all([
      this.fetchSubscriptionForUser(userId),
      this.aiUsageService.getQuotaRemaining(userId).catch(() => null),
      this.fetchRecentFoodLogs(userId),
      this.fetchRecentAiUsage(userId),
      this.fetchRecentTelemetry(userId),
    ]);

    return {
      generated_at: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
        updated_at: user.updated_at ?? null,
      },
      subscription,
      ai_quota: quota,
      recent_food_logs: recentFoodLogs,
      recent_ai_usage: recentAiUsage,
      recent_telemetry: recentTelemetry,
    };
  }

  async getSubscriptions() {
    const { data } = await this.supabase.db
      .from('user_subscriptions')
      .select('user_id, tier, status, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(500);

    const rows = Array.isArray(data) ? data : [];
    const byTier: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const row of rows) {
      const tier = String(row.tier ?? 'unknown');
      const status = String(row.status ?? 'unknown');
      byTier[tier] = (byTier[tier] ?? 0) + 1;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }

    return {
      generated_at: new Date().toISOString(),
      total_loaded: rows.length,
      by_tier: byTier,
      by_status: byStatus,
      recent: rows.slice(0, 25),
    };
  }

  async getSystemHealth() {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [recentAiFailures, recentQuotaBlocks, recentErrors] = await Promise.all([
      this.countRowsByStatus('ai_usage_events', 'failed', since),
      this.countRowsByStatus('ai_usage_events', 'blocked', since),
      this.countRows('telemetry_events', since),
    ]);

    return {
      generated_at: now.toISOString(),
      status: 'ok',
      window_hours: 24,
      recent_ai_failures: recentAiFailures,
      recent_quota_blocks: recentQuotaBlocks,
      recent_telemetry_events: recentErrors,
    };
  }

  private async fetchAiUsageRows(sinceIso: string): Promise<any[]> {
    const { data } = await this.supabase.db
      .from('ai_usage_events')
      .select('status, estimated_cost_usd, credits_consumed, created_at')
      .gte('created_at', sinceIso)
      .limit(5000);
    return Array.isArray(data) ? data : [];
  }

  private async fetchSubscriptionsForUsers(userIds: string[]): Promise<Map<string, { tier: string; status: string }>> {
    const map = new Map<string, { tier: string; status: string }>();
    if (userIds.length === 0) return map;
    const { data } = await this.supabase.db
      .from('user_subscriptions')
      .select('user_id, tier, status, updated_at')
      .in('user_id', userIds)
      .order('updated_at', { ascending: false });
    for (const row of Array.isArray(data) ? data : []) {
      const userId = String(row.user_id);
      if (!map.has(userId)) {
        map.set(userId, { tier: String(row.tier ?? 'free'), status: String(row.status ?? 'unknown') });
      }
    }
    return map;
  }

  private async fetchSubscriptionForUser(userId: string) {
    const { data } = await this.supabase.db
      .from('user_subscriptions')
      .select('tier, status, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    const row = Array.isArray(data) ? data[0] : null;
    return row ?? { tier: 'free', status: 'unknown' };
  }

  private async fetchAiUsageForUsers(userIds: string[], sinceIso: string): Promise<Map<string, { requests: number; credits: number }>> {
    const map = new Map<string, { requests: number; credits: number }>();
    if (userIds.length === 0) return map;
    const { data } = await this.supabase.db
      .from('ai_usage_events')
      .select('user_id, credits_consumed')
      .in('user_id', userIds)
      .in('status', ['reserved', 'success', 'failed', 'fallback'])
      .gte('created_at', sinceIso)
      .limit(10000);
    for (const row of Array.isArray(data) ? data : []) {
      const userId = String(row.user_id);
      const current = map.get(userId) ?? { requests: 0, credits: 0 };
      current.requests += 1;
      current.credits += Number(row.credits_consumed ?? 1);
      map.set(userId, current);
    }
    return map;
  }

  private async fetchFoodLogCountsForUsers(userIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (userIds.length === 0) return map;
    const { data } = await this.supabase.db
      .from('food_logs')
      .select('user_id')
      .in('user_id', userIds)
      .limit(10000);
    for (const row of Array.isArray(data) ? data : []) {
      const userId = String(row.user_id);
      map.set(userId, (map.get(userId) ?? 0) + 1);
    }
    return map;
  }

  private async fetchLastActiveForUsers(userIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (userIds.length === 0) return map;
    const { data } = await this.supabase.db
      .from('telemetry_events')
      .select('user_id, created_at')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .limit(10000);
    for (const row of Array.isArray(data) ? data : []) {
      const userId = String(row.user_id);
      if (!map.has(userId)) {
        map.set(userId, String(row.created_at));
      }
    }
    return map;
  }

  private async fetchRecentFoodLogs(userId: string): Promise<any[]> {
    const { data } = await this.supabase.db
      .from('food_logs')
      .select('id, food_name, meal_type, calories, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    return Array.isArray(data) ? data : [];
  }

  private async fetchRecentAiUsage(userId: string): Promise<any[]> {
    const { data } = await this.supabase.db
      .from('ai_usage_events')
      .select('id, feature, status, model, provider, estimated_cost_usd, credits_consumed, created_at, completed_at, error_category')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    return Array.isArray(data) ? data : [];
  }

  private async fetchRecentTelemetry(userId: string): Promise<any[]> {
    const { data } = await this.supabase.db
      .from('telemetry_events')
      .select('id, event_type, event_name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    return Array.isArray(data) ? data : [];
  }

  private async countRows(table: string, sinceIso: string): Promise<number> {
    const result = (await this.supabase.db
      .from(table)
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso)) as SupabaseCountResult;
    return result?.count ?? 0;
  }

  private async countRowsByStatus(table: string, status: string, sinceIso: string): Promise<number> {
    const result = (await this.supabase.db
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
      .gte('created_at', sinceIso)) as SupabaseCountResult;
    return result?.count ?? 0;
  }

  private async countDistinct(table: string, column: string, sinceIso: string): Promise<number> {
    const { data } = await this.supabase.db
      .from(table)
      .select(column)
      .gte('created_at', sinceIso)
      .limit(10000);

    if (!Array.isArray(data)) {
      return 0;
    }

    return new Set(data.map((row: any) => row?.[column]).filter(Boolean)).size;
  }

  private roundCost(value: number): number {
    return Math.round(value * 1000000) / 1000000;
  }
}
