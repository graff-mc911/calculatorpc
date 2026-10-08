/*
  # Add optional note to clients

  Simple contact memo — not CRM activity history.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'note'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN note text;
  END IF;
END $$;
