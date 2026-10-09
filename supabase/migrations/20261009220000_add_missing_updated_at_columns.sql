/*
  # Fix: record "new" has no field "updated_at"

  Some tables have trigger update_updated_at_column() but were created
  before updated_at existed. CREATE TABLE IF NOT EXISTS never added the
  column. This migration adds updated_at wherever the trigger is present
  and the column is missing. Safe to re-run.
*/

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT DISTINCT c.relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND c.relnamespace = 'public'::regnamespace
      AND p.proname = 'update_updated_at_column'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'updated_at'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN updated_at timestamptz DEFAULT now()',
      tbl
    );
    RAISE NOTICE 'Added updated_at to public.%', tbl;
  END LOOP;
END $$;
