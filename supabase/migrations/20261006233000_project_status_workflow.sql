/*
  Expand project status to Draft / In Progress / Completed / Paid.

  Apply after 20261006220000_create_project_estimator.sql
*/

DO $$
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE NOTICE 'projects missing — skip status workflow migration';
    RETURN;
  END IF;

  -- Map legacy values
  UPDATE public.projects SET status = 'in_progress' WHERE status = 'active';
  UPDATE public.projects SET status = 'draft' WHERE status = 'archived';

  ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_status_check
    CHECK (status IN ('draft', 'in_progress', 'completed', 'paid'));

  ALTER TABLE public.projects ALTER COLUMN status SET DEFAULT 'draft';
END $$;
