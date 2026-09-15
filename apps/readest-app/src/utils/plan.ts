import { createSupabaseAdminClient } from '@/utils/supabase';
import { DEFAULT_STORAGE_QUOTA } from '@/services/constants';
import { UserPlan } from '@/types/quota';

export interface UserPlanData {
  plan: UserPlan;
  usage: number;
  quota: number;
  currentPeriodEnd: string | null;
  /**
   * True when the `get_storage_usage` counter could not be read, in which case
   * `usage` is reported as 0. Callers that authorise *against* usage (storage
   * upload, share import) must refuse rather than treat the account as empty;
   * display-only callers may render 0. Read-only callers that need neither
   * `usage` nor this flag are unaffected.
   */
  usageUnavailable: boolean;
}

/**
 * Server-only plan resolution. Membership tiers live in the `plans` table
 * (migration 020) and are read through SECURITY DEFINER RPCs with the
 * service-role key — the self-hosted GoTrue carries no `plan` JWT claim, so
 * the client token can never grant itself a tier. An expired plus/pro period
 * resolves to free inside `get_user_plan`.
 *
 * Never throws on a resolver failure: the tier falls back to free and an
 * unreadable usage counter is surfaced as `usageUnavailable`, leaving it to
 * each caller to decide whether that is fatal.
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

  // The counter and the tier fail differently, so they are reported
  // differently rather than both throwing:
  //  - the tier is *fail-safe*: an unreadable `get_user_plan` resolves to free,
  //    so a transient error can never grant a paid tier;
  //  - the counter is only *flagged* (`usageUnavailable`). Whether that is fatal
  //    depends on the caller: throwing here would turn one RPC blip into a 500
  //    for the translation, send-address, sender-list and stats paths, none of
  //    which authorise against usage. The two gates that do (storage upload and
  //    share import) check the flag and refuse.
  if (planResult.error) console.error('get_user_plan failed:', planResult.error.message);
  const usageUnavailable = Boolean(usageResult.error);
  if (usageResult.error) {
    console.error('get_storage_usage failed:', usageResult.error.message);
  }

  const plan: UserPlan = (planResult.data as UserPlan | null) || 'free';
  return {
    plan,
    usage: usageUnavailable ? 0 : Number(usageResult.data ?? 0),
    quota: DEFAULT_STORAGE_QUOTA[plan] ?? DEFAULT_STORAGE_QUOTA.free,
    currentPeriodEnd: (rowResult.data?.current_period_end as string | undefined) ?? null,
    usageUnavailable,
  };
};
