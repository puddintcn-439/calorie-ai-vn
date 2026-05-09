// Weekly and period-based insights types

export interface DailyInsight {
  date: string;
  day_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  calorie_target: number;
  adherence_percentage: number;
  meal_count: number;
}

export interface MacroBreakdown {
  protein_percentage: number;
  carbs_percentage: number;
  fat_percentage: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
}

export interface MealTypeBreakdown {
  breakfast_calories: number;
  lunch_calories: number;
  dinner_calories: number;
  snack_calories: number;
  breakfast_count: number;
  lunch_count: number;
  dinner_count: number;
  snack_count: number;
}

export interface WeeklyInsights {
  period: string; // "May 3-9, 2026"
  week_start_date: string; // ISO date
  week_end_date: string; // ISO date
  daily_insights: DailyInsight[];
  
  // Weekly aggregates
  weekly_calories_total: number;
  weekly_calorie_target: number;
  weekly_adherence_percentage: number; // average adherence across all days
  total_meals_logged: number;
  average_calories_per_day: number;
  
  // Macro breakdown
  macro_breakdown: MacroBreakdown;
  
  // Meal type breakdown
  meal_breakdown: MealTypeBreakdown;
  
  // Streak and trends
  days_on_target: number; // how many days hit or came close to target
  best_day_calories: number;
  worst_day_calories: number;
  
  // Trends (this week vs last week)
  trend_vs_last_week: number; // percentage difference in average calories
}

export interface WeeklyInsightsDto {
  period: string;
  week_start_date: string;
  week_end_date: string;
  daily_insights: DailyInsight[];
  weekly_calories_total: number;
  weekly_calorie_target: number;
  weekly_adherence_percentage: number;
  total_meals_logged: number;
  average_calories_per_day: number;
  macro_breakdown: MacroBreakdown;
  meal_breakdown: MealTypeBreakdown;
  days_on_target: number;
  best_day_calories: number;
  worst_day_calories: number;
  trend_vs_last_week: number;
}
