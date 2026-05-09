import { ReminderService } from '../reminder.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { GamificationService } from '../../gamification/gamification.service';
import { NudgeContext } from '@calorie-ai/types';

function makeSupabase(fromImpl?: (table: string) => unknown): SupabaseService {
  return {
    db: { from: fromImpl ?? jest.fn() },
  } as unknown as SupabaseService;
}

function makeGamification(summary = {}): GamificationService {
  return {
    getSummary: jest.fn().mockResolvedValue({
      current_streak: 0, longest_streak: 0, active_days_last_30: 0,
      total_food_logs: 0, total_activity_logs: 0, next_streak_milestone: 3,
      badges: [],
      ...summary,
    }),
  } as unknown as GamificationService;
}

function makeService(fromImpl?: (table: string) => unknown, gamificationSummary?: Record<string, unknown>) {
  return new ReminderService(makeSupabase(fromImpl), makeGamification(gamificationSummary));
}

// ─────────────────────────────────────────────────────────────────────────────
// getReminderPreferences
// ─────────────────────────────────────────────────────────────────────────────
describe('ReminderService.getReminderPreferences', () => {
  it('returns existing preferences', async () => {
    const prefs = { user_id: 'u1', lunch_reminder_enabled: true };
    const service = makeService((table) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: prefs, error: null }),
    }));
    const result = await service.getReminderPreferences('u1');
    expect(result.user_id).toBe('u1');
  });

  it('creates defaults when not found (PGRST116)', async () => {
    const created = { user_id: 'u2', lunch_reminder_enabled: true, breakfast_reminder_time: '07:00' };
    let call = 0;
    const service = makeService(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        return Promise.resolve({ data: created, error: null });
      }),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: created, error: null }),
      }),
      update: jest.fn().mockReturnThis(),
    }));
    const result = await service.getReminderPreferences('u2');
    expect(result.user_id).toBe('u2');
  });

  it('throws on non-PGRST116 error', async () => {
    const service = makeService(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
    }));
    await expect(service.getReminderPreferences('u1')).rejects.toThrow('db error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateReminderPreferences
// ─────────────────────────────────────────────────────────────────────────────
describe('ReminderService.updateReminderPreferences', () => {
  it('updates and returns preferences', async () => {
    const updated = { user_id: 'u1', lunch_reminder_time: '13:00' };
    const service = makeService(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: updated, error: null }),
    }));
    const result = await service.updateReminderPreferences('u1', { lunch_reminder_time: '13:00' } as any);
    expect(result.user_id).toBe('u1');
  });

  it('throws when update fails', async () => {
    const service = makeService(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: new Error('update fail') }),
    }));
    await expect(service.updateReminderPreferences('u1', {} as any)).rejects.toThrow('update fail');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateNudgeMessage — pure function branches
// ─────────────────────────────────────────────────────────────────────────────
function ctx(overrides: Partial<NudgeContext>): NudgeContext {
  return {
    mealType: 'lunch',
    caloriesLogged: 0,
    calorieTarget: 600,
    adherencePercentage: 0,
    mealsLogged: 0,
    motivationStyle: 'encouraging',
    ...overrides,
  };
}

describe('ReminderService.generateNudgeMessage', () => {
  let service: ReminderService;

  beforeEach(() => {
    service = makeService();
  });

  it('returns streak type when adherence < 20 and streak >= 3', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 10, currentStreak: 5, nextStreakMilestone: 7 }));
    expect(msg.type).toBe('streak');
    expect(msg.emoji).toBe('🔥');
  });

  it('returns encouraging reminder when adherence < 20 and motivationStyle encouraging', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 10, motivationStyle: 'encouraging' }));
    expect(msg.type).toBe('reminder');
    expect(msg.emoji).toBe('🎯');
  });

  it('returns warning reminder when adherence < 20 and motivationStyle warning', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 10, motivationStyle: 'warning' }));
    expect(msg.type).toBe('reminder');
    expect(msg.emoji).toBe('⏰');
  });

  it('returns encouraging type when 20 <= adherence < 50 and motivationStyle encouraging', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 35, caloriesLogged: 210, motivationStyle: 'encouraging' }));
    expect(msg.type).toBe('encouragement');
    expect(msg.emoji).toBe('👍');
  });

  it('returns warning type when 20 <= adherence < 50 and motivationStyle warning', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 35, caloriesLogged: 210, motivationStyle: 'warning' }));
    expect(msg.type).toBe('warning');
    expect(msg.emoji).toBe('📊');
  });

  it('returns encouragement when 50 <= adherence < 90 and motivationStyle encouraging', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 70, caloriesLogged: 420, motivationStyle: 'encouraging' }));
    expect(msg.type).toBe('encouragement');
    expect(msg.emoji).toBe('💪');
  });

  it('returns warning when 50 <= adherence < 90 and motivationStyle warning', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 70, caloriesLogged: 420, motivationStyle: 'warning' }));
    expect(msg.type).toBe('warning');
    expect(msg.emoji).toBe('⚠️');
  });

  it('returns celebration when adherence is 90-110', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 100, caloriesLogged: 600 }));
    expect(msg.emoji).toBe('🎉');
  });

  it('returns streak celebration type when adherence 90-110 and streak >= 3', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 100, caloriesLogged: 600, currentStreak: 5 }));
    expect(msg.type).toBe('streak');
  });

  it('returns warning when adherence > 110 and motivationStyle warning', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 130, caloriesLogged: 800, motivationStyle: 'warning' }));
    expect(msg.type).toBe('warning');
  });

  it('returns encouragement when adherence > 110 and motivationStyle encouraging', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 130, caloriesLogged: 800, motivationStyle: 'encouraging' }));
    expect(msg.type).toBe('encouragement');
  });

  it('includes streak context in returned message', () => {
    const msg = service.generateNudgeMessage(ctx({ currentStreak: 7, longestStreak: 14, nextStreakMilestone: 30, adherencePercentage: 10 }));
    expect(msg.streakContext?.currentStreak).toBe(7);
    expect(msg.streakContext?.longestStreak).toBe(14);
  });

  it('handles zero streak in streak line', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 10, currentStreak: 0, mealsLogged: 0 }));
    expect(msg).toBeDefined();
  });

  it('handles mealsLogged > 0 and zero streak in streak line', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 10, currentStreak: 0, mealsLogged: 2 }));
    expect(msg).toBeDefined();
  });

  it('returns correct meal label for dinner', () => {
    const msg = service.generateNudgeMessage(ctx({ mealType: 'dinner', adherencePercentage: 10 }));
    expect(msg.mealType).toBe('dinner');
    expect(msg.title).toContain('Bữa tối');
  });

  it('handles null nextStreakMilestone in streak line', () => {
    const msg = service.generateNudgeMessage(ctx({
      adherencePercentage: 10, currentStreak: 3,
      nextStreakMilestone: null,
    }));
    expect(msg.type).toBe('streak');
  });

  it('returns breakfast label correctly', () => {
    const msg = service.generateNudgeMessage(ctx({ mealType: 'breakfast', adherencePercentage: 10 }));
    expect(msg.title).toContain('Bữa sáng');
  });

  it('returns snack label correctly', () => {
    const msg = service.generateNudgeMessage(ctx({ mealType: 'snack', adherencePercentage: 10 }));
    expect(msg.title).toContain('Ăn vặt');
  });

  it('includes correct body text for mid-range adherence warning style', () => {
    const msg = service.generateNudgeMessage(ctx({ adherencePercentage: 35, caloriesLogged: 210, calorieTarget: 600, motivationStyle: 'warning' }));
    expect(msg.body).toContain('Mới');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generatePreviewNudge
// ─────────────────────────────────────────────────────────────────────────────
describe('ReminderService.generatePreviewNudge', () => {
  it('generates preview nudge with provided calories', async () => {
    const gamif = makeGamification({ current_streak: 5, next_streak_milestone: 7 });
    let callCount = 0;
    const supabase = makeSupabase((table) => {
      if (table === 'reminder_preferences') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { nudge_motivation_style: 'encouraging' }, error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { daily_calorie_target: 1800 }, error: null }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: {}, error: null }),
      };
    });
    const service = new ReminderService(supabase, gamif);
    const msg = await service.generatePreviewNudge('u1', 'lunch', 300);
    expect(msg).toBeDefined();
    expect(msg.mealType).toBe('lunch');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateDueReminders
// ─────────────────────────────────────────────────────────────────────────────
describe('ReminderService.generateDueReminders', () => {
  it('returns empty array when push notifications disabled', async () => {
    const gamif = makeGamification();
    const supabase = makeSupabase(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { allow_push_notifications: false }, error: null }),
    }));
    const service = new ReminderService(supabase, gamif);
    const msgs = await service.generateDueReminders('u1');
    expect(msgs).toEqual([]);
  });

  it('returns nudges for enabled meal reminders matching current time', async () => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const gamif = makeGamification();
    const supabase = makeSupabase((table) => {
      if (table === 'reminder_preferences') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: {
              allow_push_notifications: true,
              breakfast_reminder_enabled: true,
              breakfast_reminder_time: time,
              lunch_reminder_enabled: false,
              dinner_reminder_enabled: false,
              snack_reminder_enabled: false,
              nudge_motivation_style: 'encouraging',
            },
            error: null,
          }),
        };
      }
      if (table === 'food_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockResolvedValue({ data: [{ calories: 200 }], error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { daily_calorie_target: 1800 }, error: null }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const service = new ReminderService(supabase, gamif);
    const msgs = await service.generateDueReminders('u1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].mealType).toBe('breakfast');
  });
});
