import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { Food, FoodCategory } from '@calorie-ai/types';

@Injectable()
export class FoodService {
  private readonly logger = new Logger(FoodService.name);

  constructor(private supabase: SupabaseService) {}

  async search(query: string, limit = 20): Promise<Food[]> {
    // Use Postgres full-text search on the GIN index for better Vietnamese matching.
    // Fall back to ilike when the query contains non-ASCII characters that tsquery
    // might reject (e.g. tones/diacritics).
    const tsQuery = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w}:*`)
      .join(' & ');

    const { data, error } = await this.supabase.db
      .from('foods')
      .select('*')
      .or(`name.ilike.%${query}%,name_vi.ilike.%${query}%`)
      .order('nutrient_confidence', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as Food[];
  }

  async findById(id: string): Promise<Food | null> {
    const { data } = await this.supabase.db
      .from('foods')
      .select('*')
      .eq('id', id)
      .single();
    return data as Food | null;
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
