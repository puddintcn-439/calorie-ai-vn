-- ==========================================
-- FOODS TABLE
-- ==========================================
create table if not exists public.foods (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,
  name_vi               text,
  category              text not null check (category in (
                          'rice_dish','noodle','meat','seafood','vegetable',
                          'fruit','drink','snack','dessert','fast_food','other'
                        )),
  is_vietnamese         boolean not null default false,
  calories_per_100g     numeric(7,2) not null,
  protein_g             numeric(6,2) not null default 0,
  carbs_g               numeric(6,2) not null default 0,
  fat_g                 numeric(6,2) not null default 0,
  fiber_g               numeric(6,2),
  sugar_g               numeric(6,2),
  sodium_mg             numeric(7,1),
  serving_size_g        numeric(6,1),
  serving_description   text,
  image_url             text,
  source                text not null check (source in ('usda','openfoodfacts','custom_vn','ai_estimated')),
  created_at            timestamptz not null default now()
);

-- Index for search
create index if not exists foods_name_search_idx on public.foods using gin (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(name_vi,''))
);
create index if not exists foods_is_vietnamese_idx on public.foods(is_vietnamese);
create index if not exists foods_category_idx on public.foods(category);

-- RLS: public read
alter table public.foods enable row level security;

drop policy if exists "Anyone can read foods" on public.foods;
create policy "Anyone can read foods" on public.foods for select using (true);

drop policy if exists "Service role manages foods" on public.foods;
create policy "Service role manages foods" on public.foods for all using (auth.role() = 'service_role');

-- ==========================================
-- SEED: Popular Vietnamese foods
-- ==========================================
insert into public.foods (name, name_vi, category, is_vietnamese, calories_per_100g, protein_g, carbs_g, fat_g, serving_size_g, serving_description, source) values
  ('Pho Bo',             'Phở bò',           'noodle',    true, 90,  6.5, 12.0, 2.5, 500, '1 tô',   'custom_vn'),
  ('Bun Bo Hue',         'Bún bò Huế',        'noodle',    true, 95,  7.0, 13.0, 2.8, 500, '1 tô',   'custom_vn'),
  ('Com Tam Suon',       'Cơm tấm sườn',      'rice_dish', true, 155, 7.0, 18.8, 5.5, 400, '1 dĩa',  'custom_vn'),
  ('Bun Dau Mam Tom',    'Bún đậu mắm tôm',   'noodle',    true, 130, 6.0, 16.0, 5.0, 300, '1 phần', 'custom_vn'),
  ('Banh Mi Thit',       'Bánh mì thịt',      'snack',     true, 280, 12.0, 34.0, 10.0, 150, '1 ổ',  'custom_vn'),
  ('Goi Cuon',           'Gỏi cuốn',          'snack',     true, 80,  4.0, 12.0, 1.5, 100, '2 cuốn', 'custom_vn'),
  ('Hu Tieu Nam Vang',   'Hủ tiếu Nam Vang',  'noodle',    true, 92,  6.0, 13.0, 2.2, 500, '1 tô',   'custom_vn'),
  ('Ca Phe Sua Da',      'Cà phê sữa đá',     'drink',     true, 75,  1.5, 12.0, 2.5, 200, '1 ly',   'custom_vn'),
  ('Tra Sua Tran Chau',  'Trà sữa trân châu', 'drink',     true, 130, 2.0, 25.0, 3.0, 500, '1 ly lớn','custom_vn'),
  ('Xoi Xeo',            'Xôi xéo',           'rice_dish', true, 200, 5.0, 38.0, 4.0, 300, '1 gói',  'custom_vn')
on conflict do nothing;
