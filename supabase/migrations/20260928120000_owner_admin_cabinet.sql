/*
  # Owner admin cabinet (P0 MVP)

  - app_owners + is_app_owner() (RLS source of truth)
  - site_announcements (single active header text)
  - user_app_meta (optional country for aggregate stats)
  - owner write policies on price catalog tables
  - owner_user_stats() RPC (SECURITY DEFINER aggregates)
  - seed owner row for ivan.sovban@gmail.com when auth user exists
  - auto-seed trigger if that email signs up later

  Apply (when SUPABASE_ACCESS_TOKEN or DB URL available):

    npx supabase db query --project-ref dnqudrucyypmfuskyfjw \
      -f supabase/migrations/20260928120000_owner_admin_cabinet.sql

  Or Dashboard → SQL Editor → paste this file.
*/

-- ---------------------------------------------------------------------------
-- app_owners
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_owners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_owners_select_self ON public.app_owners;
CREATE POLICY app_owners_select_self
  ON public.app_owners
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No client insert/update/delete — owners managed via SQL / Dashboard

CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_owners WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_owner() TO anon;

-- ---------------------------------------------------------------------------
-- Seed + recovery helper for sole owner email
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_app_owner_by_email(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_owners (user_id, email, role)
  SELECT u.id, lower(u.email), 'owner'
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        role = 'owner';
END;
$$;

REVOKE ALL ON FUNCTION public.seed_app_owner_by_email(text) FROM PUBLIC;
-- Callable only by service role / SQL editor (not granted to authenticated)

SELECT public.seed_app_owner_by_email('ivan.sovban@gmail.com');

-- Auto-add if Ivan signs up / confirms after migration
CREATE OR REPLACE FUNCTION public.trg_auth_users_seed_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = 'ivan.sovban@gmail.com' THEN
    INSERT INTO public.app_owners (user_id, email, role)
    VALUES (NEW.id, lower(NEW.email), 'owner')
    ON CONFLICT (user_id) DO UPDATE
      SET email = EXCLUDED.email,
          role = 'owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_seed_owner ON auth.users;
CREATE TRIGGER trg_auth_users_seed_owner
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auth_users_seed_owner();

-- ---------------------------------------------------------------------------
-- user_app_meta (country for aggregate stats; no PII in owner UI)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_app_meta (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code text,
  country_source text CHECK (
    country_source IS NULL
    OR country_source IN ('manual', 'price_pref', 'signup', 'unknown')
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_app_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_app_meta_select_own ON public.user_app_meta;
CREATE POLICY user_app_meta_select_own
  ON public.user_app_meta
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_app_owner());

DROP POLICY IF EXISTS user_app_meta_upsert_own ON public.user_app_meta;
CREATE POLICY user_app_meta_upsert_own
  ON public.user_app_meta
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_app_meta_update_own ON public.user_app_meta;
CREATE POLICY user_app_meta_update_own
  ON public.user_app_meta
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- site_announcements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('info', 'promo', 'warning')),
  body text NOT NULL CHECK (char_length(body) <= 120),
  is_active boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_announcements_one_active
  ON public.site_announcements ((true))
  WHERE is_active;

ALTER TABLE public.site_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_announcements_select_active ON public.site_announcements;
CREATE POLICY site_announcements_select_active
  ON public.site_announcements
  FOR SELECT
  TO anon, authenticated
  USING (
    public.is_app_owner()
    OR (
      is_active = true
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at >= now())
    )
  );

DROP POLICY IF EXISTS site_announcements_owner_insert ON public.site_announcements;
CREATE POLICY site_announcements_owner_insert
  ON public.site_announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_app_owner());

DROP POLICY IF EXISTS site_announcements_owner_update ON public.site_announcements;
CREATE POLICY site_announcements_owner_update
  ON public.site_announcements
  FOR UPDATE
  TO authenticated
  USING (public.is_app_owner())
  WITH CHECK (public.is_app_owner());

DROP POLICY IF EXISTS site_announcements_owner_delete ON public.site_announcements;
CREATE POLICY site_announcements_owner_delete
  ON public.site_announcements
  FOR DELETE
  TO authenticated
  USING (public.is_app_owner());

-- Publish helper: deactivate others, upsert one active
CREATE OR REPLACE FUNCTION public.owner_publish_announcement(
  p_kind text,
  p_body text,
  p_is_active boolean DEFAULT true,
  p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL,
  p_id uuid DEFAULT NULL
)
RETURNS public.site_announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.site_announcements;
BEGIN
  IF NOT public.is_app_owner() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_kind NOT IN ('info', 'promo', 'warning') THEN
    RAISE EXCEPTION 'invalid kind';
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 OR char_length(p_body) > 120 THEN
    RAISE EXCEPTION 'body must be 1..120 chars';
  END IF;

  IF p_is_active THEN
    UPDATE public.site_announcements SET is_active = false, updated_at = now()
    WHERE is_active = true
      AND (p_id IS NULL OR id <> p_id);
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.site_announcements
    SET
      kind = p_kind,
      body = trim(p_body),
      is_active = p_is_active,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO row;
  ELSE
    INSERT INTO public.site_announcements (
      kind, body, is_active, starts_at, ends_at, created_by
    ) VALUES (
      p_kind, trim(p_body), p_is_active, p_starts_at, p_ends_at, auth.uid()
    )
    RETURNING * INTO row;
  END IF;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_publish_announcement(text, text, boolean, timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_publish_announcement(text, text, boolean, timestamptz, timestamptz, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Owner stats (aggregates only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_user_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_count bigint;
  by_country jsonb;
BEGIN
  IF NOT public.is_app_owner() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT count(*) INTO total_count FROM auth.users;

  SELECT coalesce(jsonb_object_agg(bucket, cnt), '{}'::jsonb)
  INTO by_country
  FROM (
    SELECT
      coalesce(nullif(upper(m.country_code), ''), 'unknown') AS bucket,
      count(*)::bigint AS cnt
    FROM auth.users u
    LEFT JOIN public.user_app_meta m ON m.user_id = u.id
    GROUP BY 1
  ) s;

  RETURN jsonb_build_object(
    'total_users', total_count,
    'by_country', by_country
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_user_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_user_stats() TO authenticated;

-- ---------------------------------------------------------------------------
-- Price catalog: owner write policies + upsert helpers (by slug)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'works') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'works' AND policyname = 'works_owner_write') THEN
      CREATE POLICY works_owner_write ON public.works
        FOR ALL TO authenticated
        USING (public.is_app_owner())
        WITH CHECK (public.is_app_owner());
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'work_prices') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'work_prices' AND policyname = 'work_prices_owner_write') THEN
      CREATE POLICY work_prices_owner_write ON public.work_prices
        FOR ALL TO authenticated
        USING (public.is_app_owner())
        WITH CHECK (public.is_app_owner());
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'materials') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'materials' AND policyname = 'materials_owner_write') THEN
      CREATE POLICY materials_owner_write ON public.materials
        FOR ALL TO authenticated
        USING (public.is_app_owner())
        WITH CHECK (public.is_app_owner());
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'material_prices') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'material_prices' AND policyname = 'material_prices_owner_write') THEN
      CREATE POLICY material_prices_owner_write ON public.material_prices
        FOR ALL TO authenticated
        USING (public.is_app_owner())
        WITH CHECK (public.is_app_owner());
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.owner_upsert_work_price(
  p_slug text,
  p_country_code text,
  p_labor_price numeric,
  p_price_min numeric DEFAULT NULL,
  p_price_max numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_category text DEFAULT 'other',
  p_unit text DEFAULT 'm2',
  p_name_en text DEFAULT NULL,
  p_name_uk text DEFAULT NULL,
  p_name_de text DEFAULT NULL,
  p_name_es text DEFAULT NULL,
  p_search_aliases text[] DEFAULT '{}',
  p_youtube_urls jsonb DEFAULT '[]'::jsonb
)
RETURNS public.work_prices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work_id uuid;
  v_currency text;
  v_row public.work_prices;
  v_name text;
BEGIN
  IF NOT public.is_app_owner() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'slug required';
  END IF;

  IF p_country_code NOT IN ('DE', 'UA', 'ES') THEN
    RAISE EXCEPTION 'invalid country';
  END IF;

  v_currency := coalesce(
    nullif(p_currency, ''),
    CASE p_country_code WHEN 'UA' THEN 'UAH' ELSE 'EUR' END
  );
  v_name := coalesce(nullif(p_name_en, ''), p_slug);

  INSERT INTO public.works (
    slug, category, unit, name_en, name_uk, name_de, name_es,
    search_aliases, youtube_urls, is_active, updated_at
  ) VALUES (
    p_slug, coalesce(nullif(p_category, ''), 'other'), coalesce(nullif(p_unit, ''), 'm2'),
    v_name, p_name_uk, p_name_de, p_name_es,
    coalesce(p_search_aliases, '{}'), coalesce(p_youtube_urls, '[]'::jsonb),
    true, now()
  )
  ON CONFLICT (slug) DO UPDATE
    SET
      category = EXCLUDED.category,
      unit = EXCLUDED.unit,
      name_en = EXCLUDED.name_en,
      name_uk = coalesce(EXCLUDED.name_uk, public.works.name_uk),
      name_de = coalesce(EXCLUDED.name_de, public.works.name_de),
      name_es = coalesce(EXCLUDED.name_es, public.works.name_es),
      search_aliases = CASE
        WHEN cardinality(EXCLUDED.search_aliases) > 0 THEN EXCLUDED.search_aliases
        ELSE public.works.search_aliases
      END,
      youtube_urls = CASE
        WHEN EXCLUDED.youtube_urls IS NOT NULL AND EXCLUDED.youtube_urls <> '[]'::jsonb
          THEN EXCLUDED.youtube_urls
        ELSE public.works.youtube_urls
      END,
      updated_at = now()
  RETURNING id INTO v_work_id;

  UPDATE public.work_prices
  SET
    labor_price = p_labor_price,
    labor_currency = v_currency,
    price_min = p_price_min,
    price_max = p_price_max,
    updated_at = now()
  WHERE work_id = v_work_id
    AND country_code = p_country_code
    AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    INSERT INTO public.work_prices (
      work_id, country_code, labor_price, labor_currency,
      price_min, price_max, valid_from, source, updated_at
    ) VALUES (
      v_work_id, p_country_code, p_labor_price, v_currency,
      p_price_min, p_price_max, CURRENT_DATE, 'owner', now()
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_upsert_work_price(
  text, text, numeric, numeric, numeric, text, text, text, text, text, text, text, text[], jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_upsert_work_price(
  text, text, numeric, numeric, numeric, text, text, text, text, text, text, text, text[], jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_upsert_material_price(
  p_slug text,
  p_country_code text,
  p_price numeric,
  p_currency text DEFAULT NULL,
  p_unit text DEFAULT 'unit',
  p_name_en text DEFAULT NULL,
  p_name_uk text DEFAULT NULL,
  p_name_de text DEFAULT NULL,
  p_name_es text DEFAULT NULL,
  p_aliases text[] DEFAULT '{}'
)
RETURNS public.material_prices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_material_id uuid;
  v_currency text;
  v_row public.material_prices;
  v_name text;
BEGIN
  IF NOT public.is_app_owner() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'slug required';
  END IF;

  IF p_country_code NOT IN ('DE', 'UA', 'ES') THEN
    RAISE EXCEPTION 'invalid country';
  END IF;

  v_currency := coalesce(
    nullif(p_currency, ''),
    CASE p_country_code WHEN 'UA' THEN 'UAH' ELSE 'EUR' END
  );
  v_name := coalesce(nullif(p_name_en, ''), p_slug);

  INSERT INTO public.materials (
    slug, name_en, name_uk, name_de, name_es, unit, aliases, updated_at
  ) VALUES (
    p_slug, v_name, p_name_uk, p_name_de, p_name_es,
    coalesce(nullif(p_unit, ''), 'unit'), coalesce(p_aliases, '{}'), now()
  )
  ON CONFLICT (slug) DO UPDATE
    SET
      name_en = EXCLUDED.name_en,
      name_uk = coalesce(EXCLUDED.name_uk, public.materials.name_uk),
      name_de = coalesce(EXCLUDED.name_de, public.materials.name_de),
      name_es = coalesce(EXCLUDED.name_es, public.materials.name_es),
      unit = EXCLUDED.unit,
      aliases = CASE
        WHEN cardinality(EXCLUDED.aliases) > 0 THEN EXCLUDED.aliases
        ELSE public.materials.aliases
      END,
      updated_at = now()
  RETURNING id INTO v_material_id;

  UPDATE public.material_prices
  SET
    price = p_price,
    currency = v_currency,
    updated_at = now()
  WHERE material_id = v_material_id
    AND country_code = p_country_code
    AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    INSERT INTO public.material_prices (
      material_id, country_code, price, currency, valid_from, source, updated_at
    ) VALUES (
      v_material_id, p_country_code, p_price, v_currency, CURRENT_DATE, 'owner', now()
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_upsert_material_price(
  text, text, numeric, text, text, text, text, text, text, text[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_upsert_material_price(
  text, text, numeric, text, text, text, text, text, text, text[]
) TO authenticated;

-- Optional: persist price-pref country into user_app_meta (no IP geo)
CREATE OR REPLACE FUNCTION public.upsert_my_price_country(p_country_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_country_code IS NOT NULL AND p_country_code NOT IN ('DE', 'UA', 'ES') THEN
    RAISE EXCEPTION 'invalid country';
  END IF;

  INSERT INTO public.user_app_meta (user_id, country_code, country_source, updated_at)
  VALUES (auth.uid(), p_country_code, 'price_pref', now())
  ON CONFLICT (user_id) DO UPDATE
    SET
      country_code = EXCLUDED.country_code,
      country_source = 'price_pref',
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_price_country(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_my_price_country(text) TO authenticated;
