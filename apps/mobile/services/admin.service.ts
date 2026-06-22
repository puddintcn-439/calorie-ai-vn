import { apiClient } from './api';

export type AdminOverview = {
  generated_at: string;
  active_users_today: number;
  active_users_7d: number;
  new_users_today: number;
  new_users_7d: number;
  food_logs_today: number;
  ai_requests_today: number;
  estimated_ai_cost_today_usd: number;
  ai_credits_used_today: number;
  quota_blocked_today: number;
  failed_ai_requests_today: number;
};

export type AdminUserRow = {
  id: string;
  email: string | null;
  plan_tier: string;
  subscription_status: string;
  created_at: string | null;
  last_active_at: string | null;
  total_ai_requests_month: number;
  credits_used_month: number;
  food_logs_count: number;
};

export type AdminUsersResponse = {
  generated_at: string;
  page: number;
  page_size: number;
  total: number;
  users: AdminUserRow[];
};

export type AdminUserDetail = {
  generated_at: string;
  profile: Record<string, any>;
  subscription: Record<string, any>;
  billing_entitlement?: Record<string, any> | null;
  latest_billing_subscription?: Record<string, any> | null;
  latest_billing_invoice?: Record<string, any> | null;
  latest_renewal_reminder?: Record<string, any> | null;
  ai_quota: Record<string, any> | null;
  recent_food_logs: any[];
  recent_ai_usage: any[];
  recent_telemetry: any[];
};

export type AdminAuditLogEntry = {
  id: string;
  actor_user_id: string | null;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  metadata: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type AdminAuditLogResponse = {
  generated_at: string;
  page: number;
  page_size: number;
  total: number;
  entries: AdminAuditLogEntry[];
};

export type AdminPremiumActionResponse = {
  ok: boolean;
  action: 'grant_premium' | 'revoke_premium';
  user_id: string;
  user_email: string | null;
  subscription: Record<string, any> | null;
  audited: boolean;
};

export type AdminResetAiQuotaResponse = {
  ok: boolean;
  action: 'reset_ai_quota';
  user_id: string;
  user_email: string | null;
  scope: 'daily' | 'monthly';
  credits_delta: number;
  expires_at: string;
  adjustment: Record<string, any> | null;
  audited: boolean;
};

export type AdminRevenueResponse = {
  generated_at: string;
  default_currency: 'VND' | 'USD';
  display_currencies: Array<'VND' | 'USD'>;
  ai_cost_source_currency: 'USD';
  usd_to_vnd_rate: number;
  pricing: Record<string, any>;
  subscriptions: Record<string, any>;
  revenue: Record<string, any>;
  ai_cost: Record<string, any>;
  margin: Record<string, any>;
  conversion: Record<string, any>;
  confirmed_revenue?: Record<string, any>;
};

export type AdminPaymentIssue = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  invoice_id: string | null;
  subscription_id: string | null;
  provider: string | null;
  issue_type: string | null;
  status: 'open' | 'in_review' | 'resolved' | 'rejected' | string;
  user_message: string | null;
  admin_note: string | null;
  resolution: string | null;
  invoice: Record<string, any> | null;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
  resolved_by_admin_id: string | null;
};

export type AdminPaymentIssuesResponse = {
  generated_at: string;
  total: number;
  issues: AdminPaymentIssue[];
};

export const adminService = {
  async fetchOverview(): Promise<AdminOverview> {
    const { data } = await apiClient.get('/admin/overview');
    return data;
  },

  async fetchUsers(params: { search?: string; plan?: string; page?: number; pageSize?: number } = {}): Promise<AdminUsersResponse> {
    const { data } = await apiClient.get('/admin/users', { params });
    return data;
  },

  async fetchUserDetail(userId: string): Promise<AdminUserDetail> {
    const { data } = await apiClient.get(`/admin/users/${encodeURIComponent(userId)}`);
    return data;
  },

  async grantPremium(userId: string, reason: string, tier: 'premium' | 'pro' = 'premium'): Promise<AdminPremiumActionResponse> {
    const { data } = await apiClient.post(`/admin/users/${encodeURIComponent(userId)}/grant-premium`, { reason, tier });
    return data;
  },

  async revokePremium(userId: string, reason: string): Promise<AdminPremiumActionResponse> {
    const { data } = await apiClient.post(`/admin/users/${encodeURIComponent(userId)}/revoke-premium`, { reason });
    return data;
  },

  async setTier(userId: string, reason: string, tier: 'free' | 'premium' | 'pro'): Promise<AdminPremiumActionResponse> {
    const { data } = await apiClient.post(`/admin/users/${encodeURIComponent(userId)}/set-tier`, { reason, tier });
    return data;
  },

  async resetAiQuota(userId: string, reason: string, scope: 'daily' | 'monthly' = 'daily'): Promise<AdminResetAiQuotaResponse> {
    const { data } = await apiClient.post(`/admin/users/${encodeURIComponent(userId)}/reset-ai-quota`, { reason, scope });
    return data;
  },

  async fetchRevenue(): Promise<AdminRevenueResponse> {
    const { data } = await apiClient.get('/admin/revenue');
    return data;
  },

  async fetchAiUsage(days = 30): Promise<any> {
    const { data } = await apiClient.get('/admin/ai-usage', { params: { days } });
    return data;
  },

  async fetchAuditLog(params: { actorEmail?: string; action?: string; targetType?: string; targetId?: string; page?: number; pageSize?: number } = {}): Promise<AdminAuditLogResponse> {
    const { data } = await apiClient.get('/admin/audit-log', { params });
    return data;
  },

  async fetchPaymentIssues(params: { status?: string; provider?: string; userId?: string } = {}): Promise<AdminPaymentIssuesResponse> {
    const { data } = await apiClient.get('/admin/payment-issues', { params });
    return data;
  },

  async updatePaymentIssue(issueId: string, patch: { status?: 'open' | 'in_review' | 'resolved' | 'rejected'; admin_note?: string; resolution?: string }): Promise<{ ok: boolean; issue: AdminPaymentIssue; audited: boolean }> {
    const { data } = await apiClient.patch(`/admin/payment-issues/${encodeURIComponent(issueId)}`, patch);
    return data;
  },

  async fetchSubscriptions(): Promise<any> {
    const { data } = await apiClient.get('/admin/subscriptions');
    return data;
  },

  async fetchSystemHealth(): Promise<any> {
    const { data } = await apiClient.get('/admin/system-health');
    return data;
  },
};
