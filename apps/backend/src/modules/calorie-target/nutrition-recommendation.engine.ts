import { Injectable } from '@nestjs/common';
import {
  DailyNutritionTarget,
  HEALTH_FLAGS,
  HealthFlag,
  User,
} from '@calorie-ai/types';

const ALGORITHM_VERSION = 'daily-nutrition-v1';
const CLINICIAN_FLAGS: HealthFlag[] = [
  'pregnant',
  'breastfeeding',
  'kidney_disease',
  'eating_disorder_history',
];

@Injectable()
export class NutritionRecommendationEngine {
  calculate(
    profile: Partial<User> | null | undefined,
    date: string,
    calorieTarget?: number,
  ): DailyNutritionTarget {
    const healthFlags = this.healthFlags(profile?.health_flags);
    const missingFields = [
      !this.positive(profile?.age) ? 'age' : null,
      !profile?.gender ? 'gender' : null,
      !this.positive(profile?.weight_kg) ? 'weight_kg' : null,
      !profile?.activity_level ? 'activity_level' : null,
      !profile?.goal ? 'goal' : null,
      !this.positive(calorieTarget ?? profile?.daily_calorie_target) ? 'daily_calorie_target' : null,
    ].filter((field): field is string => Boolean(field));
    const base = {
      date,
      rationale: {},
      factors: {
        age: profile?.age,
        weight_kg: profile?.weight_kg,
        activity_level: profile?.activity_level,
        goal: profile?.goal,
        health_flags: healthFlags,
      },
      missing_fields: missingFields,
      warnings: [] as string[],
      calculated_at: new Date().toISOString(),
      algorithm_version: ALGORITHM_VERSION,
    };

    if (missingFields.length > 0) {
      return { ...base, status: 'needs_profile' };
    }

    if ((profile?.age ?? 0) < 18 || healthFlags.some((flag) => CLINICIAN_FLAGS.includes(flag))) {
      return {
        ...base,
        status: 'clinician_guidance',
        warnings: [
          'Nutrition targets require age- or condition-specific clinical guidance and were not generated from the general adult formula.',
        ],
      };
    }

    const calories = Math.round(calorieTarget ?? profile!.daily_calorie_target!);
    const weightKg = Number(profile!.weight_kg);
    const proteinMultiplier = this.proteinMultiplier(profile!);
    const protein = Math.round(weightKg * proteinMultiplier);
    const fatEnergyPct = 25;
    const fat = Math.round((calories * fatEnergyPct / 100) / 9);
    const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
    const activityWater = profile!.activity_level === 'very_active'
      ? 500
      : profile!.activity_level === 'active' ? 250 : 0;
    const water = Math.round(Math.min(4500, Math.max(1500, weightKg * 35 + activityWater)) / 50) * 50;
    const warnings = [
      'Targets are general wellness estimates, not medical diagnosis or treatment.',
      ...(healthFlags.includes('diabetes')
        ? ['Diabetes requires individualized carbohydrate and glucose guidance; this target is not a treatment plan.']
        : []),
      ...(healthFlags.includes('weight_affecting_medication')
        ? ['Weight-affecting medication can change energy needs; review targets with a qualified clinician.']
        : []),
    ];

    return {
      ...base,
      status: 'ready',
      calories_kcal: calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      fiber_g: Math.round((calories / 1000) * 14),
      water_ml: water,
      sodium_mg_max: 2000,
      free_sugar_g_max: Math.round((calories * 0.1) / 4),
      saturated_fat_g_max: Math.round((calories * 0.1) / 9),
      rationale: {
        calories: 'Uses the active daily calorie target calculated from profile and goal.',
        protein: this.proteinReason(profile!, proteinMultiplier),
        carbs: 'Receives remaining energy after protein and a 25% fat allocation.',
        fat: 'Uses 25% of daily energy as a general adult baseline.',
        fiber: 'Uses 14 g per 1000 kcal.',
        water: 'Uses a 35 ml/kg baseline with a small activity adjustment; environment and clinical needs can change this.',
      },
      factors: {
        ...base.factors,
        protein_g_per_kg: proteinMultiplier,
        fat_energy_pct: fatEnergyPct,
      },
      warnings,
    };
  }

  private proteinMultiplier(profile: Partial<User>): number {
    const activityBase = {
      sedentary: 1.0,
      light: 1.1,
      moderate: 1.2,
      active: 1.4,
      very_active: 1.6,
    }[profile.activity_level ?? 'sedentary'];
    let multiplier = activityBase;
    if (profile.goal === 'lose_weight') multiplier = Math.max(multiplier, 1.4);
    if (profile.goal === 'gain_muscle') multiplier = Math.max(multiplier, 1.6);
    if ((profile.age ?? 0) >= 65) multiplier = Math.max(multiplier, 1.2);
    const cap = profile.goal === 'gain_muscle' ? 2.2 : profile.goal === 'lose_weight' ? 1.8 : (profile.age ?? 0) >= 65 ? 1.5 : 1.6;
    return Math.min(multiplier, cap);
  }

  private proteinReason(profile: Partial<User>, multiplier: number): string {
    const factors = [
      `${profile.goal ?? 'maintain'} goal`,
      `${profile.activity_level ?? 'sedentary'} activity`,
      ...((profile.age ?? 0) >= 65 ? ['older-adult baseline'] : []),
    ];
    return `${multiplier.toFixed(1)} g/kg based on ${factors.join(', ')}.`;
  }

  private healthFlags(flags?: HealthFlag[]): HealthFlag[] {
    if (!Array.isArray(flags)) return [];
    return [...new Set(flags.filter((flag): flag is HealthFlag => HEALTH_FLAGS.includes(flag)))];
  }

  private positive(value: unknown): boolean {
    return Number.isFinite(Number(value)) && Number(value) > 0;
  }
}
