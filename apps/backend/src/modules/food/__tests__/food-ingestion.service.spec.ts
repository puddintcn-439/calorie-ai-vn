import { FoodIngestionService } from '../food-ingestion.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { Food } from '@calorie-ai/types';

// ─────────────────────────────────────────────────────────────────────────────
// Supabase mock factory
// ─────────────────────────────────────────────────────────────────────────────
function makeMockDb(overrides: Record<string, unknown> = {}) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return chain;
}

function makeSupabase(dbOverrides: Record<string, unknown> = {}): SupabaseService {
  const db = makeMockDb(dbOverrides);
  return { db } as unknown as SupabaseService;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeNutrientConfidence
// ─────────────────────────────────────────────────────────────────────────────
describe('FoodIngestionService.computeNutrientConfidence', () => {
  let service: FoodIngestionService;

  beforeEach(() => {
    service = new FoodIngestionService(makeSupabase());
  });

  it('returns 0.7 when all required fields present and no optionals', () => {
    const score = service.computeNutrientConfidence({
      calories_per_100g: 100,
      protein_g: 5,
      carbs_g: 15,
      fat_g: 3,
    } as Partial<Food>);
    expect(score).toBe(0.7);
  });

  it('returns 1.0 when all required + all optional fields present', () => {
    const score = service.computeNutrientConfidence({
      calories_per_100g: 100,
      protein_g: 5,
      carbs_g: 15,
      fat_g: 3,
      fiber_g: 2,
      sugar_g: 4,
      saturated_fat_g: 1,
      sodium_mg: 200,
      serving_size_g: 150,
    } as Partial<Food>);
    expect(score).toBe(1.0);
  });

  it('returns 0.0 when no fields are present', () => {
    const score = service.computeNutrientConfidence({});
    expect(score).toBe(0.0);
  });

  it('returns 0.88 when all required + 3 of 5 optionals present', () => {
    const score = service.computeNutrientConfidence({
      calories_per_100g: 100,
      protein_g: 5,
      carbs_g: 15,
      fat_g: 3,
      fiber_g: 2,
      sugar_g: 4,
      sodium_mg: 200,
      // saturated_fat_g and serving_size_g missing
    } as Partial<Food>);
    // required: 4/4 = 1.0 * 0.7 = 0.7; optional: 3/5 = 0.6 * 0.3 = 0.18; total = 0.88
    expect(score).toBe(0.88);
  });

  it('returns 0.525 when only 3 of 4 required fields present and no optionals', () => {
    const score = service.computeNutrientConfidence({
      calories_per_100g: 100,
      protein_g: 5,
      // carbs_g missing
      fat_g: 3,
    } as Partial<Food>);
    // required: 3/4 = 0.75 * 0.7 = 0.525; optional: 0
    expect(score).toBe(0.525);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasImpossibleValues
// ─────────────────────────────────────────────────────────────────────────────
describe('FoodIngestionService.hasImpossibleValues', () => {
  let service: FoodIngestionService;

  beforeEach(() => {
    service = new FoodIngestionService(makeSupabase());
  });

  it('returns false for a normal meal', () => {
    expect(service.hasImpossibleValues({
      calories_per_100g: 350,
      protein_g: 25,
      carbs_g: 30,
      fat_g: 15,
    } as Partial<Food>)).toBe(false);
  });

  it('returns true when calories_per_100g exceeds 900', () => {
    expect(service.hasImpossibleValues({
      calories_per_100g: 950,
      protein_g: 5, carbs_g: 5, fat_g: 5,
    } as Partial<Food>)).toBe(true);
  });

  it('returns true when protein_g exceeds 100', () => {
    expect(service.hasImpossibleValues({
      calories_per_100g: 200,
      protein_g: 110, carbs_g: 5, fat_g: 5,
    } as Partial<Food>)).toBe(true);
  });

  it('returns true when macro sum exceeds 105', () => {
    expect(service.hasImpossibleValues({
      calories_per_100g: 200,
      protein_g: 40, carbs_g: 40, fat_g: 30, // sum = 110
    } as Partial<Food>)).toBe(true);
  });

  it('returns false when macro sum is exactly 100', () => {
    expect(service.hasImpossibleValues({
      calories_per_100g: 400,
      protein_g: 30, carbs_g: 40, fat_g: 30,
    } as Partial<Food>)).toBe(false);
  });

  it('returns true when sodium_mg exceeds 40000', () => {
    expect(service.hasImpossibleValues({
      calories_per_100g: 100,
      protein_g: 5, carbs_g: 5, fat_g: 5,
      sodium_mg: 45000,
    } as Partial<Food>)).toBe(true);
  });

  it('returns true when fat_g is negative', () => {
    expect(service.hasImpossibleValues({
      calories_per_100g: 100,
      protein_g: 5, carbs_g: 5, fat_g: -1,
    } as Partial<Food>)).toBe(true);
  });

  it('returns false when optional fields are null/undefined', () => {
    expect(service.hasImpossibleValues({
      calories_per_100g: 100,
      protein_g: 5, carbs_g: 5, fat_g: 5,
      fiber_g: undefined, sodium_mg: undefined,
    } as Partial<Food>)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateExistingFoods
// ─────────────────────────────────────────────────────────────────────────────
describe('FoodIngestionService.validateExistingFoods', () => {
  it('returns {processed:0, flagged:0} when no unscored records', async () => {
    const db = makeMockDb();
    // The chain terminates on .is().select().limit() but our chain is flat
    // Override: make the final awaitable return empty array
    db.is = jest.fn().mockReturnValue({
      ...db,
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    });
    const supabase = { db } as unknown as SupabaseService;
    const service = new FoodIngestionService(supabase);
    const result = await service.validateExistingFoods();
    expect(result).toEqual({ processed: 0, flagged: 0 });
  });

  it('flags records with impossible values and returns correct count', async () => {
    const records = [
      { id: 'a', calories_per_100g: 999, protein_g: 5, carbs_g: 5, fat_g: 5, name: 'A' },
      { id: 'b', calories_per_100g: 200, protein_g: 30, carbs_g: 30, fat_g: 20, name: 'B' },
    ];

    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'foods') {
          return {
            select: jest.fn().mockReturnThis(),
            is: jest.fn().mockResolvedValue({ data: records, error: null }),
            update: jest.fn().mockReturnValue(updateChain),
          };
        }
        return makeMockDb();
      }),
    };

    const supabase = { db } as unknown as SupabaseService;
    const service = new FoodIngestionService(supabase);
    const result = await service.validateExistingFoods();

    // record 'a': calories 999 > 900 → flagged; record 'b' is fine
    expect(result.processed).toBe(2);
    expect(result.flagged).toBe(1);
  });

  it('throws when supabase returns an error', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        is: jest.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
      }),
    };
    const supabase = { db } as unknown as SupabaseService;
    const service = new FoodIngestionService(supabase);
    await expect(service.validateExistingFoods()).rejects.toThrow('db error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getLowConfidenceFoods
// ─────────────────────────────────────────────────────────────────────────────
describe('FoodIngestionService.getLowConfidenceFoods', () => {
  it('returns foods below threshold', async () => {
    const mockFoods = [{ id: '1', name: 'X', nutrient_confidence: 0.5 }];
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockFoods, error: null }),
      }),
    };
    const supabase = { db } as unknown as SupabaseService;
    const service = new FoodIngestionService(supabase);
    const result = await service.getLowConfidenceFoods(0.7, 10);
    expect(result).toEqual(mockFoods);
  });

  it('throws when supabase returns an error', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: null, error: new Error('query failed') }),
      }),
    };
    const supabase = { db } as unknown as SupabaseService;
    const service = new FoodIngestionService(supabase);
    await expect(service.getLowConfidenceFoods()).rejects.toThrow('query failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ingestFromOpenFoodFacts
// ─────────────────────────────────────────────────────────────────────────────
describe('FoodIngestionService.ingestFromOpenFoodFacts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records page error and returns empty report when fetch fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as any);

    const db = {
      from: jest.fn(),
    };

    const service = new FoodIngestionService({ db } as unknown as SupabaseService);
    const result = await service.ingestFromOpenFoodFacts('pho', 1, 10);

    expect(result.fetched).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.errors[0]).toContain('OFF search HTTP 500');
  });

  it('inserts new product and updates report counters', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        products: [
          {
            code: '8931',
            product_name: 'Pho Bo Instant',
            product_name_vi: 'Pho bo',
            categories_tags: ['en:noodle'],
            nutriments: {
              'energy-kcal_100g': 410,
              proteins_100g: 8,
              carbohydrates_100g: 70,
              fat_100g: 10,
            },
            serving_size: '75',
            image_url: 'https://img.example.com/p1.jpg',
            url: 'https://world.openfoodfacts.org/product/8931',
          },
        ],
      }),
    } as any);

    const insert = jest.fn().mockResolvedValue({ data: null, error: null });
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'foods') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle,
            insert,
            update: jest.fn().mockReturnThis(),
          };
        }
        return makeMockDb();
      }),
    };

    const service = new FoodIngestionService({ db } as unknown as SupabaseService);
    const result = await service.ingestFromOpenFoodFacts('pho', 1, 10);

    expect(result.fetched).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(insert).toHaveBeenCalled();
  });

  it('skips unchanged product when hash matches existing row', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        products: [
          {
            code: '8932',
            product_name: 'Pho Ga',
            categories_tags: ['en:noodle'],
            nutriments: {
              'energy-kcal_100g': 300,
              proteins_100g: 12,
              carbohydrates_100g: 45,
              fat_100g: 6,
            },
          },
        ],
      }),
    } as any);

    const sameHash = require('crypto')
      .createHash('sha256')
      .update(JSON.stringify({ calories: 300, protein: 12, carbs: 45, fat: 6 }))
      .digest('hex');

    const maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'f1', source_data_hash: sameHash }, error: null });
    const insert = jest.fn();

    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'foods') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle,
            insert,
            update: jest.fn().mockReturnThis(),
          };
        }
        return makeMockDb();
      }),
    };

    const service = new FoodIngestionService({ db } as unknown as SupabaseService);
    const result = await service.ingestFromOpenFoodFacts('pho', 1, 10);

    expect(result.fetched).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });

  it('updates existing row when hash changed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        products: [
          {
            code: '8933',
            product_name: 'Bun Bo',
            product_name_vi: 'Bun bo',
            categories_tags: ['vi:pho'],
            nutriments: {
              'energy-kcal_100g': 360,
              proteins_100g: 14,
              carbohydrates_100g: 42,
              fat_100g: 12,
            },
          },
        ],
      }),
    } as any);

    const maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'f2', source_data_hash: 'old-hash' }, error: null });
    const update = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) });

    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'foods') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle,
            insert: jest.fn(),
            update,
          };
        }
        return makeMockDb();
      }),
    };

    const service = new FoodIngestionService({ db } as unknown as SupabaseService);
    const result = await service.ingestFromOpenFoodFacts('bun', 1, 10);

    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(0);
    expect(update).toHaveBeenCalled();
  });

  it('skips product when required identity fields are missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ products: [{ code: '', product_name: '' }] }),
    } as any);

    const db = {
      from: jest.fn().mockReturnValue(makeMockDb()),
    };

    const service = new FoodIngestionService({ db } as unknown as SupabaseService);
    const result = await service.ingestFromOpenFoodFacts('invalid', 1, 10);

    expect(result.fetched).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
  });

  it('skips product when nutrient payload is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        products: [{ code: '8934', product_name: 'Unknown nutrient', nutriments: {} }],
      }),
    } as any);

    const db = {
      from: jest.fn().mockReturnValue(makeMockDb()),
    };

    const service = new FoodIngestionService({ db } as unknown as SupabaseService);
    const result = await service.ingestFromOpenFoodFacts('unknown', 1, 10);

    expect(result.fetched).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(0);
  });
});

describe('FoodIngestionService private helpers via runtime access', () => {
  let service: FoodIngestionService;

  beforeEach(() => {
    service = new FoodIngestionService(makeSupabase());
  });

  it('maps categories for all major regex branches', () => {
    const resolver = (service as any).resolveCategory.bind(service);

    expect(resolver(['en:rice'])).toBe('rice_dish');
    expect(resolver(['en:noodle'])).toBe('noodle');
    expect(resolver(['en:beef'])).toBe('meat');
    expect(resolver(['en:fish'])).toBe('seafood');
    expect(resolver(['en:vegetable'])).toBe('vegetable');
    expect(resolver(['en:fruit'])).toBe('fruit');
    expect(resolver(['en:coffee'])).toBe('drink');
    expect(resolver(['en:snack'])).toBe('snack');
    expect(resolver(['en:dessert'])).toBe('dessert');
    expect(resolver(['en:pizza'])).toBe('fast_food');
    expect(resolver(['en:unknown-category'])).toBe('other');
  });

  it('detects vietnamese tags from known variants', () => {
    const isVietnamese = (service as any).isVietnamese.bind(service);

    expect(isVietnamese({ categories_tags: ['en:vietnam'] })).toBe(true);
    expect(isVietnamese({ categories_tags: ['vi:pho'] })).toBe(true);
    expect(isVietnamese({ categories_tags: ['en:vietnamese-foods'] })).toBe(true);
    expect(isVietnamese({ categories_tags: ['en:noodle'] })).toBe(false);
    expect(isVietnamese({})).toBe(false);
  });

  it('handles numeric conversion helpers with null and invalid values', () => {
    const num = (service as any).num.bind(service);
    const numOpt = (service as any).numOpt.bind(service);

    expect(num('10.126')).toBe(10.13);
    expect(num(undefined)).toBe(0);

    expect(numOpt('10.126')).toBe(10.13);
    expect(numOpt('')).toBeUndefined();
    expect(numOpt(undefined)).toBeUndefined();
    expect(numOpt('not-number')).toBeUndefined();
  });
});
