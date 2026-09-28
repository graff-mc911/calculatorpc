/*
  # Contact Us MVP (user → owner inbox)

  - contact_threads + contact_messages
  - RLS: user sees own threads; owner sees all via is_app_owner()
  - create_contact_thread() with rate limit (5/day)
  - owner_reply_contact() / owner_close_contact() helpers
  - user_email snapshot for support inbox (owner only via RLS)

  Apply (when SUPABASE_ACCESS_TOKEN or DB URL available):

    npx supabase db query --project-ref dnqudrucyypmfuskyfjw \
      -f supabase/migrations/20260928140000_contact_us.sql

  Or Dashboard → SQL Editor → paste this file.

  Depends on: app_owners / is_app_owner() (20260928120000_owner_admin_cabinet.sql)
*/

-- ---------------------------------------------------------------------------
-- contact_threads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  category text NOT NULL CHECK (category IN ('question', 'complaint', 'suggestion', 'other')),
  subject text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered', 'closed')),
  country_code text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_threads_user_last_idx
  ON public.contact_threads (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS contact_threads_status_last_idx
  ON public.contact_threads (status, last_message_at DESC);

ALTER TABLE public.contact_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_threads_select ON public.contact_threads;
CREATE POLICY contact_threads_select
  ON public.contact_threads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_app_owner());

DROP POLICY IF EXISTS contact_threads_insert ON public.contact_threads;
CREATE POLICY contact_threads_insert
  ON public.contact_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS contact_threads_update ON public.contact_threads;
CREATE POLICY contact_threads_update
  ON public.contact_threads
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_app_owner())
  WITH CHECK (user_id = auth.uid() OR public.is_app_owner());

-- No client DELETE — cascade from auth.users

-- ---------------------------------------------------------------------------
-- contact_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.contact_threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  author_role text NOT NULL CHECK (author_role IN ('user', 'owner')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_thread_created_idx
  ON public.contact_messages (thread_id, created_at);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_messages_select ON public.contact_messages;
CREATE POLICY contact_messages_select
  ON public.contact_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_app_owner()
    OR EXISTS (
      SELECT 1 FROM public.contact_threads t
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS contact_messages_insert ON public.contact_messages;
CREATE POLICY contact_messages_insert
  ON public.contact_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      (
        author_role = 'user'
        AND EXISTS (
          SELECT 1 FROM public.contact_threads t
          WHERE t.id = thread_id
            AND t.user_id = auth.uid()
            AND t.status <> 'closed'
        )
      )
      OR (
        author_role = 'owner'
        AND public.is_app_owner()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- create_contact_thread — atomic first message + rate limit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_contact_thread(
  p_category text,
  p_body text,
  p_subject text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_country text;
  v_thread_id uuid;
  v_subject text;
  v_today_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_category IS NULL OR p_category NOT IN ('question', 'complaint', 'suggestion', 'other') THEN
    RAISE EXCEPTION 'invalid category';
  END IF;

  IF p_body IS NULL OR char_length(trim(p_body)) < 1 OR char_length(p_body) > 2000 THEN
    RAISE EXCEPTION 'invalid body length';
  END IF;

  SELECT count(*)::int INTO v_today_count
  FROM public.contact_threads
  WHERE user_id = v_uid
    AND created_at >= (now() AT TIME ZONE 'utc')::date;

  IF v_today_count >= 5 THEN
    RAISE EXCEPTION 'rate_limit: max 5 contact threads per day';
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;
  SELECT m.country_code INTO v_country
  FROM public.user_app_meta m
  WHERE m.user_id = v_uid;

  v_subject := NULLIF(trim(COALESCE(p_subject, '')), '');
  IF v_subject IS NULL THEN
    v_subject := left(trim(p_body), 80);
  END IF;

  INSERT INTO public.contact_threads (
    user_id, user_email, category, subject, status, country_code, last_message_at
  ) VALUES (
    v_uid, lower(v_email), p_category, v_subject, 'open', v_country, now()
  )
  RETURNING id INTO v_thread_id;

  INSERT INTO public.contact_messages (thread_id, author_id, author_role, body)
  VALUES (v_thread_id, v_uid, 'user', trim(p_body));

  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_contact_thread(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_contact_thread(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- owner_reply_contact
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_reply_contact(
  p_thread_id uuid,
  p_body text,
  p_close boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg_id uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_app_owner() THEN
    RAISE EXCEPTION 'owner only';
  END IF;

  IF p_body IS NULL OR char_length(trim(p_body)) < 1 OR char_length(p_body) > 2000 THEN
    RAISE EXCEPTION 'invalid body length';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contact_threads WHERE id = p_thread_id) THEN
    RAISE EXCEPTION 'thread not found';
  END IF;

  INSERT INTO public.contact_messages (thread_id, author_id, author_role, body)
  VALUES (p_thread_id, v_uid, 'owner', trim(p_body))
  RETURNING id INTO v_msg_id;

  v_status := CASE WHEN p_close THEN 'closed' ELSE 'answered' END;

  UPDATE public.contact_threads
  SET status = v_status,
      last_message_at = now()
  WHERE id = p_thread_id;

  RETURN v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_reply_contact(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_reply_contact(uuid, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- owner_close_contact / user_close_contact
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_contact_thread(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.contact_threads
  SET status = 'closed',
      last_message_at = greatest(last_message_at, now())
  WHERE id = p_thread_id
    AND (user_id = v_uid OR public.is_app_owner());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found or not allowed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.close_contact_thread(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_contact_thread(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- user follow-up message bump last_message_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_contact_messages_bump_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contact_threads
  SET last_message_at = NEW.created_at,
      status = CASE
        WHEN NEW.author_role = 'owner' AND status = 'open' THEN 'answered'
        WHEN NEW.author_role = 'user' AND status = 'answered' THEN 'open'
        ELSE status
      END
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_messages_bump_thread ON public.contact_messages;
CREATE TRIGGER trg_contact_messages_bump_thread
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_contact_messages_bump_thread();
