import { WeeklyAdaptiveService } from '../weekly-adaptive.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { CalorieTargetService } from '../calorie-target.service';

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
  ].forEach((m) => {
    chain[m] = jest.fn().mockReturnThis();
  });
  chain['single'] = jest.fn().mockResolvedValue(resolvedValue);
  return chain;
}

function makeSupabase(
  fromImpl?: (table: string) => Record<string, jest.Mock>,
): SupabaseService {
  const db = {
    from: fromImpl
      ? jest.fn().mockImplementation(fromImpl)
      : jest.fn().mockReturnValue(makeChain({ data: null, error: null })),
  };
  return { db } as unknown as SupabaseService;
}

describe('WeeklyAdaptiveService', () => {
  let service: WeeklyAdaptiveService;
  let supabaseService: SupabaseService;
  let calorieTargetService: CalorieTargetService;

  beforeEach(() => {
    calorieTargetService = new CalorieTargetService();
    supabaseService = makeSupabase();
    service = new WeeklyAdaptiveService(supabaseService, calorieTargetService);
  });

  describe('calculateWeeklyAdjustment', () => {
    it('should maintain target when adherence is 90-110%', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
      };

      // Mock logs with ~100% adherence
      const logsChain = makeChain({ data: null, error: null });
      logsChain.from = jest.fn().mockReturnValue(logsChain);
      logsChain.select = jest.fn().mockReturnValue(logsChain);
      logsChain.eq = jest.fn().mockReturnValue(logsChain);
      logsChain.gte = jest.fn().mockReturnValue(logsChain);
      logsChain.order = jest.fn().mockReturnValue(logsChain);

      const mockData = Array(7)
        .fill(null)
        .map((_, i) => ({
          created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          calories: 2000,
        }));

      logsChain.select.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockData }),
          }),
        }),
      });

      supabaseService.db.from = jest.fn().mockReturnValue(logsChain);

      const result = await service.calculateWeeklyAdjustment(
        'user123',
        profile as any,
      );

      expect(result.adjustment_percentage).toBe(0);
      expect(result.adjusted_daily_target).toBe(2000);
    });

    it('should increase target when adherence is <70%', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
      };

      // Mock logs with ~50% adherence (eating only 1000 cal/day)
      const logsChain = makeChain({ data: null, error: null });
      logsChain.from = jest.fn().mockReturnValue(logsChain);
      logsChain.select = jest.fn().mockReturnValue(logsChain);
      logsChain.eq = jest.fn().mockReturnValue(logsChain);
      logsChain.gte = jest.fn().mockReturnValue(logsChain);
      logsChain.order = jest.fn().mockReturnValue(logsChain);

      const mockData = Array(7)
        .fill(null)
        .map((_, i) => ({
          created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          calories: 1000,
        }));

      logsChain.select.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockData }),
          }),
        }),
      });

      supabaseService.db.from = jest.fn().mockReturnValue(logsChain);

      const result = await service.calculateWeeklyAdjustment(
        'user123',
        profile as any,
      );

      expect(result.adjustment_percentage).toBe(5);
      expect(result.adjusted_daily_target).toBe(2100);
      expect(result.recommendation).toContain('increase');
    });

    it('should decrease target when adherence is >130%', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
      };

      // Mock logs with ~160% adherence (eating 3200 cal/day)
      const logsChain = makeChain({ data: null, error: null });
      logsChain.from = jest.fn().mockReturnValue(logsChain);
      logsChain.select = jest.fn().mockReturnValue(logsChain);
      logsChain.eq = jest.fn().mockReturnValue(logsChain);
      logsChain.gte = jest.fn().mockReturnValue(logsChain);
      logsChain.order = jest.fn().mockReturnValue(logsChain);

      const mockData = Array(7)
        .fill(null)
        .map((_, i) => ({
          created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          calories: 3200,
        }));

      logsChain.select.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockData }),
          }),
        }),
      });

      supabaseService.db.from = jest.fn().mockReturnValue(logsChain);

      const result = await service.calculateWeeklyAdjustment(
        'user123',
        profile as any,
      );

      expect(result.adjustment_percentage).toBe(-8);
      expect(result.adjusted_daily_target).toBe(1840);
      expect(result.recommendation).toContain('significantly above');
    });

    it('should cap adherence at 200%', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
      };

      // Mock logs with extreme adherence (eating 5000 cal/day = 250%)
      const logsChain = makeChain({ data: null, error: null });
      logsChain.from = jest.fn().mockReturnValue(logsChain);
      logsChain.select = jest.fn().mockReturnValue(logsChain);
      logsChain.eq = jest.fn().mockReturnValue(logsChain);
      logsChain.gte = jest.fn().mockReturnValue(logsChain);
      logsChain.order = jest.fn().mockReturnValue(logsChain);

      const mockData = Array(7)
        .fill(null)
        .map((_, i) => ({
          created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          calories: 5000,
        }));

      logsChain.select.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockData }),
          }),
        }),
      });

      supabaseService.db.from = jest.fn().mockReturnValue(logsChain);

      const result = await service.calculateWeeklyAdjustment(
        'user123',
        profile as any,
      );

      // Adherence should be capped at 200%
      expect(result.adherence_last_week).toBeLessThanOrEqual(200);
    });

    it('should default to 100% adherence when no logs', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
      };

      const logsChain = makeChain({ data: null, error: null });
      logsChain.from = jest.fn().mockReturnValue(logsChain);
      logsChain.select = jest.fn().mockReturnValue(logsChain);
      logsChain.eq = jest.fn().mockReturnValue(logsChain);
      logsChain.gte = jest.fn().mockReturnValue(logsChain);
      logsChain.order = jest.fn().mockReturnValue(logsChain);

      logsChain.select.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: null }),
          }),
        }),
      });

      supabaseService.db.from = jest.fn().mockReturnValue(logsChain);

      const result = await service.calculateWeeklyAdjustment(
        'user123',
        profile as any,
      );

      expect(result.adherence_last_week).toBe(100);
      expect(result.adjustment_percentage).toBe(0);
    });

    it('should maintain target for 90-110% adherence', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
      };

      // Mock logs with 95% adherence (eating 1900 cal/day)
      const logsChain = makeChain({ data: null, error: null });
      logsChain.from = jest.fn().mockReturnValue(logsChain);
      logsChain.select = jest.fn().mockReturnValue(logsChain);
      logsChain.eq = jest.fn().mockReturnValue(logsChain);
      logsChain.gte = jest.fn().mockReturnValue(logsChain);
      logsChain.order = jest.fn().mockReturnValue(logsChain);

      const mockData = Array(7)
        .fill(null)
        .map((_, i) => ({
          created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          calories: 1900,
        }));

      logsChain.select.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockData }),
          }),
        }),
      });

      supabaseService.db.from = jest.fn().mockReturnValue(logsChain);

      const result = await service.calculateWeeklyAdjustment(
        'user123',
        profile as any,
      );

      expect(result.adjustment_percentage).toBe(0);
      expect(result.adjusted_daily_target).toBe(2000);
    });

    it('should apply -3% adjustment for 110-130% adherence', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
      };

      // Mock logs with 120% adherence (eating 2400 cal/day)
      const logsChain = makeChain({ data: null, error: null });
      logsChain.from = jest.fn().mockReturnValue(logsChain);
      logsChain.select = jest.fn().mockReturnValue(logsChain);
      logsChain.eq = jest.fn().mockReturnValue(logsChain);
      logsChain.gte = jest.fn().mockReturnValue(logsChain);
      logsChain.order = jest.fn().mockReturnValue(logsChain);

      const mockData = Array(7)
        .fill(null)
        .map((_, i) => ({
          created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          calories: 2400,
        }));

      logsChain.select.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockData }),
          }),
        }),
      });

      supabaseService.db.from = jest.fn().mockReturnValue(logsChain);

      const result = await service.calculateWeeklyAdjustment(
        'user123',
        profile as any,
      );

      expect(result.adjustment_percentage).toBe(-3);
      expect(result.adjusted_daily_target).toBe(1940);
    });
  });

  describe('applyWeeklyAdjustment', () => {
    it('should update user profile with new targets', async () => {
      const profile = {
        id: 'user123',
        email: 'test@example.com',
        daily_calorie_target: 2000,
      };

      const logsChain = makeChain({ data: null, error: null });
      logsChain.from = jest.fn().mockReturnValue(logsChain);
      logsChain.select = jest.fn().mockReturnValue(logsChain);
      logsChain.eq = jest.fn().mockReturnValue(logsChain);
      logsChain.gte = jest.fn().mockReturnValue(logsChain);
      logsChain.order = jest.fn().mockReturnValue(logsChain);
      logsChain.update = jest.fn().mockReturnValue(logsChain);

      const mockData = Array(7)
        .fill(null)
        .map((_, i) => ({
          created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          calories: 2000,
        }));

      logsChain.select.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockData }),
          }),
        }),
      });

      supabaseService.db.from = jest.fn().mockReturnValue(logsChain);

      const result = await service.applyWeeklyAdjustment('user123', profile as any);

      expect(result.user_id).toBe('user123');
      expect(result.adjusted_daily_target).toBeDefined();
    });
  });
});
