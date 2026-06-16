import { SubscriptionService } from '../subscription.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { ForbiddenException } from '@nestjs/common';

function makeChain(returnValue: unknown) {
  const c: Record<string, jest.Mock> = {};
  ['from','select','insert','update','upsert','eq','single'].forEach(m => { c[m] = jest.fn().mockReturnThis(); });
  c['single'] = jest.fn().mockResolvedValue(returnValue);
  return c;
}

describe('SubscriptionService.getUserSubscription', () => {
  it('returns existing subscription', async () => {
    const sub = { id: 's1', user_id: 'u1', tier: 'free', is_active: true };
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: sub, error: null }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.getUserSubscription('u1');
    expect(result.tier).toBe('free');
  });

  it('creates free tier when not found (PGRST116)', async () => {
    const created = { id: 's2', user_id: 'u2', tier: 'free', is_active: true };
    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'user_subscriptions') {
          let call = 0;
          return {
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
          };
        }
        // users table update
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.getUserSubscription('u2');
    expect(result.tier).toBe('free');
  });

  it('normalizes cancelled paid legacy rows to current free access', async () => {
    const sub = { id: 's1', user_id: 'u1', tier: 'pro', is_active: true, cancelled_at: '2026-06-01T00:00:00.000Z' };
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: sub, error: null }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.getUserSubscription('u1');
    expect(result.tier).toBe('free');
    expect(result.is_active).toBe(true);
  });

  it('normalizes expired paid legacy rows to current free access', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00.000Z'));
    const sub = { id: 's1', user_id: 'u1', tier: 'premium', is_active: true, renews_at: '2026-06-01T00:00:00.000Z' };
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: sub, error: null }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.getUserSubscription('u1');
    expect(result.tier).toBe('free');
    jest.useRealTimers();
  });

  it('refetches subscription when free tier creation races an existing row', async () => {
    const existing = { id: 's2', user_id: 'u2', tier: 'premium', is_active: true };
    let selectCalls = 0;
    const updateUser = jest.fn().mockReturnThis();
    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'user_subscriptions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockImplementation(() => {
              selectCalls++;
              if (selectCalls === 1) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
              return Promise.resolve({ data: existing, error: null });
            }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
              }),
            }),
          };
        }
        return {
          update: updateUser,
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.getUserSubscription('u2');

    expect(result.tier).toBe('premium');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('throws when DB returns non-PGRST116 error', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    await expect(service.getUserSubscription('u1')).rejects.toThrow('db error');
  });

  it('throws when free tier creation fails after PGRST116', async () => {
    let call = 0;
    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'user_subscriptions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockImplementation(() => {
              call++;
              if (call === 1) {
                return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
              }
              return Promise.resolve({ data: null, error: new Error('create failed') });
            }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: null, error: new Error('create failed') }),
            }),
          };
        }
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    await expect(service.getUserSubscription('u2')).rejects.toThrow('create failed');
  });
});

describe('SubscriptionService.upgradeSubscription', () => {
  it('upgrades to premium tier', async () => {
    const upgraded = { id: 's3', user_id: 'u1', tier: 'premium', is_active: true };
    const upsert = jest.fn().mockReturnThis();
    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'user_subscriptions') {
          return {
            upsert,
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: upgraded, error: null }),
          };
        }
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.upgradeSubscription('u1', { tier: 'premium', payment_provider: 'stripe', payment_id: 'pi_123' });
    expect(result.tier).toBe('premium');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1',
      tier: 'premium',
      cancelled_at: null,
      is_active: true,
    }), { onConflict: 'user_id' });
  });

  it('throws ForbiddenException for invalid tier', async () => {
    const db = { from: jest.fn() };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    await expect(service.upgradeSubscription('u1', { tier: 'invalid_tier' as any, payment_provider: 'stripe' }))
      .rejects.toThrow(ForbiddenException);
  });

  it('throws when DB upsert fails', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: new Error('upsert error') }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    await expect(service.upgradeSubscription('u1', { tier: 'premium', payment_provider: 'stripe' }))
      .rejects.toThrow('upsert error');
  });
});

describe('SubscriptionService.getUserFeatures', () => {
  it('returns features for the user tier', async () => {
    const sub = { id: 's1', user_id: 'u1', tier: 'premium', is_active: true };
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: sub, error: null }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const features = await service.getUserFeatures('u1');
    expect(features).toBeDefined();
    expect(typeof features.daily_insights).toBe('boolean');
  });
});

describe('SubscriptionService.cancelSubscription', () => {
  it('cancels subscription and reverts to free tier', async () => {
    const cancelled = { id: 's1', user_id: 'u1', tier: 'free', is_active: true };
    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'user_subscriptions') {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: cancelled, error: null }),
          };
        }
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.cancelSubscription('u1');
    expect(result.tier).toBe('free');
  });

  it('throws when cancel update fails', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: new Error('cancel failed') }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    await expect(service.cancelSubscription('u1')).rejects.toThrow('cancel failed');
  });
});

describe('SubscriptionService.hasFeatureAccess', () => {
  it('returns true for premium feature when user has premium tier', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { tier: 'premium', is_active: true }, error: null }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.hasFeatureAccess('u1', 'ai_coach');
    expect(result).toBe(true);
  });

  it('returns false when subscription inactive', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { tier: 'premium', is_active: false }, error: null }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.hasFeatureAccess('u1', 'ai_coach');
    expect(result).toBe(false);
  });
});

describe('SubscriptionService.syncSubscriptionRenewals', () => {
  it('returns count of subscriptions needing renewal', async () => {
    const subscriptions = [{ id: 's1' }, { id: 's2' }];
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValue({ data: subscriptions, error: null }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.syncSubscriptionRenewals();
    expect(result).toBe(2);
  });

  it('returns 0 when no renewals match', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    const result = await service.syncSubscriptionRenewals();
    expect(result).toBe(0);
  });

  it('throws when renewal sync query fails', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValue({ data: null, error: new Error('renewal query failed') }),
      }),
    };
    const service = new SubscriptionService({ db } as unknown as SupabaseService);
    await expect(service.syncSubscriptionRenewals()).rejects.toThrow('renewal query failed');
  });
});
