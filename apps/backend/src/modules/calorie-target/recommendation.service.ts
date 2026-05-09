import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { UserProfile } from '@calorie-ai/types';

export interface MealRecommendation {
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recommended_calories: number;
  suggested_foods: {
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }[];
  tips: string;
}

export interface WeeklyRecommendations {
  user_id: string;
  date: string;
  daily_target: number;
  remaining_calories: number;
  meals: MealRecommendation[];
  weekly_insights: {
    average_adherence: number;
    trend: 'improving' | 'stable' | 'declining';
    suggestion: string;
  };
}

@Injectable()
export class RecommendationService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Get recommended foods for a meal based on remaining calories
   */
  private async getRecommendedFoods(
    remaining_calories: number,
    meal_type: string,
    limit: number = 5,
  ): Promise<
    {
      name: string;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }[]
  > {
    const tolerance = remaining_calories * 0.2; // ±20% tolerance

    const { data } = await this.supabaseService.db
      .from('foods')
      .select('name, calories, protein_g, carbs_g, fat_g')
      .gte('calories', remaining_calories - tolerance)
      .lte('calories', remaining_calories + tolerance)
      .order('nutrient_confidence', { ascending: false })
      .limit(limit);

    return data || [];
  }

  /**
   * Calculate recommendations for each meal
   */
  async getWeeklyRecommendations(
    user_id: string,
    profile: UserProfile,
  ): Promise<WeeklyRecommendations> {
    const dailyTarget = profile.daily_calorie_target || 2000;

    // Get today's logs
    const today = new Date().toISOString().split('T')[0];
    const { data: todayLogs } = await this.supabaseService.db
      .from('logs')
      .select('calories')
      .eq('user_id', user_id)
      .gte('created_at', `${today}T00:00:00Z`);

    const consumedToday = (todayLogs || []).reduce(
      (sum, log) => sum + log.calories,
      0,
    );
    const remainingCalories = Math.max(0, dailyTarget - consumedToday);

    // Get meal targets
    const breakfastTarget = profile.target_breakfast_cal || Math.round(dailyTarget * 0.25);
    const lunchTarget = profile.target_lunch_cal || Math.round(dailyTarget * 0.35);
    const dinnerTarget = profile.target_dinner_cal || Math.round(dailyTarget * 0.3);
    const snackTarget = profile.target_snack_cal || Math.round(dailyTarget * 0.1);

    // Calculate recommended foods for each meal
    const [breakfastFoods, lunchFoods, dinnerFoods, snackFoods] = await Promise.all(
      [
        this.getRecommendedFoods(breakfastTarget, 'breakfast'),
        this.getRecommendedFoods(lunchTarget, 'lunch'),
        this.getRecommendedFoods(dinnerTarget, 'dinner'),
        this.getRecommendedFoods(snackTarget, 'snack'),
      ],
    );

    // Get weekly insights
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: weekLogs } = await this.supabaseService.db
      .from('logs')
      .select('created_at, calories')
      .eq('user_id', user_id)
      .gte('created_at', sevenDaysAgo.toISOString());

    const weeklyAdherence = this.calculateWeeklyAdherence(
      weekLogs || [],
      dailyTarget,
    );
    const trend = this.calculateTrend(consumedToday, dailyTarget);

    return {
      user_id,
      date: today,
      daily_target: dailyTarget,
      remaining_calories: remainingCalories,
      meals: [
        {
          meal_type: 'breakfast',
          recommended_calories: breakfastTarget,
          suggested_foods: breakfastFoods,
          tips: 'Start your day with protein and complex carbs for sustained energy.',
        },
        {
          meal_type: 'lunch',
          recommended_calories: lunchTarget,
          suggested_foods: lunchFoods,
          tips: 'Include vegetables for micronutrients and fiber.',
        },
        {
          meal_type: 'dinner',
          recommended_calories: dinnerTarget,
          suggested_foods: dinnerFoods,
          tips: 'Balance protein with healthy fats and vegetables.',
        },
        {
          meal_type: 'snack',
          recommended_calories: snackTarget,
          suggested_foods: snackFoods,
          tips: 'Choose protein-rich snacks to stay satisfied between meals.',
        },
      ],
      weekly_insights: {
        average_adherence: weeklyAdherence,
        trend,
        suggestion: this.getSuggestion(weeklyAdherence, trend),
      },
    };
  }

  /**
   * Calculate average adherence for the week
   */
  private calculateWeeklyAdherence(
    logs: { created_at: string; calories: number }[],
    dailyTarget: number,
  ): number {
    if (logs.length === 0) {
      return 100;
    }

    // Group logs by date
    const dailyTotals: Record<string, number> = {};
    for (const log of logs) {
      const date = log.created_at.split('T')[0];
      dailyTotals[date] = (dailyTotals[date] || 0) + log.calories;
    }

    const adherences = Object.values(dailyTotals).map(
      (calories) => (calories / dailyTarget) * 100,
    );
    const average =
      adherences.reduce((sum, a) => sum + a, 0) / adherences.length;

    return Math.min(Math.round(average * 10) / 10, 200);
  }

  /**
   * Determine adherence trend
   */
  private calculateTrend(
    consumedToday: number,
    dailyTarget: number,
  ): 'improving' | 'stable' | 'declining' {
    const adherence = (consumedToday / dailyTarget) * 100;

    if (adherence < 80) {
      return 'declining';
    } else if (adherence > 120) {
      return 'declining';
    } else {
      return 'stable';
    }
  }

  /**
   * Generate personalized suggestion
   */
  private getSuggestion(
    adherence: number,
    trend: 'improving' | 'stable' | 'declining',
  ): string {
    if (trend === 'declining' && adherence < 80) {
      return 'You are eating below target. Consider adding more nutrient-dense foods and snacks.';
    } else if (trend === 'declining' && adherence > 120) {
      return 'You are eating above target. Focus on portion control and mindful eating.';
    } else if (trend === 'stable') {
      return 'Great job! Keep up your consistent eating habits.';
    } else {
      return 'Your adherence is improving. Continue with your current approach!';
    }
  }

  /**
   * Get personalized meal plan for the week
   */
  async getWeeklyMealPlan(
    user_id: string,
    profile: UserProfile,
  ): Promise<{
    week_start: string;
    week_end: string;
    daily_plans: WeeklyRecommendations[];
  }> {
    const recommendations = await this.getWeeklyRecommendations(user_id, profile);

    return {
      week_start: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      week_end: new Date().toISOString().split('T')[0],
      daily_plans: [recommendations],
    };
  }
}
