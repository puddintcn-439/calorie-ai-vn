export interface DailyRoadmapItem {
  id: string;
  user_id: string;
  logged_date: string; // YYYY-MM-DD
  task_id: string;
  task_title: string;
  activity_type: string;
  duration_min: number;
  estimated_kcal: number;
  is_custom: boolean;
  is_removed: boolean;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDailyRoadmapItemDto {
  logged_date: string; // YYYY-MM-DD
  task_id: string;
  task_title: string;
  activity_type: string;
  duration_min: number;
  estimated_kcal: number;
  is_custom?: boolean;
}

export interface UpdateDailyRoadmapItemDto {
  task_id?: string;
  task_title?: string;
  activity_type?: string;
  duration_min?: number;
  estimated_kcal?: number;
  is_custom?: boolean;
  is_completed?: boolean;
  is_removed?: boolean;
}

export interface DailyRoadmapSyncDto {
  logged_date: string; // YYYY-MM-DD
  items: Array<
    Omit<DailyRoadmapItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  >;
}

export interface ActivityPreference {
  id: string;
  user_id: string;
  title: string;
  activity_type: string;
  duration_min: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateActivityPreferenceDto {
  title: string;
  activity_type: string;
  duration_min: number;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateActivityPreferenceDto {
  title?: string;
  activity_type?: string;
  duration_min?: number;
  sort_order?: number;
  is_active?: boolean;
}
