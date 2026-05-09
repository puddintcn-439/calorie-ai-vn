import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { CalorieTargetService } from '../calorie-target/calorie-target.service';
import { UserProfile } from '@calorie-ai/types';

export interface WeeklyAdaptiveResult {
  user_id: string;
  original_daily_target: number;
  adjusted_daily_target: number;
  adjustment_percentage: number;
  adherence_last_week: number;
  recommendation: string;
  last_updated: string;
}

@Injectable()
export class WeeklyAdaptiveService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly calorieTargetService: CalorieTargetService,
  ) {}

  /**
   * Get logs for the last 7 days
   */
  private async getLast7DaysLogs(
    user_id: string,
  ): Promise<{ date: string; total_calories: number }[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data } = await this.supabaseService.db
      .from('logs')
      .select('created_at, calories')
      .eq('user_id', user_id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (!data || data.length === 0) {
      return [];
    }

    // Group by date and sum calories
    const dailyTotals: Record<string, number> = {};
    for (const log of data) {
      const date = log.created_at.split('T')[0];
      dailyTotals[date] = (dailyTotals[date] || 0) + log.calories;
    }

    return Object.entries(dailyTotals).map(([date, total_calories]) => ({
      date,
      total_calories,
    }));
  }

  /**
   * Calculate adherence percentage for last 7 days
   * Perfect adherence = 100% (on target each day)
   * Under target = <100%, Over target = >100%
   */
  private calculateAdherence(
    logs: { date: string; total_calories: number }[],
    daily_target: number,
  ): number {
    if (logs.length === 0) {
      return 100; // Default to 100% if no data
    }

    // Calculate average adherence over 7 days
    let totalAdherence = 0;
    for (const log of logs) {
      const adherence = (log.total_calories / daily_target) * 100;
      totalAdherence += adherence;
    }

    return Math.min(totalAdherence / logs.length, 200); // Cap at 200% adherence
  }

  /**
   * Determine adjustment based on adherence
   * <70% adherence: increase target by 5% (eating too little)
   * 70-90% adherence: maintain target
   * 90-110% adherence: slight increase by 2% (positive trend)
   * 110-130% adherence: decrease by 3% (eating slightly more)
   * >130% adherence: decrease by 8% (eating too much)
   */
  private getAdjustmentFactor(adherence: number): number {
    if (adherence < 70) {
      return 1.05; // +5%
    } else if (adherence < 90) {
      return 1.0; // Maintain
    } else if (adherence <= 110) {
      return 1.0; // Maintain
    } else if (adherence < 130) {
      return 0.97; // -3%
    } else {
      return 0.92; // -8%
    }
  }

  /**
   * Generate personalized recommendation
   */
  private getRecommendation(adherence: number, adjustment: number): string {
    if (adherence < 70) {
      return 'You are eating significantly below target. Consider increasing portion sizes or adding snacks. Target increased by 5%.';
    } else if (adherence < 90) {
      return 'You are eating below target. Try adding an extra snack or increasing meal portions. Maintain current target.';
    } else if (adherence <= 110) {
      return 'Great adherence! You are staying close to your target. Maintain current target.';
    } else if (adherence < 130) {
      return 'You are eating slightly above target. Consider reducing portion sizes. Target decreased by 3%.';
    } else {
      return 'You are eating significantly above target. Focus on portion control and meal planning. Target decreased by 8%.';
    }
  }

  /**
   * Calculate weekly adaptive adjustment
   */
  async calculateWeeklyAdjustment(
    user_id: string,
    profile: UserProfile,
  ): Promise<WeeklyAdaptiveResult> {
    // Get current target
    const currentTarget = profile.daily_calorie_target || 2000;

    // Get last 7 days logs
    const logs = await this.getLast7DaysLogs(user_id);

    // Calculate adherence
    const adherence = this.calculateAdherence(logs, currentTarget);

    // Get adjustment factor
    const adjustmentFactor = this.getAdjustmentFactor(adherence);

    // Calculate new target
    const adjustedTarget = Math.round(currentTarget * adjustmentFactor);

    // Generate recommendation
    const recommendation = this.getRecommendation(adherence, adjustmentFactor);

    return {
      user_id,
      original_daily_target: currentTarget,
      adjusted_daily_target: adjustedTarget,
      adjustment_percentage: Math.round((adjustmentFactor - 1) * 100 * 10) / 10,
      adherence_last_week: Math.round(adherence * 10) / 10,
      recommendation,
      last_updated: new Date().toISOString(),
    };
  }

  /**
   * Apply weekly adjustment to user profile and persist
   */
  async applyWeeklyAdjustment(
    user_id: string,
    profile: UserProfile,
  ): Promise<WeeklyAdaptiveResult> {
    const adjustment = await this.calculateWeeklyAdjustment(user_id, profile);

    // Update user profile with new target
    const mealBreakdown = this.getMealBreakdown(adjustment.adjusted_daily_target);

    await this.supabaseService.db
      .from('users')
      .update({
        daily_calorie_target: adjustment.adjusted_daily_target,
        target_breakfast_cal: mealBreakdown.breakfast,
        target_lunch_cal: mealBreakdown.lunch,
        target_dinner_cal: mealBreakdown.dinner,
        target_snack_cal: mealBreakdown.snack,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user_id);

    return adjustment;
  }

  /**
   * Get meal breakdown distribution (same as CalorieTargetService)
   */
  private getMealBreakdown(
    total_calories: number,
  ): {
    breakfast: number;
    lunch: number;
    dinner: number;
    snack: number;
  } {
    return {
      breakfast: Math.round(total_calories * 0.25),
      lunch: Math.round(total_calories * 0.35),
      dinner: Math.round(total_calories * 0.3),
      snack: Math.round(total_calories * 0.1),
    };
  }
}
