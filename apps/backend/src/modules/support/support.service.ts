import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';

export type SupportCategory =
  | 'account'
  | 'technical'
  | 'ai_result'
  | 'health_data'
  | 'billing'
  | 'feedback'
  | 'other';

@Injectable()
export class SupportService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  async createRequest(input: {
    userId: string;
    category: SupportCategory;
    subject: string;
    message: string;
    appVersion?: string;
    platform?: string;
  }) {
    const { data, error } = await this.supabase.db
      .from('support_requests')
      .insert({
        user_id: input.userId,
        category: input.category,
        subject: input.subject.trim(),
        message: input.message.trim(),
        app_version: input.appVersion?.trim() || null,
        platform: input.platform?.trim() || null,
        status: 'open',
      })
      .select('id,category,subject,message,status,app_version,platform,admin_reply,resolved_at,created_at,updated_at')
      .maybeSingle();

    if (error || !data) {
      throw new ServiceUnavailableException('Không thể gửi yêu cầu hỗ trợ lúc này.');
    }
    return data;
  }

  async listRequests(userId: string) {
    const { data, error } = await this.supabase.db
      .from('support_requests')
      .select('id,category,subject,message,status,app_version,platform,admin_reply,resolved_at,created_at,updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new ServiceUnavailableException('Không thể tải lịch sử hỗ trợ lúc này.');
    }
    return { requests: Array.isArray(data) ? data : [] };
  }

  async listAdminRequests(params: {
    status?: string;
    category?: string;
    search?: string;
  }) {
    let query: any = this.supabase.db
      .from('support_requests')
      .select('id,user_id,category,subject,message,status,app_version,platform,admin_reply,resolved_at,created_at,updated_at,users(email)')
      .order('created_at', { ascending: false });

    if (params.status) query = query.eq('status', params.status);
    if (params.category) query = query.eq('category', params.category);
    if (params.search) query = query.ilike('subject', `%${params.search.trim()}%`);

    const { data, error } = await query.limit(200);
    if (error) {
      throw new ServiceUnavailableException('Không thể tải hàng đợi hỗ trợ.');
    }

    const requests = (Array.isArray(data) ? data : []).map((row: any) => ({
      ...row,
      user_email: Array.isArray(row.users) ? row.users[0]?.email ?? null : row.users?.email ?? null,
      users: undefined,
    }));
    return {
      generated_at: new Date().toISOString(),
      total: requests.length,
      requests,
    };
  }

  async updateAdminRequest(input: {
    requestId: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    adminReply?: string;
    actor: { email?: string | null; user_id?: string | null; role?: string | null };
  }) {
    const { data: existing, error: findError } = await this.supabase.db
      .from('support_requests')
      .select('id,user_id,status,subject,admin_reply')
      .eq('id', input.requestId)
      .maybeSingle();
    if (findError || !existing) {
      throw new ServiceUnavailableException('Không tìm thấy yêu cầu hỗ trợ.');
    }

    const now = new Date().toISOString();
    const adminReply = input.adminReply?.trim() || null;
    const { data, error } = await this.supabase.db
      .from('support_requests')
      .update({
        status: input.status,
        admin_reply: adminReply,
        resolved_at: ['resolved', 'closed'].includes(input.status) ? now : null,
        updated_at: now,
      })
      .eq('id', input.requestId)
      .select('id,user_id,category,subject,message,status,app_version,platform,admin_reply,resolved_at,created_at,updated_at')
      .maybeSingle();
    if (error || !data) {
      throw new ServiceUnavailableException('Không thể cập nhật yêu cầu hỗ trợ.');
    }

    await this.supabase.db.from('admin_audit_log').insert({
      actor_user_id: input.actor.user_id ?? null,
      actor_email: input.actor.email ?? 'unknown',
      action: 'update_support_request',
      target_type: 'support_request',
      target_id: input.requestId,
      reason: adminReply,
      metadata: {
        previous_status: existing.status,
        status: input.status,
        has_user_reply: Boolean(adminReply),
        actor_role: input.actor.role ?? null,
      },
    });

    let notification: unknown = null;
    try {
      const statusCopy: Record<string, string> = {
        open: 'Yêu cầu hỗ trợ đã được tiếp nhận.',
        in_progress: 'Đội ngũ hỗ trợ đang xử lý yêu cầu của bạn.',
        resolved: 'Yêu cầu hỗ trợ đã được giải quyết.',
        closed: 'Yêu cầu hỗ trợ đã được đóng.',
      };
      notification = await this.notifications.notifyUser(String(data.user_id), {
        type: `support.request.${input.status}`,
        title: `Cập nhật hỗ trợ: ${data.subject}`,
        body: adminReply || statusCopy[input.status],
        metadata: {
          support_request_id: data.id,
          status: input.status,
          route: '/help',
        },
      });
    } catch {
      notification = { delivered: false };
    }

    return { ok: true, request: data, notification };
  }
}
