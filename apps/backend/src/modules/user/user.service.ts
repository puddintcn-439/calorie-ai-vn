import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ActivityLevel, GoalPlan, GoalPlanDirection, HealthFlag, User, UserGoal } from '@calorie-ai/types';
import { CalorieTargetService } from '../calorie-target/calorie-target.service';

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
    return {
      target_breakfast_cal: Math.round(totalCalories * 0.25),
      target_lunch_cal: Math.round(totalCalories * 0.35),
      target_dinner_cal: Math.round(totalCalories * 0.3),
      target_snack_cal: Math.round(totalCalories * 0.1),
    };
  }

  private goalForDirection(direction: GoalPlanDirection): UserGoal {
    if (direction === 'loss') return 'lose_weight';
    if (direction === 'gain') return 'gain_muscle';
    return 'maintain';
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
      applied_at: now.toISOString(),
    };
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

    const now = new Date().toISOString();
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
