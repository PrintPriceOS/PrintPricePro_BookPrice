import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BuildingLibraryIcon,
  CreditCardIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

interface Props {
  cpOrderId: string;
  fetchDetails?: () => void;
  onRefresh?: () => void;
}

interface CPInvoiceStatus {
  ok: boolean;
  orderId: string;
  orderStatus: string;
  invoiceReady: boolean;
  blockers: string[];
  invoice?: {
    status?: string;
    invoiceNumber?: string;
    invoice_number?: string;
    amount?: number;
    currency?: string;
  };
  payment?: {
    status?: string;
    provider?: string;
    checkout_url?: string;
    instructions?: {
      account_name?: string;
      beneficiary?: string;
      iban?: string;
      swift?: string;
      bic?: string;
      reference?: string;
      amount?: number;
      currency?: string;
    };
  };
}

const CustomerPaymentPanel: React.FC<Props> = ({ cpOrderId, fetchDetails, onRefresh }) => {
  const [data, setData] = useState<CPInvoiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const fetchStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace-order/${cpOrderId}/invoice/status`);
      if (!res.ok) {
        throw new Error(`Failed to fetch payment status: HTTP ${res.status}`);
      }
      const json: CPInvoiceStatus = await res.json();
      setData(json);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while fetching billing details.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [cpOrderId]);

  // Load status on mount/change
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Generate invoice action
  const handleGenerateInvoice = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace-order/${cpOrderId}/invoice/generate`, {
        method: 'POST',
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.message || 'Failed to generate invoice.');
      }
      await fetchStatus();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate invoice.');
    } finally {
      setGenerating(false);
    }
  };

  const paymentStatus = data?.payment?.status || data?.orderStatus;
  const isPending = data?.payment?.status === 'PAYMENT_PENDING';
  const isConfirmed = ['PAYMENT_CONFIRMED', 'PAID'].includes(paymentStatus || '');
  const isFailed = paymentStatus === 'PAYMENT_FAILED';
  const isBlocked = !data?.invoiceReady || (data?.blockers && data.blockers.length > 0);
  const isTerminal = isConfirmed || isFailed || isBlocked;

  // Trigger parent updates on terminal status (exactly once per mounted panel/terminal transition)
  const hasTriggeredTerminalRefresh = useRef(false);
  useEffect(() => {
    if (isTerminal) {
      if (!hasTriggeredTerminalRefresh.current) {
        hasTriggeredTerminalRefresh.current = true;
        if (fetchDetails) fetchDetails();
        if (onRefresh) onRefresh();
      }
    } else {
      hasTriggeredTerminalRefresh.current = false;
    }
  }, [isTerminal, fetchDetails, onRefresh]);

  // Polling logic
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    const pollPaymentStatus = async () => {
      try {
        const res = await fetch(`/api/marketplace-order/${cpOrderId}/payment/status`);
        if (!res.ok) return;
        const statusJson = await res.json();
        
        const nextStatus = statusJson?.payment?.status || statusJson?.orderStatus;
        
        // Update data state with new payment and status information
        setData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            orderStatus: statusJson.orderStatus || prev.orderStatus,
            invoiceReady: statusJson.invoiceReady !== undefined ? statusJson.invoiceReady : prev.invoiceReady,
            payment: {
              ...(prev.payment || {}),
              ...statusJson.payment,
              status: nextStatus
            }
          };
        });

        // Terminate polling if status is no longer PENDING or if it becomes blocked
        const isTerminal = ['PAYMENT_CONFIRMED', 'PAID', 'PAYMENT_FAILED'].includes(nextStatus || '') || 
                           !statusJson.invoiceReady;
                           
        if (isTerminal && intervalId) {
          clearInterval(intervalId);
          setIsPolling(false);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    if (isPending && !isBlocked) {
      setIsPolling(true);
      intervalId = setInterval(pollPaymentStatus, 5000);
    } else {
      setIsPolling(false);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPending, isBlocked, cpOrderId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-corporate-secondary border border-corporate-border text-corporate-muted">
        <ArrowPathIcon className="w-6 h-6 animate-spin mb-2" />
        <span className="text-[0.65rem] font-technical uppercase tracking-widest">
          Loading sovereign billing status...
        </span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-5 bg-corporate-accent/5 border border-corporate-accent/20 text-corporate-accent flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="w-5 h-5" />
          <span className="text-[0.7rem] font-black uppercase tracking-widest">Sovereign Billing Error</span>
        </div>
        <p className="text-[0.65rem]">{error}</p>
        <button
          onClick={() => fetchStatus()}
          className="mt-2 self-start px-4 py-2 border border-corporate-accent/20 hover:bg-corporate-accent/10 text-[0.6rem] font-black uppercase tracking-widest transition-all"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-corporate-secondary border border-corporate-border overflow-hidden">
      <div className="h-[2px] w-full bg-corporate-accent/50" />
      <div className="p-6">
        
        {/* Title & Status */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-corporate-accent/10 border border-corporate-accent/20">
              <DocumentTextIcon className="w-5 h-5 text-corporate-accent" />
            </div>
            <div>
              <h3 className="text-[0.75rem] font-black uppercase tracking-widest text-corporate-text">
                Billing & Invoice
              </h3>
              <p className="text-[0.6rem] font-technical text-corporate-muted uppercase tracking-wider">
                Sovereign ControlPlane Billing Flow
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPolling && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
              </span>
            )}
            <span className={`text-[0.65rem] font-black uppercase tracking-widest ${
              isConfirmed ? 'text-green-500' : isPending ? 'text-yellow-500' : isBlocked ? 'text-corporate-accent' : 'text-corporate-muted'
            }`}>
              {isBlocked ? 'INVOICE_BLOCKED' : paymentStatus || 'READY_FOR_INVOICE'}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-corporate-accent/5 border border-corporate-accent/20 text-[0.65rem] text-corporate-accent font-bold uppercase tracking-wider">
            {error}
          </div>
        )}

        {/* State 1: INVOICE_BLOCKED */}
        {isBlocked && (
          <div className="space-y-4">
            <div className="p-4 bg-corporate-accent/5 border border-corporate-accent/20 flex gap-4">
              <ExclamationTriangleIcon className="w-5 h-5 text-corporate-accent shrink-0" />
              <div>
                <p className="text-[0.7rem] font-bold text-corporate-accent uppercase tracking-wider mb-1">
                  Invoice Generation Blocked
                </p>
                <p className="text-[0.65rem] text-corporate-text-secondary">
                  The billing flow is currently blocked by sovereign validation constraints:
                </p>
                <ul className="mt-2 list-disc pl-4 space-y-1 text-[0.65rem] text-corporate-text-secondary">
                  {data.blockers && data.blockers.length > 0 ? (
                    data.blockers.map((blocker, idx) => (
                      <li key={idx} className="font-bold text-corporate-accent">{blocker.replace(/_/g, ' ')}</li>
                    ))
                  ) : (
                    <li>Awaiting necessary order specifications and asset registration checks.</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="p-3 bg-corporate-primary/50 border border-corporate-border flex gap-3">
              <InformationCircleIcon className="w-4 h-4 text-corporate-muted shrink-0" />
              <div>
                <p className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted mb-1">Remediation Guidance</p>
                <p className="text-[0.6rem] text-corporate-text-secondary leading-tight italic">
                  Ensure both your Interior PDF and Cover PDF have successfully uploaded, and check for any warnings in the Preflight panel above.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* State 2: READY_FOR_INVOICE / invoiceReady is true with no invoice */}
        {!isBlocked && !data.invoice?.invoiceNumber && !data.invoice?.invoice_number && data.invoiceReady && (
          <div className="flex flex-col items-center justify-center py-6 bg-corporate-primary/20 border border-corporate-border gap-4">
            <p className="text-[0.7rem] text-corporate-text-secondary text-center max-w-[320px]">
              Your assets and specifications are verified. Click below to generate the invoice and unlock secure checkout.
            </p>
            <button
              onClick={handleGenerateInvoice}
              disabled={generating}
              className="flex items-center gap-2 bg-corporate-accent hover:bg-corporate-accent-hover px-8 py-3 text-[0.7rem] font-black uppercase tracking-monolith text-white transition-all disabled:opacity-50"
            >
              {generating ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Generate Invoice'}
            </button>
          </div>
        )}

        {/* State 3: PAYMENT_PENDING + bank_transfer */}
        {!isBlocked && isPending && data.payment?.provider === 'bank_transfer' && (
          <div className="bg-corporate-accent/5 border border-corporate-accent/20 p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <BuildingLibraryIcon className="w-4 h-4 text-corporate-accent" />
              <span className="text-[0.7rem] font-black uppercase tracking-widest text-corporate-text">Bank Transfer Instructions</span>
            </div>
            
            <div className="space-y-2 text-[0.65rem] font-technical">
              <div className="flex justify-between border-b border-corporate-border pb-1">
                <span className="text-corporate-muted">Beneficiary</span>
                <span className="text-corporate-text text-right text-corporate-text font-bold">
                  {data.payment.instructions?.beneficiary || data.payment.instructions?.account_name || 'PrintPricePro Marketplace'}
                </span>
              </div>
              <div className="flex justify-between border-b border-corporate-border pb-1">
                <span className="text-corporate-muted">IBAN</span>
                <span className="text-corporate-text text-right font-bold text-corporate-text">
                  {data.payment.instructions?.iban || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between border-b border-corporate-border pb-1">
                <span className="text-corporate-muted">BIC/SWIFT</span>
                <span className="text-corporate-text text-right">
                  {data.payment.instructions?.swift || data.payment.instructions?.bic || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between border-b border-corporate-border pb-1 pt-2">
                <span className="text-corporate-accent font-bold">Reference</span>
                <span className="text-corporate-text font-black text-right text-corporate-text tracking-wider">
                  {data.payment.instructions?.reference || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-corporate-muted">Amount</span>
                <span className="text-corporate-text font-black text-right text-corporate-text">
                  {data.payment.instructions?.currency || 'EUR'} {(data.payment.instructions?.amount ?? 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-3 bg-corporate-accent/10 flex gap-3">
              <InformationCircleIcon className="w-4 h-4 text-corporate-accent shrink-0" />
              <p className="text-[0.55rem] text-corporate-text-secondary leading-tight italic">
                Please issue the bank transfer with the exact reference shown above. Once confirmed by the network, your order will transition automatically.
              </p>
            </div>
          </div>
        )}

        {/* State 4: PAYMENT_PENDING + stripe */}
        {!isBlocked && isPending && data.payment?.provider === 'stripe' && (
          <div className="space-y-4">
            {data.payment?.checkout_url ? (
              <a
                href={data.payment.checkout_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-4 bg-corporate-accent hover:bg-corporate-accent-hover border border-corporate-accent/20 text-center text-[0.75rem] font-black uppercase tracking-[0.2em] text-white transition-all shadow-[0_0_20px_rgba(220,0,0,0.15)]"
              >
                <CreditCardIcon className="w-4 h-4" />
                Continue to Secure Payment
              </a>
            ) : (
              <div className="p-4 bg-corporate-accent/5 border border-corporate-accent/20 text-center">
                <p className="text-[0.65rem] text-corporate-accent italic">
                  Stripe integration checkout URL is currently missing. Please refresh.
                </p>
              </div>
            )}
          </div>
        )}

        {/* State 5: PAYMENT_CONFIRMED / PAID */}
        {isConfirmed && (
          <div className="bg-green-500/5 border border-green-500/20 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
              <span className="text-[0.75rem] font-black uppercase tracking-widest text-green-500">
                Payment Confirmed
              </span>
            </div>
            <p className="text-[0.65rem] text-corporate-text-secondary leading-normal">
              Your payment has been successfully recorded on the ControlPlane and synchronized locally. The order intent is now unlocked and has been submitted to the production queue.
            </p>
            {data.invoice && (
              <div className="mt-3 pt-3 border-t border-corporate-border flex justify-between text-[0.6rem] font-technical text-corporate-muted">
                <span>Invoice: {data.invoice.invoiceNumber || data.invoice.invoice_number || 'N/A'}</span>
                <span>Amount: {data.invoice.currency || 'EUR'} {(data.invoice.amount ?? 0).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* State 6: PAYMENT_FAILED */}
        {isFailed && (
          <div className="bg-corporate-accent/10 border border-corporate-accent/30 p-5 space-y-2">
            <div className="flex items-center gap-2 text-corporate-accent">
              <ExclamationTriangleIcon className="w-5 h-5" />
              <span className="text-[0.75rem] font-black uppercase tracking-widest">
                Payment Failed
              </span>
            </div>
            <p className="text-[0.65rem] text-corporate-text-secondary leading-normal">
              The transaction could not be completed. Please review your details and contact bank support or try another checkout method.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default CustomerPaymentPanel;
