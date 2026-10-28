import React from 'react';
import {
  WrenchIcon,
  ArrowPathIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { InitialBookPricePayload, BookPriceResponse } from '../types';

export interface ConfigurationSummaryProps {
  payload: InitialBookPricePayload;
  offers: BookPriceResponse | null;
  isSpecsStale: boolean;
  onRecalculate: () => void;
  loading: boolean;
}

export const ConfigurationSummary: React.FC<ConfigurationSummaryProps> = ({
  payload,
  offers,
  isSpecsStale,
  onRecalculate,
  loading,
}) => {
  const [mobileExpanded, setMobileExpanded] = React.useState(false);

  const baselineInterior = `${payload.paper_type_interior.toUpperCase()} · ${payload.paper_weight_interior} GSM`;
  const preferredInterior =
    payload.paper_mode_interior === 'advanced' && payload.interior_paper_material
      ? `${payload.interior_paper_material.productName || payload.interior_paper_material.product_name} (${payload.interior_paper_material.brand || 'Catalog'}) · ${payload.interior_paper_material.gsm}g`
      : null;

  const baselineCover = `${payload.paper_type_cover.toUpperCase()} · ${payload.paper_weight_cover} GSM`;
  const preferredCover =
    payload.paper_mode_cover === 'advanced' && payload.cover_paper_material
      ? `${payload.cover_paper_material.productName || payload.cover_paper_material.product_name} (${payload.cover_paper_material.brand || 'Catalog'}) · ${payload.cover_paper_material.gsm}g`
      : null;

  const isHardcover = payload.binding_method === 'thread_sewn_hc';

  const baselineEndpaper =
    isHardcover && payload.endpapers !== 'none'
      ? `${payload.endpapers.toUpperCase()} · ${payload.paper_weight_endpapers} GSM`
      : null;
  const preferredEndpaper =
    isHardcover &&
    payload.endpapers !== 'none' &&
    payload.paper_mode_endpaper === 'advanced' &&
    payload.endpaper_material
      ? `${payload.endpaper_material.productName || payload.endpaper_material.product_name} · ${payload.endpaper_material.gsm}g`
      : null;

  return (
    <>
      {/* DESKTOP SUMMARY CARD */}
      <div className="bg-corporate-secondary border border-corporate-border rounded-2xl p-4 sm:p-6 md:p-7 relative overflow-hidden shadow-sm transition-all duration-300 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-corporate-border pb-3.5 mb-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <WrenchIcon className="w-4 h-4 text-corporate-accent shrink-0" />
            <h3 className="text-xs font-sans font-black tracking-monolith uppercase text-corporate-text truncate">
              Configuration Snapshot
            </h3>
          </div>

          {/* Sync Status Badge */}
          {offers && (
            <div className="flex items-center gap-2 shrink-0">
              {isSpecsStale ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-corporate-accent/15 border border-corporate-accent/40 text-corporate-accent text-[9px] font-technical font-black uppercase tracking-wider animate-pulse">
                  <ExclamationCircleIcon className="w-3.5 h-3.5 shrink-0" />
                  Specs Changed
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full badge-success border text-[9px] font-technical uppercase font-bold">
                  <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
                  Offers Synced
                </span>
              )}
            </div>
          )}
        </div>

        {/* Stale Warning Action Banner */}
        {offers && isSpecsStale && (
          <div className="bg-corporate-primary border border-corporate-accent/30 rounded-xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-2 h-2 rounded-full bg-corporate-accent mt-1.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-technical font-bold text-corporate-accent uppercase tracking-wider">
                  Specifications modified
                </p>
                <p className="text-[10px] text-corporate-text-secondary mt-0.5">
                  Prior calculated offers no longer match these parameters. Recalculate to generate fresh quotes.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRecalculate}
              disabled={loading}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-corporate-accent text-white text-[10px] font-technical font-black uppercase tracking-monolith hover:bg-corporate-hover shrink-0 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Recalculate Now
            </button>
          </div>
        )}

        {/* Specifications Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-4 sm:gap-x-6 text-xs font-sans min-w-0">
          {/* Volume */}
          <div className="min-w-0">
            <span className="block text-[9px] font-technical uppercase text-corporate-muted tracking-wider">
              Quantity
            </span>
            <span className="text-sm font-black text-corporate-text font-display tabular-nums">
              {Number(payload.copies).toLocaleString()}{' '}
              <span className="text-xs font-normal font-sans text-corporate-muted">copies</span>
            </span>
          </div>

          {/* Book Format */}
          <div className="min-w-0">
            <span className="block text-[9px] font-technical uppercase text-corporate-muted tracking-wider">
              Book Trim Size
            </span>
            <span className="text-xs font-bold text-corporate-text block truncate">
              {payload.book_size === 'Custom'
                ? `${payload.custom_width}x${payload.custom_height} mm`
                : payload.book_size}{' '}
              · <span className="capitalize text-corporate-muted">{payload.orientation}</span>
            </span>
          </div>

          {/* Page Extent */}
          <div className="min-w-0 col-span-2 sm:col-span-1">
            <span className="block text-[9px] font-technical uppercase text-corporate-muted tracking-wider">
              Pagination
            </span>
            <span className="text-xs font-bold text-corporate-text tabular-nums">
              {payload.interior_pages}pp interior + {payload.cover_pages}pp cover
            </span>
          </div>

          {/* Interior Paper */}
          <div className="col-span-2 sm:col-span-1 min-w-0">
            <span className="block text-[9px] font-technical uppercase text-corporate-muted tracking-wider">
              Interior Paper
            </span>
            <span className="text-xs font-bold text-corporate-text truncate block" title={baselineInterior}>
              {baselineInterior}
            </span>
            {preferredInterior && (
              <span
                className="text-[10px] text-corporate-accent font-technical font-bold truncate block mt-0.5"
                title={`Catalog Substrate: ${preferredInterior} (Synced to BPE)`}
              >
                Catalog: {preferredInterior} · Synced to BPE
              </span>
            )}
            <span className="text-[10px] text-corporate-muted font-technical block">
              Color: {payload.interior_print}
            </span>
          </div>

          {/* Cover Paper */}
          <div className="col-span-2 sm:col-span-1 min-w-0">
            <span className="block text-[9px] font-technical uppercase text-corporate-muted tracking-wider">
              Cover Stock
            </span>
            <span className="text-xs font-bold text-corporate-text truncate block" title={baselineCover}>
              {baselineCover}
            </span>
            {preferredCover && (
              <span
                className="text-[10px] text-corporate-accent font-technical font-bold truncate block mt-0.5"
                title={`Catalog Substrate: ${preferredCover} (Synced to BPE)`}
              >
                Catalog: {preferredCover} · Synced to BPE
              </span>
            )}
            <span className="text-[10px] text-corporate-muted font-technical block">
              Color: {payload.cover_print}
            </span>
          </div>

          {/* Binding & Finish */}
          <div className="col-span-2 sm:col-span-1 min-w-0">
            <span className="block text-[9px] font-technical uppercase text-corporate-muted tracking-wider">
              Binding & Lamination
            </span>
            <span className="text-xs font-bold text-corporate-text block capitalize truncate">
              {payload.binding_method.replace(/_/g, ' ')}
            </span>
            <span className="text-[10px] text-corporate-muted font-technical capitalize block truncate">
              {payload.finishing_options ? payload.finishing_options.replace(/_/g, ' ') : 'No Lamination'}
              {payload.uv_varnish ? ' · +UV Varnish' : ''}
            </span>
          </div>

          {/* Endpapers if hardcover */}
          {baselineEndpaper && (
            <div className="col-span-2 sm:col-span-2 min-w-0">
              <span className="block text-[9px] font-technical uppercase text-corporate-muted tracking-wider">
                Endpapers
              </span>
              <span className="text-xs font-bold text-corporate-text truncate block">
                {baselineEndpaper} · Print: {payload.endpapers_print || 'None'}
              </span>
              {preferredEndpaper && (
                <span className="text-[10px] text-corporate-accent font-technical font-bold truncate block mt-0.5">
                  Catalog: {preferredEndpaper} · Synced to BPE
                </span>
              )}
            </div>
          )}

          {/* Delivery country */}
          <div className="min-w-0">
            <span className="block text-[9px] font-technical uppercase text-corporate-muted tracking-wider">
              Destination
            </span>
            <span className="text-xs font-bold text-corporate-text font-technical uppercase">
              {payload.delivery_country}
            </span>
          </div>
        </div>
      </div>

      {/* MOBILE STICKY BOTTOM DRAWER (320px, 375px, 390px, 430px compliant, >= 44px touch targets) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-corporate-secondary/95 backdrop-blur-md border-t border-corporate-border shadow-2xl rounded-t-2xl">
        {/* Expanded Drawer Details */}
        {mobileExpanded && (
          <div className="p-4 bg-corporate-primary border-b border-corporate-border rounded-t-2xl max-h-[60vh] overflow-y-auto space-y-3 text-xs animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-corporate-border">
              <span className="text-[10px] font-technical font-black uppercase tracking-monolith text-corporate-accent">
                Active Specification Summary
              </span>
              <button
                type="button"
                onClick={() => setMobileExpanded(false)}
                className="px-2.5 py-1 rounded-lg border border-corporate-border text-corporate-muted hover:text-corporate-text text-xs font-technical uppercase"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-[9px] text-corporate-muted uppercase block">Volume</span>
                <span className="font-bold text-corporate-text tabular-nums">{payload.copies} copies</span>
              </div>
              <div>
                <span className="text-[9px] text-corporate-muted uppercase block">Trim Size</span>
                <span className="font-bold text-corporate-text">{payload.book_size} ({payload.orientation})</span>
              </div>
              <div>
                <span className="text-[9px] text-corporate-muted uppercase block">Pages</span>
                <span className="text-corporate-text tabular-nums">{payload.interior_pages} interior + {payload.cover_pages} cover</span>
              </div>
              <div>
                <span className="text-[9px] text-corporate-muted uppercase block">Destination</span>
                <span className="font-bold text-corporate-text">{payload.delivery_country}</span>
              </div>
            </div>

            <div className="border-t border-corporate-border pt-2 text-[11px] space-y-1">
              <div>
                <span className="text-[9px] text-corporate-muted uppercase">Interior Substrate: </span>
                <span className="text-corporate-text font-bold">{baselineInterior}</span>
                {preferredInterior && (
                  <span className="text-corporate-accent block text-[10px] font-technical font-bold">
                    Catalog: {preferredInterior} · Synced to BPE
                  </span>
                )}
              </div>
              <div>
                <span className="text-[9px] text-corporate-muted uppercase">Cover Substrate: </span>
                <span className="text-corporate-text font-bold">{baselineCover}</span>
                {preferredCover && (
                  <span className="text-corporate-accent block text-[10px] font-technical font-bold">
                    Catalog: {preferredCover} · Synced to BPE
                  </span>
                )}
              </div>
              <div>
                <span className="text-[9px] text-corporate-muted uppercase">Binding: </span>
                <span className="text-corporate-text font-bold capitalize">{payload.binding_method.replace(/_/g, ' ')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Minimized Bar */}
        <div className="px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => setMobileExpanded(!mobileExpanded)}
            className="min-h-[44px] flex items-center gap-2 text-left flex-1 min-w-0 px-2 py-1 rounded-xl hover:bg-corporate-elevated/60 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="text-xs font-black text-corporate-text font-display shrink-0 tabular-nums">
                  {payload.copies} ex.
                </span>
                <span className="text-xs text-corporate-muted shrink-0">·</span>
                <span className="text-xs text-corporate-text-secondary truncate">
                  {payload.book_size} · {payload.interior_pages}pp
                </span>
              </div>
              {isSpecsStale && offers && (
                <p className="text-[9px] text-corporate-accent font-technical font-bold uppercase tracking-wider truncate">
                  Recalculate required
                </p>
              )}
            </div>
            {mobileExpanded ? (
              <ChevronDownIcon className="w-4 h-4 text-corporate-muted shrink-0" />
            ) : (
              <ChevronUpIcon className="w-4 h-4 text-corporate-muted shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={onRecalculate}
            disabled={loading}
            className="min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl bg-corporate-accent text-white text-[10px] font-technical font-black uppercase tracking-monolith hover:bg-corporate-hover shrink-0 transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {isSpecsStale ? 'Recalculate' : 'Calculate'}
          </button>
        </div>
      </div>
    </>
  );
};

export default ConfigurationSummary;
