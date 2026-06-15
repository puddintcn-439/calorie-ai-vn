import { BadRequestException, NotFoundException, Injectable, Optional } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { BillingService } from '../billing/billing.service';
import { NotificationsService } from '../notifications/notifications.service';

type SupabaseCountResult = { count: number | null; error: any };
type AdminActor = { email?: string; role?: string; user_id?: string | null; source?: string };
type PaymentIssueStatus = 'open' | 'in_review' | 'resolved' | 'rejected';
type AdminUsersPlan = 'free' | 'premium' | 'pro';

const PAYMENT_ISSUE_STATUSES: PaymentIssueStatus[] = ['open', 'in_review', 'resolved', 'rejected'];
const ADMIN_USERS_PLANS: AdminUsersPlan[] = ['free', 'premium', 'pro'];

@Injectable()
export class AdminService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly aiUsageService: AiUsageService,
    private readonly billingService: BillingService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  async getOverview() {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [activeUsersToday, activeUsers7d, newUsersToday, newUsers7d, foodLogsToday, aiRowsToday] = await Promise.all([
      this.countDistinct('telemetry_events', 'user_id', todayStart.toISOString()), this.countDistinct('telemetry_events', 'user_id', sevenDaysAgo.toISOString()), this.countRows('users', todayStart.toISOString()), this.countRows('users', sevenDaysAgo.toISOString()), this.countRows('food_logs', todayStart.toISOString()), this.fetchAiUsageRows(todayStart.toISOString()),
    ]);
    const aiRequestsToday = aiRowsToday.length;
    const aiCostToday = aiRowsToday.reduce((sum, row: any) => sum + Number(row.estimated_cost_usd ?? 0), 0);
    const aiCreditsToday = aiRowsToday.reduce((sum, row: any) => sum + Number(row.credits_consumed ?? 1), 0);
    const quotaBlockedToday = aiRowsToday.filter((row: any) => row.status === 'blocked').length;
    const failedAiRequestsToday = aiRowsToday.filter((row: any) => row.status === 'failed').length;
    const failureRateToday = aiRequestsToday > 0 ? failedAiRequestsToday / aiRequestsToday : 0;
    const alerts = this.buildOverviewAlerts({ aiCostToday, quotaBlockedToday, failedAiRequestsToday, failureRateToday, aiRequestsToday });
    return { generated_at: now.toISOString(), active_users_today: activeUsersToday, active_users_7d: activeUsers7d, new_users_today: newUsersToday, new_users_7d: newUsers7d, food_logs_today: foodLogsToday, ai_requests_today: aiRequestsToday, estimated_ai_cost_today_usd: this.roundCost(aiCostToday), ai_credits_used_today: aiCreditsToday, quota_blocked_today: quotaBlockedToday, failed_ai_requests_today: failedAiRequestsToday, ai_failure_rate_today: Math.round(failureRateToday * 10000) / 10000, alerts };
  }

  async getAiUsage(requesterEmail: string | undefined, days = 30) { return this.aiUsageService.getUsageSummary(requesterEmail, days); }

  async grantPremium(userId: string, actor: AdminActor, reason: string) { const cleanReason = this.requireReason(reason); const user = await this.requireUser(userId); const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); const { data, error } = await this.supabase.db.from('user_subscriptions').upsert({ user_id: userId, tier: 'premium', is_active: true, payment_provider: 'trial', started_at: new Date().toISOString(), renews_at: expiresAt, cancelled_at: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('user_id, tier, is_active, started_at, renews_at, cancelled_at, updated_at').maybeSingle(); if (error) throw error; await this.writeAuditLog({ actor, action: 'grant_premium', targetType: 'user', targetId: userId, reason: cleanReason, metadata: { user_email: user.email ?? null, subscription: data ?? null, expires_at: expiresAt } }); return { ok: true, action: 'grant_premium', user_id: userId, user_email: user.email ?? null, subscription: data, audited: true }; }
  async revokePremium(userId: string, actor: AdminActor, reason: string) { const cleanReason = this.requireReason(reason); const user = await this.requireUser(userId); const { data, error } = await this.supabase.db.from('user_subscriptions').upsert({ user_id: userId, tier: 'free', is_active: false, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('user_id, tier, is_active, started_at, renews_at, cancelled_at, updated_at').maybeSingle(); if (error) throw error; await this.writeAuditLog({ actor, action: 'revoke_premium', targetType: 'user', targetId: userId, reason: cleanReason, metadata: { user_email: user.email ?? null, subscription: data ?? null } }); return { ok: true, action: 'revoke_premium', user_id: userId, user_email: user.email ?? null, subscription: data, audited: true }; }
  async resetAiQuota(userId: string, actor: AdminActor, reason: string, scope: 'daily' | 'monthly' = 'daily') { const cleanReason = this.requireReason(reason); const user = await this.requireUser(userId); const quota = await this.aiUsageService.getQuotaRemaining(userId); const now = new Date(); const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0); const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1); const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0); const nextMonthStart = new Date(monthStart); nextMonthStart.setMonth(nextMonthStart.getMonth() + 1); const normalizedScope = scope === 'monthly' ? 'monthly' : 'daily'; const creditsUsed = normalizedScope === 'monthly' ? Number(quota.monthly_credits_used ?? 0) : Number(quota.daily_credits_used ?? 0); const creditsDelta = Math.max(1, Math.ceil(creditsUsed)); const expiresAt = normalizedScope === 'monthly' ? nextMonthStart.toISOString() : tomorrowStart.toISOString(); const actorEmail = String(actor?.email ?? '').trim().toLowerCase() || 'unknown'; const { data, error } = await this.supabase.db.from('admin_quota_adjustments').insert({ user_id: userId, scope: normalizedScope, credits_delta: creditsDelta, reason: cleanReason, actor_email: actorEmail, expires_at: expiresAt }).select('id, user_id, scope, credits_delta, reason, actor_email, expires_at, created_at').maybeSingle(); if (error) throw error; await this.writeAuditLog({ actor, action: 'reset_ai_quota', targetType: 'user', targetId: userId, reason: cleanReason, metadata: { user_email: user.email ?? null, scope: normalizedScope, credits_delta: creditsDelta, expires_at: expiresAt, adjustment: data ?? null } }); return { ok: true, action: 'reset_ai_quota', user_id: userId, user_email: user.email ?? null, scope: normalizedScope, credits_delta: creditsDelta, expires_at: expiresAt, adjustment: data, audited: true }; }
  async getAuditLog(params: { actorEmail?: string; action?: string; targetType?: string; targetId?: string; page?: number; pageSize?: number }) { const page = Math.max(1, Number(params.page) || 1); const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 25)); const from = (page - 1) * pageSize; const to = from + pageSize - 1; let query: any = this.supabase.db.from('admin_audit_log').select('id, actor_user_id, actor_email, action, target_type, target_id, reason, metadata, ip_address, user_agent, created_at', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to); const actorEmail = String(params.actorEmail ?? '').trim(); const action = String(params.action ?? '').trim(); const targetType = String(params.targetType ?? '').trim(); const targetId = String(params.targetId ?? '').trim(); if (actorEmail) query = query.ilike('actor_email', `%${actorEmail}%`); if (action) query = query.eq('action', action); if (targetType) query = query.eq('target_type', targetType); if (targetId) query = query.eq('target_id', targetId); const { data, count, error } = await query; if (error) throw error; return { generated_at: new Date().toISOString(), page, page_size: pageSize, total: count ?? 0, entries: Array.isArray(data) ? data : [] }; }
  async getUsers(params: { search?: string; plan?: string; page?: number; pageSize?: number; page_size?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const requestedPageSize = params.pageSize ?? params.page_size;
    const pageSize = Math.max(1, Math.min(100, Number(requestedPageSize) || 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const plan = this.normalizeAdminUsersPlan(params.plan);
    const planFilter = await this.fetchAdminUsersPlanFilter(plan);
    if (planFilter.includeIds && planFilter.includeIds.length === 0) {
      return { generated_at: new Date().toISOString(), page, page_size: pageSize, total: 0, users: [] };
    }

    let query: any = this.supabase.db
      .from('users')
      .select('id, email, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    const search = String(params.search ?? '').trim();
    if (search) query = query.ilike('email', `%${search}%`);
    if (planFilter.includeIds) query = query.in('id', planFilter.includeIds);
    if (planFilter.excludeIds && planFilter.excludeIds.length > 0) query = query.not('id', 'in', `(${planFilter.excludeIds.join(',')})`);

    const { data, count, error } = await query.range(from, to);
    if (error) throw error;

    const users = Array.isArray(data) ? data : [];
    const userIds = users.map((user: any) => String(user.id)).filter(Boolean);
    const [subscriptions, aiUsage, foodCounts, lastActive] = await Promise.all([
      this.fetchSubscriptionsForUsers(userIds),
      this.fetchAiUsageForUsers(userIds, monthStart.toISOString()),
      this.fetchFoodLogCountsForUsers(userIds),
      this.fetchLastActiveForUsers(userIds),
    ]);
    const rows = users.map((user: any) => {
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

    return { generated_at: new Date().toISOString(), page, page_size: pageSize, total: count ?? rows.length, users: rows };
  }
  async getUserDetail(userId: string) { const { data: user, error } = await this.supabase.db.from('users').select('id, email, created_at, updated_at').eq('id', userId).maybeSingle(); if (error) throw error; if (!user) throw new NotFoundException('User not found'); const [subscription, billingEntitlement, latestBillingSubscription, latestBillingInvoice, latestRenewalReminder, quota, recentFoodLogs, recentAiUsage, recentTelemetry] = await Promise.all([this.fetchSubscriptionForUser(userId).catch(() => ({ tier: 'free', status: 'unknown' })), this.billingService.getUserEntitlement(userId).then((entitlement) => ({ tier: entitlement.tier, source: entitlement.source, provider: entitlement.provider ?? null, active_until: entitlement.active_until ?? null })).catch(() => null), this.fetchLatestBillingSubscriptionForUser(userId).catch(() => null), this.fetchLatestBillingInvoiceForUser(userId).catch(() => null), this.billingService.getPayosRenewalReminder(userId).then((reminder: any) => this.safeRenewalReminder(reminder)).catch(() => ({ has_reminder: false })), this.aiUsageService.getQuotaRemaining(userId).catch(() => null), this.fetchRecentFoodLogs(userId).catch(() => []), this.fetchRecentAiUsage(userId).catch(() => []), this.fetchRecentTelemetry(userId).catch(() => [])]); return { generated_at: new Date().toISOString(), profile: { id: user.id, email: user.email ?? null, created_at: user.created_at ?? null, updated_at: user.updated_at ?? null }, subscription, billing_entitlement: billingEntitlement, latest_billing_subscription: latestBillingSubscription, latest_billing_invoice: latestBillingInvoice, latest_renewal_reminder: latestRenewalReminder, ai_quota: quota, recent_food_logs: recentFoodLogs, recent_ai_usage: recentAiUsage, recent_telemetry: recentTelemetry }; }
  async getSubscriptions() { const { data } = await this.supabase.db.from('user_subscriptions').select('user_id, tier, is_active, cancelled_at, created_at, updated_at').order('updated_at', { ascending: false }).limit(500); const rows = Array.isArray(data) ? data : []; const byTier: Record<string, number> = {}; const byStatus: Record<string, number> = {}; for (const row of rows) { const tier = String(row.tier ?? 'unknown'); const status = this.subscriptionStatus(row); byTier[tier] = (byTier[tier] ?? 0) + 1; byStatus[status] = (byStatus[status] ?? 0) + 1; } return { generated_at: new Date().toISOString(), total_loaded: rows.length, by_tier: byTier, by_status: byStatus, recent: rows.slice(0, 25) }; }
  async getSystemHealth() { const now = new Date(); const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); const [recentAiFailures, recentQuotaBlocks, recentErrors] = await Promise.all([this.countRowsByStatus('ai_usage_events', 'failed', since), this.countRowsByStatus('ai_usage_events', 'blocked', since), this.countRows('telemetry_events', since)]); return { generated_at: now.toISOString(), status: 'ok', window_hours: 24, recent_ai_failures: recentAiFailures, recent_quota_blocks: recentQuotaBlocks, recent_telemetry_events: recentErrors }; }
  async getPaymentIssues(params: { status?: string; provider?: string; userId?: string }) { const status = this.optionalPaymentIssueStatus(params.status); const provider = String(params.provider ?? '').trim().toLowerCase(); const userId = String(params.userId ?? '').trim(); let query: any = this.supabase.db.from('billing_payment_issues').select('id, user_id, invoice_id, subscription_id, provider, issue_type, status, user_message, admin_note, resolution, created_at, updated_at, resolved_at, resolved_by_admin_id', { count: 'exact' }); if (status) query = query.eq('status', status); if (provider) query = query.eq('provider', provider); if (userId) query = query.eq('user_id', userId); const { data, count, error } = await query.order('created_at', { ascending: false }).limit(100); if (error) throw error; const rows = Array.isArray(data) ? data : []; const [users, invoices] = await Promise.all([this.fetchUsersById(rows.map((row: any) => row.user_id)), this.fetchBillingInvoicesById(rows.map((row: any) => row.invoice_id))]); return { generated_at: new Date().toISOString(), total: count ?? rows.length, issues: rows.map((row: any) => this.safeAdminPaymentIssue(row, users, invoices)) }; }
  async updatePaymentIssue(issueId: string, actor: AdminActor, patch: { status?: string; admin_note?: string | null; resolution?: string | null }) { const id = String(issueId ?? '').trim(); if (!id) throw new BadRequestException('Payment issue id is required.'); const { data: existing, error: existingError } = await this.supabase.db.from('billing_payment_issues').select('id, user_id, invoice_id, subscription_id, provider, issue_type, status, user_message, admin_note, resolution, created_at, updated_at, resolved_at, resolved_by_admin_id').eq('id', id).maybeSingle(); if (existingError) throw existingError; if (!existing) throw new NotFoundException('Payment issue not found'); const nextStatus = patch.status === undefined ? undefined : this.requirePaymentIssueStatus(patch.status); const statusChanged = Boolean(nextStatus && nextStatus !== existing.status); const update: Record<string, any> = { updated_at: new Date().toISOString() }; if (nextStatus) update.status = nextStatus; if (patch.admin_note !== undefined) update.admin_note = this.cleanNullableText(patch.admin_note, 2000); if (patch.resolution !== undefined) update.resolution = this.cleanNullableText(patch.resolution, 2000); if (nextStatus === 'resolved' || nextStatus === 'rejected') { update.resolved_at = new Date().toISOString(); update.resolved_by_admin_id = actor?.user_id ?? null; } const { data, error } = await this.supabase.db.from('billing_payment_issues').update(update).eq('id', id).select('id, user_id, invoice_id, subscription_id, provider, issue_type, status, user_message, admin_note, resolution, created_at, updated_at, resolved_at, resolved_by_admin_id').maybeSingle(); if (error) throw error; const updated = data ?? { ...existing, ...update }; await this.writeAuditLog({ actor, action: 'billing.payment_issue.update', targetType: 'billing_payment_issue', targetId: id, reason: `Payment issue ${nextStatus ? `status set to ${nextStatus}` : 'updated'}`, metadata: { before_status: existing.status ?? null, after_status: updated.status ?? nextStatus ?? existing.status ?? null, provider: updated.provider ?? existing.provider ?? null } }); if (statusChanged && this.notificationsService && ['in_review', 'resolved', 'rejected'].includes(String(updated.status ?? ''))) await this.notificationsService.notifyPaymentIssueStatusChanged(updated); return { ok: true, issue: this.safeAdminPaymentIssue(updated, new Map(), new Map()), audited: true }; }
  private normalizeAdminUsersPlan(value: any): AdminUsersPlan | null {
    const plan = String(value ?? '').trim().toLowerCase();
    if (!plan || plan === 'all') return null;
    if (ADMIN_USERS_PLANS.includes(plan as AdminUsersPlan)) return plan as AdminUsersPlan;
    throw new BadRequestException('Invalid plan filter. Expected all, free, premium, or pro.');
  }
  private async fetchAdminUsersPlanFilter(plan: AdminUsersPlan | null): Promise<{ includeIds?: string[]; excludeIds?: string[] }> {
    if (!plan) return {};
    if (plan === 'free') {
      const { data, error } = await this.supabase.db
        .from('user_subscriptions')
        .select('user_id')
        .in('tier', ['premium', 'pro'])
        .eq('is_active', true)
        .is('cancelled_at', null)
        .limit(100000);
      if (error) throw error;
      return { excludeIds: this.uniqueIds(data, 'user_id') };
    }
    const { data, error } = await this.supabase.db
      .from('user_subscriptions')
      .select('user_id')
      .eq('tier', plan)
      .eq('is_active', true)
      .is('cancelled_at', null)
      .limit(100000);
    if (error) throw error;
    return { includeIds: this.uniqueIds(data, 'user_id') };
  }
  private uniqueIds(rows: any, column: string): string[] {
    return [...new Set((Array.isArray(rows) ? rows : []).map((row: any) => String(row?.[column] ?? '').trim()).filter(Boolean))];
  }
  private buildOverviewAlerts(input: { aiCostToday: number; quotaBlockedToday: number; failedAiRequestsToday: number; failureRateToday: number; aiRequestsToday: number }) { const alerts: Array<{ severity: 'info' | 'warning' | 'critical'; code: string; title: string; message: string; value: number; threshold: number }> = []; if (input.aiCostToday >= 20) alerts.push({ severity: 'critical', code: 'AI_COST_CRITICAL', title: 'AI spend critical', message: 'Estimated AI cost today is above $20.', value: this.roundCost(input.aiCostToday), threshold: 20 }); else if (input.aiCostToday >= 5) alerts.push({ severity: 'warning', code: 'AI_COST_WARNING', title: 'AI spend warning', message: 'Estimated AI cost today is above $5.', value: this.roundCost(input.aiCostToday), threshold: 5 }); if (input.quotaBlockedToday >= 50) alerts.push({ severity: 'critical', code: 'QUOTA_BLOCK_SPIKE', title: 'Quota blocks spike', message: 'Many AI requests were blocked by quota today.', value: input.quotaBlockedToday, threshold: 50 }); else if (input.quotaBlockedToday >= 10) alerts.push({ severity: 'warning', code: 'QUOTA_BLOCK_WARNING', title: 'Quota blocks elevated', message: 'AI quota blocks are elevated today.', value: input.quotaBlockedToday, threshold: 10 }); if (input.aiRequestsToday >= 20 && input.failureRateToday >= 0.1) alerts.push({ severity: input.failureRateToday >= 0.25 ? 'critical' : 'warning', code: 'AI_FAILURE_RATE_HIGH', title: 'AI failure rate high', message: 'AI failure rate is above 10% today.', value: Math.round(input.failureRateToday * 10000) / 100, threshold: 10 }); else if (input.failedAiRequestsToday >= 20) alerts.push({ severity: 'warning', code: 'AI_FAILURE_COUNT_HIGH', title: 'AI failures elevated', message: 'AI failure count is elevated today.', value: input.failedAiRequestsToday, threshold: 20 }); return alerts; }
  private optionalPaymentIssueStatus(value: any): PaymentIssueStatus | null { const text = String(value ?? '').trim(); if (!text) return null; return this.requirePaymentIssueStatus(text); }
  private requirePaymentIssueStatus(value: any): PaymentIssueStatus { const status = String(value ?? '').trim() as PaymentIssueStatus; if (!PAYMENT_ISSUE_STATUSES.includes(status)) throw new BadRequestException('Invalid payment issue status.'); return status; }
  private cleanNullableText(value: any, maxLength: number): string | null { const text = String(value ?? '').trim(); if (!text) return null; return text.length > maxLength ? text.slice(0, maxLength) : text; }
  private requireReason(reason: string): string { const clean = String(reason ?? '').trim(); if (clean.length < 5) throw new BadRequestException('Reason is required and must be at least 5 characters.'); return clean; }
  private async requireUser(userId: string): Promise<any> { const { data, error } = await this.supabase.db.from('users').select('id, email').eq('id', userId).maybeSingle(); if (error) throw error; if (!data) throw new NotFoundException('User not found'); return data; }
  private async writeAuditLog(input: { actor: AdminActor; action: string; targetType: string; targetId: string; reason: string; metadata?: Record<string, any> }) { const actorEmail = String(input.actor?.email ?? '').trim().toLowerCase() || 'unknown'; const { error } = await this.supabase.db.from('admin_audit_log').insert({ actor_user_id: input.actor?.user_id ?? null, actor_email: actorEmail, action: input.action, target_type: input.targetType, target_id: input.targetId, reason: input.reason, metadata: input.metadata ?? {} }); if (error) throw error; }
  private async fetchAiUsageRows(sinceIso: string): Promise<any[]> { const { data } = await this.supabase.db.from('ai_usage_events').select('status, estimated_cost_usd, credits_consumed, created_at').gte('created_at', sinceIso).limit(5000); return Array.isArray(data) ? data : []; }
  private async fetchSubscriptionsForUsers(userIds: string[]): Promise<Map<string, { tier: string; status: string }>> { const map = new Map<string, { tier: string; status: string }>(); if (userIds.length === 0) return map; const { data } = await this.supabase.db.from('user_subscriptions').select('user_id, tier, is_active, cancelled_at, created_at, updated_at').in('user_id', userIds).order('updated_at', { ascending: false }); for (const row of Array.isArray(data) ? data : []) { const userId = String(row.user_id); if (!userId || map.has(userId)) continue; map.set(userId, this.currentAccessFromSubscription(row)); } return map; }
  private async fetchSubscriptionForUser(userId: string) { const { data } = await this.supabase.db.from('user_subscriptions').select('tier, is_active, started_at, renews_at, cancelled_at, created_at, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1); const row = Array.isArray(data) ? data[0] : null; return row ? { ...row, status: this.subscriptionStatus(row) } : { tier: 'free', status: 'unknown' }; }
  private currentAccessFromSubscription(row: any): { tier: string; status: string } { if (this.isCurrentPaidSubscription(row)) return { tier: String(row.tier ?? 'free').toLowerCase(), status: 'active' }; if (row?.cancelled_at) return { tier: 'free', status: 'cancelled' }; if (row?.is_active === false) return { tier: 'free', status: 'inactive' }; return { tier: 'free', status: 'unknown' }; }
  private subscriptionStatus(row: any): string { if (row?.cancelled_at) return 'cancelled'; if (row?.is_active === false) return 'inactive'; if (row?.is_active === true) return 'active'; return 'unknown'; }
  private isCurrentPaidSubscription(row: any): boolean { const tier = String(row?.tier ?? '').toLowerCase(); return ['premium', 'pro'].includes(tier) && row?.is_active === true && !row?.cancelled_at; }
  private async fetchAiUsageForUsers(userIds: string[], sinceIso: string): Promise<Map<string, { requests: number; credits: number }>> { const map = new Map<string, { requests: number; credits: number }>(); if (userIds.length === 0) return map; const { data } = await this.supabase.db.from('ai_usage_events').select('user_id, credits_consumed').in('user_id', userIds).in('status', ['reserved', 'success', 'failed', 'fallback']).gte('created_at', sinceIso).limit(10000); for (const row of Array.isArray(data) ? data : []) { const userId = String(row.user_id); const current = map.get(userId) ?? { requests: 0, credits: 0 }; current.requests += 1; current.credits += Number(row.credits_consumed ?? 1); map.set(userId, current); } return map; }
  private async fetchFoodLogCountsForUsers(userIds: string[]): Promise<Map<string, number>> { const map = new Map<string, number>(); if (userIds.length === 0) return map; const { data } = await this.supabase.db.from('food_logs').select('user_id').in('user_id', userIds).limit(10000); for (const row of Array.isArray(data) ? data : []) map.set(String(row.user_id), (map.get(String(row.user_id)) ?? 0) + 1); return map; }
  private async fetchLastActiveForUsers(userIds: string[]): Promise<Map<string, string>> { const map = new Map<string, string>(); if (userIds.length === 0) return map; const { data } = await this.supabase.db.from('telemetry_events').select('user_id, created_at').in('user_id', userIds).order('created_at', { ascending: false }).limit(10000); for (const row of Array.isArray(data) ? data : []) { const userId = String(row.user_id); if (!map.has(userId)) map.set(userId, String(row.created_at)); } return map; }
  private async fetchUsersById(userIds: Array<string | null | undefined>): Promise<Map<string, any>> { const unique = [...new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean))]; const map = new Map<string, any>(); if (unique.length === 0) return map; const { data } = await this.supabase.db.from('users').select('id, email').in('id', unique).limit(500); for (const row of Array.isArray(data) ? data : []) map.set(String(row.id), { id: String(row.id), email: row.email ?? null }); return map; }
  private async fetchBillingInvoicesById(invoiceIds: Array<string | null | undefined>): Promise<Map<string, any>> { const unique = [...new Set(invoiceIds.map((id) => String(id ?? '').trim()).filter(Boolean))]; const map = new Map<string, any>(); if (unique.length === 0) return map; const { data } = await this.supabase.db.from('billing_invoices').select('id, provider, provider_invoice_id, tier, status, amount_vnd, paid_at, created_at').in('id', unique).limit(500); for (const row of Array.isArray(data) ? data : []) map.set(String(row.id), { id: row.id, provider: row.provider ?? null, provider_invoice_id: row.provider_invoice_id ?? null, order_code: String(row.provider ?? '').toLowerCase() === 'payos' ? row.provider_invoice_id ?? null : null, tier: row.tier ?? null, status: row.status ?? null, amount_vnd: row.amount_vnd ?? null, paid_at: row.paid_at ?? null, created_at: row.created_at ?? null }); return map; }
  private safeAdminPaymentIssue(row: any, users: Map<string, any>, invoices: Map<string, any>) { const userId = String(row?.user_id ?? ''); const invoiceId = String(row?.invoice_id ?? ''); return { id: row?.id ?? null, user_id: row?.user_id ?? null, user_email: users.get(userId)?.email ?? null, invoice_id: row?.invoice_id ?? null, subscription_id: row?.subscription_id ?? null, provider: row?.provider ?? null, issue_type: row?.issue_type ?? null, status: row?.status ?? null, user_message: row?.user_message ?? null, admin_note: row?.admin_note ?? null, resolution: row?.resolution ?? null, invoice: invoiceId ? invoices.get(invoiceId) ?? null : null, created_at: row?.created_at ?? null, updated_at: row?.updated_at ?? null, resolved_at: row?.resolved_at ?? null, resolved_by_admin_id: row?.resolved_by_admin_id ?? null }; }
  private async fetchRecentFoodLogs(userId: string): Promise<any[]> { const { data } = await this.supabase.db.from('food_logs').select('id, food_name, meal_type, calories, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10); return Array.isArray(data) ? data : []; }
  private async fetchRecentAiUsage(userId: string): Promise<any[]> { const { data } = await this.supabase.db.from('ai_usage_events').select('id, feature, status, model, provider, estimated_cost_usd, credits_consumed, created_at, completed_at, error_category').eq('user_id', userId).order('created_at', { ascending: false }).limit(20); return Array.isArray(data) ? data : []; }
  private async fetchRecentTelemetry(userId: string): Promise<any[]> { const { data } = await this.supabase.db.from('telemetry_events').select('id, event_type, event_name, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20); return Array.isArray(data) ? data : []; }
  private async fetchLatestBillingSubscriptionForUser(userId: string): Promise<any | null> { const { data } = await this.supabase.db.from('billing_subscriptions').select('provider, tier, status, is_paid, billing_period_start, billing_period_end, cancelled_at, updated_at, created_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1); const row = Array.isArray(data) ? data[0] : null; if (!row) return null; return { provider: row.provider ?? null, tier: row.tier ?? null, status: row.status ?? null, is_paid: row.is_paid === true, billing_period_start: row.billing_period_start ?? null, billing_period_end: row.billing_period_end ?? null, cancelled_at: row.cancelled_at ?? null }; }
  private async fetchLatestBillingInvoiceForUser(userId: string): Promise<any | null> { const { data } = await this.supabase.db.from('billing_invoices').select('provider, provider_invoice_id, tier, status, amount_vnd, paid_at, created_at, metadata').eq('user_id', userId).order('created_at', { ascending: false }).limit(1); const row = Array.isArray(data) ? data[0] : null; if (!row) return null; const providerInvoiceId = row.provider_invoice_id ? String(row.provider_invoice_id) : null; return { provider: row.provider ?? null, provider_invoice_id: providerInvoiceId, order_code: String(row.provider ?? '').toLowerCase() === 'payos' ? providerInvoiceId : null, tier: row.tier ?? null, interval: this.safeInvoiceInterval(row.metadata), status: row.status ?? null, amount_vnd: row.amount_vnd ?? null, paid_at: row.paid_at ?? null, created_at: row.created_at ?? null }; }
  private safeInvoiceInterval(metadata: any): string | null { const interval = String(metadata?.interval ?? '').toLowerCase(); return ['monthly', 'annual'].includes(interval) ? interval : null; }
  private safeRenewalReminder(reminder: any) { if (!reminder?.has_reminder) return { has_reminder: false }; return { has_reminder: true, reminder_window: reminder.reminder_window ?? null, days_remaining: Number.isFinite(Number(reminder.days_remaining)) ? Number(reminder.days_remaining) : null, message: reminder.message ?? null }; }
  private async countRows(table: string, sinceIso: string): Promise<number> { const result = (await this.supabase.db.from(table).select('id', { count: 'exact', head: true }).gte('created_at', sinceIso)) as SupabaseCountResult; return result?.count ?? 0; }
  private async countRowsByStatus(table: string, status: string, sinceIso: string): Promise<number> { const result = (await this.supabase.db.from(table).select('id', { count: 'exact', head: true }).eq('status', status).gte('created_at', sinceIso)) as SupabaseCountResult; return result?.count ?? 0; }
  private async countDistinct(table: string, column: string, sinceIso: string): Promise<number> { const { data } = await this.supabase.db.from(table).select(column).gte('created_at', sinceIso).limit(10000); if (!Array.isArray(data)) return 0; return new Set(data.map((row: any) => row?.[column]).filter(Boolean)).size; }
  private roundCost(value: number): number { return Math.round(value * 1000000) / 1000000; }
}
