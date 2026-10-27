import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  SparklesIcon,
  TagIcon,
  ScaleIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import {
  PaperCategory,
  SelectedPaperMaterial,
  BookSize,
} from '../types';

export interface CatalogItem {
  variantId: string;
  productId: string;
  productName: string;
  brand: string | null;
  manufacturer: string | null;
  category: PaperCategory;
  finishSummary: string | null;
  gsm: number;
  widthMm: number;
  heightMm: number;
  sheetFormat: string;
  caliperUm: number | null;
  caliperMm: number | null;
  finish: string | null;
  grainDirection: string;
  isReel: boolean;
  isAvailable: boolean;
  certifications?: string[];
}

export interface AdvancedPaperSelectorProps {
  label: string;
  helpText?: string;
  target: 'interior' | 'cover' | 'endpaper';
  mode: 'standard' | 'advanced';
  onModeChange: (mode: 'standard' | 'advanced') => void;
  selectedMaterial: SelectedPaperMaterial | null;
  onSelectMaterial: (material: SelectedPaperMaterial | null) => void;
  bookSize: BookSize;
  standardTypeComponent?: React.ReactNode;
  standardGsmComponent?: React.ReactNode;
  onSpecsInvalidated?: () => void;
  disabled?: boolean;
}

const CATEGORY_TABS: { key: PaperCategory | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All Catalog' },
  { key: 'OFFSET', label: 'Offset / Uncoated' },
  { key: 'COATED', label: 'Coated / Silk-Gloss' },
  { key: 'CARTON', label: 'Carton / Board' },
  { key: 'DESIGN', label: 'Design / Munken' },
  { key: 'DIGITAL', label: 'Digital Press' },
  { key: 'OTHER', label: 'Specialties' },
];

export const AdvancedPaperSelector: React.FC<AdvancedPaperSelectorProps> = ({
  label,
  helpText,
  target,
  mode,
  onModeChange,
  selectedMaterial,
  onSelectMaterial,
  bookSize,
  standardTypeComponent,
  standardGsmComponent,
  onSpecsInvalidated,
  disabled = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<PaperCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch catalog from BFF proxy
  const fetchCatalog = useCallback(async () => {
    if (mode !== 'advanced') return;
    setLoading(true);
    setFetchError(null);

    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'ALL') {
        params.set('category', selectedCategory);
      }
      if (debouncedQuery) {
        params.set('q', debouncedQuery);
      }
      params.set('limit', '80');

      const url = `/api/budget/paper/search?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Catalog endpoint responded with status ${response.status}`);
      }
      const data = await response.json();
      if (data.ok && data.data?.items) {
        setCatalogItems(data.data.items);
      } else {
        throw new Error(data.message || 'Failed to parse catalog items');
      }
    } catch (err: any) {
      console.warn(`[AdvancedPaperSelector] Catalog fetch notice: ${err.message}`);
      setFetchError('Control Plane Paper Catalog is temporarily unreachable. You may retry or use Standard Presets.');
    } finally {
      setLoading(false);
    }
  }, [mode, selectedCategory, debouncedQuery]);

  useEffect(() => {
    if (mode === 'advanced') {
      fetchCatalog();
    }
  }, [fetchCatalog, mode]);

  // Group items by commercial product name
  const groupedProducts = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of catalogItems) {
      const key = `${item.productName}__${item.brand || 'Standard'}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const first = items[0];
      return {
        key,
        productName: first.productName,
        brand: first.brand || first.manufacturer || 'PrintPrice Partner Hub',
        category: first.category,
        variants: items.sort((a, b) => a.gsm - b.gsm),
      };
    });
  }, [catalogItems]);

  // Find currently selected product group if any
  const currentSelectedProductKey = useMemo(() => {
    if (!selectedMaterial) return '';
    const name = selectedMaterial.productName || selectedMaterial.product_name || '';
    return `${name}__${selectedMaterial.brand || 'Standard'}`;
  }, [selectedMaterial]);

  const currentProductVariants = useMemo(() => {
    if (!currentSelectedProductKey) return [];
    const found = groupedProducts.find((p) => p.key === currentSelectedProductKey);
    return found ? found.variants : [];
  }, [groupedProducts, currentSelectedProductKey]);

  // Handle switching to Advanced mode (informative only, does not invalidate quote)
  const handleToggleMode = (newMode: 'standard' | 'advanced') => {
    if (newMode === mode) return;
    onModeChange(newMode);
  };

  // Handle Category tab change
  const handleCategoryChange = (cat: PaperCategory | 'ALL') => {
    setSelectedCategory(cat);
    if (selectedMaterial && cat !== 'ALL' && selectedMaterial.category !== cat) {
      onSelectMaterial(null);
    }
  };

  // Handle selecting a specific product group
  const handleSelectProduct = (productKey: string) => {
    const product = groupedProducts.find((p) => p.key === productKey);
    if (!product || product.variants.length === 0) return;

    // Pick the first variant
    const defaultVariant = product.variants.find((v) => v.isAvailable) || product.variants[0];
    const newMaterial: SelectedPaperMaterial = {
      productId: defaultVariant.productId,
      variantId: defaultVariant.variantId,
      productName: defaultVariant.productName,
      product_id: defaultVariant.productId,
      variant_id: defaultVariant.variantId,
      product_name: defaultVariant.productName,
      brand: defaultVariant.brand || 'Control Plane Certified',
      category: defaultVariant.category,
      gsm: defaultVariant.gsm,
      finish: defaultVariant.finish || defaultVariant.finishSummary || undefined,
      caliperUm: defaultVariant.caliperUm || undefined,
      caliper_um: defaultVariant.caliperUm || undefined,
      sheetWidthMm: defaultVariant.widthMm,
      sheetHeightMm: defaultVariant.heightMm,
      raw_sheet_format: defaultVariant.sheetFormat,
      availability: 'CUSTOMER_PREFERENCE_PENDING_CONFIRMATION',
      isAvailable: true,
      source_catalog: 'CONTROL_PLANE_MASTER_HUB',
      certifications: defaultVariant.certifications || ['FSC Mix Credit', 'ECF'],
    };

    onSelectMaterial(newMaterial);
  };

  // Handle selecting a specific variant for the chosen product
  const handleSelectVariant = (variantId: string) => {
    const variant = currentProductVariants.find((v) => v.variantId === variantId);
    if (!variant) return;

    const updatedMaterial: SelectedPaperMaterial = {
      productId: variant.productId,
      variantId: variant.variantId,
      productName: variant.productName,
      product_id: variant.productId,
      variant_id: variant.variantId,
      product_name: variant.productName,
      brand: variant.brand || 'Control Plane Certified',
      category: variant.category,
      gsm: variant.gsm,
      finish: variant.finish || variant.finishSummary || undefined,
      caliperUm: variant.caliperUm || undefined,
      caliper_um: variant.caliperUm || undefined,
      sheetWidthMm: variant.widthMm,
      sheetHeightMm: variant.heightMm,
      raw_sheet_format: variant.sheetFormat,
      availability: 'CUSTOMER_PREFERENCE_PENDING_CONFIRMATION',
      isAvailable: true,
      source_catalog: 'CONTROL_PLANE_MASTER_HUB',
      certifications: variant.certifications || ['FSC Mix Credit', 'ECF'],
    };

    onSelectMaterial(updatedMaterial);
  };

  // Clear specific selection
  const handleClearSelection = () => {
    onSelectMaterial(null);
  };

  return (
    <div className="bg-corporate-primary/40 border border-white/10 p-6 md:p-8 flex flex-col gap-6 relative transition-all duration-300">
      {/* Header and Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h4 className="text-xs font-sans font-black tracking-monolith uppercase text-corporate-text">
              {label}
            </h4>
            {mode === 'advanced' && (
              <span className="bg-corporate-accent/10 border border-corporate-accent/30 text-corporate-accent text-[9px] font-technical font-black px-2 py-0.5 uppercase tracking-tighter">
                Control Plane Hub
              </span>
            )}
          </div>
          {helpText && (
            <p className="mt-1 text-[11px] text-corporate-text-secondary italic">
              {helpText}
            </p>
          )}
        </div>

        {/* Mode Toggle Buttons (Monolith strict 0px border) */}
        <div className="flex items-center border border-white/10 bg-corporate-primary self-start sm:self-auto" role="group" aria-label="Paper Selection Mode">
          <button
            type="button"
            onClick={() => handleToggleMode('standard')}
            disabled={disabled}
            className={`px-4 py-2 text-[10px] font-technical font-bold uppercase tracking-monolith transition-all ${
              mode === 'standard'
                ? 'bg-white/10 text-white border-b-2 border-corporate-accent'
                : 'text-corporate-text-secondary hover:text-white'
            }`}
          >
            Standard Presets
          </button>
          <button
            type="button"
            onClick={() => handleToggleMode('advanced')}
            disabled={disabled}
            className={`px-4 py-2 text-[10px] font-technical font-bold uppercase tracking-monolith transition-all flex items-center gap-1.5 ${
              mode === 'advanced'
                ? 'bg-corporate-accent text-white shadow-sm'
                : 'text-corporate-text-secondary hover:text-white'
            }`}
          >
            <SparklesIcon className="w-3.5 h-3.5 text-white" />
            Advanced Catalog
          </button>
        </div>
      </div>

      {/* STANDARD MODE VIEW */}
      {mode === 'standard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {standardTypeComponent}
          {standardGsmComponent}
        </div>
      )}

      {/* ADVANCED CATALOG VIEW */}
      {mode === 'advanced' && (
        <div className="flex flex-col gap-6 pt-2">
          {/* Informative Scope Notice (Requirement 5) */}
          <div className="bg-corporate-primary/80 border border-white/10 p-3.5 flex items-start gap-3">
            <InformationCircleIcon className="w-4 h-4 text-corporate-accent shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="text-white font-bold font-technical uppercase tracking-wider block mb-0.5">
                Paper preference only:
              </span>
              <span className="text-corporate-text-secondary">
                Paper preference only. Does not affect this estimate. Subject to print house confirmation and availability.
              </span>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-technical uppercase font-bold text-corporate-muted mr-1">
              Category:
            </span>
            {CATEGORY_TABS.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => handleCategoryChange(cat.key)}
                className={`px-3 py-1.5 text-[9px] font-technical font-bold uppercase tracking-monolith transition-all border ${
                  selectedCategory === cat.key
                    ? 'border-corporate-accent bg-corporate-accent/10 text-corporate-accent'
                    : 'border-white/5 bg-corporate-primary/70 text-corporate-text-secondary hover:border-white/20 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search bar & Refresh */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search material brand, name or GSM (e.g. Amber Graphic, Creator Silk, 120)..."
                className="w-full pl-10 pr-4 py-3 bg-corporate-primary border border-white/10 text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent placeholder:text-corporate-muted/50 transition-all font-sans"
              />
              <MagnifyingGlassIcon className="w-4 h-4 text-corporate-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-corporate-muted hover:text-white uppercase font-technical"
                >
                  Clear
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={fetchCatalog}
              disabled={loading}
              title="Refresh Control Plane Catalog"
              className="px-3.5 py-3 border border-white/10 hover:border-corporate-accent bg-corporate-primary text-corporate-text-secondary hover:text-white transition-all"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin text-corporate-accent' : ''}`} />
            </button>
          </div>

          {/* Error Banner with Retry */}
          {fetchError && (
            <div className="bg-corporate-primary border border-corporate-accent/40 p-4 flex items-start gap-4">
              <ExclamationTriangleIcon className="w-5 h-5 text-corporate-accent shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-technical font-bold text-corporate-accent uppercase tracking-wider">
                  Catalog Synchronisation Notice
                </p>
                <p className="text-xs text-corporate-text-secondary mt-1">
                  {fetchError}
                </p>
                <div className="mt-3 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={fetchCatalog}
                    className="px-3 py-1 bg-corporate-accent text-white text-[10px] font-technical font-black uppercase tracking-monolith hover:bg-corporate-hover transition-colors"
                  >
                    Retry Connection
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleMode('standard')}
                    className="text-[10px] font-technical text-corporate-muted hover:text-white uppercase tracking-monolith underline"
                  >
                    Switch to Standard Presets
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && (
            <div className="space-y-3 py-4 animate-pulse">
              <div className="h-10 bg-corporate-primary border border-white/5 w-full" />
              <div className="h-14 bg-corporate-primary border border-white/5 w-full" />
            </div>
          )}

          {/* Products & Materials Grid / Selector */}
          {!loading && !fetchError && (
            <div className="space-y-6">
              {groupedProducts.length === 0 ? (
                <div className="border border-dashed border-white/10 p-8 text-center bg-corporate-primary/20">
                  <InformationCircleIcon className="w-6 h-6 text-corporate-muted mx-auto mb-2" />
                  <p className="text-xs font-technical uppercase tracking-widest text-corporate-muted">
                    No catalog materials found for &quot;{searchQuery || selectedCategory}&quot;
                  </p>
                  <p className="text-[11px] text-corporate-text-secondary mt-1">
                    Try choosing &quot;All Catalog&quot; or searching for a different commercial brand name.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Step 1: Material Selection */}
                  <div className="flex flex-col">
                    <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                      <TagIcon className="w-3.5 h-3.5 text-corporate-accent" />
                      Commercial Material
                    </label>
                    <select
                      value={currentSelectedProductKey}
                      onChange={(e) => handleSelectProduct(e.target.value)}
                      className="block w-full py-3.5 px-4 bg-corporate-primary border border-white/10 text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300"
                    >
                      <option value="">— Select Catalog Paper Material —</option>
                      {groupedProducts.map((prod) => (
                        <option key={prod.key} value={prod.key}>
                          {prod.productName} ({prod.brand}) — {prod.category}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[10px] text-corporate-muted font-technical uppercase tracking-wider">
                      Authoritative substrate from verified European mills.
                    </p>
                  </div>

                  {/* Step 2: Variant & Grammage Selection */}
                  <div className="flex flex-col">
                    <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-3 uppercase tracking-technical text-[10px]">
                      <ScaleIcon className="w-3.5 h-3.5 text-corporate-accent" />
                      Grammage & Available Variant
                    </label>
                    <select
                      value={selectedMaterial?.variantId || selectedMaterial?.variant_id || ''}
                      onChange={(e) => handleSelectVariant(e.target.value)}
                      disabled={!selectedMaterial || currentProductVariants.length === 0}
                      className="block w-full py-3.5 px-4 bg-corporate-primary border border-white/10 text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all duration-300 disabled:opacity-40"
                    >
                      {!selectedMaterial ? (
                        <option value="">— Select Material first —</option>
                      ) : (
                        currentProductVariants.map((v) => (
                          <option key={v.variantId} value={v.variantId}>
                            {v.gsm} GSM · {v.finish || v.finishSummary || 'Standard'} · {v.sheetFormat}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="mt-2 text-[10px] text-corporate-muted font-technical uppercase tracking-wider">
                      Specific mill caliper and press format.
                    </p>
                  </div>
                </div>
              )}

              {/* SPECIFICATION CARD (Shows selected material details) */}
              {selectedMaterial && (
                <div className="border border-corporate-accent/30 bg-corporate-primary p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-1 bg-corporate-accent w-full" />
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircleIcon className="w-4 h-4 text-corporate-accent shrink-0" />
                        <span className="text-xs font-sans font-black uppercase tracking-monolith text-corporate-text">
                          {selectedMaterial.productName || selectedMaterial.product_name}
                        </span>
                        <span className="text-[10px] text-corporate-muted font-technical">
                          by {selectedMaterial.brand}
                        </span>
                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-[9px] font-technical uppercase font-bold text-corporate-text">
                          {selectedMaterial.category}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-corporate-text-secondary font-technical">
                        <div>
                          Weight:{' '}
                          <span className="text-white font-bold">{selectedMaterial.gsm} gsm</span>
                        </div>
                        {selectedMaterial.finish && (
                          <div>
                            Finish:{' '}
                            <span className="text-white font-bold">{selectedMaterial.finish}</span>
                          </div>
                        )}
                        {(selectedMaterial.caliperUm || selectedMaterial.caliper_um) && (
                          <div>
                            Caliper:{' '}
                            <span className="text-white font-bold">{selectedMaterial.caliperUm || selectedMaterial.caliper_um} µm</span>
                          </div>
                        )}
                        <div>
                          Preference Status:{' '}
                          <span className="text-amber-400 font-bold uppercase">
                            Customer Preference (Unconfirmed by Printer)
                          </span>
                        </div>
                      </div>

                      {/* Required Scope Notice (Requirement 5 & 7) */}
                      <div className="bg-corporate-secondary border-l-2 border-corporate-accent p-3 mt-2 flex items-start gap-3">
                        <InformationCircleIcon className="w-4 h-4 text-corporate-accent shrink-0 mt-0.5" />
                        <div className="text-[11px] font-technical leading-relaxed">
                          <p className="text-corporate-text font-bold uppercase tracking-wider">
                            Paper preference only:
                          </p>
                          <p className="text-corporate-text-secondary mt-0.5">
                            Paper preference only. Does not affect this estimate. Subject to print house confirmation and availability.
                          </p>
                        </div>
                      </div>

                      {/* Raw Press Sheet vs Book Trim Size distinction banner */}
                      <div className="bg-corporate-secondary border-l-2 border-white/20 p-3 mt-2 flex items-start gap-3">
                        <AdjustmentsHorizontalIcon className="w-4 h-4 text-corporate-muted shrink-0 mt-0.5" />
                        <div className="text-[10px] font-technical leading-relaxed">
                          <p className="text-corporate-text font-bold uppercase tracking-wider">
                            Press Sheet Format: {selectedMaterial.raw_sheet_format || (selectedMaterial.sheetWidthMm && selectedMaterial.sheetHeightMm ? `${selectedMaterial.sheetWidthMm}x${selectedMaterial.sheetHeightMm} mm` : '700x1000 mm (B1)')}
                          </p>
                          <p className="text-corporate-text-secondary mt-0.5">
                            Raw parent stock sheet imposed on printing press. Distinct from final trimmed book size ({bookSize}). BPE calculates optimal imposition signatures automatically.
                          </p>
                        </div>
                      </div>

                      {/* Certifications */}
                      {selectedMaterial.certifications && selectedMaterial.certifications.length > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[9px] text-corporate-muted uppercase font-technical font-bold">
                            Eco / Standards:
                          </span>
                          {selectedMaterial.certifications.map((cert) => (
                            <span
                              key={cert}
                              className="px-2 py-0.5 bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-[8px] font-technical uppercase font-bold"
                            >
                              {cert}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="px-3 py-1.5 border border-white/10 hover:border-corporate-accent text-corporate-muted hover:text-white text-[9px] font-technical uppercase tracking-monolith transition-all"
                      >
                        Change / Reset
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvancedPaperSelector;
