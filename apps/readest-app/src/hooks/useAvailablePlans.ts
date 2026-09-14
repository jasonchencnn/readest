import { useEffect, useState } from 'react';
import { fetchAndTransformIAPPlans, isIAPAvailable } from '@/libs/payment/iap/client';
import { fetchStripePlans } from '@/libs/payment/stripe/client';
import { MEMBERSHIP_PLANS } from '@/services/constants';
import { getRuntimeConfig } from '@/services/runtimeConfig';
import { AvailablePlan } from '@/types/quota';
import { stubTranslation as _ } from '@/utils/misc';

const IAP_PRODUCT_IDS = [
  'com.bilingify.readest.monthly.plus',
  'com.bilingify.readest.monthly.pro',
  'com.bilingify.readest.yearly.plus',
  'com.bilingify.readest.yearly.pro',
  'com.bilingify.readest.storage.1gb.purchase',
  'com.bilingify.readest.storage.2gb.purchase',
  'com.bilingify.readest.storage.5gb.purchase',
  'com.bilingify.readest.storage.10gb.purchase',
  'com.bilingify.readest.customization.purchase',
];

interface UseAvailablePlansParams {
  hasIAP: boolean;
  onError?: (message: string) => void;
}

export const useAvailablePlans = ({ hasIAP, onError }: UseAvailablePlansParams) => {
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([]);
  const [iapAvailable, setIapAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Moyue CN build: plans are the compile-time membership tiers, purchased
    // through the epay gateway — nothing to fetch. Read at effect time (not
    // module load): the runtime config script lands before hydration, but
    // never during SSR.
    if (getRuntimeConfig()?.paymentProvider === 'epay') {
      setAvailablePlans(MEMBERSHIP_PLANS);
      setIapAvailable(false);
      return;
    }

    const fetchPlans = async () => {
      setLoading(true);
      setError(null);

      try {
        if (hasIAP && (await isIAPAvailable())) {
          const plans = await fetchAndTransformIAPPlans(IAP_PRODUCT_IDS);
          setAvailablePlans(plans);
          setIapAvailable(true);
        } else {
          const plans = await fetchStripePlans();
          setAvailablePlans(plans);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        console.error(`Failed to fetch ${hasIAP ? 'IAP' : 'Stripe'} plans:`, error);

        if (onError) {
          onError(_('Failed to load subscription plans.'));
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, [hasIAP, onError]);

  return { availablePlans, iapAvailable, loading, error };
};
