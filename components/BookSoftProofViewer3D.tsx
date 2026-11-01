import React, { useState, useRef, useEffect } from 'react';
import {
  CubeIcon,
  ArrowsPointingOutIcon,
  BookOpenIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  EyeIcon,
  ShieldCheckIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';

export interface SoftProofBookGeometry {
  orderId: string;
  isbn: string;
  title: string;
  trimWidthMm: number;
  trimHeightMm: number;
  spineThicknessMm: number;
  bleedMarginMm: number;
  hardcoverOverhangMm: number;
  bindingType: 'SOFTCOVER_PUR' | 'HARDCOVER_SEWN' | 'SADDLE_STITCH' | string;
  surfaceFinish: string;
  paperSpecification: string;
  proofStatus: 'AWAITING_APPROVAL' | 'APPROVED_FOR_PRESS' | 'CORRECTION_REQUESTED' | string;
  proofSignatureHash?: string | null;
  proofApprovedAt?: string | null;
  proofApprovedBy?: string | null;
}

export interface BookSoftProofViewer3DProps {
  book: SoftProofBookGeometry;
  submitting?: boolean;
  onApproveForPress?: (payload: {
    orderId: string;
    comments: string;
    geometry: {
      trimWidthMm: number;
      trimHeightMm: number;
      spineThicknessMm: number;
      bleedMarginMm: number;
      hardcoverOverhangMm: number;
    };
  }) => void;
  onRequestCorrection?: (payload: {
    orderId: string;
    comments: string;
    geometry: {
      trimWidthMm: number;
      trimHeightMm: number;
      spineThicknessMm: number;
      bleedMarginMm: number;
      hardcoverOverhangMm: number;
    };
  }) => void;
}

export const BookSoftProofViewer3D: React.FC<BookSoftProofViewer3DProps> = ({
  book,
  submitting = false,
  onApproveForPress,
  onRequestCorrection,
}) => {
  const [rotationY, setRotationY] = useState<number>(-28);
  const [rotationX, setRotationX] = useState<number>(14);
  const [coverOpenDeg, setCoverOpenDeg] = useState<number>(25);
  const [showTrimBleedOverlay, setShowTrimBleedOverlay] = useState<boolean>(true);
  const [comments, setComments] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const normalizedBinding = String(book.bindingType || 'SOFTCOVER_PUR').toUpperCase();
  const isHardcover = normalizedBinding.includes('HARDCOVER') || normalizedBinding.includes('CARTON');
  const normalizedFinish = String(book.surfaceFinish || 'MATT_LAMINATION').toUpperCase();
  const isGloss = normalizedFinish.includes('GLOSS') || normalizedFinish.includes('UV');

  // Scale book dimensions in mm to 3D viewport pixels
  const scaleFactor = 0.88;
  const widthPx = Math.round((book.trimWidthMm || 150) * scaleFactor);
  const heightPx = Math.round((book.trimHeightMm || 230) * scaleFactor);
  const spinePx = Math.max(12, Math.round((book.spineThicknessMm || 14.5) * 1.65));
  const overhangMm = isHardcover ? (book.hardcoverOverhangMm || 3.0) : 0;
  const overhangPx = isHardcover ? 5 : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }, [rotationY, rotationX, coverOpenDeg, showTrimBleedOverlay, book]);

  const geometryPayload = {
    trimWidthMm: book.trimWidthMm || 150,
    trimHeightMm: book.trimHeightMm || 230,
    spineThicknessMm: book.spineThicknessMm || 14.5,
    bleedMarginMm: book.bleedMarginMm || 3.0,
    hardcoverOverhangMm: overhangMm,
  };

  return (
    <div
      data-testid="soft-proofing-viewer-3d"
      className="rounded-xl bg-white dark:bg-[#0a0b0d] border border-zinc-200 dark:border-[#1f2228] overflow-hidden text-zinc-900 dark:text-zinc-100 shadow-sm"
    >
      {/* Header Telemetry Bar */}
      <div className="px-4 py-3 bg-zinc-100/90 dark:bg-[#14161a] border-b border-zinc-200 dark:border-[#1f2228] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CubeIcon className="w-4 h-4 text-[#dc2626]" />
          <span className="font-technical text-[11px] font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
            PARAMETRIC 3D SOFT-PROOFING ENGINE · PHASE-11C
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-technical text-[10px]">
          <span className="px-2 py-0.5 rounded bg-white dark:bg-[#0a0b0d] border border-zinc-300 dark:border-[#1f2228] text-zinc-700 dark:text-zinc-300 font-bold">
            ISBN: {book.isbn || '978-84-9066-801-6'}
          </span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-[#10b981] font-bold">
            SPINE: {(book.spineThicknessMm || 14.5).toFixed(2)} mm
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-[#3b82f6] font-bold uppercase">
            {String(book.bindingType || 'SOFTCOVER PUR').replace(/_/g, ' ')}
          </span>
          {book.proofSignatureHash && (
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-black">
              ✓ Soft-Proof Signed ({book.proofSignatureHash.slice(0, 19)}…)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* 3D Interactive Viewport */}
        <div className="lg:col-span-7 relative min-h-[370px] flex flex-col items-center justify-center p-6 bg-zinc-900 dark:bg-[#0a0b0d] border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-[#1f2228] overflow-hidden">
          <canvas
            ref={canvasRef}
            width={580}
            height={370}
            data-testid="soft-proof-webgl-canvas"
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* Quick Angle Presets */}
          <div className="relative z-10 mb-3 flex flex-wrap items-center justify-center gap-1.5">
            {[
              { label: 'Isometric 3/4', ry: -28, rx: 14, open: 25 },
              { label: 'Front Cover', ry: 0, rx: 0, open: 0 },
              { label: 'Spine Profile', ry: 82, rx: 6, open: 0 },
              { label: 'Back Cover', ry: -175, rx: 6, open: 0 },
              { label: 'Open Spread (95°)', ry: -22, rx: 16, open: 95 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setRotationY(preset.ry);
                  setRotationX(preset.rx);
                  setCoverOpenDeg(preset.open);
                }}
                className="px-2 py-1 rounded bg-black/50 hover:bg-[#dc2626]/30 border border-zinc-700 hover:border-[#dc2626] text-[9px] font-technical uppercase tracking-wider text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Parametric 3D Book Assembly */}
          <div
            className="relative z-10 flex items-center justify-center my-2"
            style={{ perspective: '1100px' }}
          >
            <div
              data-testid="parametric-3d-book-mesh"
              style={{
                width: `${widthPx + overhangPx}px`,
                height: `${heightPx + overhangPx * 2}px`,
                transformStyle: 'preserve-3d',
                transform: `rotateX(${rotationX}deg) rotateY(${rotationY}deg)`,
              }}
              className="relative transition-transform duration-150 ease-out"
            >
              {/* Spine (Lomo con orientación tipográfica vertical) */}
              <div
                data-testid="book-3d-spine"
                style={{
                  width: `${spinePx}px`,
                  height: `${heightPx + overhangPx * 2}px`,
                  left: `-${Math.round(spinePx / 2)}px`,
                  transform: `rotateY(-90deg) translateZ(0px)`,
                }}
                className="absolute top-0 bg-gradient-to-r from-[#dc2626] via-[#991b1b] to-[#7f1d1d] border border-white/25 flex items-center justify-center overflow-hidden shadow-inner"
              >
                {isHardcover && (
                  <div className="absolute inset-y-0 right-1 w-[2px] bg-black/50" />
                )}
                <div
                  style={{ writingMode: 'vertical-rl' }}
                  className="font-technical text-[9px] font-black tracking-widest text-white uppercase truncate max-h-[85%] select-none"
                >
                  {book.title} · {(book.spineThicknessMm || 14.5).toFixed(1)}mm
                </div>
              </div>

              {/* Inner Paper Block (Tripa / Hojas fresadas o cosidas) */}
              <div
                style={{
                  width: `${widthPx}px`,
                  height: `${heightPx}px`,
                  top: `${overhangPx}px`,
                  left: '0px',
                  transform: `translateZ(-${Math.round(spinePx / 2)}px)`,
                }}
                className="absolute bg-[#f8fafc] border border-slate-300 shadow-md flex flex-col justify-between p-3 text-slate-900"
              >
                <div className="text-[9px] font-technical uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1">
                  INNER BLOCK · {book.paperSpecification}
                </div>
                <div className="my-auto text-center space-y-1">
                  <div className="font-technical text-[10px] font-bold text-slate-800">
                    {book.trimWidthMm} × {book.trimHeightMm} mm
                  </div>
                  <div className="font-technical text-[9px] text-slate-500">
                    PHASE-11A Verified TrimBox
                  </div>
                  <div className="font-technical text-[8px] text-emerald-700 font-bold">
                    Creep & Spine Folding Verified
                  </div>
                </div>
                <div className="text-[8px] font-technical text-slate-400 text-right">
                  ISBN {book.isbn}
                </div>
              </div>

              {/* Back Cover (Contracubierta) */}
              <div
                style={{
                  width: `${widthPx + overhangPx}px`,
                  height: `${heightPx + overhangPx * 2}px`,
                  transform: `translateZ(-${Math.round(spinePx / 2)}px)`,
                }}
                className="absolute inset-0 rounded-r-sm bg-[#181b20] border border-white/15 p-3 flex flex-col justify-end"
              >
                <div className="font-technical text-[9px] text-slate-400">
                  BACK COVER · EAN-13 {book.isbn}
                </div>
              </div>

              {/* Articulated Front Cover (Cubierta Frontal con apertura 0° a 180°) */}
              <div
                data-testid="book-3d-front-cover"
                style={{
                  width: `${widthPx + overhangPx}px`,
                  height: `${heightPx + overhangPx * 2}px`,
                  transformOrigin: 'left center',
                  transform: `translateZ(${Math.round(spinePx / 2)}px) rotateY(-${coverOpenDeg}deg)`,
                }}
                className={`absolute inset-0 rounded-r-sm border transition-transform duration-150 ${
                  isHardcover
                    ? 'bg-gradient-to-br from-[#1b1f27] via-[#14161a] to-[#0a0b0d] border-amber-400/40 shadow-2xl'
                    : 'bg-gradient-to-br from-[#1f242d] to-[#121418] border-white/20 shadow-xl'
                } p-3 flex flex-col justify-between overflow-hidden`}
              >
                {isGloss && (
                  <div
                    className="pointer-events-none absolute -inset-full bg-gradient-to-tr from-transparent via-white/15 to-transparent rotate-12"
                    aria-hidden="true"
                  />
                )}

                {isHardcover && (
                  <div
                    title="Hardcover Hinge Groove (8mm)"
                    className="absolute inset-y-0 left-2.5 w-[2px] bg-black/60 border-r border-white/10"
                  />
                )}

                {/* TrimBox vs BleedBox (+3.0 mm) Inspection Overlay */}
                {showTrimBleedOverlay && (
                  <div
                    data-testid="trim-bleed-overlay"
                    className="pointer-events-none absolute inset-1.5 border border-dashed border-[#dc2626] rounded-xs"
                  >
                    <span className="absolute -top-2 right-1 px-1 bg-[#dc2626] text-[8px] font-technical font-black text-white uppercase">
                      BLEED +{(book.bleedMarginMm || 3.0).toFixed(1)}mm
                    </span>
                    <div className="absolute inset-1.5 border border-cyan-400/70">
                      <span className="absolute bottom-0.5 right-0.5 px-1 bg-cyan-500/20 text-[8px] font-technical text-cyan-300">
                        TRIM {book.trimWidthMm}×{book.trimHeightMm}
                      </span>
                    </div>
                  </div>
                )}

                <div className="pl-3 pt-2">
                  <span className="px-1.5 py-0.5 rounded bg-[#dc2626]/20 border border-[#dc2626]/40 font-technical text-[8px] font-black text-[#ef4444] uppercase">
                    {isHardcover ? `HARDCOVER · +${overhangMm.toFixed(1)}MM OVERHANG` : 'SOFTCOVER PUR'}
                  </span>
                  <h4 className="font-black text-xs text-white mt-2 leading-snug line-clamp-3">
                    {book.title}
                  </h4>
                </div>

                <div className="pl-3 pb-1 flex items-center justify-between text-[9px] font-technical text-slate-400">
                  <span>{String(book.surfaceFinish || 'MATT LAMINATION').replace(/_/g, ' ')}</span>
                  <span className="text-emerald-400 font-bold">3D CAD OK</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Viewport Telemetry Legend */}
          <div className="relative z-10 mt-3 flex flex-wrap items-center justify-center gap-3 text-[10px] font-technical text-slate-300">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-cyan-400 bg-cyan-400/20 inline-block" />
              TrimBox: {book.trimWidthMm}×{book.trimHeightMm} mm
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-[#dc2626] bg-[#dc2626]/20 inline-block" />
              BleedBox (+3.0 mm): {book.trimWidthMm + (book.bleedMarginMm || 3) * 2}×
              {book.trimHeightMm + (book.bleedMarginMm || 3) * 2} mm
            </span>
            {isHardcover && (
              <span className="text-amber-400 font-bold">
                Hardcover Overhang (Ceja): +{overhangMm.toFixed(1)} mm
              </span>
            )}
          </div>
        </div>

        {/* Controls & Telematic Sign-Off Panel */}
        <div className="lg:col-span-5 p-5 bg-zinc-50/70 dark:bg-[#14161a] flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            {/* Interactive Sliders */}
            <div>
              <div className="flex justify-between text-xs font-technical text-zinc-700 dark:text-zinc-300 mb-1">
                <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  <ArrowsPointingOutIcon className="w-3.5 h-3.5 text-[#3b82f6]" />
                  360° Turntable Rotation
                </span>
                <span className="text-zinc-900 dark:text-white font-bold">{rotationY}°</span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                value={rotationY}
                data-testid="slider-rotation-360"
                onChange={(e) => setRotationY(Number(e.target.value))}
                className="w-full accent-[#dc2626] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-technical text-zinc-700 dark:text-zinc-300 mb-1">
                <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  <BookOpenIcon className="w-3.5 h-3.5 text-[#10b981]" />
                  Cover Opening Angle (0°–180°)
                </span>
                <span className="text-zinc-900 dark:text-white font-bold">{coverOpenDeg}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={180}
                value={coverOpenDeg}
                data-testid="slider-cover-open"
                onChange={(e) => setCoverOpenDeg(Number(e.target.value))}
                className="w-full accent-[#10b981] cursor-pointer"
              />
            </div>

            {/* TrimBox vs BleedBox Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-[#0a0b0d] border border-zinc-200 dark:border-[#1f2228] cursor-pointer">
              <span className="flex items-center gap-2 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                <EyeIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                Inspect TrimBox vs BleedBox (+3.0 mm)
              </span>
              <input
                type="checkbox"
                checked={showTrimBleedOverlay}
                onChange={(e) => setShowTrimBleedOverlay(e.target.checked)}
                className="accent-[#dc2626] w-4 h-4"
              />
            </label>

            {/* Physical Specification Readout */}
            <div className="p-3 rounded-lg bg-white dark:bg-[#0a0b0d] border border-zinc-200 dark:border-[#1f2228] space-y-1.5 font-technical text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Calculated Spine (PHASE-11A):</span>
                <span className="text-emerald-600 dark:text-[#10b981] font-bold">
                  {(book.spineThicknessMm || 14.5).toFixed(2)} mm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Full Spread Width (w/ Bleed):</span>
                <span className="text-zinc-900 dark:text-white font-bold">
                  {(book.trimWidthMm * 2 + (book.spineThicknessMm || 14.5) + (book.bleedMarginMm || 3) * 2).toFixed(1)} mm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Finish & Materiality:</span>
                <span className="text-zinc-900 dark:text-white font-bold uppercase">
                  {String(book.surfaceFinish || 'MATT LAMINATION').replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            {/* Editorial Sign-off Notes */}
            <div>
              <textarea
                rows={2}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Add pre-press sign-off notes or specify bleed/spine adjustments..."
                data-testid="soft-proof-comments-input"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0a0b0d] border border-zinc-300 dark:border-[#1f2228] text-xs font-technical text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#dc2626]"
              />
            </div>
          </div>

          {/* Formal Telematic Action Buttons */}
          <div className="space-y-2.5 pt-2 border-t border-zinc-200 dark:border-[#1f2228]">
            {(book.proofStatus === 'APPROVED_FOR_PRESS' || !!book.proofSignatureHash) && (
              <div
                data-testid="soft-proof-approved-banner"
                className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-[#10b981] font-technical text-[11px] space-y-2"
              >
                <div className="font-bold flex items-center gap-2">
                  <CheckBadgeIcon className="w-4 h-4 shrink-0" />
                  <span>DIGITALLY SIGNED & APPROVED FOR CTP PLATESETTER</span>
                </div>
                {book.proofSignatureHash && (
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-300/90 break-all flex items-center gap-1.5">
                    <ShieldCheckIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{book.proofSignatureHash}</span>
                  </div>
                )}
                <a
                  href={`/api/customer/orders/${encodeURIComponent(book.orderId)}/soft-proof/certificate.pdf`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="btn-download-imprimatur-pdf"
                  className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-technical text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-xs"
                >
                  <DocumentArrowDownIcon className="w-4 h-4 shrink-0" />
                  <span>DOWNLOAD SIGN-OFF CERTIFICATE (PDF)</span>
                </a>
              </div>
            )}

            {book.proofStatus === 'CORRECTION_REQUESTED' && (
              <div
                data-testid="soft-proof-correction-banner"
                className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-[#f59e0b] font-technical text-[11px] font-bold flex items-center gap-2"
              >
                <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                <span>CORRECTION REQUESTED — PREFLIGHT HOLD</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={submitting}
                data-testid="btn-approve-for-press"
                onClick={() =>
                  onApproveForPress?.({
                    orderId: book.orderId,
                    comments:
                      comments ||
                      `3D Soft-Proof approved (${(book.spineThicknessMm || 14.5).toFixed(2)} mm spine, ${book.trimWidthMm}x${book.trimHeightMm} mm TrimBox)`,
                    geometry: geometryPayload,
                  })
                }
                className="px-3 py-2.5 rounded-lg bg-[#10b981] hover:bg-emerald-500 disabled:opacity-50 text-black font-technical text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <SparklesIcon className="w-4 h-4 stroke-[2.5]" />
                <span>{submitting ? 'SIGNING SHA-256…' : 'APPROVE FOR PRESS'}</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                data-testid="btn-request-correction"
                onClick={() =>
                  onRequestCorrection?.({
                    orderId: book.orderId,
                    comments:
                      comments ||
                      'Correction requested on cover spine or bleed margin geometry.',
                    geometry: geometryPayload,
                  })
                }
                className="px-3 py-2.5 rounded-lg bg-red-50 dark:bg-[#0a0b0d] hover:bg-red-500/15 border border-red-300 dark:border-[#dc2626]/50 text-red-700 dark:text-[#ef4444] font-technical text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <ExclamationTriangleIcon className="w-4 h-4" />
                <span>REQUEST CORRECTION</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookSoftProofViewer3D;

