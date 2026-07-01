import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  ReminderEffectivenessSummary,
  ReminderFeedbackEventDto,
  ReminderPreferences,
  ReminderPreferencesDto,
  NudgeMessage,
  NudgeContext,
} from '@calorie-ai/types';
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
    return message.includes(tableName) && message.includes('schema cache');
  }

  private isDuplicateKeyError(error: any): boolean {
    const message = String(error?.message ?? error?.details ?? '').toLowerCase();
    return error?.code === '23505' || message.includes('duplicate key');
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
      hydration_reminder_enabled: true,
      allow_push_notifications: true,
      nudge_motivation_style: 'encouraging',
      created_at: now,
      updated_at: now,
    } as ReminderPreferences;
  }

  private buildMissingTargetNudge(
    mealType: NudgeMessage['mealType'],
    currentStreak = 0,
    longestStreak = 0,
    nextMilestone: number | null = null,
  ): NudgeMessage {
    const labels = {
      breakfast: 'Bữa sáng',
      lunch: 'Bữa trưa',
      dinner: 'Bữa tối',
      snack: 'Bữa phụ',
    };
    return {
      title: labels[mealType],
      body: 'Hãy hoàn tất hồ sơ để Calorie AI tính mục tiêu phù hợp. Bạn vẫn có thể ghi lại bữa ăn này.',
      type: 'reminder',
      mealType,
      emoji: '📝',
      streakContext: {
        currentStreak,
        longestStreak,
        nextMilestone,
      },
    };
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
        hydration_reminder_enabled: true,
        allow_push_notifications: true,
        nudge_motivation_style: 'encouraging',
      };

      const { data: created, error: createError } = await this.supabase.db
        .from('reminder_preferences')
        .insert(defaults)
        .select()
        .single();

      if (createError && this.isDuplicateKeyError(createError)) {
        const { data: existing, error: refetchError } = await this.supabase.db
          .from('reminder_preferences')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (!refetchError && existing) return existing as ReminderPreferences;
      }

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

  async recordReminderEvent(userId: string, dto: ReminderFeedbackEventDto) {
    const now = new Date().toISOString();
    const attributionWindowMinutes = this.resolveAttributionWindowMinutes(dto.attribution_window_minutes);
    const actedCutoffIso = new Date(Date.now() - attributionWindowMinutes * 60 * 1000).toISOString();
    const update = dto.event === 'opened'
      ? { opened_at: now }
      : { acted_at: now, acted_action_type: dto.action_type ?? null };

    const reminderLogId = dto.reminder_log_id ?? await this.findLatestReminderLogId(userId, dto);
    if (!reminderLogId) {
      return { recorded: false, reason: 'reminder_log_not_found' };
    }

    let query = this.supabase.db
      .from('reminder_notification_log')
      .update(update)
      .eq('user_id', userId)
      .eq('id', reminderLogId);

    if (dto.event === 'acted') {
      query = query.gte('sent_at', actedCutoffIso);
    }

    const { data, error } = await query
      .select('id, meal_type, sent_at, opened_at, acted_at, acted_action_type')
      .single();

    if (error && this.isMissingTableError(error, 'reminder_notification_log') && this.allowMissingTableFallback()) {
      return { recorded: false, reason: 'reminder_log_table_missing' };
    }

    if (error?.code === 'PGRST116') {
      return { recorded: false, reason: dto.event === 'acted' ? 'outside_attribution_window' : 'reminder_log_not_found' };
    }

    if (error) throw error;
    return { recorded: true, event: dto.event, reminder: data };
  }

  async getReminderEffectiveness(userId: string, days = 30): Promise<ReminderEffectivenessSummary> {
    const safeDays = Math.min(Math.max(Math.round(days), 1), 90);
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
    const empty = this.buildEmptyEffectivenessSummary(safeDays);

    const { data, error } = await this.supabase.db
      .from('reminder_notification_log')
      .select('meal_type, sent_at, opened_at, acted_at, acted_action_type')
      .eq('user_id', userId)
      .gte('sent_at', since);

    if (error && this.isMissingTableError(error, 'reminder_notification_log') && this.allowMissingTableFallback()) {
      return empty;
    }

    if (error) throw error;

    const summary = (data ?? []).reduce((acc, row: any) => {
      const meal = row.meal_type as keyof ReminderEffectivenessSummary['by_meal'];
      if (!acc.by_meal[meal]) return acc;

      acc.sent += 1;
      acc.by_meal[meal].sent += 1;

      const opened = Boolean(row.opened_at);
      const acted = Boolean(row.acted_at);
      const ignored = !opened && !acted;

      if (opened) {
        acc.opened += 1;
        acc.by_meal[meal].opened += 1;
      }

      if (acted) {
        acc.acted += 1;
        acc.by_meal[meal].acted += 1;
        const actionType = String(row.acted_action_type ?? 'unknown');
        acc.by_action[actionType] = acc.by_action[actionType] ?? { acted: 0, action_rate: 0 };
        acc.by_action[actionType].acted += 1;
      }

      if (ignored) {
        acc.ignored += 1;
        acc.by_meal[meal].ignored += 1;
      }

      return acc;
    }, empty);

    return this.finalizeEffectivenessRates(summary);
  }

  private async findLatestReminderLogId(userId: string, dto: ReminderFeedbackEventDto): Promise<string | null> {
    let query = this.supabase.db
      .from('reminder_notification_log')
      .select('id')
      .eq('user_id', userId)
      .order('sent_at', { ascending: false })
      .limit(1);

    if (dto.meal_type) query = query.eq('meal_type', dto.meal_type);
    if (dto.local_date) query = query.eq('local_date', dto.local_date);
    if (dto.event === 'acted') {
      const attributionWindowMinutes = this.resolveAttributionWindowMinutes(dto.attribution_window_minutes);
      query = query.gte('sent_at', new Date(Date.now() - attributionWindowMinutes * 60 * 1000).toISOString());
    }

    const { data, error } = await query;
    if (error && this.isMissingTableError(error, 'reminder_notification_log') && this.allowMissingTableFallback()) {
      return null;
    }
    if (error) throw error;
    return data?.[0]?.id ?? null;
  }

  private resolveAttributionWindowMinutes(value?: number): number {
    const safe = Number(value);
    if (!Number.isFinite(safe)) return 120;
    return Math.min(Math.max(Math.round(safe), 5), 24 * 60);
  }

  private buildEmptyEffectivenessSummary(days = 30): ReminderEffectivenessSummary {
    const emptyMeal = () => ({ sent: 0, opened: 0, acted: 0, ignored: 0, open_rate: 0, action_rate: 0, ignore_rate: 0 });
    return {
      days,
      sent: 0,
      opened: 0,
      acted: 0,
      ignored: 0,
      open_rate: 0,
      action_rate: 0,
      ignore_rate: 0,
      effectiveness_score: 0,
      best_meal: null,
      weakest_meal: null,
      recommendation: 'No reminder data yet. Send reminders for a few days before judging timing.',
      patterns: [],
      by_meal: {
        breakfast: emptyMeal(),
        lunch: emptyMeal(),
        dinner: emptyMeal(),
        snack: emptyMeal(),
      },
      by_action: {},
    };
  }

  private finalizeEffectivenessRates(summary: ReminderEffectivenessSummary): ReminderEffectivenessSummary {
    summary.open_rate = summary.sent > 0 ? Math.round((summary.opened / summary.sent) * 100) : 0;
    summary.action_rate = summary.sent > 0 ? Math.round((summary.acted / summary.sent) * 100) : 0;
    summary.ignore_rate = summary.sent > 0 ? Math.round((summary.ignored / summary.sent) * 100) : 0;
    summary.effectiveness_score = Math.round(summary.action_rate * 0.75 + summary.open_rate * 0.25);

    Object.values(summary.by_meal).forEach((meal) => {
      meal.open_rate = meal.sent > 0 ? Math.round((meal.opened / meal.sent) * 100) : 0;
      meal.action_rate = meal.sent > 0 ? Math.round((meal.acted / meal.sent) * 100) : 0;
      meal.ignore_rate = meal.sent > 0 ? Math.round((meal.ignored / meal.sent) * 100) : 0;
    });

    Object.values(summary.by_action).forEach((action) => {
      action.action_rate = summary.sent > 0 ? Math.round((action.acted / summary.sent) * 100) : 0;
    });

    const mealEntries = Object.entries(summary.by_meal)
      .filter(([, meal]) => meal.sent > 0) as Array<[
        keyof ReminderEffectivenessSummary['by_meal'],
        ReminderEffectivenessSummary['by_meal'][keyof ReminderEffectivenessSummary['by_meal']],
      ]>;
    const byActionRateDesc = [...mealEntries].sort((a, b) => b[1].action_rate - a[1].action_rate);
    summary.best_meal = byActionRateDesc[0]?.[0] ?? null;
    summary.weakest_meal = byActionRateDesc.length > 0 ? byActionRateDesc[byActionRateDesc.length - 1][0] : null;
    summary.patterns = this.detectEffectivenessPatterns(summary);
    summary.recommendation = this.buildEffectivenessRecommendation(summary);

    return summary;
  }

  private detectEffectivenessPatterns(summary: ReminderEffectivenessSummary): string[] {
    const patterns: string[] = [];

    if (summary.sent === 0) return patterns;
    if (summary.action_rate < 25) patterns.push(`Reminder action rate is low at ${summary.action_rate}%`);
    if (summary.ignore_rate >= 50) patterns.push(`${summary.ignore_rate}% of reminders were ignored`);

    for (const [meal, stats] of Object.entries(summary.by_meal)) {
      if (stats.sent < 2) continue;
      if (stats.action_rate >= 50) patterns.push(`${meal} reminders work best (${stats.action_rate}% action rate)`);
      if (stats.ignore_rate >= 60) patterns.push(`${meal} reminders are often ignored (${stats.ignore_rate}%)`);
    }

    return patterns.slice(0, 4);
  }

  private buildEffectivenessRecommendation(summary: ReminderEffectivenessSummary): string {
    if (summary.sent === 0) {
      return 'No reminder data yet. Send reminders for a few days before judging timing.';
    }

    if (summary.action_rate >= 50) {
      return summary.best_meal
        ? `${summary.best_meal} reminders are converting well. Keep this timing and use Coach to reinforce the habit.`
        : 'Reminder timing is converting well. Keep the current cadence.';
    }

    if (summary.ignore_rate >= 50 && summary.weakest_meal) {
      return `${summary.weakest_meal} reminders are often ignored. Try shifting the time by 30-60 minutes or use a gentler reminder style.`;
    }

    if (summary.open_rate >= 50 && summary.action_rate < 30) {
      return 'Users open reminders but do not act often. Make the next step smaller, such as one-tap scan or quick log.';
    }

    return 'Keep collecting reminder feedback. Prioritize the meal with the lowest action rate first.';
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

    const dailyTarget = Number(userTargetRes.data?.daily_calorie_target);
    if (!Number.isFinite(dailyTarget) || dailyTarget <= 0) {
      return this.buildMissingTargetNudge(
        mealType,
        summary.current_streak,
        summary.longest_streak,
        summary.next_streak_milestone,
      );
    }
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

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const dueReminders: NudgeMessage[] = [];

    // Check each meal type
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
    for (const meal of mealTypes) {
      const enabled = prefs[`${meal}_reminder_enabled`];
      const time = prefs[`${meal}_reminder_time`];

      if (enabled && time === currentTime) {
        dueReminders.push(await this.generateMealReminder(userId, meal, prefs));
      }
    }

    return dueReminders;
  }

  async generateMealReminder(
    userId: string,
    meal: 'breakfast' | 'lunch' | 'dinner' | 'snack',
    prefs?: ReminderPreferences,
  ): Promise<NudgeMessage> {
    const resolvedPrefs = prefs ?? await this.getReminderPreferences(userId);
    const summary = await this.gamificationService.getSummary(userId);

    const { data: logs, error } = await this.supabase.db
      .from('food_logs')
      .select('calories')
      .eq('user_id', userId)
      .eq('meal_type', meal)
      .gte('logged_at', new Date().toISOString().split('T')[0] + 'T00:00:00');

    const caloriesLogged = error ? 0 : (logs ?? []).reduce((s, l) => s + l.calories, 0);

    const { data: userData } = await this.supabase.db
      .from('users')
      .select('daily_calorie_target')
      .eq('id', userId)
      .single();

    const dailyTarget = Number(userData?.daily_calorie_target);
    if (!Number.isFinite(dailyTarget) || dailyTarget <= 0) {
      return this.buildMissingTargetNudge(
        meal,
        summary.current_streak,
        summary.longest_streak,
        summary.next_streak_milestone,
      );
    }
    const mealTarget = dailyTarget / 4;

    return this.generateNudgeMessage({
      mealType: meal,
      caloriesLogged,
      calorieTarget: Math.round(mealTarget),
      adherencePercentage: Math.round((caloriesLogged / mealTarget) * 100),
      mealsLogged: error ? 0 : logs?.length ?? 0,
      motivationStyle: resolvedPrefs.nudge_motivation_style,
      currentStreak: summary.current_streak,
      longestStreak: summary.longest_streak,
      nextStreakMilestone: summary.next_streak_milestone,
    });
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
   * Send push notification to user's Expo push token(s).
   */
  async sendPushNotification(userId: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    try {
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

      const tokenList = tokens.map((t) => t.token);
      const results = await this.sendExpoPushMessages(tokenList.map((token) => ({
        to: token,
        title,
        body,
        data,
        sound: 'default',
      })));

      if (results.invalidTokens.length > 0) {
        await this.supabase.db
          .from('push_notification_tokens')
          .update({ active: false, updated_at: new Date().toISOString() })
          .in('token', results.invalidTokens);
      }

      const successCount = results.successCount;
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

  private async sendExpoPushMessages(messages: object[]): Promise<{ successCount: number; invalidTokens: string[] }> {
    let successCount = 0;
    const invalidTokens: string[] = [];

    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
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
        console.warn(`[Reminder] Expo push API returned ${response.status}`);
        continue;
      }

      const payload: any = await response.json().catch(() => null);
      const tickets = Array.isArray(payload?.data) ? payload.data : [];
      tickets.forEach((ticket: any, index: number) => {
        if (ticket?.status === 'ok') {
          successCount++;
          return;
        }

        if (ticket?.details?.error === 'DeviceNotRegistered') {
          const message = chunk[index] as { to?: string };
          if (message.to) invalidTokens.push(message.to);
        }
      });
    }

    return { successCount, invalidTokens };
  }
}

