import { InsightsService } from '../insights.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

function makeDb(logs: unknown[], lastWeekLogs: unknown[] = [], dailyTarget: number | null = 1800) {
  let callCount = 0;
  const db = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { daily_calorie_target: dailyTarget } }),
        };
      }
      // food_logs — first call = current week, second call = last week
      callCount++;
      const data = callCount === 1 ? logs : lastWeekLogs;
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data, error: null }),
      };
    }),
  };
  return { db } as unknown as SupabaseService;
}

describe('InsightsService.getWeeklyInsights', () => {
  it('returns null adherence instead of using a fabricated calorie target', async () => {
    const supabase = makeDb([], [], null);
    const service = new InsightsService(supabase);
    const result = await service.getWeeklyInsights('u1', '2026-05-05');

    expect(result.target_status).toBe('needs_profile');
    expect(result.weekly_calorie_target).toBeNull();
    expect(result.weekly_adherence_percentage).toBeNull();
    expect(result.daily_insights[0].calorie_target).toBeNull();
  });

  it('returns zeroed weekly insights for empty logs', async () => {
    const supabase = makeDb([]);
    const service = new InsightsService(supabase);
    const result = await service.getWeeklyInsights('u1', '2026-05-05');

    expect(result.daily_insights).toHaveLength(7);
    expect(result.weekly_calories_total).toBe(0);
    expect(result.total_meals_logged).toBe(0);
    expect(result.macro_breakdown.protein_percentage).toBe(0);
  });

  it('aggregates calories and macros correctly', async () => {
    // Provide logs on the first two days of the week starting 2026-05-05 (Mon)
    const logs = [
      { logged_at: '2026-05-05T08:00:00Z', calories: 300, protein_g: 10, carbs_g: 40, fat_g: 8, meal_type: 'breakfast' },
      { logged_at: '2026-05-06T12:00:00Z', calories: 500, protein_g: 25, carbs_g: 60, fat_g: 15, meal_type: 'lunch' },
    ];
    const supabase = makeDb(logs);
    const service = new InsightsService(supabase);
    const result = await service.getWeeklyInsights('u1', '2026-05-05');

    expect(result.weekly_calories_total).toBe(800);
    expect(result.total_meals_logged).toBe(2);
    expect(result.macro_breakdown.protein_grams).toBe(35);
    expect(result.meal_breakdown.breakfast_calories).toBe(300);
    expect(result.meal_breakdown.lunch_calories).toBe(500);
  });

  it('calculates trend vs last week', async () => {
    const currentLogs = [
      { logged_at: '2026-05-05T12:00:00Z', calories: 1400, protein_g: 50, carbs_g: 180, fat_g: 40, meal_type: 'lunch' },
    ];
    const lastWeekLogs = [
      { calories: 1000 },
    ];
    const supabase = makeDb(currentLogs, lastWeekLogs);
    const service = new InsightsService(supabase);
    const result = await service.getWeeklyInsights('u1', '2026-05-05');

    // currentWeekAvg = 1400/7 ≈ 200; lastWeekAvg = 1000/7 ≈ 143; trend = (200-143)/143 * 100 ≈ 40%
    expect(result.trend_vs_last_week).toBeGreaterThanOrEqual(0);
  });

  it('counts days_on_target correctly', async () => {
    // dailyTarget=1000; logs 1000 cal on one day → adherence 100% → in range 90-110
    const logs = [
      { logged_at: '2026-05-05T12:00:00Z', calories: 1000, protein_g: 30, carbs_g: 120, fat_g: 35, meal_type: 'lunch' },
    ];
    const supabase = makeDb(logs, [], 1000);
    const service = new InsightsService(supabase);
    const result = await service.getWeeklyInsights('u1', '2026-05-05');
    expect(result.days_on_target).toBe(1);
  });

  it('throws when food_logs query fails', async () => {
    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { daily_calorie_target: 1800 } }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: null, error: new Error('logs error') }),
        };
      }),
    };
    const service = new InsightsService({ db } as unknown as SupabaseService);
    await expect(service.getWeeklyInsights('u1', '2026-05-05')).rejects.toThrow('logs error');
  });

  it('uses current week when no weekStartDate provided', async () => {
    const supabase = makeDb([]);
    const service = new InsightsService(supabase);
    const result = await service.getWeeklyInsights('u1');
    // Should not throw; returns 7 days
    expect(result.daily_insights).toHaveLength(7);
  });
});
