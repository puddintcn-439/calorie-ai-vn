import { BodyProgressService } from '../body-progress.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

function ymdDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

function makeWeightEntries(days: number, startWeight: number, endWeight: number) {
  return Array.from({ length: days }, (_, index) => {
    const remaining = days - 1 - index;
    const progress = days <= 1 ? 0 : index / (days - 1);
    return {
      id: index + 1,
      user_id: 'u1',
      recorded_at: ymdDaysAgo(remaining),
      weight_kg: Math.round((startWeight + (endWeight - startWeight) * progress) * 10) / 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }).reverse();
}

function makeFoodLogs(days: number, calories = 1800) {
  return Array.from({ length: days }, (_, index) => ({
    logged_at: `${ymdDaysAgo(days - 1 - index)}T12:00:00.000Z`,
    calories,
  }));
}

function makeSupabase(args: {
  entries: unknown[];
  foodLogs: unknown[];
  user?: Record<string, unknown>;
}) {
  const db = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'body_progress') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: args.entries, error: null }),
        };
      }

      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: args.user ?? {
              daily_calorie_target: 1800,
              weight_kg: 75,
              goal: 'lose_weight',
              goal_plan: { direction: 'loss', target_kg: 5 },
            },
          }),
        };
      }

      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: args.foodLogs, error: null }),
      };
    }),
  };

  return { db } as unknown as SupabaseService;
}

describe('BodyProgressService.getTrend progress summary', () => {
  it('summarizes 90 days of logs and weight progress toward a 5kg loss goal', async () => {
    const entries = makeWeightEntries(90, 75, 70.5);
    const foodLogs = makeFoodLogs(90, 1800);
    const service = new BodyProgressService(makeSupabase({ entries, foodLogs }));

    const trend = await service.getTrend('u1');

    expect(trend.progress_summary).toMatchObject({
      logged_days: 90,
      weeks_with_logs: expect.any(Number),
      average_weekly_adherence_pct: 100,
      average_daily_calories: 1800,
      calorie_target: 1800,
      weight_delta_kg: -4.5,
      weight_goal_kg: 5,
      weight_goal_direction: 'loss',
      weight_goal_progress_pct: 90,
      data_status: 'ready',
    });
  });

  it('does not report 0% adherence for 30 days of weights with no food logs', async () => {
    const entries = makeWeightEntries(30, 75, 74);
    const service = new BodyProgressService(makeSupabase({ entries, foodLogs: [] }));

    const trend = await service.getTrend('u1');

    expect(trend.progress_summary?.logged_days).toBe(0);
    expect(trend.progress_summary?.average_weekly_adherence_pct).toBeNull();
    expect(trend.progress_summary?.average_daily_calories).toBeNull();
    expect(trend.progress_summary?.data_status).toBe('no_logs');
  });

  it('marks 60 days of logs without a weight goal as missing goal data', async () => {
    const entries = makeWeightEntries(60, 75, 73);
    const foodLogs = makeFoodLogs(60, 1710);
    const service = new BodyProgressService(makeSupabase({
      entries,
      foodLogs,
      user: {
        daily_calorie_target: 1800,
        weight_kg: 73,
        goal: 'lose_weight',
        goal_plan: null,
      },
    }));

    const trend = await service.getTrend('u1');

    expect(trend.progress_summary?.logged_days).toBe(60);
    expect(trend.progress_summary?.average_weekly_adherence_pct).toBe(95);
    expect(trend.progress_summary?.weight_goal_progress_pct).toBeNull();
    expect(trend.progress_summary?.data_status).toBe('missing_goal');
  });
});
