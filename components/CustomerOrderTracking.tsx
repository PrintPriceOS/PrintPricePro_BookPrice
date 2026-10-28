import React, { useState, useEffect } from 'react';
import { 
  CheckCircleIcon, 
  TruckIcon, 
  ClockIcon, 
  ExclamationCircleIcon,
  CreditCardIcon,
  WrenchIcon,
  DocumentCheckIcon,
  XMarkIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

interface TrackingTimelineItem {
  key: string;
  label: string;
  status: 'DONE' | 'CURRENT' | 'PENDING' | 'BLOCKED';
  timestamp?: string;
  description?: string;
}

interface TrackingView {
  public_ref: string;
  order_intent_id: string;
  customer_status: string;
  headline: string;
  description: string;
  next_action?: string;
  customer_message?: string;
  timeline: TrackingTimelineItem[];
  payment: {
    status: string;
    provider?: string;
    invoice_number?: string;
    amount?: number;
    currency?: string;
  };
  production: {
    status: string;
    printhouse_name?: string;
    accepted_at?: string;
    started_production_at?: string;
    completed_at?: string;
  };
  shipping: {
    carrier?: string;
    tracking_number?: string;
    shipped_at?: string;
    delivery_estimate?: string;
  };
  files: {
    interior_status?: string;
    cover_status?: string;
    preflight_status?: string;
  };
  created_at: string;
}

interface CustomerOrderTrackingProps {
  orderIntentId: string;
  onClose: () => void;
}

export const CustomerOrderTracking: React.FC<CustomerOrderTrackingProps> = ({ orderIntentId, onClose }) => {
  const [tracking, setTracking] = useState<TrackingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTracking = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/orders/${orderIntentId}/tracking`, {
          credentials: 'include'
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load tracking information');
        }
        const data = await res.json();
        setTracking(data.tracking);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTracking();
  }, [orderIntentId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] bg-corporate-primary/95 backdrop-blur-md flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-corporate-accent border-t-transparent animate-spin rounded-full" />
          <p className="text-[0.65rem] font-technical font-black tracking-monolith text-corporate-accent uppercase">
            Synchronizing Tracking Ledger...
          </p>
        </div>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="fixed inset-0 z-[60] bg-corporate-primary/95 backdrop-blur-md flex items-center justify-center p-6">
        <div className="bg-corporate-secondary border border-red-500/30 p-8 max-w-md w-full">
          <h2 className="text-red-500 text-[0.7rem] font-technical font-black tracking-monolith uppercase mb-4">
            Tracking Forensic Error
          </h2>
          <p className="text-sm text-corporate-text-secondary mb-6">{error || 'Unable to retrieve tracking view.'}</p>
          <button 
            onClick={onClose}
            className="w-full bg-corporate-accent hover:bg-corporate-accent-hover text-white py-2 text-[10px] font-black uppercase tracking-monolith transition-colors"
          >
            [×] Close Terminal
          </button>
        </div>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SHIPPED': return <TruckIcon className="w-6 h-6 text-corporate-accent" />;
      case 'COMPLETED': return <CheckCircleIcon className="w-6 h-6 text-green-500" />;
      case 'IN_PRODUCTION': return <WrenchIcon className="w-6 h-6 text-corporate-accent animate-pulse" />;
      case 'ACTION_REQUIRED': return <ExclamationCircleIcon className="w-6 h-6 text-red-500" />;
      default: return <ClockIcon className="w-6 h-6 text-corporate-muted" />;
    }
  };

  const getTimelineIcon = (key: string, status: string) => {
    const isDone = status === 'DONE';
    const isCurrent = status === 'CURRENT';
    const colorClass = isDone ? 'text-corporate-accent' : (isCurrent ? 'text-corporate-accent animate-pulse' : 'text-corporate-muted');

    switch (key) {
      case 'CREATED': return <ClockIcon className={`w-5 h-5 ${colorClass}`} />;
      case 'FILES': return <DocumentCheckIcon className={`w-5 h-5 ${colorClass}`} />;
      case 'PAYMENT': return <CreditCardIcon className={`w-5 h-5 ${colorClass}`} />;
      case 'PRODUCTION': return <WrenchIcon className={`w-5 h-5 ${colorClass}`} />;
      case 'SHIPPING': return <TruckIcon className={`w-5 h-5 ${colorClass}`} />;
      default: return <div className={`w-2 h-2 rounded-full ${isDone ? 'bg-corporate-accent' : 'bg-corporate-muted'}`} />;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-corporate-primary/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-8">
      <div className="bg-corporate-secondary border border-corporate-border w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-black/40 border-b border-corporate-border p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-[0.6rem] font-technical font-black tracking-monolith text-corporate-muted uppercase">
                Order Reference:
              </span>
              <span className="text-[0.7rem] font-technical font-black tracking-monolith text-corporate-accent">
                {tracking.public_ref}
              </span>
            </div>
            <h1 className="text-xl font-black text-corporate-text tracking-tight">Order Tracking View</h1>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-corporate-elevated text-corporate-muted hover:text-corporate-text transition-all"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
            {/* Main Status */}
            <div className="space-y-8">
              <div className="bg-corporate-primary/50 border border-corporate-border p-8 flex items-start gap-6">
                <div className="p-4 bg-corporate-accent/10 rounded-lg">
                  {getStatusIcon(tracking.customer_status)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-2xl font-black text-corporate-text tracking-tight">{tracking.headline}</h2>
                    <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded ${
                      tracking.customer_status === 'SHIPPED' ? 'bg-corporate-accent text-white' : 
                      tracking.customer_status === 'ACTION_REQUIRED' ? 'bg-red-500 text-white' : 'bg-white/10 text-corporate-muted'
                    }`}>
                      {tracking.customer_status}
                    </span>
                  </div>
                  <p className="text-corporate-text-secondary text-sm mb-4">{tracking.description}</p>
                  
                  {tracking.next_action && (
                    <div className="flex items-center gap-2 text-[10px] font-technical font-black tracking-monolith text-corporate-accent uppercase pt-4 border-t border-corporate-border">
                      <ChevronRightIcon className="w-3 h-3" />
                      Next Action: {tracking.next_action}
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h3 className="text-[0.65rem] font-technical font-black tracking-monolith text-corporate-muted uppercase mb-6 flex items-center gap-2">
                  <div className="w-1 h-3 bg-corporate-accent" />
                  Production Timeline
                </h3>
                <div className="space-y-6 ml-3">
                  {tracking.timeline.map((step, idx) => (
                    <div key={step.key} className="relative flex gap-6">
                      {idx !== tracking.timeline.length - 1 && (
                        <div className={`absolute left-2.5 top-5 w-[1px] h-full ${step.status === 'DONE' ? 'bg-corporate-accent' : 'bg-white/10'}`} />
                      )}
                      <div className="relative z-10 bg-corporate-secondary">
                        {getTimelineIcon(step.key, step.status)}
                      </div>
                      <div className="pb-4">
                        <div className="flex items-center gap-3 mb-1">
                          <span className={`text-[11px] font-black uppercase tracking-widest ${
                            step.status === 'DONE' ? 'text-corporate-text' : (step.status === 'CURRENT' ? 'text-corporate-accent' : 'text-corporate-muted')
                          }`}>
                            {step.label}
                          </span>
                          {step.timestamp && (
                            <span className="text-[9px] font-technical text-corporate-muted">
                              {new Date(step.timestamp).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-corporate-text-secondary leading-relaxed max-w-md">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar Details */}
            <div className="space-y-6">
              {/* Payment Summary */}
              <div className="bg-corporate-primary/30 border border-corporate-border p-6 rounded-lg">
                <h4 className="text-[0.6rem] font-technical font-black tracking-monolith text-corporate-muted uppercase mb-4">Payment Summary</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-corporate-muted uppercase">Status</span>
                    <span className={`text-[10px] font-black uppercase ${tracking.payment.status === 'PAID' ? 'text-green-500' : 'text-yellow-500'}`}>
                      {tracking.payment.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-corporate-border">
                    <span className="text-[10px] text-corporate-muted uppercase">Amount</span>
                    <span className="text-[11px] font-black text-corporate-text">
                      {tracking.payment.amount?.toFixed(2)} {tracking.payment.currency}
                    </span>
                  </div>
                  {tracking.payment.invoice_number && (
                    <div className="pt-2 border-t border-corporate-border">
                       <span className="text-[8px] text-corporate-muted uppercase block mb-1">Invoice</span>
                       <span className="text-[10px] font-technical text-corporate-accent break-all">
                         {tracking.payment.invoice_number}
                       </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Production/Shipping */}
              <div className="bg-corporate-primary/30 border border-corporate-border p-6 rounded-lg">
                <h4 className="text-[0.6rem] font-technical font-black tracking-monolith text-corporate-muted uppercase mb-4">Fulfillment</h4>
                <div className="space-y-4">
                  <div>
                    <span className="text-[8px] text-corporate-muted uppercase block mb-1">Facility</span>
                    <span className="text-[10px] font-black text-corporate-text uppercase">{tracking.production.printhouse_name || 'Awaiting Dispatch'}</span>
                  </div>
                  
                  {tracking.shipping.carrier && (
                    <div className="pt-4 border-t border-corporate-border">
                      <span className="text-[8px] text-corporate-muted uppercase block mb-1">Shipping</span>
                      <div className="flex items-center gap-2 mb-1">
                        <TruckIcon className="w-3 h-3 text-corporate-accent" />
                        <span className="text-[10px] font-black text-corporate-text uppercase">{tracking.shipping.carrier}</span>
                      </div>
                      <div className="bg-black/40 p-2 rounded text-[10px] font-technical text-corporate-accent select-all cursor-copy">
                        {tracking.shipping.tracking_number}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Message */}
              {tracking.customer_message && (
                <div className="bg-corporate-accent/5 border border-corporate-accent/20 p-6 rounded-lg">
                  <h4 className="text-[0.6rem] font-technical font-black tracking-monolith text-corporate-accent uppercase mb-2">Notice</h4>
                  <p className="text-[11px] italic text-corporate-text-secondary leading-relaxed">
                    "{tracking.customer_message}"
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-black/20 border-t border-corporate-border p-4 flex justify-center">
           <p className="text-[8px] font-technical text-corporate-muted uppercase tracking-[0.2em]">
             Forensic Production Tracking System v5.3 • Internal Link Encrypted
           </p>
        </div>
      </div>
    </div>
  );
};
