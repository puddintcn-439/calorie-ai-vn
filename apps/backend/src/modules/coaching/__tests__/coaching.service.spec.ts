import { CoachingService } from '../coaching.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { PatternType, PriorityLevel } from '@calorie-ai/types';

function makeSupabase(fromImpl: (table: string) => unknown): SupabaseService {
  return {
    db: {
      from: jest.fn().mockImplementation(fromImpl),
    },
  } as unknown as SupabaseService;
}

describe('CoachingService.generateWeeklySummary', () => {
  it('returns an actionable empty summary when the user has no logs this week', async () => {
    const supabase = makeSupabase((table) => {
      if (table === 'food_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }

      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { daily_calorie_target: 2100 }, error: null }),
        };
      }

      return {};
    });

    const service = new CoachingService(supabase);
    const summary = await service.generateWeeklySummary('user-1');

    expect(summary).toMatchObject({
      user_id: 'user-1',
      logs_count: 0,
      adherence_percentage: 0,
      consistency_score: 0,
      primary_pattern: PatternType.INCONSISTENT_LOGGING,
      priority_level: PriorityLevel.MEDIUM,
    });
    expect(summary?.recommended_action).toContain('one meal log today');
  });
});

describe('CoachingService.getBehaviorMemory', () => {
  function daysAgo(days: number, hour = 12) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setUTCHours(hour, 0, 0, 0);
    return date.toISOString();
  }

  function query(data: unknown[]) {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data, error: null }),
    };
  }

  it('summarizes long-running user behavior for coach personalization', async () => {
    const foodLogs = Array.from({ length: 10 }, (_, index) => ([
      { logged_at: daysAgo(index, 12), meal_type: 'lunch', protein_g: 45 },
      { logged_at: daysAgo(index, 19), meal_type: 'dinner', protein_g: 45 },
    ])).flat();
    const activityLogs = Array.from({ length: 4 }, (_, index) => ({
      logged_at: daysAgo(index * 2, 18),
      duration_min: 30,
    }));
    const reminders = [
      { sent_at: daysAgo(1, 19), opened_at: daysAgo(1, 19), acted_at: daysAgo(1, 20) },
      { sent_at: daysAgo(2, 19), opened_at: daysAgo(2, 19), acted_at: daysAgo(2, 20) },
      { sent_at: daysAgo(1, 8), opened_at: daysAgo(1, 8), acted_at: null },
      { sent_at: daysAgo(2, 8), opened_at: daysAgo(2, 8), acted_at: null },
    ];
    const supabase = makeSupabase((table) => {
      if (table === 'food_logs') return query(foodLogs);
      if (table === 'activity_logs') return query(activityLogs);
      if (table === 'reminder_notification_log') return query(reminders);
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { daily_calorie_target: 1800 }, error: null }),
        };
      }
      return {};
    });

    const service = new CoachingService(supabase);
    const memory = await service.getBehaviorMemory('user-1');

    expect(memory).toMatchObject({
      days_analyzed: 90,
      data_quality: 'medium',
      best_reminder_hour: 19,
      often_skips_breakfast: true,
      high_protein_adherence: 1,
      meal_skip_rates: expect.objectContaining({
        breakfast: 1,
      }),
    });
    expect(memory.best_logging_streak).toBeGreaterThanOrEqual(9);
    expect(memory.activity_adherence).toBeGreaterThan(0);
    expect(memory.memory_notes).toEqual(expect.arrayContaining([
      'Breakfast is frequently missing from logged days.',
      'Reminder responses are strongest around 19:00.',
    ]));
  });
});

describe('CoachingService intervention memory', () => {
  it('records intervention events', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const supabase = makeSupabase((table) => {
      if (table === 'user_intervention_events') {
        return { insert };
      }
      return {};
    });

    const service = new CoachingService(supabase);
    const result = await service.recordInterventionEvent('user-1', {
      intervention_type: 'activity_recovery',
      mode: 'recovery_plan',
      priority: 'high',
      primary_action: 'move',
      event_type: 'shown',
      source: 'today',
      forecast_score: 42,
      intervention_generated_at: '2026-06-06T10:00:00.000Z',
      metadata: { reasons: ['activity_gap'] },
    });

    expect(result).toEqual({ recorded: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      intervention_type: 'activity_recovery',
      event_type: 'shown',
      forecast_score: 42,
    }));
  });

  it('ranks interventions by effectiveness', async () => {
    const rows = [
      { intervention_type: 'activity_recovery', mode: 'recovery_plan', priority: 'high', primary_action: 'move', event_type: 'shown', created_at: '2026-06-01T08:00:00.000Z' },
      { intervention_type: 'activity_recovery', mode: 'recovery_plan', priority: 'high', primary_action: 'move', event_type: 'shown', created_at: '2026-06-02T08:00:00.000Z' },
      { intervention_type: 'activity_recovery', mode: 'recovery_plan', priority: 'high', primary_action: 'move', event_type: 'acted', created_at: '2026-06-02T08:10:00.000Z' },
      { intervention_type: 'activity_recovery', mode: 'recovery_plan', priority: 'high', primary_action: 'move', event_type: 'acted', created_at: '2026-06-03T08:10:00.000Z' },
      { intervention_type: 'reminder_tuning', mode: 'light_nudge', priority: 'low', primary_action: 'adjust_reminders', event_type: 'shown', created_at: '2026-06-01T19:00:00.000Z' },
      { intervention_type: 'reminder_tuning', mode: 'light_nudge', priority: 'low', primary_action: 'adjust_reminders', event_type: 'shown', created_at: '2026-06-02T19:00:00.000Z' },
      { intervention_type: 'reminder_tuning', mode: 'light_nudge', priority: 'low', primary_action: 'adjust_reminders', event_type: 'dismissed', created_at: '2026-06-02T19:02:00.000Z' },
    ];
    const supabase = makeSupabase((table) => {
      if (table === 'user_intervention_events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: rows, error: null }),
        };
      }
      return {};
    });

    const service = new CoachingService(supabase);
    const memory = await service.getInterventionMemory('user-1', 90);

    expect(memory).toMatchObject({
      total_shown: 4,
      total_acted: 2,
      total_dismissed: 1,
      overall_action_rate: 50,
      best_intervention: 'activity_recovery',
      weakest_intervention: 'reminder_tuning',
    });
    expect(memory.ranking[0]).toMatchObject({
      intervention_type: 'activity_recovery',
      action_rate: 100,
      effectiveness_score: 100,
    });
    expect(memory.by_type.reminder_tuning).toMatchObject({
      dismiss_rate: 50,
      effectiveness_score: 0,
    });
  });

  it('summarizes intervention analytics with minimum sample guidance', async () => {
    const recent = new Date().toISOString();
    const rows = [
      { intervention_type: 'activity_recovery', mode: 'recovery_plan', priority: 'high', primary_action: 'move', event_type: 'shown', created_at: recent },
      { intervention_type: 'activity_recovery', mode: 'recovery_plan', priority: 'high', primary_action: 'move', event_type: 'shown', created_at: recent },
      { intervention_type: 'activity_recovery', mode: 'recovery_plan', priority: 'high', primary_action: 'move', event_type: 'acted', created_at: recent },
      { intervention_type: 'activity_recovery', mode: 'recovery_plan', priority: 'high', primary_action: 'move', event_type: 'acted', created_at: recent },
      { intervention_type: 'reminder_tuning', mode: 'light_nudge', priority: 'low', primary_action: 'adjust_reminders', event_type: 'shown', created_at: recent },
      { intervention_type: 'reminder_tuning', mode: 'light_nudge', priority: 'low', primary_action: 'adjust_reminders', event_type: 'shown', created_at: recent },
      { intervention_type: 'reminder_tuning', mode: 'light_nudge', priority: 'low', primary_action: 'adjust_reminders', event_type: 'dismissed', created_at: recent },
    ];
    const supabase = makeSupabase((table) => {
      if (table === 'user_intervention_events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: rows, error: null }),
        };
      }
      return {};
    });

    const service = new CoachingService(supabase);
    const analytics = await service.getInterventionAnalytics('user-1', 2);

    expect(analytics).toMatchObject({
      min_sample: 5,
      sample_status: 'insufficient',
      best_intervention: 'activity_recovery',
      weakest_intervention: 'reminder_tuning',
      windows: {
        thirty_day: expect.objectContaining({
          total_shown: 4,
          action_rate: 50,
          dismiss_rate: 25,
        }),
      },
    });
    expect(analytics.windows.thirty_day.top_effective[0]).toMatchObject({
      intervention_type: 'activity_recovery',
      action_rate: 100,
    });
    expect(analytics.windows.thirty_day.top_ignored[0]).toMatchObject({
      intervention_type: 'reminder_tuning',
      dismiss_rate: 50,
    });
    expect(analytics.insufficient_interventions).toEqual(['activity_recovery', 'reminder_tuning']);
    expect(analytics.recommendations[0]).toContain('Keep the rule engine active');
  });
});

describe('CoachingService.detectWeekendVariance', () => {
  it('does not emit a weekend pattern when weekday data is missing', () => {
    const service = new CoachingService({} as SupabaseService);
    const pattern = (service as any).detectWeekendVariance(
      {
        '2026-05-17': {
          date: '2026-05-17',
          total_calories: 1800,
          meal_type_breakdown: { breakfast: 0, lunch: 800, dinner: 1000, snack: 0 },
          meals_logged: 2,
        },
      },
      'user-1',
      2000,
    );

    expect(pattern).toBeNull();
  });
});
