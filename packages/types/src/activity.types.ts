export type ActivityType =
  | 'running'
  | 'walking'
  | 'cycling'
  | 'swimming'
  | 'gym'
  | 'yoga'
  | 'football'
  | 'basketball'
  | 'other';

export type ActivitySource = 'manual' | 'apple_health' | 'google_fit' | 'demo_sync';

export interface SyncedActivityEntry {
  external_id: string;
  activity_type: ActivityType;
  activity_name?: string;
  duration_min: number;
  calories_burned: number;
  logged_at: string;
  steps_count?: number;
  distance_km?: number;
  notes?: string;
}

export interface ActivitySyncBatchDto {
  source: Exclude<ActivitySource, 'manual'>;
  synced_at: string;
  entries: SyncedActivityEntry[];
}

export interface ActivitySyncResult {
  source: Exclude<ActivitySource, 'manual'>;
  synced_at: string;
  imported_count: number;
  skipped_count: number;
  total_calories_burned: number;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  activity_name?: string;
  source?: ActivitySource;
  external_id?: string;
  synced_at?: string;
  steps_count?: number;
  distance_km?: number;
  duration_min: number;
  calories_burned: number;
  logged_at: string;
  notes?: string;
  created_at: string;
}

export interface CreateActivityLogDto {
  activity_type: ActivityType;
  activity_name?: string;
  source?: ActivitySource;
  external_id?: string;
  synced_at?: string;
  steps_count?: number;
  distance_km?: number;
  duration_min: number;
  calories_burned?: number;   // if omitted, backend estimates
  logged_at?: string;
  notes?: string;
}

// MET values for calorie estimation (kcal/kg/h)
export const ACTIVITY_MET: Record<ActivityType, number> = {
  running: 9.8,
  walking: 3.5,
  cycling: 8.0,
  swimming: 8.0,
  gym: 6.0,
  yoga: 3.0,
  football: 8.0,
  basketball: 8.0,
  other: 5.0,
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  running: '🏃 Chạy bộ',
  walking: '🚶 Đi bộ',
  cycling: '🚴 Đạp xe',
  swimming: '🏊 Bơi lội',
  gym: '🏋️ Gym / Tập tạ',
  yoga: '🧘 Yoga',
  football: '⚽ Bóng đá',
  basketball: '🏀 Bóng rổ',
  other: '🤸 Khác',
};
