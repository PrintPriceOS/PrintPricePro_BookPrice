import {
  BindingMethod,
  BookPricePayload,
  CaliperConfidenceStatus,
  CaliperSource,
  SpineBindingCategory,
  SpineBindingProfileRules,
  SpineCalculationRequestPayload,
  SpineCalculationResult,
  SpineProcessingType,
  SpineShape,
} from '../types';

export interface SpineTrimDimensionsMm {
  valid: boolean;
  reasonCode: string | null;
  trimWidthMm: number | null;
  trimHeightMm: number | null;
}

export type SpineReadinessStatus =
  | 'READY'
  | 'UNSUPPORTED_BINDING_FOR_SPINE_ENGINE'
  | 'CALIPER_VERIFICATION_REQUIRED'
  | 'HARDCOVER_PROFILE_PARAMETERS_REQUIRED'
  | 'INVALID_BOOK_DIMENSIONS';

export interface SpineHardcoverProfileParameters {
  profileId?: string | null;
  boardThicknessMm?: number | null;
  overhangMm?: number | null;
  foldingSignaturePages?: 16 | 32 | null;
  spineShape?: SpineShape | null;
}

export interface SpineRequestReadinessOptions {
  hardcoverProfileParams?: SpineHardcoverProfileParameters | null;
  flapWidthMm?: number | null;
}

export interface SpineRequestReadiness {
  status: SpineReadinessStatus;
  reasonCode: string;
  message: string;
  requestPayload: SpineCalculationRequestPayload | null;
  fingerprint: string;
  trimDimensionsMm: SpineTrimDimensionsMm;
  bindingMapping: {
    bindingCategory: SpineBindingCategory | null;
    processingType: SpineProcessingType | null;
    bindingLabel: string;
  };
  caliperTelemetry: {
    interiorMode: 'standard' | 'advanced';
    interiorVariantId: string | null;
    interiorPaperName: string;
    interiorGsm: number;
    interiorCaliperUm: number | null;
    caliperConfidenceStatus: CaliperConfidenceStatus | string | null;
    caliperSource: CaliperSource | string | null;
    coverMode: 'standard' | 'advanced';
    coverVariantId: string | null;
    coverPaperName: string;
    coverGsm: number;
    coverCaliperUm: number | null;
    coverCaliperConfidenceStatus: CaliperConfidenceStatus | string | null;
    coverCaliperSource: CaliperSource | string | null;
  };
}

export interface SpineApiResponse {
  ok: boolean;
  httpStatus: number;
  errorCode?: string;
  errorMessage?: string;
  data?: SpineCalculationResult;
}

export interface SpineBindingProfileSummary {
  profileId: string;
  version: string;
  fullProfileKey: string;
  displayName: string;
  machineryLine: string;
  operationalStatus: string;
  certificationTier: string;
  supportedBindingCategories: SpineBindingCategory[];
  supportedProcessingTypes: SpineProcessingType[];
  roundingStepMm?: number;
  rules?: SpineBindingProfileRules;
}

const STANDARD_SIZE_LOOKUP_MM: Record<string, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  A6: { widthMm: 105, heightMm: 148 },
  '170 x 240 mm': { widthMm: 170, heightMm: 240 },
  '200 x 200 mm': { widthMm: 200, heightMm: 200 },
  '220 x 220 mm': { widthMm: 220, heightMm: 220 },
};

const VALID_ORIENTATIONS = new Set(['portrait', 'landscape']);

const KNOWN_CALIPER_SOURCES = new Set<string>([
  'MEASURED_MICROMETER',
  'MANUFACTURER_DATASHEET',
  'LIVONIA_REFERENCE_IMPORT',
  'SUPPLIER_IMPORT',
  'BULK_DERIVED',
  'NONE',
]);

const KNOWN_CONFIDENCE_STATUSES = new Set<string>([
  'VERIFIED',
  'REFERENCE_IMPORTED',
  'PROVISIONAL_ESTIMATED',
  'MISSING',
]);

/**
 * Pure dimensional format lookup for standard ISO/editorial formats and custom sizes.
 * SPINE-04-R02: Never silently falls back to A5 for unrecognized formats or missing dimensions.
 * Zero spine or bulk mathematics occur on the client.
 */
export function resolveTrimDimensionsMm(payload: BookPricePayload): SpineTrimDimensionsMm {
  if (!payload || !payload.book_size) {
    return {
      valid: false,
      reasonCode: 'MISSING_BOOK_SIZE',
      trimWidthMm: null,
      trimHeightMm: null,
    };
  }

  const orientation = String(payload.orientation || '').toLowerCase();
  if (!VALID_ORIENTATIONS.has(orientation)) {
    return {
      valid: false,
      reasonCode: 'INVALID_BOOK_ORIENTATION',
      trimWidthMm: null,
      trimHeightMm: null,
    };
  }

  if (payload.book_size === 'Custom') {
    const rawW = payload.custom_width;
    const rawH = payload.custom_height;
    const w = rawW !== undefined && rawW !== null ? Number(rawW) : NaN;
    const h = rawH !== undefined && rawH !== null ? Number(rawH) : NaN;

    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 50 || h < 50 || w > 1000 || h > 1000) {
      return {
        valid: false,
        reasonCode: 'INVALID_CUSTOM_BOOK_DIMENSIONS',
        trimWidthMm: Number.isFinite(w) && w > 0 ? w : null,
        trimHeightMm: Number.isFinite(h) && h > 0 ? h : null,
      };
    }

    if (orientation === 'landscape' && w < h) {
      return {
        valid: true,
        reasonCode: null,
        trimWidthMm: h,
        trimHeightMm: w,
      };
    }

    return {
      valid: true,
      reasonCode: null,
      trimWidthMm: w,
      trimHeightMm: h,
    };
  }

  const preset = STANDARD_SIZE_LOOKUP_MM[String(payload.book_size)];
  if (!preset) {
    return {
      valid: false,
      reasonCode: 'UNRECOGNIZED_BOOK_SIZE_FORMAT',
      trimWidthMm: null,
      trimHeightMm: null,
    };
  }

  if (orientation === 'landscape' && preset.widthMm < preset.heightMm) {
    return {
      valid: true,
      reasonCode: null,
      trimWidthMm: preset.heightMm,
      trimHeightMm: preset.widthMm,
    };
  }

  return {
    valid: true,
    reasonCode: null,
    trimWidthMm: preset.widthMm,
    trimHeightMm: preset.heightMm,
  };
}

/**
 * Maps Budget App binding methods to Control Plane Spine Engine categories.
 */
export function mapBindingMethodToSpineContract(bindingMethod: BindingMethod): {
  supported: boolean;
  bindingCategory: SpineBindingCategory | null;
  processingType: SpineProcessingType | null;
  bindingLabel: string;
} {
  switch (bindingMethod) {
    case 'perfect_bound':
      return {
        supported: true,
        bindingCategory: 'SOFTCOVER_STANDARD',
        processingType: 'GLUED',
        bindingLabel: 'Softcover Perfect Bound (Glued)',
      };
    case 'thread_sewn_sc':
      return {
        supported: true,
        bindingCategory: 'SOFTCOVER_STANDARD',
        processingType: 'SEWN',
        bindingLabel: 'Softcover Thread Sewn',
      };
    case 'thread_sewn_hc':
      return {
        supported: true,
        bindingCategory: 'HARDCOVER',
        processingType: 'SEWN',
        bindingLabel: 'Hardcover Casebound Thread Sewn',
      };
    case 'flexibound':
      return {
        supported: true,
        bindingCategory: 'FLEXI_STANDARD',
        processingType: 'SEWN',
        bindingLabel: 'Flexibound / Otabind Thread Sewn',
      };
    case 'saddle_stitch':
      return {
        supported: false,
        bindingCategory: null,
        processingType: null,
        bindingLabel: 'Saddle Stitch (Folded Spine — No Extended Spine Block)',
      };
    case 'wire_o':
      return {
        supported: false,
        bindingCategory: null,
        processingType: null,
        bindingLabel: 'Wire-O Mechanical Ring Binding',
      };
    default:
      return {
        supported: false,
        bindingCategory: null,
        processingType: null,
        bindingLabel: String(bindingMethod),
      };
  }
}

/**
 * Normalizes paper caliper provenance without ever upgrading unverified or missing metadata
 * to 'VERIFIED' or 'LIVONIA_REFERENCE_IMPORT' (SPINE-04-R01).
 */
export function normalizeMaterialCaliperProvenance(material: {
  caliperUm?: number | null;
  caliper_um?: number | null;
  caliperSource?: string | null;
  caliperConfidenceStatus?: string | null;
} | null): {
  caliperUm: number | null;
  caliperSource: CaliperSource | string;
  caliperConfidenceStatus: CaliperConfidenceStatus | string;
} {
  if (!material) {
    return {
      caliperUm: null,
      caliperSource: 'NONE',
      caliperConfidenceStatus: 'MISSING',
    };
  }

  const rawUm = material.caliperUm ?? material.caliper_um ?? null;
  const caliperUm =
    typeof rawUm === 'number' && Number.isFinite(rawUm) && rawUm > 0 ? rawUm : null;

  if (!caliperUm) {
    return {
      caliperUm: null,
      caliperSource: 'NONE',
      caliperConfidenceStatus: 'MISSING',
    };
  }

  const rawSource = String(material.caliperSource || '').trim();
  const caliperSource =
    rawSource && KNOWN_CALIPER_SOURCES.has(rawSource) && rawSource !== 'NONE'
      ? rawSource
      : 'NONE';

  const rawConfidence = String(material.caliperConfidenceStatus || '').trim();
  let caliperConfidenceStatus: CaliperConfidenceStatus | string;

  if (
    caliperSource !== 'NONE' &&
    rawConfidence &&
    KNOWN_CONFIDENCE_STATUSES.has(rawConfidence) &&
    rawConfidence !== 'MISSING'
  ) {
    caliperConfidenceStatus = rawConfidence;
  } else {
    // Missing provenance or unrecognized confidence status must remain provisional
    caliperConfidenceStatus = 'PROVISIONAL_ESTIMATED';
  }

  return {
    caliperUm,
    caliperSource,
    caliperConfidenceStatus,
  };
}

/**
 * Evaluates whether the current BookPricePayload has all authoritative inputs
 * required to request a Spine & Extended Cover calculation from Control Plane.
 *
 * SPINE-04-R01 & R02 Invariants:
 * - Never fabricates missing coverCaliperUm (e.g. 280 µm), caliperSource, or caliperConfidenceStatus.
 * - Never silently converts unrecognized book_size formats into A5.
 * - Never invents hardcover boardThicknessMm, overhangMm, or foldingSignaturePages without an
 *   authorized Control Plane binding profile.
 */
export function resolveSpineRequestReadiness(
  payload: BookPricePayload,
  options?: SpineRequestReadinessOptions
): SpineRequestReadiness {
  const trimDimensionsMm = resolveTrimDimensionsMm(payload);
  const bindingMap = mapBindingMethodToSpineContract(payload.binding_method);

  const interiorMaterial =
    payload.paper_mode_interior === 'advanced' ? payload.interior_paper_material || null : null;
  const coverMaterial =
    payload.paper_mode_cover === 'advanced' ? payload.cover_paper_material || null : null;

  const interiorVariantId =
    interiorMaterial?.variantId || interiorMaterial?.variant_id || null;
  const interiorProvenance = normalizeMaterialCaliperProvenance(interiorMaterial);

  const coverVariantId = coverMaterial?.variantId || coverMaterial?.variant_id || null;
  const coverProvenance = normalizeMaterialCaliperProvenance(coverMaterial);

  const interiorPaperName = interiorMaterial
    ? `${interiorMaterial.productName || interiorMaterial.product_name || 'Catalog Substrate'} (${interiorMaterial.gsm} gsm)`
    : `${String(payload.paper_type_interior).replace(/_/g, ' ')} (${payload.paper_weight_interior} gsm preset)`;

  const coverPaperName = coverMaterial
    ? `${coverMaterial.productName || coverMaterial.product_name || 'Catalog Cover Substrate'} (${coverMaterial.gsm} gsm)`
    : `${String(payload.paper_type_cover).replace(/_/g, ' ')} (${payload.paper_weight_cover} gsm preset)`;

  const hcParams = options?.hardcoverProfileParams || null;
  const flapWidthMm =
    options?.flapWidthMm && Number(options.flapWidthMm) > 0
      ? Number(options.flapWidthMm)
      : null;

  const fingerprintParts = [
    payload.book_size,
    trimDimensionsMm.valid ? trimDimensionsMm.trimWidthMm : 'invalid-w',
    trimDimensionsMm.valid ? trimDimensionsMm.trimHeightMm : 'invalid-h',
    payload.orientation,
    payload.interior_pages,
    payload.binding_method,
    payload.paper_mode_interior || 'standard',
    interiorVariantId || 'preset',
    interiorProvenance.caliperUm || 'no-caliper',
    interiorProvenance.caliperSource,
    interiorProvenance.caliperConfidenceStatus,
    interiorMaterial?.gsm || payload.paper_weight_interior,
    payload.paper_mode_cover || 'standard',
    coverVariantId || 'preset-cover',
    coverProvenance.caliperUm || 'no-cover-caliper',
    coverProvenance.caliperSource,
    coverProvenance.caliperConfidenceStatus,
    payload.endpapers || 'none',
    hcParams?.profileId || 'no-hc-profile',
    hcParams?.boardThicknessMm ?? 'no-board',
    hcParams?.overhangMm ?? 'no-overhang',
    hcParams?.foldingSignaturePages ?? 'no-sig',
    hcParams?.spineShape || 'no-shape',
    flapWidthMm ?? 0,
  ];
  const fingerprint = fingerprintParts.join('|');

  const caliperTelemetry = {
    interiorMode: (payload.paper_mode_interior || 'standard') as 'standard' | 'advanced',
    interiorVariantId,
    interiorPaperName,
    interiorGsm: interiorMaterial?.gsm || payload.paper_weight_interior,
    interiorCaliperUm: interiorProvenance.caliperUm,
    caliperConfidenceStatus: interiorMaterial ? interiorProvenance.caliperConfidenceStatus : null,
    caliperSource: interiorMaterial ? interiorProvenance.caliperSource : null,
    coverMode: (payload.paper_mode_cover || 'standard') as 'standard' | 'advanced',
    coverVariantId,
    coverPaperName,
    coverGsm: coverMaterial?.gsm || payload.paper_weight_cover,
    coverCaliperUm: coverProvenance.caliperUm,
    coverCaliperConfidenceStatus: coverMaterial ? coverProvenance.caliperConfidenceStatus : null,
    coverCaliperSource: coverMaterial ? coverProvenance.caliperSource : null,
  };

  if (!bindingMap.supported || !bindingMap.bindingCategory || !bindingMap.processingType) {
    return {
      status: 'UNSUPPORTED_BINDING_FOR_SPINE_ENGINE',
      reasonCode: 'UNSUPPORTED_BINDING_FOR_SPINE_ENGINE',
      message: `${bindingMap.bindingLabel} does not use a squared or rounded spine block calculator. Select Softcover Perfect Bound, Softcover Thread Sewn, or Hardcover Casebound to compute spine and extended cover geometry.`,
      requestPayload: null,
      fingerprint,
      trimDimensionsMm,
      bindingMapping: {
        bindingCategory: bindingMap.bindingCategory,
        processingType: bindingMap.processingType,
        bindingLabel: bindingMap.bindingLabel,
      },
      caliperTelemetry,
    };
  }

  if (
    !trimDimensionsMm.valid ||
    trimDimensionsMm.trimWidthMm === null ||
    trimDimensionsMm.trimHeightMm === null ||
    !Number.isFinite(trimDimensionsMm.trimWidthMm) ||
    !Number.isFinite(trimDimensionsMm.trimHeightMm) ||
    trimDimensionsMm.trimWidthMm < 50 ||
    trimDimensionsMm.trimHeightMm < 50 ||
    !Number.isInteger(Number(payload.interior_pages)) ||
    Number(payload.interior_pages) < 4
  ) {
    const dimensionReason = trimDimensionsMm.reasonCode || 'INVALID_BOOK_DIMENSIONS';
    const dimensionMessage =
      dimensionReason === 'UNRECOGNIZED_BOOK_SIZE_FORMAT'
        ? `Book format "${String(payload.book_size)}" is not recognized in the standard format table. Spine calculation is blocked rather than assuming a default format.`
        : dimensionReason === 'INVALID_BOOK_ORIENTATION'
          ? `Book orientation "${String(payload.orientation)}" is invalid. Select Portrait or Landscape.`
          : 'Valid trim dimensions (50–1000 mm) and interior page count (>= 4 pages) are required before requesting spine geometry.';

    return {
      status: 'INVALID_BOOK_DIMENSIONS',
      reasonCode: dimensionReason,
      message: dimensionMessage,
      requestPayload: null,
      fingerprint,
      trimDimensionsMm,
      bindingMapping: {
        bindingCategory: bindingMap.bindingCategory,
        processingType: bindingMap.processingType,
        bindingLabel: bindingMap.bindingLabel,
      },
      caliperTelemetry,
    };
  }

  if (payload.paper_mode_interior !== 'advanced' || !interiorMaterial || !interiorProvenance.caliperUm) {
    const missingReason =
      payload.paper_mode_interior !== 'advanced' || !interiorMaterial
        ? 'Generic GSM presets do not carry a single physical thickness: two 100 gsm papers can vary from 98 µm (smooth offset) to 175 µm (high-bulk novel paper). Select a certified substrate in the Advanced Catalog to calculate exact spine geometry.'
        : `Selected catalog variant "${interiorMaterial.productName || interiorMaterial.product_name}" (${interiorMaterial.gsm} gsm) does not have a verified physical caliper (µm) on record yet. Spine calculation is blocked until caliper is verified.`;

    return {
      status: 'CALIPER_VERIFICATION_REQUIRED',
      reasonCode: 'CALIPER_VERIFICATION_REQUIRED',
      message: missingReason,
      requestPayload: null,
      fingerprint,
      trimDimensionsMm,
      bindingMapping: {
        bindingCategory: bindingMap.bindingCategory,
        processingType: bindingMap.processingType,
        bindingLabel: bindingMap.bindingLabel,
      },
      caliperTelemetry,
    };
  }

  const isHardcover = bindingMap.bindingCategory === 'HARDCOVER';
  const isSoftcover =
    bindingMap.bindingCategory === 'SOFTCOVER_STANDARD' ||
    bindingMap.bindingCategory === 'SOFTCOVER_WITH_FLAPS';

  if (isHardcover) {
    const hasBoard =
      hcParams &&
      typeof hcParams.boardThicknessMm === 'number' &&
      Number.isFinite(hcParams.boardThicknessMm) &&
      hcParams.boardThicknessMm > 0;
    const hasOverhang =
      hcParams &&
      typeof hcParams.overhangMm === 'number' &&
      Number.isFinite(hcParams.overhangMm) &&
      hcParams.overhangMm > 0;
    const hasSignature =
      hcParams &&
      (hcParams.foldingSignaturePages === 16 || hcParams.foldingSignaturePages === 32);

    if (!hasBoard || !hasOverhang || !hasSignature) {
      return {
        status: 'HARDCOVER_PROFILE_PARAMETERS_REQUIRED',
        reasonCode: 'HARDCOVER_PROFILE_PARAMETERS_REQUIRED',
        message:
          'Hardcover casebound geometry requires authoritative binding profile parameters (board thickness, overhang, and folding signature) from Control Plane before computing case dimensions.',
        requestPayload: null,
        fingerprint,
        trimDimensionsMm,
        bindingMapping: {
          bindingCategory: bindingMap.bindingCategory,
          processingType: bindingMap.processingType,
          bindingLabel: bindingMap.bindingLabel,
        },
        caliperTelemetry,
      };
    }
  }

  const isCoated =
    interiorMaterial.category === 'COATED' ||
    /coated|silk|gloss|matt/i.test(String(interiorMaterial.finish || ''));

  const effectiveBindingCategory: SpineBindingCategory =
    isSoftcover && flapWidthMm && flapWidthMm > 0
      ? 'SOFTCOVER_WITH_FLAPS'
      : bindingMap.bindingCategory;

  const requestPayload: SpineCalculationRequestPayload = {
    bindingCategory: effectiveBindingCategory,
    processingType: bindingMap.processingType,
    trimWidthMm: trimDimensionsMm.trimWidthMm,
    trimHeightMm: trimDimensionsMm.trimHeightMm,
    segments: [
      {
        segmentIndex: 1,
        pages: Number(payload.interior_pages),
        variantId: interiorVariantId,
        paperFamilyName: interiorPaperName,
        gsm: Number(interiorMaterial.gsm || payload.paper_weight_interior),
        caliperUm: interiorProvenance.caliperUm,
        coatingType: isCoated ? 'COATED' : 'UNCOATED',
        caliperSource: interiorProvenance.caliperSource,
        caliperConfidenceStatus: interiorProvenance.caliperConfidenceStatus,
      },
    ],
    cover: !isHardcover
      ? {
          variantId: coverVariantId,
          gsm: coverMaterial?.gsm || payload.paper_weight_cover,
          caliperUm: coverProvenance.caliperUm,
          flapWidthMm:
            effectiveBindingCategory === 'SOFTCOVER_WITH_FLAPS' ? flapWidthMm : undefined,
          caliperSource: coverProvenance.caliperSource,
          caliperConfidenceStatus: coverProvenance.caliperConfidenceStatus,
        }
      : null,
    hardcover:
      isHardcover && hcParams
        ? {
            endpapersMode:
              payload.endpapers && payload.endpapers !== 'none' ? 'SEPARATE' : 'SELF_ENDED',
            boardThicknessMm: Number(hcParams.boardThicknessMm),
            blockPaperCoating: isCoated ? 'COATED' : 'UNCOATED',
            spineShape: hcParams.spineShape || 'SQUARE',
            overhangMm: Number(hcParams.overhangMm),
            foldingSignaturePages: (hcParams.foldingSignaturePages as 16 | 32) || 16,
          }
        : null,
  };

  return {
    status: 'READY',
    reasonCode: 'READY',
    message: 'All authoritative parameters verified for Control Plane Spine Engine.',
    requestPayload,
    fingerprint,
    trimDimensionsMm,
    bindingMapping: {
      bindingCategory: effectiveBindingCategory,
      processingType: bindingMap.processingType,
      bindingLabel: bindingMap.bindingLabel,
    },
    caliperTelemetry,
  };
}

/**
 * Calls the Budget BFF proxy (`POST /api/budget/spine/calculate`) which forwards
 * to Control Plane (`POST /api/v1/spine/calculate`).
 */
export async function calculateBookSpineGeometry(
  requestPayload: SpineCalculationRequestPayload,
  options?: { signal?: AbortSignal; idempotencyKey?: string }
): Promise<SpineApiResponse> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch('/api/budget/spine/calculate', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(requestPayload),
      signal: options?.signal,
    });

    const json = await response.json().catch(() => null);

    if (response.ok && json?.ok && json?.data) {
      const calcData = json.data as SpineCalculationResult;
      if (calcData.manufacturingValidation?.status === 'INVALID_BLOCKED') {
        const firstError = calcData.manufacturingValidation.issues?.find(
          (i) => i.severity === 'ERROR'
        );
        return {
          ok: false,
          httpStatus: 422,
          errorCode: firstError?.code || 'INVALID_BLOCKED',
          errorMessage:
            firstError?.message ||
            'Control Plane blocked the spine geometry calculation due to manufacturing constraints.',
          data: calcData,
        };
      }

      return {
        ok: true,
        httpStatus: response.status,
        data: calcData,
      };
    }

    const errorCode =
      json?.error?.code ||
      (response.status === 503 || response.status === 404
        ? 'SPINE_NOT_AVAILABLE'
        : 'SPINE_CALCULATION_REJECTED');

    const errorMessage =
      json?.error?.message ||
      (errorCode === 'SPINE_NOT_AVAILABLE'
        ? 'Control Plane Spine Engine (/api/v1/spine) is not active in this environment yet. No synthetic dimensions generated.'
        : 'Control Plane rejected the spine calculation request.');

    return {
      ok: false,
      httpStatus: response.status,
      errorCode,
      errorMessage,
      data: json?.data as SpineCalculationResult | undefined,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    return {
      ok: false,
      httpStatus: 503,
      errorCode: 'SPINE_NOT_AVAILABLE',
      errorMessage:
        'Control Plane Spine Engine (/api/v1/spine) is unreachable. No synthetic dimensions generated.',
    };
  }
}

/**
 * Lists available spine binding profiles and their certification tiers from Control Plane.
 */
export async function fetchSpineBindingProfiles(options?: {
  includeExperimental?: boolean;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  httpStatus: number;
  errorCode?: string;
  errorMessage?: string;
  profiles: SpineBindingProfileSummary[];
}> {
  try {
    const qs = options?.includeExperimental ? '?includeExperimental=true' : '';
    const response = await fetch(`/api/budget/spine/profiles${qs}`, {
      method: 'GET',
      credentials: 'include',
      signal: options?.signal,
    });
    const json = await response.json().catch(() => null);

    const items = json?.data?.profiles || json?.data?.items;
    if (response.ok && json?.ok && Array.isArray(items)) {
      return {
        ok: true,
        httpStatus: response.status,
        profiles: items as SpineBindingProfileSummary[],
      };
    }

    return {
      ok: false,
      httpStatus: response.status,
      errorCode: json?.error?.code || 'SPINE_NOT_AVAILABLE',
      errorMessage:
        json?.error?.message ||
        'Control Plane Spine profiles endpoint is not available in this environment.',
      profiles: [],
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    return {
      ok: false,
      httpStatus: 503,
      errorCode: 'SPINE_NOT_AVAILABLE',
      errorMessage: 'Control Plane Spine profiles endpoint is unreachable.',
      profiles: [],
    };
  }
}
