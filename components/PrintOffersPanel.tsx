import React, { useState } from 'react';
import { BookPriceResponse, BookPriceOffer } from '../types';
import { t } from '../i18n/en';

interface PrintOffersPanelProps {
  offers: BookPriceResponse | null;
  loading: boolean;
  error?: string | null;
  onChooseOffer: (offer: BookPriceOffer) => void;
  selectedOfferId?: string | null;
}

const PrintOffersPanel: React.FC<PrintOffersPanelProps> = ({
  offers,
  loading,
  error,
  onChooseOffer,
  selectedOfferId,
}) => {
  const [openBreakdownId, setOpenBreakdownId] = useState<string | null>(null);

  const handleToggleBreakdown = (id: string) => {
    setOpenBreakdownId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <div className="bg-corporate-secondary p-6 sm:p-8 rounded-2xl border border-corporate-border shadow-sm flex items-center gap-4 min-w-0">
        <div className="w-4 h-4 rounded-sm bg-corporate-accent animate-pulse shrink-0" />
        <p className="text-xs font-technical font-black tracking-monolith text-corporate-text-secondary uppercase truncate">
          Calculating node_offers…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-corporate-secondary p-6 sm:p-8 rounded-2xl border border-corporate-accent/30 shadow-sm min-w-0">
        <p className="text-[0.65rem] font-technical font-black tracking-monolith text-corporate-accent uppercase mb-2">
          System Error
        </p>
        <p className="text-sm text-corporate-text-secondary break-words">{error}</p>
      </div>
    );
  }

  if (!offers || !offers.offers.length) {
    return (
      <div className="bg-corporate-secondary p-6 sm:p-10 rounded-2xl border border-corporate-border shadow-sm relative overflow-hidden min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-corporate-muted/50" />
          <p className="text-[0.65rem] font-technical font-black tracking-monolith text-corporate-muted uppercase">
            status: waiting_for_input
          </p>
        </div>
        <p className="text-xs text-corporate-text-secondary leading-relaxed uppercase tracking-wider">
          {t('enter_specs_or_upload_pdf')}
        </p>
      </div>
    );
  }

  const getDisplayPrice = (offer: BookPriceOffer) =>
    Number(offer.total_price ?? offer.total_cost ?? Number.MAX_SAFE_INTEGER);

  const sorted = [...offers.offers].sort((a, b) => getDisplayPrice(a) - getDisplayPrice(b));

  const recommended = offers.offers.find((o) => o.recommended);
  const topThree = sorted.slice(0, 3);

  const visibleOffers =
    recommended && !topThree.some((o) => o.id === recommended.id)
      ? [...topThree, recommended]
      : topThree;

  return (
    <div className="bg-corporate-secondary p-4 sm:p-6 md:p-8 rounded-2xl border border-corporate-border shadow-sm relative overflow-hidden min-w-0">
      <div className="hidden sm:block absolute top-0 right-0 opacity-[0.02] font-technical text-[6rem] md:text-[8rem] font-black pointer-events-none uppercase select-none">
        PR_H
      </div>
      <div className="flex items-center justify-between gap-2 mb-5 sm:mb-6 relative z-10 border-b border-corporate-border pb-3.5">
        <h2 className="text-[0.7rem] font-sans font-black tracking-monolith text-corporate-accent flex items-center gap-2.5 uppercase">
          <span className="w-2 h-2 rounded-sm bg-corporate-accent inline-block" />
          Best Print Offers (BPE Engine)
        </h2>
        <span className="text-[9px] font-technical font-bold uppercase tracking-wider text-corporate-muted">
          {visibleOffers.length} Node Quotes
        </span>
      </div>

      <div className="space-y-4 sm:space-y-5">
        {visibleOffers.map((offer, index) => {
          const isBestPrice = index === 0;
          const isSelected = selectedOfferId === offer.id;
          const isOpen = openBreakdownId === offer.id;
          const isRecommended = !!offer.recommended;
          const displayPrice = getDisplayPrice(offer);
          const hasFiniteDisplayPrice =
            Number.isFinite(displayPrice) && displayPrice < Number.MAX_SAFE_INTEGER;

          return (
            <div
              key={offer.id}
              className={`border rounded-xl p-4 sm:p-6 flex flex-col gap-4 transition-all duration-300 relative group overflow-hidden min-w-0 ${
                isSelected
                  ? 'border-corporate-accent bg-corporate-primary shadow-[0_0_25px_rgba(220,0,0,0.08)]'
                  : 'border-corporate-border bg-corporate-primary/70 hover:border-corporate-border-strong'
              }`}
            >
              <div className="absolute top-0 left-0 h-1 bg-corporate-accent w-0 group-hover:w-full transition-all duration-500" />
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 relative z-10 min-w-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <p className="text-xs font-sans font-black text-corporate-text uppercase tracking-monolith">
                      {offer.printer_name ||
                        offer.print_house_name ||
                        offer.printer_id ||
                        offer.print_house ||
                        'Print House'}
                    </p>
                    {isRecommended && (
                      <span className="bg-corporate-accent/10 text-corporate-accent text-[9px] font-technical font-black px-2 py-0.5 rounded-full border border-corporate-accent/30 tracking-wider uppercase">
                        RECOMMENDED BY BPE
                      </span>
                    )}
                    {isBestPrice && (
                      <span className="badge-success border text-[9px] font-technical font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        BEST TARIFF
                      </span>
                    )}
                  </div>
                  {offer.checkout_allowed === false && (
                    <p className="text-[10px] font-technical text-corporate-accent uppercase tracking-wider mb-2">
                      {offer.message || offer.status || 'Precision quote required'}
                    </p>
                  )}
                  {offer.estimated_delivery_time && (
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-corporate-accent animate-pulse shrink-0" />
                      <p className="text-[10px] font-technical text-corporate-muted uppercase tracking-wider">
                        ETA: <span className="text-corporate-text font-bold">{offer.estimated_delivery_time}</span>
                      </p>
                    </div>
                  )}
                </div>
                <div className="sm:text-right shrink-0">
                  {offer.range ? (
                    <p className="text-xl sm:text-2xl font-display font-black text-corporate-text tracking-tighter tabular-nums">
                      {offer.range}
                    </p>
                  ) : hasFiniteDisplayPrice ? (
                    <p className="text-2xl sm:text-3xl font-display font-black text-corporate-text tracking-tighter tabular-nums">
                      {displayPrice.toFixed(2)}{' '}
                      <span className="text-corporate-accent text-sm font-technical">{offer.currency}</span>
                    </p>
                  ) : (
                    <p className="text-lg font-display font-black text-corporate-muted tracking-tighter uppercase">
                      Price unavailable
                    </p>
                  )}
                  {isSelected && (
                    <p className="text-[10px] text-corporate-accent font-technical font-black uppercase tracking-monolith mt-1">
                      SELECTED BY YOU
                    </p>
                  )}
                </div>
              </div>

              {/* Breakdown toggle */}
              {offer.checkout_allowed !== false && offer.breakdown && offer.breakdown.length > 0 && (
                <div className="border-t border-corporate-border pt-3.5 mt-1">
                  <button
                    type="button"
                    onClick={() => handleToggleBreakdown(offer.id)}
                    className="text-[11px] font-technical font-bold text-corporate-accent uppercase tracking-monolith flex items-center gap-2 hover:text-corporate-text transition-colors"
                  >
                    {isOpen ? 'Close system_breakdown [-]' : 'View system_breakdown [+]'}
                  </button>
                  {isOpen && (
                    <ul className="mt-3.5 space-y-2.5 bg-corporate-secondary/60 p-3 sm:p-4 rounded-xl border border-corporate-border">
                      {offer.breakdown.map((line, idx) => (
                        <li
                          key={idx}
                          className="flex justify-between items-center gap-2 border-b border-corporate-border pb-2 last:border-none last:pb-0"
                        >
                          <span className="text-[10px] sm:text-[11px] font-technical text-corporate-text-secondary uppercase tracking-wider">
                            {line.label}
                          </span>
                          <span className="text-[11px] font-technical text-corporate-text font-bold tabular-nums shrink-0">
                            {line.amount.toFixed(2)} {offer.currency}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={offer.checkout_allowed === false}
                  onClick={() => onChooseOffer(offer)}
                  className={`w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center px-5 sm:px-7 py-2.5 rounded-xl text-xs font-sans font-black tracking-monolith uppercase transition-all duration-300
                    ${
                      isSelected
                        ? 'bg-corporate-accent/15 border border-corporate-accent text-corporate-accent cursor-default'
                        : offer.checkout_allowed === false
                        ? 'bg-corporate-elevated border border-corporate-border text-corporate-muted cursor-not-allowed'
                        : isBestPrice || isRecommended
                        ? 'bg-corporate-accent text-white hover:bg-corporate-hover hover:shadow-[0_0_20px_rgba(220,0,0,0.25)] shadow-sm'
                        : 'bg-transparent border border-corporate-border-strong text-corporate-text hover:border-corporate-accent hover:text-corporate-accent'
                    }`}
                >
                  {isSelected
                    ? '[✓] SELECTED_FOR_CART'
                    : offer.checkout_allowed === false
                    ? '[!] Precision Quote Required'
                    : selectedOfferId
                    ? 'Replace selection →'
                    : 'Choose this offer →'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PrintOffersPanel;
