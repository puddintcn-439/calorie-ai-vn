export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  weight_kg?: number;
  height_cm?: number;
  age?: number;
  gender?: 'male' | 'female';
  activity_level?: ActivityLevel;
  goal?: UserGoal;
  daily_calorie_target?: number;
  target_breakfast_cal?: number;
  target_lunch_cal?: number;
  target_dinner_cal?: number;
  target_snack_cal?: number;
  created_at: string;
  updated_at: string;
}

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export type UserGoal = 'lose_weight' | 'maintain' | 'gain_muscle';

export interface UserProfile extends User {
  bmr?: number;       // Basal Metabolic Rate
  tdee?: number;      // Total Daily Energy Expenditure
}
