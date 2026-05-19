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
