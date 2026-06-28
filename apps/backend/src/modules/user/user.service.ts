import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ActivityLevel, ClinicianNutritionTargets, GoalPlan, GoalPlanDirection, HealthFlag, User, UserGoal } from '@calorie-ai/types';
import { CalorieTargetService } from '../calorie-target/calorie-target.service';
import { calculateDefaultMealTargets } from '../calorie-target/meal-target.policy';

@Injectable()
export class UserService {
  private readonly calorieTargetService = new CalorieTargetService();

  constructor(private supabase: SupabaseService) {}

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private numberInRange(value: unknown, min: number, max: number): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.min(max, Math.max(min, parsed));
  }

  private toIsoDate(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
  }

  private addDays(date: Date, days: number): string {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  private getMealBreakdown(totalCalories: number) {
    const targets = calculateDefaultMealTargets(totalCalories);
    return {
      target_breakfast_cal: targets.breakfast,
      target_lunch_cal: targets.lunch,
      target_dinner_cal: targets.dinner,
      target_snack_cal: targets.snack,
    };
  }

  private goalForDirection(direction: GoalPlanDirection): UserGoal {
    if (direction === 'loss') return 'lose_weight';
    if (direction === 'gain') return 'gain_muscle';
    return 'maintain';
  }

  private ageFromDateOfBirth(value: string | undefined, now = new Date()): number | undefined {
    if (!value) return undefined;
    const birthDate = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(birthDate.getTime()) || birthDate > now) return undefined;
    let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const birthdayPassed = now.getUTCMonth() > birthDate.getUTCMonth()
      || (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
    if (!birthdayPassed) age -= 1;
    return age >= 13 && age <= 120 ? age : undefined;
  }

  private deriveActivityLevel(profile: Partial<User>): ActivityLevel | undefined {
    if (!profile.work_activity_level) return profile.activity_level;
    const workBase: Record<NonNullable<User['work_activity_level']>, number> = {
      sedentary: 0,
      light: 1,
      moderate: 2,
      heavy: 3,
    };
    const weeklyExerciseMinutes = Math.max(0, Number(profile.exercise_sessions_per_week ?? 0))
      * Math.max(0, Number(profile.exercise_minutes_per_session ?? 0));
    // 150 and 300 minutes align with the WHO adult moderate-activity range.
    // Intensity is not collected yet, so this remains an evidence-informed product rule.
    const exerciseBoost = weeklyExerciseMinutes >= 300 ? 2 : weeklyExerciseMinutes >= 150 ? 1 : 0;
    const score = Math.min(4, workBase[profile.work_activity_level] + exerciseBoost);
    return (['sedentary', 'light', 'moderate', 'active', 'very_active'] as ActivityLevel[])[score];
  }

  private isSameClinicianPlan(
    raw: ClinicianNutritionTargets,
    existing: ClinicianNutritionTargets,
  ): boolean {
    const fields: Array<keyof ClinicianNutritionTargets> = [
      'calories_kcal',
      'protein_g',
      'carbs_g',
      'fat_g',
      'fiber_g',
      'water_ml',
      'sodium_mg_max',
      'source',
      'provider_type',
      'plan_reference',
      'reason',
      'effective_from',
      'expires_at',
    ];
    return fields.every((field) => (raw[field] ?? null) === (existing[field] ?? null));
  }

  private normaliseClinicianTarget(
    raw: User['clinician_nutrition_targets'],
    existing: User['clinician_nutrition_targets'],
    now: Date,
  ): ClinicianNutritionTargets | null {
    if (raw == null) return null;
    if (
      existing?.provenance === 'provider_verified'
      && existing.verification_status === 'verified'
      && this.isSameClinicianPlan(raw, existing)
    ) {
      // Profile saves echo the current plan. Preserve trusted verification only
      // while every user-editable plan field remains byte-for-byte unchanged.
      return existing;
    }
    const source = String(raw.source ?? '').trim().slice(0, 160);
    if (!source) throw new BadRequestException('Clinical nutrition target requires a source.');

    const ranges = {
      calories_kcal: [500, 10000],
      protein_g: [1, 500],
      carbs_g: [1, 1200],
      fat_g: [1, 500],
      fiber_g: [1, 150],
      water_ml: [250, 10000],
      sodium_mg_max: [100, 10000],
    } as const;
    const values: Partial<ClinicianNutritionTargets> = {};
    for (const [key, [min, max]] of Object.entries(ranges) as Array<[
      keyof typeof ranges,
      readonly [number, number],
    ]>) {
      const value = raw[key];
      if (value === undefined || value === null) continue;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        throw new BadRequestException(`Clinical target ${key} must be between ${min} and ${max}.`);
      }
      (values as Record<string, number>)[key] = Math.round(parsed * 10) / 10;
    }
    if (Object.keys(values).length === 0) {
      throw new BadRequestException('Clinical nutrition target requires at least one numeric target.');
    }

    const providerType = raw.provider_type === 'doctor'
      || raw.provider_type === 'dietitian'
      || raw.provider_type === 'care_team'
      ? raw.provider_type
      : undefined;
    const effectiveFrom = raw.effective_from
      ? this.toIsoDate(raw.effective_from, now.toISOString().split('T')[0])
      : undefined;
    const expiresAt = raw.expires_at
      ? this.toIsoDate(raw.expires_at, '')
      : null;
    if (raw.expires_at && !expiresAt) {
      throw new BadRequestException('Clinical target expires_at must use YYYY-MM-DD format.');
    }
    if (effectiveFrom && expiresAt && expiresAt < effectiveFrom) {
      throw new BadRequestException('Clinical target expiry must be on or after its effective date.');
    }

    return {
      ...values,
      source,
      provider_type: providerType,
      plan_reference: raw.plan_reference?.trim().slice(0, 120),
      reason: raw.reason?.trim().slice(0, 300),
      effective_from: effectiveFrom,
      expires_at: expiresAt,
      confirmed_at: now.toISOString(),
      provenance: 'user_reported',
      verification_status: 'self_attested',
      verified_at: undefined,
      verified_by: undefined,
      status: 'active',
      plan_version: Math.max(1, Number(existing?.plan_version ?? 0) + 1),
    };
  }

  private normaliseGoalPlan(raw: unknown, now: Date): GoalPlan | null | undefined {
    if (raw == null) return null;
    if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;

    const source = raw as GoalPlan;
    const direction: GoalPlanDirection =
      source.direction === 'gain' || source.direction === 'maintain' || source.direction === 'loss'
        ? source.direction
        : 'maintain';
    const targetKg = direction === 'maintain' ? 0 : this.numberInRange(source.target_kg, 0, 100);
    const durationWeeks = direction === 'maintain'
      ? this.numberInRange(source.duration_weeks, 1, 260) ?? 4
      : this.numberInRange(source.duration_weeks, 1, 260);
    const startDate = this.toIsoDate(source.start_date, now.toISOString().split('T')[0]);
    const endDate = durationWeeks
      ? this.toIsoDate(source.end_date, this.addDays(new Date(`${startDate}T00:00:00.000Z`), Math.round(durationWeeks * 7)))
      : undefined;
    const note = typeof source.note === 'string' ? source.note.trim().slice(0, 240) : undefined;

    return {
      direction,
      target_kg: targetKg,
      duration_weeks: durationWeeks,
      start_date: startDate,
      end_date: endDate,
      ...(note ? { note } : {}),
    };
  }

  private applyGoalPlan(updates: Partial<User>, existing: User, now: Date): void {
    if (!Object.prototype.hasOwnProperty.call(updates, 'goal_plan')) return;

    const plan = this.normaliseGoalPlan(updates.goal_plan, now);
    if (plan === null) {
      updates.goal_plan = null;
      return;
    }

    if (!plan) {
      delete updates.goal_plan;
      return;
    }

    const merged = {
      weight_kg: updates.weight_kg ?? existing.weight_kg,
      height_cm: updates.height_cm ?? existing.height_cm,
      age: updates.age ?? existing.age,
      gender: updates.gender ?? existing.gender,
      activity_level: updates.activity_level ?? existing.activity_level,
      health_flags: updates.health_flags ?? existing.health_flags,
    };
    const warnings: string[] = [];

    if (!merged.weight_kg || !merged.height_cm || !merged.age || !merged.gender || !merged.activity_level) {
      updates.goal_plan = {
        ...plan,
        safety_status: 'incomplete',
        warnings: ['Complete age, sex, height, weight, and activity level before applying a calorie goal plan.'],
        applied_at: now.toISOString(),
      };
      return;
    }

    const requestedGoal = this.goalForDirection(plan.direction ?? 'maintain');
    const targetCalc = this.calorieTargetService.calculateTarget({
      weight_kg: merged.weight_kg,
      height_cm: merged.height_cm,
      age: merged.age,
      gender: merged.gender,
      activity_level: merged.activity_level as ActivityLevel,
      goal: requestedGoal,
      health_flags: merged.health_flags as HealthFlag[] | undefined,
    });

    const tdee = targetCalc.tdee;
    const days = Math.max(1, Math.round((plan.duration_weeks ?? 0) * 7));
    const targetKg = Math.max(0, plan.target_kg ?? 0);
    const requestedDailyDelta = targetKg > 0 && days > 0 ? Math.round((targetKg * 7700) / days) : 0;
    let computedTarget = targetCalc.daily_calorie_target;
    let safetyStatus: GoalPlan['safety_status'] = 'ok';

    const maintenanceOnly = plan.direction === 'maintain'
      || (targetCalc.effective_goal === 'maintain' && requestedGoal !== 'maintain');

    if (maintenanceOnly) {
      computedTarget = targetCalc.daily_calorie_target;
      if (requestedGoal !== 'maintain') {
        safetyStatus = 'maintenance_only';
        warnings.push('Weight-change goal was replaced with maintenance because this profile requires conservative targets.');
      }
    } else if (plan.direction === 'loss') {
      const requestedTarget = Math.round(tdee - requestedDailyDelta);
      computedTarget = Math.max(requestedTarget, targetCalc.daily_calorie_target);
      if (computedTarget > requestedTarget) {
        safetyStatus = 'adjusted';
        warnings.push('Requested deficit was capped to avoid an aggressive calorie target.');
      }
    } else if (plan.direction === 'gain') {
      const requestedTarget = Math.round(tdee + requestedDailyDelta);
      computedTarget = Math.min(requestedTarget, targetCalc.daily_calorie_target);
      if (computedTarget < requestedTarget) {
        safetyStatus = 'adjusted';
        warnings.push('Requested surplus was capped for a conservative lean-gain target.');
      }
    }

    updates.goal = targetCalc.effective_goal;
    updates.daily_calorie_target = computedTarget;
    Object.assign(updates, this.getMealBreakdown(computedTarget));
    updates.goal_plan = {
      ...plan,
      target_kg: targetKg,
      duration_weeks: plan.duration_weeks,
      weekly_rate_kg: plan.duration_weeks ? this.round1(targetKg / plan.duration_weeks) : 0,
      daily_calorie_delta: computedTarget - tdee,
      computed_daily_calorie_target: computedTarget,
      safety_status: safetyStatus,
      warnings,
      calculation_method: 'static_7700_reference',
      calculation_evidence_level: 'evidence_informed_heuristic',
      reference_energy_kcal_per_kg: 7700,
      applied_at: now.toISOString(),
    };
    const nutritionTarget = this.calorieTargetService.calculateDailyNutritionTarget(
      { ...merged, ...updates },
      now.toISOString().split('T')[0],
      computedTarget,
    );
    updates.nutrition_target_snapshot = nutritionTarget;
    updates.nutrition_algorithm_version = nutritionTarget.algorithm_version;
    updates.nutrition_target_calculated_at = nutritionTarget.calculated_at;
  }

  private applyDerivedNutritionTarget(updates: Partial<User>, existing: User): void {
    const targetInputs: Array<keyof User> = [
      'weight_kg',
      'height_cm',
      'body_fat_pct',
      'date_of_birth',
      'age',
      'gender',
      'activity_level',
      'work_activity_level',
      'exercise_sessions_per_week',
      'exercise_minutes_per_session',
      'goal',
      'health_flags',
      'pregnancy_trimester',
      'breastfeeding_level',
      'diabetes_type',
      'kidney_care_status',
      'athlete_level',
      'clinician_nutrition_targets',
    ];
    if (!targetInputs.some((key) => Object.prototype.hasOwnProperty.call(updates, key))) return;

    const merged = { ...existing, ...updates };
    if (
      !merged.weight_kg
      || !merged.height_cm
      || !merged.age
      || !merged.gender
      || !merged.activity_level
      || !merged.goal
    ) return;

    const target = this.calorieTargetService.calculateTarget({
      weight_kg: merged.weight_kg,
      height_cm: merged.height_cm,
      body_fat_pct: merged.body_fat_pct,
      age: merged.age,
      gender: merged.gender,
      activity_level: merged.activity_level,
      goal: merged.goal,
      health_flags: merged.health_flags,
    });
    updates.goal = target.effective_goal;
    const clinicianCalories = Number(merged.clinician_nutrition_targets?.calories_kcal);
    const dailyCalories = Number.isFinite(clinicianCalories) && clinicianCalories > 0
      ? Math.round(clinicianCalories)
      : target.daily_calorie_target;
    updates.daily_calorie_target = dailyCalories;
    Object.assign(updates, this.getMealBreakdown(dailyCalories));
    const nutritionTarget = this.calorieTargetService.calculateDailyNutritionTarget(
      { ...merged, ...updates },
      new Date().toISOString().split('T')[0],
      dailyCalories,
    );
    updates.nutrition_target_snapshot = nutritionTarget;
    updates.nutrition_algorithm_version = nutritionTarget.algorithm_version;
    updates.nutrition_target_calculated_at = nutritionTarget.calculated_at;
  }

  async getProfile(userId: string, email?: string): Promise<User> {
    const { data, error } = await this.supabase.db
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data && email) {
      const { data: inserted, error: insertError } = await this.supabase.db
        .from('users')
        .insert({
          id: userId,
          email,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return inserted as User;
    }

    if (!data) throw new NotFoundException('User not found');
    return data as User;
  }

  async updateProfile(userId: string, updates: Partial<User>, email?: string): Promise<User> {
    // Ensure user exists and get current profile
    const existing = await this.getProfile(userId, email);
    // Derived recommendation fields are backend-owned. Ignore stale or
    // malicious clients that attempt to write them directly.
    for (const key of [
      'activity_level',
      'daily_calorie_target',
      'target_breakfast_cal',
      'target_lunch_cal',
      'target_dinner_cal',
      'target_snack_cal',
      'nutrition_target_snapshot',
      'nutrition_algorithm_version',
      'nutrition_target_calculated_at',
    ] as Array<keyof User>) {
      delete updates[key];
    }

    const now = new Date().toISOString();
    if (Object.prototype.hasOwnProperty.call(updates, 'clinician_nutrition_targets')) {
      updates.clinician_nutrition_targets = this.normaliseClinicianTarget(
        updates.clinician_nutrition_targets,
        existing.clinician_nutrition_targets,
        new Date(now),
      );
    }
    if (updates.date_of_birth) {
      const derivedAge = this.ageFromDateOfBirth(updates.date_of_birth, new Date(now));
      if (derivedAge !== undefined) updates.age = derivedAge;
    }
    if (
      Object.prototype.hasOwnProperty.call(updates, 'work_activity_level')
      || Object.prototype.hasOwnProperty.call(updates, 'exercise_sessions_per_week')
      || Object.prototype.hasOwnProperty.call(updates, 'exercise_minutes_per_session')
    ) {
      updates.activity_level = this.deriveActivityLevel({ ...existing, ...updates });
    }
    this.applyDerivedNutritionTarget(updates, existing);
    this.applyGoalPlan(updates, existing, new Date(now));
    const { data, error } = await this.supabase.db
      .from('users')
      .update({ ...updates, updated_at: now })
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (data) return data as User;

    if (!email) throw new NotFoundException('User email not found');

    const { data: inserted, error: insertError } = await this.supabase.db
      .from('users')
      .insert({
        id: userId,
        email,
        full_name: updates.full_name ?? null,
        ...updates,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return inserted as User;
  }
}
