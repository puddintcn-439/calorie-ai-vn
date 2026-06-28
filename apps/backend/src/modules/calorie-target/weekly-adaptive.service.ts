import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { CalorieTargetService } from '../calorie-target/calorie-target.service';
import { UserProfile } from '@calorie-ai/types';
import { calculateDefaultMealTargets } from './meal-target.policy';

export interface WeeklyAdaptiveResult {
  user_id: string;
  original_daily_target: number;
  adjusted_daily_target: number;
  adjustment_percentage: number;
  adherence_last_week: number;
  recommendation: string;
  last_updated: string;
  // audit fields
  algorithm_version?: string;
  clamp_reason?: string | null;
  actual_tdee?: number | null;
  actual_tdee_method?: 'static_7700_weight_change_estimate' | null;
  actual_tdee_evidence_level?: 'evidence_informed_heuristic' | null;
  days_logged?: number;
  weight_logs?: number;
}

@Injectable()
export class WeeklyAdaptiveService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly calorieTargetService: CalorieTargetService,
  ) {}

  private readonly MIN_DAYS_FOR_ADAPTIVE = 14;
  private readonly SMOOTHING_WINDOW_DAYS = 14;
  private readonly WEEKLY_CHANGE_CAP = 150; // kcal per week
  private readonly MAX_DEFICIT_PCT = 0.2;
  private readonly ALGORITHM_VERSION = 'v1.1';

  /**
   * Get logs for the last 7 days
   */
  private async getLast7DaysLogs(
    user_id: string,
  ): Promise<{ date: string; total_calories: number }[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data } = await this.supabaseService.db
      .from('food_logs')
      .select('logged_at, calories')
      .eq('user_id', user_id)
      .gte('logged_at', sevenDaysAgo.toISOString())
      .order('logged_at', { ascending: true });

    if (!data || data.length === 0) {
      return [];
    }

    // Group by date and sum calories
    const dailyTotals: Record<string, number> = {};
    for (const log of data) {
      const date = log.logged_at.split('T')[0];
      dailyTotals[date] = (dailyTotals[date] || 0) + log.calories;
    }

    return Object.entries(dailyTotals).map(([date, total_calories]) => ({
      date,
      total_calories,
    }));
  }

  private async getLastNDaysLogs(
    user_id: string,
    days: number,
  ): Promise<{ date: string; total_calories: number }[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data } = await this.supabaseService.db
      .from('food_logs')
      .select('logged_at, calories')
      .eq('user_id', user_id)
      .gte('logged_at', since.toISOString())
      .order('logged_at', { ascending: true });

    if (!data || data.length === 0) return [];

    const dailyTotals: Record<string, number> = {};
    for (const log of data) {
      const date = log.logged_at.split('T')[0];
      dailyTotals[date] = (dailyTotals[date] || 0) + log.calories;
    }

    return Object.entries(dailyTotals).map(([date, total_calories]) => ({
      date,
      total_calories,
    }));
  }

  private async getLastNDaysWeights(
    user_id: string,
    days: number,
  ): Promise<{ date: string; weight_kg: number }[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data } = await this.supabaseService.db
      .from('body_progress')
      .select('recorded_at, weight_kg')
      .eq('user_id', user_id)
      .gte('recorded_at', since.toISOString())
      .order('recorded_at', { ascending: true });

    if (!data || data.length === 0) return [];

    return data.map((d: any) => {
      const rawDate = d.recorded_at || d.logged_at || d.recorded_at;
      const date = rawDate ? rawDate.split('T')[0] : ''; 
      const weight = typeof d.weight_kg === 'number' ? d.weight_kg : d.weight;
      return { date, weight_kg: weight };
    });
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
    const currentTarget = Number(profile.daily_calorie_target);
    if (!Number.isFinite(currentTarget) || currentTarget <= 0) {
      throw new BadRequestException('A backend-generated calorie target is required before adaptive adjustment.');
    }

    // Get recent logs and weights
    const logs = await this.getLastNDaysLogs(user_id, this.SMOOTHING_WINDOW_DAYS);
    const weightSeries = await this.getLastNDaysWeights(user_id, this.SMOOTHING_WINDOW_DAYS);

    const daysLogged = logs.length;
    const weightLogs = weightSeries.length;

    // Average calories over the smoothing window
    const avgCalories = daysLogged === 0 ? 0 : Math.round(logs.reduce((s, r) => s + r.total_calories, 0) / daysLogged);

    // Estimate weekly weight change (kg/week) using closest-to-7d entries
    let weeklyWeightChange: number | null = null;
    if (weightSeries.length > 0) {
      const sorted = [...weightSeries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const latest = sorted[sorted.length - 1];
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const entrySevenDaysAgo = sorted.filter((e) => new Date(e.date) <= sevenDaysAgo).pop() || sorted[0];
      if (latest && entrySevenDaysAgo && typeof latest.weight_kg === 'number' && typeof entrySevenDaysAgo.weight_kg === 'number') {
        weeklyWeightChange = Math.round((latest.weight_kg - entrySevenDaysAgo.weight_kg) * 10) / 10;
      }
    }

    // Data quality checks
    const dataQuality = daysLogged >= this.MIN_DAYS_FOR_ADAPTIVE && weightLogs >= 4 && weeklyWeightChange != null && Math.abs(weeklyWeightChange) <= 2;

    let adjustedTarget = currentTarget;
    let adjustmentPercentage = 0;
    let recommendation = 'Maintain target';
    let clamp_reason: string | null = null;
    let actualTDEE: number | null = null;

    const safetyBaseline = this.calorieTargetService.calculateTarget({
      weight_kg: profile.weight_kg || 70,
      height_cm: profile.height_cm || 170,
      age: profile.age || 30,
      gender: profile.gender || 'female',
      activity_level: profile.activity_level || 'sedentary',
      goal: profile.goal || 'maintain',
      health_flags: profile.health_flags,
    } as any);

    if (safetyBaseline.medical_review_recommended) {
      return {
        user_id,
        original_daily_target: currentTarget,
        adjusted_daily_target: currentTarget,
        adjustment_percentage: 0,
        adherence_last_week: daysLogged === 0 ? 0 : this.calculateAdherence(logs, currentTarget),
        recommendation: 'Automatic weekly target changes are paused because this profile needs medical review.',
        last_updated: new Date().toISOString(),
        algorithm_version: this.ALGORITHM_VERSION,
        clamp_reason: 'medical_review_required',
        actual_tdee: null,
        days_logged: daysLogged,
        weight_logs: weightLogs,
      };
    }

    if (dataQuality) {
      // Compute ActualTDEE
      actualTDEE = Math.round(avgCalories - (7700 * (weeklyWeightChange as number) / 7));

      // Determine goal factor (conservative adaptive changes)
      const goalFactorMap: Record<string, number> = {
        lose_weight: 0.9,
        maintain: 1.0,
        gain_muscle: 1.08,
      };
      const safeGoal = safetyBaseline.effective_goal || profile.goal || 'maintain';
      const goalFactor = goalFactorMap[safeGoal] ?? 1.0;

      let proposed = Math.round(actualTDEE * goalFactor);

      // Use CalorieTargetService to get BMR/TDEE for floors
      const dto = {
        weight_kg: profile.weight_kg || 70,
        height_cm: profile.height_cm || 170,
        age: profile.age || 30,
        gender: profile.gender || 'female',
        activity_level: profile.activity_level || 'sedentary',
        goal: profile.goal || 'maintain',
        health_flags: profile.health_flags,
      } as any;
      const baseline = this.calorieTargetService.calculateTarget(dto);
      const min_allowed = profile.gender === 'female' ? 1200 : 1500;
      const min_by_deficit = Math.round((baseline.tdee || proposed) * (1 - this.MAX_DEFICIT_PCT));

      if (proposed < min_allowed) {
        clamp_reason = 'min_allowed_floor';
        proposed = min_allowed;
      }
      if (proposed < min_by_deficit) {
        clamp_reason = clamp_reason || 'max_deficit_pct';
        proposed = min_by_deficit;
      }

      // Apply weekly change cap
      const delta = proposed - currentTarget;
      const cappedDelta = Math.max(Math.min(delta, this.WEEKLY_CHANGE_CAP), -this.WEEKLY_CHANGE_CAP);
      if (cappedDelta !== delta) clamp_reason = clamp_reason || 'weekly_change_cap';
      adjustedTarget = Math.round(currentTarget + cappedDelta);

      adjustmentPercentage = Math.round(((adjustedTarget / currentTarget) - 1) * 100 * 10) / 10;
      recommendation = `Adaptive update based on ActualTDEE (${this.ALGORITHM_VERSION})`;
    } else {
      // Fallback to adherence-based heuristic
      const logs7 = await this.getLast7DaysLogs(user_id);
      const adherence = this.calculateAdherence(logs7, currentTarget);

      // Apply weekly cap & clamps similar to above
      const dto = {
        weight_kg: profile.weight_kg || 70,
        height_cm: profile.height_cm || 170,
        age: profile.age || 30,
        gender: profile.gender || 'female',
        activity_level: profile.activity_level || 'sedentary',
        goal: profile.goal || 'maintain',
        health_flags: profile.health_flags,
      } as any;
      const baseline = this.calorieTargetService.calculateTarget(dto);
      const profileGoal = profile.goal || 'maintain';
      const adjustmentFactor = baseline.effective_goal && baseline.effective_goal !== profileGoal
        ? 1
        : this.getAdjustmentFactor(adherence);
      const rawAdjusted = Math.round(currentTarget * adjustmentFactor);
      const min_allowed = profile.gender === 'female' ? 1200 : 1500;
      const min_by_deficit = Math.round((baseline.tdee || rawAdjusted) * (1 - this.MAX_DEFICIT_PCT));
      let proposed = Math.max(rawAdjusted, min_allowed, min_by_deficit);
      const delta = proposed - currentTarget;
      const cappedDelta = Math.max(Math.min(delta, this.WEEKLY_CHANGE_CAP), -this.WEEKLY_CHANGE_CAP);
      if (cappedDelta !== delta) clamp_reason = 'weekly_change_cap';
      adjustedTarget = Math.round(currentTarget + cappedDelta);
      adjustmentPercentage = Math.round(((adjustedTarget / currentTarget) - 1) * 100 * 10) / 10;
      recommendation = this.getRecommendation(adherence, adjustmentFactor);
    }

    return {
      user_id,
      original_daily_target: currentTarget,
      adjusted_daily_target: adjustedTarget,
      adjustment_percentage: adjustmentPercentage,
      adherence_last_week: Math.round((daysLogged === 0 ? 100 : this.calculateAdherence(logs, currentTarget)) * 10) / 10,
      recommendation,
      last_updated: new Date().toISOString(),
      algorithm_version: this.ALGORITHM_VERSION,
      clamp_reason,
      actual_tdee: actualTDEE,
      actual_tdee_method: actualTDEE === null ? null : 'static_7700_weight_change_estimate',
      actual_tdee_evidence_level: actualTDEE === null ? null : 'evidence_informed_heuristic',
      days_logged: daysLogged,
      weight_logs: weightLogs,
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
    const mealBreakdown = calculateDefaultMealTargets(adjustment.adjusted_daily_target);
    const nutritionTarget = this.calorieTargetService.calculateDailyNutritionTarget(
      {
        ...profile,
        daily_calorie_target: adjustment.adjusted_daily_target,
      },
      new Date().toISOString().split('T')[0],
      adjustment.adjusted_daily_target,
    );

    await this.supabaseService.db
      .from('users')
      .update({
        daily_calorie_target: adjustment.adjusted_daily_target,
        target_breakfast_cal: mealBreakdown.breakfast,
        target_lunch_cal: mealBreakdown.lunch,
        target_dinner_cal: mealBreakdown.dinner,
        target_snack_cal: mealBreakdown.snack,
        nutrition_target_snapshot: nutritionTarget,
        nutrition_algorithm_version: nutritionTarget.algorithm_version,
        nutrition_target_calculated_at: nutritionTarget.calculated_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user_id);

    return adjustment;
  }
}
