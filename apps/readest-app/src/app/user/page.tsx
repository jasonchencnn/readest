'use client';

import clsx from 'clsx';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';
import { useQuotaStats } from '@/hooks/useQuotaStats';
import { useTranslation } from '@/hooks/useTranslation';
import { useUserActions } from '@/hooks/useUserActions';
import { useAvailablePlans } from '@/hooks/useAvailablePlans';
import type { PlanType } from '@/types/quota';
import { navigateToLibrary } from '@/utils/nav';
import { eventDispatcher } from '@/utils/event';
import { getAPIBaseUrl, isTauriAppPlatform } from '@/services/environment';
import { getRuntimeConfig } from '@/services/runtimeConfig';
import { MEMBERSHIP_PLANS } from '@/services/constants';
import { getPlanDetails } from './utils/plan';
import { Toast } from '@/components/Toast';
import {
  purchaseIAPProduct,
  restoreIAPPurchases,
  verifyApplePurchaseProducts,
  verifyGooglePurchaseProducts,
  getSubscriptionSuccessUrl as getIAPSubscriptionSuccessUrl,
} from '@/libs/payment/iap/client';
import { isPurchaseProduct } from '@/libs/payment/iap/utils';
import {
  createStripeCheckoutSession,
  redirectToStripeCheckout,
  createStripePortalSession,
  redirectToStripePortal,
  handleStripeCheckoutError,
  getSubscriptionSuccessUrl as getStripeSubscriptionSuccessUrl,
  type StripeAvailablePlan,
} from '@/libs/payment/stripe/client';
import LegalLinks from '@/components/LegalLinks';
import Spinner from '@/components/Spinner';
import ProfileHeader from './components/Header';
import UserInfo from './components/UserInfo';
import UsageStats from './components/UsageStats';
import PlansComparison from './components/PlansComparison';
import AccountActions from './components/AccountActions';
import StorageManager from './components/StorageManager';
import SharedLinksSection from './components/SharedLinksSection';
import RedemptionCard from './components/RedemptionCard';
import { SyncPassphraseSection } from './components/SyncPassphraseSection';
import { SyncCategoriesSection } from './components/SyncCategoriesSection';
import Checkout from './components/Checkout';

type CheckoutState = {
  clientSecret: string;
  sessionId: string;
  planName: string;
};

type EpayCheckout = {
  productId: string;
  planName: string;
};

const ProfilePage = () => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { token, user, refresh } = useAuth();
  const { safeAreaInsets, isRoundedWindow } = useThemeStore();

  const [loading, setLoading] = useState(false);
  const [showEmbeddedCheckout, setShowEmbeddedCheckout] = useState(false);
  const [showStorageManager, setShowStorageManager] = useState(false);
  const [showSharedLinksManager, setShowSharedLinksManager] = useState(false);
  const searchParams = useSearchParams();
  const [showSyncManager, setShowSyncManager] = useState(
    () => searchParams?.get('section') === 'sync',
  );
  const [checkoutState, setCheckoutState] = useState<CheckoutState>({
    clientSecret: '',
    sessionId: '',
    planName: '',
  });
  const [epayCheckout, setEpayCheckout] = useState<EpayCheckout | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;

    const isAuthenticated = user && token && appService;
    if (isAuthenticated) return;

    const timer = setTimeout(() => {
      router.push('/auth?redirect=/library');
    }, 1000);

    return () => clearTimeout(timer);
  }, [mounted, user, token, appService, router]);

  useTheme({ systemUIVisible: false });

  // Returning from the payment gateway (?payment=success&orderNo=…): poll the
  // order until the async notify has flipped it to paid, then reload so
  // useQuotaStats picks up the new tier. Web-only UX — desktop/mobile users
  // come back to a fresh /user load anyway.
  useEffect(() => {
    if (!mounted || !token) return;
    const payment = searchParams?.get('payment');
    const orderNo = searchParams?.get('orderNo');
    if (payment === 'failed') {
      eventDispatcher.dispatch('toast', {
        type: 'warning',
        message: _('Payment not completed. Please try again.'),
      });
      return;
    }
    if (payment !== 'success' || !orderNo) return;

    let cancelled = false;
    const pollOrder = async () => {
      for (let attempt = 0; attempt < 10 && !cancelled; attempt++) {
        try {
          const res = await fetch(
            `${getAPIBaseUrl()}/pay/query?orderNo=${encodeURIComponent(orderNo)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok) {
            const { order } = (await res.json()) as { order?: { status?: string } };
            if (order?.status === 'paid') {
              if (!cancelled) {
                eventDispatcher.dispatch('toast', {
                  type: 'success',
                  message: _('Payment successful! Your membership is now active.'),
                });
                window.location.reload();
              }
              return;
            }
          }
        } catch {
          // keep polling
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!cancelled) {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: _('Payment is being confirmed. Please refresh in a moment.'),
        });
      }
    };
    pollOrder();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, token]);

  // Read at render time (client): the runtime-config script lands before
  // hydration; during SSR this resolves to undefined → stripe path, which
  // never matters since subscribe handlers only fire on user clicks.
  const isEpayProvider = getRuntimeConfig()?.paymentProvider === 'epay';

  const { quotas, userProfilePlan = 'free', refresh: refreshPlanStats } = useQuotaStats();
  const {
    handleLogout,
    handleResetPassword,
    handleUpdateEmail,
    handleConfirmDelete,
    handleDeleteAllBooks,
  } = useUserActions();

  const { availablePlans, iapAvailable } = useAvailablePlans({
    hasIAP: appService?.hasIAP || false,
    onError: useCallback(
      (message: string) => {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: _(message),
        });
      },
      [_],
    ),
  });

  const handleGoBack = () => {
    if (showEmbeddedCheckout) {
      setShowEmbeddedCheckout(false);
    } else if (showStorageManager) {
      setShowStorageManager(false);
      refresh();
    } else if (showSharedLinksManager) {
      setShowSharedLinksManager(false);
    } else if (showSyncManager) {
      setShowSyncManager(false);
    } else {
      navigateToLibrary(router);
    }
  };

  const handleStripeSubscribe = async (productId?: string, planType: PlanType = 'subscription') => {
    if (!productId) return;

    setLoading(true);
    try {
      const { sessionId, clientSecret, url } = await createStripeCheckoutSession(
        productId,
        planType,
      );

      const foundPlan = availablePlans.find((plan) => plan.productId === productId);

      if (!foundPlan) {
        throw new Error(`Plan not found for product ID: ${productId}`);
      }

      const selectedPlan = foundPlan as StripeAvailablePlan;
      const planName = selectedPlan.product?.name || selectedPlan.productName;

      const isEmbeddedCheckout = isTauriAppPlatform();
      if (isEmbeddedCheckout && sessionId && clientSecret) {
        setShowEmbeddedCheckout(true);
        setCheckoutState({
          planName,
          clientSecret,
          sessionId,
        });
      } else {
        await redirectToStripeCheckout(url);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      handleStripeCheckoutError(errorMessage);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Failed to create checkout session'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckoutSuccess = useCallback(
    (sessionId: string) => {
      setShowEmbeddedCheckout(false);
      router.push(getStripeSubscriptionSuccessUrl(sessionId));
    },
    [router],
  );

  const handleIAPSubscribe = async (productId?: string) => {
    if (!productId) return;

    setLoading(true);
    try {
      const purchase = await purchaseIAPProduct(productId);
      if (purchase) {
        router.push(getIAPSubscriptionSuccessUrl(purchase));
      }
    } catch (error) {
      console.error('IAP purchase error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleIAPRestorePurchase = async () => {
    setLoading(true);
    try {
      const purchases = await restoreIAPPurchases();
      if (purchases.length > 0) {
        // Restored one-time purchases (storage add-ons) may still be
        // unconsumed on Google Play, blocking repurchase; re-verifying lets
        // the server consume them. On iOS, restore is the only flow that can
        // record a purchase whose original verification never reached the
        // server, so re-verify those too.
        await verifyGooglePurchaseProducts(purchases);
        await verifyApplePurchaseProducts(purchases);
        const restoredSubscriptions = purchases
          .filter((p) => !isPurchaseProduct(p.productId))
          .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
        const purchase = restoredSubscriptions[0];

        if (purchase) {
          router.push(getIAPSubscriptionSuccessUrl(purchase));
        } else if (purchases.some((p) => isPurchaseProduct(p.productId))) {
          eventDispatcher.dispatch('toast', {
            type: 'info',
            message: _('Purchases restored successfully.'),
          });
        } else {
          throw new Error('No subscription found in restored purchases');
        }
      } else {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: _('No purchases found to restore.'),
        });
      }
    } catch (error) {
      console.error('Failed to restore purchases:', error);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Failed to restore purchases.'),
      });
    }
    setLoading(false);
  };

  const handleEpaySubscribe = (productId?: string) => {
    if (!productId) return;
    const membership = MEMBERSHIP_PLANS.find((p) => p.productId === productId);
    if (!membership) return;
    setEpayCheckout({ productId, planName: membership.productName });
  };

  const handleEpayPay = async (channel: 'wechat' | 'alipay') => {
    if (!epayCheckout || !token) return;
    const membership = MEMBERSHIP_PLANS.find((p) => p.productId === epayCheckout.productId);
    if (!membership) return;
    setLoading(true);
    try {
      const response = await fetch(`${getAPIBaseUrl()}/pay/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: membership.plan, channel }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        payUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.payUrl) {
        throw new Error(data.error || 'Could not create payment');
      }
      setEpayCheckout(null);
      // The gateway page opens outside the app; the async notify credits the
      // order server-side regardless of how the user gets back.
      if (isTauriAppPlatform() && !appService?.isMobileApp) {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(data.payUrl);
      } else {
        window.location.href = data.payUrl;
      }
    } catch (error) {
      console.error('epay checkout error:', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Failed to create checkout session'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (isEpayProvider) {
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('For subscription management, please contact the administrator.'),
      });
      return;
    }
    setLoading(true);
    try {
      const url = await createStripePortalSession();
      await redirectToStripePortal(url);
    } catch (error) {
      console.error('Error creating portal session:', error);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Failed to manage subscription.'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWithMessage = () => {
    handleConfirmDelete(_('Failed to delete user. Please try again later.'));
  };

  const handleDeleteAllBooksWithMessage = () => {
    handleDeleteAllBooks(
      _('All books deleted.'),
      _('Failed to delete books. Please try again later.'),
    );
  };

  const handleManageStorage = () => {
    setShowStorageManager(true);
  };

  const handleManageSharedLinks = () => {
    setShowSharedLinksManager(true);
  };
  const handleManageSync = () => {
    setShowSyncManager(true);
  };

  if (!mounted) {
    return null;
  }

  if (!user || !token || !appService) {
    return (
      <div className='mx-auto max-w-4xl px-4 py-8'>
        <div className='overflow-hidden rounded-lg shadow-md'>
          <div className='flex min-h-[300px] items-center justify-center p-6'>
            <div className='text-base-content animate-pulse'>{_('Loading profile...')}</div>
          </div>
        </div>
      </div>
    );
  }

  const avatarUrl = user?.user_metadata?.['picture'] || user?.user_metadata?.['avatar_url'];
  const userFullName = user?.user_metadata?.['full_name'] || '-';
  const userEmail = user?.email || '';
  const userPlanDetails =
    getPlanDetails(userProfilePlan, availablePlans) || getPlanDetails('free', availablePlans);

  return (
    <div
      className={clsx(
        'bg-base-100 full-height inset-0 select-none overflow-hidden',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <div
        className={clsx('flex h-full w-full flex-col items-center overflow-y-auto')}
        style={{
          paddingTop: `${safeAreaInsets?.top || 0}px`,
        }}
      >
        <ProfileHeader onGoBack={handleGoBack} />
        <div className='w-full min-w-60 max-w-4xl py-10'>
          {loading && (
            <div className='fixed inset-0 z-50 flex items-center justify-center'>
              <Spinner loading className='text-gray-900' />
            </div>
          )}
          {showEmbeddedCheckout ? (
            <div className='bg-base-100 rounded-lg p-4'>
              <Checkout
                clientSecret={checkoutState.clientSecret}
                sessionId={checkoutState.sessionId}
                planName={checkoutState.planName}
                onSuccess={handleCheckoutSuccess}
              />
            </div>
          ) : (
            <div className='sm:bg-base-200 overflow-hidden rounded-lg sm:p-6 sm:shadow-md'>
              <div className='flex flex-col gap-y-8'>
                <div className='flex flex-col gap-y-8 px-6'>
                  <UserInfo
                    avatarUrl={avatarUrl}
                    userFullName={userFullName}
                    userEmail={userEmail}
                    planDetails={userPlanDetails}
                  />

                  {!showStorageManager && !showSharedLinksManager && !showSyncManager && (
                    <UsageStats quotas={quotas} />
                  )}
                </div>

                {showStorageManager ? (
                  <div className='flex flex-col gap-y-8 px-6'>
                    <StorageManager />
                  </div>
                ) : showSharedLinksManager ? (
                  <div className='flex flex-col gap-y-8 px-6'>
                    <SharedLinksSection />
                  </div>
                ) : showSyncManager ? (
                  <div className='flex flex-col gap-y-8 px-6'>
                    <SyncCategoriesSection />
                    <SyncPassphraseSection />
                  </div>
                ) : (
                  <>
                    <div className='flex flex-col gap-y-8 sm:px-6'>
                      <PlansComparison
                        availablePlans={availablePlans}
                        userPlan={userProfilePlan}
                        onSubscribe={
                          appService.hasIAP && iapAvailable
                            ? handleIAPSubscribe
                            : isEpayProvider
                              ? handleEpaySubscribe
                              : handleStripeSubscribe
                        }
                      />
                      <RedemptionCard onRedeemed={refreshPlanStats} />
                    </div>
                    <div className='flex flex-col gap-y-8 px-6'>
                      <AccountActions
                        userPlan={userProfilePlan}
                        iapAvailable={iapAvailable}
                        onLogout={handleLogout}
                        onResetPassword={handleResetPassword}
                        onUpdateEmail={handleUpdateEmail}
                        onConfirmDelete={handleDeleteWithMessage}
                        onConfirmDeleteAllBooks={handleDeleteAllBooksWithMessage}
                        onRestorePurchase={handleIAPRestorePurchase}
                        onManageSubscription={handleManageSubscription}
                        onManageStorage={handleManageStorage}
                        onManageSharedLinks={handleManageSharedLinks}
                        onManageSync={handleManageSync}
                      />
                    </div>
                  </>
                )}

                <LegalLinks />
              </div>
            </div>
          )}
        </div>
        {epayCheckout && (
          <div
            className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6'
            onClick={() => setEpayCheckout(null)}
          >
            <div
              className='bg-base-100 w-full max-w-xs rounded-lg p-6 shadow-xl'
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className='mb-1 text-center text-lg font-semibold'>
                {_('Choose a payment method')}
              </h3>
              <p className='text-base-content/70 mb-5 text-center text-sm'>
                {epayCheckout.planName} · {_('per month')}
              </p>
              <div className='flex flex-col gap-3'>
                <button
                  className='btn btn-primary w-full rounded-lg'
                  disabled={loading}
                  onClick={() => handleEpayPay('wechat')}
                >
                  {_('WeChat Pay')}
                </button>
                <button
                  className='btn w-full rounded-lg'
                  disabled={loading}
                  onClick={() => handleEpayPay('alipay')}
                >
                  {_('Alipay')}
                </button>
              </div>
              <button className='btn btn-ghost mt-2 w-full' onClick={() => setEpayCheckout(null)}>
                {_('Cancel')}
              </button>
            </div>
          </div>
        )}
        <Toast />
      </div>
    </div>
  );
};

export default ProfilePage;
