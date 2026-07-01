import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

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
  constructor(private readonly supabase: SupabaseService) {}

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
}
