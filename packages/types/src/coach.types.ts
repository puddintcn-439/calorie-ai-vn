// Coach insights and pattern types

export enum PatternType {
  STRESS_EATING = 'stress_eating',
  SKIPPED_MEALS = 'skipped_meals',
  HIGH_INTAKE_DAYS = 'high_intake_days',
  /** @deprecated Legacy records only. Do not infer binge eating from calorie totals. */
  BINGE_EPISODES = 'binge_episodes',
  TIMING_PREFERENCE = 'timing_preference',
  WEEKEND_VARIANCE = 'weekend_variance',
  EMOTIONAL_TRIGGER = 'emotional_trigger',
  NIGHT_EATING = 'night_eating',
  INCONSISTENT_LOGGING = 'inconsistent_logging',
}

export enum InsightType {
  PATTERN_ALERT = 'pattern_alert',
  ACHIEVEMENT = 'achievement',
  OPPORTUNITY = 'opportunity',
  WARNING = 'warning',
  PERSONALIZED_ADVICE = 'personalized_advice',
}

export enum PriorityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface BehavioralPattern {
  id: number;
  user_id: string;
  pattern_type: PatternType;
  severity_level: 1 | 2 | 3 | 4 | 5; // 1=minimal, 5=critical
  first_detected_at: string;
  last_detected_at: string;
  frequency_score: number; // 0-1
  created_at: string;
  updated_at: string;
}

export interface CoachingInsight {
  id: number;
  user_id: string;
  insight_type: InsightType;
  title: string;
  description: string;
  action_suggestion?: string;
  impact_score: number; // 1-10
  pattern_id?: number;
  affected_meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  is_acknowledged: boolean;
  acknowledged_at?: string;
  created_at: string;
  expires_at?: string;
  emoji?: string; // For UI display
}

export interface CoachingSummary {
  id: number;
  user_id: string;
  week_start_date: string;
  logs_count: number;
  adherence_percentage: number | null; // null until a backend target exists
  target_status?: 'ready' | 'needs_profile';
  consistency_score: number; // 0-1
  primary_pattern?: PatternType;
  secondary_patterns?: PatternType[];
  insights_generated: number;
  total_calories: number;
  average_daily_calories: number;
  calorie_variance: number;
  days_above_target: number;
  days_below_target: number;
  days_on_target: number;
  recommended_action: string;
  priority_level: PriorityLevel;
  created_at: string;
  updated_at: string;
}

export interface DailyNutritionData {
  date: string;
  total_calories: number;
  meal_type_breakdown: {
    breakfast: number;
    lunch: number;
    dinner: number;
    snack: number;
  };
  meals_logged: number;
  user_stress_level?: number; // Optional contextual data
  user_mood?: string;
}

export interface PatternAnalysisResult {
  patterns_detected: BehavioralPattern[];
  insights_generated: CoachingInsight[];
  score_changed: boolean;
  recommendations: string[];
}
