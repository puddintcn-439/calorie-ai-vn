import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  BehaviorMemory,
  BehavioralPattern,
  CoachingInsight,
  CoachingSummary,
  DailyNutritionData,
  DynamicIntervention,
  DynamicInterventionAction,
  InterventionEventInput,
  InterventionAnalytics,
  InterventionAnalyticsWindow,
  InterventionMemory,
  InterventionMemoryStats,
  PatternType,
  InsightType,
  PriorityLevel,
} from '@calorie-ai/types';

@Injectable()
export class CoachingService {
  private readonly logger = new Logger(CoachingService.name);

  constructor(private supabase: SupabaseService) {}

  async recordInterventionEvent(userId: string, dto: InterventionEventInput): Promise<{ recorded: boolean }> {
    const { error } = await this.supabase.db
      .from('user_intervention_events')
      .insert({
        user_id: userId,
        intervention_type: dto.intervention_type,
        mode: dto.mode,
        priority: dto.priority,
        primary_action: dto.primary_action,
        event_type: dto.event_type,
        source: dto.source ?? 'today',
        forecast_score: dto.forecast_score ?? null,
        intervention_generated_at: dto.intervention_generated_at ?? null,
        metadata: dto.metadata ?? {},
      });

    if (error) {
      this.logger.warn(`Failed to record intervention event: ${error.message ?? error}`);
      return { recorded: false };
    }

    return { recorded: true };
  }

  async getInterventionMemory(userId: string, days = 90): Promise<InterventionMemory> {
    const daysAnalyzed = Math.max(7, Math.min(180, Math.round(days)));
    const since = new Date();
    since.setDate(since.getDate() - (daysAnalyzed - 1));
    since.setHours(0, 0, 0, 0);

    const { data, error } = await this.supabase.db
      .from('user_intervention_events')
      .select('intervention_type, mode, priority, primary_action, event_type, created_at')
      .eq('user_id', userId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.warn(`Failed to fetch intervention memory: ${error.message ?? error}`);
      return this.emptyInterventionMemory(daysAnalyzed);
    }

    return this.buildInterventionMemory(data ?? [], daysAnalyzed);
  }

  async getInterventionAnalytics(userId: string, minSample = 20): Promise<InterventionAnalytics> {
    const sampleThreshold = Math.max(5, Math.min(100, Math.round(minSample)));
    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    const { data, error } = await this.supabase.db
      .from('user_intervention_events')
      .select('intervention_type, mode, priority, primary_action, event_type, created_at')
      .eq('user_id', userId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.warn(`Failed to fetch intervention analytics: ${error.message ?? error}`);
      return this.buildInterventionAnalytics([], sampleThreshold);
    }

    return this.buildInterventionAnalytics(data ?? [], sampleThreshold);
  }

  async getBehaviorMemory(userId: string, days = 90): Promise<BehaviorMemory> {
    const daysAnalyzed = Math.max(14, Math.min(180, Math.round(days)));
    const since = new Date();
    since.setDate(since.getDate() - (daysAnalyzed - 1));
    since.setHours(0, 0, 0, 0);
    const sinceIso = since.toISOString();

    const [foodRes, activityRes, reminderRes, userRes] = await Promise.all([
      this.supabase.db
        .from('food_logs')
        .select('logged_at, meal_type, protein_g')
        .eq('user_id', userId)
        .gte('logged_at', sinceIso)
        .order('logged_at', { ascending: true }),
      this.supabase.db
        .from('activity_logs')
        .select('logged_at, duration_min')
        .eq('user_id', userId)
        .gte('logged_at', sinceIso)
        .order('logged_at', { ascending: true }),
      this.supabase.db
        .from('reminder_notification_log')
        .select('sent_at, opened_at, acted_at')
        .eq('user_id', userId)
        .gte('sent_at', sinceIso)
        .order('sent_at', { ascending: true }),
      this.supabase.db
        .from('users')
        .select('daily_calorie_target')
        .eq('id', userId)
        .single(),
    ]);

    if (foodRes.error) this.logger.warn(`Behavior memory food log query failed: ${foodRes.error.message ?? foodRes.error}`);
    if (activityRes.error) this.logger.warn(`Behavior memory activity query failed: ${activityRes.error.message ?? activityRes.error}`);
    if (reminderRes.error) this.logger.warn(`Behavior memory reminder query failed: ${reminderRes.error.message ?? reminderRes.error}`);

    const foodLogs = foodRes.error ? [] : foodRes.data ?? [];
    const activityLogs = activityRes.error ? [] : activityRes.data ?? [];
    const reminderEvents = reminderRes.error ? [] : reminderRes.data ?? [];
    const dayKeys = this.buildDayKeys(daysAnalyzed);
    const foodByDay = this.groupFoodLogsByDay(foodLogs);
    const activityDayKeys = new Set(activityLogs.map((log: any) => this.toDateKey(log.logged_at)).filter(Boolean));
    const activeDayKeys = new Set<string>([
      ...Object.keys(foodByDay),
      ...activityDayKeys,
    ]);
    const trackedFoodDays = Object.keys(foodByDay).length;
    const dailyTarget = Number((userRes as any).data?.daily_calorie_target) > 0
      ? Number((userRes as any).data?.daily_calorie_target)
      : 1800;
    const proteinTarget = Math.max(70, Math.round((dailyTarget * 0.075) / 4));
    const highProteinDays = Object.values(foodByDay)
      .filter((day) => day.protein_g >= proteinTarget).length;
    const mealSkipRates = this.calculateMealSkipRates(foodByDay);
    const lowActivityDays = this.detectLowActivityWeekdays(dayKeys, activityDayKeys);
    const bestReminderHour = this.detectBestReminderHour(reminderEvents);
    const bestLoggingStreak = this.calculateBestStreak(dayKeys, activeDayKeys);
    const highProteinAdherence = trackedFoodDays > 0 ? this.round2(highProteinDays / trackedFoodDays) : 0;
    const activityAdherence = this.round2(activityDayKeys.size / Math.max(daysAnalyzed, 1));
    const dataQuality: BehaviorMemory['data_quality'] = activeDayKeys.size >= 30
      ? 'high'
      : activeDayKeys.size >= 7
        ? 'medium'
        : 'low';

    const memory: BehaviorMemory = {
      days_analyzed: daysAnalyzed,
      data_quality: dataQuality,
      best_reminder_hour: bestReminderHour,
      often_skips_breakfast: trackedFoodDays >= 7 && mealSkipRates.breakfast >= 0.45,
      often_skips_lunch: trackedFoodDays >= 7 && mealSkipRates.lunch >= 0.45,
      often_skips_dinner: trackedFoodDays >= 7 && mealSkipRates.dinner >= 0.45,
      low_activity_days: lowActivityDays,
      best_logging_streak: bestLoggingStreak,
      high_protein_adherence: highProteinAdherence,
      activity_adherence: activityAdherence,
      meal_skip_rates: mealSkipRates,
      memory_notes: [],
      updated_at: new Date().toISOString(),
    };

    memory.memory_notes = this.buildBehaviorMemoryNotes(memory);
    return memory;
  }

  /**
   * Analyze user's past 7 days and detect behavioral patterns
   */
  async analyzeWeeklyPatterns(userId: string): Promise<BehavioralPattern[]> {
    try {
      // Get last 7 days of logs with calorie info
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: logs, error: logsError } = await this.supabase.db
        .from('food_logs')
        .select('id, logged_at, meal_type, calories')
        .eq('user_id', userId)
        .gte('logged_at', sevenDaysAgo.toISOString())
        .order('logged_at', { ascending: true });

      if (logsError) {
        this.logger.error(`Failed to fetch logs for pattern analysis: ${logsError}`);
        return [];
      }

      if (!logs || logs.length === 0) {
        return [];
      }

      // Get user's calorie target from users table
      const { data: userProfile } = await this.supabase.db
        .from('users')
        .select('daily_calorie_target')
        .eq('id', userId)
        .single();

      const dailyGoal = userProfile?.daily_calorie_target ?? 2000;

      // Organize logs by day
      const dailyData = this.organizeDailyData(logs, dailyGoal);

      // Detect patterns
      const patterns: BehavioralPattern[] = [];

      // 1. Skipped meals pattern
      const skippedPattern = this.detectSkippedMeals(dailyData, userId);
      if (skippedPattern) patterns.push(skippedPattern);

      // 2. Binge episodes
      const bingePattern = this.detectBingeEpisodes(dailyData, userId, dailyGoal);
      if (bingePattern) patterns.push(bingePattern);

      // 3. Night eating
      const nightEatingPattern = this.detectNightEating(logs, userId);
      if (nightEatingPattern) patterns.push(nightEatingPattern);

      // 4. Weekend variance
      const weekendPattern = this.detectWeekendVariance(dailyData, userId, dailyGoal);
      if (weekendPattern) patterns.push(weekendPattern);

      // 5. Inconsistent logging
      const inconsistentPattern = this.detectInconsistentLogging(dailyData, userId);
      if (inconsistentPattern) patterns.push(inconsistentPattern);

      // 6. Timing preference
      const timingPattern = this.detectTimingPreference(logs, userId);
      if (timingPattern) patterns.push(timingPattern);

      return patterns;
    } catch (error) {
      this.logger.error(`Error analyzing patterns: ${error}`);
      return [];
    }
  }

  /**
   * Generate coaching insights based on detected patterns and user data
   */
  async generateInsights(userId: string, patterns: BehavioralPattern[]): Promise<CoachingInsight[]> {
    const insights: CoachingInsight[] = [];

    for (const pattern of patterns) {
      const insight = this.createInsightFromPattern(pattern, userId);
      if (insight) insights.push(insight);
    }

    return this.dedupeInsights(insights);
  }

  dedupeInsights(insights: CoachingInsight[]): CoachingInsight[] {
    const byContent = new Map<string, CoachingInsight>();

    for (const insight of insights) {
      const key = this.getInsightContentKey(insight);
      const existing = byContent.get(key);

      if (!existing) {
        byContent.set(key, insight);
        continue;
      }

      const existingScore = existing.impact_score ?? 0;
      const nextScore = insight.impact_score ?? 0;
      const existingDate = Date.parse(existing.created_at ?? '') || 0;
      const nextDate = Date.parse(insight.created_at ?? '') || 0;

      if (nextScore > existingScore || (nextScore === existingScore && nextDate > existingDate)) {
        byContent.set(key, insight);
      }
    }

    return [...byContent.values()];
  }

  getInsightContentKey(insight: Pick<CoachingInsight, 'title' | 'description' | 'action_suggestion'>): string {
    return [
      insight.title,
      insight.description,
      insight.action_suggestion ?? '',
    ].map((value) => String(value).trim().toLowerCase()).join('|');
  }

  /**
   * Generate weekly coaching summary
   */
  async generateWeeklySummary(userId: string): Promise<CoachingSummary | null> {
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Get Sunday
      weekStart.setHours(0, 0, 0, 0);

      // Get this week's logs
      const { data: logs, error } = await this.supabase.db
        .from('food_logs')
        .select('logged_at, calories, meal_type')
        .eq('user_id', userId)
        .gte('logged_at', weekStart.toISOString())
        .order('logged_at', { ascending: true });

      // Get target from users table
      const { data: userProfile } = await this.supabase.db
        .from('users')
        .select('daily_calorie_target')
        .eq('id', userId)
        .single();

      const dailyGoal = Number(userProfile?.daily_calorie_target) > 0
        ? Number(userProfile?.daily_calorie_target)
        : 2000;

      if (error) {
        this.logger.error(`Failed to fetch logs for weekly summary: ${error}`);
        return null;
      }

      if (!logs || logs.length === 0) {
        return this.createEmptyWeeklySummary(userId, weekStart, dailyGoal);
      }

      // Calculate metrics
      const dailyData = this.organizeDailyData(logs, dailyGoal);
      const totalCalories = logs.reduce((sum, log) => sum + log.calories, 0);
      const dailyCount = Math.max(Object.keys(dailyData).length, 1);
      const averageDailyCalories = totalCalories / dailyCount;

      // Count adherence days
      let daysAbove = 0,
        daysBelow = 0,
        daysOn = 0;
      for (const day of Object.values(dailyData)) {
        const dayCalories = (day as any).total_calories;
        if (dayCalories > dailyGoal * 1.1) daysAbove++;
        else if (dayCalories < dailyGoal * 0.9) daysBelow++;
        else daysOn++;
      }

      // Get active patterns
      const patterns = await this.analyzeWeeklyPatterns(userId);
      const primaryPattern = patterns.length > 0 ? patterns[0].pattern_type : undefined;

      // Calculate adherence
      const adherencePercentage = Math.round(
        (daysOn / Math.max(Object.keys(dailyData).length, 1)) * 100,
      );

      // Determine priority
      const priority = adherencePercentage < 40 ? PriorityLevel.CRITICAL
                     : adherencePercentage < 60 ? PriorityLevel.HIGH
                     : adherencePercentage < 80 ? PriorityLevel.MEDIUM
                     : PriorityLevel.LOW;

      return {
        id: 0,
        user_id: userId,
        week_start_date: weekStart.toISOString().split('T')[0],
        logs_count: logs.length,
        adherence_percentage: adherencePercentage,
        consistency_score: Math.min(adherencePercentage / 100, 1),
        primary_pattern: primaryPattern,
        secondary_patterns: patterns.slice(1).map((p) => p.pattern_type),
        insights_generated: patterns.length,
        total_calories: totalCalories,
        average_daily_calories: averageDailyCalories,
        calorie_variance: this.calculateVariance(Object.values(dailyData).map((d: any) => d.total_calories)),
        days_above_target: daysAbove,
        days_below_target: daysBelow,
        days_on_target: daysOn,
        recommended_action: this.generateRecommendation(primaryPattern, adherencePercentage),
        priority_level: priority,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as CoachingSummary;
    } catch (error) {
      this.logger.error(`Error generating summary: ${error}`);
      return null;
    }
  }

  // ======================== Helper Methods ========================

  private emptyInterventionMemory(daysAnalyzed: number): InterventionMemory {
    return {
      days_analyzed: daysAnalyzed,
      total_shown: 0,
      total_acted: 0,
      total_dismissed: 0,
      overall_action_rate: 0,
      best_intervention: null,
      weakest_intervention: null,
      ranking: [],
      by_type: {},
      updated_at: new Date().toISOString(),
    };
  }

  private buildInterventionAnalytics(rows: any[], minSample: number): InterventionAnalytics {
    const sevenDayStart = new Date();
    sevenDayStart.setDate(sevenDayStart.getDate() - 6);
    sevenDayStart.setHours(0, 0, 0, 0);
    const sevenDayRows = rows.filter((row) => {
      const time = Date.parse(row.created_at);
      return Number.isFinite(time) && time >= sevenDayStart.getTime();
    });

    const sevenDayMemory = this.buildInterventionMemory(sevenDayRows, 7);
    const thirtyDayMemory = this.buildInterventionMemory(rows, 30);
    const thirtyDayWindow = this.buildInterventionAnalyticsWindow(thirtyDayMemory, 30);
    const readyInterventions = thirtyDayMemory.ranking
      .filter((item) => item.shown >= minSample)
      .map((item) => item.intervention_type);
    const insufficientInterventions = thirtyDayMemory.ranking
      .filter((item) => item.shown > 0 && item.shown < minSample)
      .map((item) => item.intervention_type);

    const sampleStatus: InterventionAnalytics['sample_status'] = thirtyDayWindow.total_shown < minSample
      ? 'insufficient'
      : readyInterventions.length > 0
        ? 'ready'
        : 'learning';

    return {
      min_sample: minSample,
      sample_status: sampleStatus,
      windows: {
        seven_day: this.buildInterventionAnalyticsWindow(sevenDayMemory, 7),
        thirty_day: thirtyDayWindow,
      },
      ready_interventions: readyInterventions,
      insufficient_interventions: insufficientInterventions,
      best_intervention: thirtyDayMemory.best_intervention,
      weakest_intervention: thirtyDayMemory.weakest_intervention,
      recommendations: this.buildInterventionAnalyticsRecommendations(
        sampleStatus,
        thirtyDayWindow,
        readyInterventions,
        insufficientInterventions,
        minSample,
      ),
      updated_at: new Date().toISOString(),
    };
  }

  private buildInterventionAnalyticsWindow(memory: InterventionMemory, days: number): InterventionAnalyticsWindow {
    const rankedWithData = memory.ranking.filter((item) => item.shown > 0);
    const topIgnored = [...rankedWithData].sort((a, b) => (
      b.dismiss_rate - a.dismiss_rate
      || a.action_rate - b.action_rate
      || b.shown - a.shown
      || a.intervention_type.localeCompare(b.intervention_type)
    ));

    return {
      days,
      total_shown: memory.total_shown,
      total_acted: memory.total_acted,
      total_dismissed: memory.total_dismissed,
      action_rate: memory.overall_action_rate,
      dismiss_rate: memory.total_shown > 0 ? Math.round((memory.total_dismissed / memory.total_shown) * 100) : 0,
      top_effective: rankedWithData.slice(0, 3),
      top_ignored: topIgnored.slice(0, 3),
      ranking: memory.ranking,
    };
  }

  private buildInterventionAnalyticsRecommendations(
    status: InterventionAnalytics['sample_status'],
    window: InterventionAnalyticsWindow,
    readyInterventions: DynamicIntervention['intervention_type'][],
    insufficientInterventions: DynamicIntervention['intervention_type'][],
    minSample: number,
  ): string[] {
    const recommendations: string[] = [];

    if (window.total_shown === 0) {
      return ['Collect intervention events before adapting the engine.'];
    }

    if (status === 'insufficient') {
      recommendations.push(`Keep the rule engine active until at least ${minSample} shown events are collected.`);
    } else if (status === 'learning') {
      recommendations.push(`Overall sample is usable, but each intervention still needs ${minSample} shown events before ranking drives decisions.`);
    } else if (readyInterventions.length > 0) {
      recommendations.push(`Ranking is ready for: ${readyInterventions.join(', ')}.`);
    }

    const best = window.top_effective[0];
    const weakest = window.top_ignored[0];
    if (best) recommendations.push(`Lean into ${best.intervention_type}: ${best.action_rate}% action rate over ${best.shown} shown events.`);
    if (weakest && weakest.dismiss_rate >= 30) recommendations.push(`Review ${weakest.intervention_type}: ${weakest.dismiss_rate}% dismiss rate suggests this intervention may need different timing or copy.`);
    if (insufficientInterventions.length > 0) recommendations.push(`Need more samples for: ${insufficientInterventions.join(', ')}.`);

    return recommendations.slice(0, 4);
  }

  private buildInterventionMemory(rows: any[], daysAnalyzed: number): InterventionMemory {
    const byType = rows.reduce<Record<string, InterventionMemoryStats>>((acc, row) => {
      const type = String(row.intervention_type ?? 'maintain') as DynamicIntervention['intervention_type'];
      acc[type] = acc[type] ?? {
        intervention_type: type,
        shown: 0,
        acted: 0,
        dismissed: 0,
        action_rate: 0,
        dismiss_rate: 0,
        effectiveness_score: 0,
        last_shown_at: null,
        last_acted_at: null,
        primary_action: null,
      };

      const stats = acc[type];
      const eventType = String(row.event_type ?? '');
      if (eventType === 'shown') {
        stats.shown += 1;
        stats.last_shown_at = row.created_at ?? stats.last_shown_at;
      } else if (eventType === 'acted') {
        stats.acted += 1;
        stats.last_acted_at = row.created_at ?? stats.last_acted_at;
      } else if (eventType === 'dismissed') {
        stats.dismissed += 1;
      }

      if (row.primary_action) {
        stats.primary_action = String(row.primary_action) as DynamicInterventionAction;
      }

      return acc;
    }, {});

    const ranking = Object.values(byType).map((stats) => {
      const shownBase = Math.max(stats.shown, 1);
      stats.action_rate = Math.round((stats.acted / shownBase) * 100);
      stats.dismiss_rate = Math.round((stats.dismissed / shownBase) * 100);
      stats.effectiveness_score = Math.max(0, Math.min(100, Math.round(stats.action_rate - stats.dismiss_rate * 0.25)));
      return stats;
    }).sort((a, b) => (
      b.effectiveness_score - a.effectiveness_score
      || b.acted - a.acted
      || b.shown - a.shown
      || a.intervention_type.localeCompare(b.intervention_type)
    ));

    const totalShown = ranking.reduce((sum, item) => sum + item.shown, 0);
    const totalActed = ranking.reduce((sum, item) => sum + item.acted, 0);
    const totalDismissed = ranking.reduce((sum, item) => sum + item.dismissed, 0);
    const rankedWithData = ranking.filter((item) => item.shown > 0);
    const weakest = [...rankedWithData].sort((a, b) => (
      a.effectiveness_score - b.effectiveness_score
      || b.shown - a.shown
      || a.intervention_type.localeCompare(b.intervention_type)
    ))[0];

    return {
      days_analyzed: daysAnalyzed,
      total_shown: totalShown,
      total_acted: totalActed,
      total_dismissed: totalDismissed,
      overall_action_rate: totalShown > 0 ? Math.round((totalActed / totalShown) * 100) : 0,
      best_intervention: rankedWithData[0]?.intervention_type ?? null,
      weakest_intervention: weakest?.intervention_type ?? null,
      ranking,
      by_type: byType as InterventionMemory['by_type'],
      updated_at: new Date().toISOString(),
    };
  }

  private toDateKey(value: string | null | undefined): string {
    if (!value) return '';
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString().split('T')[0] : '';
  }

  private buildDayKeys(days: number): string[] {
    return Array.from({ length: days }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (days - 1 - index));
      day.setHours(0, 0, 0, 0);
      return day.toISOString().split('T')[0];
    });
  }

  private round2(value: number): number {
    return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
  }

  private groupFoodLogsByDay(logs: any[]): Record<string, { meals: Set<string>; protein_g: number }> {
    return logs.reduce<Record<string, { meals: Set<string>; protein_g: number }>>((acc, log) => {
      const key = this.toDateKey(log.logged_at);
      if (!key) return acc;
      acc[key] = acc[key] ?? { meals: new Set<string>(), protein_g: 0 };
      if (log.meal_type) acc[key].meals.add(String(log.meal_type));
      acc[key].protein_g += Number(log.protein_g) || 0;
      return acc;
    }, {});
  }

  private calculateMealSkipRates(foodByDay: Record<string, { meals: Set<string>; protein_g: number }>): BehaviorMemory['meal_skip_rates'] {
    const days = Object.values(foodByDay);
    const total = days.length;
    const rate = (meal: 'breakfast' | 'lunch' | 'dinner' | 'snack') => (
      total > 0 ? this.round2(days.filter((day) => !day.meals.has(meal)).length / total) : 0
    );

    return {
      breakfast: rate('breakfast'),
      lunch: rate('lunch'),
      dinner: rate('dinner'),
      snack: rate('snack'),
    };
  }

  private detectLowActivityWeekdays(dayKeys: string[], activityDayKeys: Set<string>): BehaviorMemory['low_activity_days'] {
    const labels: BehaviorMemory['low_activity_days'] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const stats = labels.map((label) => ({ label, total: 0, active: 0 }));

    for (const key of dayKeys) {
      const weekday = new Date(`${key}T00:00:00.000Z`).getUTCDay();
      stats[weekday].total += 1;
      if (activityDayKeys.has(key)) stats[weekday].active += 1;
    }

    return stats
      .filter((item) => item.total >= 6 && item.active / item.total <= 0.35)
      .map((item) => item.label);
  }

  private detectBestReminderHour(events: any[]): number | null {
    const byHour = events.reduce<Record<number, { sent: number; opened: number; acted: number }>>((acc, event) => {
      const time = Date.parse(event.sent_at);
      if (!Number.isFinite(time)) return acc;
      const hour = new Date(time).getUTCHours();
      acc[hour] = acc[hour] ?? { sent: 0, opened: 0, acted: 0 };
      acc[hour].sent += 1;
      if (event.opened_at) acc[hour].opened += 1;
      if (event.acted_at) acc[hour].acted += 1;
      return acc;
    }, {});

    const candidates = Object.entries(byHour)
      .map(([hour, stats]) => ({
        hour: Number(hour),
        ...stats,
        actionRate: stats.sent > 0 ? stats.acted / stats.sent : 0,
        openRate: stats.sent > 0 ? stats.opened / stats.sent : 0,
      }))
      .filter((item) => item.sent >= 2);

    candidates.sort((a, b) => (
      b.actionRate - a.actionRate
      || b.acted - a.acted
      || b.openRate - a.openRate
      || a.hour - b.hour
    ));

    return candidates[0]?.hour ?? null;
  }

  private calculateBestStreak(dayKeys: string[], activeDayKeys: Set<string>): number {
    let current = 0;
    let best = 0;
    for (const key of dayKeys) {
      if (activeDayKeys.has(key)) {
        current += 1;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    }
    return best;
  }

  private buildBehaviorMemoryNotes(memory: BehaviorMemory): string[] {
    const notes: string[] = [];
    if (memory.data_quality === 'low') notes.push('Behavior memory is still warming up; use suggestions gently.');
    if (memory.often_skips_breakfast) notes.push('Breakfast is frequently missing from logged days.');
    if (memory.often_skips_lunch) notes.push('Lunch is frequently missing from logged days.');
    if (memory.often_skips_dinner) notes.push('Dinner is frequently missing from logged days.');
    if (memory.low_activity_days.length > 0) notes.push(`Activity is usually lowest on ${memory.low_activity_days.join(', ')}.`);
    if (memory.best_reminder_hour !== null) notes.push(`Reminder responses are strongest around ${memory.best_reminder_hour}:00.`);
    if (memory.high_protein_adherence < 0.5 && memory.data_quality !== 'low') notes.push('Protein adherence is a recurring weak point.');
    if (memory.best_logging_streak >= 7) notes.push(`Best logging streak is ${memory.best_logging_streak} days.`);
    return notes.slice(0, 5);
  }

  private createEmptyWeeklySummary(userId: string, weekStart: Date, dailyGoal: number): CoachingSummary {
    return {
      id: 0,
      user_id: userId,
      week_start_date: weekStart.toISOString().split('T')[0],
      logs_count: 0,
      adherence_percentage: 0,
      consistency_score: 0,
      primary_pattern: PatternType.INCONSISTENT_LOGGING,
      secondary_patterns: [],
      insights_generated: 0,
      total_calories: 0,
      average_daily_calories: 0,
      calorie_variance: 0,
      days_above_target: 0,
      days_below_target: 0,
      days_on_target: 0,
      recommended_action: 'Start with one meal log today. Even a rough estimate gives Coach enough context to personalize the next step.',
      priority_level: PriorityLevel.MEDIUM,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private organizeDailyData(logs: any[], dailyGoal: number): Record<string, DailyNutritionData> {
    const dailyData: Record<string, DailyNutritionData> = {};

    for (const log of logs) {
      const date = new Date(log.logged_at).toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = {
          date,
          total_calories: 0,
          meal_type_breakdown: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
          meals_logged: 0,
        };
      }
      dailyData[date].total_calories += log.calories;
      const mealKey = log.meal_type as keyof typeof dailyData[typeof date]['meal_type_breakdown'];
      dailyData[date].meal_type_breakdown[mealKey] = (dailyData[date].meal_type_breakdown[mealKey] || 0) + log.calories;
      dailyData[date].meals_logged++;
    }

    return dailyData;
  }

  private detectSkippedMeals(dailyData: Record<string, DailyNutritionData>, userId: string): BehavioralPattern | null {
    const mealsWithMissing = Object.values(dailyData).filter((day) => day.meals_logged < 2);
    if (mealsWithMissing.length >= 3) {
      return {
        id: 0,
        user_id: userId,
        pattern_type: PatternType.SKIPPED_MEALS,
        severity_level: mealsWithMissing.length >= 5 ? 4 : 2,
        first_detected_at: new Date().toISOString(),
        last_detected_at: new Date().toISOString(),
        frequency_score: mealsWithMissing.length / Object.keys(dailyData).length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return null;
  }

  private detectBingeEpisodes(dailyData: Record<string, DailyNutritionData>, userId: string, dailyGoal: number): BehavioralPattern | null {
    const bingeThreshold = dailyGoal * 1.5; // 150% of daily goal = binge
    const bingeEpisodes = Object.values(dailyData).filter((day) => day.total_calories > bingeThreshold);

    if (bingeEpisodes.length >= 2) {
      return {
        id: 0,
        user_id: userId,
        pattern_type: PatternType.BINGE_EPISODES,
        severity_level: bingeEpisodes.length >= 4 ? 5 : bingeEpisodes.length >= 3 ? 4 : 3,
        first_detected_at: new Date().toISOString(),
        last_detected_at: new Date().toISOString(),
        frequency_score: bingeEpisodes.length / Object.keys(dailyData).length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return null;
  }

  private detectNightEating(logs: any[], userId: string): BehavioralPattern | null {
    const nightLogs = logs.filter((log) => {
      const hour = new Date(log.logged_at).getHours();
      return hour >= 20 || hour < 6; // 8 PM to 6 AM
    });

    if (nightLogs.length >= 5) {
      return {
        id: 0,
        user_id: userId,
        pattern_type: PatternType.NIGHT_EATING,
        severity_level: nightLogs.length >= 10 ? 4 : 2,
        first_detected_at: new Date().toISOString(),
        last_detected_at: new Date().toISOString(),
        frequency_score: nightLogs.length / logs.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return null;
  }

  private detectWeekendVariance(dailyData: Record<string, DailyNutritionData>, userId: string, dailyGoal: number): BehavioralPattern | null {
    const weekdayDays = Object.entries(dailyData).filter(([date]) => {
      const dayOfWeek = new Date(date).getDay();
      return dayOfWeek !== 0 && dayOfWeek !== 6; // Not weekend
    });
    const weekendDays = Object.entries(dailyData).filter(([date]) => {
      const dayOfWeek = new Date(date).getDay();
      return dayOfWeek === 0 || dayOfWeek === 6; // Weekend only
    });

    if (weekdayDays.length === 0 || weekendDays.length === 0) return null;

    const weekdayAvg = weekdayDays.reduce((sum, [, day]) => sum + day.total_calories, 0) / weekdayDays.length;
    const weekendAvg = weekendDays.reduce((sum, [, day]) => sum + day.total_calories, 0) / weekendDays.length;

    if (!Number.isFinite(weekdayAvg) || weekdayAvg <= 0 || !Number.isFinite(weekendAvg)) return null;

    const variance = Math.abs(weekendAvg - weekdayAvg) / weekdayAvg;

    if (variance > 0.3) {
      // >30% difference
      return {
        id: 0,
        user_id: userId,
        pattern_type: PatternType.WEEKEND_VARIANCE,
        severity_level: variance > 0.5 ? 4 : 3,
        first_detected_at: new Date().toISOString(),
        last_detected_at: new Date().toISOString(),
        frequency_score: variance,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return null;
  }

  private detectInconsistentLogging(dailyData: Record<string, DailyNutritionData>, userId: string): BehavioralPattern | null {
    const daysLogged = Object.keys(dailyData).length;
    if (daysLogged < 4) {
      // Fewer than 4 days logged in a week
      return {
        id: 0,
        user_id: userId,
        pattern_type: PatternType.INCONSISTENT_LOGGING,
        severity_level: daysLogged <= 2 ? 5 : 3,
        first_detected_at: new Date().toISOString(),
        last_detected_at: new Date().toISOString(),
        frequency_score: 1 - daysLogged / 7,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return null;
  }

  private detectTimingPreference(logs: any[], userId: string): BehavioralPattern | null {
    const hourCounts: Record<number, number> = {};
    for (const log of logs) {
      const hour = new Date(log.logged_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
    if (sortedHours.length > 0 && sortedHours[0][1] >= logs.length * 0.4) {
      // More than 40% of logs at one hour
      return {
        id: 0,
        user_id: userId,
        pattern_type: PatternType.TIMING_PREFERENCE,
        severity_level: 2,
        first_detected_at: new Date().toISOString(),
        last_detected_at: new Date().toISOString(),
        frequency_score: sortedHours[0][1] / logs.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return null;
  }

  private getCanonicalInsightInfo(patternType: PatternType): { title: string; description: string; action: string; emoji: string } {
    const insights: Record<PatternType, { title: string; description: string; action: string; emoji: string }> = {
      [PatternType.SKIPPED_MEALS]: {
        title: 'Skipping meals',
        description: 'You skipped meals several times this week. That can make you overly hungry and more likely to overeat later.',
        action: 'Prepare a small meal or protein snack every 4-5 hours to keep energy steadier.',
        emoji: '⏭️',
      },
      [PatternType.BINGE_EPISODES]: {
        title: 'High-calorie spikes',
        description: 'Your data shows a few days with large calorie jumps, which can make weekly progress less stable.',
        action: 'Note the context, such as stress, poor sleep, or social meals, and plan a lighter fallback for next time.',
        emoji: '🍽️',
      },
      [PatternType.NIGHT_EATING]: {
        title: 'Late-night eating',
        description: 'A large share of calories is landing late in the day, which may affect sleep and next-day hunger.',
        action: 'Try finishing your last main meal about 2 hours before bed; if hungry, choose a light protein option.',
        emoji: '🌙',
      },
      [PatternType.WEEKEND_VARIANCE]: {
        title: 'Weekend variance',
        description: 'Weekend eating differs a lot from weekdays, making progress harder to keep consistent.',
        action: 'Pre-plan 1-2 key weekend meals so you can stay flexible without drifting too far.',
        emoji: '📅',
      },
      [PatternType.EMOTIONAL_TRIGGER]: {
        title: 'Emotional eating cue',
        description: 'Your eating pattern suggests mood may be influencing food choices.',
        action: 'Add a short mood note when logging meals so recurring triggers become easier to spot.',
        emoji: '💭',
      },
      [PatternType.INCONSISTENT_LOGGING]: {
        title: 'Logging gaps',
        description: 'You logged only a few days this week. Consistent logging helps the app calculate targets and coaching more accurately.',
        action: 'Set a reminder after meals. A rough estimate is still more useful than a blank day.',
        emoji: '📝',
      },
      [PatternType.STRESS_EATING]: {
        title: 'Stress eating',
        description: 'On higher-stress days, your calorie intake appears to rise noticeably.',
        action: 'Before eating more, try a 5-10 minute walk or a glass of water, then decide again.',
        emoji: '😰',
      },
      [PatternType.TIMING_PREFERENCE]: {
        title: 'Stable meal timing',
        description: 'You tend to eat at a consistent time window, which is a useful base for habit building.',
        action: 'Keep this rhythm and prepare suitable meals before your usual eating window.',
        emoji: '⏰',
      },
    };

    return insights[patternType] ?? {
      title: 'Behavior pattern found',
      description: 'The app found a notable pattern in your recent nutrition data.',
      action: 'Review the last few days of logs to understand what is repeating.',
      emoji: '🔍',
    };
  }

  private getCanonicalRecommendation(pattern: PatternType | undefined, adherence: number): string {
    if (!pattern) {
      if (adherence >= 80) return 'Great consistency this week. Keep the current rhythm.';
      if (adherence >= 60) return 'Solid progress. Logging a bit more consistently will make recommendations more accurate.';
      return 'You are moving in the right direction. Prioritize consistent logging before optimizing details.';
    }

    const recommendations: Record<PatternType, string> = {
      [PatternType.SKIPPED_MEALS]: 'Prioritize small, regular meals to avoid getting overly hungry late in the day.',
      [PatternType.BINGE_EPISODES]: 'Identify triggers and prepare an easier fallback meal before the next high-risk moment.',
      [PatternType.NIGHT_EATING]: 'Try finishing your last main meal about 2 hours before bed to support better sleep.',
      [PatternType.WEEKEND_VARIANCE]: 'Plan a few weekend choices in advance so you can enjoy flexibility without drifting too far.',
      [PatternType.STRESS_EATING]: 'Use one short stress-reduction action before deciding to eat more.',
      [PatternType.EMOTIONAL_TRIGGER]: 'Add mood notes when logging meals to spot recurring triggers.',
      [PatternType.INCONSISTENT_LOGGING]: 'Log right after meals, even roughly, so the data is not empty.',
      [PatternType.TIMING_PREFERENCE]: 'Use your natural eating window to keep a stable routine.',
    };

    return recommendations[pattern as PatternType];
  }

  private createInsightFromPattern(pattern: BehavioralPattern, userId: string): CoachingInsight {
    const insights: Record<PatternType, { title: string; description: string; action: string; emoji: string }> = {
      [PatternType.SKIPPED_MEALS]: {
        title: '⏭️ Bỏ bữa nhiều lần',
        description: 'Tuần này bạn bỏ bữa vài lần. Điều này dễ làm bạn đói quá mức và ăn bù về sau.',
        action: 'Chuẩn bị một bữa nhỏ mỗi 4-5 giờ để giữ năng lượng ổn định.',
        emoji: '⏭️',
      },
      [PatternType.BINGE_EPISODES]: {
        title: '🍽️ Ngày ăn vượt nhiều',
        description: 'Dữ liệu có vài ngày calo tăng vọt, khiến mục tiêu tuần khó ổn định.',
        action: 'Ghi lại bối cảnh như stress, thiếu ngủ hoặc tiệc để chuẩn bị phương án nhẹ hơn lần sau.',
        emoji: '🍽️',
      },
      [PatternType.NIGHT_EATING]: {
        title: '🌙 Ăn muộn buổi tối',
        description: 'Phần lớn calo đang rơi vào cuối ngày, có thể ảnh hưởng giấc ngủ và cảm giác đói hôm sau.',
        action: 'Thử chốt bữa trước giờ ngủ khoảng 2 tiếng; nếu đói hãy chọn đồ nhẹ giàu protein.',
        emoji: '🌙',
      },
      [PatternType.WEEKEND_VARIANCE]: {
        title: '📅 Cuối tuần lệch nhịp',
        description: 'Cách ăn cuối tuần khác khá nhiều so với ngày thường, làm tiến độ khó đều.',
        action: 'Chọn trước 1-2 bữa chính cuối tuần để vẫn linh hoạt mà không lệch quá xa.',
        emoji: '📅',
      },
      [PatternType.EMOTIONAL_TRIGGER]: {
        title: '💭 Ăn theo cảm xúc',
        description: 'Mẫu ăn uống cho thấy cảm xúc có thể đang ảnh hưởng đến lựa chọn món.',
        action: 'Khi log bữa, thêm một ghi chú ngắn về tâm trạng để nhận ra trigger.',
        emoji: '💭',
      },
      [PatternType.INCONSISTENT_LOGGING]: {
        title: '📝 Ghi chép chưa đều',
        description: 'Tuần này bạn chỉ log vài ngày. Log đều giúp app tính mục tiêu và gợi ý chính xác hơn.',
        action: 'Đặt nhắc nhở sau mỗi bữa. Ước lượng nhanh vẫn hữu ích hơn bỏ trống.',
        emoji: '📝',
      },
      [PatternType.STRESS_EATING]: {
        title: '😰 Ăn khi căng thẳng',
        description: 'Những ngày stress cao, lượng calo của bạn có xu hướng tăng rõ.',
        action: 'Trước khi ăn thêm, thử đi bộ 5-10 phút hoặc uống nước rồi quyết định lại.',
        emoji: '😰',
      },
      [PatternType.TIMING_PREFERENCE]: {
        title: '⏰ Khung giờ ăn ổn định',
        description: 'Bạn có xu hướng ăn vào khung giờ khá ổn định, đây là nền tốt để duy trì thói quen.',
        action: 'Giữ nhịp này và chuẩn bị sẵn bữa phù hợp trước khung giờ quen thuộc.',
        emoji: '⏰',
      },
    };

    const info = insights[pattern.pattern_type] || {
      title: 'Phát hiện mẫu hành vi',
      description: 'App phát hiện một mẫu đáng chú ý trong dữ liệu ăn uống gần đây.',
      action: 'Xem lại nhật ký vài ngày gần nhất để hiểu điều gì đang lặp lại.',
      emoji: '🔍',
    };

    void info;
    const canonicalInfo = this.getCanonicalInsightInfo(pattern.pattern_type);

    return {
      id: 0,
      user_id: userId,
      insight_type: pattern.severity_level >= 4 ? InsightType.WARNING : InsightType.PATTERN_ALERT,
      title: canonicalInfo.title,
      description: canonicalInfo.description,
      action_suggestion: canonicalInfo.action,
      impact_score: pattern.severity_level * 2,
      pattern_id: pattern.id,
      is_acknowledged: false,
      created_at: new Date().toISOString(),
      emoji: canonicalInfo.emoji,
    };
  }

  private generateRecommendation(pattern: PatternType | undefined, adherence: number): string {
    return this.getCanonicalRecommendation(pattern, adherence);

    if (!pattern) {
      if (adherence >= 80) return '🎉 Tuần này rất đều. Giữ nhịp hiện tại là đủ tốt.';
      if (adherence >= 60) return '👍 Tiến độ ổn. Log đều hơn một chút sẽ giúp gợi ý chính xác hơn.';
      return '📈 Bạn đang đi đúng hướng. Hãy ưu tiên log đều trước khi tối ưu sâu.';
    }

    const recommendations: Record<PatternType, string> = {
      [PatternType.SKIPPED_MEALS]: 'Ưu tiên bữa nhỏ đều hơn để tránh đói quá mức vào cuối ngày.',
      [PatternType.BINGE_EPISODES]: 'Nhận diện trigger và chuẩn bị trước bữa thay thế dễ kiểm soát hơn.',
      [PatternType.NIGHT_EATING]: 'Thử chốt bữa trước giờ ngủ khoảng 2 tiếng để ngủ tốt hơn.',
      [PatternType.WEEKEND_VARIANCE]: 'Lên trước vài lựa chọn cuối tuần để vẫn vui mà không lệch quá xa.',
      [PatternType.STRESS_EATING]: 'Dùng một hành động giảm stress ngắn trước khi quyết định ăn thêm.',
      [PatternType.EMOTIONAL_TRIGGER]: 'Ghi chú cảm xúc khi log bữa để nhận ra trigger lặp lại.',
      [PatternType.INCONSISTENT_LOGGING]: 'Log ngay sau bữa, kể cả ước lượng nhanh, để dữ liệu không bị rỗng.',
      [PatternType.TIMING_PREFERENCE]: 'Tận dụng khung giờ ăn tự nhiên để duy trì nhịp ổn định.',
    };

    return recommendations[pattern as PatternType];
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }
}
