import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { BadgeProgress, GamificationSummary } from '@calorie-ai/types';

function toDateKey(value: string | Date, tzOffsetMinutes = 0) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - tzOffsetMinutes * 60_000).toISOString().split('T')[0];
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map((part) => parseInt(part, 10));
  const next = Date.UTC(year, month - 1, day) + days * 86_400_000;
  return new Date(next).toISOString().split('T')[0];
}

@Injectable()
export class GamificationService {
  constructor(private supabase: SupabaseService) {}

  async getSummary(userId: string, tzOffsetMinutes = 0): Promise<GamificationSummary> {
    const now = new Date();
    const todayKey = toDateKey(now, tzOffsetMinutes);
    const yearAgoKey = addDays(todayKey, -365);
    const last30Key = addDays(todayKey, -29);
    const yearAgoUtc = new Date(Date.UTC(
      Number(yearAgoKey.slice(0, 4)),
      Number(yearAgoKey.slice(5, 7)) - 1,
      Number(yearAgoKey.slice(8, 10)),
    ) + tzOffsetMinutes * 60_000);

    const [foodRes, activityRes] = await Promise.all([
      this.supabase.db
        .from('food_logs')
        .select('logged_at', { count: 'exact' })
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('logged_at', yearAgoUtc.toISOString()),
      this.supabase.db
        .from('activity_logs')
        .select('logged_at', { count: 'exact' })
        .eq('user_id', userId)
        .gte('logged_at', yearAgoUtc.toISOString()),
    ]);

    if (foodRes.error) throw foodRes.error;
    if (activityRes.error) throw activityRes.error;

    const activeDayKeys = new Set<string>();
    for (const row of foodRes.data ?? []) activeDayKeys.add(toDateKey(row.logged_at, tzOffsetMinutes));
    for (const row of activityRes.data ?? []) activeDayKeys.add(toDateKey(row.logged_at, tzOffsetMinutes));

    const activeDaysSorted = Array.from(activeDayKeys).sort();
    const activeDaySet = new Set(activeDaysSorted);

    const yesterdayKey = addDays(todayKey, -1);

    let streakAnchor: string | null = null;
    if (activeDaySet.has(todayKey)) {
      streakAnchor = todayKey;
    } else if (activeDaySet.has(yesterdayKey)) {
      streakAnchor = yesterdayKey;
    }

    let currentStreak = 0;
    if (streakAnchor) {
      let cursor = streakAnchor;
      while (activeDaySet.has(cursor)) {
        currentStreak += 1;
        cursor = addDays(cursor, -1);
      }
    }

    let longestStreak = 0;
    let running = 0;
    let previousKey: string | null = null;
    for (const key of activeDaysSorted) {
      if (!previousKey) {
        running = 1;
      } else {
        const previous = new Date(`${previousKey}T00:00:00.000Z`);
        const current = new Date(`${key}T00:00:00.000Z`);
        const diffDays = Math.round((current.getTime() - previous.getTime()) / 86400000);
        running = diffDays === 1 ? running + 1 : 1;
      }
      previousKey = key;
      longestStreak = Math.max(longestStreak, running);
    }

    const activeDaysLast30 = activeDaysSorted.filter((key) => key >= last30Key).length;
    const totalFoodLogs = foodRes.count ?? 0;
    const totalActivityLogs = activityRes.count ?? 0;
    const nextStreakMilestone = [3, 7, 14, 30].find((value) => value > currentStreak) ?? null;

    const badges: BadgeProgress[] = [
      {
        id: 'first_log',
        label: 'Khởi động đầu tiên',
        description: 'Log bữa ăn đầu tiên của bạn.',
        icon: '🌱',
        unlocked: totalFoodLogs >= 1,
      },
      {
        id: 'three_day_streak',
        label: '3 ngày liên tiếp',
        description: 'Giữ streak ít nhất 3 ngày.',
        icon: '🔥',
        unlocked: longestStreak >= 3,
      },
      {
        id: 'seven_day_streak',
        label: '7 ngày bền bỉ',
        description: 'Giữ streak ít nhất 7 ngày.',
        icon: '🏅',
        unlocked: longestStreak >= 7,
      },
      {
        id: 'activity_starter',
        label: 'Vận động đầu tiên',
        description: 'Ghi nhận hoạt động đầu tiên.',
        icon: '🏃',
        unlocked: totalActivityLogs >= 1,
      },
      {
        id: 'consistency_king',
        label: 'Đều như vắt chanh',
        description: 'Có hoạt động trong ít nhất 20 ngày của 30 ngày gần nhất.',
        icon: '👑',
        unlocked: activeDaysLast30 >= 20,
      },
      {
        id: 'fifty_logs',
        label: 'Nhật ký siêu hạng',
        description: 'Hoàn thành 50 food logs.',
        icon: '📚',
        unlocked: totalFoodLogs >= 50,
      },
    ];

    return {
      current_streak: currentStreak,
      longest_streak: longestStreak,
      active_days_last_30: activeDaysLast30,
      total_food_logs: totalFoodLogs,
      total_activity_logs: totalActivityLogs,
      next_streak_milestone: nextStreakMilestone,
      badges,
    };
  }
}
