import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  ShoppingBagIcon,
  CalendarIcon,
  PrinterIcon,
  CurrencyDollarIcon,
  DocumentCheckIcon,
  CreditCardIcon,
  BuildingLibraryIcon,
  InformationCircleIcon,
  TruckIcon,
  CheckBadgeIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { OrderIntent } from '../types';
import OrderIntentPreflightPanel from './OrderIntentPreflightPanel';
import CustomerPaymentPanel from './CustomerPaymentPanel';

interface Props {
  orderIntentId: string;
  onClose: () => void;
  onReset?: () => void;
}

const getSelectedOfferSnapshot = (obj: any): any => {
  if (!obj) return null;
  return (
    obj?.offer?.selected_offer_snapshot ||
    obj?.offer?.selectedOfferSnapshot ||
    obj?.selected_offer_snapshot ||
    obj?.selectedOfferSnapshot ||
    obj?.snapshot?.offer?.selected_offer_snapshot ||
    obj?.payload?.order_snapshot?.offer?.selected_offer_snapshot ||
    null
  );
};

const OrderIntentDetails: React.FC<Props> = ({ orderIntentId, onClose, onReset }) => {
  const [intent, setIntent] = useState<OrderIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`/api/order-intents/${orderIntentId}`);
      if (res.status === 403) {
        setError("ACCESS_DENIED: You do not have permission to view this order intent. It may belong to a different session.");
        return;
      }
      if (res.status === 429) {
        setError("TOO_MANY_REQUESTS: You are sending requests too quickly. Please wait a moment and try again.");
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || data.error || 'Failed to load order intent details.');
        return;
      }
      setIntent(data.order_intent);
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [orderIntentId]);

  // Viewport Hardening (v5.3)
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    
    // Prevent background scroll
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = originalStyle;
    };
  }, [onClose]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-corporate-secondary/80 backdrop-blur-md">
        <div className="flex flex-col items-center gap-4">
          <ArrowPathIcon className="w-8 h-8 text-corporate-accent animate-spin" />
          <span className="text-[0.7rem] font-technical uppercase tracking-widest text-corporate-muted">Loading Details…</span>
        </div>
      </div>
    );
  }

  if (error || !intent) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-corporate-secondary/80 backdrop-blur-md p-8">
        <div className="max-w-md w-full bg-corporate-primary border border-corporate-accent/30 p-8 text-center">
          <ExclamationCircleIcon className="w-12 h-12 text-corporate-accent mx-auto mb-4" />
          <p className="text-[0.8rem] font-bold text-corporate-accent uppercase tracking-wider mb-6">{error || 'Order Intent not found'}</p>
          <button onClick={onClose} className="bg-corporate-secondary border border-white/10 px-6 py-2 text-[0.7rem] font-black uppercase tracking-widest text-corporate-text hover:bg-white/5 transition-colors">
            Close
          </button>
        </div>
      </div>
    );
  }

  // Formatting Helpers
  const normalizeNum = (val: any, fallback = 0) => {
    if (val === undefined || val === null || val === '') return fallback;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  };

  const normalizeText = (val: any, fallback = 'N/A') => {
    if (val === undefined || val === null || val === '') return fallback;
    return String(val);
  };

  const normalizeBinding = (val: any) => {
    const text = normalizeText(val);
    if (text === 'N/A') return 'N/A';
    return text.replace(/_/g, ' ').toUpperCase();
  };

  // Specs resolution with priority: payload > offer_snapshot > raw_specs
  const snapshot = intent.payload?.order_snapshot;
  const offerSnapshot = getSelectedOfferSnapshot(intent);
  const rawSpecs = offerSnapshot?.raw_offer_snapshot?.specs || offerSnapshot?.specs || {};
  
  // Safe currency fallback as requested
  const displayCurrency = intent.totals?.currency || intent.payment?.currency || (intent as any).invoice?.currency || 'EUR';
  
  const specs = {
    format: normalizeText(snapshot?.specs?.format || rawSpecs?.book_size || rawSpecs?.format, 'Custom'),
    copies: normalizeNum(snapshot?.specs?.copies || rawSpecs?.copies, 0),
    pages: normalizeNum(snapshot?.specs?.interior_pages || rawSpecs?.interior_pages || snapshot?.specs?.total_pages, 0),
    binding: normalizeBinding(snapshot?.specs?.binding_method || rawSpecs?.binding_method),
    printer: normalizeText(snapshot?.offer?.printer_name || offerSnapshot?.printer_name, 'Unknown'),
    country: normalizeText(snapshot?.specs?.delivery_country || rawSpecs?.delivery_country, ''),
    site: normalizeText(snapshot?.offer?.production_site || offerSnapshot?.production_site || offerSnapshot?.printer_name, 'Selected Printer')
  };

  const cpOrderId = intent.control_plane?.order_id ||
                    (intent as any).controlPlane?.orderId ||
                    (intent as any).control_plane_order_id ||
                    (intent as any).controlPlaneOrderId ||
                    null;

  if (process.env.NODE_ENV === 'development') {
    console.debug('[ORDER_VIEW_HYDRATION]', {
        intent_id: intent.order_intent_id,
        has_payload: Boolean(intent.payload),
        has_snapshot: Boolean(snapshot),
        specs_source: snapshot ? 'CANONICAL_SNAPSHOT' : 'OFFER_FALLBACK',
        specs
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-corporate-secondary/95 backdrop-blur-md p-0 md:p-6 animate-in fade-in duration-300">
      <div className="relative w-full h-full md:h-auto md:max-h-[calc(100vh-48px)] max-w-[1180px] bg-corporate-primary border-0 md:border md:border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden">
        
        {/* Sticky Header (Always Visible) */}
        <div className="sticky top-0 z-[80] shrink-0 flex flex-col bg-corporate-secondary border-b border-white/10 shadow-lg">
            {/* Header Bar Line */}
            <div className="h-[2px] w-full bg-corporate-accent" />
            
            {/* Navigation Bar */}
            <div className="flex items-center justify-between px-5 md:px-8 py-3 md:py-4">
                <button 
                    onClick={() => {
                        if (onReset) onReset();
                        else onClose();
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-corporate-primary border border-white/5 text-[0.65rem] font-black uppercase tracking-widest text-corporate-text hover:bg-white/5 hover:border-corporate-accent/30 transition-all min-h-[40px]"
                >
                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Back to Marketplace</span>
                    <span className="sm:hidden">Back</span>
                </button>
                
                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[0.55rem] font-technical uppercase text-corporate-muted tracking-[0.2em]">Order Intent</span>
                    <span className="text-[0.7rem] md:text-[0.8rem] font-technical font-bold text-corporate-accent tracking-tighter tabular-nums select-all">
                        {intent.public_ref}
                    </span>
                </div>

                <button 
                    onClick={onClose}
                    className="flex items-center gap-2 px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-corporate-muted hover:text-corporate-accent transition-colors min-h-[40px] border border-transparent hover:border-white/5"
                    aria-label="Close modal"
                >
                    <span className="hidden sm:inline">Close</span>
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          
          {/* Internal Top Header (Visual Context) */}
          <div className="px-8 py-6 border-b border-white/5 bg-corporate-elevated/20 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-corporate-secondary border border-white/10">
                    <ShoppingBagIcon className="w-6 h-6 text-corporate-accent" />
                </div>
                <div>
                    <h2 className="text-[1.1rem] font-black uppercase tracking-[0.2em] text-corporate-text">
                        Order Details
                    </h2>
                    <p className="text-[0.65rem] font-technical text-corporate-muted uppercase">
                        Ingestion ID: {intent.order_intent_id}
                    </p>
                </div>
            </div>
            
            {/* Contextual Note */}
            <div className="hidden lg:block bg-corporate-secondary border border-white/5 px-4 py-2">
                <p className="text-[0.6rem] font-technical text-corporate-muted uppercase tracking-widest">
                    Status: <span className="text-corporate-text font-black">{intent.status}</span>
                </p>
            </div>
          </div>

          <div className="p-5 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Info Column */}
            <div className="lg:col-span-2 space-y-8">
            
            {/* Status Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Marketplace', value: intent.lifecycle?.quote_status || '—', icon: DocumentCheckIcon },
                    { label: 'Files', value: intent.lifecycle?.files_status || '—', icon: DocumentCheckIcon },
                    { label: 'Preflight', value: intent.lifecycle?.preflight_status || '—', icon: DocumentCheckIcon },
                    { label: 'Payment', value: intent.lifecycle?.payment_status || '—', icon: CurrencyDollarIcon },
                ].map((s, i) => (
                    <div key={i} className="bg-corporate-secondary/50 border border-white/5 p-4">
                        <span className="text-[0.55rem] font-technical uppercase tracking-widest text-corporate-muted block mb-2">{s.label}</span>
                        <div className="flex items-center gap-2">
                            <span className={`text-[0.7rem] font-black uppercase tracking-widest ${s.value === 'PASSED' || s.value === 'SIGNED' || s.value === 'PAID' || s.value === 'VALIDATED' ? 'text-green-500' : 'text-corporate-muted'}`}>
                                {s.value}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Defensive Copy Note */}
            <div className="bg-green-500/5 border border-white/5 p-4 flex items-start gap-4">
                <CheckBadgeIcon className="w-5 h-5 text-green-500 shrink-0" />
                <p className="text-[0.7rem] text-corporate-text-secondary leading-relaxed font-technical">
                    Your order request has been saved. You can safely return to the marketplace or close this view. Your configuration and uploaded files are preserved in our industrial ledger.
                </p>
            </div>

            {/* Preflight Section */}
            <OrderIntentPreflightPanel 
                orderIntent={intent} 
                onUpdate={(updated) => setIntent(updated)}
            />

            {/* Specs Summary */}
            <div className="bg-corporate-secondary/30 border border-white/5 p-6">
                <h3 className="text-[0.7rem] font-black uppercase tracking-widest text-corporate-text mb-4 border-b border-white/5 pb-2">
                    Order Configuration
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-8">
                    <div>
                        <span className="text-[0.6rem] font-technical uppercase text-corporate-muted block">Format</span>
                        <span className="text-[0.75rem] font-bold text-corporate-text-secondary uppercase">{specs.format}</span>
                    </div>
                    <div>
                        <span className="text-[0.6rem] font-technical uppercase text-corporate-muted block">Copies</span>
                        <span className="text-[0.75rem] font-bold text-corporate-text-secondary tabular-nums">{specs.copies}</span>
                    </div>
                     <div>
                        <span className="text-[0.6rem] font-technical uppercase text-corporate-muted block">Pages</span>
                        <span className="text-[0.75rem] font-bold text-corporate-text-secondary tabular-nums">{specs.pages}</span>
                    </div>
                    <div>
                        <span className="text-[0.6rem] font-technical uppercase text-corporate-muted block">Binding</span>
                        <span className="text-[0.75rem] font-bold text-corporate-text-secondary uppercase">{specs.binding}</span>
                    </div>
                     <div>
                        <span className="text-[0.6rem] font-technical uppercase text-corporate-muted block">Printer</span>
                        <span className="text-[0.75rem] font-bold text-corporate-text-secondary uppercase truncate">{specs.printer}</span>
                    </div>
                    {specs.country && (
                        <div>
                            <span className="text-[0.6rem] font-technical uppercase text-corporate-muted block">Delivery To</span>
                            <span className="text-[0.75rem] font-bold text-corporate-text-secondary uppercase">{specs.country}</span>
                        </div>
                    )}
                    <div>
                        <span className="text-[0.6rem] font-technical uppercase text-corporate-muted block">Paper Interior (Baseline)</span>
                        <span className="text-[0.75rem] font-bold text-corporate-text-secondary uppercase">
                          {snapshot?.specs?.paper_weight_interior || rawSpecs?.paper_weight_interior || 90}g {snapshot?.specs?.paper_type_interior || rawSpecs?.paper_type_interior || 'offset'}
                        </span>
                    </div>
                    <div>
                        <span className="text-[0.6rem] font-technical uppercase text-corporate-muted block">Paper Cover (Baseline)</span>
                        <span className="text-[0.75rem] font-bold text-corporate-text-secondary uppercase">
                          {snapshot?.specs?.paper_weight_cover || rawSpecs?.paper_weight_cover || 250}g {snapshot?.specs?.paper_type_cover || rawSpecs?.paper_type_cover || 'mc'}
                        </span>
                    </div>
                </div>

                {/* Customer Paper Preferences (Informative) */}
                {(() => {
                    const paperPrefs = (intent as any).customer_paper_preferences || 
                                       snapshot?.specs?.customer_paper_preferences || 
                                       (snapshot as any)?.customer_paper_preferences || 
                                       rawSpecs?.customer_paper_preferences || 
                                       null;
                    if (!paperPrefs || (!paperPrefs.interior && !paperPrefs.cover && !paperPrefs.endpaper)) return null;

                    return (
                        <div className="mt-4 pt-4 border-t border-white/10 bg-corporate-primary/40 p-3.5">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                                <span className="text-[0.65rem] font-technical font-bold text-amber-400 uppercase tracking-widest">
                                    Customer Paper Preference (Informative)
                                </span>
                            </div>
                            <p className="text-[0.65rem] text-corporate-muted mb-2 font-technical">
                                Paper preference only. Does not affect this estimate. Subject to print house confirmation and availability.
                            </p>
                            <div className="space-y-1.5 text-[0.7rem] font-technical">
                                {paperPrefs.interior && (
                                    <div className="text-corporate-text-secondary">
                                        <span className="text-corporate-muted uppercase">Preferred Interior: </span>
                                        <strong className="text-white">{paperPrefs.interior.productName || paperPrefs.interior.product_name}</strong>
                                        {paperPrefs.interior.brand ? ` (${paperPrefs.interior.brand})` : ''} · {paperPrefs.interior.gsm}g
                                    </div>
                                )}
                                {paperPrefs.cover && (
                                    <div className="text-corporate-text-secondary">
                                        <span className="text-corporate-muted uppercase">Preferred Cover: </span>
                                        <strong className="text-white">{paperPrefs.cover.productName || paperPrefs.cover.product_name}</strong>
                                        {paperPrefs.cover.brand ? ` (${paperPrefs.cover.brand})` : ''} · {paperPrefs.cover.gsm}g
                                    </div>
                                )}
                                {paperPrefs.endpaper && (
                                    <div className="text-corporate-text-secondary">
                                        <span className="text-corporate-muted uppercase">Preferred Endpaper: </span>
                                        <strong className="text-white">{paperPrefs.endpaper.productName || paperPrefs.endpaper.product_name}</strong> · {paperPrefs.endpaper.gsm}g
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>
          </div>

          {/* Sidebar / Totals */}
          <div className="space-y-6">
            <div className="bg-corporate-secondary border border-white/10 p-6">
                 <h3 className="text-[0.7rem] font-black uppercase tracking-widest text-corporate-text mb-6 flex items-center gap-2">
                    <CurrencyDollarIcon className="w-4 h-4 text-corporate-accent" />
                    Quotation Summary
                </h3>
                
                <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center text-[0.75rem]">
                        <span className="text-corporate-muted uppercase tracking-tight font-technical">Subtotal</span>
                        <span className="text-corporate-text font-technical tabular-nums">{displayCurrency} {(intent.totals?.total_price ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[0.75rem]">
                        <span className="text-corporate-muted uppercase tracking-tight font-technical">Shipping</span>
                        <span className="text-corporate-text font-technical tabular-nums">{displayCurrency} {(intent.totals?.shipping_amount ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[0.75rem]">
                        <span className="text-corporate-muted uppercase tracking-tight font-technical">Tax (VAT)</span>
                        <span className="text-corporate-text font-technical tabular-nums">{displayCurrency} {(intent.totals?.tax_amount ?? 0).toFixed(2)}</span>
                    </div>
                </div>

                <div className="pt-4 border-t border-corporate-accent/20 flex justify-between items-center mb-8">
                     <span className="text-[0.8rem] font-black uppercase tracking-widest text-corporate-text">Total</span>
                     <span className="text-[1.2rem] font-technical font-black text-corporate-accent tabular-nums">
                        {displayCurrency} {(intent.totals?.grand_total ?? 0).toFixed(2)}
                     </span>
                </div>

                <div className="space-y-4">
                     <div className="p-3 bg-corporate-primary/50 border border-white/5">
                        <div className="flex items-center gap-2 mb-1">
                            <CalendarIcon className="w-3.5 h-3.5 text-corporate-muted" />
                            <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted">Created At</span>
                        </div>
                        <span className="text-[0.7rem] font-technical text-corporate-text-secondary">
                            {intent.created_at ? new Date(intent.created_at).toLocaleString() : '—'}
                        </span>
                    </div>

                    <div className="p-3 bg-corporate-primary/50 border border-white/5">
                        <div className="flex items-center gap-2 mb-1">
                            <PrinterIcon className="w-3.5 h-3.5 text-corporate-muted" />
                            <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted">Production Site</span>
                        </div>
                        <span className="text-[0.7rem] font-bold text-corporate-text-secondary uppercase">
                            {offerSnapshot?.printer_name || '—'}
                        </span>
                    </div>
                </div>

                <div className="mt-8">
                     {cpOrderId ? (
                         <CustomerPaymentPanel cpOrderId={cpOrderId} fetchDetails={() => fetchDetails({ silent: true })} />
                     ) : intent.preflight?.status !== 'PASSED' ? (
                        <div className="bg-corporate-primary/50 border border-white/5 p-4 text-center">
                            <p className="text-[0.65rem] text-corporate-muted italic">
                                Invoice and payment will be available after files pass Preflight validation.
                            </p>
                        </div>
                     ) : !intent.payment || intent.payment?.status === 'NOT_STARTED' ? (
                        <button 
                            onClick={async () => {
                                try {
                                    const res = await fetch(`/api/order-intents/${intent.order_intent_id}/billing/create`, { method: 'POST' });
                                    const data = await res.json();
                                    if (data.ok && intent) {
                                        fetchDetails(); // Refresh
                                    } else {
                                        alert(data.message || 'Billing creation failed.');
                                    }
                                } catch (e) {
                                    alert('Connection error.');
                                }
                            }}
                            className="w-full py-4 bg-corporate-accent hover:bg-corporate-accent-hover border border-corporate-accent/20 text-[0.75rem] font-black uppercase tracking-[0.2em] text-white transition-all shadow-[0_0_20px_rgba(220,0,0,0.15)]"
                        >
                            Create Invoice / Payment
                        </button>
                     ) : (
                        <div className="space-y-4">
                            {intent.payment?.provider === 'stripe' && intent.payment?.status === 'PENDING' && (
                                <a 
                                    href={intent.payment?.checkout_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full py-4 bg-corporate-accent hover:bg-corporate-accent-hover border border-corporate-accent/20 text-center text-[0.75rem] font-black uppercase tracking-[0.2em] text-white transition-all shadow-[0_0_20px_rgba(220,0,0,0.15)]"
                                >
                                    Continue to Secure Payment
                                </a>
                            )}

                            {intent.payment?.provider === 'bank_transfer' && (
                                <div className="bg-corporate-accent/5 border border-corporate-accent/20 p-5 space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <BuildingLibraryIcon className="w-4 h-4 text-corporate-accent" />
                                        <span className="text-[0.7rem] font-black uppercase tracking-widest text-corporate-text">Bank Transfer Instructions</span>
                                    </div>
                                    
                                    <div className="space-y-2 text-[0.65rem] font-technical">
                                        <div className="flex justify-between border-b border-white/5 pb-1">
                                            <span className="text-corporate-muted">Account</span>
                                            <span className="text-corporate-text text-right">{intent.payment?.instructions?.account_name || '—'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-1">
                                            <span className="text-corporate-muted">IBAN</span>
                                            <span className="text-corporate-text text-right">{intent.payment?.instructions?.iban || '—'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-1">
                                            <span className="text-corporate-muted">SWIFT</span>
                                            <span className="text-corporate-text text-right">{intent.payment?.instructions?.swift || '—'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-1 pt-2">
                                            <span className="text-corporate-accent font-bold">Reference</span>
                                            <span className="text-corporate-text font-black text-right">{intent.payment?.instructions?.reference || '—'}</span>
                                        </div>
                                        <div className="flex justify-between pt-1">
                                            <span className="text-corporate-muted">Amount</span>
                                            <span className="text-corporate-text font-black text-right">{intent.payment?.instructions?.currency || displayCurrency} {(intent.payment?.instructions?.amount ?? 0).toFixed(2)}</span>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-corporate-accent/10 flex gap-3">
                                        <InformationCircleIcon className="w-4 h-4 text-corporate-accent shrink-0" />
                                        <p className="text-[0.55rem] text-corporate-text-secondary leading-tight italic">
                                            Please use the exact reference code above. Payment confirmation usually takes 24-48h.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col gap-1 pt-2">
                                <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted">Payment Status</span>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${intent.payment?.status === 'PAID' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                                    <span className={`text-[0.7rem] font-black uppercase tracking-widest ${intent.payment?.status === 'PAID' ? 'text-green-500' : 'text-yellow-500'}`}>
                                        {intent.payment?.status || '—'}
                                    </span>
                                </div>
                            </div>
                        </div>
                     )}
                </div>

                <div className="mt-8 pt-8 border-t border-white/5 space-y-6">
                    <div className="flex items-center gap-2 mb-4">
                        <TruckIcon className="w-4 h-4 text-corporate-accent" />
                        <span className="text-[0.7rem] font-black uppercase tracking-widest text-corporate-text">Final Order & Handoff</span>
                    </div>

                    {intent.payment?.status !== 'PAID' ? (
                        <div className="bg-corporate-primary/50 border border-white/5 p-4 text-center">
                            <p className="text-[0.65rem] text-corporate-muted italic">
                                Final order creation will be available after payment is confirmed.
                            </p>
                        </div>
                    ) : intent.control_plane?.status === 'CREATED' ? (
                        <div className="bg-green-500/5 border border-green-500/20 p-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <CheckBadgeIcon className="w-5 h-5 text-green-500" />
                                <span className="text-[0.75rem] font-black uppercase tracking-widest text-green-500">Order Finalized</span>
                            </div>
                            
                            <div className="space-y-3">
                                <div>
                                    <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted block mb-1">Control Plane Ref</span>
                                    <span className="text-[0.8rem] font-technical font-black text-corporate-text">{intent.control_plane?.order_ref || '—'}</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted block mb-1">Handoff Status</span>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-1.5 h-1.5 ${intent.printhouse_handoff?.status === 'SENT' ? 'bg-emerald-500' : 'bg-corporate-accent animate-pulse'}`} />
                                            <span className="text-[0.7rem] font-black uppercase tracking-widest text-corporate-text">
                                                {intent.printhouse_handoff?.status || '—'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted block mb-1">Printer</span>
                                        <span className="text-[0.65rem] font-black uppercase tracking-tight text-corporate-text-secondary">{intent.printhouse_handoff?.printhouse_name || '—'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {intent.control_plane?.status === 'FAILED' && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 mb-4">
                                    <p className="text-[0.65rem] text-red-400 font-bold uppercase tracking-widest mb-1">Handoff Failed</p>
                                    <p className="text-[0.6rem] text-red-300/70 italic">{intent.control_plane?.error?.message || 'Submission error.'}</p>
                                </div>
                            )}

                            <button 
                                onClick={async () => {
                                    try {
                                        const res = await fetch(`/api/order-intents/${intent.order_intent_id}/finalize`, { method: 'POST' });
                                        const data = await res.json();
                                        if (data.ok) {
                                            fetchDetails();
                                        } else {
                                            alert(data.message || 'Finalization failed.');
                                        }
                                    } catch (e) {
                                        alert('Connection error.');
                                    }
                                }}
                                disabled={intent.control_plane?.status === 'CREATING'}
                                className={`w-full py-4 border text-[0.75rem] font-black uppercase tracking-[0.2em] transition-all shadow-[0_0_20px_rgba(220,0,0,0.15)] ${
                                    intent.control_plane?.status === 'CREATING' 
                                    ? 'bg-corporate-primary border-white/10 text-corporate-muted cursor-wait' 
                                    : 'bg-corporate-accent hover:bg-corporate-accent-hover border-corporate-accent/20 text-white'
                                }`}
                            >
                                {intent.control_plane?.status === 'CREATING' ? 'Creating Order...' : 'Submit Final Order'}
                            </button>

                            <p className="text-[0.55rem] text-corporate-muted text-center italic">
                                This will submit your production package to the Control Plane for fulfillment.
                            </p>
                        </div>
                    )}
                </div>

                {/* Dispatch Package Section (Phase 11) */}
                <div className="mt-8 pt-8 border-t border-white/5 space-y-6">
                    <div className="flex items-center gap-2 mb-4">
                        <CheckBadgeIcon className="w-4 h-4 text-corporate-accent" />
                        <span className="text-[0.7rem] font-black uppercase tracking-widest text-corporate-text">Dispatch Package</span>
                    </div>

                    {intent.control_plane?.status !== 'CREATED' ? (
                        <div className="bg-corporate-primary/50 border border-white/5 p-4 text-center">
                            <p className="text-[0.65rem] text-corporate-muted italic">
                                Dispatch package creation will be available after the Control Plane order is confirmed.
                            </p>
                        </div>
                    ) : !intent.dispatch_package_id ? (
                        <button 
                            onClick={async () => {
                                try {
                                    const res = await fetch(`/api/order-intents/${intent.order_intent_id}/dispatch-package/create`, { method: 'POST' });
                                    const data = await res.json();
                                    if (data.ok) {
                                        fetchDetails();
                                    } else {
                                        alert(data.message || 'Dispatch package creation failed.');
                                    }
                                } catch (e) {
                                    alert('Connection error.');
                                }
                            }}
                            className="w-full py-4 bg-corporate-accent hover:bg-corporate-accent-hover border border-corporate-accent/20 text-[0.75rem] font-black uppercase tracking-[0.2em] text-white transition-all shadow-[0_0_20px_rgba(220,0,0,0.15)]"
                        >
                            Create Dispatch Package
                        </button>
                    ) : (
                        <div className="bg-corporate-elevated/20 border border-corporate-accent/20 p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <DocumentCheckIcon className="w-5 h-5 text-corporate-accent" />
                                    <span className="text-[0.75rem] font-black uppercase tracking-widest text-corporate-accent">Package Ready</span>
                                </div>
                                <span className="text-[0.6rem] font-technical text-corporate-muted">#{intent.dispatch_package_id ? intent.dispatch_package_id.slice(-8).toUpperCase() : '—'}</span>
                            </div>
                            
                            <div className="space-y-3">
                                <div>
                                    <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted block mb-1">Package ID</span>
                                    <span className="text-[0.8rem] font-technical font-black text-corporate-text select-all">{intent.dispatch_package_id}</span>
                                </div>
                                <div className="flex justify-between items-end pt-2 border-t border-white/5">
                                    <div>
                                        <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted block mb-1">Status</span>
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                            <span className="text-[0.7rem] font-black uppercase tracking-widest text-corporate-text">
                                                READY
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted block mb-1">Scope</span>
                                        <span className="text-[0.65rem] font-black uppercase tracking-tight text-corporate-text-secondary">PRINTHOUSE_ACCESS</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div> {/* End of Sidebar (289) */}
          </div> {/* End of Grid (215) */}

            <div className="p-6 border border-white/5 bg-corporate-elevated/10">
                 <h4 className="text-[0.65rem] font-black uppercase tracking-widest text-corporate-muted mb-4">
                    Audit Metadata
                </h4>
                <div className="space-y-2 font-technical text-[0.6rem] text-corporate-muted">
                    <p>SESSION_ID: {intent.session_id ? intent.session_id.slice(0, 12) + '...' : '—'}</p>
                    <p>CONTRACT: BPE_MARKETPLACE_NATIVE</p>
                    <p>VERSION: v5.3_PHASE_11</p>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderIntentDetails;
