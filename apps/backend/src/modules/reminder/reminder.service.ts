import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ReminderPreferences, ReminderPreferencesDto, NudgeMessage, NudgeContext } from '@calorie-ai/types';
import { GamificationService } from '../gamification/gamification.service';
import { FirebaseService } from '../../common/firebase/firebase.service';

@Injectable()
export class ReminderService {
  constructor(
    private supabase: SupabaseService,
    private gamificationService: GamificationService,
    private firebase: FirebaseService,
  ) {}

  private allowMissingTableFallback(): boolean {
    return (process.env.NODE_ENV ?? 'development') === 'development';
  }

  private isMissingTableError(error: any, tableName: string): boolean {
    const message = String(error?.message ?? error?.details ?? '');
    return message.includes(`public.${tableName}`) && message.includes('schema cache');
  }

  private buildDefaultPreferences(userId: string): ReminderPreferences {
    const now = new Date().toISOString();
    return {
      id: `fallback-${userId}`,
      user_id: userId,
      breakfast_reminder_enabled: true,
      breakfast_reminder_time: '07:00',
      lunch_reminder_enabled: true,
      lunch_reminder_time: '12:00',
      dinner_reminder_enabled: true,
      dinner_reminder_time: '19:00',
      snack_reminder_enabled: false,
      snack_reminder_time: '15:00',
      allow_push_notifications: true,
      nudge_motivation_style: 'encouraging',
      created_at: now,
      updated_at: now,
    } as ReminderPreferences;
  }

  /**
   * Get reminder preferences for a user (or create defaults if not exists)
   */
  async getReminderPreferences(userId: string): Promise<ReminderPreferences> {
    let { data, error } = await this.supabase.db
      .from('reminder_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && this.isMissingTableError(error, 'reminder_preferences') && this.allowMissingTableFallback()) {
      // Local/dev environments may not have this migration yet.
      // Return defaults so the app can continue working.
      return this.buildDefaultPreferences(userId);
    }

    if (error && error.code === 'PGRST116') {
      // No preferences found, create defaults
      const defaults = {
        user_id: userId,
        breakfast_reminder_enabled: true,
        breakfast_reminder_time: '07:00',
        lunch_reminder_enabled: true,
        lunch_reminder_time: '12:00',
        dinner_reminder_enabled: true,
        dinner_reminder_time: '19:00',
        snack_reminder_enabled: false,
        snack_reminder_time: '15:00',
        allow_push_notifications: true,
        nudge_motivation_style: 'encouraging',
      };

      const { data: created, error: createError } = await this.supabase.db
        .from('reminder_preferences')
        .insert(defaults)
        .select()
        .single();

      if (createError) throw createError;
      return created as ReminderPreferences;
    }

    if (error) throw error;
    return data as ReminderPreferences;
  }

  /**
   * Update reminder preferences for a user
   */
  async updateReminderPreferences(userId: string, dto: ReminderPreferencesDto): Promise<ReminderPreferences> {
    const { data, error } = await this.supabase.db
      .from('reminder_preferences')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();

    if (error && this.isMissingTableError(error, 'reminder_preferences') && this.allowMissingTableFallback()) {
      return { ...this.buildDefaultPreferences(userId), ...dto } as ReminderPreferences;
    }

    if (error) throw error;
    return data as ReminderPreferences;
  }

  /**
   * Generate nudge message based on user context
   */
  generateNudgeMessage(context: NudgeContext): NudgeMessage {
    const {
      mealType,
      caloriesLogged,
      calorieTarget,
      adherencePercentage,
      mealsLogged,
      motivationStyle,
      currentStreak = 0,
      longestStreak = 0,
      nextStreakMilestone = null,
    } = context;

    const streakContext = {
      currentStreak,
      longestStreak,
      nextMilestone: nextStreakMilestone,
    };

    const mealLabels = {
      breakfast: '🌅 Bữa sáng',
      lunch: '🌤️ Bữa trưa',
      dinner: '🌙 Bữa tối',
      snack: '🍿 Ăn vặt',
    };

    const streakLine =
      currentStreak > 0
        ? `Streak hiện tại của bạn là ${currentStreak} ngày${nextStreakMilestone ? `, còn ${Math.max(0, nextStreakMilestone - currentStreak)} ngày để chạm mốc ${nextStreakMilestone}.` : '.'}`
        : mealsLogged === 0
          ? 'Log bữa này để bắt đầu lại streak hôm nay.'
          : 'Giữ nhịp hôm nay để tạo lại streak mới.';

    // Generate message based on adherence and motivation style
    if (adherencePercentage < 20) {
      if (currentStreak >= 3) {
        return {
          title: `${mealLabels[mealType]} - Giữ streak nhé!`,
          body: `${streakLine} Đừng bỏ trống bữa này nếu bạn muốn giữ nhịp đều đặn.`,
          type: 'streak',
          mealType,
          emoji: '🔥',
          streakContext,
        };
      }

      if (motivationStyle === 'encouraging') {
        return {
          title: `${mealLabels[mealType]} - Bắt đầu nào!`,
          body: `Bạn vừa mới bắt đầu bữa ăn này. Hãy log những thứ bạn ăn để theo dõi calo. ${streakLine}`,
          type: 'reminder',
          mealType,
          emoji: '🎯',
          streakContext,
        };
      } else if (motivationStyle === 'warning') {
        return {
          title: `${mealLabels[mealType]} - Quên log chưa?`,
          body: `Bạn chưa log gì cho bữa này. Nhanh lên để không bỏ sót! ${streakLine}`,
          type: 'reminder',
          mealType,
          emoji: '⏰',
          streakContext,
        };
      }
    } else if (adherencePercentage < 50) {
      if (motivationStyle === 'encouraging') {
        return {
          title: `${mealLabels[mealType]} - Tốt lắm!`,
          body: `Bạn đã log ${caloriesLogged}kcal. Tiếp tục nếu còn ăn nữa nhé! ${streakLine}`,
          type: 'encouragement',
          mealType,
          emoji: '👍',
          streakContext,
        };
      } else if (motivationStyle === 'warning') {
        return {
          title: `${mealLabels[mealType]} - Chưa đủ`,
          body: `Mới ${caloriesLogged}kcal, còn cách mục tiêu ${calorieTarget - caloriesLogged}kcal. ${streakLine}`,
          type: 'warning',
          mealType,
          emoji: '📊',
          streakContext,
        };
      }
    } else if (adherencePercentage < 90) {
      if (motivationStyle === 'encouraging') {
        return {
          title: `${mealLabels[mealType]} - Sắp xong!`,
          body: `${caloriesLogged}kcal rồi, tiếp tục thêm chút nữa để đạt mục tiêu! ${streakLine}`,
          type: 'encouragement',
          mealType,
          emoji: '💪',
          streakContext,
        };
      } else if (motivationStyle === 'warning') {
        return {
          title: `${mealLabels[mealType]} - Gần đủ rồi`,
          body: `${caloriesLogged}kcal, chỉ còn ${calorieTarget - caloriesLogged}kcal nữa thôi. ${streakLine}`,
          type: 'warning',
          mealType,
          emoji: '⚠️',
          streakContext,
        };
      }
    } else if (adherencePercentage < 110) {
      return {
        title: `${mealLabels[mealType]} - Hoàn hảo! ✨`,
        body: `Bạn đã đạt mục tiêu ${calorieTarget}kcal cho bữa này. Tuyệt vời! Streak tốt nhất của bạn đang là ${longestStreak} ngày.`,
        type: currentStreak >= 3 ? 'streak' : 'encouragement',
        mealType,
        emoji: '🎉',
        streakContext,
      };
    } else {
      if (motivationStyle === 'warning') {
        return {
          title: `${mealLabels[mealType]} - Vượt mục tiêu`,
          body: `Bạn đã ăn ${caloriesLogged}kcal, vượt ${caloriesLogged - calorieTarget}kcal. Cân nhắc lại nếu còn ăn. ${streakLine}`,
          type: 'warning',
          mealType,
          emoji: '⚠️',
          streakContext,
        };
      } else {
        return {
          title: `${mealLabels[mealType]} - Ăn thêm thôi`,
          body: `Bạn đã ăn ${caloriesLogged}kcal. Tùy bạn có muốn ăn thêm không. ${streakLine}`,
          type: 'encouragement',
          mealType,
          emoji: '😋',
          streakContext,
        };
      }
    }

    // Default neutral message
    return {
      title: mealLabels[mealType],
      body: `Bạn đã log ${caloriesLogged}kcal cho bữa này. Mục tiêu là ${calorieTarget}kcal. ${streakLine}`,
      type: 'reminder',
      mealType,
      emoji: '📝',
      streakContext,
    };
  }

  async generatePreviewNudge(
    userId: string,
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
    caloriesLogged?: number,
  ): Promise<NudgeMessage> {
    const prefs = await this.getReminderPreferences(userId);
    const [summary, userTargetRes] = await Promise.all([
      this.gamificationService.getSummary(userId),
      this.supabase.db
        .from('users')
        .select('daily_calorie_target')
        .eq('id', userId)
        .single(),
    ]);

    const dailyTarget = userTargetRes.data?.daily_calorie_target ?? 1800;
    const mealTarget = dailyTarget / 4;
    const resolvedCalories = caloriesLogged ?? Math.random() * (mealTarget * 1.5);

    return this.generateNudgeMessage({
      mealType,
      caloriesLogged: Math.round(resolvedCalories),
      calorieTarget: Math.round(mealTarget),
      adherencePercentage: Math.round((resolvedCalories / mealTarget) * 100),
      mealsLogged: caloriesLogged ? 1 : 0,
      motivationStyle: prefs.nudge_motivation_style,
      currentStreak: summary.current_streak,
      longestStreak: summary.longest_streak,
      nextStreakMilestone: summary.next_streak_milestone,
    });
  }

  /**
   * Generate nudge for all reminders enabled at current time
   */
  async generateDueReminders(userId: string): Promise<NudgeMessage[]> {
    const prefs = await this.getReminderPreferences(userId);
    if (!prefs.allow_push_notifications) return [];

    const summary = await this.gamificationService.getSummary(userId);
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const dueReminders: NudgeMessage[] = [];

    // Check each meal type
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
    for (const meal of mealTypes) {
      const enabled = prefs[`${meal}_reminder_enabled`];
      const time = prefs[`${meal}_reminder_time`];

      if (enabled && time === currentTime) {
        // Get today's calories for this meal type
        const { data: logs, error } = await this.supabase.db
          .from('food_logs')
          .select('calories')
          .eq('user_id', userId)
          .eq('meal_type', meal)
          .gte('logged_at', new Date().toISOString().split('T')[0] + 'T00:00:00');

        if (error) continue;

        const caloriesLogged = (logs ?? []).reduce((s, l) => s + l.calories, 0);

        // Get user's daily target
        const { data: userData } = await this.supabase.db
          .from('users')
          .select('daily_calorie_target')
          .eq('id', userId)
          .single();

        const dailyTarget = userData?.daily_calorie_target ?? 1800;
        const mealTarget = dailyTarget / 4; // Simple division by 4 meals

        const nudge = this.generateNudgeMessage({
          mealType: meal,
          caloriesLogged,
          calorieTarget: Math.round(mealTarget),
          adherencePercentage: Math.round((caloriesLogged / mealTarget) * 100),
          mealsLogged: logs?.length ?? 0,
          motivationStyle: prefs.nudge_motivation_style,
          currentStreak: summary.current_streak,
          longestStreak: summary.longest_streak,
          nextStreakMilestone: summary.next_streak_milestone,
        });

        dueReminders.push(nudge);
      }
    }

    return dueReminders;
  }

  /**
   * Get user's currently active life contexts (stress, period, travel, etc)
   * Returns the most recent activation/deactivation events for each context mode
   */
  async getActiveUserContexts(userId: string): Promise<string[]> {
    try {
      // Get the most recent context event for each context mode
      const { data, error } = await this.supabase.db
        .from('user_context_events')
        .select('context_mode, action, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[Reminder] Failed to fetch user contexts:', error);
        return [];
      }

      // Track which contexts are currently active
      const activeContexts = new Set<string>();
      const seenContexts = new Set<string>();

      for (const event of data || []) {
        if (!seenContexts.has(event.context_mode)) {
          seenContexts.add(event.context_mode);
          if (event.action === 'activated') {
            activeContexts.add(event.context_mode);
          }
        }
      }

      return Array.from(activeContexts);
    } catch (error) {
      console.warn('[Reminder] Error getting active contexts:', error);
      return [];
    }
  }

  /**
   * Apply context-aware adjustments to calorie target based on user's life situation
   * E.g., stress day gets +15% calorie buffer, lenient judgment
   */
  applyContextAdjustment(baseTarget: number, activeContexts: string[]): { adjustedTarget: number; feedbackTone: string } {
    if (!activeContexts || activeContexts.length === 0) {
      return { adjustedTarget: baseTarget, feedbackTone: 'balanced' };
    }

    // Priority order: stress > period > poor sleep > travel > busy_work > event > recovery
    const contextPriority: Record<string, number> = {
      stress: 0,
      period: 1,
      poor_sleep: 2,
      travel: 3,
      busy_work: 4,
      event: 5,
      recovery: 6,
    };

    const mostImportantContext = activeContexts.sort(
      (a, b) => (contextPriority[a] ?? 99) - (contextPriority[b] ?? 99),
    )[0];

    // Apply adjustment based on most important active context
    const adjustments: Record<string, { buffer: number; tone: string }> = {
      stress: { buffer: 0.15, tone: 'grounding' },
      period: { buffer: 0.1, tone: 'nurturing' },
      poor_sleep: { buffer: 0.08, tone: 'supportive' },
      travel: { buffer: 0.12, tone: 'adventurous' },
      busy_work: { buffer: 0.08, tone: 'energizing' },
      event: { buffer: 0.1, tone: 'celebratory' },
      recovery: { buffer: 0.05, tone: 'motivating' },
    };

    const adjustment = adjustments[mostImportantContext];
    if (!adjustment) {
      return { adjustedTarget: baseTarget, feedbackTone: 'balanced' };
    }

    const adjustedTarget = Math.round(baseTarget * (1 + adjustment.buffer));
    return { adjustedTarget, feedbackTone: adjustment.tone };
  }

  /**
   * Send push notification to user's device(s) via Firebase
   */
  async sendPushNotification(userId: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    try {
      if (!this.firebase.isAvailable()) {
        console.debug('[Reminder] Firebase not available, skipping push');
        return false;
      }

      // Get user's push tokens
      const { data: tokens, error } = await this.supabase.db
        .from('push_notification_tokens')
        .select('token')
        .eq('user_id', userId)
        .eq('active', true);

      if (error) {
        console.warn('[Reminder] Failed to fetch push tokens:', error);
        return false;
      }

      if (!tokens || tokens.length === 0) {
        console.debug(`[Reminder] No active push tokens for user ${userId}`);
        return false;
      }

      // Send to all tokens
      const tokenList = tokens.map((t) => t.token);
      const results = await this.firebase.sendToMultiple(tokenList, {
        title,
        body,
        data,
      });

      // Mark failed/invalid tokens as inactive
      const failedTokens = Object.entries(results)
        .filter(([_, messageId]) => messageId === null)
        .map(([token]) => token);

      if (failedTokens.length > 0) {
        await this.supabase.db
          .from('push_notification_tokens')
          .update({ active: false })
          .in('token', failedTokens);
      }

      const successCount = Object.values(results).filter((m) => m !== null).length;
      console.log(`[Reminder] Sent push to ${successCount}/${tokenList.length} devices for user ${userId}`);
      return successCount > 0;
    } catch (error) {
      console.error('[Reminder] Error sending push notification:', error);
      return false;
    }
  }

  /**
   * Send nudge message as push notification
   */
  async sendNudgePush(userId: string, nudgeMessage: NudgeMessage): Promise<boolean> {
    return this.sendPushNotification(userId, nudgeMessage.title, nudgeMessage.body, {
      type: nudgeMessage.type,
      mealType: nudgeMessage.mealType,
    });
  }
}

