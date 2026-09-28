/*
  # Community chat MVP (country-scoped rooms)

  - chat_rooms seed: de / es / ua / intl
  - chat_messages + soft-delete (owner)
  - RLS: country room gated by user_app_meta.country_code; intl = all auth
  - send_chat_message() rate limit (~1 / 4s) + display_name (no email leak)
  - set_my_community_country() for mandatory country pick
  - owner_soft_delete_chat_message()
  - Realtime publication for chat_messages

  Apply (when SUPABASE_ACCESS_TOKEN available):

    npx supabase db query --linked --project-ref dnqudrucyypmfuskyfjw \
      -f supabase/migrations/20260928150000_community_chat.sql

  Or Dashboard → SQL Editor → paste this file.

  Depends on: user_app_meta, is_app_owner() (20260928120000_owner_admin_cabinet.sql)
*/

-- ---------------------------------------------------------------------------
-- chat_rooms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug IN ('de', 'es', 'ua', 'intl')),
  country_code text CHECK (
    country_code IS NULL
    OR country_code IN ('DE', 'ES', 'UA')
  ),
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_rooms_intl_null_country CHECK (
    (slug = 'intl' AND country_code IS NULL)
    OR (slug <> 'intl' AND country_code IS NOT NULL)
  )
);

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_rooms_select ON public.chat_rooms;
CREATE POLICY chat_rooms_select
  ON public.chat_rooms
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_app_owner());

-- Seed rooms (stable ids for tooling)
INSERT INTO public.chat_rooms (id, slug, country_code, title, is_active)
VALUES
  ('a1000000-0000-4000-8000-0000000000de', 'de', 'DE', 'Німеччина', true),
  ('a1000000-0000-4000-8000-0000000000es', 'es', 'ES', 'Іспанія', true),
  ('a1000000-0000-4000-8000-0000000000ua', 'ua', 'UA', 'Україна', true),
  ('a1000000-0000-4000-8000-0000000000in', 'intl', NULL, 'International', true)
ON CONFLICT (slug) DO UPDATE
  SET
    country_code = EXCLUDED.country_code,
    title = EXCLUDED.title,
    is_active = true;

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_room_created_idx
  ON public.chat_messages (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx
  ON public.chat_messages (user_id, created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Access helper: intl for all auth; country room if meta matches OR owner
CREATE OR REPLACE FUNCTION public.can_access_chat_room(p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_country text;
  v_meta text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_app_owner() THEN
    RETURN true;
  END IF;

  SELECT r.slug, r.country_code INTO v_slug, v_country
  FROM public.chat_rooms r
  WHERE r.id = p_room_id AND r.is_active = true;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_slug = 'intl' THEN
    RETURN true;
  END IF;

  SELECT m.country_code INTO v_meta
  FROM public.user_app_meta m
  WHERE m.user_id = auth.uid();

  RETURN v_meta IS NOT NULL AND v_meta = v_country;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_chat_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_chat_room(uuid) TO authenticated;

DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_chat_room(room_id)
    AND (is_deleted = false OR public.is_app_owner())
  );

-- No direct client INSERT/UPDATE — use RPCs (rate limit + display_name)
DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_update ON public.chat_messages;

-- ---------------------------------------------------------------------------
-- set_my_community_country — mandatory pick when meta empty / Settings change
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_my_community_country(p_country_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_country_code IS NULL OR p_country_code NOT IN ('DE', 'UA', 'ES') THEN
    RAISE EXCEPTION 'invalid country';
  END IF;

  INSERT INTO public.user_app_meta (user_id, country_code, country_source, updated_at)
  VALUES (auth.uid(), p_country_code, 'manual', now())
  ON CONFLICT (user_id) DO UPDATE
    SET
      country_code = EXCLUDED.country_code,
      country_source = 'manual',
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_community_country(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_community_country(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- send_chat_message — body limit + rate limit + room gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_room_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text;
  v_display text;
  v_msg_id uuid;
  v_last_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_body := trim(COALESCE(p_body, ''));
  IF char_length(v_body) < 1 OR char_length(v_body) > 1000 THEN
    RAISE EXCEPTION 'invalid body length';
  END IF;

  IF NOT public.can_access_chat_room(p_room_id) THEN
    RAISE EXCEPTION 'room access denied';
  END IF;

  -- Rate limit: 1 message / 4 seconds per user (any room)
  SELECT max(created_at) INTO v_last_at
  FROM public.chat_messages
  WHERE user_id = v_uid;

  IF v_last_at IS NOT NULL AND v_last_at > (now() - interval '4 seconds') THEN
    RAISE EXCEPTION 'rate_limit: wait a few seconds between messages';
  END IF;

  SELECT nullif(trim(cp.company_name), '') INTO v_display
  FROM public.company_profile cp
  WHERE cp.user_id = v_uid
  LIMIT 1;

  IF v_display IS NULL THEN
    SELECT split_part(u.email, '@', 1) INTO v_display
    FROM auth.users u
    WHERE u.id = v_uid;
  END IF;

  IF v_display IS NULL OR char_length(trim(v_display)) < 1 THEN
    v_display := 'user';
  END IF;

  v_display := left(v_display, 80);

  INSERT INTO public.chat_messages (room_id, user_id, display_name, body)
  VALUES (p_room_id, v_uid, v_display, v_body)
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_chat_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- owner_soft_delete_chat_message
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_soft_delete_chat_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_owner() THEN
    RAISE EXCEPTION 'owner only';
  END IF;

  UPDATE public.chat_messages
  SET is_deleted = true
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_soft_delete_chat_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_soft_delete_chat_message(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;
