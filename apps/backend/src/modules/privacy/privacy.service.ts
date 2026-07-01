import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

type ExportSource = {
  key: string;
  table: string;
  ownerColumn: 'id' | 'user_id';
  select?: string;
};

const EXPORT_SOURCES: ExportSource[] = [
  { key: 'profile', table: 'users', ownerColumn: 'id' },
  { key: 'food_logs', table: 'food_logs', ownerColumn: 'user_id' },
  { key: 'activity_logs', table: 'activity_logs', ownerColumn: 'user_id' },
  { key: 'saved_meals', table: 'saved_meals', ownerColumn: 'user_id' },
  { key: 'body_progress', table: 'body_progress', ownerColumn: 'user_id' },
  { key: 'corrections', table: 'correction_events', ownerColumn: 'user_id' },
  { key: 'reminder_preferences', table: 'reminder_preferences', ownerColumn: 'user_id' },
  { key: 'reminder_history', table: 'reminder_notification_log', ownerColumn: 'user_id' },
  { key: 'roadmap', table: 'user_daily_roadmap', ownerColumn: 'user_id' },
  { key: 'activity_preferences', table: 'user_activity_preferences', ownerColumn: 'user_id' },
  { key: 'behavior_patterns', table: 'user_behavioral_patterns', ownerColumn: 'user_id' },
  { key: 'coaching_insights', table: 'user_coaching_insights', ownerColumn: 'user_id' },
  { key: 'coaching_summaries', table: 'user_coaching_summaries', ownerColumn: 'user_id' },
  { key: 'intervention_events', table: 'user_intervention_events', ownerColumn: 'user_id' },
  { key: 'subscription', table: 'user_subscriptions', ownerColumn: 'user_id' },
  {
    key: 'billing_subscriptions',
    table: 'billing_subscriptions',
    ownerColumn: 'user_id',
    select: 'provider,tier,status,is_paid,billing_period_start,billing_period_end,cancelled_at,created_at,updated_at',
  },
  {
    key: 'billing_invoices',
    table: 'billing_invoices',
    ownerColumn: 'user_id',
    select: 'provider,provider_invoice_id,tier,status,amount_original,currency_original,amount_vnd,amount_usd,paid_at,created_at,updated_at',
  },
  {
    key: 'billing_refunds',
    table: 'billing_refunds',
    ownerColumn: 'user_id',
    select: 'provider,provider_refund_id,amount_original,currency_original,amount_vnd,amount_usd,status,reason,refunded_at,created_at',
  },
  {
    key: 'payment_support',
    table: 'billing_payment_issues',
    ownerColumn: 'user_id',
    select: 'issue_type,status,user_message,resolution_note,created_at,updated_at,resolved_at',
  },
  { key: 'notifications', table: 'user_notifications', ownerColumn: 'user_id' },
  {
    key: 'ai_usage',
    table: 'ai_usage_events',
    ownerColumn: 'user_id',
    select: 'feature,status,model,provider,credits_consumed,estimated_cost_usd,error_category,created_at,completed_at',
  },
  { key: 'logging_events', table: 'logging_events', ownerColumn: 'user_id' },
  { key: 'context_events', table: 'user_context_events', ownerColumn: 'user_id' },
  { key: 'forecast_snapshots', table: 'behavior_forecast_snapshots', ownerColumn: 'user_id' },
  { key: 'nutrition_target_history', table: 'daily_nutrition_target_history', ownerColumn: 'user_id' },
  { key: 'clinical_target_audit', table: 'clinical_nutrition_target_audit', ownerColumn: 'user_id' },
];

@Injectable()
export class PrivacyService {
  constructor(private readonly supabase: SupabaseService) {}

  async exportUserData(userId: string, email: string) {
    const data: Record<string, unknown[]> = {};
    const unavailable: string[] = [];

    await Promise.all(EXPORT_SOURCES.map(async (source) => {
      try {
        const { data: rows, error } = await this.supabase.db
          .from(source.table)
          .select(source.select ?? '*')
          .eq(source.ownerColumn, userId)
          .limit(10000);
        if (error) {
          unavailable.push(source.key);
          return;
        }
        data[source.key] = Array.isArray(rows) ? rows : rows ? [rows] : [];
      } catch {
        unavailable.push(source.key);
      }
    }));

    return {
      format: 'calorie-ai-personal-data',
      version: 1,
      generated_at: new Date().toISOString(),
      account: { id: userId, email },
      data,
      ...(unavailable.length > 0 ? { unavailable_sections: unavailable.sort() } : {}),
    };
  }

  async deleteAccount(userId: string, email: string, password: string) {
    const authClient: any = this.supabase.createAuthClient();
    const adminClient: any = this.supabase.db;
    if (
      typeof authClient?.auth?.signInWithPassword !== 'function' ||
      typeof adminClient?.auth?.admin?.deleteUser !== 'function'
    ) {
      throw new ServiceUnavailableException('Account deletion is unavailable because authentication is not configured.');
    }

    const { error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      throw new UnauthorizedException('Mật khẩu không đúng.');
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new ServiceUnavailableException('Không thể xóa tài khoản lúc này. Vui lòng thử lại.');
    }

    return {
      ok: true,
      deleted_at: new Date().toISOString(),
    };
  }
}
