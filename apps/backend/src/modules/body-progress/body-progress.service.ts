import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  BodyProgressEntry,
  BodyProgressSummary,
  CreateBodyProgressDto,
  GoalPlan,
  BodyProgressTrend,
} from '@calorie-ai/types';

type FoodLogRow = {
  logged_at: string;
  calories: number;
};

type UserProgressRow = {
  daily_calorie_target?: number | null;
  weight_kg?: number | null;
  goal?: string | null;
  goal_plan?: GoalPlan | null;
};

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function dateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().split('T')[0];
}

function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map((part) => parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day) + days * 86_400_000).toISOString().split('T')[0];
}

function weekKey(key: string): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return date.toISOString().split('T')[0];
}

@Injectable()
export class BodyProgressService {
  private readonly logger = new Logger(BodyProgressService.name);

  constructor(private supabase: SupabaseService) {}

  async upsertEntry(userId: string, dto: CreateBodyProgressDto): Promise<BodyProgressEntry> {
    const date = dto.recorded_at ?? new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase.db
      .from('body_progress')
      .upsert(
        { user_id: userId, recorded_at: date, ...dto },
        { onConflict: 'user_id,recorded_at' },
      )
      .select()
      .single();

    if (error) throw error;
    return data as BodyProgressEntry;
  }

  async getEntries(userId: string, limit = 90): Promise<BodyProgressEntry[]> {
    const { data, error } = await this.supabase.db
      .from('body_progress')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as BodyProgressEntry[];
  }

  async getEntry(userId: string, date: string): Promise<BodyProgressEntry | null> {
    const { data, error } = await this.supabase.db
      .from('body_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('recorded_at', date)
      .maybeSingle();

    if (error) throw error;
    return (data ?? null) as BodyProgressEntry | null;
  }

  async deleteEntry(userId: string, id: number): Promise<void> {
    const { error } = await this.supabase.db
      .from('body_progress')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async getTrend(userId: string): Promise<BodyProgressTrend> {
    const entries = await this.getEntries(userId, 90);
    const sorted = [...entries].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );
    const progressSummary = await this.getProgressSummary(userId, sorted);

    if (sorted.length === 0) {
      return {
        entries,
        weight_change_kg: null,
        weight_change_7d: null,
        waist_change_cm: null,
        days_tracked: 0,
        latest_entry: null,
        first_entry: null,
        progress_summary: progressSummary,
      };
    }

    const latest = sorted[sorted.length - 1];
    const first = sorted[0];

    // 7-day comparison
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const entrySevenDaysAgo = sorted
      .filter((e) => new Date(e.recorded_at) <= sevenDaysAgo)
      .pop(); // closest to 7 days ago

    const weight_change_kg =
      latest.weight_kg != null && first.weight_kg != null
        ? Math.round((latest.weight_kg - first.weight_kg) * 10) / 10
        : null;

    const weight_change_7d =
      latest.weight_kg != null && entrySevenDaysAgo?.weight_kg != null
        ? Math.round((latest.weight_kg - entrySevenDaysAgo.weight_kg) * 10) / 10
        : null;

    const waist_change_cm =
      latest.waist_cm != null && first.waist_cm != null
        ? Math.round((latest.waist_cm - first.waist_cm) * 10) / 10
        : null;

    return {
      entries: sorted.reverse(), // newest first for display
      weight_change_kg,
      weight_change_7d,
      waist_change_cm,
      days_tracked: sorted.length,
      latest_entry: latest,
      first_entry: first,
      progress_summary: progressSummary,
    };
  }

  private async getProgressSummary(userId: string, sortedEntries: BodyProgressEntry[]): Promise<BodyProgressSummary> {
    const periodDays = 90;
    const today = dateKey(new Date());
    const sinceKey = addDays(today, -(periodDays - 1));

    const [{ data: userRow }, { data: foodLogs, error: logsError }] = await Promise.all([
      this.supabase.db
        .from('users')
        .select('daily_calorie_target, weight_kg, goal, goal_plan')
        .eq('id', userId)
        .single(),
      this.supabase.db
        .from('food_logs')
        .select('logged_at, calories')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('logged_at', `${sinceKey}T00:00:00.000Z`)
        .order('logged_at', { ascending: true }),
    ]);

    if (logsError) throw logsError;

    const profile = (userRow ?? {}) as UserProgressRow;
    const target = finiteNumber(profile.daily_calorie_target);
    const safeTarget = target && target > 0 ? target : null;
    const dayTotals = new Map<string, number>();

    for (const log of (foodLogs ?? []) as FoodLogRow[]) {
      const calories = finiteNumber(log.calories);
      if (calories === null || calories <= 0) continue;
      const key = dateKey(log.logged_at);
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + calories);
    }

    const loggedDays = dayTotals.size;
    const averageDailyCalories = loggedDays > 0
      ? Math.round([...dayTotals.values()].reduce((sum, calories) => sum + calories, 0) / loggedDays)
      : null;

    const weekAdherence = new Map<string, number[]>();
    if (safeTarget) {
      for (const [key, calories] of dayTotals.entries()) {
        const adherence = Math.min((calories / safeTarget) * 100, 200);
        const bucket = weekKey(key);
        weekAdherence.set(bucket, [...(weekAdherence.get(bucket) ?? []), adherence]);
      }
    }

    const weeklyAverages = [...weekAdherence.values()].map((items) => (
      items.reduce((sum, value) => sum + value, 0) / Math.max(items.length, 1)
    ));
    const averageWeeklyAdherence = weeklyAverages.length > 0
      ? roundTo(weeklyAverages.reduce((sum, value) => sum + value, 0) / weeklyAverages.length)
      : null;

    const weightEntries = sortedEntries
      .filter((entry) => finiteNumber(entry.weight_kg) !== null)
      .map((entry) => ({ ...entry, weight_kg: finiteNumber(entry.weight_kg) as number }));
    const firstWeight = weightEntries[0]?.weight_kg ?? null;
    const latestWeight = weightEntries[weightEntries.length - 1]?.weight_kg ?? finiteNumber(profile.weight_kg);
    const weightDelta = firstWeight !== null && latestWeight !== null && weightEntries.length >= 2
      ? roundTo(latestWeight - firstWeight)
      : null;

    const goalPlan = profile.goal_plan ?? null;
    const weightGoalKg = finiteNumber(goalPlan?.target_kg);
    const goalDirection = goalPlan?.direction
      ?? (profile.goal === 'lose_weight' ? 'loss' : profile.goal === 'gain_muscle' ? 'gain' : null);
    let goalProgress: number | null = null;
    if (weightDelta !== null && weightGoalKg !== null && weightGoalKg > 0 && (goalDirection === 'loss' || goalDirection === 'gain')) {
      const directionalDelta = goalDirection === 'loss' ? -weightDelta : weightDelta;
      goalProgress = Math.max(0, Math.min(100, Math.round((directionalDelta / weightGoalKg) * 100)));
    }

    let dataStatus: BodyProgressSummary['data_status'] = 'ready';
    if (loggedDays === 0) dataStatus = 'no_logs';
    else if (weightEntries.length < 2 && finiteNumber(profile.weight_kg) === null) dataStatus = 'no_weight';
    else if (goalProgress === null) dataStatus = 'missing_goal';
    else if (loggedDays < 7 || weightEntries.length < 2) dataStatus = 'insufficient_data';

    return {
      period_days: periodDays,
      logged_days: loggedDays,
      weeks_with_logs: weekAdherence.size,
      average_weekly_adherence_pct: averageWeeklyAdherence,
      average_daily_calories: averageDailyCalories,
      calorie_target: safeTarget,
      weight_delta_kg: weightDelta,
      weight_goal_kg: weightGoalKg && weightGoalKg > 0 ? weightGoalKg : null,
      weight_goal_direction: goalDirection === 'loss' || goalDirection === 'gain' || goalDirection === 'maintain' ? goalDirection : null,
      weight_goal_progress_pct: goalProgress,
      data_status: dataStatus,
    };
  }
}
