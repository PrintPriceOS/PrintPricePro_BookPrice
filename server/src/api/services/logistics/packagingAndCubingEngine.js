'use strict';

/**
 * src/api/services/logistics/packagingAndCubingEngine.js
 *
 * PrintPrice OS — Phase 198A (LOGISTICS-01): Pure Deterministic 3D Cubing,
 * Unit Weight, Carton Packing, Euro-Pallet Stacking & Full-Pallet Run Optimizer Engine.
 *
 * Implements the five decoupled calculation stages:
 * 1. calculateUnitFinishedBookWeightAndDimensions
 * 2. calculateOptimalCartonPacking
 * 3. calculateEuroPalletTilingAndStacking
 * 4. validateWarehouseDeliveryConstraints
 * 5. calculateFullPalletRunOptimization
 *
 * Plus the master pure orchestrator:
 * - executeLogisticsCubingCalculation(input)
 *
 * Invariants enforced:
 * - Zero dependencies on database, network, browser globals, or environment variables.
 * - Reuses `executeSpineCalculation`, `roundToPrecision`, and `computeCanonicalHash` from
 *   `../spine/spineCalculationEngine` when spine geometry is not pre-computed.
 * - Never converts unknown/partial inputs into confirmed values (explicit epistemic status).
 */

const {
    executeSpineCalculation,
    roundToPrecision,
    computeCanonicalHash
} = require('../spine/spineCalculationEngine');

const LOGISTICS_ENGINE_VERSION = '1.1.0';

/**
 * Operational Scenario Enums (Phase 198B — LOGISTICS-04)
 */
const TRACKING_INTEGRATION_MODES = Object.freeze({
    CARRIER_API: 'CARRIER_API',
    MANUAL_PORTAL_OR_CMR: 'MANUAL_PORTAL_OR_CMR'
});

const SLOT_BOOKING_MANAGEMENT_MODES = Object.freeze({
    CARRIER_MANAGED: 'CARRIER_MANAGED',
    SHIPPER_MANAGED: 'SHIPPER_MANAGED'
});

const STACKABILITY_HANDLING_MODES = Object.freeze({
    STRICT_LDM_NON_STACKABLE: 'STRICT_LDM_NON_STACKABLE',
    DOUBLE_DECK_SUPPORTED: 'DOUBLE_DECK_SUPPORTED',
    AUTO_STACK_AT_PRINTSHOP: 'AUTO_STACK_AT_PRINTSHOP'
});

/**
 * Authoritative Warehouse Delivery Profile Presets (DACH / EU Editorial Distribution & FBA).
 * Each profile encapsulates maximum pallet height, maximum pallet gross weight,
 * perimeter setback (retranqueo), carton ergonomic weight limit, and penalty fees.
 */
const BUILTIN_WAREHOUSE_PROFILES = Object.freeze({
    ZEITFRACHT_ERFURT: Object.freeze({
        profileCode: 'ZEITFRACHT_ERFURT',
        displayName: 'Zeitfracht Medien GmbH (Erfurt Book Logistics Hub)',
        gln: '4026635000006',
        countryCode: 'DE',
        palletStandard: 'EUR_EPAL_1200x800',
        palletFootprintLengthMm: 1200,
        palletFootprintWidthMm: 800,
        palletBaseHeightMm: 144,
        palletTareWeightKg: 25.0,
        maxTotalPalletHeightMm: 1200,
        maxGrossPalletWeightKg: 1000.0,
        maxCartonWeightKg: 15.0,
        minPerimeterSetbackMm: 30, // 3 cm retranqueo perimetral sin salientes
        maxOverhangMm: 0,
        requiresFlatTopLayer: false,
        requiresLoadingDock: true,
        allowsTailLift: false,
        requiresIsbnCartonLabel: true,
        requiresPalletContentSheet: true,
        penalties: Object.freeze({
            repalletizingFeePerPalletEur: 40.0,
            overweightCartonFeePerCartonEur: 12.0,
            unbookedSlotPenaltyEur: 128.0,
            nonCompliantLabelFeeEur: 25.0
        })
    }),
    ARVATO_VVA_GUETERSLOH: Object.freeze({
        profileCode: 'ARVATO_VVA_GUETERSLOH',
        displayName: 'VVA — Vereinigte Verlagsauslieferung (Arvato / Bertelsmann Gütersloh)',
        gln: '4002693000002',
        countryCode: 'DE',
        palletStandard: 'EUR_EPAL_1200x800',
        palletFootprintLengthMm: 1200,
        palletFootprintWidthMm: 800,
        palletBaseHeightMm: 144,
        palletTareWeightKg: 25.0,
        maxTotalPalletHeightMm: 1300,
        maxGrossPalletWeightKg: 700.0,
        maxCartonWeightKg: 16.0,
        minPerimeterSetbackMm: 20, // 2 cm retranqueo perimetral
        maxOverhangMm: 0,
        requiresFlatTopLayer: true, // Capa superior plana obligatoria para almacén robotizado
        requiresLoadingDock: true,
        allowsTailLift: false,
        requiresIsbnCartonLabel: true,
        requiresPalletContentSheet: true,
        penalties: Object.freeze({
            repalletizingFeePerPalletEur: 40.0,
            nonFlatTopLayerFeePerPalletEur: 35.0,
            overweightCartonFeePerCartonEur: 15.0,
            unbookedSlotPenaltyEur: 128.0
        })
    }),
    VVA_ARVATO_GUTERSLOH: Object.freeze({
        profileCode: 'VVA_ARVATO_GUTERSLOH',
        displayName: 'VVA — Vereinigte Verlagsauslieferung (Arvato / Bertelsmann Gütersloh)',
        gln: '4002693000002',
        countryCode: 'DE',
        palletStandard: 'EUR_EPAL_1200x800',
        palletFootprintLengthMm: 1200,
        palletFootprintWidthMm: 800,
        palletBaseHeightMm: 144,
        palletTareWeightKg: 25.0,
        maxTotalPalletHeightMm: 1300,
        maxGrossPalletWeightKg: 700.0,
        maxCartonWeightKg: 16.0,
        minPerimeterSetbackMm: 20,
        maxOverhangMm: 0,
        requiresFlatTopLayer: true,
        requiresLoadingDock: true,
        allowsTailLift: false,
        requiresIsbnCartonLabel: true,
        requiresPalletContentSheet: true,
        penalties: Object.freeze({
            repalletizingFeePerPalletEur: 40.0,
            nonFlatTopLayerFeePerPalletEur: 35.0,
            overweightCartonFeePerCartonEur: 15.0,
            unbookedSlotPenaltyEur: 128.0
        })
    }),
    AMAZON_EU_FBA_STD: Object.freeze({
        profileCode: 'AMAZON_EU_FBA_STD',
        displayName: 'Amazon EU FBA Fulfillment Center (Standard Pallet Delivery)',
        countryCode: 'EU',
        palletStandard: 'EUR_EPAL_1200x800',
        palletFootprintLengthMm: 1200,
        palletFootprintWidthMm: 800,
        palletBaseHeightMm: 144,
        palletTareWeightKg: 25.0,
        maxTotalPalletHeightMm: 1800,
        maxGrossPalletWeightKg: 500.0,
        maxCartonWeightKg: 15.0, // Límite estricto FBA sin etiqueta "Heavy Package"
        minPerimeterSetbackMm: 25,
        maxOverhangMm: 0,
        requiresFlatTopLayer: true,
        requiresLoadingDock: true,
        allowsTailLift: false,
        requiresIsbnCartonLabel: true,
        requiresPalletContentSheet: true,
        penalties: Object.freeze({
            repalletizingFeePerPalletEur: 50.0,
            overweightCartonFeePerCartonEur: 25.0,
            unbookedSlotPenaltyEur: 150.0
        })
    }),
    STANDARD_COMMERCIAL_DOCK: Object.freeze({
        profileCode: 'STANDARD_COMMERCIAL_DOCK',
        displayName: 'Standard Commercial / Editorial Warehouse (Loading Dock)',
        countryCode: 'EU',
        palletStandard: 'EUR_EPAL_1200x800',
        palletFootprintLengthMm: 1200,
        palletFootprintWidthMm: 800,
        palletBaseHeightMm: 144,
        palletTareWeightKg: 25.0,
        maxTotalPalletHeightMm: 1650,
        maxGrossPalletWeightKg: 950.0,
        maxCartonWeightKg: 16.0,
        minPerimeterSetbackMm: 15,
        maxOverhangMm: 0,
        requiresFlatTopLayer: false,
        requiresLoadingDock: true,
        allowsTailLift: true,
        requiresIsbnCartonLabel: false,
        requiresPalletContentSheet: true,
        penalties: Object.freeze({
            repalletizingFeePerPalletEur: 35.0,
            overweightCartonFeePerCartonEur: 10.0,
            unbookedSlotPenaltyEur: 90.0
        })
    }),
    TAIL_LIFT_STREET_DELIVERY: Object.freeze({
        profileCode: 'TAIL_LIFT_STREET_DELIVERY',
        displayName: 'Urban / Bookstore Delivery with Tail-Lift & Hand Pallet Jack',
        countryCode: 'EU',
        palletStandard: 'EUR_EPAL_1200x800',
        palletFootprintLengthMm: 1200,
        palletFootprintWidthMm: 800,
        palletBaseHeightMm: 144,
        palletTareWeightKg: 25.0,
        maxTotalPalletHeightMm: 1400,
        maxGrossPalletWeightKg: 650.0,
        maxCartonWeightKg: 14.0,
        minPerimeterSetbackMm: 20,
        maxOverhangMm: 0,
        requiresFlatTopLayer: false,
        requiresLoadingDock: false,
        allowsTailLift: true,
        requiresIsbnCartonLabel: false,
        requiresPalletContentSheet: true,
        penalties: Object.freeze({
            repalletizingFeePerPalletEur: 40.0,
            overweightCartonFeePerCartonEur: 12.0,
            unbookedSlotPenaltyEur: 75.0
        })
    })
});

/**
 * Standard corrugated double-wall FEFCO 0201 carton catalog for printhouses,
 * plus adaptive custom carton sizing when `cartonMode = 'AUTO_ADAPTIVE'`.
 */
const STANDARD_CARTON_CATALOG = Object.freeze([
    Object.freeze({
        cartonCode: 'FEFCO0201_SMALL_320x240x220',
        internalLengthMm: 320,
        internalWidthMm: 240,
        internalHeightMm: 220,
        wallThicknessMm: 6,
        tareWeightKg: 0.35,
        maxStructuralLoadKg: 18.0,
        unitCostEur: 0.95
    }),
    Object.freeze({
        cartonCode: 'FEFCO0201_A4_STD_380x270x260',
        internalLengthMm: 380,
        internalWidthMm: 270,
        internalHeightMm: 260,
        wallThicknessMm: 6,
        tareWeightKg: 0.42,
        maxStructuralLoadKg: 20.0,
        unitCostEur: 1.15
    }),
    Object.freeze({
        cartonCode: 'FEFCO0201_EURO_MOD_400x300x280',
        internalLengthMm: 400,
        internalWidthMm: 300,
        internalHeightMm: 280,
        wallThicknessMm: 7,
        tareWeightKg: 0.48,
        maxStructuralLoadKg: 22.0,
        unitCostEur: 1.30
    }),
    Object.freeze({
        cartonCode: 'FEFCO0201_LARGE_520x360x260',
        internalLengthMm: 520,
        internalWidthMm: 360,
        internalHeightMm: 260,
        wallThicknessMm: 7,
        tareWeightKg: 0.50,
        maxStructuralLoadKg: 22.0,
        unitCostEur: 1.55
    })
]);

/**
 * Resolves a warehouse profile from a code or custom override object.
 */
function resolveWarehouseProfile(warehouseProfileCode = 'ZEITFRACHT_ERFURT', customWarehouseProfile = null) {
    const base = BUILTIN_WAREHOUSE_PROFILES[warehouseProfileCode] || BUILTIN_WAREHOUSE_PROFILES.ZEITFRACHT_ERFURT;
    if (!customWarehouseProfile || typeof customWarehouseProfile !== 'object') {
        return base;
    }
    return Object.freeze({
        ...base,
        ...customWarehouseProfile,
        penalties: Object.freeze({
            ...base.penalties,
            ...(customWarehouseProfile.penalties || {})
        })
    });
}

/**
 * Resolves caliper_um from explicit caliperUm or (gsm * bulkFactor).
 */
function resolveSegmentCaliperUm(segment) {
    if (!segment || typeof segment !== 'object') return null;
    if (segment.caliperUm !== undefined && segment.caliperUm !== null && Number(segment.caliperUm) > 0) {
        return Number(segment.caliperUm);
    }
    const gsm = Number(segment.gsm || 0);
    const bulk = Number(segment.bulk || segment.bulkFactor || 0);
    if (gsm > 0 && bulk > 0) {
        return roundToPrecision(gsm * bulk, 4);
    }
    return null;
}

/**
 * STAGE 1: Pure function calculateUnitFinishedBookWeightAndDimensions
 *
 * Computes the exact net finished weight of a single bound copy:
 * - Interior trimmed block: sum((trimWidthMm * trimHeightMm * (pages_i / 2) * gsm_i) / 10^9) kg
 * - Softcover / Hardcover wrap cover: (netCoverWidthMm * netCoverHeightMm * gsm_cover) / 10^9 kg
 * - Hardcover greyboard (2 boards): (2 * boardWidthMm * boardHeightMm * boardThicknessMm * boardDensityGcm3) / 10^6 kg
 * - Hardcover endpapers (2 double-leaf endpapers = 4 leaves = 8 pages):
 *   (4 * trimWidthMm * trimHeightMm * endpapersGsm) / 10^9 kg
 * - Dust jacket (if enabled): (djNetWidthMm * boardHeightMm * djGsm) / 10^9 kg
 * - Binding adhesive / thread & headband allowance:
 *   glued ~ 1.5% of paper block weight, sewn ~ 2.0%, hardcover case glue + mull + headband ~ 2.5%
 *
 * Also computes external finished book bounding box (length L_book, width W_book, thickness T_book in mm).
 */
function calculateUnitFinishedBookWeightAndDimensions(input) {
    const trimWidthMm = Number(input.trimWidthMm || 0);
    const trimHeightMm = Number(input.trimHeightMm || 0);
    const bindingCategory = input.bindingCategory || 'SOFTCOVER_STANDARD';
    const processingType = input.processingType || 'SEWN';

    if (trimWidthMm <= 0 || trimHeightMm <= 0) {
        throw new Error('INVALID_BOOK_DIMENSIONS: trimWidthMm and trimHeightMm must be positive numbers.');
    }

    const rawSegments = Array.isArray(input.segments) && input.segments.length > 0
        ? input.segments
        : [
            {
                segmentIndex: 1,
                pages: Number(input.pages || 0),
                gsm: Number(input.interiorGsm || input.gsm || 0),
                bulk: Number(input.interiorBulk || input.bulk || 0),
                caliperUm: input.interiorCaliperUm || input.caliperUm || null,
                variantId: input.selectedVariantId || input.variantId || null
            }
        ];

    const normalizedSegments = rawSegments.map((seg, idx) => ({
        ...seg,
        segmentIndex: seg.segmentIndex || idx + 1,
        pages: Number(seg.pages || 0),
        gsm: Number(seg.gsm || 0),
        caliperUm: resolveSegmentCaliperUm(seg)
    }));

    const coverConfig = input.cover || {
        gsm: Number(input.coverGsm || (bindingCategory === 'HARDCOVER' ? 135 : 250)),
        caliperUm: Number(input.coverCaliperUm || (bindingCategory === 'HARDCOVER' ? 135 : 300)),
        flapWidthMm: Number(input.flapWidthMm || 0)
    };

    const hardcoverConfig = bindingCategory === 'HARDCOVER'
        ? {
            spineShape: (input.hardcover && input.hardcover.spineShape) || 'ROUND',
            boardThicknessMm: Number((input.hardcover && input.hardcover.boardThicknessMm) || input.boardThicknessMm || 2.5),
            boardDensityGcm3: Number((input.hardcover && input.hardcover.boardDensityGcm3) || 1.2),
            overhangMm: Number((input.hardcover && input.hardcover.overhangMm) || 2.5),
            endpapersMode: (input.hardcover && input.hardcover.endpapersMode) || 'SEPARATE',
            endpapersGsm: Number((input.hardcover && input.hardcover.endpapersGsm) || 140),
            blockPaperCoating: (input.hardcover && input.hardcover.blockPaperCoating) || 'UNCOATED',
            foldingSignaturePages: Number((input.hardcover && input.hardcover.foldingSignaturePages) || 16),
            dustJacket: (input.hardcover && input.hardcover.dustJacket) || null
        }
        : null;

    // Resolve spine and cover geometry via canonical Spine Engine if not pre-supplied
    let spineResult = input.spineCalculationResult || null;
    if (!spineResult) {
        // Note: Colibri profile restricts allowedBoardThicknessesMm to [1.0, 2.0, 2.4, 3.0] for validation,
        // while still computing exact geometry for any board thickness (e.g. 2.5 mm).
        spineResult = executeSpineCalculation({
            bindingCategory: bindingCategory === 'WIRE_O' || bindingCategory === 'SADDLE_STITCH'
                ? 'SOFTCOVER_STANDARD'
                : bindingCategory,
            processingType: bindingCategory === 'SADDLE_STITCH' ? 'GLUED' : processingType,
            trimWidthMm,
            trimHeightMm,
            segments: normalizedSegments,
            cover: coverConfig,
            hardcover: hardcoverConfig
        });
    }

    // 1. Interior trimmed paper weight: (W_mm * H_mm * (pages / 2) * gsm) / 10^9 kg
    let interiorWeightKg = 0;
    let totalPages = 0;
    const segmentWeightBreakdown = [];

    for (const seg of normalizedSegments) {
        const sheets = seg.pages / 2;
        const segWeightKg = roundToPrecision(
            (trimWidthMm * trimHeightMm * sheets * seg.gsm) / 1e9,
            6
        );
        interiorWeightKg = roundToPrecision(interiorWeightKg + segWeightKg, 6);
        totalPages += seg.pages;
        segmentWeightBreakdown.push({
            segmentIndex: seg.segmentIndex,
            pages: seg.pages,
            sheets,
            gsm: seg.gsm,
            caliperUm: seg.caliperUm,
            weightKg: segWeightKg
        });
    }

    // 2. Cover / Case-wrap weight
    const coverGsm = Number(coverConfig.gsm || (bindingCategory === 'HARDCOVER' ? 135 : 250));
    const coverGeo = spineResult.coverGeometry;
    const coverAreaWidthMm = bindingCategory === 'HARDCOVER'
        ? coverGeo.flatCoverWidthMm
        : coverGeo.netCoverWidthMm;
    const coverAreaHeightMm = bindingCategory === 'HARDCOVER'
        ? coverGeo.flatCoverHeightMm
        : coverGeo.netCoverHeightMm;

    const coverWeightKg = roundToPrecision(
        (coverAreaWidthMm * coverAreaHeightMm * coverGsm) / 1e9,
        6
    );

    // 3. Hardcover greyboard + endpapers + dust jacket weight
    let greyboardWeightKg = 0;
    let endpapersWeightKg = 0;
    let dustJacketWeightKg = 0;

    if (bindingCategory === 'HARDCOVER' && hardcoverConfig) {
        const boardWidthMm = Number(
            (coverGeo.panels && coverGeo.panels.boardWidthMm) || (trimWidthMm - 5)
        );
        const boardHeightMm = Number(
            (coverGeo.panels && coverGeo.panels.boardHeightMm) || (trimHeightMm + 5)
        );
        const boardThicknessMm = hardcoverConfig.boardThicknessMm;
        const boardDensityGcm3 = hardcoverConfig.boardDensityGcm3;

        // 2 boards (front + back):
        // Volume of 1 board in cm3 = (boardWidthMm * boardHeightMm * boardThicknessMm) / 1000
        // Mass of 2 boards in kg = (2 * boardWidthMm * boardHeightMm * boardThicknessMm * boardDensityGcm3) / 10^6
        greyboardWeightKg = roundToPrecision(
            (2 * boardWidthMm * boardHeightMm * boardThicknessMm * boardDensityGcm3) / 1e6,
            6
        );

        // Endpapers (front + back = 4 leaves of trimWidthMm * trimHeightMm)
        if (hardcoverConfig.endpapersMode !== 'NONE') {
            endpapersWeightKg = roundToPrecision(
                (4 * trimWidthMm * trimHeightMm * hardcoverConfig.endpapersGsm) / 1e9,
                6
            );
        }

        // Dust jacket if enabled
        if (hardcoverConfig.dustJacket && hardcoverConfig.dustJacket.enabled && coverGeo.dustJacket) {
            const djGsm = Number(hardcoverConfig.dustJacket.gsm || 150);
            dustJacketWeightKg = roundToPrecision(
                (coverGeo.dustJacket.netWidthMm * boardHeightMm * djGsm) / 1e9,
                6
            );
        }
    }

    // 4. Adhesive / sewing thread / mull allowance (optional, defaults to realistic bindery factor or 0 if pure paper requested)
    const includeBindingConsumablesFactor = input.includeBindingConsumablesWeight === true;
    const bindingConsumablesWeightKg = includeBindingConsumablesFactor
        ? roundToPrecision(interiorWeightKg * (bindingCategory === 'HARDCOVER' ? 0.02 : 0.012), 6)
        : 0;

    const unitNetWeightKg = roundToPrecision(
        interiorWeightKg +
        coverWeightKg +
        greyboardWeightKg +
        endpapersWeightKg +
        dustJacketWeightKg +
        bindingConsumablesWeightKg,
        6
    );

    // 5. External finished dimensions of the closed book (in mm)
    const rawSpineMm = Number(
        spineResult.rawFormulaSpineWidthMm ||
        spineResult.spineWidthMm ||
        spineResult.blockThickness.totalBlockWithEndpapersMm
    );

    let externalHeightMm = trimHeightMm;
    let externalWidthMm = trimWidthMm;
    let externalThicknessMm = rawSpineMm;

    if (bindingCategory === 'HARDCOVER' && hardcoverConfig) {
        const overhangMm = hardcoverConfig.overhangMm;
        externalHeightMm = roundToPrecision(trimHeightMm + 2 * overhangMm, 2);
        externalWidthMm = roundToPrecision(trimWidthMm + overhangMm + 3.5, 2); // Overhang + French joint / hinge projection
        const blockPlusBoardsMm = roundToPrecision(
            spineResult.blockThickness.totalBlockWithEndpapersMm + 2 * hardcoverConfig.boardThicknessMm + 1.0,
            2
        );
        externalThicknessMm = roundToPrecision(Math.max(rawSpineMm, blockPlusBoardsMm), 2);
    } else if (bindingCategory === 'SADDLE_STITCH') {
        const coverCaliperMm = (Number(coverConfig.caliperUm || 250) * 2) / 1000;
        externalThicknessMm = roundToPrecision(
            Math.max(1.0, spineResult.blockThickness.netPaperBlockMm + coverCaliperMm),
            2
        );
    }

    return {
        bindingCategory,
        processingType,
        totalPages,
        trimDimensionsMm: {
            widthMm: trimWidthMm,
            heightMm: trimHeightMm
        },
        externalFinishedDimensionsMm: {
            lengthMm: externalHeightMm, // Spine height (long edge)
            widthMm: externalWidthMm,   // Fore-edge width (short edge)
            thicknessMm: externalThicknessMm // Total closed thickness
        },
        spineGeometrySummary: {
            netPaperBlockMm: spineResult.blockThickness.netPaperBlockMm,
            totalBlockWithEndpapersMm: spineResult.blockThickness.totalBlockWithEndpapersMm,
            sewnSwellingBlockMm: spineResult.bindingAdjustment.sewnSwellingBlockMm,
            spineWidthMm: rawSpineMm
        },
        weightBreakdownKg: {
            interiorWeightKg,
            coverWeightKg,
            greyboardWeightKg,
            endpapersWeightKg,
            dustJacketWeightKg,
            bindingConsumablesWeightKg,
            unitNetWeightKg
        },
        segmentWeightBreakdown
    };
}

/**
 * Helper to estimate corrugated carton tare weight (0.35 kg - 0.50 kg) based on external dimensions.
 */
function estimateAdaptiveCartonTareWeightKg(externalLengthMm, externalWidthMm, externalHeightMm) {
    // Surface area of FEFCO 0201 carton including flaps: ~ 2 * (L*W + L*H + W*H) * 1.25 flap factor
    const areaM2 = (2 * (
        externalLengthMm * externalWidthMm +
        externalLengthMm * externalHeightMm +
        externalWidthMm * externalHeightMm
    ) * 1.25) / 1e6;
    // Double-wall BC flute ~ 0.68 kg/m2, clamped to [0.35, 0.50] kg per specification
    const rawTare = areaM2 * 0.68;
    return roundToPrecision(Math.min(0.50, Math.max(0.35, rawTare)), 3);
}

/**
 * STAGE 2: Pure function calculateOptimalCartonPacking
 *
 * Determines the optimal number of copies per carton and carton dimensions:
 * - Respects ergonomic/warehouse carton gross weight ceiling (`maxCartonWeightKg`, e.g., 15.0 kg).
 * - Evaluates both FLAT stacking (books lying flat in 1x1, 2x1, or 1x2 piles) and
 *   SPINE_EDGE standing orientation when requested or advantageous.
 * - Supports either adaptive tailor-made cartons (`AUTO_ADAPTIVE`) or selection from
 *   `STANDARD_CARTON_CATALOG`.
 */
function calculateOptimalCartonPacking(unitBook, warehouseProfile, packagingOptions = {}) {
    const unitWeightKg = unitBook.weightBreakdownKg.unitNetWeightKg;
    const bookL = unitBook.externalFinishedDimensionsMm.lengthMm;
    const bookW = unitBook.externalFinishedDimensionsMm.widthMm;
    const bookT = unitBook.externalFinishedDimensionsMm.thicknessMm;

    const maxCartonGrossWeightKg = Number(
        packagingOptions.maxCartonWeightKg !== undefined
            ? packagingOptions.maxCartonWeightKg
            : warehouseProfile.maxCartonWeightKg || 15.0
    );

    const requestedCartonMaxBooks = packagingOptions.requestedBooksPerCarton
        ? Number(packagingOptions.requestedBooksPerCarton)
        : null;

    const wallThicknessMm = Number(packagingOptions.cartonWallThicknessMm || 6); // 3mm per side = 6mm total per axis
    const internalClearanceMm = Number(packagingOptions.internalClearanceMm || 4); // 4mm easy-insertion clearance
    const maxCartonExternalHeightMm = Number(packagingOptions.maxCartonExternalHeightMm || 280);
    const maxCartonExternalLengthMm = Number(packagingOptions.maxCartonExternalLengthMm || 600);
    const maxCartonExternalWidthMm = Number(packagingOptions.maxCartonExternalWidthMm || 400);

    // Evaluate candidate packing configurations (stacks inside carton)
    // Priority is given to flat stacking (industry standard in bookbinding to prevent spine skew),
    // plus standing on edge (SPINE_EDGE) as candidate.
    const candidates = [
        // 1. Flat 2x1 (two piles side-by-side along width, very common for A5 / B5 formats)
        {
            orientation: 'FLAT_2X1_SIDE_BY_SIDE',
            stacksAlongLength: 1,
            stacksAlongWidth: 2,
            internalBaseLengthMm: bookL + internalClearanceMm,
            internalBaseWidthMm: 2 * bookW + internalClearanceMm,
            stackStepHeightMm: bookT,
            isFlatStacking: true
        },
        // 2. Flat 1x1 (single pile, ideal for large coffee-table or heavy hardcover formats)
        {
            orientation: 'FLAT_1X1_SINGLE_STACK',
            stacksAlongLength: 1,
            stacksAlongWidth: 1,
            internalBaseLengthMm: bookL + internalClearanceMm,
            internalBaseWidthMm: bookW + internalClearanceMm,
            stackStepHeightMm: bookT,
            isFlatStacking: true
        },
        // 3. Flat 2x2 (four piles for small pocket formats)
        {
            orientation: 'FLAT_2X2_QUAD_STACK',
            stacksAlongLength: 2,
            stacksAlongWidth: 2,
            internalBaseLengthMm: 2 * bookL + internalClearanceMm,
            internalBaseWidthMm: 2 * bookW + internalClearanceMm,
            stackStepHeightMm: bookT,
            isFlatStacking: true
        },
        // 4. Spine-Edge Vertical Row (books standing on bottom edge in a single row)
        {
            orientation: 'ON_EDGE_SINGLE_ROW',
            stacksAlongLength: 1,
            stacksAlongWidth: 1,
            internalBaseLengthMm: bookW + internalClearanceMm,
            internalBaseWidthMm: null, // Computed from books per row * bookT
            stackStepHeightMm: bookL,
            isFlatStacking: false
        }
    ];

    const validSolutions = [];

    for (const cand of candidates) {
        if (cand.isFlatStacking) {
            const stacksPerCarton = cand.stacksAlongLength * cand.stacksAlongWidth;
            const extLengthMm = roundToPrecision(cand.internalBaseLengthMm + 2 * wallThicknessMm, 1);
            const extWidthMm = roundToPrecision(cand.internalBaseWidthMm + 2 * wallThicknessMm, 1);

            const canonL = Math.max(extLengthMm, extWidthMm);
            const canonW = Math.min(extLengthMm, extWidthMm);

            if (canonL > maxCartonExternalLengthMm || canonW > maxCartonExternalWidthMm) {
                continue;
            }

            // Maximum books per stack by height limit
            const maxInternalHeightMm = maxCartonExternalHeightMm - 2 * wallThicknessMm - internalClearanceMm;
            const maxBooksPerStackByHeight = Math.max(1, Math.floor(maxInternalHeightMm / cand.stackStepHeightMm));

            // Estimate carton tare weight
            const approxTareKg = packagingOptions.cartonTareWeightKg !== undefined
                ? Number(packagingOptions.cartonTareWeightKg)
                : estimateAdaptiveCartonTareWeightKg(canonL, canonW, maxCartonExternalHeightMm);

            const maxNetBooksWeightKg = Math.max(unitWeightKg, maxCartonGrossWeightKg - approxTareKg);
            const maxTotalBooksByWeight = Math.max(1, Math.floor((maxNetBooksWeightKg + 1e-9) / unitWeightKg));
            const maxBooksPerStackByWeight = Math.floor(maxTotalBooksByWeight / stacksPerCarton);

            if (maxBooksPerStackByWeight < 1) {
                continue;
            }

            const booksPerStack = Math.min(maxBooksPerStackByHeight, maxBooksPerStackByWeight);
            const booksPerCarton = booksPerStack * stacksPerCarton;

            const internalHeightMm = roundToPrecision(booksPerStack * cand.stackStepHeightMm + internalClearanceMm, 1);
            const extHeightMm = roundToPrecision(internalHeightMm + 2 * wallThicknessMm, 1);

            const finalTareKg = packagingOptions.cartonTareWeightKg !== undefined
                ? Number(packagingOptions.cartonTareWeightKg)
                : estimateAdaptiveCartonTareWeightKg(canonL, canonW, extHeightMm);

            // Re-verify weight with exact tare
            let adjustedBooksPerStack = booksPerStack;
            while (
                adjustedBooksPerStack > 1 &&
                (adjustedBooksPerStack * stacksPerCarton * unitWeightKg + finalTareKg) > maxCartonGrossWeightKg + 1e-6
            ) {
                adjustedBooksPerStack -= 1;
            }

            const finalBooksPerCarton = adjustedBooksPerStack * stacksPerCarton;
            const finalInternalHeightMm = roundToPrecision(adjustedBooksPerStack * cand.stackStepHeightMm + internalClearanceMm, 1);
            const finalExtHeightMm = roundToPrecision(finalInternalHeightMm + 2 * wallThicknessMm, 1);
            const finalTareRecalcKg = packagingOptions.cartonTareWeightKg !== undefined
                ? Number(packagingOptions.cartonTareWeightKg)
                : estimateAdaptiveCartonTareWeightKg(canonL, canonW, finalExtHeightMm);

            const netBooksWeightKg = roundToPrecision(finalBooksPerCarton * unitWeightKg, 4);
            const grossCartonWeightKg = roundToPrecision(netBooksWeightKg + finalTareRecalcKg, 4);

            const booksTotalVolumeMm3 = finalBooksPerCarton * bookL * bookW * bookT;
            const cartonExternalVolumeMm3 = canonL * canonW * finalExtHeightMm;
            const volumeUtilizationRatio = roundToPrecision(booksTotalVolumeMm3 / cartonExternalVolumeMm3, 4);
            const weightUtilizationRatio = roundToPrecision(grossCartonWeightKg / maxCartonGrossWeightKg, 4);

            // Score favors high weight utilization (close to ergonomic limit ~12-15kg), flat stacking, and euro-pallet friendly footprint
            const score = (weightUtilizationRatio * 0.65) + (volumeUtilizationRatio * 0.35) + (stacksPerCarton === 2 ? 0.05 : 0);

            validSolutions.push({
                orientation: cand.orientation,
                isFlatStacking: true,
                stacksAlongLength: cand.stacksAlongLength,
                stacksAlongWidth: cand.stacksAlongWidth,
                booksPerStack: adjustedBooksPerStack,
                booksPerCarton: finalBooksPerCarton,
                internalDimensionsMm: {
                    lengthMm: Math.max(cand.internalBaseLengthMm, cand.internalBaseWidthMm),
                    widthMm: Math.min(cand.internalBaseLengthMm, cand.internalBaseWidthMm),
                    heightMm: finalInternalHeightMm
                },
                externalDimensionsMm: {
                    lengthMm: canonL,
                    widthMm: canonW,
                    heightMm: finalExtHeightMm
                },
                cartonTareWeightKg: finalTareRecalcKg,
                netBooksWeightKg,
                grossCartonWeightKg,
                maxCartonWeightAllowedKg: maxCartonGrossWeightKg,
                volumeUtilizationRatio,
                weightUtilizationRatio,
                score
            });
        } else {
            // Spine-edge vertical packing
            const extHeightMm = roundToPrecision(bookL + internalClearanceMm + 2 * wallThicknessMm, 1);
            if (extHeightMm <= maxCartonExternalHeightMm + 40) {
                const approxTareKg = packagingOptions.cartonTareWeightKg !== undefined
                    ? Number(packagingOptions.cartonTareWeightKg)
                    : 0.42;
                const maxByWeight = Math.max(1, Math.floor((maxCartonGrossWeightKg - approxTareKg) / unitWeightKg));
                const maxRowSpanMm = maxCartonExternalLengthMm - 2 * wallThicknessMm - internalClearanceMm;
                const maxBySpan = Math.max(1, Math.floor(maxRowSpanMm / bookT));
                const booksPerCarton = Math.min(maxByWeight, maxBySpan);

                const rowSpanMm = roundToPrecision(booksPerCarton * bookT + internalClearanceMm, 1);
                const baseWidthMm = roundToPrecision(bookW + internalClearanceMm, 1);
                const extL = roundToPrecision(Math.max(rowSpanMm, baseWidthMm) + 2 * wallThicknessMm, 1);
                const extW = roundToPrecision(Math.min(rowSpanMm, baseWidthMm) + 2 * wallThicknessMm, 1);

                if (extL <= maxCartonExternalLengthMm && extW <= maxCartonExternalWidthMm) {
                    const tareKg = packagingOptions.cartonTareWeightKg !== undefined
                        ? Number(packagingOptions.cartonTareWeightKg)
                        : estimateAdaptiveCartonTareWeightKg(extL, extW, extHeightMm);
                    const netBooksWeightKg = roundToPrecision(booksPerCarton * unitWeightKg, 4);
                    const grossCartonWeightKg = roundToPrecision(netBooksWeightKg + tareKg, 4);
                    if (grossCartonWeightKg <= maxCartonGrossWeightKg + 1e-6) {
                        const volumeUtilizationRatio = roundToPrecision(
                            (booksPerCarton * bookL * bookW * bookT) / (extL * extW * extHeightMm),
                            4
                        );
                        const weightUtilizationRatio = roundToPrecision(grossCartonWeightKg / maxCartonGrossWeightKg, 4);
                        validSolutions.push({
                            orientation: cand.orientation,
                            isFlatStacking: false,
                            stacksAlongLength: 1,
                            stacksAlongWidth: 1,
                            booksPerStack: booksPerCarton,
                            booksPerCarton,
                            internalDimensionsMm: {
                                lengthMm: Math.max(rowSpanMm, baseWidthMm),
                                widthMm: Math.min(rowSpanMm, baseWidthMm),
                                heightMm: roundToPrecision(bookL + internalClearanceMm, 1)
                            },
                            externalDimensionsMm: {
                                lengthMm: extL,
                                widthMm: extW,
                                heightMm: extHeightMm
                            },
                            cartonTareWeightKg: tareKg,
                            netBooksWeightKg,
                            grossCartonWeightKg,
                            maxCartonWeightAllowedKg: maxCartonGrossWeightKg,
                            volumeUtilizationRatio,
                            weightUtilizationRatio,
                            score: (weightUtilizationRatio * 0.55) + (volumeUtilizationRatio * 0.25) // Slightly penalized vs flat stacking
                        });
                    }
                }
            }
        }
    }

    if (validSolutions.length === 0) {
        // Fallback single-book carton if book itself is huge
        const extL = roundToPrecision(bookL + internalClearanceMm + 2 * wallThicknessMm, 1);
        const extW = roundToPrecision(bookW + internalClearanceMm + 2 * wallThicknessMm, 1);
        const extH = roundToPrecision(bookT + internalClearanceMm + 2 * wallThicknessMm, 1);
        const tareKg = estimateAdaptiveCartonTareWeightKg(extL, extW, extH);
        validSolutions.push({
            orientation: 'FLAT_1X1_SINGLE_BOOK_FALLBACK',
            isFlatStacking: true,
            stacksAlongLength: 1,
            stacksAlongWidth: 1,
            booksPerStack: 1,
            booksPerCarton: 1,
            internalDimensionsMm: {
                lengthMm: bookL + internalClearanceMm,
                widthMm: bookW + internalClearanceMm,
                heightMm: bookT + internalClearanceMm
            },
            externalDimensionsMm: {
                lengthMm: extL,
                widthMm: extW,
                heightMm: extH
            },
            cartonTareWeightKg: tareKg,
            netBooksWeightKg: unitWeightKg,
            grossCartonWeightKg: roundToPrecision(unitWeightKg + tareKg, 4),
            maxCartonWeightAllowedKg: maxCartonGrossWeightKg,
            volumeUtilizationRatio: 0.75,
            weightUtilizationRatio: roundToPrecision((unitWeightKg + tareKg) / maxCartonGrossWeightKg, 4),
            score: 0.5
        });
    }

    validSolutions.sort((a, b) => b.score - a.score);
    const best = validSolutions[0];

    // Check if the caller tried to force a `requestedBooksPerCarton` that would exceed `maxCartonGrossWeightKg`
    let autoAdjustedForOverweight = false;
    let requestedCartonGrossWeightKg = null;
    if (requestedCartonMaxBooks !== null && requestedCartonMaxBooks > best.booksPerCarton) {
        requestedCartonGrossWeightKg = roundToPrecision(
            requestedCartonMaxBooks * unitWeightKg + best.cartonTareWeightKg,
            4
        );
        if (requestedCartonGrossWeightKg > maxCartonGrossWeightKg) {
            autoAdjustedForOverweight = true;
        }
    }

    return {
        ...best,
        requestedBooksPerCarton: requestedCartonMaxBooks,
        requestedCartonGrossWeightKg,
        autoAdjustedForOverweight,
        alternativeOrientationsEvaluated: validSolutions.length
    };
}

/**
 * STAGE 3: Pure function calculateEuroPalletTilingAndStacking
 *
 * Computes the optimal 2D layer tiling on a Euro-Pallet (1200 x 800 mm)
 * with perimeter setback (`minPerimeterSetbackMm`, e.g. 30 mm for Zeitfracht Erfurt -> 1140 x 740 mm usable area),
 * evaluating:
 * - Orthogonal Orientation A (carton L along pallet L, carton W along pallet W)
 * - Orthogonal Orientation B (carton W along pallet L, carton L along pallet W)
 * - Pinwheel / Interlocked Mixed Split along pallet Length (k rows in Orientation A + m rows in Orientation B)
 * - Pinwheel / Interlocked Mixed Split along pallet Width
 *
 * Then computes the maximum admissible layers per pallet by dual ceiling:
 * - Height ceiling: floor((H_max - H_pallet_base) / H_carton)
 * - Weight ceiling: floor((W_max - W_pallet_tare) / W_layer)
 */
function calculateEuroPalletTilingAndStacking(cartonPacking, warehouseProfile, totalOrderQuantity = null) {
    const palletLengthMm = Number(warehouseProfile.palletFootprintLengthMm || 1200);
    const palletWidthMm = Number(warehouseProfile.palletFootprintWidthMm || 800);
    const setbackMm = Number(warehouseProfile.minPerimeterSetbackMm || 0);
    const overhangMm = Number(warehouseProfile.maxOverhangMm || 0);

    // Usable deck footprint after applying perimeter setback on all 4 sides:
    // L_usable = 1200 - 2 * setback + 2 * overhang
    // W_usable = 800 - 2 * setback + 2 * overhang
    const usableLengthMm = Math.max(200, palletLengthMm - 2 * setbackMm + 2 * overhangMm);
    const usableWidthMm = Math.max(200, palletWidthMm - 2 * setbackMm + 2 * overhangMm);

    const cL = cartonPacking.externalDimensionsMm.lengthMm;
    const cW = cartonPacking.externalDimensionsMm.widthMm;
    const cH = cartonPacking.externalDimensionsMm.heightMm;

    // 1. Orthogonal A (L || L_usable, W || W_usable)
    const orthoA_nx = Math.floor(usableLengthMm / cL);
    const orthoA_ny = Math.floor(usableWidthMm / cW);
    const orthoACount = orthoA_nx * orthoA_ny;

    // 2. Orthogonal B (W || L_usable, L || W_usable)
    const orthoB_nx = Math.floor(usableLengthMm / cW);
    const orthoB_ny = Math.floor(usableWidthMm / cL);
    const orthoBCount = orthoB_nx * orthoB_ny;

    let bestTiling = {
        patternType: orthoACount >= orthoBCount ? 'ORTHOGONAL_A' : 'ORTHOGONAL_B',
        cartonsPerLayer: Math.max(orthoACount, orthoBCount),
        primaryRows: orthoACount >= orthoBCount ? orthoA_nx : orthoB_nx,
        primaryCols: orthoACount >= orthoBCount ? orthoA_ny : orthoB_ny,
        secondaryRows: 0,
        secondaryCols: 0,
        occupiedLengthMm: orthoACount >= orthoBCount
            ? roundToPrecision(orthoA_nx * cL, 1)
            : roundToPrecision(orthoB_nx * cW, 1),
        occupiedWidthMm: orthoACount >= orthoBCount
            ? roundToPrecision(orthoA_ny * cW, 1)
            : roundToPrecision(orthoB_ny * cL, 1)
    };

    // 3. Interlocked Split along Length: i columns of cL (each holding floor(usableW / cW))
    //    + remaining length filled with columns of cW (each holding floor(usableW / cL))
    for (let i = 1; i <= orthoA_nx; i++) {
        const usedL = i * cL;
        const remL = usableLengthMm - usedL;
        const j = Math.floor(remL / cW);
        if (j > 0 && orthoB_ny > 0) {
            const count = (i * orthoA_ny) + (j * orthoB_ny);
            if (count > bestTiling.cartonsPerLayer) {
                bestTiling = {
                    patternType: 'INTERLOCKED_PINWHEEL_LENGTH',
                    cartonsPerLayer: count,
                    primaryRows: i,
                    primaryCols: orthoA_ny,
                    secondaryRows: j,
                    secondaryCols: orthoB_ny,
                    occupiedLengthMm: roundToPrecision(i * cL + j * cW, 1),
                    occupiedWidthMm: roundToPrecision(Math.max(orthoA_ny * cW, orthoB_ny * cL), 1)
                };
            }
        }
    }

    // 4. Interlocked Split along Width: i rows of cW along width + j rows of cL along width
    for (let i = 1; i <= orthoA_ny; i++) {
        const usedW = i * cW;
        const remW = usableWidthMm - usedW;
        const j = Math.floor(remW / cL);
        if (j > 0 && orthoB_nx > 0) {
            const count = (i * orthoA_nx) + (j * orthoB_nx);
            if (count > bestTiling.cartonsPerLayer) {
                bestTiling = {
                    patternType: 'INTERLOCKED_PINWHEEL_WIDTH',
                    cartonsPerLayer: count,
                    primaryRows: orthoA_nx,
                    primaryCols: i,
                    secondaryRows: orthoB_nx,
                    secondaryCols: j,
                    occupiedLengthMm: roundToPrecision(Math.max(orthoA_nx * cL, orthoB_nx * cW), 1),
                    occupiedWidthMm: roundToPrecision(i * cW + j * cL, 1)
                };
            }
        }
    }

    // Ensure at least 1 carton per layer even for oversized formats
    const cartonsPerLayer = Math.max(1, bestTiling.cartonsPerLayer);
    const areaUtilizationRatio = roundToPrecision(
        (cartonsPerLayer * cL * cW) / (usableLengthMm * usableWidthMm),
        4
    );

    // Dual Ceiling Layer Calculation:
    // Min( floor((H_max - H_pallet) / H_carton), floor((W_max - W_pallet) / W_layer) )
    const palletBaseHeightMm = Number(warehouseProfile.palletBaseHeightMm || 144);
    const palletTareWeightKg = Number(warehouseProfile.palletTareWeightKg || 25.0);
    const maxTotalPalletHeightMm = Number(warehouseProfile.maxTotalPalletHeightMm || 1200);
    const maxGrossPalletWeightKg = Number(warehouseProfile.maxGrossPalletWeightKg || 1000.0);

    const layerGrossWeightKg = roundToPrecision(
        cartonsPerLayer * cartonPacking.grossCartonWeightKg,
        4
    );

    const maxLayersByHeight = Math.max(
        1,
        Math.floor((maxTotalPalletHeightMm - palletBaseHeightMm) / cH)
    );
    const maxLayersByWeight = Math.max(
        1,
        Math.floor((maxGrossPalletWeightKg - palletTareWeightKg) / layerGrossWeightKg)
    );

    const maxAdmissibleLayers = Math.min(maxLayersByHeight, maxLayersByWeight);
    const limitingConstraint = maxLayersByHeight <= maxLayersByWeight ? 'HEIGHT_LIMIT' : 'WEIGHT_LIMIT';

    const maxCartonsPerFullPallet = cartonsPerLayer * maxAdmissibleLayers;
    const maxBooksPerFullPallet = maxCartonsPerFullPallet * cartonPacking.booksPerCarton;

    const fullPalletTotalHeightMm = roundToPrecision(
        palletBaseHeightMm + maxAdmissibleLayers * cH,
        1
    );
    const fullPalletGrossWeightKg = roundToPrecision(
        palletTareWeightKg + maxAdmissibleLayers * layerGrossWeightKg,
        3
    );
    const fullPalletNetBooksWeightKg = roundToPrecision(
        maxCartonsPerFullPallet * cartonPacking.netBooksWeightKg,
        3
    );

    // If an order quantity Q is provided, compute exact pallet fleet breakdown
    let orderBreakdown = null;
    if (totalOrderQuantity !== null && Number(totalOrderQuantity) > 0) {
        const Q = Math.ceil(Number(totalOrderQuantity));
        const totalCartonsRequired = Math.ceil(Q / cartonPacking.booksPerCarton);
        const totalPalletsRequired = Math.ceil(totalCartonsRequired / maxCartonsPerFullPallet);
        const fullPalletsCount = Math.floor(totalCartonsRequired / maxCartonsPerFullPallet);
        const remainingCartonsOnLastPallet = totalCartonsRequired - (fullPalletsCount * maxCartonsPerFullPallet);

        const lastPalletCartons = remainingCartonsOnLastPallet === 0
            ? maxCartonsPerFullPallet
            : remainingCartonsOnLastPallet;

        const lastPalletLayers = Math.ceil(lastPalletCartons / cartonsPerLayer);
        const lastPalletTopLayerCartons = lastPalletCartons - ((lastPalletLayers - 1) * cartonsPerLayer);
        const isLastPalletTopLayerFlat = lastPalletTopLayerCartons === cartonsPerLayer;

        const lastPalletTotalHeightMm = roundToPrecision(
            palletBaseHeightMm + lastPalletLayers * cH,
            1
        );
        const lastPalletGrossWeightKg = roundToPrecision(
            palletTareWeightKg + (lastPalletCartons * cartonPacking.grossCartonWeightKg),
            3
        );

        const totalShipmentGrossWeightKg = roundToPrecision(
            (totalCartonsRequired * cartonPacking.grossCartonWeightKg) + (totalPalletsRequired * palletTareWeightKg),
            3
        );

        orderBreakdown = {
            requestedQuantity: Q,
            totalCartonsRequired,
            totalPalletsRequired,
            fullPalletsCount: remainingCartonsOnLastPallet === 0 ? totalPalletsRequired : fullPalletsCount,
            hasPartialLastPallet: remainingCartonsOnLastPallet > 0,
            lastPallet: {
                cartonsCount: lastPalletCartons,
                booksCount: Q - ((totalPalletsRequired - 1) * maxBooksPerFullPallet),
                layersCount: lastPalletLayers,
                topLayerCartonsCount: lastPalletTopLayerCartons,
                isTopLayerFlat: isLastPalletTopLayerFlat,
                totalHeightMm: lastPalletTotalHeightMm,
                grossWeightKg: lastPalletGrossWeightKg,
                heightUtilizationRatio: roundToPrecision(lastPalletTotalHeightMm / maxTotalPalletHeightMm, 4),
                weightUtilizationRatio: roundToPrecision(lastPalletGrossWeightKg / maxGrossPalletWeightKg, 4),
                capacityUtilizationRatio: roundToPrecision(lastPalletCartons / maxCartonsPerFullPallet, 4)
            },
            totalShipmentGrossWeightKg
        };
    }

    return {
        palletStandard: warehouseProfile.palletStandard,
        palletFootprintMm: {
            lengthMm: palletLengthMm,
            widthMm: palletWidthMm,
            perimeterSetbackMm: setbackMm,
            usableLengthMm,
            usableWidthMm
        },
        palletBaseHeightMm,
        palletTareWeightKg,
        layerTiling: {
            ...bestTiling,
            areaUtilizationRatio
        },
        layerGrossWeightKg,
        booksPerLayer: cartonsPerLayer * cartonPacking.booksPerCarton,
        constraintsCeiling: {
            maxTotalPalletHeightAllowedMm: maxTotalPalletHeightMm,
            maxGrossPalletWeightAllowedKg: maxGrossPalletWeightKg,
            maxLayersByHeight,
            maxLayersByWeight,
            maxAdmissibleLayers,
            limitingConstraint
        },
        fullPalletSpecs: {
            cartonsPerFullPallet: maxCartonsPerFullPallet,
            booksPerFullPallet: maxBooksPerFullPallet,
            layersPerFullPallet: maxAdmissibleLayers,
            totalHeightMm: fullPalletTotalHeightMm,
            netBooksWeightKg: fullPalletNetBooksWeightKg,
            grossWeightKg: fullPalletGrossWeightKg,
            heightUtilizationRatio: roundToPrecision(fullPalletTotalHeightMm / maxTotalPalletHeightMm, 4),
            weightUtilizationRatio: roundToPrecision(fullPalletGrossWeightKg / maxGrossPalletWeightKg, 4)
        },
        orderBreakdown
    };
}

/**
 * STAGE 4: Pure function validateWarehouseDeliveryConstraints
 *
 * Audits the computed carton packing, pallet specs, and caller overrides against
 * the destination warehouse profile (`ZEITFRACHT_ERFURT`, `ARVATO_VVA_GUETERSLOH`, `AMAZON_EU_FBA_STD`, etc.)
 * and surfaces potential financial penalties (e.g., €40/pallet repalletizing, €128 unbooked slot).
 */
function validateWarehouseDeliveryConstraints(
    warehouseProfile,
    cartonPacking,
    palletStacking,
    deliveryContext = {}
) {
    const warnings = [];
    const violations = [];
    const potentialPenalties = [];

    const totalPallets = palletStacking.orderBreakdown
        ? palletStacking.orderBreakdown.totalPalletsRequired
        : 1;
    const totalCartons = palletStacking.orderBreakdown
        ? palletStacking.orderBreakdown.totalCartonsRequired
        : palletStacking.fullPalletSpecs.cartonsPerFullPallet;

    // 1. Check if caller forced a pallet height or layers exceeding warehouse H_max
    const effectivePalletHeightMm = Number(
        deliveryContext.forcedPalletHeightMm || palletStacking.fullPalletSpecs.totalHeightMm
    );
    if (effectivePalletHeightMm > warehouseProfile.maxTotalPalletHeightMm) {
        const feePerPallet = Number(warehouseProfile.penalties.repalletizingFeePerPalletEur || 40.0);
        const totalFee = roundToPrecision(feePerPallet * totalPallets, 2);
        violations.push({
            code: 'PALLET_HEIGHT_EXCEEDS_WAREHOUSE_MAX',
            severity: 'ERROR',
            message: `Pallet height (${effectivePalletHeightMm} mm) exceeds ${warehouseProfile.profileCode} maximum allowed height of ${warehouseProfile.maxTotalPalletHeightMm} mm.`
        });
        potentialPenalties.push({
            code: 'OVERSIZED_PALLET_REPALLETIZING_FEE',
            unitFeeEur: feePerPallet,
            affectedUnits: totalPallets,
            totalPenaltyEur: totalFee,
            description: `Repalletizing surcharge (€${feePerPallet.toFixed(2)}/pallet) for exceeding ${warehouseProfile.maxTotalPalletHeightMm} mm height limit.`
        });
    }

    // 2. Check if caller forced a pallet weight exceeding warehouse W_max
    const effectivePalletWeightKg = Number(
        deliveryContext.forcedPalletGrossWeightKg || palletStacking.fullPalletSpecs.grossWeightKg
    );
    if (effectivePalletWeightKg > warehouseProfile.maxGrossPalletWeightKg) {
        const feePerPallet = Number(warehouseProfile.penalties.repalletizingFeePerPalletEur || 40.0);
        const totalFee = roundToPrecision(feePerPallet * totalPallets, 2);
        violations.push({
            code: 'PALLET_WEIGHT_EXCEEDS_WAREHOUSE_MAX',
            severity: 'ERROR',
            message: `Pallet gross weight (${effectivePalletWeightKg} kg) exceeds ${warehouseProfile.profileCode} maximum allowed weight of ${warehouseProfile.maxGrossPalletWeightKg} kg.`
        });
        potentialPenalties.push({
            code: 'OVERWEIGHT_PALLET_REPALLETIZING_FEE',
            unitFeeEur: feePerPallet,
            affectedUnits: totalPallets,
            totalPenaltyEur: totalFee,
            description: `Repalletizing surcharge (€${feePerPallet.toFixed(2)}/pallet) for exceeding ${warehouseProfile.maxGrossPalletWeightKg} kg weight limit.`
        });
    }

    // 3. Check carton weight vs warehouse limit (including auto-adjustment notice)
    if (cartonPacking.autoAdjustedForOverweight) {
        warnings.push({
            code: 'CARTON_BOOKS_AUTO_REDUCED_FOR_WEIGHT_LIMIT',
            severity: 'WARNING',
            message: `Requested ${cartonPacking.requestedBooksPerCarton} books/carton (${cartonPacking.requestedCartonGrossWeightKg} kg) exceeded max carton weight (${warehouseProfile.maxCartonWeightKg} kg). Auto-adjusted to ${cartonPacking.booksPerCarton} books/carton (${cartonPacking.grossCartonWeightKg} kg).`
        });
    }
    if (cartonPacking.grossCartonWeightKg > warehouseProfile.maxCartonWeightKg + 1e-6) {
        const feePerCarton = Number(warehouseProfile.penalties.overweightCartonFeePerCartonEur || 12.0);
        violations.push({
            code: 'CARTON_WEIGHT_EXCEEDS_ERGONOMIC_MAX',
            severity: 'ERROR',
            message: `Carton gross weight (${cartonPacking.grossCartonWeightKg} kg) exceeds ${warehouseProfile.profileCode} ergonomic limit of ${warehouseProfile.maxCartonWeightKg} kg.`
        });
        potentialPenalties.push({
            code: 'OVERWEIGHT_CARTON_HANDLING_PENALTY',
            unitFeeEur: feePerCarton,
            affectedUnits: totalCartons,
            totalPenaltyEur: roundToPrecision(feePerCarton * totalCartons, 2),
            description: `Manual handling penalty (€${feePerCarton.toFixed(2)}/carton) for exceeding ${warehouseProfile.maxCartonWeightKg} kg.`
        });
    }

    // 4. Check flat top layer requirement (e.g., Arvato VVA Gütersloh / Amazon EU FBA)
    if (
        warehouseProfile.requiresFlatTopLayer &&
        palletStacking.orderBreakdown &&
        !palletStacking.orderBreakdown.lastPallet.isTopLayerFlat
    ) {
        const fee = Number(
            warehouseProfile.penalties.nonFlatTopLayerFeePerPalletEur ||
            warehouseProfile.penalties.repalletizingFeePerPalletEur ||
            35.0
        );
        warnings.push({
            code: 'NON_FLAT_TOP_LAYER_ON_LAST_PALLET',
            severity: 'WARNING',
            message: `${warehouseProfile.profileCode} requires a completely flat top layer (${palletStacking.layerTiling.cartonsPerLayer} cartons/layer), but last pallet top layer has ${palletStacking.orderBreakdown.lastPallet.topLayerCartonsCount} cartons. Fill void with empty dummy cartons or adjust run quantity.`
        });
        potentialPenalties.push({
            code: 'NON_FLAT_TOP_LAYER_SURCHARGE',
            unitFeeEur: fee,
            affectedUnits: 1,
            totalPenaltyEur: fee,
            description: `Surcharge for incomplete top layer on last pallet at ${warehouseProfile.displayName} (avoidable via dummy cartons or layer-aligned run adjustment).`
        });
    }

    // 5. Check time-slot booking requirement (Mercareon / Cargoclix slot reservation)
    if (deliveryContext.timeSlotBooked === false) {
        const unbookedFee = Number(warehouseProfile.penalties.unbookedSlotPenaltyEur || 128.0);
        warnings.push({
            code: 'UNBOOKED_DELIVERY_TIME_SLOT',
            severity: 'WARNING',
            message: `Delivery to ${warehouseProfile.displayName} without a pre-booked ramp slot incurs a €${unbookedFee.toFixed(2)} penalty and potential refusal.`
        });
        potentialPenalties.push({
            code: 'UNBOOKED_RAMP_SLOT_PENALTY',
            unitFeeEur: unbookedFee,
            affectedUnits: 1,
            totalPenaltyEur: unbookedFee,
            description: `Penalty for delivery without pre-booked Mercareon/Cargoclix dock slot (€${unbookedFee.toFixed(2)}).`
        });
    }

    const totalPotentialPenaltyEur = roundToPrecision(
        potentialPenalties.reduce((acc, p) => acc + p.totalPenaltyEur, 0),
        2
    );

    return {
        warehouseProfileCode: warehouseProfile.profileCode,
        warehouseDisplayName: warehouseProfile.displayName,
        isCompliant: violations.length === 0,
        violations,
        warnings,
        potentialPenalties,
        totalPotentialPenaltyEur
    };
}

/**
 * STAGE 5: Pure function calculateFullPalletRunOptimization
 *
 * For a requested print run Q:
 * - Computes exact copies on the last pallet.
 * - Computes Delta Q- (reducing the order to N-1 exact full pallets, when N > 1)
 * - Computes Delta Q+ (increasing the order to complete the last pallet to 100% capacity)
 * - Computes Delta Q_layer+ (increasing the order just enough to complete a flat top layer on the last pallet)
 * - Returns volumetric and weight efficiency ratios before and after optimization.
 */
function calculateFullPalletRunOptimization(requestedQuantity, cartonPacking, palletStacking) {
    const Q = Math.max(1, Math.ceil(Number(requestedQuantity || 1)));
    const booksPerCarton = cartonPacking.booksPerCarton;
    const cartonsPerLayer = palletStacking.layerTiling.cartonsPerLayer;
    const booksPerLayer = palletStacking.booksPerLayer;
    const booksPerFullPallet = palletStacking.fullPalletSpecs.booksPerFullPallet;
    const cartonsPerFullPallet = palletStacking.fullPalletSpecs.cartonsPerFullPallet;

    const totalPallets = Math.ceil(Q / booksPerFullPallet);
    const fullPalletsBeforeLast = Math.floor(Q / booksPerFullPallet);
    const booksOnLastPallet = Q - (fullPalletsBeforeLast * booksPerFullPallet);

    const isAlreadyExactFullPallet = booksOnLastPallet === 0;
    const effectiveBooksOnLastPallet = isAlreadyExactFullPallet ? booksPerFullPallet : booksOnLastPallet;

    // Delta Q- (Reduce to N full pallets if Q > booksPerFullPallet)
    const canReduceToFullPallets = !isAlreadyExactFullPallet && fullPalletsBeforeLast >= 1;
    const deltaQMinus = canReduceToFullPallets ? -booksOnLastPallet : 0;
    const recommendedQuantityMinus = canReduceToFullPallets ? fullPalletsBeforeLast * booksPerFullPallet : null;

    // Delta Q+ (Increase to fill the last pallet to 100% capacity)
    const deltaQPlus = isAlreadyExactFullPallet
        ? 0
        : (totalPallets * booksPerFullPallet) - Q;
    const recommendedQuantityPlus = isAlreadyExactFullPallet
        ? Q
        : totalPallets * booksPerFullPallet;

    // Delta Q_flat_layer+ (Minimum extra books to achieve a flat top layer on the last pallet)
    const currentCartonsRequired = Math.ceil(Q / booksPerCarton);
    const cartonsInFullLayers = Math.ceil(currentCartonsRequired / cartonsPerLayer) * cartonsPerLayer;
    const recommendedQuantityFlatLayer = cartonsInFullLayers * booksPerCarton;
    const deltaQFlatLayerPlus = recommendedQuantityFlatLayer - Q;

    // Fleet-wide Volumetric & Weight Efficiency Ratios for Requested Q
    const maxPalletHeightMm = palletStacking.constraintsCeiling.maxTotalPalletHeightAllowedMm;
    const maxPalletWeightKg = palletStacking.constraintsCeiling.maxGrossPalletWeightAllowedKg;

    const totalBooksCapacityAcrossFleet = totalPallets * booksPerFullPallet;
    const fleetCapacityUtilizationRatio = roundToPrecision(Q / totalBooksCapacityAcrossFleet, 4);

    const lastPalletCapacityRatio = roundToPrecision(
        effectiveBooksOnLastPallet / booksPerFullPallet,
        4
    );

    const lastPalletHeightMm = palletStacking.orderBreakdown
        ? palletStacking.orderBreakdown.lastPallet.totalHeightMm
        : palletStacking.fullPalletSpecs.totalHeightMm;
    const lastPalletGrossWeightKg = palletStacking.orderBreakdown
        ? palletStacking.orderBreakdown.lastPallet.grossWeightKg
        : palletStacking.fullPalletSpecs.grossWeightKg;

    const fleetVolumetricEfficiencyRatio = roundToPrecision(
        ((fullPalletsBeforeLast * palletStacking.fullPalletSpecs.totalHeightMm) +
            (isAlreadyExactFullPallet ? 0 : lastPalletHeightMm)) /
        (totalPallets * maxPalletHeightMm),
        4
    );

    const fleetWeightEfficiencyRatio = roundToPrecision(
        ((fullPalletsBeforeLast * palletStacking.fullPalletSpecs.grossWeightKg) +
            (isAlreadyExactFullPallet ? 0 : lastPalletGrossWeightKg)) /
        (totalPallets * maxPalletWeightKg),
        4
    );

    return {
        requestedQuantity: Q,
        booksPerCarton,
        booksPerLayer,
        booksPerFullPallet,
        cartonsPerFullPallet,
        isAlreadyExactFullPallet,
        lastPalletBooksCount: effectiveBooksOnLastPallet,
        lastPalletCapacityUtilizationRatio: lastPalletCapacityRatio,
        fleetEfficiency: {
            totalPalletsBilled: totalPallets,
            fleetCapacityUtilizationRatio,
            fleetVolumetricEfficiencyRatio,
            fleetWeightEfficiencyRatio
        },
        recommendations: {
            reduceToFullPallets: {
                available: canReduceToFullPallets,
                deltaBooks: deltaQMinus,
                targetQuantity: recommendedQuantityMinus,
                targetPalletsCount: canReduceToFullPallets ? fullPalletsBeforeLast : null,
                palletsSaved: canReduceToFullPallets ? 1 : 0,
                percentageChange: canReduceToFullPallets
                    ? roundToPrecision((deltaQMinus / Q) * 100, 2)
                    : 0
            },
            expandToFullPallets: {
                available: !isAlreadyExactFullPallet,
                deltaBooks: deltaQPlus,
                targetQuantity: recommendedQuantityPlus,
                targetPalletsCount: totalPallets,
                extraFreightPalletsIncurred: 0,
                percentageChange: roundToPrecision((deltaQPlus / Q) * 100, 2),
                targetFleetCapacityUtilizationRatio: 1.0
            },
            alignToFlatTopLayer: {
                available: deltaQFlatLayerPlus > 0,
                deltaBooks: deltaQFlatLayerPlus,
                targetQuantity: recommendedQuantityFlatLayer
            }
        }
    };
}

/**
 * STAGE 6 (Phase 198B — LOGISTICS-04): Pure function calculateOperationalShippingScenarios
 *
 * Models the three key LTL/FTL operational bifurcations:
 * 1. Stackability, Floor Positions & Taxable Weight (LDM vs. Double-Deck vs. Plant Auto-Stack):
 *    - `STRICT_LDM_NON_STACKABLE`:
 *      Each floor position occupies 0.4 LDM (1200x800mm Euro-Pallet on a 2.4m trailer).
 *      `taxableWeightKg = Max(grossWeightKg, ldmTotal * ldmTaxableWeightRatioKg)` (default 1850 kg/LDM -> 740 kg/pallet).
 *    - `DOUBLE_DECK_SUPPORTED`:
 *      Carrier uses double-deck trailers (Doppelstock horizontal beams). Billed by standard pallet floor positions
 *      and actual scale gross weight without non-stackable LDM surcharge.
 *    - `AUTO_STACK_AT_PRINTSHOP`:
 *      Evaluates whether physical pallets are half-pallets eligible for 2-by-2 stacking at the printshop
 *      before dispatch (`palletTotalHeightMm <= (maxTotalPalletHeightMm + palletBaseHeightMm) / 2` or
 *      `cargoHeightMm <= (maxTotalPalletHeightMm - palletBaseHeightMm) / 2`, e.g. <= 600mm total height for a 1200mm ceiling,
 *      with flat top layers / rigid caps). When eligible, pairs of half-pallets consolidate into 1 floor position
 *      (`floorPositionsUsed = ceil(palletCount / 2)`, `ldmTotal = floorPositionsUsed * 0.4`).
 *
 * 2. Delivery Time-Slot Booking Governance (48h Advance Notice):
 *    - `CARRIER_MANAGED`:
 *      Regional destination hub (e.g. Dachser Erfurt) books the slot with the warehouse and consolidates trucks.
 *      Adds `carrierSlotBufferDays` (default +2 business days) to standard transit lead time.
 *    - `SHIPPER_MANAGED`:
 *      Direct / FTL or shipper-booked delivery where the printhouse/platform must request the `Slot-Nummer`
 *      at least `slotBookingLeadTimeHours` (48h) before unloading. Generates `slotBookingRequirement` /
 *      `slotBookingActionPlan` with deadline and pre-filled email/portal notice payload.
 *
 * 3. Dual Tracking & GS1-128 / SSCC (NVE) Protocol:
 *    - `CARRIER_API`:
 *      Automated REST/EDI/Webhook consignment creation and 4-milestone event ingestion
 *      (`PICKED_UP_AT_PRINTSHOP`, `IN_TRANSIT_HUB`, `OUT_FOR_DELIVERY_WITH_SLOT`, `DELIVERED_POD_SIGNED`).
 *    - `MANUAL_PORTAL_OR_CMR`:
 *      Generates deterministic GS1-128 SSCC / NVE pallet identifiers (`00` application identifier + 18-digit SSCC),
 *      standardized Delivery Note (Albarán / Lieferschein) metadata, and enables manual fields for
 *      `externalTrackingPortalUrl`, `manualTrackingId`, and `signedCmrDocumentRef`.
 */
function calculateOperationalShippingScenarios({
    warehouseProfile,
    palletStacking,
    operationalOptions = {}
} = {}) {
    const wf = warehouseProfile || BUILTIN_WAREHOUSE_PROFILES.ZEITFRACHT_ERFURT;
    const orderBreakdown = (palletStacking && palletStacking.orderBreakdown) || null;

    const physicalPalletCount = Math.max(
        1,
        Number(
            operationalOptions.palletCount !== undefined
                ? operationalOptions.palletCount
                : (orderBreakdown ? orderBreakdown.totalPalletsRequired : 1)
        )
    );

    const grossWeightKg = roundToPrecision(
        Number(
            operationalOptions.grossWeightKg !== undefined
                ? operationalOptions.grossWeightKg
                : (orderBreakdown
                    ? orderBreakdown.totalShipmentGrossWeightKg
                    : (palletStacking ? palletStacking.fullPalletSpecs.grossWeightKg : 500))
        ),
        3
    );

    const stackabilityHandling = String(
        operationalOptions.stackabilityHandling ||
        operationalOptions.stackability_handling ||
        STACKABILITY_HANDLING_MODES.STRICT_LDM_NON_STACKABLE
    ).toUpperCase();

    const ldmTaxableWeightRatioKg = Number(
        operationalOptions.ldmTaxableWeightRatioKg ??
        operationalOptions.ldm_taxable_weight_ratio_kg ??
        1850.00
    );

    const maxAllowedPalletHeightMm = Number(
        operationalOptions.maxTotalPalletHeightMm ??
        wf.maxTotalPalletHeightMm ??
        1200
    );
    const palletBaseHeightMm = Number(
        operationalOptions.palletBaseHeightMm ??
        wf.palletBaseHeightMm ??
        144
    );

    // Determine individual pallet heights to evaluate printshop double-stacking eligibility
    const fullPalletHeightMm = Number(
        operationalOptions.palletHeightMm ??
        (palletStacking && palletStacking.fullPalletSpecs
            ? palletStacking.fullPalletSpecs.totalHeightMm
            : 1100)
    );
    const lastPalletHeightMm = Number(
        operationalOptions.lastPalletHeightMm ??
        (orderBreakdown && orderBreakdown.lastPallet
            ? orderBreakdown.lastPallet.totalHeightMm
            : fullPalletHeightMm)
    );
    const isTopLayerFlat = operationalOptions.hasRigidFlatTop !== undefined
        ? Boolean(operationalOptions.hasRigidFlatTop)
        : (orderBreakdown && orderBreakdown.lastPallet
            ? Boolean(orderBreakdown.lastPallet.isTopLayerFlat)
            : true);

    // Half-pallet height threshold:
    // Two stacked pallets in plant must not exceed `maxAllowedPalletHeightMm` (e.g. 2 * 550mm = 1100mm <= 1200mm),
    // and cargo height fits within `(maxAllowedPalletHeightMm - palletBaseHeightMm) / 2` (or total pallet height <= maxAllowedPalletHeightMm / 2).
    const halfPalletTotalHeightLimitMm = roundToPrecision(maxAllowedPalletHeightMm / 2, 1);
    const halfPalletCargoHeightLimitMm = roundToPrecision((maxAllowedPalletHeightMm - palletBaseHeightMm) / 2, 1);
    const maxObservedPalletHeightMm = Math.max(fullPalletHeightMm, lastPalletHeightMm);
    const maxObservedCargoHeightMm = Math.max(0, maxObservedPalletHeightMm - palletBaseHeightMm);

    const isEligibleForPrintshopAutoStack = Boolean(
        isTopLayerFlat &&
        (maxObservedPalletHeightMm <= halfPalletTotalHeightLimitMm ||
            maxObservedCargoHeightMm <= halfPalletCargoHeightLimitMm) &&
        (grossWeightKg / physicalPalletCount) * 2 <= Number(wf.maxGrossPalletWeightKg || 1000)
    );

    let floorPositionsUsed = physicalPalletCount;
    let stackabilityModeApplied = stackabilityHandling;
    let consolidatedPalletPairs = 0;

    if (stackabilityHandling === STACKABILITY_HANDLING_MODES.AUTO_STACK_AT_PRINTSHOP) {
        if (isEligibleForPrintshopAutoStack && physicalPalletCount >= 2) {
            floorPositionsUsed = Math.ceil(physicalPalletCount / 2);
            consolidatedPalletPairs = Math.floor(physicalPalletCount / 2);
            stackabilityModeApplied = STACKABILITY_HANDLING_MODES.AUTO_STACK_AT_PRINTSHOP;
        } else if (isEligibleForPrintshopAutoStack && physicalPalletCount === 1) {
            floorPositionsUsed = 1;
            stackabilityModeApplied = STACKABILITY_HANDLING_MODES.AUTO_STACK_AT_PRINTSHOP;
        } else {
            // Cannot physically stack two pallets without exceeding warehouse height/weight ceiling
            floorPositionsUsed = physicalPalletCount;
            stackabilityModeApplied = 'AUTO_STACK_FALLBACK_NON_STACKABLE';
        }
    }

    const ldmTotal = roundToPrecision(floorPositionsUsed * 0.4, 2);
    const ldmEquivalentWeightKg = roundToPrecision(ldmTotal * ldmTaxableWeightRatioKg, 2);

    let taxableWeightKg = grossWeightKg;
    if (
        stackabilityHandling === STACKABILITY_HANDLING_MODES.STRICT_LDM_NON_STACKABLE ||
        stackabilityModeApplied === 'AUTO_STACK_FALLBACK_NON_STACKABLE'
    ) {
        taxableWeightKg = roundToPrecision(Math.max(grossWeightKg, ldmEquivalentWeightKg), 2);
    } else if (stackabilityHandling === STACKABILITY_HANDLING_MODES.AUTO_STACK_AT_PRINTSHOP) {
        // Consolidated floor spaces occupied on trailer
        taxableWeightKg = roundToPrecision(Math.max(grossWeightKg, ldmEquivalentWeightKg), 2);
    } else {
        // DOUBLE_DECK_SUPPORTED: billed on actual scale gross weight and standard pallet space
        taxableWeightKg = roundToPrecision(grossWeightKg, 2);
    }

    // 2. Slot Booking Management (48h Advance Notice)
    const slotBookingManagement = String(
        operationalOptions.slotBookingManagement ||
        operationalOptions.slot_booking_management ||
        SLOT_BOOKING_MANAGEMENT_MODES.CARRIER_MANAGED
    ).toUpperCase();

    const requiresSlotBooking = Boolean(
        operationalOptions.requiresSlotBooking !== undefined
            ? operationalOptions.requiresSlotBooking
            : (wf.requiresSlotBooking !== undefined ? wf.requiresSlotBooking : true)
    );

    const slotBookingLeadTimeHours = Number(
        operationalOptions.slotBookingLeadTimeHours ??
        wf.slotBookingLeadTimeHours ??
        48
    );

    const carrierSlotBufferDays = Number(
        operationalOptions.carrierSlotBufferDays ??
        operationalOptions.carrier_slot_buffer_days ??
        2
    );

    const baseTransitDaysMin = Number(operationalOptions.transitDaysMin ?? 1);
    const baseTransitDaysMax = Number(operationalOptions.transitDaysMax ?? 3);

    const addedSlotBufferDays = (requiresSlotBooking && slotBookingManagement === SLOT_BOOKING_MANAGEMENT_MODES.CARRIER_MANAGED)
        ? carrierSlotBufferDays
        : 0;

    const estimatedTransitDaysEffectiveMin = baseTransitDaysMin + addedSlotBufferDays;
    const estimatedTransitDaysEffectiveMax = baseTransitDaysMax + addedSlotBufferDays;

    const recipientNotificationEmail = wf.profileCode === 'ZEITFRACHT_ERFURT'
        ? 'avis-wareneingang-va@zeitfracht.de'
        : (wf.profileCode === 'ARVATO_VVA_GUETERSLOH'
            ? 'wareneingang-avis@arvato.com'
            : 'dock-scheduling@warehouse-hub.eu');

    const totalCartons = Number(
        operationalOptions.totalCartons ??
        (orderBreakdown ? orderBreakdown.totalCartonsRequired : physicalPalletCount * 24)
    );
    const totalCopies = Number(
        operationalOptions.requestedQuantity ??
        (orderBreakdown ? orderBreakdown.requestedQuantity : 1000)
    );

    const slotBookingRequirement = slotBookingManagement === SLOT_BOOKING_MANAGEMENT_MODES.SHIPPER_MANAGED
        ? {
            required: requiresSlotBooking,
            managementMode: SLOT_BOOKING_MANAGEMENT_MODES.SHIPPER_MANAGED,
            advanceNoticeHours: slotBookingLeadTimeHours,
            noticeDeadlineRule: `MUST_SUBMIT_${slotBookingLeadTimeHours}H_BEFORE_UNLOADING`,
            unbookedPenaltyEur: Number((wf.penalties && wf.penalties.unbookedSlotPenaltyEur) || 128.00),
            requiresSlotNumberOnDeliveryNote: true,
            slotNumberFieldStatus: operationalOptions.assignedSlotNumber ? 'ASSIGNED' : 'PENDING_WAREHOUSE_CONFIRMATION',
            assignedSlotNumber: operationalOptions.assignedSlotNumber || null,
            notificationPayload: {
                recipientEmail: recipientNotificationEmail,
                warehouseCode: wf.profileCode,
                warehouseName: wf.displayName,
                subjectTemplate: `[AVIS / SLOT BOOKING ${slotBookingLeadTimeHours}h] ${wf.profileCode} — ${floorPositionsUsed} EUR-Pallets (${grossWeightKg} kg)`,
                shipmentSummary: {
                    physicalPalletsCount: physicalPalletCount,
                    floorPositionsRequested: floorPositionsUsed,
                    totalCartonsCount: totalCartons,
                    totalCopiesCount: totalCopies,
                    grossShipmentWeightKg: grossWeightKg,
                    maxPalletHeightMm: maxObservedPalletHeightMm,
                    vehicleRequirement: 'RAMP_HEIGHT_DOCK_COMPATIBLE'
                }
            }
        }
        : {
            required: requiresSlotBooking,
            managementMode: SLOT_BOOKING_MANAGEMENT_MODES.CARRIER_MANAGED,
            advanceNoticeHours: slotBookingLeadTimeHours,
            carrierBufferDaysAdded: addedSlotBufferDays,
            noticeDeadlineRule: 'HANDLED_BY_CARRIER_DESTINATION_HUB',
            unbookedPenaltyEur: Number((wf.penalties && wf.penalties.unbookedSlotPenaltyEur) || 128.00),
            requiresSlotNumberOnDeliveryNote: false,
            slotNumberFieldStatus: 'DELEGATED_TO_CARRIER',
            assignedSlotNumber: null,
            notificationPayload: null
        };

    // 3. Tracking Integration Mode & GS1-128 / SSCC (NVE) Metadata
    const trackingIntegrationMode = String(
        operationalOptions.trackingIntegrationMode ||
        operationalOptions.tracking_integration_mode ||
        TRACKING_INTEGRATION_MODES.CARRIER_API
    ).toUpperCase();

    const ssccPalletLabels = [];
    for (let idx = 1; idx <= floorPositionsUsed; idx++) {
        const serialPart = String(100000000 + idx).slice(-9);
        const base17 = `34012345${serialPart}`;
        // GS1 Modulo-10 check digit
        let sum = 0;
        for (let i = 0; i < base17.length; i++) {
            const digit = Number(base17[base17.length - 1 - i]);
            sum += digit * (i % 2 === 0 ? 3 : 1);
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        const sscc18 = `${base17}${checkDigit}`;
        ssccPalletLabels.push({
            palletFloorIndex: idx,
            applicationIdentifier: '00',
            sscc18,
            gs1128BarcodeString: `(00)${sscc18}`
        });
    }

    const trackingMetadata = trackingIntegrationMode === TRACKING_INTEGRATION_MODES.MANUAL_PORTAL_OR_CMR
        ? {
            mode: TRACKING_INTEGRATION_MODES.MANUAL_PORTAL_OR_CMR,
            supportsAutomatedWebhooks: false,
            labelStandard: 'GS1_128_SSCC_NVE',
            requiresStandardDeliveryNotePdf: true,
            manualCaptureFields: {
                externalTrackingPortalUrl: operationalOptions.externalTrackingPortalUrl || '',
                manualTrackingId: operationalOptions.manualTrackingId || '',
                signedCmrDocumentRef: operationalOptions.signedCmrDocumentRef || '',
                semiAutomaticNotificationEnabled: true
            },
            ssccPalletLabels,
            milestoneStates: [
                'DISPATCH_NOTE_GENERATED',
                'IN_TRANSIT_MANUAL_LINK_SENT',
                'DELIVERED_CMR_UPLOADED'
            ]
        }
        : {
            mode: TRACKING_INTEGRATION_MODES.CARRIER_API,
            supportsAutomatedWebhooks: true,
            labelStandard: 'GS1_128_SSCC_NVE',
            requiresStandardDeliveryNotePdf: true,
            manualCaptureFields: null,
            ssccPalletLabels,
            milestoneStates: [
                'PICKED_UP_AT_PRINTSHOP',
                'IN_TRANSIT_HUB',
                'OUT_FOR_DELIVERY_WITH_SLOT',
                'DELIVERED_POD_SIGNED'
            ]
        };

    return {
        stackabilityAndLdm: {
            requestedStackabilityMode: stackabilityHandling,
            stackabilityModeApplied,
            isEligibleForPrintshopAutoStack,
            physicalPalletCount,
            consolidatedPalletPairs,
            floorPositionsUsed,
            ldmPerFloorPosition: 0.4,
            ldmTotal,
            ldmTaxableWeightRatioKg,
            ldmEquivalentWeightKg,
            actualGrossWeightKg: grossWeightKg,
            taxableWeightKg
        },
        slotBookingActionPlan: {
            ...slotBookingRequirement,
            baseTransitDaysMin,
            baseTransitDaysMax,
            carrierSlotBufferDays: addedSlotBufferDays,
            estimatedTransitDaysEffectiveMin,
            estimatedTransitDaysEffectiveMax,
            estimatedTransitDaysEffective: estimatedTransitDaysEffectiveMax
        },
        trackingProtocol: trackingMetadata
    };
}

/**
 * Master Pure Orchestrator: executeLogisticsCubingCalculation(input)
 *
 * Executes all 5 deterministic stages and computes canonical SHA-256 input/output hashes
 * for full audit traceability.
 */
function executeLogisticsCubingCalculation(input = {}) {
    const warehouseProfile = resolveWarehouseProfile(
        input.warehouseProfileCode || 'ZEITFRACHT_ERFURT',
        input.customWarehouseProfile || null
    );

    const quantity = input.quantity !== undefined && input.quantity !== null
        ? Number(input.quantity)
        : 1000;

    // Stage 1: Unit finished book weight & dimensions
    const unitBook = calculateUnitFinishedBookWeightAndDimensions(input);

    // Stage 2: Optimal 3D carton packing
    const cartonPacking = calculateOptimalCartonPacking(
        unitBook,
        warehouseProfile,
        input.packagingOptions || {}
    );

    // Stage 3: Euro-pallet 2D tiling & dual-ceiling 3D stacking
    const palletStacking = calculateEuroPalletTilingAndStacking(
        cartonPacking,
        warehouseProfile,
        quantity
    );

    // Stage 4: Warehouse delivery profile validation & penalty alerting
    const warehouseValidation = validateWarehouseDeliveryConstraints(
        warehouseProfile,
        cartonPacking,
        palletStacking,
        input.deliveryContext || {}
    );

    // Stage 5: Full-pallet run optimization (Delta Q- / Delta Q+)
    const runOptimization = calculateFullPalletRunOptimization(
        quantity,
        cartonPacking,
        palletStacking
    );

    // Stage 6 (Phase 198B — LOGISTICS-04): Operational Scenarios (LDM/Stackability, 48h Slot Booking, Dual Tracking)
    const operationalScenarios = calculateOperationalShippingScenarios({
        warehouseProfile,
        palletStacking,
        operationalOptions: {
            ...(input.operationalOptions || {}),
            stackabilityHandling:
                (input.operationalOptions && input.operationalOptions.stackabilityHandling) ||
                input.stackabilityHandling ||
                input.stackability_handling,
            ldmTaxableWeightRatioKg:
                (input.operationalOptions && input.operationalOptions.ldmTaxableWeightRatioKg) ??
                input.ldmTaxableWeightRatioKg ??
                input.ldm_taxable_weight_ratio_kg,
            slotBookingManagement:
                (input.operationalOptions && input.operationalOptions.slotBookingManagement) ||
                input.slotBookingManagement ||
                input.slot_booking_management,
            carrierSlotBufferDays:
                (input.operationalOptions && input.operationalOptions.carrierSlotBufferDays) ??
                input.carrierSlotBufferDays ??
                input.carrier_slot_buffer_days,
            trackingIntegrationMode:
                (input.operationalOptions && input.operationalOptions.trackingIntegrationMode) ||
                input.trackingIntegrationMode ||
                input.tracking_integration_mode,
            transitDaysMin: input.transitDaysMin,
            transitDaysMax: input.transitDaysMax
        }
    });

    // Packaging materials cost breakdown (kept strictly separate from carrier freight & manufacturing)
    const unitCartonCostEur = Number(
        (input.packagingOptions && input.packagingOptions.unitCartonCostEur) || 1.25
    );
    const unitPalletCostEur = Number(
        (input.packagingOptions && input.packagingOptions.unitPalletCostEur) || 14.50
    );
    const stretchWrapCostPerPalletEur = Number(
        (input.packagingOptions && input.packagingOptions.stretchWrapCostPerPalletEur) || 3.20
    );

    const totalCartons = palletStacking.orderBreakdown.totalCartonsRequired;
    const totalPallets = palletStacking.orderBreakdown.totalPalletsRequired;

    const packagingMaterialsCostBreakdownEur = {
        cartonsTotalEur: roundToPrecision(totalCartons * unitCartonCostEur, 2),
        palletsTotalEur: roundToPrecision(totalPallets * unitPalletCostEur, 2),
        stretchWrapAndStrappingEur: roundToPrecision(totalPallets * stretchWrapCostPerPalletEur, 2),
        totalPackagingMaterialsEur: roundToPrecision(
            totalCartons * unitCartonCostEur +
            totalPallets * (unitPalletCostEur + stretchWrapCostPerPalletEur),
            2
        )
    };

    const canonicalInput = {
        engineVersion: LOGISTICS_ENGINE_VERSION,
        trimWidthMm: unitBook.trimDimensionsMm.widthMm,
        trimHeightMm: unitBook.trimDimensionsMm.heightMm,
        bindingCategory: unitBook.bindingCategory,
        processingType: unitBook.processingType,
        segments: unitBook.segmentWeightBreakdown,
        quantity,
        warehouseProfileCode: warehouseProfile.profileCode
    };

    const outputPayload = {
        unitBook,
        cartonPacking,
        palletStacking,
        warehouseValidation,
        runOptimization,
        operationalScenarios,
        packagingMaterialsCostBreakdownEur
    };

    return {
        engineVersion: LOGISTICS_ENGINE_VERSION,
        warehouseProfileCode: warehouseProfile.profileCode,
        inputCanonicalHash: computeCanonicalHash(canonicalInput),
        outputCanonicalHash: computeCanonicalHash(outputPayload),
        ...outputPayload
    };
}

module.exports = {
    LOGISTICS_ENGINE_VERSION,
    TRACKING_INTEGRATION_MODES,
    SLOT_BOOKING_MANAGEMENT_MODES,
    STACKABILITY_HANDLING_MODES,
    BUILTIN_WAREHOUSE_PROFILES,
    STANDARD_CARTON_CATALOG,
    resolveWarehouseProfile,
    resolveSegmentCaliperUm,
    estimateAdaptiveCartonTareWeightKg,
    calculateUnitFinishedBookWeightAndDimensions,
    calculateOptimalCartonPacking,
    calculateEuroPalletTilingAndStacking,
    validateWarehouseDeliveryConstraints,
    calculateFullPalletRunOptimization,
    calculateOperationalShippingScenarios,
    executeLogisticsCubingCalculation
};

