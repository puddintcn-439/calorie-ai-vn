import { FoodService } from '../food.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

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
  it('returns matching foods ordered by nutrient_confidence', async () => {
    const foods = [
      { id: '1', name: 'Pho Bo', nutrient_confidence: 0.9 },
      { id: '2', name: 'Pho Ga', nutrient_confidence: 0.8 },
    ];
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: foods, error: null }),
      }),
    };
    const supabase = { db } as unknown as SupabaseService;
    const service = new FoodService(supabase);
    const result = await service.search('pho');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Pho Bo');
  });

  it('throws when supabase returns an error', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: null, error: new Error('search failed') }),
      }),
    };
    const supabase = { db } as unknown as SupabaseService;
    const service = new FoodService(supabase);
    await expect(service.search('x')).rejects.toThrow('search failed');
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
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
      }),
    };

    const offPayload = {
      status: 1,
      product: {
        product_name: 'Test Product',
        nutriments: { 'energy-kcal_100g': 200, proteins_100g: 10, carbohydrates_100g: 30, fat_100g: 5 },
        serving_size: '100g',
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
