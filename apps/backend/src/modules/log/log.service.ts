import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { FoodLog, DailyLog, MealType, SavedMeal, SavedMealItem, ActivityLog, CreateActivityLogDto, ACTIVITY_MET, ActivitySyncBatchDto, ActivitySyncResult } from '@calorie-ai/types';

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
      .gte('logged_at', startIso)
      .lte('logged_at', endIso)
      .order('logged_at', { ascending: true });

    if (error) throw error;

    const foodLogs = (logs ?? []) as FoodLog[];
    const total_calories = foodLogs.reduce((s, l) => s + l.calories, 0);
    const total_protein_g = foodLogs.reduce((s, l) => s + l.protein_g, 0);
    const total_carbs_g = foodLogs.reduce((s, l) => s + l.carbs_g, 0);
    const total_fat_g = foodLogs.reduce((s, l) => s + l.fat_g, 0);

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
      target_calories,
      remaining_calories: target_calories - total_calories,
    };
  }

  async deleteLog(id: string, userId: string) {
    const { error } = await this.supabase.db
      .from('food_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
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
    const total_calories = items.reduce((s, i) => s + i.calories, 0);
    const total_protein_g = items.reduce((s, i) => s + i.protein_g, 0);
    const total_carbs_g = items.reduce((s, i) => s + i.carbs_g, 0);
    const total_fat_g = items.reduce((s, i) => s + i.fat_g, 0);

    const { data, error } = await this.supabase.db
      .from('saved_meals')
      .insert({ user_id: userId, name, items, total_calories, total_protein_g, total_carbs_g, total_fat_g })
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
    return data as ActivityLog;
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
}
