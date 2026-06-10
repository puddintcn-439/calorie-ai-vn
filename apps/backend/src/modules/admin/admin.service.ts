import { Injectable } from '@nestjs/common';
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

  async getAiUsage(days = 30) {
    return this.aiUsageService.getUsageSummary('*', days);
  }

  async getSubscriptions() {
    const { data } = await this.supabase.db
      .from('user_subscriptions')
      .select('tier, status, created_at, updated_at')
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
