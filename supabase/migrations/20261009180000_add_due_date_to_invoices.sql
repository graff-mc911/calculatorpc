/*
  # Add invoices.due_date for payment terms

  Production may have created `invoices` before due_date existed.
  CREATE TABLE IF NOT EXISTS in the original migration does not add
  missing columns to an already-present table, so PostgREST returns:
  "Could not find the 'due_date' column of 'invoices' in the schema cache"
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoices'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'due_date'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN due_date date;
  END IF;
END $$;
