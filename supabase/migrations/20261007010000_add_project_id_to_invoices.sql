/*
  # Link invoices to construction projects (optional)

  - Adds invoices.project_id → projects(id) when both tables exist
  - Safe no-op if projects table is missing (preview/prod drift)
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoices'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'projects'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE public.invoices
      ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON public.invoices(project_id);
  END IF;
END $$;
