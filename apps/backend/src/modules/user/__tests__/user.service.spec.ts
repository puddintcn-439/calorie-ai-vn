import { UserService } from '../user.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { NotFoundException } from '@nestjs/common';

function makeDb(fromImpl: (table: string) => unknown) {
  return { from: jest.fn().mockImplementation(fromImpl) };
}

describe('UserService activity derivation', () => {
  it('uses 150 and 300 weekly minutes as activity boost thresholds', () => {
    const service = new UserService({ db: {} } as unknown as SupabaseService);
    const derive = (service as any).deriveActivityLevel.bind(service);

    expect(derive({
      work_activity_level: 'sedentary',
      exercise_sessions_per_week: 1,
      exercise_minutes_per_session: 149,
    })).toBe('sedentary');
    expect(derive({
      work_activity_level: 'sedentary',
      exercise_sessions_per_week: 1,
      exercise_minutes_per_session: 150,
    })).toBe('light');
    expect(derive({
      work_activity_level: 'sedentary',
      exercise_sessions_per_week: 2,
      exercise_minutes_per_session: 150,
    })).toBe('moderate');
  });
});

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
  it('rejects an unbounded or unsourced clinician target', async () => {
    const existing = { id: 'u1', email: 'a@b.com' };
    const db = makeDb(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
    }));
    const service = new UserService({ db } as unknown as SupabaseService);

    await expect(service.updateProfile('u1', {
      clinician_nutrition_targets: {
        source: '',
        protein_g: 5000,
      },
    })).rejects.toThrow('requires a source');
  });

  it('ignores client-written derived nutrition and activity fields', async () => {
    const existing = {
      id: 'u1',
      email: 'a@b.com',
      activity_level: 'light',
      daily_calorie_target: 2200,
      target_breakfast_cal: 550,
      nutrition_algorithm_version: 'nutrition-v2',
    };
    const update = jest.fn().mockReturnThis();
    const maybeSingle = jest.fn()
      .mockResolvedValueOnce({ data: existing, error: null })
      .mockImplementation(async () => ({
        data: { ...existing, ...(update.mock.calls[0]?.[0] ?? {}) },
        error: null,
      }));
    const db = makeDb(() => ({
      update,
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle,
    }));
    const service = new UserService({ db } as unknown as SupabaseService);

    const result = await service.updateProfile('u1', {
      activity_level: 'very_active',
      daily_calorie_target: 9999,
      target_breakfast_cal: 9999,
      nutrition_algorithm_version: 'spoofed',
    } as never);

    const persisted = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(persisted).toEqual(expect.objectContaining({ updated_at: expect.any(String) }));
    expect(persisted).not.toHaveProperty('activity_level');
    expect(persisted).not.toHaveProperty('daily_calorie_target');
    expect(persisted).not.toHaveProperty('target_breakfast_cal');
    expect(persisted).not.toHaveProperty('nutrition_algorithm_version');
    expect(result.activity_level).toBe('light');
    expect(result.daily_calorie_target).toBe(2200);
    expect(result.target_breakfast_cal).toBe(550);
    expect(result.nutrition_algorithm_version).toBe('nutrition-v2');
  });

  it('stores user-entered clinician plans as self-attested', async () => {
    const existing = { id: 'u1', email: 'a@b.com' };
    const update = jest.fn().mockReturnThis();
    const maybeSingle = jest.fn()
      .mockResolvedValueOnce({ data: existing, error: null })
      .mockImplementation(async () => ({
        data: { ...existing, ...(update.mock.calls[0]?.[0] ?? {}) },
        error: null,
      }));
    const db = makeDb(() => ({
      update,
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle,
    }));
    const service = new UserService({ db } as unknown as SupabaseService);

    const result = await service.updateProfile('u1', {
      clinician_nutrition_targets: {
        source: 'Renal dietitian',
        protein_g: 55,
        provenance: 'provider_verified',
        verification_status: 'verified',
        verified_at: '2026-06-01T00:00:00.000Z',
        verified_by: 'spoofed-provider',
      },
    });

    expect(result.clinician_nutrition_targets).toEqual(expect.objectContaining({
      protein_g: 55,
      provenance: 'user_reported',
      verification_status: 'self_attested',
    }));
    expect(result.clinician_nutrition_targets?.verified_at).toBeUndefined();
    expect(result.clinician_nutrition_targets?.verified_by).toBeUndefined();
  });

  it('preserves provider verification when an unchanged plan is echoed by profile save', async () => {
    const verifiedPlan = {
      source: 'Hospital renal team',
      provider_type: 'care_team' as const,
      protein_g: 55,
      effective_from: '2026-06-01',
      expires_at: '2026-12-01',
      provenance: 'provider_verified' as const,
      verification_status: 'verified' as const,
      verified_at: '2026-06-01T10:00:00.000Z',
      verified_by: 'provider-123',
      confirmed_at: '2026-06-01T10:00:00.000Z',
      status: 'active' as const,
      plan_version: 2,
    };
    const existing = {
      id: 'u1',
      email: 'a@b.com',
      clinician_nutrition_targets: verifiedPlan,
    };
    const update = jest.fn().mockReturnThis();
    const maybeSingle = jest.fn()
      .mockResolvedValueOnce({ data: existing, error: null })
      .mockImplementation(async () => ({
        data: { ...existing, ...(update.mock.calls[0]?.[0] ?? {}) },
        error: null,
      }));
    const db = makeDb(() => ({
      update,
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle,
    }));
    const service = new UserService({ db } as unknown as SupabaseService);

    const result = await service.updateProfile('u1', {
      full_name: 'Updated name',
      clinician_nutrition_targets: { ...verifiedPlan },
    });

    expect(result.clinician_nutrition_targets).toEqual(verifiedPlan);
  });

  it('derives age, activity, and a fresh calorie target from personalized profile inputs', async () => {
    const existing = {
      id: 'u1',
      email: 'a@b.com',
      weight_kg: 74,
      height_cm: 180,
      age: 27,
      gender: 'male',
      activity_level: 'light',
      goal: 'maintain',
      health_flags: [],
    };
    const update = jest.fn().mockReturnThis();
    const maybeSingle = jest.fn()
      .mockResolvedValueOnce({ data: existing, error: null })
      .mockImplementation(async () => ({
        data: { ...existing, ...(update.mock.calls[0]?.[0] ?? {}) },
        error: null,
      }));
    const db = makeDb(() => ({
      update,
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle,
    }));
    const service = new UserService({ db } as unknown as SupabaseService);

    const result = await service.updateProfile('u1', {
      date_of_birth: '1990-01-01',
      work_activity_level: 'sedentary',
      exercise_sessions_per_week: 4,
      exercise_minutes_per_session: 45,
    });

    expect(result.age).toBeGreaterThanOrEqual(35);
    expect(result.activity_level).toBe('light');
    expect(result.daily_calorie_target).toBeGreaterThan(0);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      date_of_birth: '1990-01-01',
      activity_level: 'light',
      daily_calorie_target: expect.any(Number),
    }));
  });

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
