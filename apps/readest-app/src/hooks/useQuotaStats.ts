import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { QuotaType, UserPlan } from '@/types/quota';
import { getTranslationQuota } from '@/utils/access';
import { getDailyUsage } from '@/services/translators/utils';
import { getAPIBaseUrl } from '@/services/environment';
import { setCachedUserPlan } from '@/services/sync/cloudSyncProvider';
import { useTranslation } from './useTranslation';

export const useQuotaStats = (briefName = false) => {
  const _ = useTranslation();
  const { token, user } = useAuth();
  const [quotas, setQuotas] = useState<QuotaType[]>([]);
  const [userProfilePlan, setUserProfilePlan] = useState<UserPlan | undefined>(undefined);

  // Membership state lives server-side (plans/files tables — migration 020);
  // the client JWT carries no plan claim, so resolve it from the API.
  const fetchPlanStats = useCallback(async () => {
    if (!user || !token) return;
    try {
      const response = await fetch(`${getAPIBaseUrl()}/user/plan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`plan fetch failed: ${response.status}`);
      }
      const { plan, usage, quota } = (await response.json()) as {
        plan: UserPlan;
        usage: number;
        quota: number;
      };

      const inGB = quota > 1e9;
      const storageQuota: QuotaType = {
        name: briefName ? _('Storage') : _('Cloud Sync Storage'),
        tooltip: _('{{percentage}}% of Cloud Sync Space Used.', {
          percentage: quota > 0 ? Math.round((usage / quota) * 100) : 0,
        }),
        used: parseFloat((usage / 1024 / 1024 / (inGB ? 1024 : 1)).toFixed(2)),
        total: Math.round((quota / 1024 / 1024 / (inGB ? 1024 : 1)) * 10) / 10,
        unit: inGB ? 'GB' : 'MB',
      };

      const translationUsage = getDailyUsage() || 0;
      const translationQuotaValue = getTranslationQuota(plan);
      const now = new Date();
      const translationResetAt = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
      );
      const translationQuota: QuotaType = {
        name: briefName ? _('Translation') : _('Translation Characters'),
        tooltip: _('{{percentage}}% of Daily Translation Characters Used.', {
          percentage:
            translationQuotaValue > 0
              ? Math.round((translationUsage / translationQuotaValue) * 100)
              : 0,
        }),
        used: Math.round(translationUsage / 1024),
        total: Math.round(translationQuotaValue / 1024),
        unit: 'K',
        resetAt: translationResetAt,
      };

      // Non-React modules (transferManager, syncCategories) need the plan
      // synchronously for the cloud-sync provider gate; cache it here.
      setCachedUserPlan(plan);
      setUserProfilePlan(plan);
      setQuotas([storageQuota, translationQuota]);
    } catch (error) {
      console.error('Failed to load plan stats:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, briefName]);

  useEffect(() => {
    fetchPlanStats();
  }, [fetchPlanStats]);

  return {
    quotas,
    userProfilePlan,
    // Hand the child a way to re-pull plan + quotas after a server-side grant
    // (e.g. /api/redeem) without forcing a full page reload.
    refresh: fetchPlanStats,
  };
};
