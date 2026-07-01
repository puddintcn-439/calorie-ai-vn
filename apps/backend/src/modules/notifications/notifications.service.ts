import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/supabase/supabase.service';

type NotificationChannelStatus = 'delivered' | 'skipped' | 'failed';
type PaymentIssueStatus = 'open' | 'in_review' | 'resolved' | 'rejected';

type NotifyUserPayload = {
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, any>;
};

type DeliveryResult = {
  status: NotificationChannelStatus;
  reason?: string;
  count?: number;
};

const PAYMENT_ISSUE_COPY: Record<
  'created' | Extract<PaymentIssueStatus, 'in_review' | 'resolved' | 'rejected'>,
  { title: string; body: string }
> = {
  created: {
    title: 'Đã ghi nhận yêu cầu hỗ trợ thanh toán',
    body: 'Yêu cầu của bạn đã được ghi nhận. Admin sẽ kiểm tra và phản hồi sớm.',
  },
  in_review: {
    title: 'Yêu cầu thanh toán đang được kiểm tra',
    body: 'Admin đang kiểm tra yêu cầu của bạn. Bạn sẽ nhận được cập nhật khi có kết quả.',
  },
  resolved: {
    title: 'Yêu cầu thanh toán đã được xử lý',
    body: 'Yêu cầu của bạn đã được xử lý.',
  },
  rejected: {
    title: 'Yêu cầu thanh toán không được chấp nhận',
    body: 'Yêu cầu của bạn đã được kiểm tra nhưng không đủ điều kiện xử lý.',
  },
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async notifyPaymentIssueCreated(issue: Record<string, any>) {
    const copy = PAYMENT_ISSUE_COPY.created;
    return this.notifyUser(String(issue.user_id ?? ''), {
      type: 'billing.payment_issue.created',
      title: copy.title,
      body: copy.body,
      metadata: this.paymentIssueMetadata(issue, 'open'),
    });
  }

  async notifyPaymentIssueStatusChanged(issue: Record<string, any>) {
    const status = String(issue.status ?? '') as PaymentIssueStatus;
    if (!['in_review', 'resolved', 'rejected'].includes(status)) return null;

    const copy = PAYMENT_ISSUE_COPY[status as 'in_review' | 'resolved' | 'rejected'];
    const resolution = this.cleanUserFacingText(issue.resolution, 1000);
    const body = ['resolved', 'rejected'].includes(status) && resolution ? resolution : copy.body;

    return this.notifyUser(String(issue.user_id ?? ''), {
      type: `billing.payment_issue.${status}`,
      title: copy.title,
      body,
      metadata: this.paymentIssueMetadata(issue, status),
    });
  }

  async notifyUser(userId: string, payload: NotifyUserPayload) {
    const normalizedUserId = String(userId ?? '').trim();
    if (!normalizedUserId) {
      throw new Error('Notification user id is required.');
    }

    const initialChannelStatus = {
      in_app: { status: 'delivered' },
      push: { status: 'skipped', reason: 'not_attempted' },
      email: { status: 'skipped', reason: 'not_attempted' },
    };

    const { data: notification, error } = await this.supabase.db
      .from('user_notifications')
      .insert({
        user_id: normalizedUserId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        metadata: this.safeMetadata(payload.metadata),
        channel_status: initialChannelStatus,
      })
      .select('id, user_id, type, title, body, metadata, read_at, created_at')
      .maybeSingle();
    if (error) throw error;

    const channelStatus = {
      in_app: { status: 'delivered' },
      push: await this.trySendPush(normalizedUserId, payload, notification?.id ?? null),
      email: await this.trySendEmail(normalizedUserId, payload),
    };

    if (notification?.id) {
      const { error: updateError } = await this.supabase.db
        .from('user_notifications')
        .update({ channel_status: channelStatus })
        .eq('id', notification.id);
      if (updateError) {
        console.warn('[Notifications] Failed to update delivery status:', this.safeErrorMessage(updateError));
      }
    }

    return this.safeUserNotification(notification);
  }

  async listUserNotifications(userId: string) {
    const { data, error } = await this.supabase.db
      .from('user_notifications')
      .select('id, type, title, body, metadata, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const notifications = (Array.isArray(data) ? data : []).map((row) => this.safeUserNotification(row));
    return {
      notifications,
      unread_count: notifications.filter((notification) => !notification.read_at).length,
    };
  }

  async markAllUserNotificationsRead(userId: string) {
    const readAt = new Date().toISOString();
    const { error } = await this.supabase.db
      .from('user_notifications')
      .update({ read_at: readAt })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw error;
    return { ok: true, read_at: readAt };
  }

  async markUserNotificationRead(userId: string, notificationId: string) {
    const { data: existing, error: existingError } = await this.supabase.db
      .from('user_notifications')
      .select('id, user_id')
      .eq('id', notificationId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing || String(existing.user_id ?? '') !== userId) return null;

    const { data, error } = await this.supabase.db
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select('id, type, title, body, metadata, read_at, created_at')
      .maybeSingle();
    if (error) throw error;

    return this.safeUserNotification(data);
  }

  private async trySendPush(userId: string, payload: NotifyUserPayload, notificationId: string | null): Promise<DeliveryResult> {
    try {
      const { data: tokens, error } = await this.supabase.db
        .from('push_notification_tokens')
        .select('token')
        .eq('user_id', userId)
        .eq('active', true);
      if (error) return { status: 'skipped', reason: 'push_token_lookup_failed' };

      const tokenList = (Array.isArray(tokens) ? tokens : []).map((row) => String(row.token ?? '')).filter(Boolean);
      if (tokenList.length === 0) return { status: 'skipped', reason: 'no_active_push_token' };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tokenList.map((token) => ({
          to: token,
          title: payload.title,
          body: payload.body,
          data: {
            ...(payload.metadata ?? {}),
            notification_id: notificationId,
            route: '/notifications',
          },
          sound: 'default',
        }))),
      });
      if (!response.ok) return { status: 'failed', reason: `expo_status_${response.status}` };

      const json: any = await response.json().catch(() => null);
      const tickets = Array.isArray(json?.data) ? json.data : [];
      const delivered = tickets.filter((ticket: any) => ticket?.status === 'ok').length;
      return delivered > 0
        ? { status: 'delivered', count: delivered }
        : { status: 'failed', reason: 'expo_no_success_ticket' };
    } catch (error) {
      console.warn('[Notifications] Push delivery failed:', this.safeErrorMessage(error));
      return { status: 'failed', reason: 'push_delivery_failed' };
    }
  }

  private async trySendEmail(userId: string, payload: NotifyUserPayload): Promise<DeliveryResult> {
    const provider = String(this.config.get<string>('EMAIL_PROVIDER') ?? 'none').trim().toLowerCase();
    if (!provider || provider === 'none') return { status: 'skipped', reason: 'email_provider_disabled' };

    const recipient = await this.findUserEmail(userId);
    if (!recipient) return { status: 'skipped', reason: 'missing_user_email' };

    if (provider === 'resend') {
      return this.trySendResendEmail(recipient, payload);
    }

    if (provider === 'smtp') {
      return { status: 'skipped', reason: 'smtp_adapter_not_configured' };
    }

    return { status: 'skipped', reason: 'unsupported_email_provider' };
  }

  private async trySendResendEmail(to: string, payload: NotifyUserPayload): Promise<DeliveryResult> {
    const apiKey = String(this.config.get<string>('RESEND_API_KEY') ?? '').trim();
    const from = String(this.config.get<string>('EMAIL_FROM') ?? '').trim();
    if (!apiKey || !from) return { status: 'skipped', reason: 'resend_env_missing' };

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          subject: payload.title,
          text: payload.body,
        }),
      });
      return response.ok ? { status: 'delivered' } : { status: 'failed', reason: `resend_status_${response.status}` };
    } catch (error) {
      console.warn('[Notifications] Email delivery failed:', this.safeErrorMessage(error));
      return { status: 'failed', reason: 'email_delivery_failed' };
    }
  }

  private async findUserEmail(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase.db
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    const email = String(data?.email ?? '').trim();
    return email || null;
  }

  private paymentIssueMetadata(issue: Record<string, any>, status: string) {
    return {
      payment_issue_id: issue.id ?? null,
      issue_type: issue.issue_type ?? null,
      status,
      provider: issue.provider ?? null,
      invoice_id: issue.invoice_id ?? null,
    };
  }

  private safeMetadata(metadata: any) {
    const source = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
    const forbidden = new Set(['admin_note', 'raw_payload', 'checksum', 'api_key', 'secret', 'token']);
    return Object.fromEntries(Object.entries(source).filter(([key]) => !forbidden.has(key.toLowerCase())));
  }

  private cleanUserFacingText(value: any, maxLength: number): string | null {
    const text = String(value ?? '').trim();
    if (!text) return null;
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }

  private safeUserNotification(row: any) {
    return {
      id: row?.id ?? null,
      type: row?.type ?? null,
      title: row?.title ?? null,
      body: row?.body ?? null,
      metadata: this.safeMetadata(row?.metadata),
      read_at: row?.read_at ?? null,
      created_at: row?.created_at ?? null,
    };
  }

  private safeErrorMessage(error: any): string {
    const message = String(error?.message ?? error?.code ?? 'notification_error');
    return message.replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted]').replace(/(key|secret|token)=([^&\s]+)/gi, '$1=[redacted]');
  }
}
