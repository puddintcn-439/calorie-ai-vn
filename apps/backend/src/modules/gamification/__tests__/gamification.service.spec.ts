import { GamificationService } from '../gamification.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number) {
  const d = today();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function makeSumo(foodLogs: Array<{ logged_at: string }>, activityLogs: Array<{ logged_at: string }>, foodCount = foodLogs.length, actCount = activityLogs.length) {
  const db = {
    from: jest.fn().mockImplementation((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockResolvedValue(
        table === 'food_logs'
          ? { data: foodLogs, error: null, count: foodCount }
          : { data: activityLogs, error: null, count: actCount },
      ),
    })),
  };
  return { db } as unknown as SupabaseService;
}

describe('GamificationService.getSummary', () => {
  it('returns zeroed stats and no badges unlocked for new user', async () => {
    const supabase = makeSumo([], [], 0, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');

    expect(summary.current_streak).toBe(0);
    expect(summary.longest_streak).toBe(0);
    expect(summary.total_food_logs).toBe(0);
    expect(summary.total_activity_logs).toBe(0);
    expect(summary.badges.every(b => !b.unlocked)).toBe(true);
  });

  it('calculates current streak when user logged today and yesterday', async () => {
    const foodLogs = [
      { logged_at: daysAgo(0) },
      { logged_at: daysAgo(1) },
      { logged_at: daysAgo(2) },
    ];
    const supabase = makeSumo(foodLogs, [], 3, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');

    expect(summary.current_streak).toBe(3);
    expect(summary.longest_streak).toBe(3);
  });

  it('calculates streak correctly when user missed today', async () => {
    // user logged yesterday and 2 days ago, not today
    const foodLogs = [
      { logged_at: daysAgo(1) },
      { logged_at: daysAgo(2) },
    ];
    const supabase = makeSumo(foodLogs, [], 2, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');

    expect(summary.current_streak).toBe(2);
  });

  it('resets streak when there is a gap', async () => {
    // logged today, then 3 and 4 days ago (gap on days 1-2)
    const foodLogs = [
      { logged_at: daysAgo(0) },
      { logged_at: daysAgo(3) },
      { logged_at: daysAgo(4) },
    ];
    const supabase = makeSumo(foodLogs, [], 3, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');

    expect(summary.current_streak).toBe(1);
    expect(summary.longest_streak).toBe(2);
  });

  it('unlocks first_log badge when food_logs count >= 1', async () => {
    const supabase = makeSumo([{ logged_at: daysAgo(0) }], [], 1, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');

    const firstLog = summary.badges.find(b => b.id === 'first_log');
    expect(firstLog?.unlocked).toBe(true);
  });

  it('unlocks activity_starter badge when activity_logs count >= 1', async () => {
    const supabase = makeSumo([], [{ logged_at: daysAgo(0) }], 0, 1);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');

    const badge = summary.badges.find(b => b.id === 'activity_starter');
    expect(badge?.unlocked).toBe(true);
  });

  it('sets next_streak_milestone to 3 for streak of 1', async () => {
    const supabase = makeSumo([{ logged_at: daysAgo(0) }], [], 1, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');
    expect(summary.next_streak_milestone).toBe(3);
  });

  it('returns null next_streak_milestone when streak > 30', async () => {
    // provide 31 consecutive days
    const logs = Array.from({ length: 31 }, (_, i) => ({ logged_at: daysAgo(i) }));
    const supabase = makeSumo(logs, [], 31, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');
    expect(summary.next_streak_milestone).toBeNull();
  });

  it('throws when food_logs query fails', async () => {
    const db = {
      from: jest.fn().mockImplementation((table: string) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockResolvedValue(
          table === 'food_logs'
            ? { data: null, error: new Error('food query fail') }
            : { data: [], error: null, count: 0 },
        ),
      })),
    };
    const service = new GamificationService({ db } as unknown as SupabaseService);
    await expect(service.getSummary('u1')).rejects.toThrow('food query fail');
  });

  it('throws when activity_logs query fails', async () => {
    const db = {
      from: jest.fn().mockImplementation((table: string) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockResolvedValue(
          table === 'activity_logs'
            ? { data: null, error: new Error('activity query fail') }
            : { data: [], error: null, count: 0 },
        ),
      })),
    };
    const service = new GamificationService({ db } as unknown as SupabaseService);
    await expect(service.getSummary('u1')).rejects.toThrow('activity query fail');
  });
});
