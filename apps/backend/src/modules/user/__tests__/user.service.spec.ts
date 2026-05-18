import { UserService } from '../user.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { NotFoundException } from '@nestjs/common';

function makeDb(fromImpl: (table: string) => unknown) {
  return { from: jest.fn().mockImplementation(fromImpl) };
}

describe('UserService.getProfile', () => {
  it('returns existing user profile', async () => {
    const user = { id: 'u1', email: 'a@b.com', full_name: 'Test' };
    const db = makeDb(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: user, error: null }),
    }));
    const service = new UserService({ db } as unknown as SupabaseService);
    const result = await service.getProfile('u1');
    expect(result.email).toBe('a@b.com');
  });

  it('creates and returns profile when not found but email provided', async () => {
    const newUser = { id: 'u2', email: 'new@b.com' };
    const db = makeDb((table: string) => {
      if (table === 'users') {
        let callCount = 0;
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: newUser, error: null }),
          }),
        };
      }
      return {};
    });
    const service = new UserService({ db } as unknown as SupabaseService);
    const result = await service.getProfile('u2', 'new@b.com');
    expect(result.id).toBe('u2');
  });

  it('throws NotFoundException when not found and no email given', async () => {
    const db = makeDb(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    const service = new UserService({ db } as unknown as SupabaseService);
    await expect(service.getProfile('missing')).rejects.toThrow(NotFoundException);
  });

  it('throws when DB query returns error', async () => {
    const db = makeDb(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
    }));
    const service = new UserService({ db } as unknown as SupabaseService);
    await expect(service.getProfile('u1')).rejects.toThrow('db error');
  });
});

describe('UserService.updateProfile', () => {
  it('updates and returns existing user', async () => {
    const updated = { id: 'u1', email: 'a@b.com', full_name: 'Updated' };
    const db = makeDb(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: updated, error: null }),
    }));
    const service = new UserService({ db } as unknown as SupabaseService);
    const result = await service.updateProfile('u1', { full_name: 'Updated' });
    expect(result.full_name).toBe('Updated');
  });

  it('upserts when update returns no data but email provided', async () => {
    const inserted = { id: 'u3', email: 'u3@b.com', full_name: 'New' };
    const db = makeDb(() => ({
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: inserted, error: null }),
      }),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    const service = new UserService({ db } as unknown as SupabaseService);
    const result = await service.updateProfile('u3', { full_name: 'New' }, 'u3@b.com');
    expect(result.full_name).toBe('New');
  });

  it('throws NotFoundException when no data returned and no email provided', async () => {
    const db = makeDb(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    const service = new UserService({ db } as unknown as SupabaseService);
    await expect(service.updateProfile('u1', {})).rejects.toThrow(NotFoundException);
  });

  it('throws when update DB returns error', async () => {
    const db = makeDb(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: new Error('update failed') }),
    }));
    const service = new UserService({ db } as unknown as SupabaseService);
    await expect(service.updateProfile('u1', {})).rejects.toThrow('update failed');
  });

  it('computes and persists a safe goal plan target', async () => {
    const existing = {
      id: 'u1',
      email: 'a@b.com',
      weight_kg: 80,
      height_cm: 175,
      age: 32,
      gender: 'male',
      activity_level: 'moderate',
      goal: 'maintain',
      health_flags: [],
    };
    let captured: Record<string, unknown> | null = null;
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockImplementation((row: Record<string, unknown>) => {
        captured = row;
        return chain;
      }),
      maybeSingle: jest.fn()
        .mockResolvedValueOnce({ data: existing, error: null })
        .mockImplementation(() => Promise.resolve({ data: { ...existing, ...captured }, error: null })),
    };
    const db = makeDb(() => chain);
    const service = new UserService({ db } as unknown as SupabaseService);

    const result = await service.updateProfile('u1', {
      goal_plan: { target_kg: 2, duration_weeks: 4, direction: 'loss' },
    });

    expect(result.daily_calorie_target).toBeGreaterThan(0);
    expect(result.goal).toBe('lose_weight');
    expect(result.goal_plan?.computed_daily_calorie_target).toBe(result.daily_calorie_target);
    expect(result.goal_plan?.weekly_rate_kg).toBe(0.5);
    expect(result.target_breakfast_cal).toBe(Math.round((result.daily_calorie_target ?? 0) * 0.25));
  });

  it('forces weight-change goal plans to maintenance for minors', async () => {
    const existing = {
      id: 'u1',
      email: 'a@b.com',
      weight_kg: 60,
      height_cm: 170,
      age: 16,
      gender: 'female',
      activity_level: 'light',
      goal: 'lose_weight',
      health_flags: [],
    };
    let captured: Record<string, unknown> | null = null;
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockImplementation((row: Record<string, unknown>) => {
        captured = row;
        return chain;
      }),
      maybeSingle: jest.fn()
        .mockResolvedValueOnce({ data: existing, error: null })
        .mockImplementation(() => Promise.resolve({ data: { ...existing, ...captured }, error: null })),
    };
    const db = makeDb(() => chain);
    const service = new UserService({ db } as unknown as SupabaseService);

    const result = await service.updateProfile('u1', {
      goal_plan: { target_kg: 4, duration_weeks: 4, direction: 'loss' },
    });

    expect(result.goal).toBe('maintain');
    expect(result.goal_plan?.safety_status).toBe('maintenance_only');
    expect(result.goal_plan?.warnings?.[0]).toMatch(/maintenance/i);
  });

  it('clears goal plan when null is provided', async () => {
    const existing = {
      id: 'u1',
      email: 'a@b.com',
      weight_kg: 80,
      height_cm: 175,
      age: 32,
      gender: 'male',
      activity_level: 'moderate',
      goal_plan: { target_kg: 2, duration_weeks: 4, direction: 'loss' },
    };
    let captured: Record<string, unknown> | null = null;
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockImplementation((row: Record<string, unknown>) => {
        captured = row;
        return chain;
      }),
      maybeSingle: jest.fn()
        .mockResolvedValueOnce({ data: existing, error: null })
        .mockImplementation(() => Promise.resolve({ data: { ...existing, ...captured }, error: null })),
    };
    const db = makeDb(() => chain);
    const service = new UserService({ db } as unknown as SupabaseService);

    const result = await service.updateProfile('u1', { goal_plan: null });

    expect(result.goal_plan).toBeNull();
  });
});
