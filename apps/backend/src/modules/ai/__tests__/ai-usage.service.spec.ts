import { ForbiddenException, HttpStatus } from '@nestjs/common';
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