import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ReminderService } from './reminder.service';

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly reminderService: ReminderService,
  ) {}

  /**
   * Run every minute, check all users whose reminder time matches now,
   * generate the nudge and send via Expo Push API.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchDueReminders() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Get all users with push notifications enabled whose any reminder fires now
    const { data: prefs, error } = await this.supabase.db
      .from('reminder_preferences')
      .select('user_id, breakfast_reminder_enabled, breakfast_reminder_time, lunch_reminder_enabled, lunch_reminder_time, dinner_reminder_enabled, dinner_reminder_time, snack_reminder_enabled, snack_reminder_time, allow_push_notifications')
      .eq('allow_push_notifications', true);

    if (error || !prefs || prefs.length === 0) return;

    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

    const dueUsers = prefs.filter((p) =>
      mealTypes.some(
        (meal) => p[`${meal}_reminder_enabled`] && p[`${meal}_reminder_time`] === currentTime,
      ),
    );

    if (dueUsers.length === 0) return;

    this.logger.log(`Dispatching reminders for ${dueUsers.length} user(s) at ${currentTime}`);

    for (const pref of dueUsers) {
      try {
        const nudges = await this.reminderService.generateDueReminders(pref.user_id);
        if (nudges.length === 0) continue;

        // Fetch user's push tokens
        const { data: tokens } = await this.supabase.db
          .from('push_notification_tokens')
          .select('token')
          .eq('user_id', pref.user_id);

        if (!tokens || tokens.length === 0) continue;

        // Send via Expo Push API
        const messages = nudges.flatMap((nudge) =>
          tokens.map((t) => ({
            to: t.token,
            title: nudge.title,
            body: nudge.body,
            data: { mealType: nudge.mealType, type: nudge.type },
            sound: 'default',
          })),
        );

        await this.sendExpoPushMessages(messages);
      } catch (err) {
        this.logger.error(`Failed to dispatch reminder for user ${pref.user_id}:`, err);
      }
    }
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
