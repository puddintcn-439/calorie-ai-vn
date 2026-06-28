import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { WeeklyInsights, DailyInsight, MacroBreakdown, MealTypeBreakdown } from '@calorie-ai/types';

@Injectable()
export class InsightsService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Get weekly insights for a user (current week or specified week)
   */
  async getWeeklyInsights(userId: string, weekStartDate?: string): Promise<WeeklyInsights> {
    // Determine week boundaries
    const now = new Date();
    let startDate: Date;

    if (weekStartDate) {
      startDate = new Date(weekStartDate);
    } else {
      // Get current week (Monday = 0 offset)
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now.setDate(diff));
    }

    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    const startISO = startDate.toISOString().split('T')[0];
    const endISO = endDate.toISOString().split('T')[0];

    // Fetch user's daily calorie target
    const { data: userData } = await this.supabase.db
      .from('users')
      .select('daily_calorie_target')
      .eq('id', userId)
      .single();

    const persistedTarget = Number(userData?.daily_calorie_target);
    const dailyTarget = Number.isFinite(persistedTarget) && persistedTarget > 0
      ? persistedTarget
      : null;

    // Fetch all logs for the week
    const { data: logs, error } = await this.supabase.db
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', `${startISO}T00:00:00`)
      .lte('logged_at', `${endISO}T23:59:59`)
      .order('logged_at', { ascending: true });

    if (error) throw error;

    // Build daily insights for each day of the week
    const dailyInsights: DailyInsight[] = [];
    let totalWeeklyCalories = 0;
    let totalWeeklyProtein = 0;
    let totalWeeklyCarbs = 0;
    let totalWeeklyFat = 0;
    let totalMealsLogged = 0;
    let daysOnTarget = 0;
    let bestDayCalories = 0;
    let worstDayCalories = Infinity;

    const mealBreakdown: MealTypeBreakdown = {
      breakfast_calories: 0,
      lunch_calories: 0,
      dinner_calories: 0,
      snack_calories: 0,
      breakfast_count: 0,
      lunch_count: 0,
      dinner_count: 0,
      snack_count: 0,
    };

    // Group logs by day
    const logsByDay: Record<string, any[]> = {};
    const logsArray = logs ?? [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      logsByDay[dateStr] = [];
    }

    for (const log of logsArray) {
      const dateStr = new Date(log.logged_at).toISOString().split('T')[0];
      if (logsByDay[dateStr]) {
        logsByDay[dateStr].push(log);
      }
    }

    // Calculate daily insights
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayLogs = logsByDay[dateStr] ?? [];

      const dayCalories = dayLogs.reduce((s, l) => s + l.calories, 0);
      const dayProtein = dayLogs.reduce((s, l) => s + l.protein_g, 0);
      const dayCarbs = dayLogs.reduce((s, l) => s + l.carbs_g, 0);
      const dayFat = dayLogs.reduce((s, l) => s + l.fat_g, 0);
      const adherence = dailyTarget === null ? null : (dayCalories / dailyTarget) * 100;

      dailyInsights.push({
        date: dateStr,
        day_name: dayNames[date.getDay()],
        calories: dayCalories,
        protein_g: dayProtein,
        carbs_g: dayCarbs,
        fat_g: dayFat,
        calorie_target: dailyTarget,
        adherence_percentage: adherence === null ? null : Math.round(adherence),
        meal_count: dayLogs.length,
      });

      totalWeeklyCalories += dayCalories;
      totalWeeklyProtein += dayProtein;
      totalWeeklyCarbs += dayCarbs;
      totalWeeklyFat += dayFat;
      totalMealsLogged += dayLogs.length;

      // Track best/worst days
      if (dayCalories > 0) {
        bestDayCalories = Math.max(bestDayCalories, dayCalories);
        worstDayCalories = Math.min(worstDayCalories, dayCalories);
      }

      // Count days on target (within 90-110% of target)
      if (adherence !== null && adherence >= 90 && adherence <= 110) {
        daysOnTarget++;
      }

      // Breakdown by meal type
      for (const log of dayLogs) {
        const mealType = log.meal_type as 'breakfast' | 'lunch' | 'dinner' | 'snack';
        mealBreakdown[`${mealType}_calories`] += log.calories;
        mealBreakdown[`${mealType}_count`] += 1;
      }
    }

    // Calculate macro breakdown
    const totalMacros = totalWeeklyProtein + totalWeeklyCarbs + totalWeeklyFat;
    const macroBreakdown: MacroBreakdown = {
      protein_percentage: totalMacros > 0 ? Math.round((totalWeeklyProtein / totalMacros) * 100) : 0,
      carbs_percentage: totalMacros > 0 ? Math.round((totalWeeklyCarbs / totalMacros) * 100) : 0,
      fat_percentage: totalMacros > 0 ? Math.round((totalWeeklyFat / totalMacros) * 100) : 0,
      protein_grams: Math.round(totalWeeklyProtein),
      carbs_grams: Math.round(totalWeeklyCarbs),
      fat_grams: Math.round(totalWeeklyFat),
    };

    // Calculate trend vs last week
    const lastWeekStart = new Date(startDate);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);

    const lastWeekStartISO = lastWeekStart.toISOString().split('T')[0];
    const lastWeekEndISO = lastWeekEnd.toISOString().split('T')[0];

    const { data: lastWeekLogs } = await this.supabase.db
      .from('food_logs')
      .select('calories')
      .eq('user_id', userId)
      .gte('logged_at', `${lastWeekStartISO}T00:00:00`)
      .lte('logged_at', `${lastWeekEndISO}T23:59:59`);

    const lastWeekTotal = (lastWeekLogs ?? []).reduce((s, l) => s + l.calories, 0);
    const lastWeekAvg = lastWeekLogs && lastWeekLogs.length > 0 ? lastWeekTotal / 7 : 0;
    const currentWeekAvg = totalWeeklyCalories / 7;
    const trendVsLastWeek = lastWeekAvg > 0 ? ((currentWeekAvg - lastWeekAvg) / lastWeekAvg) * 100 : 0;

    // Format period string (e.g., "May 3-9, 2026")
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = monthNames[startDate.getMonth()];
    const year = startDate.getFullYear();
    const period = `${month} ${startDate.getDate()}-${endDate.getDate()}, ${year}`;

    return {
      period,
      week_start_date: startISO,
      week_end_date: endISO,
      daily_insights: dailyInsights,
      weekly_calories_total: totalWeeklyCalories,
      weekly_calorie_target: dailyTarget === null ? null : dailyTarget * 7,
      weekly_adherence_percentage: dailyTarget === null
        ? null
        : Math.round((totalWeeklyCalories / (dailyTarget * 7)) * 100),
      target_status: dailyTarget === null ? 'needs_profile' : 'ready',
      total_meals_logged: totalMealsLogged,
      average_calories_per_day: Math.round(currentWeekAvg),
      macro_breakdown: macroBreakdown,
      meal_breakdown: mealBreakdown,
      days_on_target: daysOnTarget,
      best_day_calories: bestDayCalories,
      worst_day_calories: worstDayCalories === Infinity ? 0 : worstDayCalories,
      trend_vs_last_week: Math.round(trendVsLastWeek),
    };
  }
}
