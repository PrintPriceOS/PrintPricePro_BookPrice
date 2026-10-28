import React, { useState, useEffect } from 'react';
import { XMarkIcon, ShoppingCartIcon, LockClosedIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { CartItem } from '../types';

interface CartPanelProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  checkingOut: boolean;
  onRemove: (itemId: string) => void;
  onCheckout: () => void;
  isLoggedIn: boolean;
  onSignInClick: () => void;
  onGoToUpload?: () => void;
}

const CartPanel: React.FC<CartPanelProps> = ({
  isOpen,
  onClose,
  cart,
  checkingOut,
  onRemove,
  onCheckout,
  isLoggedIn,
  onSignInClick,
  onGoToUpload,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Reset confirm dialog when cart closes
  useEffect(() => {
    if (!isOpen) setConfirmOpen(false);
  }, [isOpen]);

  const getItemPrice = (item: CartItem) => {
    const value = Number(item.pricing?.total_price ?? item.offer.total_price ?? item.offer.total_cost ?? 0);
    return Number.isFinite(value) ? value : 0;
  };

  const isRecommendedSelection = (item: CartItem) => {
    const recommendedId =
      item.recommendedOffer?.offer_id ||
      item.recommendedOffer?.raw_offer?.offer_id ||
      item.recommendedOffer?.raw_offer?.id ||
      item.recommendedOfferId;

    const selectedId =
      item.offer.offer_id ||
      item.offer.raw_offer?.offer_id ||
      item.offer.raw_offer?.id ||
      item.offer.id;

    return Boolean(recommendedId && selectedId && recommendedId === selectedId);
  };

  const total = cart.reduce((sum, item) => sum + getItemPrice(item), 0);
  const currency = cart[0]?.pricing?.currency || cart[0]?.offer.currency || 'EUR';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-corporate-secondary border-l border-corporate-border flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-corporate-border shrink-0">
          <h2 className="text-[0.7rem] font-technical font-black tracking-monolith text-corporate-accent uppercase flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full bg-corporate-accent inline-block ${cart.length ? 'animate-pulse' : 'opacity-30'}`} />
            Cart — {cart.length} item{cart.length !== 1 ? 's' : ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-xl text-corporate-text-secondary hover:text-corporate-accent hover:bg-corporate-elevated transition-colors"
            aria-label="Close cart"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <ShoppingCartIcon className="w-16 h-16 text-corporate-muted opacity-30" />
              <p className="text-[0.65rem] font-technical font-black tracking-monolith text-corporate-muted uppercase">
                Cart is empty
              </p>
              <p className="text-xs text-corporate-text-secondary">
                Add a print quote to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 opacity-[0.02] font-technical text-[8rem] font-black pointer-events-none uppercase leading-none">
                CART
              </div>
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-corporate-border bg-corporate-primary/50 p-6 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-technical font-black text-corporate-text uppercase tracking-monolith mb-1">
                      {item.offer.print_house}
                    </p>
                    <p className="text-[0.6rem] text-corporate-accent font-technical font-black uppercase tracking-monolith mb-2">
                      Selected by customer
                    </p>
                    {isRecommendedSelection(item) && (
                      <p className="text-[0.6rem] text-corporate-muted font-technical font-black uppercase tracking-monolith mb-2">
                        Matches BPE recommendation
                      </p>
                    )}
                    <p className="text-[10px] font-technical text-corporate-muted uppercase tracking-wider leading-relaxed">
                      {item.specs.copies} copies · {item.specs.book_size} · {item.specs.binding_method} · {item.specs.interior_pages}pp
                    </p>
                    {item.offer.estimated_delivery_time && (
                      <p className="text-[10px] font-technical text-corporate-muted uppercase tracking-wider mt-1">
                        ETA: {item.offer.estimated_delivery_time}
                      </p>
                    )}
                    <p className="text-xl font-display font-black text-corporate-text tracking-tighter mt-3">
                      {getItemPrice(item).toFixed(2)}{' '}
                      <span className="text-corporate-accent text-xs">{item.pricing?.currency || item.offer.currency}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="text-[10px] font-technical font-black tracking-monolith text-corporate-muted hover:text-corporate-accent uppercase transition-colors shrink-0"
                  >
                    [×] Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — only when cart has items */}
        {cart.length > 0 && (
          <div className="shrink-0 px-8 py-6 border-t border-corporate-border">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[0.6rem] font-technical font-black tracking-monolith text-corporate-muted uppercase mb-1">
                  Total (Payment Pending)
                </p>
                <p className="text-3xl font-display font-black text-corporate-text tracking-tighter">
                  {total.toFixed(2)}{' '}
                  <span className="text-corporate-accent text-sm">{currency}</span>
                </p>
              </div>
            </div>

            {!isLoggedIn ? (
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 rounded-xl border border-corporate-accent/20 bg-corporate-accent/5">
                  <LockClosedIcon className="w-4 h-4 text-corporate-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[0.65rem] font-technical font-black tracking-monolith text-corporate-accent uppercase mb-1">
                      Sign in required
                    </p>
                    <p className="text-[11px] text-corporate-text-secondary leading-relaxed">
                      You need an account to place your order and track delivery.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignInClick}
                  className="w-full min-h-[44px] py-3 rounded-xl flex items-center justify-center gap-3 text-xs font-technical font-black tracking-monolith uppercase bg-corporate-accent text-white hover:bg-corporate-hover hover:shadow-[0_0_20px_rgba(220,0,0,0.2)] transition-all duration-300"
                >
                  <LockClosedIcon className="w-3.5 h-3.5" />
                  Sign in to place your order
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : !confirmOpen ? (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={checkingOut}
                className="w-full min-h-[44px] py-3 rounded-xl text-xs font-technical font-black tracking-monolith uppercase bg-corporate-accent text-white hover:bg-corporate-hover hover:shadow-[0_0_20px_rgba(220,0,0,0.2)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkingOut ? 'Processing…' : 'Continue to file upload →'}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-[10px] font-technical text-corporate-text uppercase tracking-wider">
                  Proceed to file upload?
                </p>
                <p className="text-[10px] font-technical text-corporate-text-secondary uppercase tracking-wider leading-relaxed">
                  You need to provide production-ready PDFs (Interior and Cover) before finalizing your order request.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { 
                      setConfirmOpen(false); 
                      onClose();
                      onGoToUpload?.();
                    }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-technical font-black tracking-monolith uppercase bg-corporate-accent text-white hover:bg-corporate-hover transition-all"
                  >
                    Go to upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-technical font-black tracking-monolith uppercase border border-corporate-border text-corporate-text hover:bg-corporate-elevated transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default CartPanel;
