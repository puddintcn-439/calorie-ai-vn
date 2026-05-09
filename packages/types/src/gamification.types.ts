export type BadgeId =
  | 'first_log'
  | 'three_day_streak'
  | 'seven_day_streak'
  | 'activity_starter'
  | 'consistency_king'
  | 'fifty_logs';

export interface BadgeProgress {
  id: BadgeId;
  label: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export interface GamificationSummary {
  current_streak: number;
  longest_streak: number;
  active_days_last_30: number;
  total_food_logs: number;
  total_activity_logs: number;
  next_streak_milestone: number | null;
  badges: BadgeProgress[];
}