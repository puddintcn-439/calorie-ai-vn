import { FoodService } from '../food.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { Logger } from '@nestjs/common';

function makeChain(resolvedValue: unknown): Record<string, jest.Mock> {
  const c: Record<string, jest.Mock> = {};
  ['from','select','eq','or','order','limit','maybeSingle','single'].forEach((m) => {
    c[m] = jest.fn().mockReturnThis();
  });
  c['limit'] = jest.fn().mockResolvedValue(resolvedValue);
  c['single'] = jest.fn().mockResolvedValue(resolvedValue);
  c['maybeSingle'] = jest.fn().mockResolvedValue(resolvedValue);
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
// search
// ─────────────────────────────────────────────────────────────────────────────
describe('FoodService.search', () => {
  it('uses full-text search first and merges ilike fallback results', async () => {
    const fullTextFoods = [
      { id: '1', name: 'Pho Bo', nutrient_confidence: 0.9 },
    ];
    const fallbackFoods = [
      { id: '1', name: 'Pho Bo', nutrient_confidence: 0.9 },
      { id: '2', name: 'Pho Ga', nutrient_confidence: 0.8 },
    ];
    const fullTextQuery = {
      select: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: fullTextFoods, error: null }),
    };
    const fallbackQuery = {
      select: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: fallbackFoods, error: null }),
    };
    const db = {
      from: jest.fn()
        .mockReturnValueOnce(fullTextQuery)
        .mockReturnValueOnce(fallbackQuery),
    };
    const supabase = { db } as unknown as SupabaseService;
    const service = new FoodService(supabase);
    const result = await service.search('pho bo');

    expect(fullTextQuery.or).toHaveBeenCalledWith('name.fts.pho:* & bo:*,name_vi.fts.pho:* & bo:*');
    expect(fallbackQuery.or).toHaveBeenCalledWith('name.ilike.%pho bo%,name_vi.ilike.%pho bo%');
    expect(result).toHaveLength(2);
    expect(result.map((food) => food.id)).toEqual(['1', '2']);
  });

  it('throws when the ilike fallback returns an error', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const fullTextQuery = {
      select: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: null, error: new Error('fts failed') }),
    };
    const fallbackQuery = {
      select: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: null, error: new Error('search failed') }),
    };
    const db = {
      from: jest.fn()
        .mockReturnValueOnce(fullTextQuery)
        .mockReturnValueOnce(fallbackQuery),
    };
    const supabase = { db } as unknown as SupabaseService;
    const service = new FoodService(supabase);
    await expect(service.search('x')).rejects.toThrow('search failed');
    warnSpy.mockRestore();
  });

  it('keeps Vietnamese letters in the full-text prefix query', async () => {
    const fullTextQuery = {
      select: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [{ id: '1', name: 'Phở bò' }], error: null }),
    };
    const db = {
      from: jest.fn().mockReturnValue(fullTextQuery),
    };
    const supabase = { db } as unknown as SupabaseService;
    const service = new FoodService(supabase);
    await service.search('phở bò!', 1);

    expect(fullTextQuery.or).toHaveBeenCalledWith('name.fts.phở:* & bò:*,name_vi.fts.phở:* & bò:*');
    expect(db.from).toHaveBeenCalledTimes(1);
  });
});

describe('FoodService.getQualityReport', () => {
  it('returns aggregate coverage and low-confidence foods', async () => {
    const foods = [
      {
        id: '1',
        name: 'Rice bowl',
        source: 'custom_vn',
        calories_per_100g: 160,
        protein_g: 4,
        carbs_g: 32,
        fat_g: 2,
        fiber_g: 2,
        sugar_g: 1,
        saturated_fat_g: 0.3,
        sodium_mg: 120,
        serving_size_g: 250,
        barcode: null,
        image_url: 'https://example.com/rice.jpg',
        nutrient_confidence: 0.95,
        has_impossible_values: false,
      },
      {
        id: '2',
        name: 'Mystery snack',
        source: 'ai_estimated',
        calories_per_100g: 1200,
        protein_g: 8,
        carbs_g: 40,
        fat_g: 20,
        fiber_g: null,
        sugar_g: null,
        saturated_fat_g: null,
        sodium_mg: null,
        serving_size_g: null,
        barcode: null,
        image_url: null,
        nutrient_confidence: 0.45,
        has_impossible_values: true,
      },
    ];

    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: foods, error: null }),
      }),
    };

    const service = new FoodService({ db } as unknown as SupabaseService);
    const report = await service.getQualityReport(10);

    expect(report.sample_size).toBe(2);
    expect(report.low_confidence_count).toBe(1);
    expect(report.impossible_values_count).toBe(1);
    expect(report.field_coverage.find((item) => item.field === 'fiber_g')).toMatchObject({
      filled_count: 1,
      coverage_ratio: 0.5,
    });
    expect(report.source_distribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'custom_vn', count: 1, ratio: 0.5 }),
        expect.objectContaining({ source: 'ai_estimated', count: 1, ratio: 0.5 }),
      ]),
    );
    expect(report.top_low_confidence[0]).toMatchObject({
      id: '2',
      missing_fields: expect.arrayContaining(['fiber_g', 'sodium_mg']),
    });
  });

  it('returns an empty report when there are no foods', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };

    const service = new FoodService({ db } as unknown as SupabaseService);
    const report = await service.getQualityReport();

    expect(report.sample_size).toBe(0);
    expect(report.quality_score).toBe(0);
    expect(report.field_coverage.every((item) => item.filled_count === 0)).toBe(true);
  });
});

describe('FoodService.findPotentialDuplicates', () => {
  it('groups foods by normalized name', async () => {
    const foods = [
      { id: '1', name: 'Pho Bo', source: 'custom_vn', nutrient_confidence: 0.9 },
      { id: '2', name: 'pho   bo', source: 'openfoodfacts', nutrient_confidence: 0.8 },
      { id: '3', name: 'Chicken salad', source: 'usda', nutrient_confidence: 0.95 },
    ];

    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: foods, error: null }),
      }),
    };

    const service = new FoodService({ db } as unknown as SupabaseService);
    const duplicates = await service.findPotentialDuplicates();

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].key).toBe('pho bo');
    expect(duplicates[0].foods.map((food) => food.id)).toEqual(['1', '2']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findById
// ─────────────────────────────────────────────────────────────────────────────
describe('FoodService.findById', () => {
  it('returns food when found', async () => {
    const food = { id: 'f1', name: 'Cơm tấm' };
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: food }),
      }),
    };
    const service = new FoodService({ db } as unknown as SupabaseService);
    const result = await service.findById('f1');
    expect(result?.name).toBe('Cơm tấm');
  });

  it('returns null when not found', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null }),
      }),
    };
    const service = new FoodService({ db } as unknown as SupabaseService);
    const result = await service.findById('missing');
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findByBarcode — local hit
// ─────────────────────────────────────────────────────────────────────────────
describe('FoodService.findByBarcode – local DB hit', () => {
  it('returns local food without calling OFF', async () => {
    const localFood = { id: 'f2', name: 'Vinamilk', barcode: '8934673000027' };
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: localFood }),
      }),
    };
    const service = new FoodService({ db } as unknown as SupabaseService);
    const result = await service.findByBarcode('8934673000027');
    expect(result).toMatchObject({ name: 'Vinamilk' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findByBarcode — OFF fallback (no local record)
// ─────────────────────────────────────────────────────────────────────────────
describe('FoodService.findByBarcode – OFF fallback', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns normalised OFF product when local is empty', async () => {
    const insertedFood = {
      id: 'cached-1',
      name: 'Test Product',
      source: 'openfoodfacts',
      calories_per_100g: 200,
      barcode: '012345',
    };
    const localQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    };
    const insertQuery = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: insertedFood, error: null }),
    };
    const db = {
      from: jest.fn()
        .mockReturnValueOnce(localQuery)
        .mockReturnValueOnce(insertQuery),
    };

    const offPayload = {
      status: 1,
      product: {
        code: '012345',
        product_name: 'Test Product',
        nutriments: {
          'energy-kcal_100g': 200,
          proteins_100g: 10,
          carbohydrates_100g: 30,
          fat_100g: 5,
          sugars_100g: 12,
          sodium_100g: 0.2,
        },
        serving_size: '1 bottle (250 ml)',
        image_url: 'https://example.com/img.jpg',
      },
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(offPayload),
    });

    const service = new FoodService({ db } as unknown as SupabaseService);
    const result = await service.findByBarcode('012345');
    expect(result.name).toBe('Test Product');
    expect(result.source).toBe('openfoodfacts');
    expect(result.calories_per_100g).toBe(200);
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        barcode: '012345',
        serving_size_g: 250,
        source_id: '012345',
      }),
    );
  });

  it('throws SERVICE_UNAVAILABLE when fetch fails', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
      }),
    };
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network error'));

    const service = new FoodService({ db } as unknown as SupabaseService);
    await expect(service.findByBarcode('000')).rejects.toMatchObject({ status: 503 });
  });

  it('throws NOT_FOUND when OFF product status !== 1', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ status: 0, product: null }),
    });

    const service = new FoodService({ db } as unknown as SupabaseService);
    await expect(service.findByBarcode('999')).rejects.toMatchObject({ status: 404 });
  });

  it('throws NOT_FOUND when HTTP response is not ok', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

    const service = new FoodService({ db } as unknown as SupabaseService);
    await expect(service.findByBarcode('404')).rejects.toMatchObject({ status: 404 });
  });
});
