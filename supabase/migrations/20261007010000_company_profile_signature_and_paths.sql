/*
  # Company profile: logo path + signature/stamp assets

  Adds storage path + public URL columns used by Settings company form.
  Safe when company_profile is missing (preview/prod drift).
*/

DO $$
BEGIN
  IF to_regclass('public.company_profile') IS NULL THEN
    RAISE NOTICE 'company_profile missing — skip signature/path columns';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_profile' AND column_name = 'logo_path'
  ) THEN
    ALTER TABLE public.company_profile ADD COLUMN logo_path text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_profile' AND column_name = 'signature_url'
  ) THEN
    ALTER TABLE public.company_profile ADD COLUMN signature_url text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_profile' AND column_name = 'signature_path'
  ) THEN
    ALTER TABLE public.company_profile ADD COLUMN signature_path text DEFAULT '';
  END IF;
END $$;
