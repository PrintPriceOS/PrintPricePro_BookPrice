'use strict';

/**
 * src/api/services/logistics/ssccGeneratorService.js
 *
 * PrintPrice OS — Phase 198C (LOGISTICS-05): GS1-128 / SSCC-18 (Serial Shipping Container Code / NVE)
 * Deterministic Algorithm, Check Digit Calculator & Code128C / GS1-128 Bar Pattern Encoder.
 *
 * Responsibilities:
 * 1. Compute and verify the official GS1 Modulo-10 Check Digit (alternating weights x3 and x1 from right to left).
 * 2. Generate deterministic 18-digit SSCC / NVE identifiers:
 *    - Extension Digit (1 digit, default '0' or '3')
 *    - GS1 Company Prefix (7 to 9 digits, configurable per printhouse/tenant)
 *    - Serial Reference (padded to complete 17 payload digits before check digit)
 *    - GS1 Modulo-10 Check Digit (1 digit)
 * 3. Format both Human-Readable Interpretation (HRI) strings with Application Identifier (00),
 *    e.g. `(00) 0 8412345 000000001 8`, and raw GS1-128 strings (`(00)084123450000000018`).
 * 4. Encode GS1-128 Subset C (`Start C` + `FNC1` + `00` + 18 digits -> 10 digit pairs + Modulo-103 checksum + `Stop`)
 *    into exact bar/space module widths for high-resolution vector PDF rendering.
 */

const GS1_APPLICATION_IDENTIFIER_SSCC = '00';
const DEFAULT_GS1_COMPANY_PREFIX = '8412345';

/**
 * Official Code 128 module width patterns (symbols 0 to 106).
 * Each pattern defines alternating bar/space widths in modules (11 modules per symbol, 13 for Stop [106]).
 */
const CODE128_PATTERNS = Object.freeze([
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
]);

const CODE128_START_C = 105;
const CODE128_FNC1 = 102;
const CODE128_STOP = 106;

/**
 * Strips non-digit characters from an input value.
 */
function sanitizeDigits(value) {
    return String(value ?? '').replace(/\D+/g, '');
}

/**
 * Computes the official GS1 Modulo-10 Check Digit for a numeric payload (typically 17 digits for SSCC).
 *
 * GS1 Modulo-10 Algorithm:
 * 1. Starting from the rightmost digit of the payload (position 1 from the right),
 *    multiply alternating digits by weights 3 and 1 (3, 1, 3, 1, ...).
 * 2. Sum all weighted products.
 * 3. Check digit = (10 - (sum % 10)) % 10.
 *
 * @param {string|number} payload17Digits - 17-digit numeric string (or any GS1 numeric base without check digit).
 * @returns {number} Single check digit (0-9).
 */
function calculateGs1Mod10CheckDigit(payload17Digits) {
    const clean = String(payload17Digits ?? '').trim();
    if (!/^\d+$/.test(clean) || clean.length === 0) {
        throw new Error('INVALID_GS1_PAYLOAD: Payload for GS1 Modulo-10 calculation must contain only digits.');
    }

    let sum = 0;
    for (let i = 0; i < clean.length; i++) {
        const digit = Number(clean[clean.length - 1 - i]);
        const weight = i % 2 === 0 ? 3 : 1;
        sum += digit * weight;
    }

    return (10 - (sum % 10)) % 10;
}

/**
 * Validates a full 18-digit SSCC (or `(00)` prefixed string) against the GS1 Modulo-10 check digit rule.
 *
 * @param {string} ssccInput - 18-digit SSCC or HRI string like `(00) 0 8412345 000000001 8`.
 * @returns {boolean} True if valid 18-digit SSCC with matching check digit.
 */
function validateSscc18(ssccInput) {
    if (ssccInput === null || ssccInput === undefined) return false;
    let digits = String(ssccInput).trim();
    // Strip optional leading AI (00)
    if (digits.startsWith('(00)')) {
        digits = digits.slice(4);
    }
    digits = sanitizeDigits(digits);
    if (digits.length === 20 && digits.startsWith('00')) {
        digits = digits.slice(2);
    }
    if (digits.length !== 18) {
        return false;
    }

    const base17 = digits.slice(0, 17);
    const providedCheck = Number(digits[17]);
    const expectedCheck = calculateGs1Mod10CheckDigit(base17);
    return providedCheck === expectedCheck;
}

/**
 * Encodes a 20-digit GS1-128 numeric string (`00` + 18-digit SSCC) using Code 128 Subset C
 * with leading `Start C` (105) + `FNC1` (102) + 10 digit pairs + Modulo-103 Checksum + `Stop` (106).
 *
 * @param {string} sscc18 - 18-digit SSCC string.
 * @returns {object} Vector bar pattern specification for PDF rendering.
 */
function encodeGs1128BarcodeModules(sscc18) {
    const cleanSscc = sanitizeDigits(sscc18);
    if (cleanSscc.length !== 18) {
        throw new Error(`INVALID_SSCC_LENGTH: Expected 18 digits for GS1-128 encoding, got ${cleanSscc.length}.`);
    }

    const fullDataDigits = `${GS1_APPLICATION_IDENTIFIER_SSCC}${cleanSscc}`; // 20 digits (even length for Code 128C)
    const symbolValues = [CODE128_START_C, CODE128_FNC1];

    for (let i = 0; i < fullDataDigits.length; i += 2) {
        const pairValue = Number(fullDataDigits.slice(i, i + 2));
        symbolValues.push(pairValue);
    }

    // Compute Code 128 Modulo-103 checksum:
    // Start symbol value * 1 + sum(position * symbolValue) for position = 1..N
    let weightedSum = symbolValues[0];
    for (let pos = 1; pos < symbolValues.length; pos++) {
        weightedSum += pos * symbolValues[pos];
    }
    const mod103CheckSymbol = weightedSum % 103;
    symbolValues.push(mod103CheckSymbol);
    symbolValues.push(CODE128_STOP);

    const bars = [];
    let currentModuleOffset = 0;

    for (const sym of symbolValues) {
        const pattern = CODE128_PATTERNS[sym];
        for (let idx = 0; idx < pattern.length; idx++) {
            const widthModules = Number(pattern[idx]);
            const isBar = idx % 2 === 0;
            if (isBar) {
                bars.push({
                    moduleOffset: currentModuleOffset,
                    widthModules
                });
            }
            currentModuleOffset += widthModules;
        }
    }

    return {
        symbology: 'GS1-128',
        codeSet: 'C',
        fnc1Prefix: true,
        applicationIdentifier: GS1_APPLICATION_IDENTIFIER_SSCC,
        encodedDigits: fullDataDigits,
        symbolValues,
        mod103CheckSymbol,
        totalModules: currentModuleOffset,
        bars
    };
}

/**
 * Generates a single GS1-compliant SSCC-18 (Serial Shipping Container Code / NVE) object.
 *
 * Structure of SSCC-18 (18 digits total):
 * - Digit 1: Extension digit (0-9, default '0')
 * - Digits 2..(1+L): GS1 Company Prefix (7 to 9 digits, e.g. '8412345')
 * - Next (16 - L) digits: Serial Reference (zero-padded to fill 16 digits together with company prefix)
 * - Digit 18: GS1 Modulo-10 Check Digit
 *
 * @param {object} options
 * @param {number|string} [options.extensionDigit='0'] - 1 digit (0-9).
 * @param {string} [options.companyPrefix='8412345'] - 7 to 9 digit GS1 Company Prefix.
 * @param {number|string} [options.serialReference=1] - Sequential pallet reference (6 to 8 digits depending on prefix length).
 * @returns {object} Detailed SSCC-18 structure with formatted HRI, raw string, and vector barcode data.
 */
function generateSscc18(options = {}) {
    const extensionDigitStr = sanitizeDigits(options.extensionDigit ?? '0').slice(0, 1) || '0';
    const rawPrefix = sanitizeDigits(options.companyPrefix || DEFAULT_GS1_COMPANY_PREFIX);

    if (rawPrefix.length < 7 || rawPrefix.length > 9) {
        throw new Error(
            `INVALID_GS1_COMPANY_PREFIX: GS1 company prefix must be between 7 and 9 digits (received '${options.companyPrefix}').`
        );
    }

    const serialLength = 16 - rawPrefix.length; // 9 digits for 7-digit prefix, 8 for 8-digit, 7 for 9-digit
    const rawSerialDigits = sanitizeDigits(options.serialReference ?? 1);
    if (!rawSerialDigits) {
        throw new Error('INVALID_SERIAL_REFERENCE: serialReference must contain at least one digit.');
    }

    const paddedSerial = rawSerialDigits.length > serialLength
        ? rawSerialDigits.slice(-serialLength)
        : rawSerialDigits.padStart(serialLength, '0');

    const payload17 = `${extensionDigitStr}${rawPrefix}${paddedSerial}`;
    const checkDigit = calculateGs1Mod10CheckDigit(payload17);
    const sscc18 = `${payload17}${checkDigit}`;

    // Formatted HRI with spaces: (00) E PPPPPPP SSSSSSSSS C
    const hriFormatted = `(00) ${extensionDigitStr} ${rawPrefix} ${paddedSerial} ${checkDigit}`;
    const gs1128Plain = `(00)${sscc18}`;
    const barcodeData = `00${sscc18}`;
    const barcodeEncoding = encodeGs1128BarcodeModules(sscc18);

    return {
        applicationIdentifier: GS1_APPLICATION_IDENTIFIER_SSCC,
        extensionDigit: extensionDigitStr,
        companyPrefix: rawPrefix,
        serialReference: paddedSerial,
        payload17,
        checkDigit,
        sscc18,
        plainSscc18: sscc18,
        barcodeData,
        gs1128Plain,
        hriFormatted,
        isValid: true,
        barcodeEncoding
    };
}

/**
 * Generates a deterministic batch of SSCC-18 codes for all pallets in a shipment.
 *
 * @param {object} params
 * @param {number} [params.palletCount=1] - Total pallets in shipment.
 * @param {string} [params.companyPrefix='8412345'] - Printhouse/tenant GS1 company prefix (7-9 digits).
 * @param {number|string} [params.extensionDigit='0'] - Extension digit.
 * @param {number|string} [params.startSerial=1] - Starting sequential reference.
 * @returns {Array<object>} List of SSCC-18 descriptors for pallets 1..N.
 */
function generateShipmentSsccBatch({
    palletCount = 1,
    companyPrefix = DEFAULT_GS1_COMPANY_PREFIX,
    extensionDigit = '0',
    startSerial = 1
} = {}) {
    const count = Math.max(1, Math.ceil(Number(palletCount || 1)));
    const baseSerial = Math.max(1, Number(sanitizeDigits(startSerial) || 1));
    const batch = [];

    for (let i = 0; i < count; i++) {
        const palletNumber = i + 1;
        const sscc = generateSscc18({
            extensionDigit,
            companyPrefix,
            serialReference: baseSerial + i
        });
        batch.push({
            palletIndex: palletNumber,
            palletTotal: count,
            palletLabel: `Pallet ${palletNumber} of ${count}`,
            ...sscc
        });
    }

    return batch;
}

module.exports = {
    GS1_APPLICATION_IDENTIFIER_SSCC,
    DEFAULT_GS1_COMPANY_PREFIX,
    CODE128_PATTERNS,
    calculateGs1Mod10CheckDigit,
    validateSscc18,
    encodeGs1128BarcodeModules,
    generateSscc18,
    generateShipmentSsccBatch
};

