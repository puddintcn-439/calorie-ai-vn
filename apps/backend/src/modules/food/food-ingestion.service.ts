import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { Food, FoodCategory } from '@calorie-ai/types';

// ─────────────────────────────────────────────────────────────────────────────
// Nutrient sanity limits per 100 g
// ─────────────────────────────────────────────────────────────────────────────
const NUTRIENT_LIMITS = {
  calories_per_100g: { min: 0, max: 900 },   // pure fat ≈ 884 kcal/100g
  protein_g:         { min: 0, max: 100 },
  carbs_g:           { min: 0, max: 100 },
  fat_g:             { min: 0, max: 100 },
  fiber_g:           { min: 0, max: 80 },
  sodium_mg:         { min: 0, max: 40_000 }, // salt = 39,000 mg/100g
};

type NormalisedFood = Omit<Food, 'id' | 'created_at'>;

// ─────────────────────────────────────────────────────────────────────────────
// Open Food Facts product shape (partial)
// ─────────────────────────────────────────────────────────────────────────────
interface OFFSearchResult {
  products: OFFProduct[];
  count: number;
  page_count: number;
}

interface OFFProduct {
  code: string;
  product_name?: string;
  product_name_vi?: string;
  brands?: string;
  categories_tags?: string[];
  nutriments?: Record<string, number | string>;
  serving_size?: string;
  image_url?: string;
  url?: string;
}

export interface IngestionReport {
  source: string;
  query: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  flagged_impossible: number;
  errors: string[];
}

@Injectable()
export class FoodIngestionService {
  private readonly logger = new Logger(FoodIngestionService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Public: ingest from Open Food Facts by search query
  // ──────────────────────────────────────────────────────────────────────────
  async ingestFromOpenFoodFacts(
    query: string,
    maxPages = 3,
    pageSize = 50,
  ): Promise<IngestionReport> {
    const report: IngestionReport = {
      source: 'openfoodfacts',
      query,
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      flagged_impossible: 0,
      errors: [],
    };

    for (let page = 1; page <= maxPages; page++) {
      let products: OFFProduct[];
      try {
        products = await this.fetchOFFPage(query, page, pageSize);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        report.errors.push(`Page ${page}: ${msg}`);
        break;
      }

      if (products.length === 0) break;
      report.fetched += products.length;

      for (const product of products) {
        try {
          await this.upsertOFFProduct(product, report);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          report.errors.push(`product ${product.code}: ${msg}`);
        }
      }
    }

    this.logger.log(
      `OFF ingest "${query}": fetched=${report.fetched} inserted=${report.inserted} updated=${report.updated} skipped=${report.skipped}`,
    );
    return report;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public: validate + re-score existing food records (batch repair pass)
  // ──────────────────────────────────────────────────────────────────────────
  async validateExistingFoods(): Promise<{ processed: number; flagged: number }> {
    const { data, error } = await this.supabase.db
      .from('foods')
      .select('id,calories_per_100g,protein_g,carbs_g,fat_g,fiber_g,sodium_mg,source_id,name')
      .is('nutrient_confidence', null);

    if (error) throw error;
    if (!data?.length) return { processed: 0, flagged: 0 };

    let flagged = 0;
    for (const row of data) {
      const impossible = this.hasImpossibleValues(row as Partial<Food>);
      const confidence = this.computeNutrientConfidence(row as Partial<Food>);
      if (impossible) flagged++;
      await this.supabase.db
        .from('foods')
        .update({ nutrient_confidence: confidence, has_impossible_values: impossible })
        .eq('id', row.id as string);
    }

    this.logger.log(`Validated ${data.length} foods, flagged ${flagged}`);
    return { processed: data.length, flagged };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────
  private async fetchOFFPage(
    query: string,
    page: number,
    pageSize: number,
  ): Promise<OFFProduct[]> {
    const url =
      `https://world.openfoodfacts.org/cgi/search.pl` +
      `?search_terms=${encodeURIComponent(query)}` +
      `&action=process&json=1&page=${page}&page_size=${pageSize}` +
      `&fields=code,product_name,product_name_vi,brands,categories_tags,nutriments,serving_size,image_url,url`;

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'CalorieAIVN/1.0 (https://github.com/calorie-ai-vn; contact@calorie-ai.vn)' },
    });

    if (!resp.ok) {
      throw new Error(`OFF search HTTP ${resp.status}`);
    }

    const json = (await resp.json()) as OFFSearchResult;
    return json.products ?? [];
  }

  private async upsertOFFProduct(
    product: OFFProduct,
    report: IngestionReport,
  ): Promise<void> {
    if (!product.code || !product.product_name) {
      report.skipped++;
      return;
    }

    const n = product.nutriments ?? {};
    const calories = this.num(n['energy-kcal_100g'] ?? n['energy-kcal_serving']);
    const protein = this.num(n['proteins_100g']);
    const carbs = this.num(n['carbohydrates_100g']);
    const fat = this.num(n['fat_100g']);

    if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
      report.skipped++;
      return; // no nutrient data — skip entirely
    }

    const rawHash = createHash('sha256')
      .update(JSON.stringify({ calories, protein, carbs, fat }))
      .digest('hex');

    // Skip if hash unchanged (no nutrient delta)
    const { data: existing } = await this.supabase.db
      .from('foods')
      .select('id,source_data_hash')
      .eq('source', 'openfoodfacts')
      .eq('source_id', product.code)
      .maybeSingle();

    if (existing && existing.source_data_hash === rawHash) {
      report.skipped++;
      return;
    }

    const partial: Partial<Food> = {
      calories_per_100g: calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      fiber_g: this.numOpt(n['fiber_100g']),
      sodium_mg: this.numOpt(n['sodium_100g']) !== undefined
        ? (this.numOpt(n['sodium_100g'])! * 1000)
        : undefined,
    };

    const impossible = this.hasImpossibleValues(partial);
    const confidence = this.computeNutrientConfidence(partial);
    if (impossible) report.flagged_impossible++;

    const record: NormalisedFood = {
      name: product.product_name,
      name_vi: product.product_name_vi || product.product_name,
      category: this.resolveCategory(product.categories_tags ?? []),
      is_vietnamese: this.isVietnamese(product),
      calories_per_100g: calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      fiber_g: partial.fiber_g,
      sodium_mg: partial.sodium_mg,
      serving_size_g: product.serving_size ? parseFloat(product.serving_size) || undefined : undefined,
      serving_description: product.serving_size ?? undefined,
      image_url: product.image_url ?? undefined,
      source: 'openfoodfacts',
      source_id: product.code,
      source_url: product.url ?? `https://world.openfoodfacts.org/product/${product.code}`,
      source_data_hash: rawHash,
      nutrient_confidence: confidence,
      is_validated: false,
      has_impossible_values: impossible,
      last_synced_at: new Date().toISOString(),
    };

    if (existing) {
      await this.supabase.db
        .from('foods')
        .update(record)
        .eq('id', existing.id as string);
      report.updated++;
    } else {
      await this.supabase.db.from('foods').insert(record);
      report.inserted++;
    }
  }

  async getLowConfidenceFoods(
    threshold = 0.7,
    limit = 50,
  ): Promise<Partial<Food>[]> {
    const { data, error } = await this.supabase.db
      .from('foods')
      .select('id,name,name_vi,source,source_id,nutrient_confidence,has_impossible_values')
      .lt('nutrient_confidence', threshold)
      .order('nutrient_confidence', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as Partial<Food>[];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Nutrient confidence (0–1): reward filled optional fields
  // ──────────────────────────────────────────────────────────────────────────
  computeNutrientConfidence(food: Partial<Food>): number {
    const required = [
      food.calories_per_100g != null,
      food.protein_g != null,
      food.carbs_g != null,
      food.fat_g != null,
    ];
    const optional = [
      food.fiber_g != null,
      food.sugar_g != null,
      food.sodium_mg != null,
      food.serving_size_g != null,
    ];
    const requiredScore = required.filter(Boolean).length / required.length;
    const optionalScore = optional.filter(Boolean).length / optional.length;
    return Number((requiredScore * 0.7 + optionalScore * 0.3).toFixed(3));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Impossible value detection
  // ──────────────────────────────────────────────────────────────────────────
  hasImpossibleValues(food: Partial<Food>): boolean {
    for (const [field, limits] of Object.entries(NUTRIENT_LIMITS)) {
      const val = (food as Record<string, unknown>)[field];
      if (val == null) continue;
      const n = Number(val);
      if (n < limits.min || n > limits.max) return true;
    }
    // Macro sanity: protein + carbs + fat > 100 g is physically impossible
    const macroSum = (food.protein_g ?? 0) + (food.carbs_g ?? 0) + (food.fat_g ?? 0);
    if (macroSum > 105) return true; // +5 g rounding tolerance
    return false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Category resolution from OFF categories_tags
  // ──────────────────────────────────────────────────────────────────────────
  private resolveCategory(tags: string[]): FoodCategory {
    const tagStr = tags.join(' ').toLowerCase();
    if (/rice|com-/.test(tagStr)) return 'rice_dish';
    if (/noodle|pasta|bun-|pho|mien/.test(tagStr)) return 'noodle';
    if (/meat|beef|pork|chicken|poultry/.test(tagStr)) return 'meat';
    if (/seafood|fish|shrimp|crab/.test(tagStr)) return 'seafood';
    if (/vegetable|rau|salad/.test(tagStr)) return 'vegetable';
    if (/fruit|trai-cay|juice/.test(tagStr)) return 'fruit';
    if (/beverage|drink|ca-phe|coffee|tea|milk/.test(tagStr)) return 'drink';
    if (/snack|chip|banh/.test(tagStr)) return 'snack';
    if (/dessert|sweet|candy|chocolate/.test(tagStr)) return 'dessert';
    if (/fast-food|burger|pizza/.test(tagStr)) return 'fast_food';
    return 'other';
  }

  private isVietnamese(product: OFFProduct): boolean {
    const viTags = ['en:vietnam', 'vi:', 'vietnamese'];
    return (product.categories_tags ?? []).some((t) =>
      viTags.some((vt) => t.toLowerCase().includes(vt)),
    );
  }

  private num(val: unknown): number {
    return Math.round(Number(val ?? 0) * 100) / 100;
  }

  private numOpt(val: unknown): number | undefined {
    if (val == null || val === '') return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : Math.round(n * 100) / 100;
  }
}
