import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookPricePayload,
  SpineBindingCategory,
  SpineCalculationResult,
  SpineShape,
} from '../types';
import {
  calculateBookSpineGeometry,
  resolveSpineRequestReadiness,
  SpineRequestReadiness,
} from '../lib/spineApi';
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

export interface BookSpineGeometryPanelProps {
  formData: BookPricePayload;
  onSwitchInteriorToAdvancedCatalog?: () => void;
  onSpineResultChange?: (
    result: SpineCalculationResult | null,
    status: SpinePanelStatus,
    readiness: SpineRequestReadiness
  ) => void;
}

export type SpinePanelStatus =
  | 'CALCULATING'
  | 'VALIDATED'
  | 'WARNING'
  | 'REQUIRES_TECH_APPROVAL'
  | 'CALIPER_VERIFICATION_REQUIRED'
  | 'UNSUPPORTED_BINDING'
  | 'SPINE_NOT_AVAILABLE'
  | 'ERROR';

const formatMm = (value: number | null | undefined, decimals = 1): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)} mm`;
};

const formatTierBadgeLabel = (tier?: string | null): string => {
  switch (tier) {
    case 'PRODUCTION_CERTIFIED':
      return 'Production Certified';
    case 'PRINTHOUSE_TECHNICALLY_VALIDATED':
      return 'Printhouse Validated';
    case 'MATH_BRANCH_VALIDATED':
      return 'Math Branch Validated · Quotes Only';
    case 'EXCEL_EXAMPLE_PARITY':
      return 'Excel Parity · Pending Plant Sign-Off';
    default:
      return tier || 'Unverified Tier';
  }
};

export const BookSpineGeometryPanel: React.FC<BookSpineGeometryPanelProps> = ({
  formData,
  onSwitchInteriorToAdvancedCatalog,
  onSpineResultChange,
}) => {
  const [spineShapeOverride, setSpineShapeOverride] = useState<SpineShape>('SQUARE');
  const [boardThicknessMm, setBoardThicknessMm] = useState<number>(2.4);
  const [flapWidthMm, setFlapWidthMm] = useState<number>(0);
  const [mobileExpanded, setMobileExpanded] = useState<boolean>(false);

  const [panelStatus, setPanelStatus] = useState<SpinePanelStatus>('CALCULATING');
  const [spineResult, setSpineResult] = useState<SpineCalculationResult | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastCalculatedFingerprint, setLastCalculatedFingerprint] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const readiness = useMemo(() => resolveSpineRequestReadiness(formData), [formData]);

  const effectiveFingerprint = useMemo(() => {
    return `${readiness.fingerprint}|shape:${spineShapeOverride}|board:${boardThicknessMm}|flap:${flapWidthMm}`;
  }, [readiness.fingerprint, spineShapeOverride, boardThicknessMm, flapWidthMm]);

  const isStale = Boolean(
    lastCalculatedFingerprint && lastCalculatedFingerprint !== effectiveFingerprint
  );

  const onSpineResultChangeRef = useRef(onSpineResultChange);
  onSpineResultChangeRef.current = onSpineResultChange;

  useEffect(() => {
    // Immediate invalidation when inputs change
    if (readiness.status === 'UNSUPPORTED_BINDING_FOR_SPINE_ENGINE') {
      setSpineResult(null);
      setErrorCode(readiness.reasonCode);
      setErrorMessage(readiness.message);
      setPanelStatus('UNSUPPORTED_BINDING');
      setLastCalculatedFingerprint(effectiveFingerprint);
      onSpineResultChangeRef.current?.(null, 'UNSUPPORTED_BINDING', readiness);
      return;
    }

    if (
      readiness.status === 'CALIPER_VERIFICATION_REQUIRED' ||
      readiness.status === 'INVALID_BOOK_DIMENSIONS' ||
      !readiness.requestPayload
    ) {
      setSpineResult(null);
      setErrorCode(readiness.reasonCode);
      setErrorMessage(readiness.message);
      setPanelStatus('CALIPER_VERIFICATION_REQUIRED');
      setLastCalculatedFingerprint(effectiveFingerprint);
      onSpineResultChangeRef.current?.(null, 'CALIPER_VERIFICATION_REQUIRED', readiness);
      return;
    }

    // Input is READY -> invalidate previous result immediately while calculating new geometry
    setSpineResult(null);
    setPanelStatus('CALCULATING');
    setErrorCode(null);
    setErrorMessage(null);
    onSpineResultChangeRef.current?.(null, 'CALCULATING', readiness);

    const abortController = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const baseReq = readiness.requestPayload!;
        const isHardcover = baseReq.bindingCategory === 'HARDCOVER';
        const isSoftcover =
          baseReq.bindingCategory === 'SOFTCOVER_STANDARD' ||
          baseReq.bindingCategory === 'SOFTCOVER_WITH_FLAPS';

        const effectiveBindingCategory: SpineBindingCategory =
          isSoftcover && flapWidthMm > 0
            ? 'SOFTCOVER_WITH_FLAPS'
            : baseReq.bindingCategory;

        const payloadToSend = {
          ...baseReq,
          bindingCategory: effectiveBindingCategory,
          cover: baseReq.cover
            ? {
                ...baseReq.cover,
                flapWidthMm:
                  effectiveBindingCategory === 'SOFTCOVER_WITH_FLAPS' ? flapWidthMm : undefined,
              }
            : effectiveBindingCategory === 'SOFTCOVER_WITH_FLAPS'
              ? { flapWidthMm }
              : null,
          hardcover: isHardcover
            ? {
                ...baseReq.hardcover,
                spineShape: spineShapeOverride,
                boardThicknessMm,
              }
            : null,
        };

        const response = await calculateBookSpineGeometry(payloadToSend, {
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) return;

        if (!response.ok || !response.data) {
          setSpineResult(response.data || null);
          setErrorCode(response.errorCode || 'SPINE_CALCULATION_REJECTED');
          setErrorMessage(
            response.errorMessage || 'Spine calculation could not be completed by Control Plane.'
          );

          const nextStatus: SpinePanelStatus =
            response.errorCode === 'SPINE_NOT_AVAILABLE'
              ? 'SPINE_NOT_AVAILABLE'
              : response.errorCode === 'MISSING_SEGMENT_CALIPER' ||
                  response.errorCode === 'CALIPER_VERIFICATION_REQUIRED'
                ? 'CALIPER_VERIFICATION_REQUIRED'
                : 'ERROR';

          setPanelStatus(nextStatus);
          setLastCalculatedFingerprint(effectiveFingerprint);
          onSpineResultChangeRef.current?.(response.data || null, nextStatus, readiness);
          return;
        }

        const result = response.data;
        setSpineResult(result);
        setLastCalculatedFingerprint(effectiveFingerprint);

        const warningIssues = (result.manufacturingValidation?.issues || []).filter(
          (i) => i.severity === 'WARNING'
        );

        let nextStatus: SpinePanelStatus = 'VALIDATED';
        if (
          result.operationalStatus === 'REQUIRES_TECH_APPROVAL' ||
          result.manufacturingValidation?.status === 'REQUIRES_TECH_REVIEW'
        ) {
          nextStatus = 'REQUIRES_TECH_APPROVAL';
        } else if (
          result.manufacturingValidation?.status === 'PROVISIONAL_ESTIMATE' ||
          warningIssues.length > 0
        ) {
          nextStatus = 'WARNING';
        }

        setPanelStatus(nextStatus);
        onSpineResultChangeRef.current?.(result, nextStatus, readiness);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setSpineResult(null);
        setErrorCode('SPINE_NOT_AVAILABLE');
        setErrorMessage(
          'Control Plane Spine Engine (/api/v1/spine) is temporarily unreachable. Zero synthetic dimensions generated.'
        );
        setPanelStatus('SPINE_NOT_AVAILABLE');
        setLastCalculatedFingerprint(effectiveFingerprint);
        onSpineResultChangeRef.current?.(null, 'SPINE_NOT_AVAILABLE', readiness);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [effectiveFingerprint, spineShapeOverride, boardThicknessMm, flapWidthMm, refreshTrigger]);

  // Blueprint SVG layout proportions
  const blueprintSvg = useMemo(() => {
    if (!spineResult?.coverGeometry || spineResult.spineWidthMm === null) return null;
    const { trimWidthMm, trimHeightMm } = readiness.trimDimensionsMm;
    const spineWidth = Math.max(spineResult.spineWidthMm || 0, 2);
    const panels = spineResult.coverGeometry.panels;
    const flapW = panels?.leftFlapMm || 0;
    const bleed =
      panels?.turnInMm || spineResult.coverGeometry.bleedPerSideMm || 3;
    const hingeScore = panels?.leftHingeScoreMm || 0;

    // Normalize into SVG coordinate box (width 560, height 215)
    const totalLogicalW = flapW * 2 + trimWidthMm * 2 + spineWidth + bleed * 2;
    const totalLogicalH = trimHeightMm + bleed * 2;
    const scale = Math.min(460 / Math.max(totalLogicalW, 1), 150 / Math.max(totalLogicalH, 1));

    const drawW = totalLogicalW * scale;
    const drawH = totalLogicalH * scale;
    const startX = (560 - drawW) / 2;
    const startY = (210 - drawH) / 2;

    const bleedPx = bleed * scale;
    const flapPx = flapW * scale;
    const coverPx = trimWidthMm * scale;
    const spinePx = Math.max(spineWidth * scale, 10);
    const hingePx = hingeScore * scale;

    const innerX = startX + bleedPx;
    const innerY = startY + bleedPx;
    const innerW = drawW - bleedPx * 2;
    const innerH = drawH - bleedPx * 2;

    const backCoverX = innerX + flapPx;
    const spineX = backCoverX + coverPx;
    const frontCoverX = spineX + spinePx;
    const rightFlapX = frontCoverX + coverPx;

    return {
      startX,
      startY,
      drawW,
      drawH,
      innerX,
      innerY,
      innerW,
      innerH,
      flapPx,
      coverPx,
      spinePx,
      hingePx,
      backCoverX,
      spineX,
      frontCoverX,
      rightFlapX,
      flapW,
      bleed,
      hingeScore,
    };
  }, [spineResult, readiness.trimDimensionsMm]);

  const statusBadge = useMemo(() => {
    switch (panelStatus) {
      case 'CALCULATING':
        return {
          label: 'CALCULATING GEOMETRY',
          className:
            'bg-corporate-secondary border-corporate-border-strong text-corporate-text-secondary',
        };
      case 'VALIDATED':
        return {
          label: 'GEOMETRY VALIDATED · QUOTES ENABLED',
          className: 'badge-success border',
        };
      case 'WARNING':
        return {
          label: 'VALIDATED WITH TECHNICAL WARNING',
          className: 'bg-amber-500/15 border-amber-500/40 text-amber-500',
        };
      case 'REQUIRES_TECH_APPROVAL':
        return {
          label: 'REQUIRES PRINTHOUSE TECH APPROVAL',
          className: 'bg-amber-500/15 border-amber-500/40 text-amber-500',
        };
      case 'CALIPER_VERIFICATION_REQUIRED':
        return {
          label: 'CALIPER VERIFICATION REQUIRED',
          className:
            'bg-corporate-accent/10 border-corporate-accent/40 text-corporate-accent',
        };
      case 'SPINE_NOT_AVAILABLE':
        return {
          label: 'SPINE_NOT_AVAILABLE',
          className:
            'bg-corporate-secondary border-corporate-border-strong text-corporate-muted',
        };
      case 'UNSUPPORTED_BINDING':
        return {
          label: 'NO SPINE BLOCK REQUIRED',
          className:
            'bg-corporate-secondary border-corporate-border text-corporate-muted',
        };
      case 'ERROR':
      default:
        return {
          label: errorCode || 'GEOMETRY BLOCKED',
          className:
            'bg-corporate-accent/15 border-corporate-accent/50 text-corporate-accent',
        };
    }
  }, [panelStatus, errorCode]);

  const isHardcoverSelected = readiness.bindingMapping.bindingCategory === 'HARDCOVER';
  const isSoftcoverSelected =
    readiness.bindingMapping.bindingCategory === 'SOFTCOVER_STANDARD' ||
    readiness.bindingMapping.bindingCategory === 'SOFTCOVER_WITH_FLAPS';

  const warningIssues = useMemo(() => {
    return (spineResult?.manufacturingValidation?.issues || []).filter(
      (i) => i.severity === 'WARNING'
    );
  }, [spineResult]);

  const totalSheetsCount = useMemo(() => {
    if (!spineResult?.blockThickness?.segmentBreakdown) return 0;
    return spineResult.blockThickness.segmentBreakdown.reduce(
      (acc, seg) => acc + (seg.sheets || 0),
      0
    );
  }, [spineResult]);

  return (
    <section
      aria-label="Spine & Extended Cover Geometry Calculator"
      data-testid="book-spine-geometry-panel"
      data-spine-status={panelStatus}
      className="bg-corporate-primary rounded-2xl border border-corporate-border p-4 sm:p-6 shadow-monolith space-y-4 min-w-0 transition-all"
    >
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-corporate-border pb-3.5 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CubeTransparentIcon className="w-4 h-4 text-corporate-accent shrink-0" />
            <h3 className="text-xs sm:text-sm font-sans font-black uppercase tracking-wider text-corporate-text">
              Spine &amp; Extended Cover Geometry
            </h3>
            <span
              data-testid="spine-status-badge"
              className={`px-2.5 py-0.5 rounded-full text-[9px] font-technical font-black uppercase tracking-wider border ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
            {isStale && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-500 text-[9px] font-technical font-bold uppercase">
                Recalculating...
              </span>
            )}
          </div>
          <p className="text-[11px] text-corporate-text-secondary mt-1">
            Authoritative Control Plane geometry engine (<code className="font-technical text-corporate-accent">/api/v1/spine/calculate</code>) · Zero client-side bulk estimation.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {readiness.status === 'READY' && (
            <button
              type="button"
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
              title="Recalculate Spine Geometry"
              className="px-2.5 py-1.5 rounded-xl border border-corporate-border hover:border-corporate-accent bg-corporate-secondary text-corporate-text-secondary hover:text-corporate-accent text-[10px] font-technical font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
            >
              <ArrowPathIcon
                className={`w-3.5 h-3.5 ${panelStatus === 'CALCULATING' ? 'animate-spin text-corporate-accent' : ''}`}
              />
              <span>Sync</span>
            </button>
          )}

          {/* Mobile compact toggle so we never bloat mobile viewport height unnecessarily */}
          <button
            type="button"
            onClick={() => setMobileExpanded((prev) => !prev)}
            className="md:hidden px-3 py-1.5 rounded-xl border border-corporate-border-strong bg-corporate-secondary text-corporate-text text-[10px] font-technical font-bold uppercase tracking-wider flex items-center gap-1"
            aria-expanded={mobileExpanded}
          >
            <span>{mobileExpanded ? 'Compact View' : 'Blueprint & Details'}</span>
            {mobileExpanded ? (
              <ChevronUpIcon className="w-3.5 h-3.5 text-corporate-accent" />
            ) : (
              <ChevronDownIcon className="w-3.5 h-3.5 text-corporate-accent" />
            )}
          </button>
        </div>
      </div>

      {/* STATE 1: CALIPER VERIFICATION REQUIRED (Governance Gate) */}
      {panelStatus === 'CALIPER_VERIFICATION_REQUIRED' && (
        <div
          data-testid="spine-caliper-required-banner"
          className="rounded-xl border border-corporate-accent/40 bg-corporate-secondary p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3 min-w-0">
            <ExclamationTriangleIcon className="w-5 h-5 text-corporate-accent shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-technical font-black uppercase tracking-wider text-corporate-text">
                  Physical Paper Caliper (µm) Required for Spine Geometry
                </p>
                <span className="px-2 py-0.5 rounded-md bg-corporate-elevated border border-corporate-border text-[9px] font-technical font-bold text-corporate-muted uppercase">
                  Code: {errorCode || 'CALIPER_VERIFICATION_REQUIRED'}
                </span>
              </div>
              <p className="text-xs text-corporate-text-secondary leading-relaxed">
                {errorMessage}
              </p>
              <p className="text-[10px] font-technical text-corporate-muted">
                Current Interior Spec: <strong className="text-corporate-text">{readiness.caliperTelemetry.interiorPaperName}</strong> ·{' '}
                {readiness.trimDimensionsMm.trimWidthMm} × {readiness.trimDimensionsMm.trimHeightMm} mm · {formData.interior_pages} pages
              </p>
            </div>
          </div>

          {formData.paper_mode_interior !== 'advanced' && onSwitchInteriorToAdvancedCatalog && (
            <button
              type="button"
              data-testid="spine-switch-to-catalog-btn"
              onClick={onSwitchInteriorToAdvancedCatalog}
              className="px-4 py-2.5 rounded-xl bg-corporate-accent hover:bg-corporate-hover text-white text-[10px] font-technical font-black uppercase tracking-wider shrink-0 flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>Select Certified Catalog Paper</span>
            </button>
          )}
        </div>
      )}

      {/* STATE 2: SPINE_NOT_AVAILABLE (When Control Plane /api/v1/spine is not deployed in target env) */}
      {panelStatus === 'SPINE_NOT_AVAILABLE' && (
        <div
          data-testid="spine-not-available-banner"
          className="rounded-xl border border-corporate-border-strong bg-corporate-secondary p-4 flex items-start gap-3"
        >
          <InformationCircleIcon className="w-5 h-5 text-corporate-accent shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-technical font-black uppercase tracking-wider text-corporate-text">
                Control Plane Spine Service Inactive (SPINE_NOT_AVAILABLE)
              </p>
              <span className="px-2 py-0.5 rounded-md bg-corporate-elevated border border-corporate-border text-[9px] font-technical text-corporate-muted uppercase">
                Zero Synthetic Fallback
              </span>
            </div>
            <p className="text-xs text-corporate-text-secondary leading-relaxed">
              {errorMessage ||
                'Control Plane Spine Engine (/api/v1/spine) is not active in this environment yet. In compliance with PrintPrice OS governance, no synthetic client-side spine dimensions are generated.'}
            </p>
          </div>
        </div>
      )}

      {/* STATE 3: UNSUPPORTED BINDING (Saddle Stitch / Wire-O) */}
      {panelStatus === 'UNSUPPORTED_BINDING' && (
        <div
          data-testid="spine-unsupported-binding-banner"
          className="rounded-xl border border-corporate-border bg-corporate-secondary/70 p-3.5 flex items-start gap-3"
        >
          <InformationCircleIcon className="w-4 h-4 text-corporate-muted shrink-0 mt-0.5" />
          <p className="text-xs text-corporate-text-secondary leading-relaxed">
            {errorMessage}
          </p>
        </div>
      )}

      {/* STATE 4: ERROR / EXPERIMENTAL_PROFILE_DISABLED / OUT_OF_RANGE */}
      {panelStatus === 'ERROR' && (
        <div
          data-testid="spine-error-banner"
          className="rounded-xl border border-corporate-accent/50 bg-corporate-secondary p-4 flex items-start gap-3"
        >
          <ExclamationTriangleIcon className="w-5 h-5 text-corporate-accent shrink-0 mt-0.5" />
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-technical font-black uppercase tracking-wider text-corporate-accent">
                Spine Calculation Blocked by Control Plane Governance
              </p>
              <span className="px-2 py-0.5 rounded-md bg-corporate-elevated border border-corporate-border text-[9px] font-technical font-bold text-corporate-text uppercase">
                {errorCode}
              </span>
            </div>
            <p className="text-xs text-corporate-text-secondary leading-relaxed">
              {errorMessage}
            </p>
          </div>
        </div>
      )}

      {/* STATE 5: CALCULATING SKELETON */}
      {panelStatus === 'CALCULATING' && (
        <div
          data-testid="spine-calculating-skeleton"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-pulse"
        >
          <div className="h-16 rounded-xl bg-corporate-secondary border border-corporate-border" />
          <div className="h-16 rounded-xl bg-corporate-secondary border border-corporate-border" />
          <div className="h-16 rounded-xl bg-corporate-secondary border border-corporate-border" />
          <div className="h-16 rounded-xl bg-corporate-secondary border border-corporate-border" />
        </div>
      )}

      {/* STATE 6: VALIDATED / WARNING / REQUIRES_TECH_APPROVAL GEOMETRY DISPLAY */}
      {spineResult &&
        (panelStatus === 'VALIDATED' ||
          panelStatus === 'WARNING' ||
          panelStatus === 'REQUIRES_TECH_APPROVAL') && (
          <div className="space-y-4 min-w-0">
            {/* Primary 4 KPI Geometry Cards (Always visible on mobile & desktop) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Spine Width */}
              <div className="rounded-xl bg-corporate-secondary border border-corporate-accent/40 p-3.5 relative overflow-hidden">
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-corporate-accent" />
                <span className="text-[9px] font-technical uppercase font-bold text-corporate-muted block">
                  Calculated Spine Width
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span
                    data-testid="spine-width-mm"
                    className="text-lg sm:text-xl font-technical font-black text-corporate-text tabular-nums"
                  >
                    {formatMm(spineResult.spineWidthMm, 1)}
                  </span>
                  <span className="text-[10px] font-technical text-corporate-text-secondary">
                    (0.5mm step)
                  </span>
                </div>
                <span className="text-[9px] font-technical text-corporate-accent uppercase font-bold mt-1 block truncate">
                  {spineResult.machineryLine || spineResult.fullProfileKey}
                </span>
              </div>

              {/* 2. Paper Block Thickness */}
              <div className="rounded-xl bg-corporate-secondary border border-corporate-border p-3.5">
                <span className="text-[9px] font-technical uppercase font-bold text-corporate-muted block">
                  Net Paper Block
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span
                    data-testid="net-paper-block-mm"
                    className="text-lg sm:text-xl font-technical font-black text-corporate-text tabular-nums"
                  >
                    {formatMm(spineResult.blockThickness.netPaperBlockMm, 2)}
                  </span>
                </div>
                <span className="text-[10px] font-technical text-corporate-text-secondary mt-1 block">
                  {totalSheetsCount} sheets ({spineResult.blockThickness.totalPages} pp)
                </span>
              </div>

              {/* 3. Extended Flat Cover (Net Open Spread vs Full File with Bleed/Turn-in) */}
              <div className="rounded-xl bg-corporate-secondary border border-corporate-border p-3.5">
                <span className="text-[9px] font-technical uppercase font-bold text-corporate-muted block">
                  Extended Flat Cover
                </span>
                <div className="mt-1">
                  <span
                    data-testid="flat-cover-dimensions-mm"
                    className="text-base sm:text-lg font-technical font-black text-corporate-text tabular-nums"
                  >
                    {spineResult.coverGeometry.netCoverWidthMm.toFixed(1)} ×{' '}
                    {spineResult.coverGeometry.netCoverHeightMm.toFixed(1)} mm
                  </span>
                </div>
                <span className="text-[10px] font-technical text-corporate-text-secondary mt-1 block">
                  With bleed/turn-in: {spineResult.coverGeometry.flatCoverWidthMm.toFixed(1)} ×{' '}
                  {spineResult.coverGeometry.flatCoverHeightMm.toFixed(1)} mm
                </span>
              </div>

              {/* 4. Caliper & Provenance */}
              <div className="rounded-xl bg-corporate-secondary border border-corporate-border p-3.5">
                <span className="text-[9px] font-technical uppercase font-bold text-corporate-muted block">
                  Verified Caliper &amp; Tier
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span
                    data-testid="spine-caliper-um"
                    className="text-base sm:text-lg font-technical font-black text-corporate-text tabular-nums"
                  >
                    {readiness.caliperTelemetry.interiorCaliperUm} µm
                  </span>
                  <span className="text-[10px] font-technical text-corporate-accent font-bold uppercase">
                    · {readiness.caliperTelemetry.interiorGsm} gsm
                  </span>
                </div>
                <span
                  data-testid="spine-certification-tier"
                  className="text-[9px] font-technical text-corporate-text-secondary uppercase font-bold mt-1 block truncate"
                  title={formatTierBadgeLabel(spineResult.certificationTier)}
                >
                  {formatTierBadgeLabel(spineResult.certificationTier)}
                </span>
              </div>
            </div>

            {/* Governance Warning / Tech Approval Banner when not autonomously certified for manufacturing */}
            {(spineResult.operationalStatus === 'REQUIRES_TECH_APPROVAL' ||
              !spineResult.manufacturingValidation?.canReleaseToManufacturing) && (
              <div
                data-testid="spine-governance-notice"
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex items-start gap-3"
              >
                <ShieldCheckIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed min-w-0">
                  <span className="font-technical font-black uppercase tracking-wider text-corporate-text block">
                    Manufacturing Release Governance ({spineResult.certificationTier} ·{' '}
                    {spineResult.operationalStatus}):
                  </span>
                  <span className="text-corporate-text-secondary">
                    {spineResult.operationalStatus === 'REQUIRES_TECH_APPROVAL'
                      ? 'Hardcover Colibri case-making tolerances (board overhang, hinge rastri and turn-in) are active for quote estimation and preflight preview, but require explicit Print House Technical Sign-off before die/cover plate release.'
                      : 'This profile is validated for commercial quoting and preflight verification. Autonomous manufacturing release requires PRODUCTION_CERTIFIED status.'}
                  </span>
                </div>
              </div>
            )}

            {/* Warnings from Engine */}
            {warningIssues.length > 0 && (
              <div className="space-y-2">
                {warningIssues.map((w, idx) => (
                  <div
                    key={`${w.code}-${idx}`}
                    data-testid={`spine-warning-${w.code}`}
                    className="rounded-xl border border-amber-500/40 bg-corporate-secondary p-3 flex items-start gap-2.5 text-xs"
                  >
                    <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-technical font-bold text-amber-500 uppercase mr-2">
                        [{w.code}]
                      </span>
                      <span className="text-corporate-text-secondary">{w.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Collapsible Technical Blueprint & Secondary Controls (Always visible on md+, toggleable on mobile) */}
            <div className={`${mobileExpanded ? 'block' : 'hidden md:block'} space-y-4`}>
              {/* Optional Secondary Controls for Hardcover / Flaps */}
              {(isHardcoverSelected || isSoftcoverSelected) && (
                <div className="rounded-xl bg-corporate-secondary/70 border border-corporate-border p-3.5 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-[10px] font-technical uppercase font-bold text-corporate-text-secondary">
                    Binding Geometry Parameters ({readiness.bindingMapping.bindingLabel})
                  </div>

                  {isHardcoverSelected && (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-[10px] font-technical uppercase text-corporate-text-secondary">
                        <span>Spine Profile:</span>
                        <select
                          value={spineShapeOverride}
                          onChange={(e) => setSpineShapeOverride(e.target.value as SpineShape)}
                          className="rounded-lg bg-corporate-elevated border border-corporate-border px-2.5 py-1 text-[10px] font-technical font-bold text-corporate-text"
                        >
                          <option value="SQUARE">Square Spine (Flat Back)</option>
                          <option value="ROUND">Rounded Spine R(x)</option>
                        </select>
                      </label>

                      <label className="flex items-center gap-2 text-[10px] font-technical uppercase text-corporate-text-secondary">
                        <span>Greyboard:</span>
                        <select
                          value={boardThicknessMm}
                          onChange={(e) => setBoardThicknessMm(Number(e.target.value))}
                          className="rounded-lg bg-corporate-elevated border border-corporate-border px-2.5 py-1 text-[10px] font-technical font-bold text-corporate-text"
                        >
                          <option value={2.0}>2.0 mm</option>
                          <option value={2.4}>2.4 mm (Standard)</option>
                          <option value={3.0}>3.0 mm</option>
                        </select>
                      </label>
                    </div>
                  )}

                  {isSoftcoverSelected && (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-[10px] font-technical uppercase text-corporate-text-secondary">
                        <span>Cover Flaps (Atloki):</span>
                        <select
                          value={flapWidthMm}
                          onChange={(e) => setFlapWidthMm(Number(e.target.value))}
                          className="rounded-lg bg-corporate-elevated border border-corporate-border px-2.5 py-1 text-[10px] font-technical font-bold text-corporate-text"
                        >
                          <option value={0}>No Flaps (Standard 4pp Cover)</option>
                          <option value={75}>75 mm Flaps</option>
                          <option value={90}>90 mm Flaps</option>
                          <option value={100}>100 mm Flaps</option>
                          <option value={120}>120 mm Flaps</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Hardcover Specific Sub-Grid (Board size, Rastri, Turn-in, Round Radius) */}
              {spineResult.coverGeometry.panels.boardWidthMm !== null && (
                <div
                  data-testid="hardcover-colibri-details"
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-corporate-secondary/80 border border-corporate-border p-3.5 text-xs font-technical"
                >
                  <div>
                    <span className="text-[9px] text-corporate-muted uppercase block">
                      Board Size (Puse)
                    </span>
                    <span className="text-corporate-text font-bold tabular-nums">
                      {formatMm(spineResult.coverGeometry.panels.boardWidthMm, 1)} ×{' '}
                      {formatMm(spineResult.coverGeometry.panels.boardHeightMm, 1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-corporate-muted uppercase block">
                      Hinge Score (Rastri)
                    </span>
                    <span className="text-corporate-text font-bold tabular-nums">
                      {formatMm(spineResult.coverGeometry.panels.leftHingeScoreMm, 1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-corporate-muted uppercase block">
                      Turn-In (Noloki)
                    </span>
                    <span className="text-corporate-text font-bold tabular-nums">
                      {formatMm(spineResult.coverGeometry.panels.turnInMm, 1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-corporate-muted uppercase block">
                      {spineResult.bindingAdjustment.sewnRoundRadiusMm
                        ? 'Round Spine Radius R(x)'
                        : 'Swelling Block (Uzaugums)'}
                    </span>
                    <span className="text-corporate-text font-bold tabular-nums">
                      {spineResult.bindingAdjustment.sewnRoundRadiusMm
                        ? `${spineResult.bindingAdjustment.sewnRoundRadiusMm.toFixed(1)} mm`
                        : formatMm(spineResult.bindingAdjustment.sewnSwellingBlockMm, 2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Technical SVG Spread Blueprint */}
              {blueprintSvg && spineResult.spineWidthMm !== null && (
                <div className="rounded-xl bg-corporate-secondary border border-corporate-border p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-technical uppercase font-bold text-corporate-text-secondary">
                      Extended Cover Spread Blueprint (Back Cover + Spine + Front Cover)
                    </span>
                    <span className="text-[10px] font-technical text-corporate-muted tabular-nums">
                      Total File incl. Bleed/Turn-in:{' '}
                      <strong className="text-corporate-text">
                        {spineResult.coverGeometry.flatCoverWidthMm.toFixed(1)} ×{' '}
                        {spineResult.coverGeometry.flatCoverHeightMm.toFixed(1)} mm
                      </strong>
                    </span>
                  </div>

                  <div className="w-full overflow-hidden rounded-lg bg-corporate-primary border border-corporate-border p-2 flex items-center justify-center">
                    <svg
                      viewBox="0 0 560 215"
                      className="w-full max-w-[560px] h-auto select-none"
                      role="img"
                      aria-label="Extended Cover Technical Blueprint"
                    >
                      {/* Outer Bleed / Turn-in boundary */}
                      <rect
                        x={blueprintSvg.startX}
                        y={blueprintSvg.startY}
                        width={blueprintSvg.drawW}
                        height={blueprintSvg.drawH}
                        fill="rgba(220, 0, 0, 0.06)"
                        stroke="#dc0000"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                        rx="3"
                      />

                      {/* Inner Trim / Spread boundary */}
                      <rect
                        x={blueprintSvg.innerX}
                        y={blueprintSvg.innerY}
                        width={blueprintSvg.innerW}
                        height={blueprintSvg.innerH}
                        fill="rgba(148, 163, 184, 0.08)"
                        stroke="currentColor"
                        className="text-corporate-text-secondary"
                        strokeWidth="1.5"
                      />

                      {/* Left Flap if present */}
                      {blueprintSvg.flapW > 0 && (
                        <rect
                          x={blueprintSvg.innerX}
                          y={blueprintSvg.innerY}
                          width={blueprintSvg.flapPx}
                          height={blueprintSvg.innerH}
                          fill="rgba(148, 163, 184, 0.14)"
                          stroke="currentColor"
                          className="text-corporate-border-strong"
                          strokeDasharray="2 2"
                        />
                      )}

                      {/* Right Flap if present */}
                      {blueprintSvg.flapW > 0 && (
                        <rect
                          x={blueprintSvg.rightFlapX}
                          y={blueprintSvg.innerY}
                          width={blueprintSvg.flapPx}
                          height={blueprintSvg.innerH}
                          fill="rgba(148, 163, 184, 0.14)"
                          stroke="currentColor"
                          className="text-corporate-border-strong"
                          strokeDasharray="2 2"
                        />
                      )}

                      {/* Center Spine Bar */}
                      <rect
                        x={blueprintSvg.spineX}
                        y={blueprintSvg.innerY}
                        width={blueprintSvg.spinePx}
                        height={blueprintSvg.innerH}
                        fill="rgba(220, 0, 0, 0.22)"
                        stroke="#dc0000"
                        strokeWidth="1.5"
                      />

                      {/* Hinge / Side Crease Lines */}
                      {blueprintSvg.hingeScore > 0 && (
                        <>
                          <line
                            x1={blueprintSvg.spineX - blueprintSvg.hingePx}
                            y1={blueprintSvg.innerY}
                            x2={blueprintSvg.spineX - blueprintSvg.hingePx}
                            y2={blueprintSvg.innerY + blueprintSvg.innerH}
                            stroke="#dc0000"
                            strokeWidth="1"
                            strokeDasharray="3 2"
                          />
                          <line
                            x1={blueprintSvg.spineX + blueprintSvg.spinePx + blueprintSvg.hingePx}
                            y1={blueprintSvg.innerY}
                            x2={blueprintSvg.spineX + blueprintSvg.spinePx + blueprintSvg.hingePx}
                            y2={blueprintSvg.innerY + blueprintSvg.innerH}
                            stroke="#dc0000"
                            strokeWidth="1"
                            strokeDasharray="3 2"
                          />
                        </>
                      )}

                      {/* Labels */}
                      <text
                        x={blueprintSvg.backCoverX + blueprintSvg.coverPx / 2}
                        y={blueprintSvg.innerY + blueprintSvg.innerH / 2 - 4}
                        textAnchor="middle"
                        className="fill-current text-corporate-text font-technical text-[10px] font-bold"
                      >
                        BACK COVER
                      </text>
                      <text
                        x={blueprintSvg.backCoverX + blueprintSvg.coverPx / 2}
                        y={blueprintSvg.innerY + blueprintSvg.innerH / 2 + 10}
                        textAnchor="middle"
                        className="fill-current text-corporate-text-secondary font-technical text-[9px]"
                      >
                        {readiness.trimDimensionsMm.trimWidthMm} ×{' '}
                        {readiness.trimDimensionsMm.trimHeightMm} mm
                      </text>

                      <text
                        x={blueprintSvg.frontCoverX + blueprintSvg.coverPx / 2}
                        y={blueprintSvg.innerY + blueprintSvg.innerH / 2 - 4}
                        textAnchor="middle"
                        className="fill-current text-corporate-text font-technical text-[10px] font-bold"
                      >
                        FRONT COVER
                      </text>
                      <text
                        x={blueprintSvg.frontCoverX + blueprintSvg.coverPx / 2}
                        y={blueprintSvg.innerY + blueprintSvg.innerH / 2 + 10}
                        textAnchor="middle"
                        className="fill-current text-corporate-text-secondary font-technical text-[9px]"
                      >
                        {readiness.trimDimensionsMm.trimWidthMm} ×{' '}
                        {readiness.trimDimensionsMm.trimHeightMm} mm
                      </text>

                      {/* Spine Top Callout */}
                      <text
                        x={blueprintSvg.spineX + blueprintSvg.spinePx / 2}
                        y={Math.max(blueprintSvg.startY - 6, 12)}
                        textAnchor="middle"
                        fill="#dc0000"
                        className="font-technical text-[10px] font-black"
                      >
                        SPINE {spineResult.spineWidthMm.toFixed(1)} mm
                      </text>

                      {/* Bottom Total Spread Width Callout */}
                      <text
                        x={280}
                        y={206}
                        textAnchor="middle"
                        className="fill-current text-corporate-text-secondary font-technical text-[9px] font-bold"
                      >
                        Net Spread: {spineResult.coverGeometry.netCoverWidthMm.toFixed(1)} mm · Full File:{' '}
                        {spineResult.coverGeometry.flatCoverWidthMm.toFixed(1)}×
                        {spineResult.coverGeometry.flatCoverHeightMm.toFixed(1)} mm (+{blueprintSvg.bleed.toFixed(1)} mm side)
                        {blueprintSvg.hingeScore > 0
                          ? ` · Hinge Score: ${blueprintSvg.hingeScore.toFixed(1)} mm`
                          : ''}
                      </text>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
    </section>
  );
};

export default BookSpineGeometryPanel;
