import { AIDetectedItem } from './ai.types';

export interface FoodLog {
  id: string;
  user_id: string;
  food_id?: string;          // null nếu AI estimated
  meal_type: MealType;
  logged_at: string;         // ISO date string
  quantity: number;
  unit: string;
  estimated_grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  name: string;
  name_vi?: string;
  image_url?: string;
  source: LogSource;
  ai_scan_id?: string;
  notes?: string;
  created_at: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type LogSource = 'ai_scan' | 'manual_search' | 'manual_entry' | 'quick_add';

export interface DailyLog {
  date: string;              // YYYY-MM-DD
  logs: FoodLog[];
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  target_calories: number;
  remaining_calories: number;
}

export interface CreateLogFromScanDto {
  user_id: string;
  meal_type: MealType;
  items: AIDetectedItem[];
  image_url?: string;
  scan_id: string;
}

export interface SavedMealItem {
  name: string;
  name_vi?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  estimated_grams: number;
}

export interface SavedMeal {
  id: string;
  user_id: string;
  name: string;
  items: SavedMealItem[];
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  use_count: number;
  last_used_at?: string;
  created_at: string;
}
