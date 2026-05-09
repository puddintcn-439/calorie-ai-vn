export interface Food {
  id: string;
  name: string;
  name_vi?: string;
  category: FoodCategory;
  is_vietnamese: boolean;
  calories_per_100g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  serving_size_g?: number;
  serving_description?: string;
  image_url?: string;
  barcode?: string;
  source: FoodSource;
  /** External ID in the source system (OFF product code, USDA fdc_id) */
  source_id?: string;
  /** Canonical URL of the source record */
  source_url?: string;
  /** SHA-256 of raw nutrient payload — used for delta sync dedup */
  source_data_hash?: string;
  /** 0–1 completeness score based on filled nutrient fields */
  nutrient_confidence?: number;
  is_validated: boolean;
  has_impossible_values: boolean;
  last_synced_at?: string;
  created_at: string;
}

export type FoodCategory =
  | 'rice_dish'       // Cơm
  | 'noodle'          // Bún, phở, mì
  | 'meat'            // Thịt
  | 'seafood'         // Hải sản
  | 'vegetable'       // Rau củ
  | 'fruit'           // Trái cây
  | 'drink'           // Đồ uống
  | 'snack'           // Đồ ăn vặt
  | 'dessert'         // Tráng miệng
  | 'fast_food'       // Đồ ăn nhanh
  | 'other';

export type FoodSource = 'usda' | 'openfoodfacts' | 'custom_vn' | 'ai_estimated';

export interface FoodSearchResult {
  foods: Food[];
  total: number;
  query: string;
}
