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

type FoodRow = {
  name: string;
  name_vi?: string;
  calories_per_100g?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  serving_size_g?: number;
};

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
    void meal_type;

    const { data } = await this.supabaseService.db
      .from('foods')
      .select('name, name_vi, calories_per_100g, protein_g, carbs_g, fat_g, serving_size_g')
      .gte('calories_per_100g', 20)
      .lte('calories_per_100g', 900)
      .order('nutrient_confidence', { ascending: false })
      .limit(Math.max(limit * 8, 30));

    return ((data ?? []) as FoodRow[])
      .map((food) => this.toFoodSuggestion(food))
      .filter((food) => food.calories >= remaining_calories - tolerance && food.calories <= remaining_calories + tolerance)
      .slice(0, limit);
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
      .from('food_logs')
      .select('calories')
      .eq('user_id', user_id)
      .gte('logged_at', `${today}T00:00:00Z`);

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
      .from('food_logs')
      .select('logged_at, calories')
      .eq('user_id', user_id)
      .gte('logged_at', sevenDaysAgo.toISOString());

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

  private toFoodSuggestion(food: FoodRow): {
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  } {
    const grams = food.serving_size_g && food.serving_size_g > 0 ? food.serving_size_g : 100;
    const ratio = grams / 100;
    return {
      name: food.name_vi ?? food.name,
      calories: Math.round((food.calories_per_100g ?? 0) * ratio),
      protein_g: Number(((food.protein_g ?? 0) * ratio).toFixed(1)),
      carbs_g: Number(((food.carbs_g ?? 0) * ratio).toFixed(1)),
      fat_g: Number(((food.fat_g ?? 0) * ratio).toFixed(1)),
    };
  }

  /**
   * Calculate average adherence for the week
   */
  private calculateWeeklyAdherence(
    logs: { logged_at: string; calories: number }[],
    dailyTarget: number,
  ): number {
    if (logs.length === 0) {
      return 100;
    }

    // Group logs by date
    const dailyTotals: Record<string, number> = {};
    for (const log of logs) {
      const date = log.logged_at.split('T')[0];
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
   * Get personalized meal plan for the week (next 7 days)
   */
  async getWeeklyMealPlan(
    user_id: string,
    profile: UserProfile,
  ): Promise<{
    week_start: string;
    week_end: string;
    daily_plans: WeeklyRecommendations[];
  }> {
    const dailyTarget = profile.daily_calorie_target || 2000;

    // Fetch foods pool once to reuse across all 7 days
    const { data: foodPool } = await this.supabaseService.db
      .from('foods')
      .select('name, name_vi, calories_per_100g, protein_g, carbs_g, fat_g, serving_size_g')
      .gte('calories_per_100g', 20)
      .lte('calories_per_100g', 900)
      .order('nutrient_confidence', { ascending: false })
      .limit(50);

    const foods = ((foodPool || []) as FoodRow[]).map((food) => this.toFoodSuggestion(food));

    // Meal distribution ratios vary slightly per day for dietary variety
    const dayVariations = [
      { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 },
      { breakfast: 0.20, lunch: 0.35, dinner: 0.35, snack: 0.10 },
      { breakfast: 0.25, lunch: 0.30, dinner: 0.35, snack: 0.10 },
      { breakfast: 0.30, lunch: 0.35, dinner: 0.25, snack: 0.10 },
      { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 },
      { breakfast: 0.20, lunch: 0.40, dinner: 0.30, snack: 0.10 },
      { breakfast: 0.25, lunch: 0.30, dinner: 0.35, snack: 0.10 },
    ];

    const mealTips: Record<string, string[]> = {
      breakfast: [
        'Start your day with protein and complex carbs for sustained energy.',
        'A high-protein breakfast reduces cravings throughout the day.',
        'Include fiber-rich foods to keep you full until lunch.',
      ],
      lunch: [
        'Include vegetables for micronutrients and fiber.',
        'A balanced lunch maintains energy for the afternoon.',
        'Lean proteins at lunch support muscle maintenance.',
      ],
      dinner: [
        'Balance protein with healthy fats and vegetables.',
        'Keep dinner lighter to support better sleep quality.',
        'Include colorful vegetables for a broad range of micronutrients.',
      ],
      snack: [
        'Choose protein-rich snacks to stay satisfied between meals.',
        'Fruit with nut butter makes a well-balanced snack.',
        'Snacks under 200 kcal help stay on target.',
      ],
    };

    // Get weekly adherence insight from past 7 days logs
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: weekLogs } = await this.supabaseService.db
      .from('food_logs')
      .select('logged_at, calories')
      .eq('user_id', user_id)
      .gte('logged_at', sevenDaysAgo.toISOString());

    const weeklyAdherence = this.calculateWeeklyAdherence(weekLogs || [], dailyTarget);
    const today = new Date().toISOString().split('T')[0];

    const daily_plans: WeeklyRecommendations[] = dayVariations.map((ratios, i) => {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const breakfastTarget = profile.target_breakfast_cal || Math.round(dailyTarget * ratios.breakfast);
      const lunchTarget = profile.target_lunch_cal || Math.round(dailyTarget * ratios.lunch);
      const dinnerTarget = profile.target_dinner_cal || Math.round(dailyTarget * ratios.dinner);
      const snackTarget = profile.target_snack_cal || Math.round(dailyTarget * ratios.snack);

      // Distribute food pool into meal buckets (offset by day index for variety)
      const offset = i * 5;
      const slice = (start: number, count: number) =>
        foods.slice((start + offset) % Math.max(foods.length, 1), ((start + offset) % Math.max(foods.length, 1)) + count)
          .concat(foods.slice(0, Math.max(0, count - (foods.length - ((start + offset) % Math.max(foods.length, 1))))))
          .slice(0, count);

      const trend = this.calculateTrend(dailyTarget * 0.95, dailyTarget);

      return {
        user_id,
        date: dateStr,
        daily_target: dailyTarget,
        remaining_calories: dateStr === today ? Math.max(0, dailyTarget) : dailyTarget,
        meals: [
          {
            meal_type: 'breakfast' as const,
            recommended_calories: breakfastTarget,
            suggested_foods: slice(0, 5),
            tips: mealTips.breakfast[i % mealTips.breakfast.length],
          },
          {
            meal_type: 'lunch' as const,
            recommended_calories: lunchTarget,
            suggested_foods: slice(5, 5),
            tips: mealTips.lunch[i % mealTips.lunch.length],
          },
          {
            meal_type: 'dinner' as const,
            recommended_calories: dinnerTarget,
            suggested_foods: slice(10, 5),
            tips: mealTips.dinner[i % mealTips.dinner.length],
          },
          {
            meal_type: 'snack' as const,
            recommended_calories: snackTarget,
            suggested_foods: slice(15, 3),
            tips: mealTips.snack[i % mealTips.snack.length],
          },
        ],
        weekly_insights: {
          average_adherence: weeklyAdherence,
          trend,
          suggestion: this.getSuggestion(weeklyAdherence, trend),
        },
      };
    });

    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 6);

    return {
      week_start: today,
      week_end: weekEnd.toISOString().split('T')[0],
      daily_plans,
    };
  }
}
