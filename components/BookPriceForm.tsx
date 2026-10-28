import React, { useState, useEffect } from 'react';
import {
  BOOK_SIZES_PORTRAIT,
  BOOK_SIZES_LANDSCAPE,
  ORIENTATIONS,
  INTERIOR_PRINT_OPTIONS,
  COVER_PRINT_OPTIONS,
  PAPER_TYPE_INTERIOR,
  PAPER_TYPE_COVER,
  PAPER_TYPE_ENDPAPER,
  BINDING_METHODS,
  FINISHING_OPTIONS,
  ENDPAPERS_OPTIONS,
  ENDPAPERS_PRINT_OPTIONS,
  INTERIOR_GSM_OPTIONS,
  COVER_GSM_OPTIONS,
  ENDPAPERS_GSM_OPTIONS,
  DELIVERY_COUNTRIES,
  COVER_PAGES_OPTIONS,
  PMS_OPTIONS,
  DIMENSION_RANGES,
  DIMENSION_HINTS,
} from '../constants';
import {
  UserGroupIcon,
  GlobeEuropeAfricaIcon,
  Square3Stack3DIcon,
  DocumentTextIcon,
  BookOpenIcon,
  ArrowsPointingOutIcon,
  PaintBrushIcon,
  ScaleIcon,
  SwatchIcon,
  TrophyIcon,
  SparklesIcon,
  SunIcon,
  CogIcon,
  BeakerIcon,
  WrenchIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import { InitialBookPricePayload, SelectedPaperMaterial } from '../types';
import { t } from '../i18n/en';
import AdvancedPaperSelector, { resolveBpePaperTypeFromMaterial } from './AdvancedPaperSelector';

interface BookPriceFormProps {
  initialPayload: InitialBookPricePayload;
  onPayloadChange: (payload: InitialBookPricePayload) => void;
  onCalculatePrice: () => void;
  loading: boolean;
  hasPdf: boolean;
  isAdmin?: boolean;
  payloadVersion?: number;
  onSpecsInvalidated?: () => void;
}

const BookPriceForm: React.FC<BookPriceFormProps> = ({
  initialPayload,
  onPayloadChange,
  onCalculatePrice,
  loading,
  hasPdf,
  isAdmin = false,
  payloadVersion = 0,
  onSpecsInvalidated,
}) => {
  const [payload, setPayload] = useState<InitialBookPricePayload>(initialPayload);
  const [customDimensionError, setCustomDimensionError] = useState<string>('');

  useEffect(() => {
    setPayload(initialPayload);
  }, [payloadVersion]);

  // Check if hardcover is selected
  const isHardcover = payload.binding_method === 'thread_sewn_hc';
  const currentBookSizes = payload.orientation === 'landscape' ? BOOK_SIZES_LANDSCAPE : BOOK_SIZES_PORTRAIT;

  useEffect(() => {
    const validSizes = payload.orientation === 'landscape' ? BOOK_SIZES_LANDSCAPE : BOOK_SIZES_PORTRAIT;
    if (!validSizes.includes(payload.book_size)) {
      const nextPayload = { ...payload, book_size: validSizes[0] as any };
      setPayload(nextPayload);
      onPayloadChange(nextPayload);
      onSpecsInvalidated?.();
    }
  }, [payload.orientation]);

  // Validate custom dimensions
  const isCustomSizeValid = (width: number, height: number, orientation: string): boolean => {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
    const ranges = DIMENSION_RANGES[orientation as 'portrait' | 'landscape'] || [];
    return ranges.some((r) => width >= r.wMin && width <= r.wMax && height >= r.hMin && height <= r.hMax);
  };

  const validateCustomDimensions = (): boolean => {
    if (payload.book_size !== 'Custom') {
      setCustomDimensionError('');
      return true;
    }

    const w = payload.custom_width || 0;
    const h = payload.custom_height || 0;

    if (!w || !h) {
      setCustomDimensionError('');
      return true;
    }

    const valid = isCustomSizeValid(w, h, payload.orientation);
    if (valid) {
      setCustomDimensionError('');
      return true;
    }

    const orientationName = payload.orientation === 'portrait' ? 'Portrait' : 'Landscape';
    setCustomDimensionError(
      `These dimensions are not available for ${orientationName} orientation. Please use one of the ranges listed above.`
    );
    return false;
  };

  // Validate on dimension or orientation change
  useEffect(() => {
    validateCustomDimensions();
  }, [payload.custom_width, payload.custom_height, payload.orientation, payload.book_size]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    let newValue: any = value;

    if (type === 'number') {
      newValue = value === '' ? 0 : Number(value);
    }

    if (type === 'checkbox') {
      newValue = (e.target as HTMLInputElement).checked;
    }

    const nextPayload = {
      ...payload,
      [name]: newValue,
    } as InitialBookPricePayload;

    if (name === 'book_size' && newValue !== 'Custom') {
      nextPayload.custom_width = undefined;
      nextPayload.custom_height = undefined;
    }

    setPayload(nextPayload);
    onPayloadChange(nextPayload);
    onSpecsInvalidated?.();
  };

  // Advanced Paper Handlers (Syncs gsm & BPE substrate family, preserves full material traceability, triggers spec invalidation)
  const handleInteriorPaperSelect = (material: SelectedPaperMaterial | null) => {
    const mappedType = material
      ? resolveBpePaperTypeFromMaterial(
          {
            category: material.category,
            brand: material.brand,
            finish: material.finish,
            productName: material.productName || material.product_name,
          },
          'interior'
        )
      : payload.paper_type_interior;
    const nextPayload = {
      ...payload,
      interior_paper_material: material,
      ...(material?.gsm ? { paper_weight_interior: material.gsm } : {}),
      ...(mappedType ? { paper_type_interior: mappedType as any } : {}),
    };
    setPayload(nextPayload);
    onPayloadChange(nextPayload);
    onSpecsInvalidated?.();
  };

  const handleCoverPaperSelect = (material: SelectedPaperMaterial | null) => {
    const mappedType = material
      ? resolveBpePaperTypeFromMaterial(
          {
            category: material.category,
            brand: material.brand,
            finish: material.finish,
            productName: material.productName || material.product_name,
          },
          'cover'
        )
      : payload.paper_type_cover;
    const nextPayload = {
      ...payload,
      cover_paper_material: material,
      ...(material?.gsm ? { paper_weight_cover: material.gsm } : {}),
      ...(mappedType ? { paper_type_cover: mappedType as any } : {}),
    };
    setPayload(nextPayload);
    onPayloadChange(nextPayload);
    onSpecsInvalidated?.();
  };

  const handleEndpaperSelect = (material: SelectedPaperMaterial | null) => {
    const mappedType = material
      ? resolveBpePaperTypeFromMaterial(
          {
            category: material.category,
            brand: material.brand,
            finish: material.finish,
            productName: material.productName || material.product_name,
          },
          'endpaper'
        )
      : payload.paper_type_endpaper;
    const nextPayload = {
      ...payload,
      endpaper_material: material,
      ...(material?.gsm ? { paper_weight_endpapers: material.gsm } : {}),
      ...(mappedType ? { paper_type_endpaper: mappedType as any } : {}),
    };
    setPayload(nextPayload);
    onPayloadChange(nextPayload);
    onSpecsInvalidated?.();
  };

  const handleCalculatePrice = () => {
    if (payload.book_size === 'Custom' && !validateCustomDimensions()) {
      return;
    }
    onCalculatePrice();
  };

  return (
    <div className="bg-corporate-secondary rounded-2xl shadow-sm p-4 sm:p-6 md:p-10 border border-corporate-border relative overflow-hidden min-w-0">
      <div className="absolute top-0 right-0 opacity-[0.02] font-technical text-[5rem] sm:text-[8rem] font-black pointer-events-none uppercase select-none leading-none">
        SPEC
      </div>
      
      <div className="flex items-center justify-between mb-8 sm:mb-12 relative z-10 border-b border-corporate-border pb-4">
        <h2 className="text-[0.7rem] font-sans font-black tracking-wider sm:tracking-monolith text-corporate-accent flex items-center gap-3 uppercase">
          <WrenchIcon className="w-5 h-5" />
          {t('book_specifications_label') || 'Book specifications'}
        </h2>
        <span className="hidden sm:inline text-[10px] font-technical uppercase font-bold text-corporate-muted">
          PrintPrice Industrial Specification Engine
        </span>
      </div>

      <div className="flex flex-col gap-14 text-xs sm:text-sm">
        {/* ======================================================== */}
        {/* GROUP 1: BOOK SPECIFICATIONS (Geometry, Pages, Quantity) */}
        {/* ======================================================== */}
        <div className="space-y-6">
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="w-2 h-2 rounded-full bg-corporate-accent shrink-0" />
            <h3 className="text-[11px] font-sans font-black text-corporate-text uppercase tracking-wider sm:tracking-monolith">
              1. Book Specifications & Format
            </h3>
            <div className="h-px w-full bg-corporate-border" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-8">
            {/* Copies */}
            <div className="flex flex-col">
              <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                <UserGroupIcon className="w-4 h-4 text-corporate-accent" />
                {t('copies_label')}
              </label>
              <input
                type="number"
                name="copies"
                min={1}
                value={payload.copies}
                onChange={handleChange}
                className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-sm focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300 placeholder:text-corporate-muted"
              />
              <p className="mt-2 text-[11px] text-corporate-muted italic leading-tight">
                {t('copies_help')}
              </p>
            </div>

            {/* Book Size */}
            <div className="flex flex-col">
              <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                <Square3Stack3DIcon className="w-4 h-4 text-corporate-accent" />
                {t('book_size_label')}
              </label>
              <select
                name="book_size"
                value={payload.book_size}
                onChange={handleChange}
                className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-sm focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
              >
                {currentBookSizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] text-corporate-muted italic leading-tight">
                {t('book_size_help')}
              </p>
            </div>

            {/* Orientation */}
            <div className="flex flex-col">
              <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                <ArrowsPointingOutIcon className="w-4 h-4 text-corporate-accent" />
                {t('orientation_label')}
              </label>
              <select
                name="orientation"
                value={payload.orientation}
                onChange={handleChange}
                className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-sm focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
              >
                {ORIENTATIONS.map((o) => (
                  <option key={o} value={o}>
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] text-corporate-muted italic leading-tight">
                {t('orientation_help')}
              </p>
            </div>
          </div>

          {/* Custom Dimensions Subsection */}
          {payload.book_size === 'Custom' && (
            <div className="bg-corporate-elevated/60 rounded-xl border border-corporate-accent/30 p-4 sm:p-6 mt-4 min-w-0">
              <span className="text-[10px] font-sans font-black text-corporate-accent uppercase tracking-monolith flex items-center gap-3 mb-6">
                <ArrowsPointingOutIcon className="w-4 h-4" />
                Custom Book Dimensions
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col">
                  <label className="font-sans font-bold text-corporate-muted mb-2 uppercase tracking-technical text-[10px]">
                    Width (mm)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="custom_width"
                      min={payload.orientation === 'portrait' ? 100 : 120}
                      max={297}
                      step={1}
                      placeholder="210"
                      value={payload.custom_width || ''}
                      onChange={handleChange}
                      className={`block w-full rounded-xl py-3 px-4 bg-corporate-primary border text-corporate-text text-sm focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300 ${customDimensionError ? 'border-corporate-accent' : 'border-corporate-border'}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-technical font-black text-corporate-muted uppercase pointer-events-none">
                      MM
                    </span>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="font-sans font-bold text-corporate-muted mb-2 uppercase tracking-technical text-[10px]">
                    Height (mm)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="custom_height"
                      min={120}
                      max={340}
                      step={1}
                      placeholder="297"
                      value={payload.custom_height || ''}
                      onChange={handleChange}
                      className={`block w-full rounded-xl py-3 px-4 bg-corporate-primary border text-corporate-text text-sm focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300 ${customDimensionError ? 'border-corporate-accent' : 'border-corporate-border'}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-technical font-black text-corporate-muted uppercase pointer-events-none">
                      MM
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl bg-corporate-accent/5 p-4 border border-corporate-accent/15">
                <p className="text-[9px] font-technical font-bold text-corporate-accent uppercase tracking-monolith mb-1 flex items-center gap-2">
                  <SparklesIcon className="w-3 h-3" />
                  <span>{payload.orientation === 'portrait' ? 'Portrait' : 'Landscape'} Print Authority</span>
                </p>
                <p className="text-[10px] text-corporate-text-secondary leading-relaxed font-technical uppercase tracking-wider opacity-80">
                  {DIMENSION_HINTS[payload.orientation]}
                </p>
              </div>

              {customDimensionError && (
                <p className="mt-3 text-xs text-corporate-accent font-semibold" role="alert">
                  {customDimensionError}
                </p>
              )}
            </div>
          )}

          {/* Pagination */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 pt-2">
            <div className="flex flex-col">
              <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                <DocumentTextIcon className="w-4 h-4 text-corporate-accent" />
                {t('interior_pages_label')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="interior_pages"
                  min={0}
                  value={payload.interior_pages}
                  onChange={handleChange}
                  className={`block w-full rounded-xl py-3 px-4 bg-corporate-primary border text-corporate-text text-sm focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300 ${hasPdf ? 'border-corporate-accent/50' : 'border-corporate-border'}`}
                />
                {hasPdf && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="text-[9px] rounded-full bg-emerald-700 text-white px-2.5 py-0.5 font-bold uppercase tracking-wider">
                      PDF OK
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-[11px] text-corporate-muted italic leading-tight">
                {t('interior_pages_help')}
              </p>
            </div>

            <div className="flex flex-col">
              <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                <BookOpenIcon className="w-4 h-4 text-corporate-accent" />
                {t('cover_pages_label')}
              </label>
              <select
                name="cover_pages"
                value={payload.cover_pages}
                onChange={handleChange}
                className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-sm focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
              >
                {COVER_PAGES_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v} pages
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] text-corporate-muted italic leading-tight">
                {t('cover_pages_help')}
              </p>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* GROUP 2: PAPER SELECTION (Interior, Cover, Endpapers)    */}
        {/* ======================================================== */}
        <div className="space-y-10">
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="w-2 h-2 rounded-full bg-corporate-accent shrink-0" />
            <h3 className="text-[11px] font-sans font-black text-corporate-text uppercase tracking-wider sm:tracking-monolith">
              2. Paper Substrates & Printing Inks
            </h3>
            <div className="h-px w-full bg-corporate-border" />
          </div>

          {/* Interior Paper Selector */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
              {/* Interior Color */}
              <div className="flex flex-col">
                <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                  <PaintBrushIcon className="w-4 h-4 text-corporate-accent" />
                  {t('interior_print_label')}
                </label>
                <select
                  name="interior_print"
                  value={payload.interior_print}
                  onChange={handleChange}
                  className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                >
                  {INTERIOR_PRINT_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m === '4/4' ? '4/4 Full Color Both Sides' : m === '2/2' ? '2/2 Colors' : '1/1 B/W'}
                    </option>
                  ))}
                </select>
              </div>

              {/* PMS Interior */}
              <div className="flex flex-col">
                <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                  <SwatchIcon className="w-4 h-4 text-corporate-accent" />
                  {t('pms_interior_label')}
                </label>
                <select
                  name="pms_interior"
                  value={payload.pms_interior}
                  onChange={handleChange}
                  className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                >
                  {PMS_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v === 0 ? 'None (Standard Process Inks)' : `${v} Pantone Spot Color`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <AdvancedPaperSelector
              label="Interior Paper Stock"
              helpText="Select paper substrate for the internal book block."
              target="interior"
              mode={payload.paper_mode_interior || 'standard'}
              onModeChange={(m) => {
                const next = { ...payload, paper_mode_interior: m };
                setPayload(next);
                onPayloadChange(next);
              }}
              selectedMaterial={payload.interior_paper_material || null}
              onSelectMaterial={handleInteriorPaperSelect}
              bookSize={payload.book_size}
              onSpecsInvalidated={onSpecsInvalidated}
              standardTypeComponent={
                <div className="flex flex-col">
                  <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-2 uppercase tracking-technical text-[10px]">
                    <CogIcon className="w-3.5 h-3.5 text-corporate-accent" />
                    Standard Paper Stock
                  </label>
                  <select
                    name="paper_type_interior"
                    value={payload.paper_type_interior}
                    onChange={handleChange}
                    className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                  >
                    {PAPER_TYPE_INTERIOR.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              }
              standardGsmComponent={
                <div className="flex flex-col">
                  <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-2 uppercase tracking-technical text-[10px]">
                    <ScaleIcon className="w-3.5 h-3.5 text-corporate-accent" />
                    Standard Grammage
                  </label>
                  <select
                    name="paper_weight_interior"
                    value={payload.paper_weight_interior}
                    onChange={handleChange}
                    className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                  >
                    {INTERIOR_GSM_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} gsm
                      </option>
                    ))}
                  </select>
                </div>
              }
            />
          </div>

          {/* Cover Paper Selector */}
          <div className="space-y-4 pt-4 border-t border-corporate-border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-2">
              {/* Cover Color */}
              <div className="flex flex-col">
                <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                  <PaintBrushIcon className="w-4 h-4 text-corporate-accent" />
                  {t('cover_print_label')}
                </label>
                <select
                  name="cover_print"
                  value={payload.cover_print}
                  onChange={handleChange}
                  className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                >
                  {COVER_PRINT_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m === '4/0' ? '4/0 Single-sided (Outside only)' : m === '4/4' ? '4/4 Both sides' : '1/0 B/W'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cover Reverse Print */}
              <div className="flex flex-col">
                <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                  <AdjustmentsHorizontalIcon className="w-4 h-4 text-corporate-accent" />
                  {t('cover_print_rev_label')}
                </label>
                <select
                  name="cover_print_rev"
                  value={payload.cover_print_rev}
                  onChange={handleChange}
                  className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((v) => (
                    <option key={v} value={v}>
                      {v === 0 ? 'None (Blank Inside)' : `${v} color${v > 1 ? 's' : ''}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* PMS Cover */}
              <div className="flex flex-col">
                <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                  <SwatchIcon className="w-4 h-4 text-corporate-accent" />
                  {t('pms_cover_label')}
                </label>
                <select
                  name="pms_cover"
                  value={payload.pms_cover}
                  onChange={handleChange}
                  className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                >
                  {PMS_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v === 0 ? 'None' : `${v} Pantone Spot Color`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <AdvancedPaperSelector
              label="Cover Paper Stock / Board"
              helpText="Select heavy substrate for book exterior."
              target="cover"
              mode={payload.paper_mode_cover || 'standard'}
              onModeChange={(m) => {
                const next = { ...payload, paper_mode_cover: m };
                setPayload(next);
                onPayloadChange(next);
              }}
              selectedMaterial={payload.cover_paper_material || null}
              onSelectMaterial={handleCoverPaperSelect}
              bookSize={payload.book_size}
              onSpecsInvalidated={onSpecsInvalidated}
              standardTypeComponent={
                <div className="flex flex-col">
                  <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-2 uppercase tracking-technical text-[10px]">
                    <BeakerIcon className="w-3.5 h-3.5 text-corporate-accent" />
                    Standard Cover Stock
                  </label>
                  <select
                    name="paper_type_cover"
                    value={payload.paper_type_cover}
                    onChange={handleChange}
                    className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                  >
                    {PAPER_TYPE_COVER.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              }
              standardGsmComponent={
                <div className="flex flex-col">
                  <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-2 uppercase tracking-technical text-[10px]">
                    <ScaleIcon className="w-3.5 h-3.5 text-corporate-accent" />
                    Standard Cover Grammage
                  </label>
                  <select
                    name="paper_weight_cover"
                    value={payload.paper_weight_cover}
                    onChange={handleChange}
                    className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                  >
                    {COVER_GSM_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} gsm
                      </option>
                    ))}
                  </select>
                </div>
              }
            />
          </div>

          {/* Hardcover Endpapers Section */}
          {isHardcover && (
            <div className="space-y-4 pt-4 border-t border-corporate-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-sans font-black uppercase tracking-monolith text-corporate-accent flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4" />
                  Hardcover Endpapers Specification
                </span>
                <span className="text-[10px] font-technical uppercase font-bold text-corporate-muted">
                  Case Binding Component
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
                <div className="flex flex-col">
                  <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                    {t('endpapers_label')}
                  </label>
                  <select
                    name="endpapers"
                    value={payload.endpapers}
                    onChange={handleChange}
                    className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                  >
                    {ENDPAPERS_OPTIONS.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                    {t('endpapers_print_label')}
                  </label>
                  <select
                    name="endpapers_print"
                    value={payload.endpapers_print}
                    onChange={handleChange}
                    disabled={payload.endpapers === 'none'}
                    className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300 disabled:opacity-30"
                  >
                    {ENDPAPERS_PRINT_OPTIONS.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {payload.endpapers !== 'none' && (
                <AdvancedPaperSelector
                  label="Endpapers Substrate"
                  helpText="Paper block connecting hardcover boards to book block."
                  target="endpaper"
                  mode={payload.paper_mode_endpaper || 'standard'}
                  onModeChange={(m) => {
                    const next = { ...payload, paper_mode_endpaper: m };
                    setPayload(next);
                    onPayloadChange(next);
                  }}
                  selectedMaterial={payload.endpaper_material || null}
                  onSelectMaterial={handleEndpaperSelect}
                  bookSize={payload.book_size}
                  onSpecsInvalidated={onSpecsInvalidated}
                  standardTypeComponent={
                    <div className="flex flex-col">
                      <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-2 uppercase tracking-technical text-[10px]">
                        Standard Endpaper Stock
                      </label>
                      <select
                        name="paper_type_endpaper"
                        value={payload.paper_type_endpaper}
                        onChange={handleChange}
                        className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                      >
                        {PAPER_TYPE_ENDPAPER.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  }
                  standardGsmComponent={
                    <div className="flex flex-col">
                      <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-2 uppercase tracking-technical text-[10px]">
                        Endpaper Weight
                      </label>
                      <select
                        name="paper_weight_endpapers"
                        value={payload.paper_weight_endpapers}
                        onChange={handleChange}
                        className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                      >
                        {ENDPAPERS_GSM_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {n} gsm
                          </option>
                        ))}
                      </select>
                    </div>
                  }
                />
              )}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* GROUP 3: BINDING & FINISHING                             */}
        {/* ======================================================== */}
        <div className="space-y-6">
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="w-2 h-2 rounded-full bg-corporate-accent shrink-0" />
            <h3 className="text-[11px] font-sans font-black text-corporate-text uppercase tracking-wider sm:tracking-monolith">
              3. Binding & Finishes
            </h3>
            <div className="h-px w-full bg-corporate-border" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-8">
            <div className="flex flex-col">
              <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                <TrophyIcon className="w-4 h-4 text-corporate-accent" />
                {t('binding_method_label')}
              </label>
              <select
                name="binding_method"
                value={payload.binding_method}
                onChange={handleChange}
                className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-sm focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
              >
                {BINDING_METHODS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] text-corporate-muted italic leading-tight">
                {t('binding_method_help')}
              </p>
            </div>

            <div className="flex flex-col">
              <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                <SparklesIcon className="w-4 h-4 text-corporate-accent" />
                {t('finishing_options_label')}
              </label>
              <select
                name="finishing_options"
                value={payload.finishing_options}
                onChange={handleChange}
                className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-sm focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
              >
                {FINISHING_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] text-corporate-muted italic leading-tight">
                {t('finishing_options_help')}
              </p>
            </div>

            <div className="flex flex-col">
              <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                <SunIcon className="w-4 h-4 text-corporate-accent" />
                {t('uv_varnish_label')}
              </label>
              <div className="flex items-center gap-4 rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border h-[48px]">
                <input
                  id="uv_varnish"
                  type="checkbox"
                  name="uv_varnish"
                  checked={payload.uv_varnish}
                  onChange={handleChange}
                  className="h-5 w-5 rounded-md bg-corporate-elevated border border-corporate-border-strong text-corporate-accent focus:ring-0 cursor-pointer"
                />
                <label htmlFor="uv_varnish" className="text-[10px] font-technical font-black text-corporate-text uppercase tracking-wider sm:tracking-monolith cursor-pointer">
                  {payload.uv_varnish ? 'ACTIVE (+Spot UV)' : 'INACTIVE'}
                </label>
              </div>
              <p className="mt-2 text-[11px] text-corporate-muted italic leading-tight">
                {t('uv_varnish_help')}
              </p>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* GROUP 4: DELIVERY & LOGISTICS                            */}
        {/* ======================================================== */}
        <div className="space-y-6 pt-4 border-t border-corporate-border">
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="w-2 h-2 rounded-full bg-corporate-accent shrink-0" />
            <h3 className="text-[11px] font-sans font-black text-corporate-text uppercase tracking-wider sm:tracking-monolith">
              4. Delivery & Logistics
            </h3>
            <div className="h-px w-full bg-corporate-border" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 items-center">
            <div className="flex flex-col">
              <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                <GlobeEuropeAfricaIcon className="w-4 h-4 text-corporate-accent" />
                {t('delivery_country_label')}
              </label>
              <select
                name="delivery_country"
                value={payload.delivery_country}
                onChange={handleChange}
                className="block w-full rounded-xl py-3 px-4 bg-corporate-elevated border border-corporate-border text-corporate-text text-sm focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
              >
                {DELIVERY_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] text-corporate-muted italic leading-tight">
                {t('delivery_country_help')}
              </p>
            </div>

            <div className="flex flex-col justify-end">
              <button
                type="button"
                onClick={handleCalculatePrice}
                disabled={loading}
                className="w-full min-h-[48px] rounded-xl inline-flex items-center justify-center bg-corporate-accent px-8 py-3.5 text-xs font-sans font-black text-white uppercase tracking-monolith transition-all duration-300 hover:bg-corporate-hover hover:shadow-[0_10px_30px_rgba(220,0,0,0.3)] disabled:opacity-50 relative group overflow-hidden shadow-sm"
              >
                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-corporate-text" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Calculating offers...
                  </>
                ) : (
                  'Calculate price offers'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookPriceForm;
