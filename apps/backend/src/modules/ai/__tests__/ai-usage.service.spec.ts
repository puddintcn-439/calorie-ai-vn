import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { AiUsageService } from '../ai-usage.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { SubscriptionService } from '../../subscription/subscription.service';

function makeDb(overrides?: Partial<any>) {
  const usageQuery = {
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  const summaryQuery = {
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  const updateQuery = {
    eq: jest.fn().mockResolvedValue({ error: null }),
  };
  return {
    rpc: jest.fn().mockResolvedValue({ data: [{ id: 'usage-1', status: 'reserved' }], error: null }),
    from: jest.fn().mockImplementation((table: string) => ({
      update: jest.fn().mockReturnValue(updateQuery),
      select: jest.fn().mockImplementation((query: string) => {
        if (query.includes('credits_consumed')) {
          return usageQuery;
        }
        return summaryQuery;
      }),
    })),
    ...overrides,
  };
}

describe('AiUsageService', () => {
  it('reserves usage via rpc with plan policy inputs', async () => {
    const db = makeDb();
    const service = new AiUsageService(
      { db } as unknown as SupabaseService,
      {
        getUserSubscription: jest.fn().mockResolvedValue({ tier: 'free' }),
      } as unknown as SubscriptionService,
      { get: jest.fn().mockReturnValue('') } as any,
    );

    const result = await service.reserveUsage('u1', 'scan_text');

    expect(db.rpc).toHaveBeenCalledWith('reserve_ai_usage_event', expect.objectContaining({
      p_user_id: 'u1',
      p_feature: 'scan_text',
      p_plan_tier: 'free',
      p_daily_limit: 3,
      p_monthly_limit: 30,
      p_credit_cost: 1,
      p_daily_credit_limit: 3,
      p_monthly_credit_limit: 20,
    }));
    expect(result.reserved).toBe(true);
  });

  it('returns request quota and credit budget usage together', async () => {
    const now = new Date('2026-06-11T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const expectedTomorrowStart = new Date(now);
    expectedTomorrowStart.setHours(0, 0, 0, 0);
    expectedTomorrowStart.setDate(expectedTomorrowStart.getDate() + 1);
    const expectedNextMonthStart = new Date(now);
    expectedNextMonthStart.setDate(1);
    expectedNextMonthStart.setHours(0, 0, 0, 0);
    expectedNextMonthStart.setMonth(expectedNextMonthStart.getMonth() + 1);

    const db = makeDb({
      from: jest.fn().mockImplementation((table: string) => ({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
        select: jest.fn().mockImplementation((query: string) => {
          if (query.includes('credits_consumed')) {
            return {
              eq: jest.fn().mockReturnThis(),
              in: jest.fn().mockReturnThis(),
              gte: jest.fn().mockResolvedValue({
                error: null,
                data: [
                  {
                    feature: 'scan_text',
                    status: 'success',
                    created_at: '2026-06-11T08:00:00.000Z',
                    credits_consumed: 1,
                  },
                  {
                    feature: 'scan_image',
                    status: 'reserved',
                    created_at: '2026-06-11T09:00:00.000Z',
                    credits_consumed: 3,
                  },
                  {
                    feature: 'scan_text',
                    status: 'failed',
                    created_at: '2026-06-02T09:00:00.000Z',
                    credits_consumed: 1,
                  },
                ],
              }),
            };
          }
          return {
            gte: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }),
      })),
    });
    const service = new AiUsageService(
      { db } as unknown as SupabaseService,
      {
        getUserSubscription: jest.fn().mockResolvedValue({ tier: 'free' }),
      } as unknown as SubscriptionService,
      { get: jest.fn().mockReturnValue('') } as any,
    );

    const result = await service.getQuotaRemaining('u1');

    expect(result.plan_tier).toBe('free');
    expect(result.daily_credit_limit).toBe(3);
    expect(result.daily_credits_used).toBe(4);
    expect(result.daily_credits_remaining).toBe(0);
    expect(result.monthly_credit_limit).toBe(20);
    expect(result.monthly_credits_used).toBe(5);
    expect(result.monthly_credits_remaining).toBe(15);
    expect(result.reset_at_daily).toBe(expectedTomorrowStart.toISOString());
    expect(result.reset_at_monthly).toBe(expectedNextMonthStart.toISOString());
    expect(result.quotas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        feature: 'scan_text',
        credits_per_request: 1,
        daily_used: 1,
        daily_remaining: 2,
        monthly_used: 2,
        monthly_remaining: 28,
      }),
      expect.objectContaining({
        feature: 'scan_image',
        credits_per_request: 3,
        daily_used: 1,
        daily_remaining: 0,
        monthly_used: 1,
        monthly_remaining: 9,
      }),
    ]));

    jest.useRealTimers();
  });

  it('returns structured quota error payload when reservation is blocked', async () => {
    const db = makeDb({
      rpc: jest.fn().mockResolvedValue({
        data: [{
          id: 'usage-1',
          status: 'blocked',
          quota_window: 'daily',
          quota_limit: 10,
          quota_used: 10,
          reset_at: '2026-06-11T00:00:00.000Z',
        }],
        error: null,
      }),
    });
    const service = new AiUsageService(
      { db } as unknown as SupabaseService,
      {
        getUserSubscription: jest.fn().mockResolvedValue({ tier: 'free' }),
      } as unknown as SubscriptionService,
      { get: jest.fn().mockReturnValue('') } as any,
    );

    try {
      await service.reserveUsage('u1', 'scan_text');
      fail('Expected reserveUsage to throw HttpException');
    } catch (error: any) {
      expect(error?.getStatus?.()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(error?.getResponse?.()).toMatchObject({
        code: 'AI_QUOTA_EXCEEDED',
        feature: 'scan_text',
        window: 'daily',
        limit: 10,
        used: 10,
        reset_at: '2026-06-11T00:00:00.000Z',
        upgrade_required: true,
      });
      expect(error?.getResponse?.().message).toContain('Bạn đã dùng hết lượt AI');
    }
  });

  it('rejects admin summary for non-admin email', async () => {
    const service = new AiUsageService(
      { db: makeDb() } as unknown as SupabaseService,
      {
        getUserSubscription: jest.fn().mockResolvedValue({ tier: 'free' }),
      } as unknown as SubscriptionService,
      { get: jest.fn().mockReturnValue('admin@example.com') } as any,
    );

    await expect(service.getUsageSummary('user@example.com')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin summary for configured admin email and honors days window', async () => {
    const db = makeDb();
    const service = new AiUsageService(
      { db } as unknown as SupabaseService,
      {
        getUserSubscription: jest.fn().mockResolvedValue({ tier: 'free' }),
      } as unknown as SubscriptionService,
      {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'BETA_ANALYTICS_ADMIN_EMAILS') return 'admin@example.com';
          if (key === 'ADMIN_EMAILS') return '';
          return '';
        }),
      } as any,
    );

    const result = await service.getUsageSummary('admin@example.com', 30);

    expect(result.window_days).toBe(30);
    expect(db.from).toHaveBeenCalledWith('ai_usage_events');
  });
});