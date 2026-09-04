-- Migration 024: Membership billing (Moyue / 会员底座).
--
-- Tiers are enforced SERVER-SIDE by direct DB lookup — no GoTrue JWT claims
-- hook exists on the self-hosted stack, so the client never carries `plan`
-- in its token. Effective plan resolution (expiry → auto downgrade to free)
-- lives in `get_user_plan`; storage usage is computed from `files` by
-- `get_storage_usage`. Both are SECURITY DEFINER and callable only by
-- service_role (the app's API routes); clients have no table access.
--
-- `orders` is written by the payment provider (epay / 易支付) integration:
-- created `pending` at checkout, flipped `paid` by the verified async notify.

CREATE TABLE IF NOT EXISTS public.plans (
  user_id uuid NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  current_period_end timestamp with time zone NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT plans_pkey PRIMARY KEY (user_id),
  CONSTRAINT plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT plans_plan_check CHECK (plan IN ('free', 'plus', 'pro'))
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_no text NOT NULL,
  user_id uuid NOT NULL,
  plan text NOT NULL,
  months integer NOT NULL DEFAULT 1,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'CNY',
  channel text NOT NULL,
  provider text NOT NULL DEFAULT 'epay',
  status text NOT NULL DEFAULT 'pending',
  trade_no text NULL,
  paid_at timestamp with time zone NULL,
  notify_raw jsonb NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_order_no_key UNIQUE (order_no),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT orders_plan_check CHECK (plan IN ('plus', 'pro')),
  CONSTRAINT orders_channel_check CHECK (channel IN ('wechat', 'alipay')),
  CONSTRAINT orders_status_check CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded')),
  CONSTRAINT orders_months_check CHECK (months >= 1),
  CONSTRAINT orders_amount_check CHECK (amount_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_trade_no ON public.orders (trade_no);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Idempotency guard for notify callbacks: flips a pending order to paid and
-- extends/starts the plan period atomically. Returns the order row state.
CREATE OR REPLACE FUNCTION public.mark_order_paid(
  p_order_no text,
  p_trade_no text,
  p_notify jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
BEGIN
  UPDATE public.orders
  SET status = 'paid',
      trade_no = p_trade_no,
      paid_at = now(),
      notify_raw = p_notify
  WHERE order_no = p_order_no
    AND status = 'pending'
  RETURNING * INTO v_order;

  IF v_order.id IS NULL THEN
    -- Already paid (retry) or unknown/expired: report state to the caller.
    SELECT to_jsonb(o) - 'notify_raw' INTO v_order FROM public.orders o WHERE o.order_no = p_order_no;
    RETURN json_build_object('ok', (v_order ->> 'status') = 'paid', 'order', v_order);
  END IF;

  -- Start/extend the plan from the paid order. Free rows may not exist yet;
  -- upsert keeps this idempotent.
  INSERT INTO public.plans (user_id, plan, current_period_end, updated_at)
  VALUES (
    v_order.user_id,
    v_order.plan,
    GREATEST(
      COALESCE((SELECT current_period_end FROM public.plans WHERE user_id = v_order.user_id AND plan = v_order.plan), now()),
      now()
    ) + (v_order.months || ' months')::interval,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now();

  RETURN json_build_object('ok', true, 'order', to_jsonb(v_order) - 'notify_raw');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_order_paid(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(text, text, jsonb) TO service_role;

-- Effective plan: an expired plus/pro period falls back to free.
CREATE OR REPLACE FUNCTION public.get_user_plan(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.plan IN ('plus', 'pro')
         AND (p.current_period_end IS NULL OR p.current_period_end > now())
    THEN p.plan
    ELSE 'free'
  END
  FROM public.plans p
  WHERE p.user_id = p_user_id;
$$;

-- Live storage usage (bytes) across the user's non-deleted files.
CREATE OR REPLACE FUNCTION public.get_storage_usage(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(f.file_size), 0)::bigint
  FROM public.files f
  WHERE f.user_id = p_user_id
    AND f.deleted_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_storage_usage(uuid) TO service_role;
