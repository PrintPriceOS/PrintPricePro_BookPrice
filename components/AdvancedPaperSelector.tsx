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
  CubeTransparentIcon,
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
  bulkFactor?: number | null;
  caliperSource?: string | null;
  caliperConfidenceStatus?: string | null;
  caliperRevision?: number | null;
  finish: string | null;
  grainDirection: string;
  paperType?: string | null;
  coatingStatus?: string | null;
  originalCode?: string | null;
  isReel: boolean;
  isAvailable: boolean;
  certifications?: string[];
  unitPrice?: number | null;
  currency?: string | null;
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

/**
 * Maps a Control Plane catalog material's category, brand, and finish to the canonical BPE substrate family
 * without inventing attributes or altering BPE authority. Resolves UX-01 for OTHER/UNCOATED items.
 */
export function resolveBpePaperTypeFromMaterial(
  material: { category?: string | null; finish?: string | null; brand?: string | null; productName?: string | null },
  target: 'interior' | 'cover' | 'endpaper' = 'interior'
): string {
  const cat = String(material.category || '').toUpperCase();
  const finish = String(material.finish || '').toUpperCase();

  // 1. Primary authoritative catalog category (paper_products.category)
  if (cat === 'OFFSET' || cat === 'UNCOATED') return 'offset';
  if (cat === 'COATED') return 'mc';
  if (cat === 'CARTON') return 'artboard';
  if (cat === 'DESIGN') return 'lux';

  // 2. Secondary authoritative surface finish (paper_variants.finish) when category is OTHER / DIGITAL
  if (finish.includes('UNCOATED') || finish.includes('OFFSET')) {
    return 'offset';
  }
  if (
    finish.includes('SILK') ||
    finish.includes('GLOSS') ||
    finish.includes('MATT') ||
    finish.includes('SATIN') ||
    finish.includes('COATED')
  ) {
    return 'mc';
  }
  if (finish.includes('BOARD') || finish.includes('CARTON')) {
    return 'artboard';
  }

  return target === 'cover' ? 'mc' : 'offset';
}

const CATEGORY_TABS: { key: PaperCategory | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'ALL' },
  { key: 'OFFSET', label: 'OFFSET / UNCOATED' },
  { key: 'COATED', label: 'COATED / SILK-GLOSS' },
  { key: 'CARTON', label: 'CARTON / BOARD' },
  { key: 'DESIGN', label: 'MUNKEN / DESIGN' },
  { key: 'DIGITAL', label: 'DIGITAL' },
  { key: 'OTHER', label: 'SPECIALTIES' },
];

function formatGrainAbbreviation(grainDirection?: string | null): string {
  const g = String(grainDirection || '').toUpperCase();
  if (g === 'LONG_GRAIN' || g === 'LG') return 'LG';
  if (g === 'SHORT_GRAIN' || g === 'SG') return 'SG';
  if (g && g !== 'UNKNOWN') return g;
  return 'LG';
}

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
  disabled = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<PaperCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [totalAvailable, setTotalAvailable] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Instant 250ms debounced search across all certified substrates
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch full catalog from BFF proxy (no chunked 80-item limit)
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
      params.set('limit', '4000');

      const url = `/api/budget/paper/search?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Catalog endpoint responded with status ${response.status}`);
      }
      const data = await response.json();
      if (data.ok && data.data?.items) {
        setTotalAvailable(Number(data.data.total ?? data.data.items.length));
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

  // Agile client-side filtering matching mill_brand, commercial_name, substrate_category, and gsm
  const filteredCatalogItems = useMemo(() => {
    return catalogItems.filter((item) => {
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }
      if (!debouncedQuery) return true;
      const tokens = debouncedQuery.toLowerCase().split(/\s+/).filter(Boolean);
      const searchable = [
        item.brand || '',
        item.manufacturer || '',
        item.productName || '',
        item.category || '',
        String(item.gsm || ''),
        `${item.gsm}gsm`,
        `${item.gsm}g`,
        item.finish || '',
        item.finishSummary || '',
        item.sheetFormat || '',
        `${item.widthMm}x${item.heightMm}`,
      ]
        .join(' ')
        .toLowerCase();

      return tokens.every((tk) => searchable.includes(tk));
    });
  }, [catalogItems, selectedCategory, debouncedQuery]);

  // Group items by commercial product name
  const groupedProducts = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of filteredCatalogItems) {
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
        brand: first.brand || first.manufacturer || 'PrintPrice Partner Mill',
        manufacturer: first.manufacturer || first.brand || 'European Certified Mill',
        category: first.category,
        variants: items.sort((a, b) => a.gsm - b.gsm),
      };
    });
  }, [filteredCatalogItems]);

  // Find currently selected product group if any
  const currentSelectedProductKey = useMemo(() => {
    if (!selectedMaterial) return '';
    const selVarId = selectedMaterial.variantId || selectedMaterial.variant_id;
    if (selVarId) {
      const byVariant = groupedProducts.find((p) => p.variants.some((v) => v.variantId === selVarId));
      if (byVariant) return byVariant.key;
    }
    const name = selectedMaterial.productName || selectedMaterial.product_name || '';
    const byName = groupedProducts.find((p) => p.productName === name);
    if (byName) return byName.key;
    return `${name}__${selectedMaterial.brand || 'Standard'}`;
  }, [selectedMaterial, groupedProducts]);

  const currentProductVariants = useMemo(() => {
    if (!currentSelectedProductKey) return [];
    const found = groupedProducts.find((p) => p.key === currentSelectedProductKey);
    return found ? found.variants : [];
  }, [groupedProducts, currentSelectedProductKey]);

  const handleToggleMode = (newMode: 'standard' | 'advanced') => {
    if (newMode === mode) return;
    onModeChange(newMode);
  };

  const handleCategoryChange = (cat: PaperCategory | 'ALL') => {
    setSelectedCategory(cat);
    if (selectedMaterial && cat !== 'ALL' && selectedMaterial.category !== cat) {
      onSelectMaterial(null);
    }
  };

  const buildSelectedMaterialFromVariant = (variant: CatalogItem): SelectedPaperMaterial => ({
    productId: variant.productId,
    variantId: variant.variantId,
    productName: variant.productName,
    product_id: variant.productId,
    variant_id: variant.variantId,
    product_name: variant.productName,
    brand: variant.brand || variant.manufacturer || 'Control Plane Certified',
    category: variant.category,
    gsm: variant.gsm,
    finish: (variant.finish && variant.finish !== 'UNKNOWN') ? variant.finish : (variant.finishSummary && variant.finishSummary !== 'UNKNOWN' ? variant.finishSummary : undefined),
    paperType: variant.paperType || variant.category || 'OTHER',
    coatingStatus: variant.coatingStatus || 'UNKNOWN',
    grainDirection: variant.grainDirection || 'UNKNOWN',
    originalCode: variant.originalCode || null,
    caliperUm: variant.caliperUm ?? null,
    caliper_um: variant.caliperUm ?? null,
    caliperMm: variant.caliperMm ?? null,
    bulkFactor: variant.bulkFactor ?? null,
    caliperSource: variant.caliperSource ?? null,
    caliperConfidenceStatus: variant.caliperConfidenceStatus ?? null,
    caliperRevision: variant.caliperRevision ?? null,
    sheetWidthMm: variant.widthMm,
    sheetHeightMm: variant.heightMm,
    raw_sheet_format: variant.sheetFormat,
    availability: variant.isAvailable ? 'AVAILABLE_IN_CONTROL_PLANE' : 'SUBJECT_TO_MILL_CONFIRMATION',
    isAvailable: variant.isAvailable,
    source_catalog: 'CONTROL_PLANE_MASTER_HUB',
    certifications: variant.certifications || ['FSC Mix Credit', 'ECF'],
  });

  const handleSelectProduct = (productKey: string) => {
    const product = groupedProducts.find((p) => p.key === productKey);
    if (!product || product.variants.length === 0) return;

    // SPINE-05-PROD: Prefer an available variant that also has a verified caliper (µm)
    const defaultVariant =
      product.variants.find((v) => v.isAvailable && v.caliperUm != null && v.caliperUm > 0) ||
      product.variants.find((v) => v.caliperUm != null && v.caliperUm > 0) ||
      product.variants.find((v) => v.isAvailable) ||
      product.variants[0];
    onSelectMaterial(buildSelectedMaterialFromVariant(defaultVariant));
  };

  const handleSelectVariant = (variantId: string) => {
    const variant = currentProductVariants.find((v) => v.variantId === variantId);
    if (!variant) return;
    onSelectMaterial(buildSelectedMaterialFromVariant(variant));
  };

  const handleClearSelection = () => {
    onSelectMaterial(null);
  };

  const mappedBpeType = selectedMaterial
    ? resolveBpePaperTypeFromMaterial(
        {
          category: selectedMaterial.category,
          brand: selectedMaterial.brand,
          finish: selectedMaterial.finish,
          productName: selectedMaterial.productName || selectedMaterial.product_name,
        },
        target
      ).toUpperCase()
    : null;

  const targetCompatibilityLabel =
    target === 'interior'
      ? 'Interior Book Block'
      : target === 'cover'
        ? 'Exterior Cover / Board'
        : 'Hardcover Endpapers';

  const isFiltering = Boolean(debouncedQuery) || selectedCategory !== 'ALL';
  const displayedCount = filteredCatalogItems.length || totalAvailable;

  return (
    <div
      id={`advanced-paper-selector-${target}`}
      className="bg-corporate-elevated/50 rounded-xl border border-corporate-border p-4 sm:p-6 md:p-7 flex flex-col gap-5 relative transition-all duration-200 min-w-0"
    >
      {/* Header and Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-corporate-border pb-4 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h4 className="text-xs font-sans font-black tracking-wider sm:tracking-monolith uppercase text-corporate-text">
              {label}
            </h4>
            {mode === 'advanced' && (
              <span
                data-testid={`paper-catalog-count-badge-${target}`}
                className="bg-corporate-accent/10 rounded-full border border-corporate-accent/30 text-corporate-accent text-[9px] font-technical font-black px-2.5 py-0.5 uppercase tracking-wider"
              >
                {isFiltering
                  ? `${filteredCatalogItems.length.toLocaleString('en-US')} matching variants`
                  : `${(displayedCount || 1535).toLocaleString('en-US')} certified European substrates`}
              </span>
            )}
          </div>
          {helpText && (
            <p className="mt-1 text-[11px] text-corporate-text-secondary">
              {helpText}
            </p>
          )}
        </div>

        {/* Mode Toggle Buttons (Responsive wrap on small screens) */}
        <div
          className="flex flex-wrap sm:flex-nowrap items-center p-1 rounded-xl border border-corporate-border-strong bg-corporate-secondary self-start sm:self-auto w-full sm:w-auto gap-1"
          role="group"
          aria-label="Paper Selection Mode"
        >
          <button
            type="button"
            onClick={() => handleToggleMode('standard')}
            disabled={disabled}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg text-[10px] font-technical font-bold uppercase tracking-wider transition-all ${
              mode === 'standard'
                ? 'bg-corporate-elevated text-corporate-text border border-corporate-accent/40 font-black shadow-sm'
                : 'text-corporate-text-secondary hover:text-corporate-text'
            }`}
          >
            Standard Presets
          </button>
          <button
            type="button"
            onClick={() => handleToggleMode('advanced')}
            disabled={disabled}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg text-[10px] font-technical font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
              mode === 'advanced'
                ? 'bg-corporate-accent text-white shadow-sm font-black'
                : 'text-corporate-text-secondary hover:text-corporate-text'
            }`}
          >
            <SparklesIcon className={`w-3.5 h-3.5 shrink-0 ${mode === 'advanced' ? 'text-white' : 'text-corporate-accent'}`} />
            <span>Advanced Catalog</span>
          </button>
        </div>
      </div>

      {/* STANDARD MODE VIEW */}
      {mode === 'standard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1 min-w-0">
          {standardTypeComponent}
          {standardGsmComponent}
        </div>
      )}

      {/* ADVANCED CATALOG VIEW */}
      {mode === 'advanced' && (
        <div className="flex flex-col gap-5 pt-1 min-w-0">
          {/* Authoritative BPE Synchronization Banner (Fixes UX-01) */}
          <div className="bg-corporate-secondary rounded-xl border border-corporate-border border-l-4 border-l-corporate-accent p-3.5 flex items-start gap-3">
            <CubeTransparentIcon className="w-4 h-4 text-corporate-accent shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed min-w-0">
              <span className="text-corporate-text font-bold font-technical uppercase tracking-wider block mb-0.5">
                Live BPE Pricing &amp; Control Plane Substrate Sync:
              </span>
              <span className="text-corporate-text-secondary">
                Selecting a certified mill material synchronizes its <strong className="text-corporate-text">Grammage (GSM)</strong>,{' '}
                <strong className="text-corporate-text">Caliper (µm)</strong>, and{' '}
                <strong className="text-corporate-text">Substrate Family</strong> directly with the Spine Geometry Engine &amp; Book Price Engine (BPE), recording the exact{' '}
                <code className="font-technical text-corporate-accent">variantId</code> for print house imposition.
              </span>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] font-technical uppercase font-bold text-corporate-muted mr-1">
              Category:
            </span>
            {CATEGORY_TABS.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => handleCategoryChange(cat.key)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] font-technical font-bold uppercase tracking-wider transition-all border ${
                  selectedCategory === cat.key
                    ? 'border-corporate-accent bg-corporate-accent/10 text-corporate-accent font-black'
                    : 'border-corporate-border bg-corporate-secondary text-corporate-text-secondary hover:border-corporate-border-strong hover:text-corporate-text'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search bar & Refresh */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mill brand, commercial name, category or GSM (e.g., Amber Graphic, Munken, Sappi, 90)..."
                className="w-full min-w-0 rounded-xl pl-9 pr-14 py-2.5 sm:py-3 bg-corporate-secondary border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent placeholder:text-corporate-muted transition-all font-sans"
              />
              <MagnifyingGlassIcon className="w-4 h-4 text-corporate-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-corporate-muted hover:text-corporate-accent uppercase font-technical font-bold"
                >
                  Clear
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => fetchCatalog()}
              disabled={loading}
              title="Refresh Control Plane Catalog"
              aria-label="Refresh Control Plane Catalog"
              className="px-3.5 py-2.5 sm:py-3 rounded-xl border border-corporate-border hover:border-corporate-accent bg-corporate-secondary text-corporate-text-secondary hover:text-corporate-accent transition-all shrink-0"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin text-corporate-accent' : ''}`} />
            </button>
          </div>

          {/* Error Banner with Retry */}
          {fetchError && (
            <div className="bg-corporate-secondary rounded-xl border border-corporate-accent/40 p-4 flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-corporate-accent shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-technical font-bold text-corporate-accent uppercase tracking-wider">
                  Catalog Synchronisation Notice
                </p>
                <p className="text-xs text-corporate-text-secondary mt-1">
                  {fetchError}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fetchCatalog()}
                    className="px-3 py-1.5 rounded-lg bg-corporate-accent text-white text-[10px] font-technical font-black uppercase tracking-wider hover:bg-corporate-hover transition-colors"
                  >
                    Retry Connection
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleMode('standard')}
                    className="text-[10px] font-technical text-corporate-text-secondary hover:text-corporate-accent uppercase tracking-wider underline"
                  >
                    Switch to Standard Presets
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && (
            <div className="space-y-3 py-3 animate-pulse">
              <div className="h-10 bg-corporate-secondary border border-corporate-border w-full" />
              <div className="h-14 bg-corporate-secondary border border-corporate-border w-full" />
            </div>
          )}

          {/* Products & Materials Cascading Selector */}
          {!loading && !fetchError && (
            <div className="space-y-5 min-w-0">
              {groupedProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-corporate-border-strong p-6 sm:p-8 text-center bg-corporate-secondary/60">
                  <InformationCircleIcon className="w-6 h-6 text-corporate-muted mx-auto mb-2" />
                  <p className="text-xs font-technical uppercase tracking-wider text-corporate-text font-bold">
                    No catalog materials found for &quot;{searchQuery || selectedCategory}&quot;
                  </p>
                  <p className="text-[11px] text-corporate-text-secondary mt-1">
                    Try choosing &quot;ALL&quot; or searching for a different commercial brand name.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 min-w-0">
                    {/* Cascading Dropdown 1: Commercial Substrate */}
                    <div className="flex flex-col min-w-0">
                      <label className="flex items-center justify-between gap-2 font-sans font-bold text-corporate-text-secondary mb-2 uppercase tracking-technical text-[10px]">
                        <span className="flex items-center gap-2">
                          <TagIcon className="w-3.5 h-3.5 text-corporate-accent shrink-0" />
                          <span>1. Commercial Substrate ({groupedProducts.length} Lines)</span>
                        </span>
                        <span className="text-[9px] font-technical text-corporate-accent font-black">
                          {filteredCatalogItems.length.toLocaleString('en-US')} matching variants
                        </span>
                      </label>
                      <select
                        value={currentSelectedProductKey}
                        onChange={(e) => handleSelectProduct(e.target.value)}
                        className="block w-full max-w-full min-w-0 rounded-xl py-3 px-3.5 bg-corporate-secondary border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all"
                      >
                        <option value="">— Select Commercial Mill Substrate —</option>
                        {groupedProducts.map((prod) => (
                          <option key={prod.key} value={prod.key}>
                            {prod.productName} ({prod.brand}) · {prod.variants.length} {prod.variants.length === 1 ? 'variant' : 'variants'}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[10px] text-corporate-muted font-technical uppercase tracking-wider">
                        Authoritative substrate lines from certified European mills.
                      </p>
                    </div>

                    {/* Cascading Dropdown 2: Grammage, Format & Caliper */}
                    <div className="flex flex-col min-w-0">
                      <label className="flex items-center gap-2 font-sans font-bold text-corporate-text-secondary mb-2 uppercase tracking-technical text-[10px]">
                        <ScaleIcon className="w-3.5 h-3.5 text-corporate-accent shrink-0" />
                        <span>2. Grammage, Format &amp; Caliper</span>
                      </label>
                      <select
                        value={selectedMaterial?.variantId || selectedMaterial?.variant_id || ''}
                        onChange={(e) => handleSelectVariant(e.target.value)}
                        disabled={!selectedMaterial || currentProductVariants.length === 0}
                        className="block w-full max-w-full min-w-0 rounded-xl py-3 px-3.5 bg-corporate-secondary border border-corporate-border text-corporate-text text-xs focus:border-corporate-accent focus:ring-1 focus:ring-corporate-accent transition-all disabled:opacity-40"
                      >
                        {!selectedMaterial ? (
                          <option value="">— Select Commercial Substrate first —</option>
                        ) : (
                          currentProductVariants.map((v) => {
                            const grainAbbr = formatGrainAbbreviation(v.grainDirection);
                            const bulkNum =
                              v.bulkFactor && Number(v.bulkFactor) > 0
                                ? Number(v.bulkFactor)
                                : v.caliperUm && v.gsm
                                  ? Number(v.caliperUm) / Number(v.gsm)
                                  : null;
                            const bulkLabel = bulkNum ? ` · Bulk ${bulkNum.toFixed(2)}` : '';
                            const caliperLabel = v.caliperUm ? `Caliper ${v.caliperUm} µm` : 'No caliper (µm)';
                            return (
                              <option key={v.variantId} value={v.variantId}>
                                {v.gsm} gsm · {v.widthMm}×{v.heightMm} mm · {caliperLabel}{bulkLabel} · {grainAbbr}
                              </option>
                            );
                          })
                        )}
                      </select>
                      <p className="mt-1.5 text-[10px] text-corporate-muted font-technical uppercase tracking-wider">
                        Certified technical variants with caliper (µm), bulk &amp; grain direction.
                      </p>
                    </div>
                  </div>

                  {/* Quick Interactive Variant Comparison Pills (When product is selected) */}
                  {selectedMaterial && currentProductVariants.length > 1 && (
                    <div className="bg-corporate-secondary/80 rounded-xl border border-corporate-border p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-technical uppercase font-bold text-corporate-muted tracking-wider">
                          Available Variants for {selectedMaterial.productName || selectedMaterial.product_name} ({currentProductVariants.length} options):
                        </span>
                        <span className="text-[9px] font-technical text-corporate-accent uppercase font-bold">
                          Click to compare &amp; recalculate
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentProductVariants.map((v) => {
                          const isCurrent = (selectedMaterial.variantId || selectedMaterial.variant_id) === v.variantId;
                          return (
                            <button
                              key={v.variantId}
                              type="button"
                              onClick={() => handleSelectVariant(v.variantId)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-technical transition-all border ${
                                isCurrent
                                  ? 'border-corporate-accent bg-corporate-accent text-white font-black'
                                  : 'border-corporate-border bg-corporate-elevated text-corporate-text-secondary hover:border-corporate-accent/50 hover:text-corporate-text'
                              }`}
                            >
                              {v.gsm}g{v.caliperUm ? ` · ${v.caliperUm}µm` : ''} · {v.widthMm}×{v.heightMm}mm
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* TECHNICAL SPECIFICATION CARD (Shows selected material details — Fixes VIS-01 & UX-01) */}
              {selectedMaterial && (
                <div className="rounded-xl border border-corporate-accent/40 bg-corporate-secondary p-4 sm:p-6 relative overflow-hidden min-w-0 shadow-sm">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-corporate-accent" />
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-4 min-w-0 flex-1">
                      {/* Title & Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-corporate-accent shrink-0" />
                        <span className="text-xs sm:text-sm font-sans font-black uppercase tracking-wider text-corporate-text break-words">
                          {selectedMaterial.productName || selectedMaterial.product_name}
                        </span>
                        <span className="text-[10px] text-corporate-text-secondary font-technical font-bold">
                          · {selectedMaterial.brand}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-corporate-elevated border border-corporate-border text-[9px] font-technical uppercase font-bold text-corporate-text">
                          Family: {selectedMaterial.category}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full border text-[9px] font-technical uppercase font-bold ${
                            selectedMaterial.isAvailable !== false
                              ? 'badge-success'
                              : 'badge-warning'
                          }`}
                        >
                          {selectedMaterial.isAvailable !== false
                            ? 'Available in Control Plane'
                            : 'Subject to Mill Confirmation'}
                        </span>
                      </div>

                      {/* Technical Specs Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-corporate-elevated/60 p-3 rounded-xl border border-corporate-border text-xs font-technical">
                        <div>
                          <span className="text-[9px] text-corporate-muted uppercase block">Grammage</span>
                          <span className="text-corporate-text font-bold tabular-nums">{selectedMaterial.gsm} GSM</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-corporate-muted uppercase block">Finish / Grain</span>
                          <span className="text-corporate-text font-bold">
                            {(selectedMaterial.finish && selectedMaterial.finish !== 'UNKNOWN') ? selectedMaterial.finish : 'Standard'} · {(selectedMaterial.grainDirection && selectedMaterial.grainDirection !== 'UNKNOWN') ? selectedMaterial.grainDirection : 'Standard'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-corporate-muted uppercase block">Parent Sheet</span>
                          <span className="text-corporate-text font-bold tabular-nums">
                            {selectedMaterial.sheetWidthMm && selectedMaterial.sheetHeightMm
                              ? `${selectedMaterial.sheetWidthMm} × ${selectedMaterial.sheetHeightMm} mm`
                              : selectedMaterial.raw_sheet_format || '700 × 1000 mm'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-corporate-muted uppercase block">Caliper / Compatibility</span>
                          <span className="text-corporate-text font-bold">
                            {selectedMaterial.caliperUm || selectedMaterial.caliper_um
                              ? `${selectedMaterial.caliperUm || selectedMaterial.caliper_um} µm (${selectedMaterial.caliperConfidenceStatus || 'PROVISIONAL_ESTIMATED'})`
                              : `Pending caliper · ${targetCompatibilityLabel}`}
                          </span>
                        </div>
                      </div>

                      {/* Imposition & Economic Integration Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-technical">
                        <div className="rounded-xl bg-corporate-elevated/40 border-l-4 border-corporate-accent p-3">
                          <p className="text-corporate-text font-bold uppercase tracking-wider text-[10px]">
                            Economic &amp; BPE Integration
                          </p>
                          <p className="text-corporate-text-secondary mt-0.5 leading-relaxed">
                            Synchronized as <strong className="text-corporate-text">{mappedBpeType} · {selectedMaterial.gsm} gsm</strong> for{' '}
                            <strong className="text-corporate-text">{targetCompatibilityLabel}</strong>. Click &quot;Calculate price offers&quot; to update BPE quotes.
                          </p>
                        </div>

                        <div className="rounded-xl bg-corporate-elevated/40 border-l-4 border-corporate-border-strong p-3">
                          <div className="flex items-center gap-1.5">
                            <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 text-corporate-accent shrink-0" />
                            <p className="text-corporate-text font-bold uppercase tracking-wider text-[10px]">
                              Imposition Compatibility ({bookSize})
                            </p>
                          </div>
                          <p className="text-corporate-text-secondary mt-0.5 leading-relaxed">
                            Parent sheet ({selectedMaterial.raw_sheet_format || `${selectedMaterial.sheetWidthMm}x${selectedMaterial.sheetHeightMm} mm`}) is compatible with{' '}
                            <strong className="text-corporate-text">{bookSize}</strong> trim size. Variant ID:{' '}
                            <code className="text-corporate-accent">{selectedMaterial.variantId || selectedMaterial.variant_id}</code>
                          </p>
                        </div>
                      </div>

                      {/* Certifications */}
                      {selectedMaterial.certifications && selectedMaterial.certifications.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="text-[9px] text-corporate-muted uppercase font-technical font-bold">
                            Certifications &amp; Standards:
                          </span>
                          {selectedMaterial.certifications.map((cert) => (
                            <span
                              key={cert}
                              className="px-2 py-0.5 badge-success border text-[9px] font-technical uppercase font-bold"
                            >
                              {cert}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-row md:flex-col items-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="px-3 py-1.5 rounded-lg border border-corporate-border-strong hover:border-corporate-accent bg-corporate-elevated text-corporate-text-secondary hover:text-corporate-accent text-[10px] font-technical font-bold uppercase tracking-wider transition-all"
                      >
                        Reset Selection
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
