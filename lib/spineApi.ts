import {
  BindingMethod,
  BookPricePayload,
  SpineBindingCategory,
  SpineCalculationRequestPayload,
  SpineCalculationResult,
  SpineProcessingType,
} from '../types';

export interface SpineTrimDimensionsMm {
  trimWidthMm: number;
  trimHeightMm: number;
}

export type SpineReadinessStatus =
  | 'READY'
  | 'UNSUPPORTED_BINDING_FOR_SPINE_ENGINE'
  | 'CALIPER_VERIFICATION_REQUIRED'
  | 'INVALID_BOOK_DIMENSIONS';

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
    caliperConfidenceStatus: string | null;
    caliperSource: string | null;
    coverVariantId: string | null;
    coverCaliperUm: number | null;
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
}

const STANDARD_SIZE_LOOKUP_MM: Record<string, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  A6: { widthMm: 105, heightMm: 148 },
  '170 x 240 mm': { widthMm: 170, heightMm: 240 },
  '200 x 200 mm': { widthMm: 200, heightMm: 200 },
  '220 x 220 mm': { widthMm: 220, heightMm: 220 },
};

/**
 * Pure dimensional format lookup for standard ISO/editorial formats and custom sizes.
 * Zero spine or bulk mathematics occur on the client.
 */
export function resolveTrimDimensionsMm(payload: BookPricePayload): SpineTrimDimensionsMm {
  if (payload.book_size === 'Custom') {
    return {
      trimWidthMm: Number(payload.custom_width) || 0,
      trimHeightMm: Number(payload.custom_height) || 0,
    };
  }

  const preset = STANDARD_SIZE_LOOKUP_MM[payload.book_size] || STANDARD_SIZE_LOOKUP_MM.A5;
  if (payload.orientation === 'landscape' && preset.widthMm < preset.heightMm) {
    return {
      trimWidthMm: preset.heightMm,
      trimHeightMm: preset.widthMm,
    };
  }

  return {
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
        bindingLabel: 'Softcover Perfect Bound (Alegro Glued)',
      };
    case 'thread_sewn_sc':
      return {
        supported: true,
        bindingCategory: 'SOFTCOVER_STANDARD',
        processingType: 'SEWN',
        bindingLabel: 'Softcover Thread Sewn (Alegro Sewn)',
      };
    case 'thread_sewn_hc':
      return {
        supported: true,
        bindingCategory: 'HARDCOVER',
        processingType: 'SEWN',
        bindingLabel: 'Hardcover Casebound Thread Sewn (Colibri)',
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
 * Evaluates whether the current BookPricePayload has all authoritative inputs
 * required to request a Spine & Extended Cover calculation from Control Plane.
 * Never fabricates missing caliper microns or client-side bulk estimations.
 */
export function resolveSpineRequestReadiness(payload: BookPricePayload): SpineRequestReadiness {
  const trimDimensionsMm = resolveTrimDimensionsMm(payload);
  const bindingMap = mapBindingMethodToSpineContract(payload.binding_method);

  const interiorMaterial =
    payload.paper_mode_interior === 'advanced' ? payload.interior_paper_material || null : null;
  const coverMaterial =
    payload.paper_mode_cover === 'advanced' ? payload.cover_paper_material || null : null;

  const interiorVariantId =
    interiorMaterial?.variantId || interiorMaterial?.variant_id || null;
  const interiorCaliperUmRaw =
    interiorMaterial?.caliperUm ?? interiorMaterial?.caliper_um ?? null;
  const interiorCaliperUm =
    typeof interiorCaliperUmRaw === 'number' && Number.isFinite(interiorCaliperUmRaw) && interiorCaliperUmRaw > 0
      ? interiorCaliperUmRaw
      : null;

  const coverVariantId = coverMaterial?.variantId || coverMaterial?.variant_id || null;
  const coverCaliperUmRaw = coverMaterial?.caliperUm ?? coverMaterial?.caliper_um ?? null;
  const coverCaliperUm =
    typeof coverCaliperUmRaw === 'number' && Number.isFinite(coverCaliperUmRaw) && coverCaliperUmRaw > 0
      ? coverCaliperUmRaw
      : null;

  const interiorPaperName = interiorMaterial
    ? `${interiorMaterial.productName || interiorMaterial.product_name || 'Catalog Substrate'} (${interiorMaterial.gsm} gsm)`
    : `${String(payload.paper_type_interior).replace(/_/g, ' ')} (${payload.paper_weight_interior} gsm preset)`;

  const fingerprintParts = [
    payload.book_size,
    trimDimensionsMm.trimWidthMm,
    trimDimensionsMm.trimHeightMm,
    payload.orientation,
    payload.interior_pages,
    payload.binding_method,
    payload.paper_mode_interior || 'standard',
    interiorVariantId || 'preset',
    interiorCaliperUm || 'no-caliper',
    interiorMaterial?.gsm || payload.paper_weight_interior,
    payload.paper_mode_cover || 'standard',
    coverVariantId || 'preset-cover',
    coverCaliperUm || 'no-cover-caliper',
    payload.endpapers || 'none',
  ];
  const fingerprint = fingerprintParts.join('|');

  const caliperTelemetry = {
    interiorMode: (payload.paper_mode_interior || 'standard') as 'standard' | 'advanced',
    interiorVariantId,
    interiorPaperName,
    interiorGsm: interiorMaterial?.gsm || payload.paper_weight_interior,
    interiorCaliperUm,
    caliperConfidenceStatus: interiorMaterial?.caliperConfidenceStatus || null,
    caliperSource: interiorMaterial?.caliperSource || null,
    coverVariantId,
    coverCaliperUm,
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
    !Number.isFinite(trimDimensionsMm.trimWidthMm) ||
    !Number.isFinite(trimDimensionsMm.trimHeightMm) ||
    trimDimensionsMm.trimWidthMm < 50 ||
    trimDimensionsMm.trimHeightMm < 50 ||
    !Number.isInteger(Number(payload.interior_pages)) ||
    Number(payload.interior_pages) < 4
  ) {
    return {
      status: 'INVALID_BOOK_DIMENSIONS',
      reasonCode: 'INVALID_BOOK_DIMENSIONS',
      message: 'Valid trim dimensions (>= 50 mm) and interior page count (>= 4 pages) are required before requesting spine geometry.',
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

  if (payload.paper_mode_interior !== 'advanced' || !interiorMaterial || !interiorCaliperUm) {
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
  const isCoated =
    interiorMaterial.category === 'COATED' ||
    /coated|silk|gloss|matt/i.test(String(interiorMaterial.finish || ''));

  const requestPayload: SpineCalculationRequestPayload = {
    bindingCategory: bindingMap.bindingCategory,
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
        caliperUm: interiorCaliperUm,
        coatingType: isCoated ? 'COATED' : 'UNCOATED',
        caliperSource: interiorMaterial.caliperSource || 'LIVONIA_REFERENCE_IMPORT',
        caliperConfidenceStatus: interiorMaterial.caliperConfidenceStatus || 'VERIFIED',
      },
    ],
    cover: !isHardcover
      ? {
          variantId: coverVariantId,
          gsm: coverMaterial?.gsm || payload.paper_weight_cover,
          caliperUm: coverCaliperUm || 280,
          caliperSource: coverMaterial?.caliperSource || 'LIVONIA_REFERENCE_IMPORT',
          caliperConfidenceStatus: coverMaterial?.caliperConfidenceStatus || 'VERIFIED',
        }
      : null,
    hardcover: isHardcover
      ? {
          endpapersMode: payload.endpapers && payload.endpapers !== 'none' ? 'SEPARATE' : 'SELF_ENDED',
          boardThicknessMm: 2.4,
          blockPaperCoating: isCoated ? 'COATED' : 'UNCOATED',
          spineShape: 'SQUARE',
          overhangMm: 2.5,
          foldingSignaturePages: 16,
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
      bindingCategory: bindingMap.bindingCategory,
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
