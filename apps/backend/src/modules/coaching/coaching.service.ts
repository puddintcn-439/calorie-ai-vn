import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  BehavioralPattern,
  CoachingInsight,
  CoachingSummary,
  DailyNutritionData,
  PatternType,
  InsightType,
  PriorityLevel,
} from '@calorie-ai/types';

@Injectable()
export class CoachingService {
  private readonly logger = new Logger(CoachingService.name);

  constructor(private supabase: SupabaseService) {}

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

      if (error || !logs || logs.length === 0) {
        return null;
      }

      // Get target from users table
      const { data: userProfile } = await this.supabase.db
        .from('users')
        .select('daily_calorie_target')
        .eq('id', userId)
        .single();

      const dailyGoal = userProfile?.daily_calorie_target ?? 2000;

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
    const weekdayAvg = Object.entries(dailyData)
      .filter(([date]) => {
        const dayOfWeek = new Date(date).getDay();
        return dayOfWeek !== 0 && dayOfWeek !== 6; // Not weekend
      })
      .reduce((sum, [, day]) => sum + day.total_calories, 0) / 5;

    const weekendAvg = Object.entries(dailyData)
      .filter(([date]) => {
        const dayOfWeek = new Date(date).getDay();
        return dayOfWeek === 0 || dayOfWeek === 6; // Weekend only
      })
      .reduce((sum, [, day]) => sum + day.total_calories, 0) / 2;

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

    return {
      id: 0,
      user_id: userId,
      insight_type: pattern.severity_level >= 4 ? InsightType.WARNING : InsightType.PATTERN_ALERT,
      title: info.title,
      description: info.description,
      action_suggestion: info.action,
      impact_score: pattern.severity_level * 2,
      pattern_id: pattern.id,
      is_acknowledged: false,
      created_at: new Date().toISOString(),
      emoji: info.emoji,
    };
  }

  private generateRecommendation(pattern: PatternType | undefined, adherence: number): string {
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

    return recommendations[pattern];
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }
}
