'use strict';

/**
 * src/api/services/logistics/logisticsDatabaseService.js
 *
 * PrintPrice OS — Phase 198A (LOGISTICS-02): Governed Logistics Database & Landed Freight Quote Service
 *
 * Responsibilities:
 * 1. Querying and normalizing editorial warehouse delivery profiles (`warehouse_delivery_profiles`)
 *    with fallback to `BUILTIN_WAREHOUSE_PROFILES` when running in offline/unmigrated environments.
 * 2. Resolving carrier freight rate matrices (`freight_rate_matrices`) by printhouse, origin/destination
 *    country & postal zone prefix (exact 2-digit prefix or wildcard `*`), supporting:
 *    - `PER_PALLET_STEPPED` (stepped LTL pallet tiers + optional FTL cap)
 *    - `PER_LDM` (loading meters: 0.4 LDM per Euro-pallet 1200x800)
 *    - `PER_KG_VOLUMETRIC` (chargeable weight max(actualKg, volumetricKg))
 *    plus fuel surcharge % and tail-lift surcharge €.
 * 3. Resolving printhouse or platform default packaging consumable rates (`packaging_consumable_rates`).
 * 4. Orchestrating `calculateFullLandedLogisticsQuote(quoteParams)` combining the pure
 *    `packagingAndCubingEngine` with persisted warehouse rules, packaging consumables, and freight tariffs
 *    while preserving strict cost segregation (`packagingMaterialsCostBreakdownEur` vs `freightCostBreakdownEur`).
 */

const mysqlClient = require('../mysqlClient');
const {
    BUILTIN_WAREHOUSE_PROFILES,
    TRACKING_INTEGRATION_MODES,
    SLOT_BOOKING_MANAGEMENT_MODES,
    STACKABILITY_HANDLING_MODES,
    calculateOperationalShippingScenarios,
    executeLogisticsCubingCalculation
} = require('./packagingAndCubingEngine');
const {
    roundToPrecision,
    computeCanonicalHash
} = require('../spine/spineCalculationEngine');

/**
 * Built-in baseline freight matrices (mirroring Migration 176 & 177 seed rows) used as
 * deterministic fallback when the database returns no custom row or in offline tests.
 */
const DEFAULT_FREIGHT_MATRICES = Object.freeze([
    Object.freeze({
        id: 'frm-global-de-99-dachser-001',
        printhouse_id: null,
        origin_country: 'DE',
        origin_postal_zone: '*',
        destination_country: 'DE',
        destination_postal_zone: '99',
        carrier_name: 'DACHSER',
        transit_days_min: 1,
        transit_days_max: 2,
        pricing_mode: 'PER_PALLET_STEPPED',
        rate_tiers_json: {
            tiers: [
                { minPallets: 1, maxPallets: 1, ratePerPalletEur: 85.00 },
                { minPallets: 2, maxPallets: 2, ratePerPalletEur: 72.00 },
                { minPallets: 3, maxPallets: 5, ratePerPalletEur: 64.00 },
                { minPallets: 6, maxPallets: 10, ratePerPalletEur: 56.00 },
                { minPallets: 11, maxPallets: 33, ratePerPalletEur: 48.00, ftlFlatRateEur: 1350.00 }
            ]
        },
        fuel_surcharge_percent: 6.50,
        tail_lift_surcharge_eur: 35.00,
        tracking_integration_mode: 'CARRIER_API',
        slot_booking_management: 'CARRIER_MANAGED',
        carrier_slot_buffer_days: 2,
        stackability_handling: 'DOUBLE_DECK_SUPPORTED',
        ldm_taxable_weight_ratio_kg: 1850.00,
        is_active: true
    }),
    Object.freeze({
        id: 'frm-global-de-33-schenker-002',
        printhouse_id: null,
        origin_country: 'DE',
        origin_postal_zone: '*',
        destination_country: 'DE',
        destination_postal_zone: '33',
        carrier_name: 'SCHENKER',
        transit_days_min: 1,
        transit_days_max: 3,
        pricing_mode: 'PER_PALLET_STEPPED',
        rate_tiers_json: {
            tiers: [
                { minPallets: 1, maxPallets: 1, ratePerPalletEur: 88.00 },
                { minPallets: 2, maxPallets: 2, ratePerPalletEur: 75.00 },
                { minPallets: 3, maxPallets: 5, ratePerPalletEur: 66.00 },
                { minPallets: 6, maxPallets: 10, ratePerPalletEur: 58.00 },
                { minPallets: 11, maxPallets: 33, ratePerPalletEur: 50.00, ftlFlatRateEur: 1390.00 }
            ]
        },
        fuel_surcharge_percent: 6.50,
        tail_lift_surcharge_eur: 35.00,
        tracking_integration_mode: 'CARRIER_API',
        slot_booking_management: 'CARRIER_MANAGED',
        carrier_slot_buffer_days: 2,
        stackability_handling: 'STRICT_LDM_NON_STACKABLE',
        ldm_taxable_weight_ratio_kg: 1850.00,
        is_active: true
    }),
    Object.freeze({
        id: 'frm-global-de-all-raben-003',
        printhouse_id: null,
        origin_country: 'DE',
        origin_postal_zone: '*',
        destination_country: 'DE',
        destination_postal_zone: '*',
        carrier_name: 'RABEN',
        transit_days_min: 2,
        transit_days_max: 4,
        pricing_mode: 'PER_PALLET_STEPPED',
        rate_tiers_json: {
            tiers: [
                { minPallets: 1, maxPallets: 1, ratePerPalletEur: 92.00 },
                { minPallets: 2, maxPallets: 2, ratePerPalletEur: 78.00 },
                { minPallets: 3, maxPallets: 5, ratePerPalletEur: 69.00 },
                { minPallets: 6, maxPallets: 10, ratePerPalletEur: 60.00 },
                { minPallets: 11, maxPallets: 33, ratePerPalletEur: 52.00, ftlFlatRateEur: 1450.00 }
            ]
        },
        fuel_surcharge_percent: 7.00,
        tail_lift_surcharge_eur: 38.00,
        tracking_integration_mode: 'CARRIER_API',
        slot_booking_management: 'CARRIER_MANAGED',
        carrier_slot_buffer_days: 2,
        stackability_handling: 'STRICT_LDM_NON_STACKABLE',
        ldm_taxable_weight_ratio_kg: 1850.00,
        is_active: true
    }),
    Object.freeze({
        id: 'frm-global-es-de-dachser-004',
        printhouse_id: null,
        origin_country: 'ES',
        origin_postal_zone: '*',
        destination_country: 'DE',
        destination_postal_zone: '*',
        carrier_name: 'DACHSER',
        transit_days_min: 3,
        transit_days_max: 5,
        pricing_mode: 'PER_PALLET_STEPPED',
        rate_tiers_json: {
            tiers: [
                { minPallets: 1, maxPallets: 1, ratePerPalletEur: 165.00 },
                { minPallets: 2, maxPallets: 2, ratePerPalletEur: 142.00 },
                { minPallets: 3, maxPallets: 5, ratePerPalletEur: 125.00 },
                { minPallets: 6, maxPallets: 10, ratePerPalletEur: 110.00 },
                { minPallets: 11, maxPallets: 33, ratePerPalletEur: 95.00, ftlFlatRateEur: 2650.00 }
            ]
        },
        fuel_surcharge_percent: 8.50,
        tail_lift_surcharge_eur: 45.00,
        tracking_integration_mode: 'CARRIER_API',
        slot_booking_management: 'CARRIER_MANAGED',
        carrier_slot_buffer_days: 2,
        stackability_handling: 'DOUBLE_DECK_SUPPORTED',
        ldm_taxable_weight_ratio_kg: 1850.00,
        is_active: true
    })
]);

const DEFAULT_CONSUMABLE_RATES = Object.freeze({
    id: 'pcr-global-default-001',
    printhouseId: null,
    euroPalletEpalEur: 14.50,
    cartonBoxStandardEur: 0.85,
    stretchWrapPerPalletEur: 2.20,
    source: 'PLATFORM_DEFAULT'
});

function unwrapRows(result) {
    if (!result) return [];
    if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
    if (Array.isArray(result)) return result;
    return [];
}

/**
 * Normalizes a database row from `warehouse_delivery_profiles` into the unified engine format
 * while preserving the DB snake_case/camelCase properties expected by API & DB consumers.
 */
function mapDbRowToWarehouseProfile(row) {
    if (!row) return null;
    const code = row.code || row.profileCode;
    const builtin = BUILTIN_WAREHOUSE_PROFILES[code] || BUILTIN_WAREHOUSE_PROFILES.STANDARD_COMMERCIAL_DOCK;

    const maxPalletHeightMm = Number(row.max_pallet_height_mm ?? row.maxTotalPalletHeightMm ?? builtin.maxTotalPalletHeightMm);
    const maxPalletWeightKg = Number(row.max_pallet_weight_kg ?? row.maxGrossPalletWeightKg ?? builtin.maxGrossPalletWeightKg);
    const perimeterMarginMm = Number(row.perimeter_margin_mm ?? row.minPerimeterSetbackMm ?? builtin.minPerimeterSetbackMm);
    const maxCartonWeightKg = Number(row.max_carton_weight_kg ?? row.maxCartonWeightKg ?? builtin.maxCartonWeightKg);
    const requiresSlotBooking = Boolean(row.requires_slot_booking ?? row.requiresSlotBooking ?? true);
    const slotBookingLeadTimeHours = Number(row.slot_booking_lead_time_hours ?? row.slotBookingLeadTimeHours ?? 48);
    const requiresFlatTopLayer = Boolean(row.requires_flat_top_layer ?? row.requiresFlatTopLayer ?? builtin.requiresFlatTopLayer);
    const requiresLoadingDock = Boolean(row.requires_loading_dock ?? row.requiresLoadingDock ?? builtin.requiresLoadingDock);
    const penaltyOversizedPalletEur = Number(
        row.penalty_oversized_pallet_eur ??
        (builtin.penalties && builtin.penalties.repalletizingFeePerPalletEur) ??
        40.00
    );
    const penaltyUnbookedSlotEur = Number(
        row.penalty_unbooked_slot_eur ??
        (builtin.penalties && builtin.penalties.unbookedSlotPenaltyEur) ??
        128.00
    );

    return {
        id: row.id || `wdp-${code.toLowerCase()}`,
        code,
        profileCode: code,
        name: row.name || row.displayName || builtin.displayName,
        displayName: row.name || row.displayName || builtin.displayName,
        countryCode: row.country_code || row.countryCode || builtin.countryCode || 'DE',
        postalCode: row.postal_code ?? row.postalCode ?? null,
        city: row.city ?? null,
        addressLine: row.address_line ?? row.addressLine ?? null,
        palletStandard: builtin.palletStandard || 'EUR_EPAL_1200x800',
        palletFootprintLengthMm: builtin.palletFootprintLengthMm || 1200,
        palletFootprintWidthMm: builtin.palletFootprintWidthMm || 800,
        palletBaseHeightMm: builtin.palletBaseHeightMm || 144,
        palletTareWeightKg: builtin.palletTareWeightKg || 25.0,
        maxPalletHeightMm,
        maxTotalPalletHeightMm: maxPalletHeightMm,
        maxPalletWeightKg,
        maxGrossPalletWeightKg: maxPalletWeightKg,
        perimeterMarginMm,
        minPerimeterSetbackMm: perimeterMarginMm,
        maxOverhangMm: 0,
        maxCartonWeightKg,
        requiresSlotBooking,
        slotBookingLeadTimeHours,
        requiresFlatTopLayer,
        requiresLoadingDock,
        allowsTailLift: !requiresLoadingDock,
        penaltyOversizedPalletEur,
        penaltyUnbookedSlotEur,
        penalties: {
            ...(builtin.penalties || {}),
            repalletizingFeePerPalletEur: penaltyOversizedPalletEur,
            unbookedSlotPenaltyEur: penaltyUnbookedSlotEur
        },
        isActive: row.is_active !== undefined ? Boolean(row.is_active) : true
    };
}

/**
 * Extracts a 2-digit postal zone prefix from a postal code (e.g., '99098' -> '99').
 */
function extractPostalPrefix(postalCode) {
    if (!postalCode || typeof postalCode !== 'string') return '*';
    const cleaned = postalCode.trim();
    if (cleaned === '*' || cleaned.length === 0) return '*';
    return cleaned.slice(0, 2);
}

/**
 * Evaluates a freight matrix row for a given pallet count, floor positions, gross/taxable weight,
 * operational scenarios (stackability / LDM, slot booking, tracking), and tail-lift option.
 */
function evaluateFreightMatrixRow(
    matrixRow,
    {
        palletCount,
        floorPositionsUsed = null,
        grossWeightKg,
        taxableWeightKg = null,
        requiresTailLift = false
    }
) {
    const physicalPallets = Math.max(1, Math.ceil(Number(palletCount || 1)));
    const stackabilityHandling = String(
        matrixRow.stackability_handling ||
        matrixRow.stackabilityHandling ||
        STACKABILITY_HANDLING_MODES.STRICT_LDM_NON_STACKABLE
    ).toUpperCase();
    const ldmTaxableWeightRatioKg = Number(
        matrixRow.ldm_taxable_weight_ratio_kg ??
        matrixRow.ldmTaxableWeightRatioKg ??
        1850.00
    );
    const trackingIntegrationMode = String(
        matrixRow.tracking_integration_mode ||
        matrixRow.trackingIntegrationMode ||
        TRACKING_INTEGRATION_MODES.CARRIER_API
    ).toUpperCase();
    const slotBookingManagement = String(
        matrixRow.slot_booking_management ||
        matrixRow.slotBookingManagement ||
        SLOT_BOOKING_MANAGEMENT_MODES.CARRIER_MANAGED
    ).toUpperCase();
    const carrierSlotBufferDays = Number(
        matrixRow.carrier_slot_buffer_days ??
        matrixRow.carrierSlotBufferDays ??
        2
    );

    const floorSpaces = floorPositionsUsed !== null && floorPositionsUsed !== undefined
        ? Math.max(1, Math.ceil(Number(floorPositionsUsed)))
        : physicalPallets;

    const actualWeightKg = Math.max(0, Number(grossWeightKg || 0));
    const ldmTotal = roundToPrecision(floorSpaces * 0.4, 2);
    const ldmMinTaxableWeightKg = roundToPrecision(ldmTotal * ldmTaxableWeightRatioKg, 2);

    const effectiveTaxableWeightKg = taxableWeightKg !== null && taxableWeightKg !== undefined
        ? roundToPrecision(Number(taxableWeightKg), 2)
        : (stackabilityHandling === STACKABILITY_HANDLING_MODES.DOUBLE_DECK_SUPPORTED
            ? roundToPrecision(actualWeightKg, 2)
            : roundToPrecision(Math.max(actualWeightKg, ldmMinTaxableWeightKg), 2));

    const pricingMode = matrixRow.pricing_mode || 'PER_PALLET_STEPPED';
    const parsedTiers = typeof matrixRow.rate_tiers_json === 'string'
        ? JSON.parse(matrixRow.rate_tiers_json)
        : (matrixRow.rate_tiers_json || {});

    let baseFreightEur = 0;
    let appliedTier = null;

    if (pricingMode === 'PER_PALLET_STEPPED') {
        const tiers = Array.isArray(parsedTiers.tiers)
            ? parsedTiers.tiers
            : (Array.isArray(parsedTiers) ? parsedTiers : []);

        // Match tier using floorSpaces (which equals physicalPallets unless AUTO_STACK_AT_PRINTSHOP consolidated pairs)
        appliedTier = tiers.find(
            t => floorSpaces >= Number(t.minPallets || 1) && floorSpaces <= Number(t.maxPallets || 999)
        );
        if (!appliedTier && tiers.length > 0) {
            appliedTier = tiers[tiers.length - 1];
        }

        const ratePerPalletEur = Number((appliedTier && appliedTier.ratePerPalletEur) || 85.0);
        let rawPalletTotalEur = roundToPrecision(floorSpaces * ratePerPalletEur, 2);

        // If tier or matrix defines a weight/LDM rate per 100kg (`ratePer100KgTaxableEur`) or non-stackable LDM floor
        if (parsedTiers.ratePer100KgTaxableEur) {
            const weightBasedEur = roundToPrecision(
                (effectiveTaxableWeightKg / 100) * Number(parsedTiers.ratePer100KgTaxableEur),
                2
            );
            rawPalletTotalEur = Math.max(rawPalletTotalEur, weightBasedEur);
        }

        // Cap at full-truckload (FTL) flat rate when defined on the tier and advantageous
        if (appliedTier && appliedTier.ftlFlatRateEur && rawPalletTotalEur > Number(appliedTier.ftlFlatRateEur)) {
            baseFreightEur = roundToPrecision(Number(appliedTier.ftlFlatRateEur), 2);
        } else {
            baseFreightEur = rawPalletTotalEur;
        }
    } else if (pricingMode === 'PER_LDM') {
        // 1 Euro-Pallet floor space (1200x800 mm) = 0.4 Loading Meters (LDM) on a 2.4m wide trailer
        const ratePerLdmEur = Number(parsedTiers.ratePerLdmEur || 195.0);
        const minChargeEur = Number(parsedTiers.minChargeEur || 80.0);
        const ratePer100KgEur = parsedTiers.ratePer100KgEur ? Number(parsedTiers.ratePer100KgEur) : null;
        const ldmChargeEur = ldmTotal * ratePerLdmEur;
        const weightChargeEur = ratePer100KgEur ? (effectiveTaxableWeightKg / 100) * ratePer100KgEur : 0;
        baseFreightEur = roundToPrecision(Math.max(minChargeEur, ldmChargeEur, weightChargeEur), 2);
        appliedTier = { ldm: ldmTotal, taxableWeightKg: effectiveTaxableWeightKg, ratePerLdmEur, minChargeEur };
    } else {
        // PER_KG_VOLUMETRIC: billed on effectiveTaxableWeightKg (max of gross weight vs LDM taxable weight)
        const ratePer100KgEur = Number(parsedTiers.ratePer100KgEur || 14.5);
        const minChargeEur = Number(parsedTiers.minChargeEur || 75.0);
        baseFreightEur = roundToPrecision(Math.max(minChargeEur, (effectiveTaxableWeightKg / 100) * ratePer100KgEur), 2);
        appliedTier = { weightKg: actualWeightKg, taxableWeightKg: effectiveTaxableWeightKg, ratePer100KgEur, minChargeEur };
    }

    const fuelSurchargePercent = Number(matrixRow.fuel_surcharge_percent || 0);
    const fuelSurchargeEur = roundToPrecision(baseFreightEur * (fuelSurchargePercent / 100), 2);

    const tailLiftUnitEur = Number(matrixRow.tail_lift_surcharge_eur || 0);
    const tailLiftSurchargeEur = requiresTailLift ? roundToPrecision(tailLiftUnitEur, 2) : 0;

    const totalFreightEur = roundToPrecision(
        baseFreightEur + fuelSurchargeEur + tailLiftSurchargeEur,
        2
    );

    const transitDaysMin = Number(matrixRow.transit_days_min || 2);
    const transitDaysMax = Number(matrixRow.transit_days_max || 5);
    const bufferDays = slotBookingManagement === SLOT_BOOKING_MANAGEMENT_MODES.CARRIER_MANAGED
        ? carrierSlotBufferDays
        : 0;

    return {
        matrixId: matrixRow.id,
        printhouseId: matrixRow.printhouse_id || null,
        carrierName: matrixRow.carrier_name,
        originCountry: matrixRow.origin_country,
        originPostalZone: matrixRow.origin_postal_zone,
        destinationCountry: matrixRow.destination_country,
        destinationPostalZone: matrixRow.destination_postal_zone,
        pricingMode,
        trackingIntegrationMode,
        slotBookingManagement,
        carrierSlotBufferDays,
        stackabilityHandling,
        ldmTaxableWeightRatioKg,
        transitDaysMin,
        transitDaysMax,
        estimatedTransitDaysEffectiveMin: transitDaysMin + bufferDays,
        estimatedTransitDaysEffectiveMax: transitDaysMax + bufferDays,
        estimatedTransitDaysEffective: transitDaysMax + bufferDays,
        physicalPalletCount: physicalPallets,
        floorPositionsUsed: floorSpaces,
        palletCountBilled: floorSpaces,
        ldmTotal,
        grossWeightKg: roundToPrecision(actualWeightKg, 2),
        taxableWeightKg: effectiveTaxableWeightKg,
        appliedTier,
        baseFreightEur,
        fuelSurchargePercent,
        fuelSurchargeEur,
        tailLiftSurchargeEur,
        totalFreightEur
    };
}

class LogisticsDatabaseService {
    constructor(options = {}) {
        this.db = options.db || mysqlClient;
    }

    /**
     * Retrieves a single warehouse delivery profile by its unique code (e.g. 'ZEITFRACHT_ERFURT').
     * Falls back to `BUILTIN_WAREHOUSE_PROFILES` if DB returns empty or fails.
     */
    async getWarehouseProfileByCode(profileCode) {
        const normalizedCode = String(profileCode || 'ZEITFRACHT_ERFURT').trim().toUpperCase();

        if (this.db && typeof this.db.query === 'function') {
            try {
                const rows = unwrapRows(
                    await this.db.query(
                        `SELECT * FROM warehouse_delivery_profiles WHERE code = ? AND is_active = TRUE LIMIT 1`,
                        [normalizedCode]
                    )
                );
                if (rows.length > 0) {
                    return mapDbRowToWarehouseProfile(rows[0]);
                }
            } catch (_) {
                // Fallback to built-in preset if table is not yet migrated in test environment
            }
        }

        const builtin = BUILTIN_WAREHOUSE_PROFILES[normalizedCode];
        if (!builtin) {
            return null;
        }
        return mapDbRowToWarehouseProfile(builtin);
    }

    /**
     * Lists all active editorial and commercial warehouse delivery profiles.
     */
    async listActiveWarehouseProfiles() {
        if (this.db && typeof this.db.query === 'function') {
            try {
                const rows = unwrapRows(
                    await this.db.query(
                        `SELECT * FROM warehouse_delivery_profiles WHERE is_active = TRUE ORDER BY code ASC`
                    )
                );
                if (rows.length > 0) {
                    return rows.map(mapDbRowToWarehouseProfile);
                }
            } catch (_) {
                // Fallback to built-in presets
            }
        }

        return Object.values(BUILTIN_WAREHOUSE_PROFILES).map(mapDbRowToWarehouseProfile);
    }

    /**
     * Resolves the best matching freight tariff for a given printhouse, origin/destination
     * country and postal code, pallet count, and total shipment gross weight.
     *
     * Matching specificity order:
     * 1. Printhouse-specific matrix (`printhouse_id = ?`) vs Global platform matrix (`printhouse_id IS NULL`)
     * 2. Exact 2-digit destination postal zone match (e.g. '99' for 99098 Erfurt) vs wildcard '*'
     * 3. Exact 2-digit origin postal zone match vs wildcard '*'
     * 4. Lowest resulting `totalFreightEur` among equally specific matches.
     */
    async resolveFreightRate({
        printhouseId = null,
        originCountry = 'DE',
        originPostal = '*',
        destCountry = 'DE',
        destPostal = '*',
        palletCount = 1,
        floorPositionsUsed = null,
        grossWeightKg = 500,
        taxableWeightKg = null,
        requiresTailLift = false
    } = {}) {
        const normOriginCountry = String(originCountry || 'DE').trim().toUpperCase();
        const normDestCountry = String(destCountry || 'DE').trim().toUpperCase();
        const originPrefix = extractPostalPrefix(originPostal);
        const destPrefix = extractPostalPrefix(destPostal);

        let candidateRows = [];

        if (this.db && typeof this.db.query === 'function') {
            try {
                const sql = printhouseId
                    ? `SELECT * FROM freight_rate_matrices
                       WHERE is_active = TRUE
                         AND (printhouse_id = ? OR printhouse_id IS NULL)
                         AND origin_country = ?
                         AND destination_country = ?
                         AND (origin_postal_zone IN (?, '*'))
                         AND (destination_postal_zone IN (?, '*'))`
                    : `SELECT * FROM freight_rate_matrices
                       WHERE is_active = TRUE
                         AND printhouse_id IS NULL
                         AND origin_country = ?
                         AND destination_country = ?
                         AND (origin_postal_zone IN (?, '*'))
                         AND (destination_postal_zone IN (?, '*'))`;

                const params = printhouseId
                    ? [printhouseId, normOriginCountry, normDestCountry, originPrefix, destPrefix]
                    : [normOriginCountry, normDestCountry, originPrefix, destPrefix];

                candidateRows = unwrapRows(await this.db.query(sql, params));
            } catch (_) {
                // Fallback to DEFAULT_FREIGHT_MATRICES below
            }
        }

        if (candidateRows.length === 0) {
            candidateRows = DEFAULT_FREIGHT_MATRICES.filter(
                r =>
                    r.is_active &&
                    (r.printhouse_id === printhouseId || r.printhouse_id === null) &&
                    r.origin_country === normOriginCountry &&
                    r.destination_country === normDestCountry &&
                    (r.origin_postal_zone === originPrefix || r.origin_postal_zone === '*') &&
                    (r.destination_postal_zone === destPrefix || r.destination_postal_zone === '*')
            );

            // Final fallback if origin country has no specific seed: use RABEN wildcard
            if (candidateRows.length === 0) {
                candidateRows = [DEFAULT_FREIGHT_MATRICES[2]];
            }
        }

        // Rank by specificity: printhouse match (+100), exact dest zone (+20), exact origin zone (+10)
        const scoredCandidates = candidateRows.map(row => {
            let specificityScore = 0;
            if (printhouseId && row.printhouse_id === printhouseId) specificityScore += 100;
            if (row.destination_postal_zone !== '*' && row.destination_postal_zone === destPrefix) specificityScore += 20;
            if (row.origin_postal_zone !== '*' && row.origin_postal_zone === originPrefix) specificityScore += 10;

            const evaluation = evaluateFreightMatrixRow(row, {
                palletCount,
                floorPositionsUsed,
                grossWeightKg,
                taxableWeightKg,
                requiresTailLift
            });

            return {
                specificityScore,
                evaluation
            };
        });

        scoredCandidates.sort((a, b) => {
            if (b.specificityScore !== a.specificityScore) {
                return b.specificityScore - a.specificityScore;
            }
            return a.evaluation.totalFreightEur - b.evaluation.totalFreightEur;
        });

        return scoredCandidates[0].evaluation;
    }

    /**
     * Retrieves packaging consumable unit costs (EPAL pallet, standard carton box, stretch wrap)
     * for a specific printhouse, falling back to the global platform default row (`printhouse_id IS NULL`).
     */
    async getPackagingConsumableRates(printhouseId = null) {
        if (this.db && typeof this.db.query === 'function') {
            try {
                const sql = printhouseId
                    ? `SELECT * FROM packaging_consumable_rates
                       WHERE is_active = TRUE AND (printhouse_id = ? OR printhouse_id IS NULL)
                       ORDER BY (printhouse_id IS NOT NULL) DESC
                       LIMIT 1`
                    : `SELECT * FROM packaging_consumable_rates
                       WHERE is_active = TRUE AND printhouse_id IS NULL
                       LIMIT 1`;
                const params = printhouseId ? [printhouseId] : [];
                const rows = unwrapRows(await this.db.query(sql, params));
                if (rows.length > 0) {
                    const row = rows[0];
                    return {
                        id: row.id,
                        printhouseId: row.printhouse_id || null,
                        euroPalletEpalEur: Number(row.euro_pallet_epal_eur),
                        cartonBoxStandardEur: Number(row.carton_box_standard_eur),
                        stretchWrapPerPalletEur: Number(row.stretch_wrap_per_pallet_eur),
                        source: row.printhouse_id ? 'PRINTHOUSE_CUSTOM' : 'PLATFORM_DEFAULT'
                    };
                }
            } catch (_) {
                // Fallback to DEFAULT_CONSUMABLE_RATES
            }
        }

        return { ...DEFAULT_CONSUMABLE_RATES };
    }

    /**
     * Lists freight rate matrices configured for a printhouse (plus platform default matrices if requested).
     */
    async listPrinthouseFreightMatrices(printhouseId, { includePlatformDefaults = true } = {}) {
        const normalizeRow = row => ({
            id: row.id,
            printhouseId: row.printhouse_id || null,
            originCountry: row.origin_country,
            originPostalZone: row.origin_postal_zone,
            destinationCountry: row.destination_country,
            destinationPostalZone: row.destination_postal_zone,
            carrierName: row.carrier_name,
            transitDaysMin: Number(row.transit_days_min || 2),
            transitDaysMax: Number(row.transit_days_max || 5),
            pricingMode: row.pricing_mode || 'PER_PALLET_STEPPED',
            rateTiers: typeof row.rate_tiers_json === 'string'
                ? JSON.parse(row.rate_tiers_json)
                : row.rate_tiers_json,
            fuelSurchargePercent: Number(row.fuel_surcharge_percent || 0),
            tailLiftSurchargeEur: Number(row.tail_lift_surcharge_eur || 0),
            trackingIntegrationMode: row.tracking_integration_mode || 'CARRIER_API',
            slotBookingManagement: row.slot_booking_management || 'CARRIER_MANAGED',
            carrierSlotBufferDays: Number(row.carrier_slot_buffer_days ?? 2),
            stackabilityHandling: row.stackability_handling || 'STRICT_LDM_NON_STACKABLE',
            ldmTaxableWeightRatioKg: Number(row.ldm_taxable_weight_ratio_kg ?? 1850.00),
            isActive: Boolean(row.is_active),
            source: row.printhouse_id ? 'PRINTHOUSE_CUSTOM' : 'PLATFORM_DEFAULT'
        });

        if (this.db && typeof this.db.query === 'function') {
            try {
                const sql = includePlatformDefaults
                    ? `SELECT * FROM freight_rate_matrices
                       WHERE is_active = TRUE AND (printhouse_id = ? OR printhouse_id IS NULL)
                       ORDER BY (printhouse_id IS NOT NULL) DESC, destination_country ASC, destination_postal_zone ASC`
                    : `SELECT * FROM freight_rate_matrices
                       WHERE is_active = TRUE AND printhouse_id = ?
                       ORDER BY destination_country ASC, destination_postal_zone ASC`;
                const rows = unwrapRows(await this.db.query(sql, [printhouseId]));
                if (rows.length > 0) {
                    return rows.map(normalizeRow);
                }
            } catch (_) {
                // Fallback below
            }
        }

        return DEFAULT_FREIGHT_MATRICES
            .filter(r => includePlatformDefaults || r.printhouse_id === printhouseId)
            .map(normalizeRow);
    }

    /**
     * Upserts freight rate matrices and/or packaging consumable rates for a printhouse,
     * or adopts the platform standard logistics matrix in 1 click (`adoptPlatformStandard = true`).
     */
    async upsertPrinthouseFreightMatrices(printhouseId, payload = {}) {
        if (!printhouseId) {
            const err = new Error('PRINTHOUSE_ID_REQUIRED: printhouseId is required to update freight matrices.');
            err.statusCode = 400;
            throw err;
        }

        const adoptPlatformStandard = Boolean(payload.adoptPlatformStandard);
        const inputMatrices = Array.isArray(payload.matrices) ? payload.matrices : [];
        const consumableRatesInput = payload.consumableRates || null;

        const savedMatrices = [];

        if (adoptPlatformStandard && inputMatrices.length === 0) {
            // Clone platform default matrices into printhouse-scoped rows so the printhouse can customize them later
            for (const tpl of DEFAULT_FREIGHT_MATRICES) {
                const matrixId = `frm-${printhouseId}-${tpl.destination_country.toLowerCase()}-${tpl.destination_postal_zone === '*' ? 'all' : tpl.destination_postal_zone}-${tpl.carrier_name.toLowerCase()}`;
                const rowObj = {
                    id: matrixId,
                    printhouse_id: printhouseId,
                    origin_country: payload.originCountry || tpl.origin_country,
                    origin_postal_zone: payload.originPostalZone || tpl.origin_postal_zone,
                    destination_country: tpl.destination_country,
                    destination_postal_zone: tpl.destination_postal_zone,
                    carrier_name: tpl.carrier_name,
                    transit_days_min: tpl.transit_days_min,
                    transit_days_max: tpl.transit_days_max,
                    pricing_mode: tpl.pricing_mode,
                    rate_tiers_json: tpl.rate_tiers_json,
                    fuel_surcharge_percent: tpl.fuel_surcharge_percent,
                    tail_lift_surcharge_eur: tpl.tail_lift_surcharge_eur,
                    is_active: true
                };

                if (this.db && typeof this.db.query === 'function') {
                    try {
                        await this.db.query(
                            `INSERT INTO freight_rate_matrices (
                                id, printhouse_id, origin_country, origin_postal_zone,
                                destination_country, destination_postal_zone, carrier_name,
                                transit_days_min, transit_days_max, pricing_mode, rate_tiers_json,
                                fuel_surcharge_percent, tail_lift_surcharge_eur, is_active
                             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
                             ON DUPLICATE KEY UPDATE
                                carrier_name = VALUES(carrier_name),
                                rate_tiers_json = VALUES(rate_tiers_json),
                                fuel_surcharge_percent = VALUES(fuel_surcharge_percent),
                                tail_lift_surcharge_eur = VALUES(tail_lift_surcharge_eur),
                                is_active = TRUE`,
                            [
                                rowObj.id,
                                rowObj.printhouse_id,
                                rowObj.origin_country,
                                rowObj.origin_postal_zone,
                                rowObj.destination_country,
                                rowObj.destination_postal_zone,
                                rowObj.carrier_name,
                                rowObj.transit_days_min,
                                rowObj.transit_days_max,
                                rowObj.pricing_mode,
                                JSON.stringify(rowObj.rate_tiers_json),
                                rowObj.fuel_surcharge_percent,
                                rowObj.tail_lift_surcharge_eur
                            ]
                        );
                    } catch (_) {
                        // Offline/mock tolerance
                    }
                }
                savedMatrices.push({
                    id: rowObj.id,
                    printhouseId,
                    originCountry: rowObj.origin_country,
                    originPostalZone: rowObj.origin_postal_zone,
                    destinationCountry: rowObj.destination_country,
                    destinationPostalZone: rowObj.destination_postal_zone,
                    carrierName: rowObj.carrier_name,
                    transitDaysMin: rowObj.transit_days_min,
                    transitDaysMax: rowObj.transit_days_max,
                    pricingMode: rowObj.pricing_mode,
                    rateTiers: rowObj.rate_tiers_json,
                    fuelSurchargePercent: rowObj.fuel_surcharge_percent,
                    tailLiftSurchargeEur: rowObj.tail_lift_surcharge_eur,
                    isActive: true,
                    source: 'PRINTHOUSE_ADOPTED_STANDARD'
                });
            }
        } else {
            for (let i = 0; i < inputMatrices.length; i++) {
                const m = inputMatrices[i] || {};
                const originCountry = String(m.originCountry || 'DE').toUpperCase();
                const originPostalZone = String(m.originPostalZone || '*');
                const destinationCountry = String(m.destinationCountry || 'DE').toUpperCase();
                const destinationPostalZone = String(m.destinationPostalZone || '*');
                const carrierName = String(m.carrierName || 'DACHSER').toUpperCase();
                const pricingMode = m.pricingMode || 'PER_PALLET_STEPPED';
                const transitDaysMin = Number(m.transitDaysMin || 1);
                const transitDaysMax = Number(m.transitDaysMax || 3);
                const fuelSurchargePercent = Number(m.fuelSurchargePercent || 0);
                const tailLiftSurchargeEur = Number(m.tailLiftSurchargeEur || 0);
                const trackingIntegrationMode = String(m.trackingIntegrationMode || m.tracking_integration_mode || 'CARRIER_API').toUpperCase();
                const slotBookingManagement = String(m.slotBookingManagement || m.slot_booking_management || 'CARRIER_MANAGED').toUpperCase();
                const carrierSlotBufferDays = Number(m.carrierSlotBufferDays ?? m.carrier_slot_buffer_days ?? 2);
                const stackabilityHandling = String(m.stackabilityHandling || m.stackability_handling || 'STRICT_LDM_NON_STACKABLE').toUpperCase();
                const ldmTaxableWeightRatioKg = Number(m.ldmTaxableWeightRatioKg ?? m.ldm_taxable_weight_ratio_kg ?? 1850.00);
                const rateTiers = m.rateTiers || m.rate_tiers_json || {
                    tiers: [
                        { minPallets: 1, maxPallets: 1, ratePerPalletEur: 85.00 },
                        { minPallets: 2, maxPallets: 5, ratePerPalletEur: 68.00 },
                        { minPallets: 6, maxPallets: 33, ratePerPalletEur: 52.00 }
                    ]
                };
                const id = m.id || `frm-${printhouseId}-${destinationCountry.toLowerCase()}-${destinationPostalZone === '*' ? 'all' : destinationPostalZone}-${carrierName.toLowerCase()}-${i + 1}`;

                if (this.db && typeof this.db.query === 'function') {
                    try {
                        await this.db.query(
                            `INSERT INTO freight_rate_matrices (
                                id, printhouse_id, origin_country, origin_postal_zone,
                                destination_country, destination_postal_zone, carrier_name,
                                transit_days_min, transit_days_max, pricing_mode, rate_tiers_json,
                                fuel_surcharge_percent, tail_lift_surcharge_eur,
                                tracking_integration_mode, slot_booking_management, carrier_slot_buffer_days,
                                stackability_handling, ldm_taxable_weight_ratio_kg, is_active
                             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
                             ON DUPLICATE KEY UPDATE
                                carrier_name = VALUES(carrier_name),
                                pricing_mode = VALUES(pricing_mode),
                                rate_tiers_json = VALUES(rate_tiers_json),
                                fuel_surcharge_percent = VALUES(fuel_surcharge_percent),
                                tail_lift_surcharge_eur = VALUES(tail_lift_surcharge_eur),
                                tracking_integration_mode = VALUES(tracking_integration_mode),
                                slot_booking_management = VALUES(slot_booking_management),
                                carrier_slot_buffer_days = VALUES(carrier_slot_buffer_days),
                                stackability_handling = VALUES(stackability_handling),
                                ldm_taxable_weight_ratio_kg = VALUES(ldm_taxable_weight_ratio_kg),
                                transit_days_min = VALUES(transit_days_min),
                                transit_days_max = VALUES(transit_days_max),
                                is_active = TRUE`,
                            [
                                id,
                                printhouseId,
                                originCountry,
                                originPostalZone,
                                destinationCountry,
                                destinationPostalZone,
                                carrierName,
                                transitDaysMin,
                                transitDaysMax,
                                pricingMode,
                                JSON.stringify(rateTiers),
                                fuelSurchargePercent,
                                tailLiftSurchargeEur,
                                trackingIntegrationMode,
                                slotBookingManagement,
                                carrierSlotBufferDays,
                                stackabilityHandling,
                                ldmTaxableWeightRatioKg
                            ]
                        );
                    } catch (_) {
                        // Offline/mock tolerance
                    }
                }

                savedMatrices.push({
                    id,
                    printhouseId,
                    originCountry,
                    originPostalZone,
                    destinationCountry,
                    destinationPostalZone,
                    carrierName,
                    transitDaysMin,
                    transitDaysMax,
                    pricingMode,
                    rateTiers,
                    fuelSurchargePercent,
                    tailLiftSurchargeEur,
                    trackingIntegrationMode,
                    slotBookingManagement,
                    carrierSlotBufferDays,
                    stackabilityHandling,
                    ldmTaxableWeightRatioKg,
                    isActive: true,
                    source: 'PRINTHOUSE_CUSTOM'
                });
            }
        }

        let savedConsumableRates = null;
        if (consumableRatesInput && typeof consumableRatesInput === 'object') {
            const pcrId = `pcr-${printhouseId}`;
            const euroPalletEpalEur = Number(consumableRatesInput.euroPalletEpalEur ?? 14.50);
            const cartonBoxStandardEur = Number(consumableRatesInput.cartonBoxStandardEur ?? 0.85);
            const stretchWrapPerPalletEur = Number(consumableRatesInput.stretchWrapPerPalletEur ?? 2.20);

            if (this.db && typeof this.db.query === 'function') {
                try {
                    await this.db.query(
                        `INSERT INTO packaging_consumable_rates (
                            id, printhouse_id, euro_pallet_epal_eur, carton_box_standard_eur, stretch_wrap_per_pallet_eur, is_active
                         ) VALUES (?, ?, ?, ?, ?, TRUE)
                         ON DUPLICATE KEY UPDATE
                            euro_pallet_epal_eur = VALUES(euro_pallet_epal_eur),
                            carton_box_standard_eur = VALUES(carton_box_standard_eur),
                            stretch_wrap_per_pallet_eur = VALUES(stretch_wrap_per_pallet_eur),
                            is_active = TRUE`,
                        [pcrId, printhouseId, euroPalletEpalEur, cartonBoxStandardEur, stretchWrapPerPalletEur]
                    );
                } catch (_) {
                    // Offline/mock tolerance
                }
            }

            savedConsumableRates = {
                id: pcrId,
                printhouseId,
                euroPalletEpalEur,
                cartonBoxStandardEur,
                stretchWrapPerPalletEur,
                source: 'PRINTHOUSE_CUSTOM'
            };
        } else {
            savedConsumableRates = await this.getPackagingConsumableRates(printhouseId);
        }

        return {
            printhouseId,
            adoptedPlatformStandard: adoptPlatformStandard,
            matricesCount: savedMatrices.length,
            matrices: savedMatrices,
            consumableRates: savedConsumableRates
        };
    }

    /**
     * Master Governed Service Orchestrator: `calculateFullLandedLogisticsQuote(quoteParams)`
     *
     * Combines:
     * 1. Authoritative warehouse profile from `getWarehouseProfileByCode`
     * 2. Persisted packaging consumable rates from `getPackagingConsumableRates`
     * 3. 3D cubing, carton packing, Euro-pallet stacking & run optimization from `packagingAndCubingEngine`
     * 4. Stepped LTL/FTL freight rate calculation from `resolveFreightRate`
     * 5. Full landed logistics cost summary (strictly segregated into packaging consumables + carrier freight).
     */
    async calculateFullLandedLogisticsQuote(quoteParams = {}) {
        const printhouseId = quoteParams.printhouseId || null;
        const warehouseProfileCode = quoteParams.warehouseProfileCode || 'ZEITFRACHT_ERFURT';

        // 1. Load warehouse delivery profile & packaging consumable rates
        const warehouseProfile = await this.getWarehouseProfileByCode(warehouseProfileCode);
        if (!warehouseProfile) {
            throw new Error(`WAREHOUSE_PROFILE_NOT_FOUND: Unknown warehouse profile '${warehouseProfileCode}'.`);
        }

        const consumableRates = await this.getPackagingConsumableRates(printhouseId);

        // 2. Execute pure 3D cubing & pallet calculation with persisted warehouse & consumable rates
        const cubingResult = executeLogisticsCubingCalculation({
            ...quoteParams,
            warehouseProfileCode: warehouseProfile.profileCode,
            customWarehouseProfile: warehouseProfile,
            packagingOptions: {
                ...(quoteParams.packagingOptions || {}),
                maxCartonWeightKg: (quoteParams.packagingOptions && quoteParams.packagingOptions.maxCartonWeightKg)
                    || warehouseProfile.maxCartonWeightKg,
                unitCartonCostEur: consumableRates.cartonBoxStandardEur,
                unitPalletCostEur: consumableRates.euroPalletEpalEur,
                stretchWrapCostPerPalletEur: consumableRates.stretchWrapPerPalletEur
            }
        });

        const totalPalletsRequired = cubingResult.palletStacking.orderBreakdown.totalPalletsRequired;
        const totalShipmentGrossWeightKg = cubingResult.palletStacking.orderBreakdown.totalShipmentGrossWeightKg;

        // 3. Resolve freight rate for the current run Q
        const originCountry = quoteParams.originCountry || 'DE';
        const originPostal = quoteParams.originPostal || '*';
        const destCountry = quoteParams.destCountry || warehouseProfile.countryCode || 'DE';
        const destPostal = quoteParams.destPostal || warehouseProfile.postalCode || '*';
        const requiresTailLift = Boolean(
            quoteParams.requiresTailLift !== undefined
                ? quoteParams.requiresTailLift
                : !warehouseProfile.requiresLoadingDock
        );

        // Initial freight matrix resolution to discover carrier's operational defaults if not explicitly overridden
        const initialFreightQuote = await this.resolveFreightRate({
            printhouseId,
            originCountry,
            originPostal,
            destCountry,
            destPostal,
            palletCount: totalPalletsRequired,
            grossWeightKg: totalShipmentGrossWeightKg,
            requiresTailLift
        });

        // Re-evaluate operational scenarios combining explicit caller options with resolved carrier matrix defaults
        const effectiveOperationalScenarios = calculateOperationalShippingScenarios({
            warehouseProfile,
            palletStacking: cubingResult.palletStacking,
            operationalOptions: {
                ...(quoteParams.operationalOptions || {}),
                stackabilityHandling:
                    (quoteParams.operationalOptions && quoteParams.operationalOptions.stackabilityHandling) ||
                    quoteParams.stackabilityHandling ||
                    quoteParams.stackability_handling ||
                    initialFreightQuote.stackabilityHandling,
                ldmTaxableWeightRatioKg:
                    (quoteParams.operationalOptions && quoteParams.operationalOptions.ldmTaxableWeightRatioKg) ??
                    quoteParams.ldmTaxableWeightRatioKg ??
                    quoteParams.ldm_taxable_weight_ratio_kg ??
                    initialFreightQuote.ldmTaxableWeightRatioKg,
                slotBookingManagement:
                    (quoteParams.operationalOptions && quoteParams.operationalOptions.slotBookingManagement) ||
                    quoteParams.slotBookingManagement ||
                    quoteParams.slot_booking_management ||
                    initialFreightQuote.slotBookingManagement,
                carrierSlotBufferDays:
                    (quoteParams.operationalOptions && quoteParams.operationalOptions.carrierSlotBufferDays) ??
                    quoteParams.carrierSlotBufferDays ??
                    quoteParams.carrier_slot_buffer_days ??
                    initialFreightQuote.carrierSlotBufferDays,
                trackingIntegrationMode:
                    (quoteParams.operationalOptions && quoteParams.operationalOptions.trackingIntegrationMode) ||
                    quoteParams.trackingIntegrationMode ||
                    quoteParams.tracking_integration_mode ||
                    initialFreightQuote.trackingIntegrationMode,
                transitDaysMin: initialFreightQuote.transitDaysMin,
                transitDaysMax: initialFreightQuote.transitDaysMax
            }
        });

        cubingResult.operationalScenarios = effectiveOperationalScenarios;

        // Re-evaluate freight rate with effective floor positions and taxable weight from operational scenarios
        const freightQuote = await this.resolveFreightRate({
            printhouseId,
            originCountry,
            originPostal,
            destCountry,
            destPostal,
            palletCount: totalPalletsRequired,
            floorPositionsUsed: effectiveOperationalScenarios.stackabilityAndLdm.floorPositionsUsed,
            grossWeightKg: totalShipmentGrossWeightKg,
            taxableWeightKg: effectiveOperationalScenarios.stackabilityAndLdm.taxableWeightKg,
            requiresTailLift
        });

        // Synchronize effective transit days and operational modes onto freightQuote
        freightQuote.stackabilityHandling = effectiveOperationalScenarios.stackabilityAndLdm.stackabilityModeApplied;
        freightQuote.slotBookingManagement = effectiveOperationalScenarios.slotBookingActionPlan.managementMode;
        freightQuote.trackingIntegrationMode = effectiveOperationalScenarios.trackingProtocol.mode;
        freightQuote.estimatedTransitDaysEffectiveMin = effectiveOperationalScenarios.slotBookingActionPlan.estimatedTransitDaysEffectiveMin;
        freightQuote.estimatedTransitDaysEffectiveMax = effectiveOperationalScenarios.slotBookingActionPlan.estimatedTransitDaysEffectiveMax;
        freightQuote.estimatedTransitDaysEffective = effectiveOperationalScenarios.slotBookingActionPlan.estimatedTransitDaysEffective;
        freightQuote.ldmTotal = effectiveOperationalScenarios.stackabilityAndLdm.ldmTotal;
        freightQuote.floorPositionsUsed = effectiveOperationalScenarios.stackabilityAndLdm.floorPositionsUsed;
        freightQuote.taxableWeightKg = effectiveOperationalScenarios.stackabilityAndLdm.taxableWeightKg;

        const packagingMaterialsEur = cubingResult.packagingMaterialsCostBreakdownEur.totalPackagingMaterialsEur;
        const carrierFreightEur = freightQuote.totalFreightEur;
        const totalLandedLogisticsCostEur = roundToPrecision(
            packagingMaterialsEur + carrierFreightEur,
            2
        );
        const requestedQuantity = cubingResult.palletStacking.orderBreakdown.requestedQuantity;
        const logisticsCostPerCopyEur = roundToPrecision(
            totalLandedLogisticsCostEur / requestedQuantity,
            4
        );

        const opScenarios = cubingResult.operationalScenarios;
        const quoteSummary = {
            warehouseProfile,
            consumableRates,
            cubing: cubingResult,
            operationalScenarios: opScenarios,
            logisticsCubing: {
                warehouseProfileCode: warehouseProfile.profileCode,
                warehouseDisplayName: warehouseProfile.displayName,
                palletCount: totalPalletsRequired,
                fullPalletsCount: cubingResult.palletStacking.orderBreakdown.fullPalletsCount,
                layersPerPallet: cubingResult.palletStacking.fullPalletSpecs.layersPerFullPallet,
                cartonsPerLayer: cubingResult.palletStacking.layerTiling.cartonsPerLayer,
                booksPerCarton: cubingResult.cartonPacking.booksPerCarton,
                totalCartons: cubingResult.palletStacking.orderBreakdown.totalCartonsRequired,
                unitNetWeightKg: cubingResult.unitBook.weightBreakdownKg.unitNetWeightKg,
                grossCartonWeightKg: cubingResult.cartonPacking.grossCartonWeightKg,
                totalGrossWeightKg: totalShipmentGrossWeightKg,
                taxableWeightKg: opScenarios.stackabilityAndLdm.taxableWeightKg,
                ldmTotal: opScenarios.stackabilityAndLdm.ldmTotal,
                floorPositionsUsed: opScenarios.stackabilityAndLdm.floorPositionsUsed,
                stackabilityModeApplied: opScenarios.stackabilityAndLdm.stackabilityModeApplied,
                estimatedTransitDaysEffective: opScenarios.slotBookingActionPlan.estimatedTransitDaysEffective,
                slotBookingActionPlan: opScenarios.slotBookingActionPlan,
                trackingMode: opScenarios.trackingProtocol.mode,
                trackingProtocol: opScenarios.trackingProtocol,
                volumetricEfficiency: cubingResult.runOptimization.fleetEfficiency.fleetVolumetricEfficiencyRatio,
                weightEfficiency: cubingResult.runOptimization.fleetEfficiency.fleetWeightEfficiencyRatio,
                lastPalletCapacityRatio: cubingResult.runOptimization.lastPalletCapacityUtilizationRatio,
                warehouseValidation: cubingResult.warehouseValidation,
                runOptimizationRecommendations: cubingResult.runOptimization.recommendations
            },
            freightQuote,
            landedLogisticsCostSummaryEur: {
                packagingMaterialsCostEur: packagingMaterialsEur,
                carrierFreightCostEur: carrierFreightEur,
                potentialWarehousePenaltiesEur: cubingResult.warehouseValidation.totalPotentialPenaltyEur,
                totalLandedLogisticsCostEur,
                logisticsCostPerCopyEur
            }
        };

        return {
            ...quoteSummary,
            quoteCanonicalHash: computeCanonicalHash({
                cubingOutputHash: cubingResult.outputCanonicalHash,
                freightQuote,
                landedLogisticsCostSummaryEur: quoteSummary.landedLogisticsCostSummaryEur
            })
        };
    }
}

module.exports = {
    DEFAULT_FREIGHT_MATRICES,
    DEFAULT_CONSUMABLE_RATES,
    LogisticsDatabaseService,
    mapDbRowToWarehouseProfile,
    extractPostalPrefix,
    evaluateFreightMatrixRow
};

