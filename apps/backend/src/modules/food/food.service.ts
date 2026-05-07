import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { Food } from '@calorie-ai/types';

@Injectable()
export class FoodService {
  constructor(private supabase: SupabaseService) {}

  async search(query: string, limit = 20): Promise<Food[]> {
    const { data, error } = await this.supabase.db
      .from('foods')
      .select('*')
      .or(`name.ilike.%${query}%,name_vi.ilike.%${query}%`)
      .limit(limit);

    if (error) throw error;
    return data as Food[];
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

    // 2. Fallback to Open Food Facts
    const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,nutriments,serving_size,image_url`;
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
    const n = p.nutriments ?? {};
    const serving = parseFloat(p.serving_size) || 100;

    return {
      name: p.product_name ?? 'Unknown',
      name_vi: p.product_name ?? 'Unknown',
      calories_per_100g: Number(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0),
      protein_g: Number(n.proteins_100g ?? 0),
      carbs_g: Number(n.carbohydrates_100g ?? 0),
      fat_g: Number(n.fat_100g ?? 0),
      fiber_g: Number(n.fiber_100g ?? 0) || undefined,
      sodium_mg: Number(n.sodium_100g ?? 0) * 1000 || undefined,
      serving_size_g: serving,
      serving_description: p.serving_size ?? '100g',
      image_url: p.image_url ?? undefined,
      source: 'openfoodfacts',
      is_vietnamese: false,
      category: 'other',
    };
  }
}
