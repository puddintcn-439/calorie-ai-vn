import { Injectable } from '@nestjs/common';
import { UserProfile, ActivityLevel, UserGoal, HealthFlag, HEALTH_FLAGS } from '@calorie-ai/types';
import { NutritionRecommendationEngine } from './nutrition-recommendation.engine';
import {
  CalculateTargetDto,
  CalorieTargetResponse,
  BodyStatus,
  WeightRecommendation,
  NutritionTargets,
} from './dto/calorie-target.dto';
import {
  calculateDefaultMealTargets,
  DEFAULT_MEAL_ENERGY_DISTRIBUTION,
} from './meal-target.policy';

@Injectable()
export class CalorieTargetService {
  constructor(
    private nutritionEngine: NutritionRecommendationEngine = new NutritionRecommendationEngine(),
  ) {}

  calculateDailyNutritionTarget(
    profile: Partial<UserProfile>,
    date: string,
    calorieTarget?: number,
  ) {
    return this.nutritionEngine.calculate(profile, date, calorieTarget);
  }
  private calculateBMI(weight_kg: number, height_cm: number): number {
    const height_m = height_cm / 100;
    return weight_kg / (height_m * height_m);
  }

  private classifyBodyStatus(
    bmi: number,
  ): {
    body_status: BodyStatus;
    weight_recommendation: WeightRecommendation;
    recommended_goal: UserGoal;
    recommendation_note: string;
  } {
    if (bmi < 18.5) {
      return {
        body_status: 'underweight',
        weight_recommendation: 'increase',
        recommended_goal: 'gain_muscle',
        recommendation_note:
          'BMI screening suggests lower-than-reference weight risk. Consider gradual nutrition and strength work with professional support if needed.',
      };
    }

    if (bmi < 25) {
      return {
        body_status: 'normal',
        weight_recommendation: 'maintain',
        recommended_goal: 'maintain',
        recommendation_note:
          'BMI screening is within the general adult reference range. Maintain consistent nutrition and activity.',
      };
    }

    if (bmi < 30) {
      return {
        body_status: 'overweight',
        weight_recommendation: 'decrease',
        recommended_goal: 'lose_weight',
        recommendation_note:
          'BMI screening suggests elevated weight-related risk. If appropriate, use a moderate and sustainable calorie deficit.',
      };
    }

    return {
      body_status: 'obese',
      weight_recommendation: 'decrease',
      recommended_goal: 'lose_weight',
      recommendation_note:
        'BMI screening suggests higher weight-related risk. Prioritize gradual changes and professional support when possible.',
    };
  }

  private normaliseHealthFlags(flags?: HealthFlag[]): HealthFlag[] {
    if (!Array.isArray(flags)) return [];
    return [...new Set(flags.filter((flag): flag is HealthFlag => HEALTH_FLAGS.includes(flag as HealthFlag)))];
  }

  private buildNutritionTargets(dailyCalories: number): NutritionTargets {
    return {
      fiber_g_min: Math.round((dailyCalories / 1000) * 14),
      sodium_mg_max: 2000,
      free_sugar_g_max: Math.round((dailyCalories * 0.1) / 4),
      added_sugar_g_max: Math.round((dailyCalories * 0.1) / 4),
      saturated_fat_g_max: Math.round((dailyCalories * 0.1) / 9),
      free_sugar_pct_max: 10,
      saturated_fat_pct_max: 10,
      basis: 'General wellness targets: fiber 14 g/1000 kcal; sodium <2000 mg/day; free or added sugar <10% kcal; saturated fat <10% kcal. These are not disease-specific limits.',
    };
  }

  /**
   * Mifflin-St Jeor formula for BMR (Basal Metabolic Rate)
   * Most accurate for general population
   */
  private calculateBMR(
    weight_kg: number,
    height_cm: number,
    age: number,
    gender: 'male' | 'female',
  ): number {
    if (gender === 'male') {
      return 10 * weight_kg + 6.25 * height_cm - 5 * age + 5;
    } else {
      return 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;
    }
  }

  /**
   * Activity factor mapping for TDEE calculation
   */
  private getActivityFactor(level: ActivityLevel): number {
    const factors = {
      sedentary: 1.2,           // Little or no exercise
      light: 1.375,             // Exercise 1-3 days/week
      moderate: 1.55,           // Exercise 3-5 days/week
      active: 1.725,            // Exercise 6-7 days/week
      very_active: 1.9,         // Physical job or twice-daily exercise
    };
    return factors[level] || 1.2;
  }

  /**
   * Goal-based calorie adjustment
   * Weight loss: -20% (0.5 kg/week)
   * Maintain: 0%
   * Gain muscle: +10% (lean gain with resistance training)
   */
  private getGoalAdjustment(goal: UserGoal): number {
    const adjustments = {
      lose_weight: 0.8,      // 20% deficit
      maintain: 1.0,         // No adjustment
      gain_muscle: 1.1,      // 10% surplus
    };
    return adjustments[goal] || 1.0;
  }

  /**
   * Calculate daily calorie target based on user profile
   */
  calculateTarget(dto: CalculateTargetDto): CalorieTargetResponse {
    const { weight_kg, height_cm, age, gender, activity_level, goal, body_fat_pct } = dto;
    const healthFlags = this.normaliseHealthFlags(dto.health_flags);
    const hasHealthFlag = (flag: HealthFlag) => healthFlags.includes(flag);
    const safetyWarnings: string[] = [
      'BMI and calorie targets are wellness screening estimates, not medical diagnosis or treatment.',
    ];
    const macroWarnings: string[] = [];
    let medicalReviewRecommended = false;
    const bmiValue = this.calculateBMI(weight_kg, height_cm);
    const bmi = Math.round(bmiValue * 10) / 10;
    const bodyGuidance = this.classifyBodyStatus(bmi);

    // Step 1: Calculate BMR
    // If a realistic body fat estimate is provided, prefer Katch-McArdle.
    let bmr: number;
    if (typeof body_fat_pct === 'number' && body_fat_pct >= 3 && body_fat_pct <= 70) {
      const lbm = weight_kg * (1 - body_fat_pct / 100);
      bmr = 370 + 21.6 * lbm;
    } else {
      if (typeof body_fat_pct === 'number') {
        safetyWarnings.push('Body-fat percentage was outside a realistic range, so Mifflin-St Jeor was used instead.');
      }
      bmr = this.calculateBMR(weight_kg, height_cm, age, gender);
    }

    // Step 2: Calculate TDEE (Total Daily Energy Expenditure)
    const activity_factor = this.getActivityFactor(activity_level);
    const tdee = bmr * activity_factor;

    // Safety clamps / floors
    const floor_by_sex = gender === 'female' ? 1200 : 1500;
    // Sex-based floors are retained as product guardrails for the current adult
    // workflow. BMR × 1.1 was removed because it has no defensible guideline basis.
    const min_allowed = floor_by_sex;
    const max_deficit_pct = 0.2; // do not allow deficit >20% of TDEE
    const min_by_deficit = Math.round(tdee * (1 - max_deficit_pct));

    let effectiveGoal = goal;
    if (age < 18 && goal !== 'maintain') {
      effectiveGoal = 'maintain';
      safetyWarnings.push('Users under 18 should use maintenance estimates only and work with a qualified clinician or guardian for weight goals.');
    }
    if (age < 18) {
      medicalReviewRecommended = true;
      safetyWarnings.push('Adult BMI cutoffs are not diagnostic for minors; use age- and sex-specific growth charts with a clinician.');
    }
    if (hasHealthFlag('pregnant') || hasHealthFlag('breastfeeding')) {
      medicalReviewRecommended = true;
      if (effectiveGoal !== 'maintain') effectiveGoal = 'maintain';
      safetyWarnings.push('Pregnancy or breastfeeding needs clinician-guided energy and nutrient targets; weight-change goals were replaced with maintenance.');
      macroWarnings.push('Pregnancy or breastfeeding flag: use these macro targets only as a general log, not as prenatal or lactation nutrition advice.');
    }
    if (hasHealthFlag('eating_disorder_history')) {
      medicalReviewRecommended = true;
      if (effectiveGoal !== 'maintain') effectiveGoal = 'maintain';
      safetyWarnings.push('History or risk of disordered eating: calorie targets and weight goals can be harmful; use this app only with qualified support.');
    }
    if (hasHealthFlag('kidney_disease')) {
      medicalReviewRecommended = true;
      safetyWarnings.push('Kidney disease can require individualized protein, potassium, phosphorus, fluid, and sodium limits; confirm targets with a clinician.');
      macroWarnings.push('Kidney disease flag: protein and sodium targets are not individualized and may be inappropriate.');
    }
    if (hasHealthFlag('diabetes')) {
      medicalReviewRecommended = true;
      safetyWarnings.push('Diabetes nutrition needs individualized carb timing, medication, and glucose monitoring guidance; this app does not replace clinical care.');
      macroWarnings.push('Diabetes flag: carb and sugar targets are general tracking limits, not a personalized glucose-management plan.');
    }
    if (hasHealthFlag('weight_affecting_medication')) {
      medicalReviewRecommended = true;
      safetyWarnings.push('Some medications affect appetite, fluid balance, or weight; review weight targets with the prescriber.');
    }
    if (bodyGuidance.body_status === 'underweight' && goal === 'lose_weight') {
      effectiveGoal = 'maintain';
      safetyWarnings.push('Weight-loss target was not applied because BMI is in the underweight range.');
    }

    // Step 3: Apply goal adjustment
    const goal_adjustment = this.getGoalAdjustment(effectiveGoal);
    const raw_target = Math.round(tdee * goal_adjustment);

    // Apply clamps to ensure safe targets
    const daily_calorie_target = Math.max(raw_target, min_allowed, min_by_deficit);
    if (daily_calorie_target > raw_target) {
      safetyWarnings.push('Calorie target was raised to avoid an aggressive deficit or a very-low-calorie floor.');
    }

    // Step 4: Calculate meal targets
    const meal_breakdown = calculateDefaultMealTargets(daily_calorie_target);

    // Step 5: Macros (protein, fat, carbs)
    const dailyNutritionTarget = this.nutritionEngine.calculate(
      { ...dto, goal: effectiveGoal } as UserProfile,
      new Date().toISOString().slice(0, 10),
      daily_calorie_target,
    );
    const protein_g_per_kg = dailyNutritionTarget.factors.protein_g_per_kg;
    const protein_target_g = dailyNutritionTarget.protein_g;
    const fat_pct = dailyNutritionTarget.factors.fat_energy_pct;
    const fat_g = dailyNutritionTarget.fat_g;
    const carbs_g = dailyNutritionTarget.carbs_g;
    const carbs_pct = typeof carbs_g === 'number'
      ? Math.round(((carbs_g * 4) / daily_calorie_target) * 100)
      : undefined;
    if (typeof carbs_pct === 'number' && carbs_pct < 45) {
      macroWarnings.push('Carbohydrate share is below the general 45-65% AMDR range; review energy, fiber, and training needs.');
    }
    if (typeof carbs_g === 'number' && carbs_g < 130) {
      macroWarnings.push('Carbohydrate grams are below the common 130 g/day reference intake for adults.');
    }
    const nutritionTargets = (dailyNutritionTarget.status === 'ready' || dailyNutritionTarget.status === 'clinician_target')
      ? {
          fiber_g_min: dailyNutritionTarget.fiber_g!,
          sodium_mg_max: dailyNutritionTarget.sodium_mg_max!,
          free_sugar_g_max: dailyNutritionTarget.free_sugar_g_max!,
          added_sugar_g_max: dailyNutritionTarget.free_sugar_g_max!,
          saturated_fat_g_max: dailyNutritionTarget.saturated_fat_g_max!,
          free_sugar_pct_max: 10,
          saturated_fat_pct_max: 10,
          basis: `Central nutrition recommendation engine ${dailyNutritionTarget.algorithm_version}.`,
        }
      : this.buildNutritionTargets(daily_calorie_target);
    const usedBodyFatEquation = typeof body_fat_pct === 'number'
      && body_fat_pct >= 3
      && body_fat_pct <= 70;

    return {
      daily_calorie_target,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      bmi,
      body_status: bodyGuidance.body_status,
      weight_recommendation: bodyGuidance.weight_recommendation,
      recommended_goal: bodyGuidance.recommended_goal,
      effective_goal: effectiveGoal,
      recommendation_note: bodyGuidance.recommendation_note,
      bmi_standard: 'global_adult',
      bmi_interpretation: 'screening_risk_not_diagnosis',
      target_breakfast_cal: meal_breakdown.breakfast,
      target_lunch_cal: meal_breakdown.lunch,
      target_dinner_cal: meal_breakdown.dinner,
      target_snack_cal: meal_breakdown.snack,
      calculation_date: new Date().toISOString(),
      protein_target_g,
      protein_g_per_kg: protein_g_per_kg,
      fat_pct,
      fat_g,
      carbs_g,
      carbs_pct,
      is_estimate: true,
      safety_warnings: safetyWarnings,
      macro_warnings: macroWarnings,
      health_flags: healthFlags,
      medical_review_recommended: medicalReviewRecommended,
      nutrition_targets: nutritionTargets,
      daily_nutrition_target: dailyNutritionTarget,
      protein_reason: dailyNutritionTarget.rationale.protein,
      calculation_methodology: {
        bmr: {
          method: usedBodyFatEquation ? 'katch_mcardle' : 'mifflin_st_jeor',
          evidence_level: usedBodyFatEquation ? 'evidence_informed_heuristic' : 'validated_equation',
          source_url: usedBodyFatEquation
            ? undefined
            : 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
          assumptions: usedBodyFatEquation
            ? ['Body-fat percentage is accurate enough to estimate lean mass.']
            : ['The adult population equation estimates resting expenditure; individual error remains possible.'],
        },
        activity: {
          factor: activity_factor,
          evidence_level: 'evidence_informed_heuristic',
          assumptions: [
            'The five discrete activity factors are calculator conventions, not a validated five-point clinical scale.',
            'The selected level approximates both occupational and exercise expenditure.',
          ],
        },
        goal_adjustment: {
          multiplier: goal_adjustment,
          evidence_level: 'evidence_informed_heuristic',
          assumptions: ['A 20% deficit or 10% surplus is a conservative product default, not a universal prescription.'],
        },
        calorie_floor: {
          value_kcal: floor_by_sex,
          evidence_level: 'product_guardrail',
          is_product_guardrail: true,
          assumptions: ['1200/1500 kcal are workflow guardrails, not physiological or medical lower limits.'],
        },
        meal_distribution: {
          breakfast_pct: DEFAULT_MEAL_ENERGY_DISTRIBUTION.breakfast * 100,
          lunch_pct: DEFAULT_MEAL_ENERGY_DISTRIBUTION.lunch * 100,
          dinner_pct: DEFAULT_MEAL_ENERGY_DISTRIBUTION.dinner * 100,
          snack_pct: DEFAULT_MEAL_ENERGY_DISTRIBUTION.snack * 100,
          evidence_level: 'product_guardrail',
          is_user_adjustable: true,
          assumptions: ['Meal percentages are a planning default without evidence of an optimal universal distribution.'],
        },
      },
    };
  }

  /**
   * Calculate target for user profile and update with targets
   */
  calculateAndUpdateProfile(
    profile: Partial<UserProfile>,
  ): Partial<UserProfile> {
    if (
      !profile.weight_kg ||
      !profile.height_cm ||
      !profile.age ||
      !profile.gender ||
      !profile.activity_level ||
      !profile.goal
    ) {
      return profile; // Skip if incomplete profile
    }

    const target = this.calculateTarget({
      weight_kg: profile.weight_kg,
      height_cm: profile.height_cm,
      age: profile.age,
      gender: profile.gender,
      activity_level: profile.activity_level,
      goal: profile.goal,
      health_flags: profile.health_flags,
    });

    return {
      ...profile,
      daily_calorie_target: target.daily_calorie_target,
      target_breakfast_cal: target.target_breakfast_cal,
      target_lunch_cal: target.target_lunch_cal,
      target_dinner_cal: target.target_dinner_cal,
      target_snack_cal: target.target_snack_cal,
    };
  }
}
