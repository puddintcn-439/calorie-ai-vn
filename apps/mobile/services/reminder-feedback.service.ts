import { ReminderFeedbackEventDto } from '@calorie-ai/types';
import { apiClient } from './api';
import { authStorage } from './auth-storage';
import { appLogger } from './logger.service';

type PendingReminderContext = {
  reminder_log_id: string;
  meal_type?: ReminderFeedbackEventDto['meal_type'];
  route?: string;
  opened_at: string;
};

const PENDING_REMINDER_KEY = 'pending_reminder_feedback';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function extractPendingContext(data: Record<string, unknown>): PendingReminderContext | null {
  const reminderLogId = asString(data.reminderLogId) ?? asString(data.reminder_log_id);
  if (!reminderLogId) return null;

  const mealType = asString(data.mealType) ?? asString(data.meal_type);
  const route = asString(data.route);

  return {
    reminder_log_id: reminderLogId,
    meal_type: ['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType ?? '')
      ? mealType as PendingReminderContext['meal_type']
      : undefined,
    route,
    opened_at: new Date().toISOString(),
  };
}

class ReminderFeedbackService {
  async recordOpenedFromNotificationData(data: Record<string, unknown>): Promise<PendingReminderContext | null> {
    const context = extractPendingContext(data);
    if (!context) return null;

    try {
      await apiClient.post('/reminders/events', {
        event: 'opened',
        reminder_log_id: context.reminder_log_id,
        meal_type: context.meal_type,
      } satisfies ReminderFeedbackEventDto);
      await authStorage.setItemAsync(PENDING_REMINDER_KEY, JSON.stringify(context));
    } catch (error) {
      appLogger.warn('ReminderFeedback', 'Failed to record reminder open', error);
    }

    return context;
  }

  async recordActed(actionType: ReminderFeedbackEventDto['action_type'], mealType?: ReminderFeedbackEventDto['meal_type']) {
    const context = await this.getPendingContext();
    if (!context) return;

    if (mealType && context.meal_type && mealType !== context.meal_type) {
      return;
    }

    try {
      await apiClient.post('/reminders/events', {
        event: 'acted',
        reminder_log_id: context.reminder_log_id,
        meal_type: mealType ?? context.meal_type,
        action_type: actionType,
      } satisfies ReminderFeedbackEventDto);
      await authStorage.deleteItemAsync(PENDING_REMINDER_KEY);
    } catch (error) {
      appLogger.warn('ReminderFeedback', 'Failed to record reminder action', error);
    }
  }

  private async getPendingContext(): Promise<PendingReminderContext | null> {
    const raw = await authStorage.getItemAsync(PENDING_REMINDER_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as PendingReminderContext;
      if (!parsed.reminder_log_id) return null;
      return parsed;
    } catch {
      await authStorage.deleteItemAsync(PENDING_REMINDER_KEY);
      return null;
    }
  }
}

export const reminderFeedbackService = new ReminderFeedbackService();
