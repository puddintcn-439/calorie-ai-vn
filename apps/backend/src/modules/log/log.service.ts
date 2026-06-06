import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  FoodLog,
  DailyLog,
  MealType,
  SavedMeal,
  SavedMealItem,
  ActivityLog,
  CreateActivityLogDto,
  ACTIVITY_MET,
  ActivitySyncBatchDto,
  ActivitySyncResult,
  UpdateFoodLogInput,
  TodaySummary,
  DailyRoadmapItem,
  ActivityPreference,
} from '@calorie-ai/types';

@Injectable()
export class LogService {
  constructor(private supabase: SupabaseService) {}

  private getDayRangeByTimezone(date: string, tzOffsetMinutes: number = 0): { startIso: string; endIso: string } {
    const [y, m, d] = date.split('-').map((v) => parseInt(v, 10));
    const safeYear = Number.isFinite(y) ? y : 1970;
    const safeMonth = Number.isFinite(m) ? m - 1 : 0;
    const safeDay = Number.isFinite(d) ? d : 1;

    // Convert local-day boundaries to UTC using client offset (same semantics as JS getTimezoneOffset).
    const localStartUtcMs = Date.UTC(safeYear, safeMonth, safeDay, 0, 0, 0, 0) + tzOffsetMinutes * 60_000;
    const localEndUtcMs = localStartUtcMs + (24 * 60 * 60 * 1000) - 1;

    return {
      startIso: new Date(localStartUtcMs).toISOString(),
      endIso: new Date(localEndUtcMs).toISOString(),
    };
  }

  async createLog(data: Partial<FoodLog>): Promise<FoodLog> {
    const { data: log, error } = await this.supabase.db
      .from('food_logs')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return log as FoodLog;
  }

  async getDailyLog(userId: string, date: string, tzOffsetMinutes: number = 0): Promise<DailyLog> {
    const { startIso, endIso } = this.getDayRangeByTimezone(date, tzOffsetMinutes);

    const { data: logs, error } = await this.supabase.db
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('logged_at', startIso)
      .lte('logged_at', endIso)
      .order('logged_at', { ascending: true });

    if (error) throw error;

    const foodLogs = (logs ?? []) as FoodLog[];
    const total_calories = foodLogs.reduce((s, l) => s + l.calories, 0);
    const total_protein_g = foodLogs.reduce((s, l) => s + l.protein_g, 0);
    const total_carbs_g = foodLogs.reduce((s, l) => s + l.carbs_g, 0);
    const total_fat_g = foodLogs.reduce((s, l) => s + l.fat_g, 0);
    const total_fiber_g = this.sumOptional(foodLogs, 'fiber_g');
    const total_sugar_g = this.sumOptional(foodLogs, 'sugar_g');
    const total_saturated_fat_g = this.sumOptional(foodLogs, 'saturated_fat_g');
    const total_sodium_mg = this.sumOptional(foodLogs, 'sodium_mg');

    const { data: userRow } = await this.supabase.db
      .from('users')
      .select('daily_calorie_target')
      .eq('id', userId)
      .single();

    const target_calories = userRow?.daily_calorie_target ?? 1800;

    return {
      date,
      logs: foodLogs,
      total_calories,
      total_protein_g,
      total_carbs_g,
      total_fat_g,
      total_fiber_g,
      total_sugar_g,
      total_saturated_fat_g,
      total_sodium_mg,
      nutrition_quality_coverage: {
        total_items: foodLogs.length,
        fiber_items: foodLogs.filter((log) => log.fiber_g != null).length,
        sugar_items: foodLogs.filter((log) => log.sugar_g != null).length,
        saturated_fat_items: foodLogs.filter((log) => log.saturated_fat_g != null).length,
        sodium_items: foodLogs.filter((log) => log.sodium_mg != null).length,
      },
      target_calories,
      remaining_calories: target_calories - total_calories,
    };
  }

  async getTodaySummary(userId: string, date: string, tzOffsetMinutes: number = 0): Promise<TodaySummary> {
    const status: TodaySummary['status'] = {
      daily_log: 'ok',
      activity_logs: 'ok',
      daily_roadmap: 'ok',
      activity_preferences: 'ok',
      profile: 'ok',
    };
    const errors: TodaySummary['errors'] = {};

    const capture = async <T>(
      key: keyof TodaySummary['status'],
      fallback: T,
      loader: () => Promise<T>,
    ): Promise<T> => {
      try {
        return await loader();
      } catch (error: any) {
        status[key] = 'error';
        errors[key] = String(error?.message ?? error ?? 'unknown_error');
        return fallback;
      }
    };

    const [dailyLog, activityLogs, dailyRoadmap, activityPreferences, profile] = await Promise.all([
      capture('daily_log', null, () => this.getDailyLog(userId, date, tzOffsetMinutes)),
      capture('activity_logs', [], () => this.getActivityLogs(userId, date, tzOffsetMinutes)),
      capture('daily_roadmap', [], () => this.getDailyRoadmapForSummary(userId, date)),
      capture('activity_preferences', [], () => this.getActivityPreferencesForSummary(userId)),
      capture('profile', null, () => this.getProfileForSummary(userId)),
    ]);

    const consumed = dailyLog?.total_calories ?? 0;
    const target = dailyLog?.target_calories ?? Number((profile as any)?.daily_calorie_target ?? 1800);
    const burned = activityLogs.reduce((sum, item) => sum + Number(item.calories_burned ?? 0), 0);
    const activeRoadmap = dailyRoadmap.filter((item) => !item.is_removed);
    const roadmapCompleted = activeRoadmap.filter((item) => item.is_completed).length;
    const plan = {
      target_calories: target,
      consumed_calories: consumed,
      burned_calories: burned,
      net_calories: Math.max(0, consumed - burned),
      remaining_calories: target - Math.max(0, consumed - burned),
      roadmap_total: activeRoadmap.length,
      roadmap_completed: roadmapCompleted,
      roadmap_remaining: Math.max(0, activeRoadmap.length - roadmapCompleted),
      planned_activity_kcal: activeRoadmap.reduce((sum, item) => sum + Number(item.estimated_kcal ?? 0), 0),
    };

    return {
      date,
      timezone_offset_minutes: tzOffsetMinutes,
      daily_log: dailyLog,
      activity_logs: activityLogs,
      daily_roadmap: dailyRoadmap,
      activity_preferences: activityPreferences,
      profile,
      plan,
      health_score: this.buildHealthScore(dailyLog, activityLogs, activeRoadmap, plan, profile),
      status,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }

  private buildHealthScore(
    dailyLog: DailyLog | null,
    activityLogs: ActivityLog[],
    roadmap: DailyRoadmapItem[],
    plan: TodaySummary['plan'],
    profile: TodaySummary['profile'],
  ): TodaySummary['health_score'] {
    const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));
    const safeTarget = Math.max(Number(plan.target_calories || profile?.daily_calorie_target || 1800), 1);
    const logs = dailyLog?.logs ?? [];
    const mealTypesLogged = new Set(logs.map((log) => log.meal_type)).size;
    const activityMinutes = activityLogs.reduce((sum, item) => sum + Number(item.duration_min ?? 0), 0);
    const roadmapTotal = roadmap.length;
    const roadmapDone = roadmap.filter((item) => item.is_completed).length;
    const roadmapCompletion = roadmapTotal > 0 ? roadmapDone / roadmapTotal : null;
    const calorieGapPct = Math.abs(plan.net_calories - safeTarget) / safeTarget;
    const calorieScore = logs.length === 0 ? 20 : clamp(100 - calorieGapPct * 120);
    const proteinTarget = Math.max(Number(profile?.weight_kg ?? 65) * 1.2, 60);
    const proteinScore = logs.length === 0 ? 20 : clamp((Number(dailyLog?.total_protein_g ?? 0) / proteinTarget) * 100);
    const qualityCoverage = dailyLog?.nutrition_quality_coverage;
    const coverageScore = qualityCoverage?.total_items
      ? clamp((
        Number(qualityCoverage.fiber_items ?? 0)
        + Number(qualityCoverage.sugar_items ?? 0)
        + Number(qualityCoverage.sodium_items ?? 0)
        + Number(qualityCoverage.saturated_fat_items ?? 0)
      ) / (qualityCoverage.total_items * 4) * 100)
      : logs.length > 0 ? 45 : 20;
    const nutrition = clamp(calorieScore * 0.5 + proteinScore * 0.3 + coverageScore * 0.2);

    const activityBase = roadmapCompletion !== null
      ? roadmapCompletion * 100
      : Math.min(activityMinutes / 30, 1) * 100;
    const activity = clamp(activityBase + (plan.burned_calories > 0 ? 10 : 0));

    const mealConsistency = Math.min(mealTypesLogged / 3, 1) * 100;
    const planConsistency = roadmapCompletion !== null ? roadmapCompletion * 100 : activityMinutes > 0 ? 75 : 45;
    const consistency = clamp(mealConsistency * 0.65 + planConsistency * 0.35);

    const intenseMinutes = activityMinutes;
    const recovery = clamp(intenseMinutes > 90 ? 68 : intenseMinutes > 45 ? 78 : logs.length > 0 || activityMinutes > 0 ? 72 : 55);

    const overall = clamp(nutrition * 0.4 + activity * 0.25 + consistency * 0.25 + recovery * 0.1);
    const signals: string[] = [];
    if (logs.length === 0) signals.push('No meal logged yet');
    if (mealTypesLogged > 0 && mealTypesLogged < 3) signals.push(`${mealTypesLogged}/3 core meals logged`);
    if (nutrition >= 80) signals.push('Nutrition is close to plan');
    if (activityMinutes > 0) signals.push(`${activityMinutes} activity minutes logged`);
    if (roadmapTotal > 0) signals.push(`${roadmapDone}/${roadmapTotal} plan tasks complete`);
    if (coverageScore < 70 && logs.length > 0) signals.push('Nutrition detail coverage is incomplete');

    const nextAction: TodaySummary['health_score']['next_action'] =
      logs.length === 0 ? 'log_meal'
        : roadmapTotal > 0 && roadmapDone < roadmapTotal ? 'complete_plan'
          : activityMinutes === 0 ? 'move'
            : recovery < 70 ? 'recover'
              : 'maintain';

    return {
      overall,
      label: overall < 45 ? 'needs_data' : overall < 65 ? 'building' : overall < 82 ? 'steady' : 'strong',
      nutrition,
      activity,
      consistency,
      recovery,
      signals: signals.slice(0, 4),
      next_action: nextAction,
    };
  }

  private async getDailyRoadmapForSummary(userId: string, date: string): Promise<DailyRoadmapItem[]> {
    const { data, error } = await this.supabase.db
      .from('user_daily_roadmap')
      .select('*')
      .eq('user_id', userId)
      .eq('logged_date', date)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as DailyRoadmapItem[];
  }

  private async getActivityPreferencesForSummary(userId: string): Promise<ActivityPreference[]> {
    const { data, error } = await this.supabase.db
      .from('user_activity_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as ActivityPreference[];
  }

  private async getProfileForSummary(userId: string): Promise<TodaySummary['profile']> {
    const { data, error } = await this.supabase.db
      .from('users')
      .select('age, gender, height_cm, weight_kg, health_flags, activity_level, goal_plan, daily_calorie_target, goal')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data as TodaySummary['profile'];
  }

  private sumOptional(logs: FoodLog[], key: 'fiber_g' | 'sugar_g' | 'saturated_fat_g' | 'sodium_mg'): number {
    return Number(logs.reduce((sum, log) => sum + Number(log[key] ?? 0), 0).toFixed(1));
  }

  async deleteLog(id: string, userId: string) {
    const { data, error } = await this.supabase.db
      .from('food_logs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) throw error;
    return { success: true, deleted: data as FoodLog };
  }

  async restoreLog(id: string, userId: string): Promise<FoodLog> {
    const { data, error } = await this.supabase.db
      .from('food_logs')
      .update({ deleted_at: null })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as FoodLog;
  }

  async updateLog(id: string, userId: string, updates: UpdateFoodLogInput): Promise<FoodLog> {
    const { data: existing, error: existingError } = await this.supabase.db
      .from('food_logs')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (existingError) throw existingError;
    if (!existing) throw new Error('Food log not found');

    const payload = this.buildFoodLogUpdate(existing as FoodLog, updates);
    const { data, error } = await this.supabase.db
      .from('food_logs')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) throw error;
    return data as FoodLog;
  }

  // ---- Saved Meals ----

  async getSavedMeals(userId: string): Promise<SavedMeal[]> {
    const { data, error } = await this.supabase.db
      .from('saved_meals')
      .select('*')
      .eq('user_id', userId)
      .order('use_count', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data as SavedMeal[];
  }

  async createSavedMeal(userId: string, name: string, items: SavedMealItem[]): Promise<SavedMeal> {
    const totals = this.computeSavedMealTotals(items);

    const { data, error } = await this.supabase.db
      .from('saved_meals')
      .insert({
        user_id: userId,
        name,
        items,
        ...totals,
      })
      .select()
      .single();

    if (error) throw error;
    return data as SavedMeal;
  }

  async logSavedMeal(userId: string, savedMealId: string, mealType: MealType): Promise<FoodLog[]> {
    const { data: saved, error } = await this.supabase.db
      .from('saved_meals')
      .select('*')
      .eq('id', savedMealId)
      .eq('user_id', userId)
      .single();

    if (error || !saved) throw new Error('Saved meal not found');

    const meal = saved as SavedMeal;
    const logs: FoodLog[] = [];

    for (const item of meal.items) {
      const log = await this.createLog({
        user_id: userId,
        meal_type: mealType,
        name: item.name,
        name_vi: item.name_vi,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        fiber_g: item.fiber_g,
        sugar_g: item.sugar_g,
        saturated_fat_g: item.saturated_fat_g,
        sodium_mg: item.sodium_mg,
        estimated_grams: item.estimated_grams,
        unit: 'gram',
        source: 'quick_add',
        logged_at: new Date().toISOString(),
      });
      logs.push(log);
    }

    // bump use_count
    await this.supabase.db
      .from('saved_meals')
      .update({ use_count: (meal.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq('id', savedMealId);

    return logs;
  }

  async deleteSavedMeal(id: string, userId: string) {
    const { error } = await this.supabase.db
      .from('saved_meals')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  }

  async updateSavedMeal(
    id: string,
    userId: string,
    updates: { name?: string; items?: SavedMealItem[] },
  ): Promise<SavedMeal> {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.items !== undefined) {
      payload.items = updates.items;
      Object.assign(payload, this.computeSavedMealTotals(updates.items));
    }

    const { data, error } = await this.supabase.db
      .from('saved_meals')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as SavedMeal;
  }

  // ─────────────────────── Activity Logs ───────────────────────

  async createActivityLog(userId: string, dto: CreateActivityLogDto): Promise<ActivityLog> {
    // Estimate calories if not provided (MET × weight × hours)
    let caloriesBurned = dto.calories_burned;
    if (!caloriesBurned) {
      const { data: user } = await this.supabase.db
        .from('users').select('weight_kg').eq('id', userId).single();
      const weight = (user as any)?.weight_kg ?? 65;
      const met = ACTIVITY_MET[dto.activity_type] ?? 5;
      caloriesBurned = Math.round(met * weight * (dto.duration_min / 60));
    }

    const { data, error } = await this.supabase.db
      .from('activity_logs')
      .insert({ user_id: userId, source: dto.source ?? 'manual', ...dto, calories_burned: caloriesBurned })
      .select()
      .single();

    if (error) throw error;
    const activity = data as ActivityLog;
    await this.autoCompleteRoadmapFromActivity(userId, activity).catch(() => undefined);
    return activity;
  }

  async syncActivityBatch(userId: string, dto: ActivitySyncBatchDto): Promise<ActivitySyncResult> {
    const externalIds = dto.entries.map((entry) => entry.external_id);

    const { data: existingRows, error: existingError } = await this.supabase.db
      .from('activity_logs')
      .select('external_id')
      .eq('user_id', userId)
      .eq('source', dto.source)
      .in('external_id', externalIds);

    if (existingError) throw existingError;

    const existingIds = new Set((existingRows ?? []).map((row: any) => row.external_id));
    const newEntries = dto.entries.filter((entry) => !existingIds.has(entry.external_id));

    if (newEntries.length > 0) {
      const rows = newEntries.map((entry) => ({
        user_id: userId,
        source: dto.source,
        external_id: entry.external_id,
        synced_at: dto.synced_at,
        activity_type: entry.activity_type,
        activity_name: entry.activity_name,
        duration_min: entry.duration_min,
        calories_burned: entry.calories_burned,
        logged_at: entry.logged_at,
        steps_count: entry.steps_count,
        distance_km: entry.distance_km,
        notes: entry.notes,
      }));

      const { error: insertError } = await this.supabase.db
        .from('activity_logs')
        .insert(rows);

      if (insertError) throw insertError;

      await Promise.all(newEntries.map((entry) => this.autoCompleteRoadmapFromActivity(userId, {
        id: entry.external_id,
        user_id: userId,
        source: dto.source,
        activity_type: entry.activity_type,
        activity_name: entry.activity_name,
        duration_min: entry.duration_min,
        calories_burned: entry.calories_burned,
        logged_at: entry.logged_at,
        created_at: entry.logged_at,
      } as ActivityLog).catch(() => undefined)));
    }

    return {
      source: dto.source,
      synced_at: dto.synced_at,
      imported_count: newEntries.length,
      skipped_count: dto.entries.length - newEntries.length,
      total_calories_burned: newEntries.reduce((sum, entry) => sum + entry.calories_burned, 0),
    };
  }

  async getActivityLogs(userId: string, date: string, tzOffsetMinutes: number = 0): Promise<ActivityLog[]> {
    const { startIso, endIso } = this.getDayRangeByTimezone(date, tzOffsetMinutes);

    const { data, error } = await this.supabase.db
      .from('activity_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', startIso)
      .lte('logged_at', endIso)
      .order('logged_at', { ascending: false });

    if (error) throw error;
    return data as ActivityLog[];
  }

  async deleteActivityLog(id: string, userId: string) {
    const { error } = await this.supabase.db
      .from('activity_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  }

  private async autoCompleteRoadmapFromActivity(userId: string, activity: ActivityLog): Promise<void> {
    const loggedDate = (activity.logged_at ?? new Date().toISOString()).slice(0, 10);
    const duration = Number(activity.duration_min ?? 0);
    if (!activity.activity_type || duration <= 0) return;

    const { data, error } = await this.supabase.db
      .from('user_daily_roadmap')
      .select('id, duration_min')
      .eq('user_id', userId)
      .eq('logged_date', loggedDate)
      .eq('activity_type', activity.activity_type)
      .eq('is_removed', false)
      .eq('is_completed', false)
      .lte('duration_min', duration + 5)
      .order('duration_min', { ascending: false })
      .limit(1);

    if (error || !data?.[0]?.id) return;

    await this.supabase.db
      .from('user_daily_roadmap')
      .update({ is_completed: true, updated_at: new Date().toISOString() })
      .eq('id', data[0].id)
      .eq('user_id', userId);
  }

  private buildFoodLogUpdate(existing: FoodLog, updates: UpdateFoodLogInput): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    const directFields: (keyof UpdateFoodLogInput)[] = [
      'meal_type',
      'logged_at',
      'quantity',
      'unit',
      'name',
      'name_vi',
      'notes',
    ];

    for (const field of directFields) {
      if (updates[field] !== undefined) payload[field] = updates[field];
    }

    const macroFields: (keyof UpdateFoodLogInput)[] = [
      'calories',
      'protein_g',
      'carbs_g',
      'fat_g',
      'fiber_g',
      'sugar_g',
      'saturated_fat_g',
      'sodium_mg',
    ];
    const gramsChanged = updates.estimated_grams !== undefined && updates.estimated_grams !== existing.estimated_grams;
    const oldGrams = Number(existing.estimated_grams);
    const newGrams = Number(updates.estimated_grams);
    const ratio = gramsChanged && Number.isFinite(oldGrams) && oldGrams > 0 && Number.isFinite(newGrams) && newGrams >= 0
      ? newGrams / oldGrams
      : null;

    if (updates.estimated_grams !== undefined) payload.estimated_grams = this.round1(newGrams);

    for (const field of macroFields) {
      const explicit = updates[field];
      if (explicit !== undefined) {
        payload[field] = field === 'calories' || field === 'sodium_mg'
          ? Math.round(Number(explicit))
          : this.round1(Number(explicit));
        continue;
      }

      if (ratio !== null) {
        const current = existing[field as keyof FoodLog];
        if (current != null) {
          payload[field] = field === 'calories' || field === 'sodium_mg'
            ? Math.round(Number(current) * ratio)
            : this.round1(Number(current) * ratio);
        }
      }
    }

    return payload;
  }

  private computeSavedMealTotals(items: SavedMealItem[]): Record<string, number> {
    return {
      total_calories: Math.round(items.reduce((s, i) => s + Number(i.calories ?? 0), 0)),
      total_protein_g: this.round1(items.reduce((s, i) => s + Number(i.protein_g ?? 0), 0)),
      total_carbs_g: this.round1(items.reduce((s, i) => s + Number(i.carbs_g ?? 0), 0)),
      total_fat_g: this.round1(items.reduce((s, i) => s + Number(i.fat_g ?? 0), 0)),
      total_fiber_g: this.round1(items.reduce((s, i) => s + Number(i.fiber_g ?? 0), 0)),
      total_sugar_g: this.round1(items.reduce((s, i) => s + Number(i.sugar_g ?? 0), 0)),
      total_saturated_fat_g: this.round1(items.reduce((s, i) => s + Number(i.saturated_fat_g ?? 0), 0)),
      total_sodium_mg: Math.round(items.reduce((s, i) => s + Number(i.sodium_mg ?? 0), 0)),
    };
  }

  private round1(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 10) / 10;
  }
}
