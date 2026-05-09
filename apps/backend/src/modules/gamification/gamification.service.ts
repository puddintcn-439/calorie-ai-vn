import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { BadgeProgress, GamificationSummary } from '@calorie-ai/types';

function toDateKey(value: string) {
  return new Date(value).toISOString().split('T')[0];
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

@Injectable()
export class GamificationService {
  constructor(private supabase: SupabaseService) {}

  async getSummary(userId: string): Promise<GamificationSummary> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yearAgo = addDays(today, -365);
    const last30 = addDays(today, -29);

    const [foodRes, activityRes] = await Promise.all([
      this.supabase.db
        .from('food_logs')
        .select('logged_at', { count: 'exact' })
        .eq('user_id', userId)
        .gte('logged_at', yearAgo.toISOString()),
      this.supabase.db
        .from('activity_logs')
        .select('logged_at', { count: 'exact' })
        .eq('user_id', userId)
        .gte('logged_at', yearAgo.toISOString()),
    ]);

    if (foodRes.error) throw foodRes.error;
    if (activityRes.error) throw activityRes.error;

    const activeDayKeys = new Set<string>();
    for (const row of foodRes.data ?? []) activeDayKeys.add(toDateKey(row.logged_at));
    for (const row of activityRes.data ?? []) activeDayKeys.add(toDateKey(row.logged_at));

    const activeDaysSorted = Array.from(activeDayKeys).sort();
    const activeDaySet = new Set(activeDaysSorted);

    const todayKey = today.toISOString().split('T')[0];
    const yesterdayKey = addDays(today, -1).toISOString().split('T')[0];

    let streakAnchor: string | null = null;
    if (activeDaySet.has(todayKey)) {
      streakAnchor = todayKey;
    } else if (activeDaySet.has(yesterdayKey)) {
      streakAnchor = yesterdayKey;
    }

    let currentStreak = 0;
    if (streakAnchor) {
      let cursor = new Date(streakAnchor);
      while (activeDaySet.has(cursor.toISOString().split('T')[0])) {
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
        const previous = new Date(previousKey);
        const current = new Date(key);
        const diffDays = Math.round((current.getTime() - previous.getTime()) / 86400000);
        running = diffDays === 1 ? running + 1 : 1;
      }
      previousKey = key;
      longestStreak = Math.max(longestStreak, running);
    }

    const activeDaysLast30 = activeDaysSorted.filter((key) => key >= last30.toISOString().split('T')[0]).length;
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