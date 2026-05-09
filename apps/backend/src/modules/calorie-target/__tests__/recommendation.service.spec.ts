import { RecommendationService } from '../recommendation.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

function makeChain(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {};
  [
    'from',
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'gte',
    'lte',
    'order',
    'in',
    'single',
    'limit',
  ].forEach((m) => {
    chain[m] = jest.fn().mockReturnThis();
  });
  chain['single'] = jest.fn().mockResolvedValue(resolvedValue);
  return chain;

  // Make the chain itself awaitable
  return Object.assign(chain, {
    then: jest.fn().mockImplementation((onFulfilled) => 
      Promise.resolve(resolvedValue).then(onFulfilled),
    ),
    catch: jest.fn(),
  });
}

function makeSupabase(): SupabaseService {
  return {
    db: {
      from: jest.fn().mockReturnValue(makeChain({ data: null, error: null })),
    },
  } as unknown as SupabaseService;
}

describe('RecommendationService', () => {
  let service: RecommendationService;
  let supabaseService: SupabaseService;

  beforeEach(() => {
    supabaseService = makeSupabase();
    service = new RecommendationService(supabaseService);
  });

  describe('getWeeklyRecommendations', () => {
    it('should return recommendations with all meal types', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
        target_breakfast_cal: 500,
        target_lunch_cal: 700,
        target_dinner_cal: 600,
        target_snack_cal: 200,
      };

      const chain = makeChain({ data: [] });
      (supabaseService.db.from as jest.Mock).mockReturnValue(chain);

      const result = await service.getWeeklyRecommendations('user123', profile as any);

      expect(result.user_id).toBe('user123');
      expect(result.daily_target).toBe(2000);
      expect(result.meals).toHaveLength(4);
      expect(result.meals.map((m) => m.meal_type)).toEqual([
        'breakfast',
        'lunch',
        'dinner',
        'snack',
      ]);
    });

    it('should calculate remaining calories correctly', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
        target_breakfast_cal: 500,
        target_lunch_cal: 700,
        target_dinner_cal: 600,
        target_snack_cal: 200,
      };

      const todayLogsQuery = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ data: [{ calories: 1200 }] }),
          }),
        }),
      };
      const foodsQuery = {
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            lte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          }),
        }),
      };
      const weekLogsQuery = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      };

      (supabaseService.db.from as jest.Mock)
        .mockReturnValueOnce(todayLogsQuery as any)
        .mockReturnValueOnce(foodsQuery as any)
        .mockReturnValueOnce(foodsQuery as any)
        .mockReturnValueOnce(foodsQuery as any)
        .mockReturnValueOnce(foodsQuery as any)
        .mockReturnValueOnce(weekLogsQuery as any);

      const result = await service.getWeeklyRecommendations('user123', profile as any);

      expect(result.remaining_calories).toBe(800);
    });

    it('should cap remaining calories at 0', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
        target_breakfast_cal: 500,
        target_lunch_cal: 700,
        target_dinner_cal: 600,
        target_snack_cal: 200,
      };

      const todayLogsQuery = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ data: [{ calories: 1500 }, { calories: 600 }] }),
          }),
        }),
      };
      const foodsQuery = {
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            lte: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          }),
        }),
      };
      const weekLogsQuery = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      };

      (supabaseService.db.from as jest.Mock)
        .mockReturnValueOnce(todayLogsQuery as any)
        .mockReturnValueOnce(foodsQuery as any)
        .mockReturnValueOnce(foodsQuery as any)
        .mockReturnValueOnce(foodsQuery as any)
        .mockReturnValueOnce(foodsQuery as any)
        .mockReturnValueOnce(weekLogsQuery as any);

      const result = await service.getWeeklyRecommendations('user123', profile as any);

      expect(result.remaining_calories).toBe(0);
    });

    it('should include meal tips for all types', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
        target_breakfast_cal: 500,
        target_lunch_cal: 700,
        target_dinner_cal: 600,
        target_snack_cal: 200,
      };

      const chain = makeChain({ data: [] });
      (supabaseService.db.from as jest.Mock).mockReturnValue(chain);

      const result = await service.getWeeklyRecommendations('user123', profile as any);

      expect(result.meals[0].tips).toContain('protein');
      expect(result.meals[1].tips).toContain('vegetables');
      expect(result.meals[2].tips).toContain('vegetables');
      expect(result.meals[3].tips).toContain('snacks');
    });

    it('should include weekly insights', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
        target_breakfast_cal: 500,
        target_lunch_cal: 700,
        target_dinner_cal: 600,
        target_snack_cal: 200,
      };

      const chain = makeChain({ data: [] });
      (supabaseService.db.from as jest.Mock).mockReturnValue(chain);

      const result = await service.getWeeklyRecommendations('user123', profile as any);

      expect(result.weekly_insights).toBeDefined();
      expect(typeof result.weekly_insights.average_adherence).toBe('number');
      expect(['improving', 'stable', 'declining']).toContain(
        result.weekly_insights.trend,
      );
      expect(result.weekly_insights.suggestion).toBeDefined();
    });
  });

  describe('getWeeklyMealPlan', () => {
    it('should return week start, end and daily plans', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
        target_breakfast_cal: 500,
        target_lunch_cal: 700,
        target_dinner_cal: 600,
        target_snack_cal: 200,
      };

      const chain = makeChain({ data: [] });
      (supabaseService.db.from as jest.Mock).mockReturnValue(chain);

      const result = await service.getWeeklyMealPlan('user123', profile as any);

      expect(result.week_start).toBeDefined();
      expect(result.week_end).toBeDefined();
      expect(result.daily_plans).toHaveLength(7);
      expect(result.daily_plans[0].user_id).toBe('user123');
    });
  });
});
