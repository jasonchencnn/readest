-- Migration 023: Invite-only registration (Moyue / 邀约制注册).
--
-- Signup is gated by single-use (or bounded-use) invite codes. The auth
-- user is created server-side via the GoTrue admin API (service role), so
-- `DISABLE_SIGNUP=true` stays on for the anon client and GoTrue never hands
-- out sessions to anonymous signups.
--
-- State transitions go through the SECURITY DEFINER RPCs below: the signup
-- route calls `validate_invite` for fast feedback, creates the user, then
-- calls `claim_invite` to atomically consume a use (guarded against races
-- by the conditional UPDATE). Clients have no direct table access —
-- service_role bypasses RLS, everyone else gets nothing.

CREATE TABLE IF NOT EXISTS public.invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  note text NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamp with time zone NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invites_pkey PRIMARY KEY (id),
  CONSTRAINT invites_code_key UNIQUE (code),
  CONSTRAINT invites_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT invites_max_uses_check CHECK (max_uses >= 1),
  CONSTRAINT invites_used_count_check CHECK (used_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_invites_status ON public.invites (status);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.invite_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL,
  redeemed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invite_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT invite_redemptions_invite_user_key UNIQUE (invite_id, user_id),
  CONSTRAINT invite_redemptions_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES public.invites (id) ON DELETE CASCADE,
  CONSTRAINT invite_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invite_redemptions_user ON public.invite_redemptions (user_id);

ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;

-- Cheap existence/eligibility check for signup-form feedback.
CREATE OR REPLACE FUNCTION public.validate_invite(p_code text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'valid', (count(*) = 1),
    'remaining', COALESCE(max(i.max_uses - i.used_count), 0)
  )
  FROM public.invites i
  WHERE i.code = trim(p_code)
    AND i.status = 'active'
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND i.used_count < i.max_uses;
$$;

-- Atomically consume one use of an invite for a freshly created user.
-- Returns { ok: true, invite_id } or { ok: false, reason }.
CREATE OR REPLACE FUNCTION public.claim_invite(p_code text, p_user_id uuid, p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.invites;
BEGIN
  UPDATE public.invites
  SET used_count = used_count + 1
  WHERE code = trim(p_code)
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
    AND used_count < max_uses
  RETURNING * INTO v_invite;

  IF v_invite.id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_or_exhausted');
  END IF;

  -- One redemption per user per invite; tolerate idempotent retries.
  INSERT INTO public.invite_redemptions (invite_id, user_id, email)
  VALUES (v_invite.id, p_user_id, lower(trim(p_email)))
  ON CONFLICT (invite_id, user_id) DO NOTHING;

  RETURN json_build_object('ok', true, 'invite_id', v_invite.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_invite(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_invite(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invite(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_invite(text, uuid, text) TO service_role;
