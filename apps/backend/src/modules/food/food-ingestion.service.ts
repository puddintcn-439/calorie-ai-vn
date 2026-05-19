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
  sugar_g:           { min: 0, max: 100 },
  saturated_fat_g:   { min: 0, max: 100 },
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

interface USDASearchResult {
  foods?: USDAFood[];
  totalHits?: number;
}

interface USDANutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

interface USDAFood {
  fdcId: number;
  description?: string;
  foodCategory?: string;
  dataType?: string;
  foodNutrients?: USDANutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
  publishedDate?: string;
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

export type FoodIngestionBatchSource = 'openfoodfacts' | 'usda' | 'both';
export type FoodIngestionPresetScope = 'vietnamese' | 'global' | 'all';

export interface BatchIngestionReport {
  source: FoodIngestionBatchSource;
  queries: string[];
  reports: IngestionReport[];
  totals: Omit<IngestionReport, 'source' | 'query' | 'errors'> & { errors: string[] };
}

const VIETNAMESE_INGESTION_QUERIES = [
  'pho bo',
  'pho ga',
  'bun bo hue',
  'bun cha',
  'bun thit nuong',
  'bun rieu',
  'bun mam',
  'mi quang',
  'cao lau',
  'hu tieu',
  'banh mi',
  'com tam',
  'com ga hoi an',
  'com chien duong chau',
  'xoi man',
  'xoi gac',
  'banh cuon',
  'banh xeo',
  'banh khot',
  'goi cuon',
  'cha gio',
  'cha ca la vong',
  'bo luc lac',
  'ga kho gung',
  'thit kho trung',
  'ca kho to',
  'canh chua ca',
  'goi ga',
  'goi ngo sen',
  'nom bo kho',
  'lau thai',
  'lau mam',
  'chao long',
  'chao ga',
  'banh canh cua',
  'bot chien',
  'banh trang tron',
  'che ba mau',
  'che dau xanh',
  'sua chua nep cam',
];

const GLOBAL_INGESTION_QUERIES = [
  'pizza margherita',
  'pepperoni pizza',
  'cheeseburger',
  'hamburger',
  'hot dog',
  'french fries',
  'fried chicken',
  'grilled chicken breast',
  'steak',
  'caesar salad',
  'greek salad',
  'burrito',
  'taco',
  'quesadilla',
  'sushi roll',
  'salmon sashimi',
  'ramen',
  'miso soup',
  'udon',
  'pad thai',
  'thai green curry',
  'tom yum soup',
  'nasi goreng',
  'chicken biryani',
  'butter chicken',
  'chicken tikka masala',
  'dal lentil curry',
  'naan bread',
  'falafel',
  'hummus',
  'shawarma',
  'kebab',
  'spaghetti bolognese',
  'carbonara pasta',
  'lasagna',
  'risotto',
  'paella',
  'fish and chips',
  'shepherds pie',
  'beef stroganoff',
  'goulash',
  'pierogi',
  'poutine',
  'clam chowder',
  'lobster roll',
  'poke bowl',
  'bibimbap',
  'kimchi fried rice',
  'bulgogi',
  'japchae',
  'mapo tofu',
  'kung pao chicken',
  'sweet and sour pork',
  'dim sum dumplings',
  'peking duck',
  'chicken congee',
  'gyoza',
  'tortilla soup',
  'chili con carne',
  'beef rendang',
];

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

  async ingestFromUSDA(
    query: string,
    maxPages = 2,
    pageSize = 50,
  ): Promise<IngestionReport> {
    const report: IngestionReport = {
      source: 'usda',
      query,
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      flagged_impossible: 0,
      errors: [],
    };

    for (let page = 1; page <= maxPages; page++) {
      let foods: USDAFood[];
      try {
        foods = await this.fetchUSDAPage(query, page, pageSize);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        report.errors.push(`Page ${page}: ${msg}`);
        break;
      }

      if (foods.length === 0) break;
      report.fetched += foods.length;

      for (const food of foods) {
        try {
          await this.upsertUSDAFood(food, report);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          report.errors.push(`food ${food.fdcId}: ${msg}`);
        }
      }
    }

    this.logger.log(
      `USDA ingest "${query}": fetched=${report.fetched} inserted=${report.inserted} updated=${report.updated} skipped=${report.skipped}`,
    );
    return report;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public: validate + re-score existing food records (batch repair pass)
  // ──────────────────────────────────────────────────────────────────────────
  async ingestBatch(
    queries: string[],
    source: FoodIngestionBatchSource = 'both',
    maxPages = 1,
  ): Promise<BatchIngestionReport> {
    const normalizedQueries = [...new Set(
      queries
        .map((query) => query.trim())
        .filter(Boolean),
    )].slice(0, 100);

    const reports: IngestionReport[] = [];

    for (const query of normalizedQueries) {
      if (source === 'usda' || source === 'both') {
        reports.push(await this.ingestFromUSDA(query, maxPages));
      }
      if (source === 'openfoodfacts' || source === 'both') {
        reports.push(await this.ingestFromOpenFoodFacts(query, maxPages));
      }
    }

    return {
      source,
      queries: normalizedQueries,
      reports,
      totals: this.summarizeReports(reports),
    };
  }

  async ingestPresetCatalog(
    scope: FoodIngestionPresetScope = 'all',
    source: FoodIngestionBatchSource = 'both',
    maxPages = 1,
  ): Promise<BatchIngestionReport> {
    const queries = [
      ...(scope === 'vietnamese' || scope === 'all' ? VIETNAMESE_INGESTION_QUERIES : []),
      ...(scope === 'global' || scope === 'all' ? GLOBAL_INGESTION_QUERIES : []),
    ];

    return this.ingestBatch(queries, source, maxPages);
  }

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

  private async fetchUSDAPage(
    query: string,
    page: number,
    pageSize: number,
  ): Promise<USDAFood[]> {
    const apiKey = process.env.USDA_API_KEY ?? 'DEMO_KEY';
    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('query', query);
    url.searchParams.set('pageNumber', String(page));
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('dataType', ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'].join(','));

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'CalorieAIVN/1.0 (https://github.com/calorie-ai-vn; contact@calorie-ai.vn)' },
    });

    if (!resp.ok) {
      throw new Error(`USDA search HTTP ${resp.status}`);
    }

    const json = (await resp.json()) as USDASearchResult;
    return json.foods ?? [];
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

    const servingSizeG = this.parseServingSizeGrams(product.serving_size);

    const rawHash = createHash('sha256')
      .update(JSON.stringify({
        calories,
        protein,
        carbs,
        fat,
        fiber: this.numOpt(n['fiber_100g']),
        sugar: this.numOpt(n['sugars_100g']),
        saturatedFat: this.numOpt(n['saturated-fat_100g']),
        sodium: this.numOpt(n['sodium_100g']),
        servingSizeG,
        servingDescription: product.serving_size,
      }))
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
      sugar_g: this.numOpt(n['sugars_100g']),
      saturated_fat_g: this.numOpt(n['saturated-fat_100g']),
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
      sugar_g: partial.sugar_g,
      saturated_fat_g: partial.saturated_fat_g,
      sodium_mg: partial.sodium_mg,
      serving_size_g: servingSizeG,
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

  private async upsertUSDAFood(
    food: USDAFood,
    report: IngestionReport,
  ): Promise<void> {
    if (!food.fdcId || !food.description) {
      report.skipped++;
      return;
    }

    const nutrients = food.foodNutrients ?? [];
    const partial: Partial<Food> = {
      calories_per_100g: this.getUSDANutrient(nutrients, ['1008'], ['energy']),
      protein_g: this.getUSDANutrient(nutrients, ['1003'], ['protein']),
      carbs_g: this.getUSDANutrient(nutrients, ['1005'], ['carbohydrate']),
      fat_g: this.getUSDANutrient(nutrients, ['1004'], ['total lipid', 'total fat']),
      fiber_g: this.getUSDANutrientOpt(nutrients, ['1079'], ['fiber']),
      sugar_g: this.getUSDANutrientOpt(nutrients, ['2000'], ['sugars', 'sugar']),
      saturated_fat_g: this.getUSDANutrientOpt(nutrients, ['1258'], ['saturated']),
      sodium_mg: this.getUSDANutrientOpt(nutrients, ['1093'], ['sodium']),
      serving_size_g: this.normaliseServingSize(food.servingSize, food.servingSizeUnit),
    };

    if (
      (partial.calories_per_100g ?? 0) === 0
      && (partial.protein_g ?? 0) === 0
      && (partial.carbs_g ?? 0) === 0
      && (partial.fat_g ?? 0) === 0
    ) {
      report.skipped++;
      return;
    }

    const rawHash = createHash('sha256')
      .update(JSON.stringify({
        description: food.description,
        foodCategory: food.foodCategory,
        dataType: food.dataType,
        calories: partial.calories_per_100g,
        protein: partial.protein_g,
        carbs: partial.carbs_g,
        fat: partial.fat_g,
        fiber: partial.fiber_g,
        sugar: partial.sugar_g,
        saturatedFat: partial.saturated_fat_g,
        sodium: partial.sodium_mg,
        servingSize: partial.serving_size_g,
      }))
      .digest('hex');

    const { data: existing } = await this.supabase.db
      .from('foods')
      .select('id,source_data_hash')
      .eq('source', 'usda')
      .eq('source_id', String(food.fdcId))
      .maybeSingle();

    if (existing && existing.source_data_hash === rawHash) {
      report.skipped++;
      return;
    }

    const impossible = this.hasImpossibleValues(partial);
    const confidence = this.computeNutrientConfidence(partial);
    if (impossible) report.flagged_impossible++;

    const record: NormalisedFood = {
      name: this.toTitleCase(food.description),
      name_vi: this.toTitleCase(food.description),
      category: this.resolveCategory([food.foodCategory ?? '', food.description ?? '']),
      is_vietnamese: false,
      calories_per_100g: partial.calories_per_100g ?? 0,
      protein_g: partial.protein_g ?? 0,
      carbs_g: partial.carbs_g ?? 0,
      fat_g: partial.fat_g ?? 0,
      fiber_g: partial.fiber_g,
      sugar_g: partial.sugar_g,
      saturated_fat_g: partial.saturated_fat_g,
      sodium_mg: partial.sodium_mg,
      serving_size_g: partial.serving_size_g,
      serving_description: partial.serving_size_g ? `${partial.serving_size_g} g` : undefined,
      image_url: undefined,
      source: 'usda',
      source_id: String(food.fdcId),
      source_url: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdcId}/nutrients`,
      source_data_hash: rawHash,
      nutrient_confidence: confidence,
      is_validated: food.dataType === 'Foundation' || food.dataType === 'SR Legacy',
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
  private summarizeReports(reports: IngestionReport[]): BatchIngestionReport['totals'] {
    return reports.reduce<BatchIngestionReport['totals']>(
      (acc, report) => ({
        fetched: acc.fetched + report.fetched,
        inserted: acc.inserted + report.inserted,
        updated: acc.updated + report.updated,
        skipped: acc.skipped + report.skipped,
        flagged_impossible: acc.flagged_impossible + report.flagged_impossible,
        errors: [
          ...acc.errors,
          ...report.errors.map((error) => `${report.source}:${report.query}: ${error}`),
        ],
      }),
      {
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        flagged_impossible: 0,
        errors: [],
      },
    );
  }

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
      food.saturated_fat_g != null,
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

  private getUSDANutrient(nutrients: USDANutrient[], nutrientNumbers: string[], names: string[]): number {
    return this.getUSDANutrientOpt(nutrients, nutrientNumbers, names) ?? 0;
  }

  private getUSDANutrientOpt(nutrients: USDANutrient[], nutrientNumbers: string[], names: string[]): number | undefined {
    const nutrient = nutrients.find((item) => {
      const number = String(item.nutrientNumber ?? item.nutrientId ?? '');
      const name = String(item.nutrientName ?? '').toLowerCase();
      return nutrientNumbers.includes(number) || names.some((candidate) => name.includes(candidate));
    });

    if (!nutrient) return undefined;
    const value = this.numOpt(nutrient.value);
    return value;
  }

  private parseServingSizeGrams(value?: string): number | undefined {
    if (!value) return undefined;

    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/(\d),(\d)/g, '$1.$2');

    const bareNumber = Number(normalized);
    if (Number.isFinite(bareNumber) && bareNumber > 0) {
      return Math.round(bareNumber * 10) / 10;
    }

    const matches = Array.from(
      normalized.matchAll(
        /(\d+(?:\.\d+)?)\s*(fl\s*oz|fluid\s*ounces?|kilograms?|kg|grams?|g|milligrams?|mg|milliliters?|millilitres?|ml|liters?|litres?|l|ounces?|oz)\b/g,
      ),
    ).map((match) => ({
      amount: Number(match[1]),
      unit: match[2].replace(/\s+/g, ' '),
    })).filter((match) => Number.isFinite(match.amount) && match.amount > 0);

    const mass = matches.find((match) => (
      ['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'mg', 'milligram', 'milligrams', 'oz', 'ounce', 'ounces']
        .includes(match.unit)
    ));
    if (mass) return this.convertServingUnitToGrams(mass.amount, mass.unit);

    const volume = matches.find((match) => (
      ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'l', 'liter', 'liters', 'litre', 'litres', 'fl oz', 'fluid ounce', 'fluid ounces']
        .includes(match.unit)
    ));
    if (volume) return this.convertServingUnitToGrams(volume.amount, volume.unit);

    return undefined;
  }

  private convertServingUnitToGrams(amount: number, unit: string): number | undefined {
    let grams: number | undefined;
    if (unit === 'g' || unit === 'gram' || unit === 'grams') grams = amount;
    if (unit === 'kg' || unit === 'kilogram' || unit === 'kilograms') grams = amount * 1000;
    if (unit === 'mg' || unit === 'milligram' || unit === 'milligrams') grams = amount / 1000;
    if (unit === 'ml' || unit === 'milliliter' || unit === 'milliliters' || unit === 'millilitre' || unit === 'millilitres') grams = amount;
    if (unit === 'l' || unit === 'liter' || unit === 'liters' || unit === 'litre' || unit === 'litres') grams = amount * 1000;
    if (unit === 'oz' || unit === 'ounce' || unit === 'ounces') grams = amount * 28.3495;
    if (unit === 'fl oz' || unit === 'fluid ounce' || unit === 'fluid ounces') grams = amount * 29.5735;
    if (grams === undefined || grams <= 0) return undefined;
    return Math.round(grams * 10) / 10;
  }

  private normaliseServingSize(value?: number, unit?: string): number | undefined {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) return undefined;

    const normalizedUnit = String(unit ?? 'g').toLowerCase();
    if (normalizedUnit === 'g' || normalizedUnit === 'gram' || normalizedUnit === 'grams') {
      return Math.round(size * 10) / 10;
    }
    if (normalizedUnit === 'ml' || normalizedUnit === 'milliliter' || normalizedUnit === 'milliliters') {
      return Math.round(size * 10) / 10;
    }
    if (normalizedUnit === 'oz' || normalizedUnit === 'ounce' || normalizedUnit === 'ounces') {
      return Math.round(size * 28.3495 * 10) / 10;
    }
    return undefined;
  }

  private toTitleCase(value: string): string {
    return value
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
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
