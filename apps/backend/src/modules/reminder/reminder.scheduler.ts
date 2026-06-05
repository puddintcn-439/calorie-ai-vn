import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ReminderService } from './reminder.service';

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private readonly maxPushesPerTokenPerDay = Number(process.env.REMINDER_MAX_PUSHES_PER_TOKEN_PER_DAY ?? 4);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly reminderService: ReminderService,
  ) {}

  /**
   * Run every minute and dispatch meal reminders in each device's local timezone.
   * The notification log prevents duplicate sends when jobs overlap or retry.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchDueReminders() {
    try {
      const now = new Date();
      const { data: prefs, error } = await this.supabase.db
        .from('reminder_preferences')
        .select('user_id, breakfast_reminder_enabled, breakfast_reminder_time, lunch_reminder_enabled, lunch_reminder_time, dinner_reminder_enabled, dinner_reminder_time, snack_reminder_enabled, snack_reminder_time, allow_push_notifications, nudge_motivation_style')
        .eq('allow_push_notifications', true);

      if (error || !prefs || prefs.length === 0) return;

      const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
      let dispatchCount = 0;

      for (const pref of prefs) {
        try {
          const { data: tokens } = await this.supabase.db
            .from('push_notification_tokens')
            .select('token, timezone_offset_minutes, active')
            .eq('user_id', pref.user_id)
            .eq('active', true);

          if (!tokens || tokens.length === 0) continue;

          for (const token of tokens) {
            const local = this.toTokenLocalDate(now, token.timezone_offset_minutes);
            const localTime = this.formatLocalTime(local);
            const localDate = local.toISOString().slice(0, 10);

            const dueMeals = mealTypes.filter((meal) =>
              pref[`${meal}_reminder_enabled`] && pref[`${meal}_reminder_time`] === localTime,
            );

            if (dueMeals.length === 0) continue;

            const messages = [];
            for (const meal of dueMeals) {
              if (!(await this.canSendReminder(pref.user_id, token.token, meal, localDate))) continue;
              const reminderLogId = await this.recordReminderSent(pref.user_id, token.token, meal, localDate);
              if (!reminderLogId) continue;

              const nudge = await this.reminderService.generateMealReminder(pref.user_id, meal, pref);
              messages.push({
                to: token.token,
                title: nudge.title,
                body: nudge.body,
                data: { mealType: nudge.mealType, type: nudge.type, route: '/scan', reminderLogId },
                sound: 'default',
              });
            }

            if (messages.length === 0) continue;

            await this.sendExpoPushMessages(messages);
            dispatchCount += messages.length;
          }
        } catch (err) {
          this.logger.error(`Failed to dispatch reminder for user ${pref.user_id}:`, err);
        }
      }

      if (dispatchCount > 0) {
        this.logger.log(`Dispatched ${dispatchCount} reminder push message(s)`);
      }
    } catch (err) {
      this.logger.warn('dispatchDueReminders failed (non-fatal):', err);
    }
  }

  private toTokenLocalDate(now: Date, timezoneOffsetMinutes?: number | null): Date {
    const offset = Number.isFinite(Number(timezoneOffsetMinutes)) ? Number(timezoneOffsetMinutes) : now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000);
  }

  private formatLocalTime(localDate: Date): string {
    return `${String(localDate.getUTCHours()).padStart(2, '0')}:${String(localDate.getUTCMinutes()).padStart(2, '0')}`;
  }

  private isMissingLogTableError(error: any): boolean {
    const message = String(error?.message ?? error?.details ?? '');
    return message.includes('public.reminder_notification_log') && message.includes('schema cache');
  }

  private async canSendReminder(userId: string, token: string, mealType: string, localDate: string): Promise<boolean> {
    const { data: sameMeal, error: sameMealError } = await this.supabase.db
      .from('reminder_notification_log')
      .select('id')
      .eq('user_id', userId)
      .eq('token', token)
      .eq('meal_type', mealType)
      .eq('local_date', localDate)
      .limit(1);

    if (sameMealError) {
      if (this.isMissingLogTableError(sameMealError)) {
        this.logger.warn('reminder_notification_log missing; skipping push to avoid duplicate spam');
        return false;
      }
      throw sameMealError;
    }

    if ((sameMeal ?? []).length > 0) return false;

    const { data: dayLog, error: dayLogError } = await this.supabase.db
      .from('reminder_notification_log')
      .select('id')
      .eq('user_id', userId)
      .eq('token', token)
      .eq('local_date', localDate);

    if (dayLogError) throw dayLogError;
    return (dayLog ?? []).length < this.maxPushesPerTokenPerDay;
  }

  private async recordReminderSent(userId: string, token: string, mealType: string, localDate: string): Promise<string | null> {
    const { data, error } = await this.supabase.db
      .from('reminder_notification_log')
      .insert({
        user_id: userId,
        token,
        meal_type: mealType,
        local_date: localDate,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (!error) return data?.id ?? null;
    if (this.isMissingLogTableError(error)) return null;

    const message = String(error?.message ?? error?.details ?? '');
    if (error?.code === '23505' || message.toLowerCase().includes('duplicate')) {
      return null;
    }

    throw error;
  }

  private async sendExpoPushMessages(messages: object[]) {
    // Expo Push API allows up to 100 messages per request
    const chunks = [];
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        this.logger.warn(`Expo push API returned ${response.status}`);
      }
    }
  }
}
