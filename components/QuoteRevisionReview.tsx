import React, { useState, useEffect, useCallback } from 'react';
import {
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ScaleIcon,
  BanknotesIcon,
  ShieldCheckIcon,
  ClockIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';

export interface QuoteRevisionReviewProps {
  token: string;
  onClose?: () => void;
  onDecisionCompleted?: (decision: 'ACCEPT' | 'REJECT', result: any) => void;
}

export const QuoteRevisionReview: React.FC<QuoteRevisionReviewProps> = ({
  token,
  onClose,
  onDecisionCompleted,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [decisionMade, setDecisionMade] = useState<'ACCEPT' | 'REJECT' | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpRequired, setOtpRequired] = useState(false);

  const fetchReview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/budget/quote-revisions/review/${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || data.message || 'Failed to load quote revision details.');
      }
      setReviewData(data.review);
      if (data.review?.otp_delivery_status === 'PROVIDER_ACCEPTED' || data.review?.amounts?.delta_net > 50) {
        setOtpRequired(true);
      }
    } catch (err: any) {
      console.error('[QUOTE_REVISION_FETCH_ERROR]', err);
      setError(err.message || 'The revision review token may be expired or invalid.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  const handleRespond = async (decision: 'ACCEPT' | 'REJECT') => {
    if (decision === 'ACCEPT' && otpRequired && !otpCode.trim()) {
      setError('Please enter the 6-digit confirmation code sent to your registered contact.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/budget/quote-revisions/review/${encodeURIComponent(token)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          otpCode: otpCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || data.message || `Failed to submit decision (${decision}).`);
      }

      setDecisionMade(decision);
      setActionSuccess(
        decision === 'ACCEPT'
          ? 'Quote revision ACCEPTED. Specifications and economic ledger have been updated.'
          : 'Quote revision REJECTED. Production proceeds under baseline specifications or operator review.'
      );
      onDecisionCompleted?.(decision, data.result);
    } catch (err: any) {
      console.error('[QUOTE_REVISION_RESPOND_ERROR]', err);
      setError(err.message || 'Error communicating decision to Control Plane.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-corporate-secondary border border-corporate-border rounded-2xl shadow-sm p-6 sm:p-12 flex flex-col items-center justify-center text-center min-w-0">
        <ArrowPathIcon className="w-8 h-8 text-corporate-accent animate-spin mb-4" />
        <p className="text-xs font-technical uppercase font-bold tracking-monolith text-corporate-text">
          Retrieving Governed Quote Revision...
        </p>
        <p className="text-[10px] text-corporate-muted mt-1">
          Validating single-use cryptographic token against PrintPrice OS Control Plane.
        </p>
      </div>
    );
  }

  if (error && !reviewData) {
    return (
      <div className="bg-corporate-secondary border border-corporate-accent/40 rounded-2xl shadow-sm p-5 sm:p-8 min-w-0">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <ExclamationTriangleIcon className="w-6 h-6 text-corporate-accent shrink-0 mt-0.5" />
          <div className="space-y-3 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-sans font-black uppercase tracking-monolith text-corporate-accent">
                Quote Revision Unavailable
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-corporate-accent/15 border border-corporate-accent/30 text-[9px] font-technical uppercase font-bold text-corporate-accent">
                TOKEN_CONSUMED_OR_EXPIRED
              </span>
            </div>
            <p className="text-xs text-corporate-text-secondary leading-relaxed break-words">
              {error}
            </p>
            <p className="text-[11px] text-corporate-muted font-technical">
              This single-use governance token has already been consumed, expired, or superseded by a newer pricing revision.
            </p>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="mt-4 min-h-[42px] px-4 py-2 rounded-xl border border-corporate-border-strong text-corporate-text text-[10px] font-technical uppercase font-bold tracking-monolith hover:border-corporate-accent hover:text-corporate-accent transition-all"
              >
                Return to Configurator
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { amounts, technical_specs, expires_at, revision_id, currency = 'EUR' } = reviewData || {};
  const requestedPaper = technical_specs?.requested_paper || technical_specs?.requested || {
    name: 'Standard Presets (Baseline)',
    category: 'OFFSET',
    gsm: technical_specs?.base_gsm || 90,
    finish: 'Uncoated / Standard',
  };
  const proposedPaper = technical_specs?.proposed_paper || technical_specs?.alternative || {
    name: technical_specs?.paper_name || 'Printer Proposed Alternative',
    category: technical_specs?.category || 'COATED',
    gsm: technical_specs?.revised_gsm || 115,
    finish: 'Silk / Satin',
  };

  const reqGsm = Number(requestedPaper.gsm || 90);
  const propGsm = Number(proposedPaper.gsm || 115);
  const gsmDelta = propGsm - reqGsm;
  const reqCategory = String(requestedPaper.category || 'OFFSET').toUpperCase();
  const propCategory = String(proposedPaper.category || 'COATED').toUpperCase();
  const reqFinish = String(requestedPaper.finish || 'Standard');
  const propFinish = String(proposedPaper.finish || 'Silk / Satin');

  const deltaNet = Number(amounts?.delta_net || 0);
  const isSurcharge = deltaNet > 0;
  const isDiscount = deltaNet < 0;

  return (
    <div className="bg-corporate-secondary border border-corporate-border rounded-2xl shadow-sm relative overflow-hidden transition-all duration-300 min-w-0">
      {/* Top Signal Line */}
      <div className="h-1 bg-corporate-accent w-full" />

      {/* Header */}
      <div className="p-4 sm:p-6 md:p-8 border-b border-corporate-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <DocumentTextIcon className="w-5 h-5 text-corporate-accent shrink-0" />
            <h2 className="text-xs md:text-sm font-sans font-black uppercase tracking-monolith text-corporate-text">
              Technical &amp; Economic Quote Revision
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-corporate-accent/10 border border-corporate-accent/30 text-corporate-accent text-[9px] font-technical font-bold uppercase tracking-wider">
              PR #8 / PR #9 Governed
            </span>
          </div>
          <p className="text-[11px] text-corporate-text-secondary mt-1.5 break-words">
            Revision <span className="font-technical font-bold text-corporate-text">#{revision_id}</span> · The print house has proposed a technical substrate adjustment.
          </p>
        </div>

        {expires_at && (
          <div className="flex items-center gap-2 bg-corporate-primary border border-corporate-border rounded-xl px-3 py-1.5 self-start sm:self-auto shrink-0">
            <ClockIcon className="w-3.5 h-3.5 text-corporate-accent shrink-0" />
            <span className="text-[10px] font-technical uppercase font-bold text-corporate-muted">
              Expires:{' '}
              <span className="text-corporate-text tabular-nums">
                {new Date(expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 min-w-0">
        {/* Success Alert */}
        {actionSuccess && (
          <div className="badge-success border rounded-xl p-4 flex items-start gap-3">
            <CheckCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-technical font-bold uppercase tracking-wider">
                Decision Certified ({decisionMade})
              </p>
              <p className="text-xs text-corporate-text mt-1 break-words">{actionSuccess}</p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="bg-corporate-primary border border-corporate-accent/40 rounded-xl p-4 flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-corporate-accent shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-technical font-bold text-corporate-accent uppercase tracking-wider">
                Submission Error
              </p>
              <p className="text-xs text-corporate-text-secondary mt-1 break-words">{error}</p>
            </div>
          </div>
        )}

        {/* 1. TECHNICAL COMPARISON TABLE */}
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <ScaleIcon className="w-4 h-4 text-corporate-accent shrink-0" />
              <h3 className="text-xs font-sans font-black uppercase tracking-monolith text-corporate-text">
                1. Technical Substrate Comparison
              </h3>
            </div>
            <span className="text-[10px] font-technical uppercase text-corporate-muted">
              Side-by-Side Mill Audit
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
            {/* Baseline Requested Paper */}
            <div className="bg-corporate-primary/80 border border-corporate-border rounded-xl p-4 sm:p-5 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-corporate-border pb-2.5">
                <span className="text-[10px] font-technical uppercase font-bold text-corporate-muted">
                  Originally Requested
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-corporate-elevated border border-corporate-border text-[9px] font-technical uppercase text-corporate-text-secondary">
                  Baseline Spec
                </span>
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-sans font-black uppercase text-corporate-text break-words">
                  {requestedPaper.name || requestedPaper.product_name || 'Standard Offset Paper'}
                </h4>
                <p className="text-[10px] text-corporate-muted font-technical mt-0.5">
                  Category: <span className="text-corporate-text font-bold">{reqCategory}</span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2.5 text-[11px] font-technical border-t border-corporate-border">
                <div>
                  <span className="text-corporate-muted block text-[9px] uppercase">Grammage</span>
                  <span className="text-corporate-text font-bold tabular-nums">{reqGsm} gsm</span>
                </div>
                <div>
                  <span className="text-corporate-muted block text-[9px] uppercase">Finish</span>
                  <span className="text-corporate-text font-bold">{reqFinish}</span>
                </div>
              </div>
            </div>

            {/* Proposed Alternative Paper */}
            <div className="bg-corporate-primary border border-corporate-accent/40 rounded-xl p-4 sm:p-5 space-y-3 relative overflow-hidden min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-corporate-border pb-2.5">
                <span className="text-[10px] font-technical uppercase font-bold text-corporate-accent">
                  Printhouse Proposed Alternative
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-corporate-accent/10 border border-corporate-accent/30 text-[9px] font-technical uppercase font-bold text-corporate-accent">
                  Verified Mill Stock
                </span>
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-sans font-black uppercase text-corporate-text break-words">
                  {proposedPaper.name || proposedPaper.product_name || 'Approved Substitute Material'}
                </h4>
                <p className="text-[10px] text-corporate-muted font-technical mt-0.5">
                  Category: <span className="text-corporate-text font-bold">{propCategory}</span> · Ready at Press Feeder
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2.5 text-[11px] font-technical border-t border-corporate-border">
                <div>
                  <span className="text-corporate-muted block text-[9px] uppercase">Grammage</span>
                  <span className="text-corporate-accent font-black tabular-nums">
                    {propGsm} gsm{' '}
                    {gsmDelta !== 0 && (
                      <span className="text-[10px]">
                        ({gsmDelta > 0 ? `+${gsmDelta}` : gsmDelta}g)
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-corporate-muted block text-[9px] uppercase">Finish</span>
                  <span className="text-corporate-text font-bold">{propFinish}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Technical Delta Summary Bar */}
          <div className="bg-corporate-elevated border border-corporate-border rounded-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ArrowsRightLeftIcon className="w-4 h-4 text-corporate-accent shrink-0" />
              <span className="text-[10px] font-technical font-bold uppercase tracking-wider text-corporate-text">
                Technical Delta Summary:
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-technical">
              <span className="px-2.5 py-0.5 rounded-lg bg-corporate-primary border border-corporate-border text-corporate-text">
                Weight: <strong>{reqGsm}g → {propGsm}g</strong> ({gsmDelta >= 0 ? `+${gsmDelta}g` : `${gsmDelta}g`})
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-corporate-primary border border-corporate-border text-corporate-text">
                Family: <strong>{reqCategory} → {propCategory}</strong>
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-corporate-primary border border-corporate-border text-corporate-text">
                Surface: <strong>{reqFinish} → {propFinish}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* 2. ECONOMIC BREAKDOWN & PRICE DELTA */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center gap-2.5">
            <BanknotesIcon className="w-4 h-4 text-corporate-accent shrink-0" />
            <h3 className="text-xs font-sans font-black uppercase tracking-monolith text-corporate-text">
              2. Economic Reconciliation &amp; Price Delta
            </h3>
          </div>

          <div className="bg-corporate-primary border border-corporate-border rounded-xl p-4 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 divide-y md:divide-y-0 md:divide-x divide-corporate-border">
              {/* Baseline Net */}
              <div className="space-y-1">
                <span className="text-[10px] font-technical uppercase font-bold text-corporate-muted">
                  Baseline Net Price
                </span>
                <p className="text-base sm:text-lg font-technical font-black text-corporate-text tabular-nums">
                  {Number(amounts?.base_net || 0).toFixed(2)} {currency}
                </p>
                <p className="text-[10px] text-corporate-muted">Original accepted quote basis.</p>
              </div>

              {/* Price Delta */}
              <div className="space-y-1 pt-4 md:pt-0 md:pl-6">
                <span className="text-[10px] font-technical uppercase font-bold text-corporate-muted">
                  Price Adjustment (Delta)
                </span>
                <div className="flex items-center gap-2">
                  <p
                    className={`text-base sm:text-lg font-technical font-black tabular-nums ${
                      isSurcharge
                        ? 'text-corporate-accent'
                        : isDiscount
                        ? 'text-emerald-500'
                        : 'text-corporate-text'
                    }`}
                  >
                    {isSurcharge ? `+${deltaNet.toFixed(2)}` : deltaNet.toFixed(2)} {currency}
                  </p>
                  <span
                    className={`text-[9px] font-technical font-bold px-2.5 py-0.5 rounded-full border uppercase ${
                      isSurcharge ? 'badge-warning' : isDiscount ? 'badge-success' : 'bg-corporate-elevated text-corporate-muted border-corporate-border'
                    }`}
                  >
                    {isSurcharge ? 'SURCHARGE' : isDiscount ? 'SAVINGS' : 'NEUTRAL'}
                  </span>
                </div>
                <p className="text-[10px] text-corporate-muted">
                  {isSurcharge
                    ? 'Substrate supplement required for higher spec'
                    : isDiscount
                    ? 'Credit applied for mill stock optimization'
                    : 'Zero economic variation'}
                </p>
              </div>

              {/* Revised Net & Gross */}
              <div className="space-y-1 pt-4 md:pt-0 md:pl-6">
                <span className="text-[10px] font-technical uppercase font-bold text-corporate-accent">
                  Revised Total (Gross)
                </span>
                <p className="text-lg sm:text-xl font-technical font-black text-corporate-text tabular-nums">
                  {Number(amounts?.revised_gross || 0).toFixed(2)} {currency}
                </p>
                <p className="text-[10px] text-corporate-muted tabular-nums">
                  Net: {Number(amounts?.revised_net || 0).toFixed(2)} {currency} + VAT{' '}
                  {amounts?.tax_rate_pct || 21}% ({Number(amounts?.revised_tax || 0).toFixed(2)} {currency})
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. INDUSTRIAL & FINANCIAL GOVERNANCE STATUS */}
        <div className="bg-corporate-primary/70 border border-corporate-border rounded-xl p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4 text-corporate-accent shrink-0" />
            <span className="text-[10px] font-technical font-bold uppercase tracking-wider text-corporate-text">
              Industrial Dispatch &amp; Financial Settlement Gating
            </span>
          </div>
          <div className="text-[11px] text-corporate-text-secondary space-y-1.5 leading-relaxed">
            <p>
              • <strong className="text-corporate-text">Industrial Status:</strong> Technical specifications validated by PrintPrice OS. Dispatch to print house feeder will automatically resume upon quote revision acceptance.
            </p>
            <p>
              • <strong className="text-corporate-text">Financial Settlement:</strong> Current gateway state is{' '}
              <code className="px-2 py-0.5 rounded-md badge-warning border font-technical text-[10px]">
                PRODUCTION_FINANCIAL_INTEGRATION_PENDING
              </code>
              . No automatic payment or credit card debit is executed until live merchant credentials are authenticated.
            </p>
          </div>
        </div>

        {/* 4. CONSENT CONFIRMATION & OTP (IF APPLICABLE) */}
        {!actionSuccess && otpRequired && (
          <div className="bg-corporate-primary border border-corporate-border rounded-xl p-4 sm:p-5 space-y-3">
            <label
              htmlFor="quote-revision-otp"
              className="block text-[11px] font-technical uppercase font-bold text-corporate-text"
            >
              Two-Factor Consent Verification Code
            </label>
            <p className="text-[10px] text-corporate-muted">
              A 6-digit confirmation code has been dispatched to protect this economic adjustment.
            </p>
            <input
              id="quote-revision-otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full max-w-[12rem] py-2.5 px-4 rounded-xl bg-corporate-secondary border border-corporate-border-strong text-center font-technical text-lg tracking-[0.35em] text-corporate-text focus:border-corporate-accent focus:outline-none"
            />
          </div>
        )}

        {/* 5. DECISION ACTIONS */}
        {!actionSuccess && (
          <div className="pt-4 border-t border-corporate-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-[10px] text-corporate-muted font-technical">
              Decision recorded in immutable MySQL ledger table{' '}
              <code className="text-corporate-text font-bold">order_quote_revisions</code>.
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleRespond('REJECT')}
                disabled={submitting}
                className="w-full sm:w-auto min-h-[44px] px-5 py-3 rounded-xl border border-corporate-border-strong hover:border-corporate-accent text-corporate-text-secondary hover:text-corporate-text text-[10px] font-technical uppercase font-bold tracking-monolith transition-all disabled:opacity-50 text-center"
              >
                {submitting ? 'Submitting...' : 'Reject Revision'}
              </button>

              <button
                type="button"
                onClick={() => handleRespond('ACCEPT')}
                disabled={submitting || (otpRequired && otpCode.length < 6)}
                className="w-full sm:w-auto min-h-[44px] px-6 py-3 rounded-xl bg-corporate-accent hover:bg-corporate-hover text-white text-[10px] font-technical uppercase font-black tracking-monolith shadow-sm transition-all disabled:opacity-50 text-center"
              >
                {submitting ? 'Confirming...' : 'Accept Revision & Proceed'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteRevisionReview;
