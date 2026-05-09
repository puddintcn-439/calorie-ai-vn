export interface BodyProgressEntry {
  id: number;
  user_id: string;
  recorded_at: string; // ISO date string YYYY-MM-DD
  weight_kg?: number;
  waist_cm?: number;
  hip_cm?: number;
  chest_cm?: number;
  arm_cm?: number;
  thigh_cm?: number;
  body_fat_pct?: number;
  muscle_mass_kg?: number;
  note?: string;
  energy_level?: 1 | 2 | 3 | 4 | 5;
  created_at: string;
  updated_at: string;
}

export interface CreateBodyProgressDto {
  recorded_at?: string;
  weight_kg?: number;
  waist_cm?: number;
  hip_cm?: number;
  chest_cm?: number;
  arm_cm?: number;
  thigh_cm?: number;
  body_fat_pct?: number;
  muscle_mass_kg?: number;
  note?: string;
  energy_level?: 1 | 2 | 3 | 4 | 5;
}

export interface BodyProgressTrend {
  entries: BodyProgressEntry[];
  weight_change_kg: number | null;    // vs first entry
  weight_change_7d: number | null;    // vs 7 days ago
  waist_change_cm: number | null;     // vs first entry
  days_tracked: number;
  latest_entry: BodyProgressEntry | null;
  first_entry: BodyProgressEntry | null;
}
