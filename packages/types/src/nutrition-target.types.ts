import { ActivityLevel, ClimateExposure, HealthFlag, SweatLevel, UserGoal, WorkActivityLevel } from './user.types';

export type NutritionTargetStatus = 'ready' | 'needs_profile' | 'clinician_guidance' | 'clinician_target';
export type NutritionEvidenceLevel =
  | 'guideline'
  | 'validated_equation'
  | 'guideline_range_with_product_default'
  | 'evidence_informed_heuristic'
  | 'product_guardrail'
  | 'clinician_target';

export type NutritionTargetMetric =
  | 'calories_kcal'
  | 'protein_g'
  | 'carbs_g'
  | 'fat_g'
  | 'fiber_g'
  | 'water_ml'
  | 'sodium_mg_max'
  | 'free_sugar_g_max'
  | 'saturated_fat_g_max';

export interface NutritionEvidence {
  id: string;
  organization: string;
  title: string;
  url: string;
  applies_to: string[];
  evidence_level: NutritionEvidenceLevel;
}

export interface NutritionTargetMethodology {
  method: string;
  evidence_level: NutritionEvidenceLevel;
  evidence_ids: string[];
  assumptions: string[];
  is_user_adjustable: boolean;
  is_product_guardrail?: boolean;
  reference_range?: {
    min?: number;
    max?: number;
    unit: string;
  };
}

export interface DailyNutritionTarget {
  date: string;
  status: NutritionTargetStatus;
  calories_kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  water_ml?: number;
  sodium_mg_max?: number;
  free_sugar_g_max?: number;
  saturated_fat_g_max?: number;
  rationale: {
    calories?: string;
    protein?: string;
    carbs?: string;
    fat?: string;
    fiber?: string;
    water?: string;
  };
  factors: {
    age?: number;
    weight_kg?: number;
    activity_level?: ActivityLevel;
    work_activity_level?: WorkActivityLevel;
    exercise_sessions_per_week?: number;
    exercise_minutes_per_session?: number;
    sweat_level?: SweatLevel;
    climate_exposure?: ClimateExposure;
    goal?: UserGoal;
    health_flags: HealthFlag[];
    protein_g_per_kg?: number;
    fat_energy_pct?: number;
  };
  missing_fields: string[];
  warnings: string[];
  evidence: NutritionEvidence[];
  methodology: Partial<Record<NutritionTargetMetric, NutritionTargetMethodology>>;
  calculated_at: string;
  algorithm_version: string;
}
