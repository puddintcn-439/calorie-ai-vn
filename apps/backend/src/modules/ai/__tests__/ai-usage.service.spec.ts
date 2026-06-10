import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { AiUsageService } from '../ai-usage.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { SubscriptionService } from '../../subscription/subscription.service';

function makeDb(overrides?: Partial<any>) {
  return {
    rpc: jest.fn().mockResolvedValue({ data: [{ id: 'usage-1', status: 'reserved' }], error: null }),
    from: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
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
      p_daily_limit: 10,
      p_monthly_limit: 200,
    }));
    expect(result.reserved).toBe(true);
  });

  it('throws TooManyRequestsException when reservation is blocked', async () => {
    const db = makeDb({
      rpc: jest.fn().mockResolvedValue({ data: [{ id: 'usage-1', status: 'blocked' }], error: null }),
    });
    const service = new AiUsageService(
      { db } as unknown as SupabaseService,
      {
        getUserSubscription: jest.fn().mockResolvedValue({ tier: 'free' }),
      } as unknown as SubscriptionService,
      { get: jest.fn().mockReturnValue('') } as any,
    );

    await expect(service.reserveUsage('u1', 'scan_text')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
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
});