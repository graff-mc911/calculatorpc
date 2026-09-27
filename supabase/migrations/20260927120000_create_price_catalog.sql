/*
  # Price catalog (curated works / materials / suppliers)

  Public read catalog for field workers. No scrapers — curated seed only.
  Client ships the same seed in src/data/priceCatalogSeed.ts as bootstrap
  until this migration is applied in Supabase.

  Countries: DE, UA, ES
  Categories: tiling, plaster, paint, drywall, masonry, concrete, flooring,
    plumbing, electrical, roofing, insulation, facade, demolition,
    doors_windows, outdoor, other
*/

-- Countries
CREATE TABLE IF NOT EXISTS price_countries (
  code text PRIMARY KEY,
  name text NOT NULL,
  currency text NOT NULL,
  locale text NOT NULL DEFAULT 'en-US'
);

-- Works (jobs)
CREATE TABLE IF NOT EXISTS works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  category text NOT NULL,
  unit text NOT NULL DEFAULT 'm2',
  name_en text NOT NULL,
  name_uk text,
  name_de text,
  name_es text,
  search_aliases text[] NOT NULL DEFAULT '{}',
  youtube_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  country_code text NOT NULL REFERENCES price_countries(code) ON DELETE CASCADE,
  labor_price numeric NOT NULL,
  labor_currency text NOT NULL,
  price_min numeric,
  price_max numeric,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  source text DEFAULT 'curated',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, country_code, valid_from)
);

CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name_en text NOT NULL,
  name_uk text,
  name_de text,
  name_es text,
  unit text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_materials (
  work_id uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  qty_per_unit numeric NOT NULL DEFAULT 1,
  notes text,
  PRIMARY KEY (work_id, material_id)
);

CREATE TABLE IF NOT EXISTS material_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  country_code text NOT NULL REFERENCES price_countries(code) ON DELETE CASCADE,
  price numeric NOT NULL,
  currency text NOT NULL,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  source text DEFAULT 'curated',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (material_id, country_code, valid_from)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  country_code text NOT NULL REFERENCES price_countries(code) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_suppliers (
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_url text,
  sku text,
  PRIMARY KEY (material_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_works_aliases ON works USING gin (search_aliases);
CREATE INDEX IF NOT EXISTS idx_work_prices_country ON work_prices (country_code);
CREATE INDEX IF NOT EXISTS idx_material_prices_country ON material_prices (country_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_country ON suppliers (country_code);

ALTER TABLE price_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_suppliers ENABLE ROW LEVEL SECURITY;

-- Public read for authenticated + anon (catalog is non-personal curated data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'price_countries' AND policyname = 'price_countries_select'
  ) THEN
    CREATE POLICY price_countries_select ON price_countries FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'works' AND policyname = 'works_select'
  ) THEN
    CREATE POLICY works_select ON works FOR SELECT TO anon, authenticated USING (is_active = true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'work_prices' AND policyname = 'work_prices_select'
  ) THEN
    CREATE POLICY work_prices_select ON work_prices FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'materials' AND policyname = 'materials_select'
  ) THEN
    CREATE POLICY materials_select ON materials FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'work_materials' AND policyname = 'work_materials_select'
  ) THEN
    CREATE POLICY work_materials_select ON work_materials FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'material_prices' AND policyname = 'material_prices_select'
  ) THEN
    CREATE POLICY material_prices_select ON material_prices FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'suppliers_select'
  ) THEN
    CREATE POLICY suppliers_select ON suppliers FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'material_suppliers' AND policyname = 'material_suppliers_select'
  ) THEN
    CREATE POLICY material_suppliers_select ON material_suppliers FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- Seed countries
INSERT INTO price_countries (code, name, currency, locale) VALUES
  ('DE', 'Germany', 'EUR', 'de-DE'),
  ('UA', 'Ukraine', 'UAH', 'uk-UA'),
  ('ES', 'Spain', 'EUR', 'es-ES')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  currency = EXCLUDED.currency,
  locale = EXCLUDED.locale;

-- Seed suppliers (stable slugs)
INSERT INTO suppliers (id, slug, country_code, name, url) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'de-hornbach', 'DE', 'Hornbach', 'https://www.hornbach.de/'),
  ('a1000000-0000-4000-8000-000000000002', 'de-obi', 'DE', 'OBI', 'https://www.obi.de/'),
  ('a1000000-0000-4000-8000-000000000003', 'ua-epicentr', 'UA', 'Епіцентр', 'https://epicentrk.ua/'),
  ('a1000000-0000-4000-8000-000000000004', 'ua-leroy', 'UA', 'Leroy Merlin UA', 'https://leroymerlin.ua/'),
  ('a1000000-0000-4000-8000-000000000005', 'es-leroy', 'ES', 'Leroy Merlin', 'https://www.leroymerlin.es/'),
  ('a1000000-0000-4000-8000-000000000006', 'es-bauhaus', 'ES', 'Bauhaus', 'https://www.bauhaus.es/')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  country_code = EXCLUDED.country_code;

-- Note: Full works/materials/BOM/YouTube seed lives in the app bootstrap
-- (src/data/priceCatalogSeed.ts — ~110 works, ~50 materials, DE/UA/ES,
-- every work has ≥1 curated YouTube how-to).
-- Import into these tables via admin CSV or a follow-up seed migration
-- once Supabase MCP / service role is available for this project.
-- Schema + RLS + countries + suppliers are ready for that sync.

COMMENT ON TABLE works IS 'Curated construction works; client seed: src/data/priceCatalogSeed.ts';
COMMENT ON TABLE work_prices IS 'Country labor prices; curated, not live shop scrape';
