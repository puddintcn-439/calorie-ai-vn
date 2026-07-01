// Reminder and nudge notification types

export interface ReminderPreferences {
  id?: string;
  user_id: string;
  breakfast_reminder_enabled: boolean;
  breakfast_reminder_time: string; // HH:MM format
  lunch_reminder_enabled: boolean;
  lunch_reminder_time: string;
  dinner_reminder_enabled: boolean;
  dinner_reminder_time: string;
  snack_reminder_enabled: boolean;
  snack_reminder_time: string;
  hydration_reminder_enabled: boolean;
  allow_push_notifications: boolean;
  nudge_motivation_style: 'encouraging' | 'warning' | 'neutral';
  created_at?: string;
  updated_at?: string;
}

export interface ReminderPreferencesDto {
  breakfast_reminder_enabled?: boolean;
  breakfast_reminder_time?: string;
  lunch_reminder_enabled?: boolean;
  lunch_reminder_time?: string;
  dinner_reminder_enabled?: boolean;
  dinner_reminder_time?: string;
  snack_reminder_enabled?: boolean;
  snack_reminder_time?: string;
  hydration_reminder_enabled?: boolean;
  allow_push_notifications?: boolean;
  nudge_motivation_style?: 'encouraging' | 'warning' | 'neutral';
}

export interface NudgeMessage {
  title: string;
  body: string;
  type: 'reminder' | 'encouragement' | 'warning' | 'streak';
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  emoji: string;
  streakContext?: {
    currentStreak: number;
    longestStreak: number;
    nextMilestone: number | null;
  };
}

export interface NudgeContext {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  caloriesLogged: number;
  calorieTarget: number;
  adherencePercentage: number;
  mealsLogged: number;
  motivationStyle: 'encouraging' | 'warning' | 'neutral';
  currentStreak?: number;
  longestStreak?: number;
  nextStreakMilestone?: number | null;
}

export interface ReminderFeedbackEventDto {
  event: 'opened' | 'acted';
  reminder_log_id?: string;
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  local_date?: string;
  action_type?: 'food_log' | 'saved_meal_log' | 'activity_log' | 'scan_opened' | string;
  attribution_window_minutes?: number;
}

export interface ReminderEffectivenessSummary {
  days: number;
  sent: number;
  opened: number;
  acted: number;
  ignored: number;
  open_rate: number;
  action_rate: number;
  ignore_rate: number;
  effectiveness_score: number;
  best_meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null;
  weakest_meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null;
  recommendation: string;
  patterns: string[];
  by_meal: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', {
    sent: number;
    opened: number;
    acted: number;
    ignored: number;
    open_rate: number;
    action_rate: number;
    ignore_rate: number;
  }>;
  by_action: Record<string, {
    acted: number;
    action_rate: number;
  }>;
}
