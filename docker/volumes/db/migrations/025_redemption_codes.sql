-- Migration 025: Redemption-code membership grants (Moyue / 兑换码).
--
-- Replaces the third-party payment path for small-scale distribution: the
-- seller (admin) generates Crockford-formatted codes offline, hands them to
-- buyers over a side channel (Xianyu / WeChat / Alipay direct transfer), and
-- the buyer redeems here to extend or start a `plans` row. No funds touch
-- Moyue — this is purely credential verification.
--
-- Code lifecycle is the same as invites: codes are created with `INSERT` from
-- a server-side admin route (service_role), single-use by default, optionally
-- time-bounded, and consumed by a SECURITY DEFINER RPC. The atomic consume
-- (`redeem_code`) locks the code row, flips its status, and upserts the
-- caller's `plans` row in one transaction — the only window where the user's
-- effective plan can change. Clients have no direct table access.

CREATE TABLE IF NOT EXISTS public.redemption_codes (
  code text NOT NULL,
  plan text NOT NULL,
  months integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  redeemed_by uuid NULL,
  redeemed_at timestamp with time zone NULL,
  expires_at timestamp with time zone NULL,
  note text NULL,
  created_by text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT redemption_codes_pkey PRIMARY KEY (code),
  CONSTRAINT redemption_codes_redeemed_by_fkey FOREIGN KEY (redeemed_by) REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT redemption_codes_plan_check CHECK (plan IN ('plus', 'pro')),
  CONSTRAINT redemption_codes_months_check CHECK (months > 0),
  CONSTRAINT redemption_codes_status_check CHECK (status IN ('active', 'redeemed', 'expired', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_redemption_codes_status ON public.redemption_codes (status);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_redeemed_by ON public.redemption_codes (redeemed_by);

ALTER TABLE public.redemption_codes ENABLE ROW LEVEL SECURITY;

-- Atomically consume a code for a user: locks the code row, checks status +
-- expiry, then upserts the user's `plans` row. Reuses the same extend-or-start
-- logic as `mark_order_paid` so the two grant paths share one definition of
-- "current period end". Idempotent on retry: a second call with the same
-- (code, user) returns the same outcome once status is no longer 'active'.
CREATE OR REPLACE FUNCTION public.redeem_code(
  p_code text,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code public.redemption_codes;
  v_current_period_end timestamp with time zone;
  v_new_period_end timestamp with time zone;
BEGIN
  -- 1. Lock the code row (prevents concurrent redemption of the same code).
  SELECT * INTO v_code
  FROM public.redemption_codes
  WHERE code = trim(p_code)
  FOR UPDATE;

  IF v_code.code IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  IF v_code.status <> 'active' THEN
    RETURN json_build_object('ok', false, 'reason', 'already_used_or_invalid');
  END IF;

  IF v_code.expires_at IS NOT NULL AND v_code.expires_at <= now() THEN
    -- Lazily mark the code expired so a later attempt reports the right status.
    UPDATE public.redemption_codes
    SET status = 'expired'
    WHERE code = v_code.code;
    RETURN json_build_object('ok', false, 'reason', 'expired');
  END IF;

  -- 2. Read the current plan period (no lock needed — we'll upsert next).
  SELECT current_period_end INTO v_current_period_end
  FROM public.plans
  WHERE user_id = p_user_id;

  -- 3. Extend an active period, otherwise start one from now.
  IF v_current_period_end IS NULL OR v_current_period_end <= now() THEN
    v_new_period_end := now() + (v_code.months || ' months')::interval;
  ELSE
    v_new_period_end := v_current_period_end + (v_code.months || ' months')::interval;
  END IF;

  -- 4. Upsert the plan row.
  INSERT INTO public.plans (user_id, plan, current_period_end, updated_at)
  VALUES (p_user_id, v_code.plan, v_new_period_end, now())
  ON CONFLICT (user_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now();

  -- 5. Mark the code redeemed.
  UPDATE public.redemption_codes
  SET status = 'redeemed',
      redeemed_by = p_user_id,
      redeemed_at = now()
  WHERE code = v_code.code;

  RETURN json_build_object(
    'ok', true,
    'plan', v_code.plan,
    'months_added', v_code.months,
    'current_period_end', v_new_period_end
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_code(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_code(text, uuid) TO service_role;
