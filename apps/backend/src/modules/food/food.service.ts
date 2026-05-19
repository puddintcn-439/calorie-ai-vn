import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  Food,
  FoodCategory,
  FoodQualityDuplicateGroup,
  FoodQualityField,
  FoodQualityReport,
  FoodSource,
} from '@calorie-ai/types';

@Injectable()
export class FoodService {
  private readonly logger = new Logger(FoodService.name);
  private readonly qualityFields: FoodQualityField[] = [
    'calories_per_100g',
    'protein_g',
    'carbs_g',
    'fat_g',
    'fiber_g',
    'sugar_g',
    'saturated_fat_g',
    'sodium_mg',
    'serving_size_g',
    'barcode',
    'image_url',
  ];

  constructor(private supabase: SupabaseService) {}

  async search(query: string, limit = 20): Promise<Food[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 20, 100));
    const tsQuery = this.buildPrefixTsQuery(trimmedQuery);
    const resultsById = new Map<string, Food>();

    if (tsQuery) {
      const { data, error } = await this.supabase.db
        .from('foods')
        .select('*')
        .or(`name.fts.${tsQuery},name_vi.fts.${tsQuery}`)
        .order('nutrient_confidence', { ascending: false, nullsFirst: false })
        .limit(safeLimit);

      if (error) {
        this.logger.warn(`Full-text food search failed for "${trimmedQuery}": ${error.message ?? error}`);
      } else {
        for (const food of (data ?? []) as Food[]) {
          resultsById.set(food.id, food);
        }
      }
    }

    if (resultsById.size >= safeLimit) {
      return [...resultsById.values()].slice(0, safeLimit);
    }

    const { data: fallbackData, error: fallbackError } = await this.supabase.db
      .from('foods')
      .select('*')
      .or(`name.ilike.%${trimmedQuery}%,name_vi.ilike.%${trimmedQuery}%`)
      .order('nutrient_confidence', { ascending: false, nullsFirst: false })
      .limit(safeLimit);

    if (fallbackError) throw fallbackError;

    for (const food of (fallbackData ?? []) as Food[]) {
      if (!resultsById.has(food.id)) {
        resultsById.set(food.id, food);
      }
    }

    return [...resultsById.values()].slice(0, safeLimit);
  }

  async findById(id: string): Promise<Food | null> {
    const { data } = await this.supabase.db
      .from('foods')
      .select('*')
      .eq('id', id)
      .single();
    return data as Food | null;
  }

  async getQualityReport(limit = 25): Promise<FoodQualityReport> {
    const { data, error } = await this.supabase.db
      .from('foods')
      .select([
        'id',
        'name',
        'name_vi',
        'source',
        'source_id',
        'barcode',
        'image_url',
        'nutrient_confidence',
        'has_impossible_values',
        'calories_per_100g',
        'protein_g',
        'carbs_g',
        'fat_g',
        'fiber_g',
        'sugar_g',
        'saturated_fat_g',
        'sodium_mg',
        'serving_size_g',
      ].join(','))
      .limit(10_000);

    if (error) throw error;

    const rows = (data ?? []) as unknown as Food[];
    const total = rows.length;
    const threshold = 0.7;

    if (total === 0) {
      return {
        generated_at: new Date().toISOString(),
        sample_size: 0,
        low_confidence_threshold: threshold,
        quality_score: 0,
        low_confidence_count: 0,
        impossible_values_count: 0,
        source_distribution: [],
        field_coverage: this.qualityFields.map((field) => ({
          field,
          filled_count: 0,
          coverage_ratio: 0,
        })),
        top_low_confidence: [],
      };
    }

    const lowConfidenceRows = rows.filter((food) => Number(food.nutrient_confidence ?? 0) < threshold);
    const impossibleRows = rows.filter((food) => food.has_impossible_values === true);
    const sourceCounts = rows.reduce<Record<string, number>>((acc, food) => {
      const source = food.source ?? 'ai_estimated';
      acc[source] = (acc[source] ?? 0) + 1;
      return acc;
    }, {});

    const fieldCoverage = this.qualityFields.map((field) => {
      const filledCount = rows.filter((food) => this.hasValue((food as unknown as Record<string, unknown>)[field])).length;
      return {
        field,
        filled_count: filledCount,
        coverage_ratio: this.roundRatio(filledCount / total),
      };
    });

    const sourceDistribution = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({
        source: source as FoodSource,
        count,
        ratio: this.roundRatio(count / total),
      }));

    const optionalCoverage = fieldCoverage
      .filter((item) => !['calories_per_100g', 'protein_g', 'carbs_g', 'fat_g'].includes(item.field))
      .reduce((sum, item) => sum + item.coverage_ratio, 0) / 7;
    const confidenceAverage = rows.reduce((sum, food) => sum + Number(food.nutrient_confidence ?? 0), 0) / total;
    const impossiblePenalty = impossibleRows.length / total;
    const qualityScore = Math.round(Math.max(0, Math.min(1, confidenceAverage * 0.7 + optionalCoverage * 0.2 - impossiblePenalty * 0.3 + 0.1)) * 100);

    const topLowConfidence = rows
      .filter((food) => Number(food.nutrient_confidence ?? 0) < threshold || food.has_impossible_values)
      .sort((a, b) => {
        if (a.has_impossible_values !== b.has_impossible_values) {
          return a.has_impossible_values ? -1 : 1;
        }
        return Number(a.nutrient_confidence ?? 0) - Number(b.nutrient_confidence ?? 0);
      })
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((food) => ({
        id: food.id,
        name: food.name,
        name_vi: food.name_vi,
        source: food.source,
        nutrient_confidence: food.nutrient_confidence,
        has_impossible_values: food.has_impossible_values,
        missing_fields: this.qualityFields.filter((field) => !this.hasValue((food as unknown as Record<string, unknown>)[field])),
      }));

    return {
      generated_at: new Date().toISOString(),
      sample_size: total,
      low_confidence_threshold: threshold,
      quality_score: qualityScore,
      low_confidence_count: lowConfidenceRows.length,
      impossible_values_count: impossibleRows.length,
      source_distribution: sourceDistribution,
      field_coverage: fieldCoverage,
      top_low_confidence: topLowConfidence,
    };
  }

  async findPotentialDuplicates(limit = 50): Promise<FoodQualityDuplicateGroup[]> {
    const { data, error } = await this.supabase.db
      .from('foods')
      .select('id,name,name_vi,source,source_id,barcode,nutrient_confidence')
      .limit(10_000);

    if (error) throw error;

    const groups = new Map<string, Food[]>();

    for (const food of (data ?? []) as Food[]) {
      const key = this.normaliseFoodName(food.name_vi ?? food.name);
      if (key.length < 3) continue;
      const list = groups.get(key) ?? [];
      list.push(food);
      groups.set(key, list);
    }

    return [...groups.entries()]
      .filter(([, foods]) => foods.length > 1)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map(([key, foods]) => ({
        key,
        count: foods.length,
        foods: foods.map((food) => ({
          id: food.id,
          name: food.name,
          name_vi: food.name_vi,
          source: food.source,
          source_id: food.source_id,
          barcode: food.barcode,
          nutrient_confidence: food.nutrient_confidence,
        })),
      }));
  }

  async findByBarcode(barcode: string): Promise<Partial<Food>> {
    // 1. Check local DB first
    const { data: local } = await this.supabase.db
      .from('foods')
      .select('*')
      .eq('barcode', barcode)
      .maybeSingle();

    if (local) return local as Food;

    // 2. Fallback to Open Food Facts, then cache the normalized record locally.
    const url =
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
      '?fields=code,product_name,product_name_vi,brands,categories_tags,nutriments,serving_size,image_url,url';
    let resp: Response;
    try {
      resp = await fetch(url);
    } catch {
      throw new HttpException('Không thể kết nối Open Food Facts', HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (!resp.ok) {
      throw new HttpException('Không tìm thấy sản phẩm', HttpStatus.NOT_FOUND);
    }

    const json: any = await resp.json();
    if (json.status !== 1 || !json.product) {
      throw new HttpException('Không tìm thấy sản phẩm', HttpStatus.NOT_FOUND);
    }

    const p = json.product;
    const record = this.normaliseOpenFoodFactsProduct(barcode, p);

    const { data: inserted, error: insertError } = await this.supabase.db
      .from('foods')
      .insert(record)
      .select('*')
      .single();

    if (inserted && !insertError) {
      return inserted as Food;
    }

    if (insertError) {
      this.logger.warn(
        `OFF barcode fallback was not cached for ${barcode}: ${insertError.message ?? insertError}`,
      );
    }

    return record;
  }

  private normaliseOpenFoodFactsProduct(
    barcode: string,
    product: Record<string, any>,
  ): Partial<Food> {
    const n = product.nutriments ?? {};
    const calories = this.num(n['energy-kcal_100g'] ?? n['energy-kcal']);
    const record: Partial<Food> = {
      name: product.product_name ?? product.product_name_vi ?? 'Unknown product',
      name_vi: product.product_name_vi ?? product.product_name ?? 'Unknown product',
      category: this.resolveCategory(product.categories_tags ?? []),
      is_vietnamese: this.isVietnamese(product),
      calories_per_100g: calories,
      protein_g: this.num(n.proteins_100g),
      carbs_g: this.num(n.carbohydrates_100g),
      fat_g: this.num(n.fat_100g),
      fiber_g: this.numOpt(n.fiber_100g),
      sugar_g: this.numOpt(n.sugars_100g),
      saturated_fat_g: this.numOpt(n['saturated-fat_100g']),
      sodium_mg: this.numOpt(n.sodium_100g) != null
        ? Math.round(Number(n.sodium_100g) * 1000)
        : undefined,
      serving_size_g: this.parseServingSizeG(product.serving_size),
      serving_description: product.serving_size ?? undefined,
      image_url: product.image_url ?? undefined,
      source: 'openfoodfacts',
      source_id: product.code ?? barcode,
      source_url: product.url ?? `https://world.openfoodfacts.org/product/${barcode}`,
      barcode,
    };

    record.nutrient_confidence = this.computeNutrientConfidence(record);
    record.has_impossible_values = this.hasImpossibleValues(record);
    return record;
  }

  private parseServingSizeG(serving?: string): number | undefined {
    if (!serving) return undefined;
    const normalized = serving.toLowerCase().replace(',', '.');
    const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|ml|g)\b/g)];
    if (matches.length === 0) {
      const bare = Number(normalized.match(/^\s*(\d+(?:\.\d+)?)\s*$/)?.[1]);
      return Number.isFinite(bare) && bare > 0 && bare <= 2000 ? Math.round(bare * 10) / 10 : undefined;
    }

    const preferred = matches.find((m) => m[2].replace(/\s+/g, '') === 'g')
      ?? matches.find((m) => m[2] === 'ml')
      ?? matches.find((m) => m[2].replace(/\s+/g, '') === 'floz')
      ?? matches.find((m) => m[2] === 'oz')
      ?? matches[0];

    const value = Number(preferred[1]);
    const unit = preferred[2].replace(/\s+/g, '');
    if (!Number.isFinite(value) || value <= 0) return undefined;
    if (unit === 'g' || unit === 'ml') return Math.round(value * 10) / 10;
    if (unit === 'oz') return Math.round(value * 28.3495 * 10) / 10;
    if (unit === 'floz') return Math.round(value * 29.5735 * 10) / 10;
    return undefined;
  }

  private computeNutrientConfidence(food: Partial<Food>): number {
    const required = [
      food.calories_per_100g != null && food.calories_per_100g > 0,
      food.protein_g != null,
      food.carbs_g != null,
      food.fat_g != null,
    ];
    const optional = [
      food.fiber_g != null,
      food.sugar_g != null,
      food.saturated_fat_g != null,
      food.sodium_mg != null,
      food.serving_size_g != null,
      food.image_url != null,
    ];
    const requiredScore = required.filter(Boolean).length / required.length;
    const optionalScore = optional.filter(Boolean).length / optional.length;
    return Number((requiredScore * 0.75 + optionalScore * 0.25).toFixed(3));
  }

  private hasImpossibleValues(food: Partial<Food>): boolean {
    const limits: Record<string, { min: number; max: number }> = {
      calories_per_100g: { min: 0, max: 900 },
      protein_g: { min: 0, max: 100 },
      carbs_g: { min: 0, max: 100 },
      fat_g: { min: 0, max: 100 },
      fiber_g: { min: 0, max: 80 },
      sugar_g: { min: 0, max: 100 },
      saturated_fat_g: { min: 0, max: 100 },
      sodium_mg: { min: 0, max: 40000 },
    };

    for (const [field, range] of Object.entries(limits)) {
      const value = (food as Record<string, unknown>)[field];
      if (value == null) continue;
      const n = Number(value);
      if (!Number.isFinite(n) || n < range.min || n > range.max) return true;
    }

    const macroSum = (food.protein_g ?? 0) + (food.carbs_g ?? 0) + (food.fat_g ?? 0);
    const macroKcal = (food.protein_g ?? 0) * 4 + (food.carbs_g ?? 0) * 4 + (food.fat_g ?? 0) * 9;
    if (macroSum > 105) return true;
    if ((food.calories_per_100g ?? 0) > 0 && macroKcal > food.calories_per_100g! * 1.35 + 50) return true;
    return false;
  }

  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'number') return Number.isFinite(value);
    return true;
  }

  private roundRatio(value: number): number {
    return Number(Math.max(0, Math.min(1, value)).toFixed(3));
  }

  private buildPrefixTsQuery(query: string): string | null {
    const tokens = query
      .normalize('NFKC')
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ''))
      .filter(Boolean);

    if (tokens.length === 0) return null;
    return tokens.map((token) => `${token}:*`).join(' & ');
  }

  private normaliseFoodName(value?: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private resolveCategory(tags: string[]): FoodCategory {
    const tagStr = tags.join(' ').toLowerCase();
    if (/rice|com-/.test(tagStr)) return 'rice_dish';
    if (/noodle|pasta|bun-|pho|mien|ramen|udon/.test(tagStr)) return 'noodle';
    if (/meat|beef|pork|chicken|poultry/.test(tagStr)) return 'meat';
    if (/seafood|fish|shrimp|crab/.test(tagStr)) return 'seafood';
    if (/vegetable|salad|rau/.test(tagStr)) return 'vegetable';
    if (/fruit|juice/.test(tagStr)) return 'fruit';
    if (/beverage|drink|coffee|tea|milk/.test(tagStr)) return 'drink';
    if (/snack|chip|cracker|banh/.test(tagStr)) return 'snack';
    if (/dessert|sweet|candy|chocolate|cake/.test(tagStr)) return 'dessert';
    if (/fast-food|burger|pizza|sandwich/.test(tagStr)) return 'fast_food';
    return 'other';
  }

  private isVietnamese(product: Record<string, any>): boolean {
    const tags = (product.categories_tags ?? []) as string[];
    const text = `${product.product_name ?? ''} ${product.product_name_vi ?? ''} ${product.brands ?? ''}`.toLowerCase();
    return tags.some((t) => /vietnam|vi:/.test(t.toLowerCase()))
      || /vinamilk|vietnam|viet nam|phở|pho|bún|bun|bánh|banh|cơm|com/.test(text);
  }

  private num(val: unknown): number {
    const n = Number(val ?? 0);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  private numOpt(val: unknown): number | undefined {
    if (val == null || val === '') return undefined;
    const n = Number(val);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
  }
}
