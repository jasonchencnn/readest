import { createSupabaseAdminClient } from '@/utils/supabase';
import { DEFAULT_STORAGE_QUOTA } from '@/services/constants';
import { UserPlan } from '@/types/quota';

export interface UserPlanData {
  plan: UserPlan;
  usage: number;
  quota: number;
  currentPeriodEnd: string | null;
}

/**
 * Server-only plan resolution. Membership tiers live in the `plans` table
 * (migration 020) and are read through SECURITY DEFINER RPCs with the
 * service-role key — the self-hosted GoTrue carries no `plan` JWT claim, so
 * the client token can never grant itself a tier. An expired plus/pro period
 * resolves to free inside `get_user_plan`.
 */
export const getUserPlanData = async (userId: string): Promise<UserPlanData> => {
  const supabase = createSupabaseAdminClient();
  const [planResult, usageResult, rowResult] = await Promise.all([
    supabase.rpc('get_user_plan', { p_user_id: userId }),
    supabase.rpc('get_storage_usage', { p_user_id: userId }),
    supabase
      .from('plans')
      .select('current_period_end')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
  ]);

  // Fail closed on the usage counter: an unreadable `get_storage_usage` must
  // never be coerced to "0 bytes used". Every consumer treats 0 as "the account
  // is empty", so the storage gate would then authorise an upload that actually
  // exceeds the quota. Reject instead, and let the caller refuse the operation.
  if (usageResult.error) {
    console.error('get_storage_usage failed:', usageResult.error.message);
    throw new Error(`get_storage_usage failed: ${usageResult.error.message}`);
  }
  // Fail safe on entitlement: an unreadable tier resolves to free, so a
  // transient error can never *grant* a paid tier.
  if (planResult.error) console.error('get_user_plan failed:', planResult.error.message);

  const plan: UserPlan = (planResult.data as UserPlan | null) || 'free';
  return {
    plan,
    usage: Number(usageResult.data ?? 0),
    quota: DEFAULT_STORAGE_QUOTA[plan] ?? DEFAULT_STORAGE_QUOTA.free,
    currentPeriodEnd: (rowResult.data?.current_period_end as string | undefined) ?? null,
  };
};
