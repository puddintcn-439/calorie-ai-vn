import { Injectable } from '@nestjs/common';
import { UserProfile, ActivityLevel, UserGoal } from '@calorie-ai/types';
import {
  CalculateTargetDto,
  CalorieTargetResponse,
  BodyStatus,
  WeightRecommendation,
} from './dto/calorie-target.dto';

@Injectable()
export class CalorieTargetService {
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
    // Asia-Pacific cutoffs are used to fit Vietnamese population context.
    if (bmi < 18.5) {
      return {
        body_status: 'underweight',
        weight_recommendation: 'increase',
        recommended_goal: 'gain_muscle',
        recommendation_note:
          'Body status indicates underweight. Consider increasing calories gradually with protein-rich meals and resistance training.',
      };
    }

    if (bmi < 23) {
      return {
        body_status: 'normal',
        weight_recommendation: 'maintain',
        recommended_goal: 'maintain',
        recommendation_note:
          'Body status is in a healthy range. Maintain current weight with consistent calorie intake and activity.',
      };
    }

    if (bmi < 25) {
      return {
        body_status: 'overweight',
        weight_recommendation: 'decrease',
        recommended_goal: 'lose_weight',
        recommendation_note:
          'Body status indicates overweight. A moderate calorie deficit can help reduce weight safely.',
      };
    }

    return {
      body_status: 'obese',
      weight_recommendation: 'decrease',
      recommended_goal: 'lose_weight',
      recommendation_note:
        'Body status indicates obesity. Prioritize gradual weight loss with a sustainable calorie deficit and regular activity.',
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
   * Meal breakdown distribution
   * Breakfast: 25%, Lunch: 35%, Dinner: 30%, Snack: 10%
   */
  private getMealBreakdown(
    total_calories: number,
  ): {
    breakfast: number;
    lunch: number;
    dinner: number;
    snack: number;
  } {
    return {
      breakfast: Math.round(total_calories * 0.25),
      lunch: Math.round(total_calories * 0.35),
      dinner: Math.round(total_calories * 0.3),
      snack: Math.round(total_calories * 0.1),
    };
  }

  /**
   * Calculate daily calorie target based on user profile
   */
  calculateTarget(dto: CalculateTargetDto): CalorieTargetResponse {
    const { weight_kg, height_cm, age, gender, activity_level, goal } = dto;

    // Step 1: Calculate BMR
    const bmr = this.calculateBMR(weight_kg, height_cm, age, gender);

    // Step 2: Calculate TDEE (Total Daily Energy Expenditure)
    const activity_factor = this.getActivityFactor(activity_level);
    const tdee = bmr * activity_factor;

    // Step 3: Apply goal adjustment
    const goal_adjustment = this.getGoalAdjustment(goal);
    const daily_calorie_target = Math.round(tdee * goal_adjustment);

    // Step 3.5: Calculate BMI and recommendation based on body status
    const bmiValue = this.calculateBMI(weight_kg, height_cm);
    const bmi = Math.round(bmiValue * 10) / 10;
    const bodyGuidance = this.classifyBodyStatus(bmi);

    // Step 4: Calculate meal targets
    const meal_breakdown = this.getMealBreakdown(daily_calorie_target);

    return {
      daily_calorie_target,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      bmi,
      body_status: bodyGuidance.body_status,
      weight_recommendation: bodyGuidance.weight_recommendation,
      recommended_goal: bodyGuidance.recommended_goal,
      recommendation_note: bodyGuidance.recommendation_note,
      target_breakfast_cal: meal_breakdown.breakfast,
      target_lunch_cal: meal_breakdown.lunch,
      target_dinner_cal: meal_breakdown.dinner,
      target_snack_cal: meal_breakdown.snack,
      calculation_date: new Date().toISOString(),
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
