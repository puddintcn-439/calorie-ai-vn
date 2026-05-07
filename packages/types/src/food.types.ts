export interface Food {
  id: string;
  name: string;
  name_vi?: string;           // Tên tiếng Việt
  category: FoodCategory;
  is_vietnamese: boolean;     // Flag món Việt Nam
  calories_per_100g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  serving_size_g?: number;    // Khẩu phần mặc định (gram)
  serving_description?: string; // vd: "1 tô", "1 bát"
  image_url?: string;
  source: FoodSource;
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
