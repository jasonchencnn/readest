'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getAPIBaseUrl } from '@/services/environment';
import { MEMBERSHIP_PLANS } from '@/services/constants';
import { eventDispatcher } from '@/utils/event';
import { REDEMPTION_ERROR_CODES, type RedemptionErrorCode } from '@/utils/redemption';

// Standalone card on the /user page that lets a buyer paste a Crockford-shaped
// code and post it to /api/redeem. The server's RPC owns the actual grant
// (locks the code row, extends or starts the plans row); this component only
// normalises the visual input and surfaces the success/failure toast. The
// page-level `useQuotaStats` reload happens implicitly — the caller calls
// `onRedeemed` so the parent can `refresh()` its state and pick up the new
// `plan` / `currentPeriodEnd` from /api/user/plan.
type Props = {
  onRedeemed?: () => void;
};

const RedemptionCard: React.FC<Props> = ({ onRedeemed }) => {
  const _ = useTranslation();
  const { token } = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || submitting) return;
    const trimmed = code.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${getAPIBaseUrl()}/redeem`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        plan?: string;
        monthsAdded?: number;
        error?: RedemptionErrorCode;
        message?: string;
      };

      if (res.ok && body.ok) {
        const planLabel =
          MEMBERSHIP_PLANS.find((p) => p.plan === body.plan)?.productName ?? body.plan ?? '';
        eventDispatcher.dispatch('toast', {
          type: 'success',
          message: _('Redemption success! {{months}} months of {{plan}} activated.', {
            months: body.monthsAdded ?? 0,
            plan: planLabel,
          }),
        });
        setCode('');
        onRedeemed?.();
        return;
      }

      const reason = body.error as RedemptionErrorCode | undefined;
      const toastKey =
        reason === REDEMPTION_ERROR_CODES.invalid_code
          ? 'Redemption code is invalid.'
          : reason === REDEMPTION_ERROR_CODES.expired
            ? 'Redemption code has expired.'
            : reason === REDEMPTION_ERROR_CODES.already_used_or_invalid
              ? 'Redemption code has already been used or is no longer valid.'
              : 'Redemption failed, please try again later.';
      eventDispatcher.dispatch('toast', {
        type: 'warning',
        message: _(toastKey),
      });
    } catch (error) {
      console.error('redemption error:', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Redemption failed, please try again later.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='flex flex-col gap-3 rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm sm:p-6'>
      <h3 className='text-base font-semibold'>{_('Redeem a membership code')}</h3>
      <p className='text-base-content/70 text-sm'>
        {_('Enter the code you received from the seller to activate or extend your membership.')}
      </p>
      <form onSubmit={handleSubmit} className='flex flex-col gap-3 sm:flex-row sm:items-stretch'>
        <input
          type='text'
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={_('XXXX-XXXX-XXXX')}
          autoComplete='off'
          spellCheck={false}
          className='input input-bordered flex-1 font-mono tracking-widest uppercase'
          aria-label={_('Redemption code')}
          disabled={submitting}
        />
        <button
          type='submit'
          className='btn btn-primary sm:w-auto'
          disabled={submitting || !code.trim()}
        >
          {submitting ? `${_('Redeeming')}…` : _('Redeem')}
        </button>
      </form>
      <p className='text-base-content/60 text-xs'>
        {_(
          'Codes are case- and dash-insensitive. Successful redemption extends your current period.',
        )}
      </p>
    </div>
  );
};

export default RedemptionCard;
