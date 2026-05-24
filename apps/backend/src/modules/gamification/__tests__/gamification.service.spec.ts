import { GamificationService } from '../gamification.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

function today() {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function daysAgo(n: number) {
  const d = today();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function makeSumo(foodLogs: Array<{ logged_at: string }>, activityLogs: Array<{ logged_at: string }>, foodCount = foodLogs.length, actCount = activityLogs.length) {
  const db = {
    from: jest.fn().mockImplementation((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
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

  it('calculates a one-day streak when user logged today', async () => {
    const supabase = makeSumo([{ logged_at: daysAgo(0) }], [], 1, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');

    expect(summary.current_streak).toBe(1);
    expect(summary.longest_streak).toBe(1);
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

  it('calculates a seven-day current streak from consecutive logs', async () => {
    const foodLogs = Array.from({ length: 7 }, (_, index) => ({ logged_at: daysAgo(index) }));
    const supabase = makeSumo(foodLogs, [], 7, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');

    expect(summary.current_streak).toBe(7);
    expect(summary.longest_streak).toBe(7);
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

  it('resets current streak to zero when latest log is older than yesterday', async () => {
    const foodLogs = [
      { logged_at: daysAgo(2) },
      { logged_at: daysAgo(3) },
    ];
    const supabase = makeSumo(foodLogs, [], 2, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1');

    expect(summary.current_streak).toBe(0);
    expect(summary.longest_streak).toBe(2);
  });

  it('maps late-night UTC logs to the client local day before calculating streak', async () => {
    const now = new Date();
    const todayLocalKey = new Date(now.getTime() - (-420 * 60_000)).toISOString().slice(0, 10);
    const [year, month, day] = todayLocalKey.split('-').map(Number);
    const lateNightUtc = new Date(Date.UTC(year, month - 1, day - 1, 18, 30, 0)).toISOString();
    const supabase = makeSumo([{ logged_at: lateNightUtc }], [], 1, 0);
    const service = new GamificationService(supabase);
    const summary = await service.getSummary('u1', -420);

    expect(summary.current_streak).toBe(1);
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
        is: jest.fn().mockReturnThis(),
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
        is: jest.fn().mockReturnThis(),
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
