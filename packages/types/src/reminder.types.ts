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
