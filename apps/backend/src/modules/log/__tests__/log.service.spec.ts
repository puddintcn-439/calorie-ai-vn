import { LogService } from '../log.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { FoodLog, SavedMealItem, MealType, ACTIVITY_MET } from '@calorie-ai/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function makeChain(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'is', 'gte', 'lte', 'order', 'in', 'single'];
  methods.forEach((m) => { chain[m] = jest.fn().mockReturnThis(); });
  // last method in common chains should resolve
  chain['single'] = jest.fn().mockResolvedValue(resolvedValue);
  return chain;
}

function makeSupabase(fromImpl?: (table: string) => unknown): SupabaseService {
  const db = {
    from: fromImpl
      ? jest.fn().mockImplementation(fromImpl)
      : jest.fn().mockReturnValue(makeChain({ data: null, error: null })),
  };
  return { db } as unknown as SupabaseService;
}

// ─────────────────────────────────────────────────────────────────────────────
// createLog
// ─────────────────────────────────────────────────────────────────────────────
describe('LogService.createLog', () => {
  it('inserts and returns the created log', async () => {
    const log: Partial<FoodLog> = { user_id: 'u1', calories: 300, name: 'Phở', protein_g: 15, carbs_g: 40, fat_g: 5, estimated_grams: 500 };
    const supabase = makeSupabase(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'log1', ...log }, error: null }),
    }));
    const service = new LogService(supabase);
    const result = await service.createLog(log);
    expect(result.id).toBe('log1');
    expect(result.calories).toBe(300);
  });

  it('throws when supabase returns an error', async () => {
    const supabase = makeSupabase(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: new Error('insert failed') }),
    }));
    const service = new LogService(supabase);
    await expect(service.createLog({})).rejects.toThrow('insert failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDailyLog – totals computation
// ─────────────────────────────────────────────────────────────────────────────
describe('LogService.getDailyLog', () => {
  const logs: FoodLog[] = [
    { id: '1', user_id: 'u1', quantity: 1, calories: 400, protein_g: 20, carbs_g: 50, fat_g: 10, fiber_g: 7, sugar_g: 12, saturated_fat_g: 2, sodium_mg: 600, name: 'A', meal_type: 'lunch', estimated_grams: 300, unit: 'gram', source: 'ai_scan', logged_at: '2026-05-09T12:00:00Z', created_at: '2026-05-09T12:00:00Z' },
    { id: '2', user_id: 'u1', quantity: 1, calories: 300, protein_g: 15, carbs_g: 35, fat_g: 8, fiber_g: 4, sugar_g: 8, saturated_fat_g: 3, sodium_mg: 500, name: 'B', meal_type: 'dinner', estimated_grams: 250, unit: 'gram', source: 'ai_scan', logged_at: '2026-05-09T19:00:00Z', created_at: '2026-05-09T19:00:00Z' },
  ];

  it('calculates totals correctly and uses user target', async () => {
    const supabase = makeSupabase((table: string) => {
      if (table === 'food_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: logs, error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { daily_calorie_target: 2000 }, error: null }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    const daily = await service.getDailyLog('u1', '2026-05-09');

    expect(daily.total_calories).toBe(700);
    expect(daily.total_protein_g).toBe(35);
    expect(daily.total_carbs_g).toBe(85);
    expect(daily.total_fat_g).toBe(18);
    expect(daily.total_fiber_g).toBe(11);
    expect(daily.total_sugar_g).toBe(20);
    expect(daily.total_saturated_fat_g).toBe(5);
    expect(daily.total_sodium_mg).toBe(1100);
    expect(daily.nutrition_quality_coverage).toEqual({
      total_items: 2,
      fiber_items: 2,
      sugar_items: 2,
      saturated_fat_items: 2,
      sodium_items: 2,
    });
    expect(daily.target_calories).toBe(2000);
    expect(daily.remaining_calories).toBe(1300);
    expect(daily.logs).toHaveLength(2);
  });

  it('defaults to 1800 target when user has no target set', async () => {
    const supabase = makeSupabase((table: string) => {
      if (table === 'food_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { daily_calorie_target: null }, error: null }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    const daily = await service.getDailyLog('u1', '2026-05-09');
    expect(daily.target_calories).toBe(1800);
    expect(daily.total_calories).toBe(0);
    expect(daily.remaining_calories).toBe(1800);
  });

  it('throws when food_logs query fails', async () => {
    const supabase = makeSupabase((table: string) => {
      if (table === 'food_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: null, error: new Error('query error') }),
        };
      }
      return makeChain({ data: null, error: null });
    });
    const service = new LogService(supabase);
    await expect(service.getDailyLog('u1', '2026-05-09')).rejects.toThrow('query error');
  });

  it('applies local-day UTC range using tz_offset_minutes', async () => {
    const gte = jest.fn().mockReturnThis();
    const lte = jest.fn().mockReturnThis();

    const supabase = makeSupabase((table: string) => {
      if (table === 'food_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          gte,
          lte,
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { daily_calorie_target: 1800 }, error: null }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    await service.getDailyLog('u1', '2026-05-10', -420);

    expect(gte).toHaveBeenCalledWith('logged_at', '2026-05-09T17:00:00.000Z');
    expect(lte).toHaveBeenCalledWith('logged_at', '2026-05-10T16:59:59.999Z');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteLog
// ─────────────────────────────────────────────────────────────────────────────
describe('LogService.deleteLog', () => {
  it('soft-deletes and returns deleted log for undo', async () => {
    const deleted = { id: 'log1', user_id: 'u1', deleted_at: '2026-05-19T00:00:00.000Z' };
    const supabase = makeSupabase(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: deleted, error: null }),
    }));
    const service = new LogService(supabase);
    const result = await service.deleteLog('log1', 'u1');
    expect(result).toEqual({ success: true, deleted });
  });
});

describe('LogService.restoreLog', () => {
  it('clears deleted_at and returns restored log', async () => {
    const restored = { id: 'log1', user_id: 'u1', deleted_at: null };
    const supabase = makeSupabase(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: restored, error: null }),
    }));
    const service = new LogService(supabase);
    await expect(service.restoreLog('log1', 'u1')).resolves.toEqual(restored);
  });
});

describe('LogService.updateLog', () => {
  it('scales calories and macros when portion grams change', async () => {
    const existing = {
      id: 'log1',
      user_id: 'u1',
      meal_type: 'lunch',
      name: 'Rice',
      estimated_grams: 100,
      calories: 130,
      protein_g: 2.7,
      carbs_g: 28,
      fat_g: 0.3,
      fiber_g: 1,
      sugar_g: 0.1,
      saturated_fat_g: 0.1,
      sodium_mg: 5,
    };
    const updated = {
      ...existing,
      estimated_grams: 150,
      calories: 195,
      protein_g: 4.1,
      carbs_g: 42,
      fat_g: 0.5,
      fiber_g: 1.5,
      sodium_mg: 8,
    };
    const updatePayloads: Record<string, unknown>[] = [];
    const from = jest.fn()
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: existing, error: null }),
      })
      .mockReturnValueOnce({
        update: jest.fn().mockImplementation((payload) => {
          updatePayloads.push(payload);
          return {
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: updated, error: null }),
          };
        }),
      });

    const service = new LogService({ db: { from } } as unknown as SupabaseService);
    const result = await service.updateLog('log1', 'u1', { estimated_grams: 150 });

    expect(result).toEqual(updated);
    expect(updatePayloads[0]).toMatchObject({
      estimated_grams: 150,
      calories: 195,
      protein_g: 4.1,
      carbs_g: 42,
      fat_g: 0.5,
      fiber_g: 1.5,
      sodium_mg: 8,
    });
  });

  it('respects explicit macro overrides while editing meal and notes', async () => {
    const existing = {
      id: 'log1',
      user_id: 'u1',
      meal_type: 'lunch',
      name: 'Rice',
      estimated_grams: 100,
      calories: 130,
      protein_g: 2.7,
      carbs_g: 28,
      fat_g: 0.3,
    };
    const payloads: Record<string, unknown>[] = [];
    const from = jest.fn()
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: existing, error: null }),
      })
      .mockReturnValueOnce({
        update: jest.fn().mockImplementation((payload) => {
          payloads.push(payload);
          return {
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { ...existing, ...payload }, error: null }),
          };
        }),
      });

    const service = new LogService({ db: { from } } as unknown as SupabaseService);
    await service.updateLog('log1', 'u1', {
      meal_type: 'dinner',
      estimated_grams: 200,
      calories: 240,
      notes: 'less oil',
    });

    expect(payloads[0]).toMatchObject({
      meal_type: 'dinner',
      estimated_grams: 200,
      calories: 240,
      protein_g: 5.4,
      carbs_g: 56,
      fat_g: 0.6,
      notes: 'less oil',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createSavedMeal — macro totals
// ─────────────────────────────────────────────────────────────────────────────
describe('LogService.createSavedMeal', () => {
  const items: SavedMealItem[] = [
    { name: 'Rice', name_vi: 'Cơm', calories: 200, protein_g: 4, carbs_g: 44, fat_g: 1, fiber_g: 2, sugar_g: 1, saturated_fat_g: 0.2, sodium_mg: 5, estimated_grams: 150 },
    { name: 'Chicken', name_vi: 'Gà', calories: 250, protein_g: 30, carbs_g: 0, fat_g: 10, fiber_g: 0, sugar_g: 0, saturated_fat_g: 3, sodium_mg: 90, estimated_grams: 120 },
  ];

  it('inserts with correct computed totals', async () => {
    const captured: Record<string, unknown>[] = [];
    const supabase = makeSupabase(() => ({
      insert: jest.fn().mockImplementation((row: Record<string, unknown>) => {
        captured.push(row);
        return {
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'sm1', ...row }, error: null }),
        };
      }),
    }));

    const service = new LogService(supabase);
    const result = await service.createSavedMeal('u1', 'Lunch combo', items);

    expect(captured[0]).toMatchObject({
      total_calories: 450,
      total_protein_g: 34,
      total_carbs_g: 44,
      total_fat_g: 11,
      total_fiber_g: 2,
      total_sugar_g: 1,
      total_saturated_fat_g: 3.2,
      total_sodium_mg: 95,
    });
    expect(result.id).toBe('sm1');
  });
});

describe('LogService.getSavedMeals', () => {
  it('returns saved meals ordered by use_count', async () => {
    const meals = [{ id: 'm1', name: 'Combo', use_count: 10 }];
    const supabase = makeSupabase(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: meals, error: null }),
    }));

    const service = new LogService(supabase);
    const result = await service.getSavedMeals('u1');

    expect(result).toEqual(meals);
  });

  it('throws when getSavedMeals query fails', async () => {
    const supabase = makeSupabase(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: null, error: new Error('saved query failed') }),
    }));

    const service = new LogService(supabase);
    await expect(service.getSavedMeals('u1')).rejects.toThrow('saved query failed');
  });
});

describe('LogService.logSavedMeal', () => {
  const savedMeal = {
    id: 'sm1',
    user_id: 'u1',
    name: 'Set A',
    use_count: 2,
    items: [
      {
        name: 'Rice',
        name_vi: 'Com',
        calories: 200,
        protein_g: 4,
        carbs_g: 44,
        fat_g: 1,
        fiber_g: 2,
        sugar_g: 1,
        saturated_fat_g: 0.2,
        sodium_mg: 5,
        estimated_grams: 150,
      },
      {
        name: 'Chicken',
        name_vi: 'Ga',
        calories: 250,
        protein_g: 30,
        carbs_g: 0,
        fat_g: 10,
        fiber_g: 0,
        sugar_g: 0,
        saturated_fat_g: 3,
        sodium_mg: 90,
        estimated_grams: 120,
      },
    ],
  };

  it('logs each saved meal item and bumps use_count', async () => {
    const createdLogs = [
      { id: 'l1', calories: 200 },
      { id: 'l2', calories: 250 },
    ];
    let createIndex = 0;
    const insertedLogs: Record<string, unknown>[] = [];

    const supabase = makeSupabase((table: string) => {
      if (table === 'saved_meals') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: savedMeal, error: null }),
          update: jest.fn().mockReturnThis(),
        };
      }

      if (table === 'food_logs') {
        return {
          insert: jest.fn().mockImplementation((row: Record<string, unknown>) => {
            insertedLogs.push(row);
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockImplementation(() =>
                Promise.resolve({ data: createdLogs[createIndex++], error: null }),
              ),
            };
          }),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockImplementation(() =>
            Promise.resolve({ data: createdLogs[createIndex++], error: null }),
          ),
        };
      }

      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    const result = await service.logSavedMeal('u1', 'sm1', 'lunch');

    expect(result).toHaveLength(2);
    expect(result.map((x) => x.id)).toEqual(['l1', 'l2']);
    expect(insertedLogs[0]).toMatchObject({ fiber_g: 2, sugar_g: 1, saturated_fat_g: 0.2, sodium_mg: 5 });
    expect(insertedLogs[1]).toMatchObject({ fiber_g: 0, sugar_g: 0, saturated_fat_g: 3, sodium_mg: 90 });
  });

  it('throws when saved meal is missing', async () => {
    const supabase = makeSupabase(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));

    const service = new LogService(supabase);
    await expect(service.logSavedMeal('u1', 'missing', 'lunch')).rejects.toThrow('Saved meal not found');
  });
});

describe('LogService.deleteSavedMeal', () => {
  it('returns success on delete', async () => {
    const supabase = makeSupabase(() => ({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    }));
    const service = new LogService(supabase);
    await expect(service.deleteSavedMeal('sm1', 'u1')).resolves.toEqual({ success: true });
  });

  it('throws on deleteSavedMeal error', async () => {
    const supabase = makeSupabase(() => ({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn()
        .mockReturnValueOnce({ eq: jest.fn().mockResolvedValue({ error: new Error('delete failed') }) }),
    }));
    const service = new LogService(supabase);
    await expect(service.deleteSavedMeal('sm1', 'u1')).rejects.toThrow('delete failed');
  });
});

describe('LogService.updateSavedMeal', () => {
  it('updates name/items and recomputes totals', async () => {
    const payloads: Record<string, unknown>[] = [];
    const supabase = makeSupabase(() => ({
      update: jest.fn().mockImplementation((payload) => {
        payloads.push(payload);
        return {
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'sm1', user_id: 'u1', ...payload }, error: null }),
        };
      }),
    }));
    const service = new LogService(supabase);

    const result = await service.updateSavedMeal('sm1', 'u1', {
      name: 'New combo',
      items: [{ name: 'Egg', calories: 80, protein_g: 7, carbs_g: 1, fat_g: 5, sodium_mg: 70, estimated_grams: 50 }],
    });

    expect(payloads[0]).toMatchObject({
      name: 'New combo',
      total_calories: 80,
      total_protein_g: 7,
      total_carbs_g: 1,
      total_fat_g: 5,
      total_sodium_mg: 70,
    });
    expect(result.name).toBe('New combo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createActivityLog — calorie estimation
// ─────────────────────────────────────────────────────────────────────────────
describe('LogService.createActivityLog', () => {
  it('uses provided calories_burned when given', async () => {
    const captured: Record<string, unknown>[] = [];
    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          insert: jest.fn().mockImplementation((row: Record<string, unknown>) => {
            captured.push(row);
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'a1', ...row }, error: null }),
            };
          }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    await service.createActivityLog('u1', {
      activity_type: 'running',
      duration_min: 30,
      calories_burned: 400,
    });

    expect(captured[0]).toMatchObject({ calories_burned: 400 });
  });

  it('estimates calories via MET formula when calories_burned not provided', async () => {
    const captured: Record<string, unknown>[] = [];
    const supabase = makeSupabase((table: string) => {
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { weight_kg: 70 }, error: null }),
        };
      }
      if (table === 'activity_logs') {
        return {
          insert: jest.fn().mockImplementation((row: Record<string, unknown>) => {
            captured.push(row);
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'a1', ...row }, error: null }),
            };
          }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    await service.createActivityLog('u1', {
      activity_type: 'running',
      duration_min: 60,
    });

    // MET for running × 70kg × 1hr
    const met = ACTIVITY_MET['running'];
    const expected = Math.round(met * 70 * 1);
    expect(captured[0]).toMatchObject({ calories_burned: expected });
  });

  it('falls back to default weight and default MET for unknown activity', async () => {
    const captured: Record<string, unknown>[] = [];
    const supabase = makeSupabase((table: string) => {
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: {}, error: null }),
        };
      }
      if (table === 'activity_logs') {
        return {
          insert: jest.fn().mockImplementation((row: Record<string, unknown>) => {
            captured.push(row);
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'a2', ...row }, error: null }),
            };
          }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    await service.createActivityLog('u1', {
      activity_type: 'unknown_activity' as any,
      duration_min: 30,
    });

    // default MET=5, default weight=65, duration=0.5h => 162.5 => 163
    expect(captured[0]).toMatchObject({ calories_burned: 163 });
  });

  it('throws when activity insert fails', async () => {
    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: new Error('activity insert failed') }),
          }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    await expect(
      service.createActivityLog('u1', { activity_type: 'running', duration_min: 20, calories_burned: 100 }),
    ).rejects.toThrow('activity insert failed');
  });

  it('persists exercises JSON when provided', async () => {
    const captured: Record<string, unknown>[] = [];
    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          insert: jest.fn().mockImplementation((row: Record<string, unknown>) => {
            captured.push(row);
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: { id: 'a3', ...row }, error: null }),
            };
          }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    const exercises = [ { name: 'Back Squat', sets: [ { reps: 5, weight_kg: 120 } ] } ];
    await service.createActivityLog('u1', { activity_type: 'gym', duration_min: 45, exercises } as any);

    expect(captured[0]).toMatchObject({ exercises });
  });
});

describe('LogService.syncActivityBatch', () => {
  it('imports only new entries and returns sync summary', async () => {
    const dto = {
      source: 'apple_health',
      synced_at: '2026-05-09T00:00:00Z',
      entries: [
        {
          external_id: 'a-1',
          activity_type: 'walking',
          activity_name: 'Walk',
          duration_min: 30,
          calories_burned: 120,
          logged_at: '2026-05-09T07:00:00Z',
          steps_count: 4000,
          distance_km: 3.1,
          notes: 'Morning walk',
        },
        {
          external_id: 'a-2',
          activity_type: 'running',
          activity_name: 'Run',
          duration_min: 20,
          calories_burned: 180,
          logged_at: '2026-05-09T18:00:00Z',
          steps_count: 2500,
          distance_km: 2.4,
          notes: 'Evening run',
        },
      ],
    } as any;

    let insertedRows: unknown[] = [];
    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ data: [{ external_id: 'a-1' }], error: null }),
          insert: jest.fn().mockImplementation((rows: unknown[]) => {
            insertedRows = rows;
            return Promise.resolve({ error: null });
          }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    const result = await service.syncActivityBatch('u1', dto);

    expect(insertedRows).toHaveLength(1);
    expect(result.imported_count).toBe(1);
    expect(result.skipped_count).toBe(1);
    expect(result.total_calories_burned).toBe(180);
  });

  it('returns zero import when all entries already exist', async () => {
    const dto = {
      source: 'apple_health',
      synced_at: '2026-05-09T00:00:00Z',
      entries: [
        {
          external_id: 'a-1',
          activity_type: 'walking',
          activity_name: 'Walk',
          duration_min: 30,
          calories_burned: 120,
          logged_at: '2026-05-09T07:00:00Z',
        },
      ],
    } as any;

    const insert = jest.fn();
    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ data: [{ external_id: 'a-1' }], error: null }),
          insert,
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    const result = await service.syncActivityBatch('u1', dto);

    expect(insert).not.toHaveBeenCalled();
    expect(result.imported_count).toBe(0);
    expect(result.skipped_count).toBe(1);
    expect(result.total_calories_burned).toBe(0);
  });

  it('throws when fetching existing sync rows fails', async () => {
    const dto = { source: 'apple_health', synced_at: '2026-05-09T00:00:00Z', entries: [] } as any;
    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ data: null, error: new Error('existing query failed') }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    await expect(service.syncActivityBatch('u1', dto)).rejects.toThrow('existing query failed');
  });

  it('throws when batch insert fails', async () => {
    const dto = {
      source: 'apple_health',
      synced_at: '2026-05-09T00:00:00Z',
      entries: [
        {
          external_id: 'x-1',
          activity_type: 'walking',
          activity_name: 'Walk',
          duration_min: 30,
          calories_burned: 120,
          logged_at: '2026-05-09T07:00:00Z',
        },
      ],
    } as any;

    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ data: [], error: null }),
          insert: jest.fn().mockResolvedValue({ error: new Error('sync insert failed') }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    await expect(service.syncActivityBatch('u1', dto)).rejects.toThrow('sync insert failed');
  });
});

describe('LogService.getActivityLogs', () => {
  it('returns activity logs for a day', async () => {
    const rows = [{ id: 'a1', calories_burned: 120 }];
    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: rows, error: null }),
        };
      }
      return makeChain({ data: null, error: null });
    });
    const service = new LogService(supabase);
    await expect(service.getActivityLogs('u1', '2026-05-09')).resolves.toEqual(rows);
  });

  it('throws when getActivityLogs query fails', async () => {
    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: null, error: new Error('activity query failed') }),
        };
      }
      return makeChain({ data: null, error: null });
    });
    const service = new LogService(supabase);
    await expect(service.getActivityLogs('u1', '2026-05-09')).rejects.toThrow('activity query failed');
  });

  it('applies timezone-aware range for activity query boundaries', async () => {
    const gte = jest.fn().mockReturnThis();
    const lte = jest.fn().mockReturnThis();

    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte,
          lte,
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const service = new LogService(supabase);
    await service.getActivityLogs('u1', '2026-05-10', 300);

    expect(gte).toHaveBeenCalledWith('logged_at', '2026-05-10T05:00:00.000Z');
    expect(lte).toHaveBeenCalledWith('logged_at', '2026-05-11T04:59:59.999Z');
  });
});

describe('LogService.deleteActivityLog', () => {
  it('returns success on activity log delete', async () => {
    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      }
      return makeChain({ data: null, error: null });
    });
    const service = new LogService(supabase);
    await expect(service.deleteActivityLog('a1', 'u1')).resolves.toEqual({ success: true });
  });

  it('throws when deleteActivityLog fails', async () => {
    const supabase = makeSupabase((table: string) => {
      if (table === 'activity_logs') {
        return {
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn()
            .mockReturnValueOnce({ eq: jest.fn().mockResolvedValue({ error: new Error('activity delete failed') }) }),
        };
      }
      return makeChain({ data: null, error: null });
    });
    const service = new LogService(supabase);
    await expect(service.deleteActivityLog('a1', 'u1')).rejects.toThrow('activity delete failed');
  });
});
