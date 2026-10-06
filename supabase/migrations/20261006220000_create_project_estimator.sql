/*
  # Project Estimator MVP — Об'єкти

  Tables:
    - projects
    - project_work_items
    - project_expenses
    - project_prepayments

  RLS: owner-only via user_id = auth.uid()
  Receipt photos: reuse scanned-documents bucket path
    {user_id}/projects/{project_id}/...

  Apply (when SUPABASE_ACCESS_TOKEN or DB URL available):

    npx supabase db query --project-ref dnqudrucyypmfuskyfjw \
      -f supabase/migrations/20261006220000_create_project_estimator.sql

  Or Dashboard → SQL Editor → paste this file.
*/

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 200),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text,
  address text,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'archived')),
  expense_budget numeric(14, 2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_user_updated_idx
  ON public.projects (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS projects_user_status_idx
  ON public.projects (user_id, status);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select
  ON public.projects FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS projects_insert ON public.projects;
CREATE POLICY projects_insert
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS projects_update ON public.projects;
CREATE POLICY projects_update
  ON public.projects FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS projects_delete ON public.projects;
CREATE POLICY projects_delete
  ON public.projects FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- project_work_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 300),
  category text NOT NULL DEFAULT 'other',
  catalog_work_id text,
  group_key text NOT NULL DEFAULT '',
  quantity numeric(14, 3) NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'm2',
  unit_price numeric(14, 2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_work_items_project_sort_idx
  ON public.project_work_items (project_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS project_work_items_user_idx
  ON public.project_work_items (user_id);

ALTER TABLE public.project_work_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_work_items_select ON public.project_work_items;
CREATE POLICY project_work_items_select
  ON public.project_work_items FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS project_work_items_insert ON public.project_work_items;
CREATE POLICY project_work_items_insert
  ON public.project_work_items FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS project_work_items_update ON public.project_work_items;
CREATE POLICY project_work_items_update
  ON public.project_work_items FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS project_work_items_delete ON public.project_work_items;
CREATE POLICY project_work_items_delete
  ON public.project_work_items FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- project_expenses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 300),
  category text NOT NULL DEFAULT 'materials',
  amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  expense_date date NOT NULL DEFAULT (CURRENT_DATE),
  receipt_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_expenses_project_date_idx
  ON public.project_expenses (project_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS project_expenses_user_idx
  ON public.project_expenses (user_id);

ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_expenses_select ON public.project_expenses;
CREATE POLICY project_expenses_select
  ON public.project_expenses FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS project_expenses_insert ON public.project_expenses;
CREATE POLICY project_expenses_insert
  ON public.project_expenses FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS project_expenses_update ON public.project_expenses;
CREATE POLICY project_expenses_update
  ON public.project_expenses FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS project_expenses_delete ON public.project_expenses;
CREATE POLICY project_expenses_delete
  ON public.project_expenses FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- project_prepayments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_prepayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL DEFAULT (CURRENT_DATE),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_prepayments_project_date_idx
  ON public.project_prepayments (project_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS project_prepayments_user_idx
  ON public.project_prepayments (user_id);

ALTER TABLE public.project_prepayments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_prepayments_select ON public.project_prepayments;
CREATE POLICY project_prepayments_select
  ON public.project_prepayments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS project_prepayments_insert ON public.project_prepayments;
CREATE POLICY project_prepayments_insert
  ON public.project_prepayments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS project_prepayments_update ON public.project_prepayments;
CREATE POLICY project_prepayments_update
  ON public.project_prepayments FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS project_prepayments_delete ON public.project_prepayments;
CREATE POLICY project_prepayments_delete
  ON public.project_prepayments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuse update_updated_at_column if present)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
    CREATE TRIGGER projects_set_updated_at
      BEFORE UPDATE ON public.projects
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

    DROP TRIGGER IF EXISTS project_work_items_set_updated_at ON public.project_work_items;
    CREATE TRIGGER project_work_items_set_updated_at
      BEFORE UPDATE ON public.project_work_items
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

    DROP TRIGGER IF EXISTS project_expenses_set_updated_at ON public.project_expenses;
    CREATE TRIGGER project_expenses_set_updated_at
      BEFORE UPDATE ON public.project_expenses
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
