'use strict';

/**
 * src/api/services/logistics/deliveryNotePdfService.js
 *
 * PrintPrice OS — Phase 198C (LOGISTICS-05): Automated GS1-128 SSCC Pallet Labels (A6 / A4 4-UP)
 * & Industrial DIN A4 Delivery Note / Lieferschein Vector PDF Generator.
 *
 * Capabilities:
 * 1. Pure Node.js PDF 1.4 vector engine (zero native C++ dependencies; uses Type1 Helvetica,
 *    Helvetica-Bold, and Courier monospace fonts with WinAnsi encoding for full DE/ES/EN umlaut support).
 * 2. Generates A6 (105 x 148 mm) GS1-128 SSCC thermal pallet labels (1 page per pallet) or
 *    A4 4-UP sheet layout (`format = 'A4_SHEET_4UP'`):
 *    - Top Block: Sender (Printhouse), Consignee & Warehouse Delivery Profile (e.g. Zeitfracht Erfurt / VVA Arvato)
 *      with GLN, PO Number, ISBN, and Dispatch Date.
 *    - Middle Block: `Pallet X of Y`, Total copies, FEFCO 0201 cartons count, books/carton,
 *      pallet total height (mm), gross/net weight (kg), and dock slot warnings (`SLOT BOOKED / 48H AVIS`).
 *    - Bottom Block: High-resolution vector GS1-128 barcode with FNC1, >= 32 mm bar height, >= 5 mm quiet zones,
 *      and crisp Courier monospace HRI `(00) 0 8412345 000000001 8` underneath.
 * 3. Generates DIN A4 Portrait (210 x 297 mm) Official Delivery Note / Lieferschein:
 *    - Industrial grayscale layout with PrintPriceOS corporate red (`#DC0000`) accent rule.
 *    - Full fiscal header for Shipper (Printhouse) and Consignee/Warehouse.
 *    - Production & Editorial metadata: PO Number, ISBN, Book Title, Trim Format, Pages, Binding.
 *    - Palletized Shipment Breakdown Table: Individual SSCC-18 per Euro-Pallet EPAL (1200x800 mm),
 *      FEFCO 0201 cartons, copies, height (mm), net & gross weight (kg).
 *    - Transport Control Block: Loading Meters (0.4 LDM/pallet), Chargeable/Taxable weight (kg),
 *      Stackability Mode (`STRICT_LDM_NON_STACKABLE` / `DOUBLE_DECK_SUPPORTED`), and Assigned Dock Slot.
 *    - Euro-Pallet EPAL Exchange Control Box (14-day return/voucher tracking — Palettenschein).
 *    - CMR / Proof of Delivery (POD) signature boxes: Carrier signature, Vehicle Registration Plate,
 *      and Warehouse Dock Receiving Stamp.
 */

const {
    generateSscc18,
    encodeGs1128BarcodeModules,
    validateSscc18,
    DEFAULT_GS1_COMPANY_PREFIX
} = require('./ssccGeneratorService');
const {
    BUILTIN_WAREHOUSE_PROFILES,
    executeLogisticsCubingCalculation
} = require('./packagingAndCubingEngine');
const {
    roundToPrecision
} = require('../spine/spineCalculationEngine');

const MM_TO_PT = 72 / 25.4; // 1 mm = 2.8346456693 pt

const PAGE_FORMATS_MM = Object.freeze({
    A6: Object.freeze({ widthMm: 105, heightMm: 148 }),
    A4: Object.freeze({ widthMm: 210, heightMm: 297 })
});

/**
 * Converts millimeters to PDF points (1/72 inch).
 */
function mmToPt(mm) {
    return Number((Number(mm) * MM_TO_PT).toFixed(3));
}

/**
 * Encodes a JS string into PDF literal string syntax with WinAnsi octal escapes for non-ASCII chars
 * (supports German umlauts äöüßÄÖÜ, Spanish ñáéíóú, Euro sign, etc.).
 */
function escapePdfText(text) {
    const str = String(text ?? '')
        .replace(/€/g, 'EUR ')
        .replace(/—/g, '-')
        .replace(/–/g, '-');
    let out = '';
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code === 0x28) {
            out += '\\(';
        } else if (code === 0x29) {
            out += '\\)';
        } else if (code === 0x5c) {
            out += '\\\\';
        } else if (code >= 32 && code <= 126) {
            out += str[i];
        } else if (code >= 160 && code <= 255) {
            out += '\\' + code.toString(8).padStart(3, '0');
        } else {
            out += ' ';
        }
    }
    return out;
}

/**
 * Lightweight, deterministic PDF 1.4 Vector Document Builder.
 * Produces binary PDF buffers with exact cross-reference (xref) byte offsets.
 */
class VectorPdfBuilder {
    constructor({ widthMm = 210, heightMm = 297, title = 'PrintPriceOS Logistics Document' } = {}) {
        this.defaultWidthPt = mmToPt(widthMm);
        this.defaultHeightPt = mmToPt(heightMm);
        this.title = title;
        this.pages = [];
        this.currentPage = null;
    }

    addPage({ widthMm, heightMm } = {}) {
        const widthPt = widthMm ? mmToPt(widthMm) : this.defaultWidthPt;
        const heightPt = heightMm ? mmToPt(heightMm) : this.defaultHeightPt;
        const page = {
            widthPt,
            heightPt,
            ops: []
        };
        this.pages.push(page);
        this.currentPage = page;
        return this;
    }

    ensurePage() {
        if (!this.currentPage) {
            this.addPage();
        }
        return this.currentPage;
    }

    /**
     * Converts top-down millimeter coordinates (xMm, yMm from top-left) into PDF bottom-up points.
     */
    toPdfY(yMm, heightMm = 0) {
        const page = this.ensurePage();
        return Number((page.heightPt - mmToPt(yMm) - mmToPt(heightMm)).toFixed(3));
    }

    setFillColorRgb(r, g, b) {
        const page = this.ensurePage();
        page.ops.push(`${Number(r).toFixed(3)} ${Number(g).toFixed(3)} ${Number(b).toFixed(3)} rg`);
        return this;
    }

    setStrokeColorRgb(r, g, b) {
        const page = this.ensurePage();
        page.ops.push(`${Number(r).toFixed(3)} ${Number(g).toFixed(3)} ${Number(b).toFixed(3)} RG`);
        return this;
    }

    setLineWidthPt(widthPt) {
        const page = this.ensurePage();
        page.ops.push(`${Number(widthPt).toFixed(2)} w`);
        return this;
    }

    drawRectMm(xMm, yMm, wMm, hMm, { fill = false, stroke = true } = {}) {
        const page = this.ensurePage();
        const x = mmToPt(xMm);
        const y = this.toPdfY(yMm, hMm);
        const w = mmToPt(wMm);
        const h = mmToPt(hMm);
        const op = fill && stroke ? 'B' : (fill ? 'f' : 'S');
        page.ops.push(`${x} ${y} ${w} ${h} re ${op}`);
        return this;
    }

    drawLineMm(x1Mm, y1Mm, x2Mm, y2Mm) {
        const page = this.ensurePage();
        const x1 = mmToPt(x1Mm);
        const y1 = this.toPdfY(y1Mm, 0);
        const x2 = mmToPt(x2Mm);
        const y2 = this.toPdfY(y2Mm, 0);
        page.ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
        return this;
    }

    /**
     * Draws text at top-left millimeter coordinate (xMm, yMm baseline from top).
     * Fonts: 'F1' = Helvetica, 'F2' = Helvetica-Bold, 'F3' = Courier, 'F4' = Courier-Bold.
     */
    drawTextMm(text, xMm, yMm, { font = 'F1', sizePt = 9, colorRgb = [0, 0, 0] } = {}) {
        const page = this.ensurePage();
        const x = mmToPt(xMm);
        const y = this.toPdfY(yMm, 0);
        const [r, g, b] = colorRgb;
        const escaped = escapePdfText(text);
        page.ops.push(
            `BT /${font} ${Number(sizePt).toFixed(2)} Tf ${Number(r).toFixed(3)} ${Number(g).toFixed(3)} ${Number(b).toFixed(3)} rg ${x} ${y} Td (${escaped}) Tj ET`
        );
        return this;
    }

    /**
     * Compiles all pages, fonts, and streams into an IEEE/ISO-compliant PDF-1.4 binary Buffer.
     */
    toBuffer() {
        if (this.pages.length === 0) {
            this.addPage();
        }

        // Object ID allocation:
        // 1: Catalog
        // 2: Pages Tree
        // 3: Font F1 (Helvetica)
        // 4: Font F2 (Helvetica-Bold)
        // 5: Font F3 (Courier)
        // 6: Font F4 (Courier-Bold)
        // 7: Info Dictionary
        // For each page i (0..N-1):
        //   pageObjId = 8 + i * 2
        //   contentObjId = 9 + i * 2
        const objects = new Map();

        const pageObjectIds = this.pages.map((_, idx) => 8 + idx * 2);

        objects.set(1, `<< /Type /Catalog /Pages 2 0 R >>`);
        objects.set(
            2,
            `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`
        );
        objects.set(3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
        objects.set(4, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
        objects.set(5, `<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>`);
        objects.set(6, `<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>`);
        objects.set(
            7,
            `<< /Title (${escapePdfText(this.title)}) /Producer (PrintPriceOS Logistics Control Plane LOGISTICS-05) /Creator (PrintPriceOS) >>`
        );

        this.pages.forEach((page, idx) => {
            const pageObjId = 8 + idx * 2;
            const contentObjId = 9 + idx * 2;
            const streamContent = page.ops.join('\n') + '\n';
            const streamByteLength = Buffer.byteLength(streamContent, 'latin1');

            objects.set(
                pageObjId,
                `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.widthPt} ${page.heightPt}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${contentObjId} 0 R >>`
            );
            objects.set(
                contentObjId,
                `<< /Length ${streamByteLength} >>\nstream\n${streamContent}endstream`
            );
        });

        const totalObjects = 7 + this.pages.length * 2;
        const chunks = [];
        const offsets = new Array(totalObjects + 1).fill(0);
        let currentByteOffset = 0;

        const pushChunk = str => {
            const buf = Buffer.from(str, 'latin1');
            chunks.push(buf);
            currentByteOffset += buf.length;
        };

        // PDF 1.4 Header + binary high-bit comment marker
        pushChunk('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

        for (let objId = 1; objId <= totalObjects; objId++) {
            offsets[objId] = currentByteOffset;
            const body = objects.get(objId);
            pushChunk(`${objId} 0 obj\n${body}\nendobj\n`);
        }

        const xrefStartOffset = currentByteOffset;
        pushChunk(`xref\n0 ${totalObjects + 1}\n`);
        pushChunk(`0000000000 65535 f \n`);
        for (let objId = 1; objId <= totalObjects; objId++) {
            const paddedOffset = String(offsets[objId]).padStart(10, '0');
            pushChunk(`${paddedOffset} 00000 n \n`);
        }

        pushChunk(
            `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefStartOffset}\n%%EOF\n`
        );

        return Buffer.concat(chunks);
    }
}

/**
 * Normalizes a shipment input or id into a complete, deterministic shipment specification
 * containing shipper, consignee/warehouse, book metadata, pallet breakdown with SSCC-18 codes,
 * and transport control metrics (LDM, taxable weight, stackability, slot booking).
 */
function normalizeShipmentForDocuments(shipmentId, rawInput = {}) {
    const id = String(shipmentId || rawInput.shipmentId || rawInput.id || 'SHP-2026-0001').trim();
    const warehouseProfileCode = String(
        rawInput.warehouseProfileCode ||
        rawInput.warehouse_profile_code ||
        (rawInput.consignee && rawInput.consignee.warehouseProfileCode) ||
        'ZEITFRACHT_ERFURT'
    ).toUpperCase();

    const warehouseProfile =
        BUILTIN_WAREHOUSE_PROFILES[warehouseProfileCode] ||
        BUILTIN_WAREHOUSE_PROFILES.ZEITFRACHT_ERFURT;

    const defaultGlnByWarehouse = {
        ZEITFRACHT_ERFURT: '4026635000006',
        ARVATO_VVA_GUETERSLOH: '4002693000002',
        VVA_ARVATO_GUTERSLOH: '4002693000002',
        AMAZON_EU_FBA_STD: '5450534000007',
        STANDARD_COMMERCIAL_DOCK: '4000001000005'
    };

    const defaultAddressByWarehouse = {
        ZEITFRACHT_ERFURT: {
            name: 'Zeitfracht Medien GmbH — Logistikzentrum Erfurt (Halle 1)',
            street: 'Ferdinand-Jühlke-Straße 7',
            postalCode: '99098',
            city: 'Erfurt',
            country: 'DE',
            gln: defaultGlnByWarehouse.ZEITFRACHT_ERFURT,
            dockNotice: 'SLOT BOOKED / 48H AVIS REQUIRED (Halle 1 / Tor 14)'
        },
        ARVATO_VVA_GUETERSLOH: {
            name: 'VVA — Vereinigte Verlagsauslieferung (Arvato / Bertelsmann)',
            street: 'An der Autobahn 100',
            postalCode: '33334',
            city: 'Gütersloh',
            country: 'DE',
            gln: defaultGlnByWarehouse.ARVATO_VVA_GUETERSLOH,
            dockNotice: 'SLOT BOOKED / 24H AVIS — FLAT TOP LAYER MANDATORY'
        },
        VVA_ARVATO_GUTERSLOH: {
            name: 'VVA — Vereinigte Verlagsauslieferung (Arvato / Bertelsmann)',
            street: 'An der Autobahn 100',
            postalCode: '33334',
            city: 'Gütersloh',
            country: 'DE',
            gln: defaultGlnByWarehouse.VVA_ARVATO_GUTERSLOH,
            dockNotice: 'SLOT BOOKED / 24H AVIS — FLAT TOP LAYER MANDATORY'
        }
    };

    const whDefaults = defaultAddressByWarehouse[warehouseProfileCode] || {
        name: warehouseProfile.displayName,
        street: 'Industriestraße 10',
        postalCode: '99098',
        city: 'Erfurt',
        country: warehouseProfile.countryCode || 'DE',
        gln: defaultGlnByWarehouse.STANDARD_COMMERCIAL_DOCK,
        dockNotice: 'SLOT BOOKED / 48H AVIS'
    };

    const shipper = {
        name: (rawInput.shipper && rawInput.shipper.name) || rawInput.printhouseName || 'PrintPriceOS Partner Druckerei GmbH',
        taxId: (rawInput.shipper && rawInput.shipper.taxId) || rawInput.printhouseVatId || 'DE298410552',
        street: (rawInput.shipper && rawInput.shipper.street) || 'Gutenbergstraße 42',
        postalCode: (rawInput.shipper && rawInput.shipper.postalCode) || rawInput.originPostal || '80331',
        city: (rawInput.shipper && rawInput.shipper.city) || 'München',
        country: (rawInput.shipper && rawInput.shipper.country) || rawInput.originCountry || 'DE',
        companyPrefix: String(
            (rawInput.shipper && rawInput.shipper.companyPrefix) ||
            rawInput.companyPrefix ||
            rawInput.gs1CompanyPrefix ||
            DEFAULT_GS1_COMPANY_PREFIX
        )
    };

    const consignee = {
        name: (rawInput.consignee && rawInput.consignee.name) || whDefaults.name,
        warehouseProfileCode,
        street: (rawInput.consignee && rawInput.consignee.street) || whDefaults.street,
        postalCode: (rawInput.consignee && rawInput.consignee.postalCode) || rawInput.destPostal || whDefaults.postalCode,
        city: (rawInput.consignee && rawInput.consignee.city) || whDefaults.city,
        country: (rawInput.consignee && rawInput.consignee.country) || rawInput.destCountry || whDefaults.country,
        gln: (rawInput.consignee && rawInput.consignee.gln) || rawInput.gln || whDefaults.gln,
        publisherCustomerName:
            (rawInput.consignee && rawInput.consignee.publisherCustomerName) ||
            rawInput.customerName ||
            'Suhrkamp / Insel Editorial Distribution'
    };

    const orderMeta = {
        shipmentId: id,
        poNumber: rawInput.poNumber || rawInput.po_number || `PO-${id.replace(/^SHP-/i, '')}`,
        isbn: rawInput.isbn || '978-3-518-42910-5',
        bookTitle: rawInput.bookTitle || rawInput.title || 'Die industrielle Buchproduktion — Kompendium',
        formatLabel: rawInput.formatLabel || `${rawInput.trimWidthMm || 148} x ${rawInput.trimHeightMm || 210} mm (DIN A5)`,
        pages: Number(rawInput.pages || 256),
        binding: rawInput.binding || rawInput.bindingCategory || 'SOFTCOVER_SEWN (FEFCO 0201)',
        dispatchDate: rawInput.dispatchDate || '2026-10-31',
        assignedSlotNumber: rawInput.assignedSlotNumber || 'SLOT-EF-48H-0930',
        dockWarning: rawInput.dockWarning || whDefaults.dockNotice,
        carrierName: rawInput.carrierName || 'DACHSER SE Book Logistics',
        vehiclePlate: rawInput.vehiclePlate || 'M-DS 4820'
    };

    // Determine cubing & pallet breakdown:
    // If caller provides explicit `pallets` array, normalize each pallet; otherwise run or derive from cubing.
    let cubing = rawInput.cubing || null;
    if (!cubing && (rawInput.trimWidthMm || rawInput.quantity)) {
        try {
            cubing = executeLogisticsCubingCalculation({
                trimWidthMm: Number(rawInput.trimWidthMm || 148),
                trimHeightMm: Number(rawInput.trimHeightMm || 210),
                bindingCategory: rawInput.bindingCategory || 'SOFTCOVER_STANDARD',
                processingType: rawInput.processingType || 'SEWN',
                segments: rawInput.segments || [{ pages: orderMeta.pages, gsm: Number(rawInput.gsm || 80), bulk: Number(rawInput.bulk || 1.2) }],
                cover: rawInput.cover || { gsm: 240, caliperUm: 240 },
                quantity: Number(rawInput.quantity || 2800),
                warehouseProfileCode
            });
        } catch (_) {
            cubing = null;
        }
    }

    const extensionDigit = rawInput.extensionDigit ?? '0';
    const baseSerial = Number(rawInput.startSerial || 1);

    let pallets = [];
    if (Array.isArray(rawInput.pallets) && rawInput.pallets.length > 0) {
        const totalPallets = rawInput.pallets.length;
        pallets = rawInput.pallets.map((p, idx) => {
            const palletNumber = idx + 1;
            const ssccObj = p.sscc18 && validateSscc18(p.sscc18)
                ? generateSscc18({
                    extensionDigit: p.sscc18[0],
                    companyPrefix: shipper.companyPrefix,
                    serialReference: p.sscc18.slice(1 + shipper.companyPrefix.length, 17)
                })
                : generateSscc18({
                    extensionDigit,
                    companyPrefix: shipper.companyPrefix,
                    serialReference: baseSerial + idx
                });

            const cartons = Number(p.cartons ?? p.cartonsCount ?? 32);
            const unitsPerCarton = Number(p.unitsPerCarton ?? p.booksPerCarton ?? 44);
            const totalUnits = Number(p.totalUnits ?? p.booksCount ?? cartons * unitsPerCarton);
            const netWeightKg = roundToPrecision(Number(p.netWeightKg ?? totalUnits * 0.34), 2);
            const grossWeightKg = roundToPrecision(Number(p.grossWeightKg ?? netWeightKg + cartons * 0.42 + 25.0), 2);
            const heightMm = Number(p.heightMm ?? p.totalHeightMm ?? 1140);

            return {
                palletIndex: palletNumber,
                palletTotal: totalPallets,
                palletLabel: `Pallet ${palletNumber} of ${totalPallets}`,
                palletStandard: 'EUR-EPAL (1200x800 mm)',
                cartonStandard: 'FEFCO 0201',
                cartonsCount: cartons,
                unitsPerCarton,
                totalUnits,
                heightMm,
                netWeightKg,
                grossWeightKg,
                sscc: ssccObj
            };
        });
    } else if (cubing && cubing.palletStacking) {
        const ps = cubing.palletStacking;
        const cp = cubing.cartonPacking;
        const ob = ps.orderBreakdown;
        const totalPallets = Math.max(1, ob.totalPalletsRequired);
        const booksPerCarton = cp.booksPerCarton;
        const unitNetKg = cubing.unitBook.weightBreakdownKg.unitNetWeightKg;

        for (let idx = 0; idx < totalPallets; idx++) {
            const palletNumber = idx + 1;
            const isLast = palletNumber === totalPallets && ob.lastPallet;
            const cartons = Number(
                isLast
                    ? (ob.lastPallet.cartonsCount ?? ob.lastPallet.cartonsOnLastPallet ?? ps.fullPalletSpecs.cartonsPerFullPallet)
                    : ps.fullPalletSpecs.cartonsPerFullPallet
            );
            const totalUnits = Number(
                isLast
                    ? (ob.lastPallet.booksCount ?? (ob.requestedQuantity - (totalPallets - 1) * ps.fullPalletSpecs.booksPerFullPallet))
                    : ps.fullPalletSpecs.booksPerFullPallet
            );
            const netWeightKg = roundToPrecision(totalUnits * unitNetKg, 2);
            const grossWeightKg = roundToPrecision(
                Number(
                    isLast
                        ? ob.lastPallet.grossWeightKg
                        : (ps.fullPalletSpecs.grossWeightKg ?? ps.fullPalletSpecs.grossPalletWeightKg ?? (netWeightKg + cartons * 0.42 + 25.0))
                ),
                2
            );
            const heightMm = Math.round(
                Number(isLast ? ob.lastPallet.totalHeightMm : ps.fullPalletSpecs.totalHeightMm)
            );

            const ssccObj = generateSscc18({
                extensionDigit,
                companyPrefix: shipper.companyPrefix,
                serialReference: baseSerial + idx
            });

            pallets.push({
                palletIndex: palletNumber,
                palletTotal: totalPallets,
                palletLabel: `Pallet ${palletNumber} of ${totalPallets}`,
                palletStandard: 'EUR-EPAL (1200x800 mm)',
                cartonStandard: 'FEFCO 0201',
                cartonsCount: cartons,
                unitsPerCarton: booksPerCarton,
                totalUnits,
                heightMm,
                netWeightKg,
                grossWeightKg,
                sscc: ssccObj
            });
        }
    } else {
        // Default 2-pallet industrial shipment
        const totalPallets = Math.max(1, Number(rawInput.palletCount || 2));
        const unitsPerCarton = Number(rawInput.unitsPerCarton || rawInput.booksPerCarton || 40);
        const cartonsPerPallet = Number(rawInput.cartonsPerPallet || 32);

        for (let idx = 0; idx < totalPallets; idx++) {
            const palletNumber = idx + 1;
            const cartons = cartonsPerPallet;
            const totalUnits = cartons * unitsPerCarton;
            const netWeightKg = roundToPrecision(totalUnits * 0.35, 2);
            const grossWeightKg = roundToPrecision(netWeightKg + cartons * 0.42 + 25.0, 2);
            const heightMm = Number(rawInput.palletHeightMm || 1120);

            const ssccObj = generateSscc18({
                extensionDigit,
                companyPrefix: shipper.companyPrefix,
                serialReference: baseSerial + idx
            });

            pallets.push({
                palletIndex: palletNumber,
                palletTotal: totalPallets,
                palletLabel: `Pallet ${palletNumber} of ${totalPallets}`,
                palletStandard: 'EUR-EPAL (1200x800 mm)',
                cartonStandard: 'FEFCO 0201',
                cartonsCount: cartons,
                unitsPerCarton,
                totalUnits,
                heightMm,
                netWeightKg,
                grossWeightKg,
                sscc: ssccObj
            });
        }
    }

    const totalPalletsCount = pallets.length;
    const totalCartonsCount = pallets.reduce((acc, p) => acc + p.cartonsCount, 0);
    const totalUnitsCount = pallets.reduce((acc, p) => acc + p.totalUnits, 0);
    const totalNetWeightKg = roundToPrecision(pallets.reduce((acc, p) => acc + p.netWeightKg, 0), 2);
    const totalGrossWeightKg = roundToPrecision(pallets.reduce((acc, p) => acc + p.grossWeightKg, 0), 2);

    const stackabilityMode = String(
        rawInput.stackabilityHandling ||
        rawInput.stackability_handling ||
        'STRICT_LDM_NON_STACKABLE'
    ).toUpperCase();

    const ldmTotal = roundToPrecision(totalPalletsCount * 0.4, 2);
    const ldmTaxableRatioKg = Number(rawInput.ldmTaxableWeightRatioKg || 1850);
    const ldmEquivalentKg = roundToPrecision(ldmTotal * ldmTaxableRatioKg, 2);
    const taxableWeightKg = stackabilityMode.includes('DOUBLE_DECK')
        ? totalGrossWeightKg
        : roundToPrecision(Math.max(totalGrossWeightKg, ldmEquivalentKg), 2);

    return {
        shipmentId: id,
        shipper,
        consignee,
        orderMeta,
        pallets,
        totals: {
            totalPalletsCount,
            totalCartonsCount,
            unitsPerCarton: pallets[0] ? pallets[0].unitsPerCarton : 40,
            totalUnitsCount,
            totalNetWeightKg,
            totalGrossWeightKg,
            ldmPerPallet: 0.4,
            ldmTotal,
            taxableWeightKg,
            stackabilityMode,
            epalExchangeDeadlineDays: 14,
            epalNonReturnPenaltyEur: 15.0
        }
    };
}

/**
 * Renders a single A6 GS1-128 SSCC label inside the given bounding box (offsetXMm, offsetYMm, 105x148 mm).
 * Supports both standalone A6 pages and 2x2 quadrants on an A4_SHEET_4UP page.
 */
function renderGs1A6LabelOnPage(pdf, shipment, pallet, { offsetXMm = 0, offsetYMm = 0 } = {}) {
    const ox = offsetXMm;
    const oy = offsetYMm;
    const labelW = 105;
    const labelH = 148;

    // Outer frame border (3 mm inset -> 99 x 142 mm)
    pdf.setStrokeColorRgb(0, 0, 0);
    pdf.setLineWidthPt(1.2);
    pdf.drawRectMm(ox + 3, oy + 3, labelW - 6, labelH - 6, { fill: false, stroke: true });

    // Corporate Top Accent Bar
    pdf.setFillColorRgb(0.863, 0, 0); // #DC0000 PrintPriceOS Industrial Red
    pdf.drawRectMm(ox + 3, oy + 3, labelW - 6, 4.5, { fill: true, stroke: false });

    // ─── TOP BLOCK: FROM (Shipper) / TO (Consignee & GLN) / PO & Date ───────────
    pdf.setFillColorRgb(0, 0, 0);
    pdf.drawTextMm('FROM / EXPEDIDOR:', ox + 5.5, oy + 11.5, { font: 'F2', sizePt: 6.5 });
    pdf.drawTextMm(shipment.shipper.name.slice(0, 42), ox + 5.5, oy + 15.0, { font: 'F2', sizePt: 8 });
    pdf.drawTextMm(
        `${shipment.shipper.street}, ${shipment.shipper.postalCode} ${shipment.shipper.city} (${shipment.shipper.country})`,
        ox + 5.5,
        oy + 18.5,
        { font: 'F1', sizePt: 7 }
    );

    pdf.drawTextMm(`DATE: ${shipment.orderMeta.dispatchDate}`, ox + 71, oy + 11.5, { font: 'F2', sizePt: 6.5 });
    pdf.drawTextMm(`SHP: ${shipment.shipmentId}`, ox + 71, oy + 15.0, { font: 'F3', sizePt: 6.5 });

    // Divider 1
    pdf.setLineWidthPt(0.8);
    pdf.drawLineMm(ox + 3, oy + 20.5, ox + labelW - 3, oy + 20.5);

    // Consignee / Warehouse Profile
    pdf.drawTextMm('TO / EMPFAENGER / ALMACEN DESTINO:', ox + 5.5, oy + 24.5, { font: 'F2', sizePt: 6.5 });
    pdf.drawTextMm(`GLN: ${shipment.consignee.gln}`, ox + 66, oy + 24.5, { font: 'F4', sizePt: 7 });
    pdf.drawTextMm(shipment.consignee.name.slice(0, 44), ox + 5.5, oy + 28.8, { font: 'F2', sizePt: 8.5 });
    pdf.drawTextMm(
        `${shipment.consignee.street} - ${shipment.consignee.country}-${shipment.consignee.postalCode} ${shipment.consignee.city}`,
        ox + 5.5,
        oy + 32.8,
        { font: 'F2', sizePt: 7.5 }
    );
    pdf.drawTextMm(
        `PROFILE: ${shipment.consignee.warehouseProfileCode}   |   PO: ${shipment.orderMeta.poNumber}`,
        ox + 5.5,
        oy + 36.8,
        { font: 'F1', sizePt: 7 }
    );

    // Divider 2
    pdf.setLineWidthPt(1.0);
    pdf.drawLineMm(ox + 3, oy + 39.2, ox + labelW - 3, oy + 39.2);

    // ─── MIDDLE BLOCK: PALLET X OF Y, BOOK/CARTON METRICS, WEIGHT, HEIGHT & DOCK SLOT ───
    // Highlight Banner for Pallet X of Y
    pdf.setFillColorRgb(0.12, 0.12, 0.12);
    pdf.drawRectMm(ox + 5, oy + 41.0, labelW - 10, 10.5, { fill: true, stroke: false });
    pdf.drawTextMm(
        `PALLET ${pallet.palletIndex} OF ${pallet.palletTotal}   (PALET ${pallet.palletIndex} DE ${pallet.palletTotal})`,
        ox + 8,
        oy + 48.0,
        { font: 'F2', sizePt: 12, colorRgb: [1, 1, 1] }
    );

    // Book & ISBN Row
    pdf.setFillColorRgb(0, 0, 0);
    pdf.drawTextMm(`ISBN: ${shipment.orderMeta.isbn}`, ox + 5.5, oy + 56.0, { font: 'F2', sizePt: 8 });
    pdf.drawTextMm(`FORMAT: ${shipment.orderMeta.formatLabel.slice(0, 24)}`, ox + 54, oy + 56.0, { font: 'F1', sizePt: 7.2 });
    pdf.drawTextMm(`TITLE: ${shipment.orderMeta.bookTitle.slice(0, 48)}`, ox + 5.5, oy + 60.0, { font: 'F1', sizePt: 7.2 });

    // Grid separator
    pdf.setLineWidthPt(0.6);
    pdf.drawLineMm(ox + 3, oy + 62.5, ox + labelW - 3, oy + 62.5);

    // 2x3 Metric Grid (Units, Cartons FEFCO 0201, Units/Carton, Gross Weight, Net Weight, Pallet Height)
    // Row 1
    pdf.drawTextMm('TOTAL BOOKS / UNIDADES', ox + 5.5, oy + 66.5, { font: 'F1', sizePt: 6.2 });
    pdf.drawTextMm(`${pallet.totalUnits} pcs`, ox + 5.5, oy + 71.2, { font: 'F2', sizePt: 10.5 });

    pdf.drawTextMm('CARTONS (FEFCO 0201)', ox + 40, oy + 66.5, { font: 'F1', sizePt: 6.2 });
    pdf.drawTextMm(`${pallet.cartonsCount} boxes`, ox + 40, oy + 71.2, { font: 'F2', sizePt: 10.5 });

    pdf.drawTextMm('UNITS / CARTON', ox + 73, oy + 66.5, { font: 'F1', sizePt: 6.2 });
    pdf.drawTextMm(`${pallet.unitsPerCarton} / box`, ox + 73, oy + 71.2, { font: 'F2', sizePt: 10.5 });

    pdf.drawLineMm(ox + 3, oy + 74.0, ox + labelW - 3, oy + 74.0);

    // Row 2
    pdf.drawTextMm('GROSS WEIGHT / BRUTO', ox + 5.5, oy + 78.0, { font: 'F1', sizePt: 6.2 });
    pdf.drawTextMm(`${pallet.grossWeightKg.toFixed(1)} kg`, ox + 5.5, oy + 82.8, { font: 'F2', sizePt: 10.5 });

    pdf.drawTextMm('NET WEIGHT / NETO', ox + 40, oy + 78.0, { font: 'F1', sizePt: 6.2 });
    pdf.drawTextMm(`${pallet.netWeightKg.toFixed(1)} kg`, ox + 40, oy + 82.8, { font: 'F2', sizePt: 10.0 });

    pdf.drawTextMm('PALLET HEIGHT / ALTURA', ox + 71, oy + 78.0, { font: 'F1', sizePt: 6.2 });
    pdf.drawTextMm(`${pallet.heightMm} mm`, ox + 71, oy + 82.8, { font: 'F2', sizePt: 10.5 });

    pdf.drawLineMm(ox + 3, oy + 85.5, ox + labelW - 3, oy + 85.5);

    // Dock Warning Banner (e.g. SLOT BOOKED / 48H AVIS)
    pdf.setFillColorRgb(0.95, 0.95, 0.95);
    pdf.drawRectMm(ox + 4.5, oy + 87.0, labelW - 9, 7.5, { fill: true, stroke: true });
    pdf.drawTextMm(
        `DOCK / AVIS: ${shipment.orderMeta.dockWarning.slice(0, 48)}`,
        ox + 6.5,
        oy + 92.0,
        { font: 'F2', sizePt: 7.2, colorRgb: [0.863, 0, 0] }
    );

    // Divider 3 before GS1-128 Barcode Zone
    pdf.setLineWidthPt(1.0);
    pdf.drawLineMm(ox + 3, oy + 96.5, ox + labelW - 3, oy + 96.5);

    // ─── BOTTOM BLOCK: GS1-128 BARCODE (AI 00 SSCC-18) + MONOSPACE HRI ──────────
    pdf.drawTextMm('GS1-128 SSCC / NVE (SERIAL SHIPPING CONTAINER CODE)', ox + 5.5, oy + 100.5, {
        font: 'F2',
        sizePt: 6.5
    });

    // Enforce >= 5 mm lateral quiet zones on each side:
    // Available width inside 105 mm label with 8.5 mm margin on each side = 88 mm (> 5 mm quiet zone)
    const barcodeEncoding = pallet.sscc.barcodeEncoding || encodeGs1128BarcodeModules(pallet.sscc.sscc18);
    const quietZoneMarginMm = 8.5; // >= 5 mm quiet zone mandated by GS1 specification
    const maxBarcodeWidthMm = labelW - 2 * quietZoneMarginMm; // 88 mm
    const moduleWidthMm = maxBarcodeWidthMm / barcodeEncoding.totalModules;
    const actualBarcodeWidthMm = barcodeEncoding.totalModules * moduleWidthMm;
    const barcodeStartXMm = ox + (labelW - actualBarcodeWidthMm) / 2;
    const barcodeTopYMm = oy + 102.5;
    const barcodeHeightMm = 33.0; // >= 32 mm minimum bar height mandated by GS1-128 spec

    pdf.setFillColorRgb(0, 0, 0);
    for (const bar of barcodeEncoding.bars) {
        const bx = barcodeStartXMm + bar.moduleOffset * moduleWidthMm;
        const bw = bar.widthModules * moduleWidthMm;
        pdf.drawRectMm(bx, barcodeTopYMm, bw, barcodeHeightMm, { fill: true, stroke: false });
    }

    // Crisp Monospace HRI text underneath the barcode
    pdf.drawTextMm(pallet.sscc.hriFormatted, ox + 13.5, oy + 140.5, {
        font: 'F4',
        sizePt: 10.5,
        colorRgb: [0, 0, 0]
    });
}

/**
 * Generates the GS1-128 SSCC Pallet Labels PDF buffer (A6 1-page-per-pallet by default, or A4_SHEET_4UP).
 *
 * @param {object} options
 * @param {string} [options.shipmentId] - Shipment identifier.
 * @param {string} [options.format='A6'] - 'A6' (105x148mm, 1 page per pallet) or 'A4_SHEET_4UP' (210x297mm, up to 4 labels per page).
 * @param {object} [options.shipmentData] - Optional shipment override payload.
 * @returns {Promise<{ buffer: Buffer, shipment: object, format: string, pageCount: number, labels: Array<object> }>}
 */
async function generateSsccLabelsPdf({ shipmentId, format = 'A6', shipmentData = {} } = {}) {
    const normalizedFormat = String(format || 'A6').trim().toUpperCase();
    if (normalizedFormat !== 'A6' && normalizedFormat !== 'A4_SHEET_4UP') {
        const err = new Error(`INVALID_LABEL_FORMAT: Unsupported label format '${format}'. Allowed: 'A6', 'A4_SHEET_4UP'.`);
        err.statusCode = 400;
        throw err;
    }

    const shipment = normalizeShipmentForDocuments(shipmentId, shipmentData);
    const is4Up = normalizedFormat === 'A4_SHEET_4UP';

    const pdf = new VectorPdfBuilder({
        widthMm: is4Up ? PAGE_FORMATS_MM.A4.widthMm : PAGE_FORMATS_MM.A6.widthMm,
        heightMm: is4Up ? PAGE_FORMATS_MM.A4.heightMm : PAGE_FORMATS_MM.A6.heightMm,
        title: `GS1-128 SSCC Labels — ${shipment.shipmentId}`
    });

    if (!is4Up) {
        for (const pallet of shipment.pallets) {
            pdf.addPage({ widthMm: 105, heightMm: 148 });
            renderGs1A6LabelOnPage(pdf, shipment, pallet, { offsetXMm: 0, offsetYMm: 0 });
        }
    } else {
        // 2x2 grid of A6 (105x148 mm) quadrants on DIN A4 (210x297 mm)
        const quadrantOffsets = [
            { offsetXMm: 0, offsetYMm: 0 },
            { offsetXMm: 105, offsetYMm: 0 },
            { offsetXMm: 0, offsetYMm: 148.5 },
            { offsetXMm: 105, offsetYMm: 148.5 }
        ];
        for (let i = 0; i < shipment.pallets.length; i++) {
            const slotIdx = i % 4;
            if (slotIdx === 0) {
                pdf.addPage({ widthMm: 210, heightMm: 297 });
            }
            renderGs1A6LabelOnPage(pdf, shipment, shipment.pallets[i], quadrantOffsets[slotIdx]);
        }
    }

    const buffer = pdf.toBuffer();
    return {
        buffer,
        shipment,
        format: normalizedFormat,
        pageCount: pdf.pages.length,
        labels: shipment.pallets.map(p => ({
            palletIndex: p.palletIndex,
            palletTotal: p.palletTotal,
            sscc18: p.sscc.sscc18,
            hriFormatted: p.sscc.hriFormatted,
            gs1128Plain: p.sscc.gs1128Plain
        }))
    };
}

/**
 * Generates the DIN A4 Portrait (210 x 297 mm) Industrial Delivery Note / Lieferschein / Albarán de Entrega PDF buffer.
 *
 * @param {object} options
 * @param {string} [options.shipmentId] - Shipment identifier.
 * @param {object} [options.shipmentData] - Optional shipment override payload.
 * @returns {Promise<{ buffer: Buffer, shipment: object, pageCount: number }>}
 */
async function generateDeliveryNotePdf({ shipmentId, shipmentData = {} } = {}) {
    const shipment = normalizeShipmentForDocuments(shipmentId, shipmentData);
    const pdf = new VectorPdfBuilder({
        widthMm: PAGE_FORMATS_MM.A4.widthMm,
        heightMm: PAGE_FORMATS_MM.A4.heightMm,
        title: `Delivery Note / Lieferschein — ${shipment.shipmentId}`
    });

    pdf.addPage({ widthMm: 210, heightMm: 297 });

    // ─── 1. CORPORATE INDUSTRIAL HEADER (DIN A4) ────────────────────────────────
    // Corporate Red Accent Rule (#DC0000)
    pdf.setFillColorRgb(0.863, 0, 0);
    pdf.drawRectMm(12, 10, 186, 3.5, { fill: true, stroke: false });

    pdf.setFillColorRgb(0, 0, 0);
    pdf.drawTextMm('DELIVERY NOTE / LIEFERSCHEIN / ALBARAN DE ENTREGA', 12, 20.5, {
        font: 'F2',
        sizePt: 13.5
    });
    pdf.drawTextMm('PrintPriceOS Industrial Logistics Control Plane — GS1-128 / EPAL Governance', 12, 25.2, {
        font: 'F1',
        sizePt: 8,
        colorRgb: [0.3, 0.3, 0.3]
    });

    // Document Reference Box (Top-Right)
    pdf.setStrokeColorRgb(0.2, 0.2, 0.2);
    pdf.setLineWidthPt(0.8);
    pdf.drawRectMm(135, 16, 63, 14, { fill: false, stroke: true });
    pdf.drawTextMm(`SHIPMENT ID: ${shipment.shipmentId}`, 138, 21.0, { font: 'F2', sizePt: 8 });
    pdf.drawTextMm(`PO NUMBER:  ${shipment.orderMeta.poNumber}`, 138, 25.0, { font: 'F2', sizePt: 8 });
    pdf.drawTextMm(`DATE:       ${shipment.orderMeta.dispatchDate}`, 138, 28.8, { font: 'F1', sizePt: 7.5 });

    // ─── 2. SHIPPER (PRINTHOUSE) & CONSIGNEE (WAREHOUSE) FISCAL BLOCKS ──────────
    // Left Box: Shipper / Printhouse
    pdf.setFillColorRgb(0.96, 0.96, 0.96);
    pdf.drawRectMm(12, 33, 90, 28, { fill: true, stroke: true });
    pdf.drawTextMm('SHIPPER / ABSENDER / EXPEDIDOR (TALLER):', 15, 38.0, {
        font: 'F2',
        sizePt: 7,
        colorRgb: [0.863, 0, 0]
    });
    pdf.drawTextMm(shipment.shipper.name, 15, 43.0, { font: 'F2', sizePt: 9 });
    pdf.drawTextMm(shipment.shipper.street, 15, 47.2, { font: 'F1', sizePt: 8 });
    pdf.drawTextMm(`${shipment.shipper.country}-${shipment.shipper.postalCode} ${shipment.shipper.city}`, 15, 51.2, {
        font: 'F1',
        sizePt: 8
    });
    pdf.drawTextMm(`VAT / USt-IdNr.: ${shipment.shipper.taxId}  |  GS1 Prefix: ${shipment.shipper.companyPrefix}`, 15, 56.0, {
        font: 'F3',
        sizePt: 7
    });

    // Right Box: Consignee / Warehouse Hub
    pdf.setFillColorRgb(0.96, 0.96, 0.96);
    pdf.drawRectMm(108, 33, 90, 28, { fill: true, stroke: true });
    pdf.drawTextMm('CONSIGNEE / EMPFAENGER / ALMACEN DESTINO:', 111, 38.0, {
        font: 'F2',
        sizePt: 7,
        colorRgb: [0.863, 0, 0]
    });
    pdf.drawTextMm(shipment.consignee.name.slice(0, 44), 111, 43.0, { font: 'F2', sizePt: 8.5 });
    pdf.drawTextMm(shipment.consignee.street, 111, 47.2, { font: 'F1', sizePt: 8 });
    pdf.drawTextMm(
        `${shipment.consignee.country}-${shipment.consignee.postalCode} ${shipment.consignee.city}  (Profile: ${shipment.consignee.warehouseProfileCode})`,
        111,
        51.2,
        { font: 'F2', sizePt: 7.5 }
    );
    pdf.drawTextMm(`GLN: ${shipment.consignee.gln}  |  Client: ${shipment.consignee.publisherCustomerName.slice(0, 24)}`, 111, 56.0, {
        font: 'F3',
        sizePt: 7
    });

    // ─── 3. PRODUCTION & BOOK SPECIFICATION BLOCK ──────────────────────────────
    pdf.setFillColorRgb(0.15, 0.15, 0.15);
    pdf.drawRectMm(12, 64, 186, 6.5, { fill: true, stroke: false });
    pdf.drawTextMm('1. PRODUCTION & EDITORIAL SPECIFICATION (DATOS DE LA OBRA Y ORDEN DE COMPRA)', 15, 68.5, {
        font: 'F2',
        sizePt: 8,
        colorRgb: [1, 1, 1]
    });

    pdf.setFillColorRgb(1, 1, 1);
    pdf.drawRectMm(12, 70.5, 186, 18, { fill: false, stroke: true });

    pdf.drawTextMm(`BOOK TITLE / TITULO:`, 15, 75.5, { font: 'F2', sizePt: 7.5 });
    pdf.drawTextMm(shipment.orderMeta.bookTitle, 48, 75.5, { font: 'F1', sizePt: 8.5 });

    pdf.drawTextMm(`ISBN-13:`, 15, 80.5, { font: 'F2', sizePt: 7.5 });
    pdf.drawTextMm(shipment.orderMeta.isbn, 48, 80.5, { font: 'F4', sizePt: 8.5 });

    pdf.drawTextMm(`PO REFERENCE:`, 115, 80.5, { font: 'F2', sizePt: 7.5 });
    pdf.drawTextMm(shipment.orderMeta.poNumber, 145, 80.5, { font: 'F4', sizePt: 8.5 });

    pdf.drawTextMm(`TRIM FORMAT:`, 15, 85.5, { font: 'F2', sizePt: 7.5 });
    pdf.drawTextMm(shipment.orderMeta.formatLabel, 48, 85.5, { font: 'F1', sizePt: 8 });

    pdf.drawTextMm(`SPECIFICATION:`, 115, 85.5, { font: 'F2', sizePt: 7.5 });
    pdf.drawTextMm(`${shipment.orderMeta.pages} pp | ${shipment.orderMeta.binding}`, 145, 85.5, {
        font: 'F1',
        sizePt: 7.5
    });

    // ─── 4. SHIPMENT SUMMARY KPI BAR (FEFCO 0201 / EPAL / NET vs GROSS MASS) ───
    pdf.setFillColorRgb(0.94, 0.94, 0.94);
    pdf.drawRectMm(12, 91, 186, 14, { fill: true, stroke: true });

    pdf.drawTextMm('EURO-PALLETS EPAL (1200x800)', 15, 95.5, { font: 'F2', sizePt: 6.5 });
    pdf.drawTextMm(`${shipment.totals.totalPalletsCount} EPAL`, 15, 101.5, { font: 'F2', sizePt: 10.5 });

    pdf.drawTextMm('TOTAL CARTONS (FEFCO 0201)', 56, 95.5, { font: 'F2', sizePt: 6.5 });
    pdf.drawTextMm(`${shipment.totals.totalCartonsCount} boxes`, 56, 101.5, { font: 'F2', sizePt: 10.5 });

    pdf.drawTextMm('BOOKS / CARTON & TOTAL COPIES', 98, 95.5, { font: 'F2', sizePt: 6.5 });
    pdf.drawTextMm(`${shipment.totals.unitsPerCarton}/box (${shipment.totals.totalUnitsCount} copies)`, 98, 101.5, {
        font: 'F2',
        sizePt: 9.5
    });

    pdf.drawTextMm('NET vs. GROSS MASS (MASA)', 150, 95.5, { font: 'F2', sizePt: 6.5 });
    pdf.drawTextMm(
        `${shipment.totals.totalNetWeightKg.toFixed(1)} / ${shipment.totals.totalGrossWeightKg.toFixed(1)} kg`,
        150,
        101.5,
        { font: 'F2', sizePt: 9.5 }
    );

    // ─── 5. PALLETIZED GS1-128 SSCC BREAKDOWN TABLE ────────────────────────────
    pdf.setFillColorRgb(0.15, 0.15, 0.15);
    pdf.drawRectMm(12, 108, 186, 6.5, { fill: true, stroke: false });
    pdf.drawTextMm('2. PALLETIZED PACKING LIST & GS1-128 SSCC / NVE MANIFEST (TABLA DE BULTOS)', 15, 112.5, {
        font: 'F2',
        sizePt: 8,
        colorRgb: [1, 1, 1]
    });

    // Table column headers
    const tableTopY = 114.5;
    pdf.setFillColorRgb(0.88, 0.88, 0.88);
    pdf.drawRectMm(12, tableTopY, 186, 6.5, { fill: true, stroke: true });
    pdf.drawTextMm('PALLET #', 14, tableTopY + 4.5, { font: 'F2', sizePt: 7 });
    pdf.drawTextMm('SSCC-18 / NVE (AI 00)', 34, tableTopY + 4.5, { font: 'F2', sizePt: 7 });
    pdf.drawTextMm('FEFCO 0201', 102, tableTopY + 4.5, { font: 'F2', sizePt: 7 });
    pdf.drawTextMm('BOOKS/BOX', 124, tableTopY + 4.5, { font: 'F2', sizePt: 7 });
    pdf.drawTextMm('COPIES', 144, tableTopY + 4.5, { font: 'F2', sizePt: 7 });
    pdf.drawTextMm('HEIGHT', 161, tableTopY + 4.5, { font: 'F2', sizePt: 7 });
    pdf.drawTextMm('NET / GROSS KG', 176, tableTopY + 4.5, { font: 'F2', sizePt: 6.5 });

    const maxRowsOnPage = Math.min(shipment.pallets.length, 10);
    let currentRowY = tableTopY + 6.5;
    const rowHeight = 6.2;

    for (let i = 0; i < maxRowsOnPage; i++) {
        const p = shipment.pallets[i];
        pdf.setFillColorRgb(i % 2 === 0 ? 1 : 0.97, i % 2 === 0 ? 1 : 0.97, i % 2 === 0 ? 1 : 0.97);
        pdf.drawRectMm(12, currentRowY, 186, rowHeight, { fill: true, stroke: true });

        pdf.drawTextMm(`${p.palletIndex} / ${p.palletTotal}`, 14, currentRowY + 4.3, { font: 'F2', sizePt: 7.5 });
        pdf.drawTextMm(p.sscc.hriFormatted, 34, currentRowY + 4.3, { font: 'F4', sizePt: 7.5 });
        pdf.drawTextMm(`${p.cartonsCount} boxes`, 102, currentRowY + 4.3, { font: 'F1', sizePt: 7.5 });
        pdf.drawTextMm(`${p.unitsPerCarton}`, 126, currentRowY + 4.3, { font: 'F1', sizePt: 7.5 });
        pdf.drawTextMm(`${p.totalUnits}`, 144, currentRowY + 4.3, { font: 'F2', sizePt: 7.5 });
        pdf.drawTextMm(`${p.heightMm} mm`, 161, currentRowY + 4.3, { font: 'F1', sizePt: 7.5 });
        pdf.drawTextMm(`${p.netWeightKg.toFixed(0)} / ${p.grossWeightKg.toFixed(0)} kg`, 176, currentRowY + 4.3, {
            font: 'F2',
            sizePt: 7.2
        });

        currentRowY += rowHeight;
    }

    // ─── 6. TRANSPORT CONTROL SECTION (LDM, TAXABLE WEIGHT, STACKABILITY, DOCK SLOT) ───
    const transportTopY = Math.max(182, currentRowY + 4);
    pdf.setFillColorRgb(0.15, 0.15, 0.15);
    pdf.drawRectMm(12, transportTopY, 186, 6.5, { fill: true, stroke: false });
    pdf.drawTextMm('3. TRANSPORT CONTROL, LDM & DOCK SCHEDULING (CONTROL DE TRANSPORTE Y MUELLE)', 15, transportTopY + 4.5, {
        font: 'F2',
        sizePt: 8,
        colorRgb: [1, 1, 1]
    });

    pdf.setFillColorRgb(1, 1, 1);
    pdf.drawRectMm(12, transportTopY + 6.5, 186, 24, { fill: false, stroke: true });

    pdf.drawTextMm(
        `LOADING METERS (METROS LINEALES): ${shipment.totals.ldmTotal.toFixed(2)} LDM (${shipment.totals.ldmPerPallet} LDM / Euro-Pallet 1200x800 mm)`,
        15,
        transportTopY + 12.0,
        { font: 'F2', sizePt: 8 }
    );
    pdf.drawTextMm(
        `CHARGEABLE / TAXABLE WEIGHT (PESO TASABLE): ${shipment.totals.taxableWeightKg.toFixed(2)} kg   |   ACTUAL GROSS: ${shipment.totals.totalGrossWeightKg.toFixed(2)} kg`,
        15,
        transportTopY + 17.0,
        { font: 'F2', sizePt: 8 }
    );
    pdf.drawTextMm(
        `STACKABILITY MODE (MODALIDAD): ${shipment.totals.stackabilityMode}   |   CARRIER: ${shipment.orderMeta.carrierName}`,
        15,
        transportTopY + 22.0,
        { font: 'F1', sizePt: 8 }
    );
    pdf.drawTextMm(
        `DOCK SLOT & AVIS DECLARATION: ${shipment.orderMeta.assignedSlotNumber} — ${shipment.orderMeta.dockWarning}`,
        15,
        transportTopY + 27.0,
        { font: 'F2', sizePt: 8, colorRgb: [0.863, 0, 0] }
    );

    // ─── 7. EURO-PALLET EPAL EXCHANGE CONTROL BOX (14-DAY RETURN VOUCHER) ──────
    const epalTopY = transportTopY + 33.5;
    pdf.setFillColorRgb(0.96, 0.96, 0.96);
    pdf.drawRectMm(12, epalTopY, 186, 22, { fill: true, stroke: true });
    pdf.drawTextMm(
        '4. EURO-PALLET EPAL (1200x800 mm) EXCHANGE CONTROL / PALETTENSCHEIN (CANJE 14 DIAS)',
        15,
        epalTopY + 5.0,
        { font: 'F2', sizePt: 8, colorRgb: [0.863, 0, 0] }
    );
    pdf.drawTextMm(
        `Delivered Euro-Pallets (UIC 435-2 / EPAL): [ ${shipment.totals.totalPalletsCount} ] units.   [ ] Exchanged 1:1 at Dock   [ ] Palettenschein / Return within ${shipment.totals.epalExchangeDeadlineDays} days`,
        15,
        epalTopY + 10.5,
        { font: 'F2', sizePt: 7.8 }
    );
    pdf.drawTextMm(
        'Empty EPAL pallets returned at unloading: _______ units.   Remaining balance to exchange within 14 calendar days: _______ units.',
        15,
        epalTopY + 15.8,
        { font: 'F1', sizePt: 7.5 }
    );
    pdf.drawTextMm(
        'Non-return after 14 calendar days is automatically billed at 15.00 EUR / Euro-Pallet EPAL (+ VAT) on next settlement.',
        15,
        epalTopY + 20.0,
        { font: 'F2', sizePt: 6.8, colorRgb: [0.35, 0.35, 0.35] }
    );

    // ─── 8. CMR / POD SIGNATURES, VEHICLE REGISTRATION & WAREHOUSE DOCK STAMP ──
    const sigTopY = epalTopY + 25.5;
    const sigBoxHeight = 36;

    // Box A: Shipper Dispatch
    pdf.setFillColorRgb(1, 1, 1);
    pdf.drawRectMm(12, sigTopY, 59, sigBoxHeight, { fill: false, stroke: true });
    pdf.drawTextMm('SHIPPER / EXPEDIDOR (TALLER)', 14, sigTopY + 5.0, { font: 'F2', sizePt: 7.2 });
    pdf.drawTextMm('Goods loaded in undamaged condition', 14, sigTopY + 9.2, { font: 'F1', sizePt: 6.5 });
    pdf.drawLineMm(15, sigTopY + 28, 67, sigTopY + 28);
    pdf.drawTextMm('Date, Signature & Printhouse Stamp', 15, sigTopY + 32.5, { font: 'F1', sizePt: 6.5 });

    // Box B: Carrier / CMR Driver + Vehicle Plate
    pdf.drawRectMm(75.5, sigTopY, 59, sigBoxHeight, { fill: false, stroke: true });
    pdf.drawTextMm('CARRIER / TRANSPORTISTA (CMR)', 77.5, sigTopY + 5.0, { font: 'F2', sizePt: 7.2 });
    pdf.drawTextMm(`VEHICLE PLATE / MATRICULA: ${shipment.orderMeta.vehiclePlate}`, 77.5, sigTopY + 10.0, {
        font: 'F4',
        sizePt: 7.0
    });
    pdf.drawTextMm('Pallets & EPAL count verified:', 77.5, sigTopY + 14.5, { font: 'F1', sizePt: 6.5 });
    pdf.drawLineMm(78.5, sigTopY + 28, 131.5, sigTopY + 28);
    pdf.drawTextMm('Driver Name, Date & CMR Signature', 78.5, sigTopY + 32.5, { font: 'F1', sizePt: 6.5 });

    // Box C: Consignee Receiving Dock (POD)
    pdf.drawRectMm(139, sigTopY, 59, sigBoxHeight, { fill: false, stroke: true });
    pdf.drawTextMm('RECEIVING DOCK / MUELLE (POD)', 141, sigTopY + 5.0, { font: 'F2', sizePt: 7.2 });
    pdf.drawTextMm(`Slot Ref: ${shipment.orderMeta.assignedSlotNumber}`, 141, sigTopY + 10.0, {
        font: 'F3',
        sizePt: 6.8
    });
    pdf.drawTextMm('Arrival Time: ____:____  Unloaded: ____:____', 141, sigTopY + 14.5, { font: 'F1', sizePt: 6.2 });
    pdf.drawLineMm(142, sigTopY + 28, 195, sigTopY + 28);
    pdf.drawTextMm('Warehouse Stamp & Receiver Signature', 142, sigTopY + 32.5, { font: 'F1', sizePt: 6.5 });

    const buffer = pdf.toBuffer();
    return {
        buffer,
        shipment,
        pageCount: pdf.pages.length
    };
}

/**
 * Generates the official DIN A4 Portrait (210 x 297 mm) Carrier Integration Protocol & Service Conditions PDF buffer
 * ("Protocolo de Integración y Condiciones de Servicio de Transporte").
 *
 * @param {object} [options]
 * @param {string} [options.carrierName] - Optional carrier legal name to prefill.
 * @param {string} [options.carrierVatId] - Optional carrier VAT/CIF to prefill.
 * @param {string} [options.printhouseName] - Optional issuing printhouse name.
 * @returns {Promise<{ buffer: Buffer, pageCount: number, protocolVersion: string }>}
 */
async function generateCarrierProtocolPdf(options = {}) {
    const pdf = new VectorPdfBuilder({
        widthMm: PAGE_FORMATS_MM.A4.widthMm,
        heightMm: PAGE_FORMATS_MM.A4.heightMm,
        title: 'PrintPriceOS — Carrier Integration Protocol & Service Conditions'
    });

    pdf.addPage({ widthMm: 210, heightMm: 297 });

    // ─── HEADER ─────────────────────────────────────────────────────────────────
    pdf.setFillColorRgb(0.863, 0, 0);
    pdf.drawRectMm(12, 10, 186, 3.5, { fill: true, stroke: false });

    pdf.setFillColorRgb(0, 0, 0);
    pdf.drawTextMm('PROTOCOLO DE INTEGRACION Y CONDICIONES DE SERVICIO DE TRANSPORTE', 12, 20.0, {
        font: 'F2',
        sizePt: 11.5
    });
    pdf.drawTextMm(
        'PrintPriceOS Industrial Logistics Governance — Binding Carrier SLA, LDM, EPAL & GS1-128 Protocol',
        12,
        24.8,
        { font: 'F1', sizePt: 7.8, colorRgb: [0.3, 0.3, 0.3] }
    );
    pdf.drawTextMm('DOC-REF: PPOS-LOG-SLA-2026.1', 152, 24.8, {
        font: 'F4',
        sizePt: 7.5,
        colorRgb: [0.863, 0, 0]
    });

    // ─── SECTION 1: VOLUMETRIC CONVERSION & LDM BILLING PARAMETERS ─────────────
    pdf.setFillColorRgb(0.15, 0.15, 0.15);
    pdf.drawRectMm(12, 29, 186, 6.2, { fill: true, stroke: false });
    pdf.drawTextMm('1. PARAMETROS DE FACTURACION Y CONVERSION VOLUMETRICA (LDM & SEGREGACION DE COSTES)', 15, 33.4, {
        font: 'F2',
        sizePt: 7.8,
        colorRgb: [1, 1, 1]
    });

    pdf.setFillColorRgb(0.97, 0.97, 0.97);
    pdf.drawRectMm(12, 35.2, 186, 27.5, { fill: true, stroke: true });
    pdf.drawTextMm(
        '- Equivalencia unitaria LDM: 1 Euro-Palet EPAL (1200 x 800 mm) = 0.40 LDM (Metros Lineales de Carga).',
        15,
        40.2,
        { font: 'F2', sizePt: 7.8 }
    );
    pdf.drawTextMm(
        '- Ratio masa/volumen estandar: 1 LDM = 1,850 kg tasables  |  Masa tasable/palet = max(Masa bruta real, 740 kg).',
        15,
        45.0,
        { font: 'F2', sizePt: 7.8 }
    );
    pdf.drawTextMm(
        '- Apilabilidad (Strict LDM): Expediciones editoriales NO apilables en transito salvo semirremolque Doppelstock.',
        15,
        49.8,
        { font: 'F1', sizePt: 7.6 }
    );
    pdf.drawTextMm(
        '- Segregacion estricta de costes: La tarifa de transporte cubre exclusivamente porte, seguro y recargos (combustible/peajes).',
        15,
        54.6,
        { font: 'F1', sizePt: 7.5 }
    );
    pdf.drawTextMm(
        '  Los consumibles de embalaje (cajas FEFCO 0201, flejes, cantoneras, film) son coste de taller sin recargo de manipulacion.',
        15,
        59.0,
        { font: 'F1', sizePt: 7.5 }
    );

    // ─── SECTION 2: EUROPEAN EDITORIAL HUBS COMPLIANCE TABLE ───────────────────
    pdf.setFillColorRgb(0.15, 0.15, 0.15);
    pdf.drawRectMm(12, 66, 186, 6.2, { fill: true, stroke: false });
    pdf.drawTextMm('2. CUMPLIMIENTO OPERATIVO EN HUBS EDITORIALES EUROPEOS (REQUISITOS DE MUELLE Y AVIS)', 15, 70.4, {
        font: 'F2',
        sizePt: 7.8,
        colorRgb: [1, 1, 1]
    });

    // Table Header
    const hubTableY = 72.2;
    pdf.setFillColorRgb(0.88, 0.88, 0.88);
    pdf.drawRectMm(12, hubTableY, 186, 6.2, { fill: true, stroke: true });
    pdf.drawTextMm('CENTRO DESTINO / GLN', 14, hubTableY + 4.3, { font: 'F2', sizePt: 7 });
    pdf.drawTextMm('ALTURA MAX.', 66, hubTableY + 4.3, { font: 'F2', sizePt: 7 });
    pdf.drawTextMm('MASA MAX.', 89, hubTableY + 4.3, { font: 'F2', sizePt: 7 });
    pdf.drawTextMm('REQUISITO CRITICO DE MUELLE', 110, hubTableY + 4.3, { font: 'F2', sizePt: 7 });
    pdf.drawTextMm('CITA PREVIA (AVIS)', 162, hubTableY + 4.3, { font: 'F2', sizePt: 7 });

    const hubs = [
        {
            hub: 'Zeitfracht Erfurt',
            gln: 'GLN: 4026635000006',
            h: '1200 mm (incl. EPAL)',
            w: '1000 kg / palet',
            req: 'Retranqueo >= 30 mm (Zero Overhang)',
            avis: 'Obligatoria >= 48 h (Tor 14)'
        },
        {
            hub: 'VVA Arvato Guetersloh',
            gln: 'GLN: 4002693000002',
            h: '1300 mm (incl. EPAL)',
            w: '700 kg / palet',
            req: 'Capa superior plana obligatoria',
            avis: 'Obligatoria >= 24 h (Portal)'
        },
        {
            hub: 'Amazon EU FBA',
            gln: 'GLN: 5450534000007',
            h: 'Segun ASIN / 1800 mm',
            w: '<= 15.0 kg / caja',
            req: 'Palet EUR-1 film seguridad',
            avis: 'Carrier Central (CARP) + PO'
        }
    ];

    let rowY = hubTableY + 6.2;
    for (let i = 0; i < hubs.length; i++) {
        const h = hubs[i];
        pdf.setFillColorRgb(i % 2 === 0 ? 1 : 0.96, i % 2 === 0 ? 1 : 0.96, i % 2 === 0 ? 1 : 0.96);
        pdf.drawRectMm(12, rowY, 186, 10.2, { fill: true, stroke: true });
        pdf.drawTextMm(h.hub, 14, rowY + 4.2, { font: 'F2', sizePt: 7.4 });
        pdf.drawTextMm(h.gln, 14, rowY + 8.4, { font: 'F4', sizePt: 6.8, colorRgb: [0.25, 0.25, 0.25] });
        pdf.drawTextMm(h.h, 66, rowY + 6.0, { font: 'F2', sizePt: 7.2 });
        pdf.drawTextMm(h.w, 89, rowY + 6.0, { font: 'F2', sizePt: 7.2 });
        pdf.drawTextMm(h.req, 110, rowY + 6.0, { font: 'F1', sizePt: 7.1 });
        pdf.drawTextMm(h.avis, 162, rowY + 6.0, { font: 'F2', sizePt: 7.0, colorRgb: [0.863, 0, 0] });
        rowY += 10.2;
    }

    // ─── SECTION 3: EPAL PALLET POOL & PALETTENSCHEIN (14 DAYS / 15.00 EUR) ────
    const sec3Y = rowY + 3.5;
    pdf.setFillColorRgb(0.15, 0.15, 0.15);
    pdf.drawRectMm(12, sec3Y, 186, 6.2, { fill: true, stroke: false });
    pdf.drawTextMm('3. CIRCUITO DE PALETERIA EPAL Y VALES DE CANJE (PALETTENSCHEIN — PLAZO 14 DIAS)', 15, sec3Y + 4.4, {
        font: 'F2',
        sizePt: 7.8,
        colorRgb: [1, 1, 1]
    });

    pdf.setFillColorRgb(0.97, 0.97, 0.97);
    pdf.drawRectMm(12, sec3Y + 6.2, 186, 24.5, { fill: true, stroke: true });
    pdf.drawTextMm(
        '1. Intercambio Inmediato 1:1: Entrega en muelle de igual numero de Euro-palets EPAL (1200x800 mm, UIC 435-2, Cat. A/B).',
        15,
        sec3Y + 11.2,
        { font: 'F1', sizePt: 7.5 }
    );
    pdf.drawTextMm(
        '2. Vale de Intercambio (Palettenschein — Plazo improrrogable de 14 dias naturales):',
        15,
        sec3Y + 16.2,
        { font: 'F2', sizePt: 7.6 }
    );
    pdf.drawTextMm(
        '   El transportista dispone de 14 dias naturales para restituir fisicamente el saldo deudor de palets EPAL en el taller.',
        15,
        sec3Y + 21.0,
        { font: 'F1', sizePt: 7.5 }
    );
    pdf.drawTextMm(
        '   RECARGO POR INCUMPLIMIENTO: Vencido el plazo de 14 dias sin restitucion, se facturara a 15,00 EUR / palet EPAL (+ IVA).',
        15,
        sec3Y + 26.2,
        { font: 'F2', sizePt: 7.6, colorRgb: [0.863, 0, 0] }
    );

    // ─── SECTION 4: GS1-128 SSCC-18 TRACEABILITY & POD / CMR CONFIRMATION ─────
    const sec4Y = sec3Y + 34.2;
    pdf.setFillColorRgb(0.15, 0.15, 0.15);
    pdf.drawRectMm(12, sec4Y, 186, 6.2, { fill: true, stroke: false });
    pdf.drawTextMm('4. TRAZABILIDAD DOCUMENTAL GS1-128 SSCC-18 (NVE) Y CONFIRMACION DE ENTREGA (POD / CMR)', 15, sec4Y + 4.4, {
        font: 'F2',
        sizePt: 7.8,
        colorRgb: [1, 1, 1]
    });

    pdf.setFillColorRgb(1, 1, 1);
    pdf.drawRectMm(12, sec4Y + 6.2, 186, 23.0, { fill: true, stroke: true });
    pdf.drawTextMm(
        '- Etiquetado GS1-128 SSCC-18 (AI 00): Escaneo obligatorio en recogida y cross-docking. Prohibido ocultar o deteriorar etiqueta.',
        15,
        sec4Y + 11.2,
        { font: 'F1', sizePt: 7.5 }
    );
    pdf.drawTextMm(
        '- Confirmacion Telematica (API Webhook): Notificacion de entrega con SSCC, timestamp y GPS en plazo < 2 horas tras descarga.',
        15,
        sec4Y + 16.2,
        { font: 'F1', sizePt: 7.5 }
    );
    pdf.drawTextMm(
        '- Confirmacion Documental (Albaran DIN A4 / Lieferschein): Remision de copia digitalizada firmada y sellada (POD) en <= 24 horas.',
        15,
        sec4Y + 21.2,
        { font: 'F1', sizePt: 7.5 }
    );
    pdf.drawTextMm(
        '- Cualquier penalizacion en destino por incumplimiento de cita previa (Avis) imputable al transportista sera repercutida.',
        15,
        sec4Y + 26.2,
        { font: 'F2', sizePt: 7.3, colorRgb: [0.3, 0.3, 0.3] }
    );

    // ─── SECTION 5: CARRIER ACKNOWLEDGMENT & ADHESION BLOCK ───────────────────
    const sec5Y = sec4Y + 33.0;
    pdf.setFillColorRgb(0.15, 0.15, 0.15);
    pdf.drawRectMm(12, sec5Y, 186, 6.2, { fill: true, stroke: false });
    pdf.drawTextMm('5. ACUSE DE RECIBO Y ADHESION VINCULANTE (CARRIER ADHESION & SIGNATURE)', 15, sec5Y + 4.4, {
        font: 'F2',
        sizePt: 7.8,
        colorRgb: [1, 1, 1]
    });

    const boxH = 44;
    // Left Box: Carrier Corporate Details
    pdf.setFillColorRgb(0.98, 0.98, 0.98);
    pdf.drawRectMm(12, sec5Y + 6.2, 92, boxH, { fill: true, stroke: true });
    pdf.drawTextMm('DATOS DE LA EMPRESA TRANSPORTISTA:', 15, sec5Y + 11.5, {
        font: 'F2',
        sizePt: 7.5,
        colorRgb: [0.863, 0, 0]
    });
    pdf.drawTextMm(
        `Razon Social: ${options.carrierName || '______________________________________'}`,
        15,
        sec5Y + 18.5,
        { font: 'F1', sizePt: 7.8 }
    );
    pdf.drawTextMm(
        `CIF / NIF / VAT: ${options.carrierVatId || '___________________________________'}`,
        15,
        sec5Y + 26.5,
        { font: 'F1', sizePt: 7.8 }
    );
    pdf.drawTextMm(
        'Representante Legal / Operativo: ______________________',
        15,
        sec5Y + 34.5,
        { font: 'F1', sizePt: 7.8 }
    );
    pdf.drawTextMm(
        'Canal Tracking (Email / API): ________________________',
        15,
        sec5Y + 42.5,
        { font: 'F1', sizePt: 7.8 }
    );

    // Right Box: Operational Conformity & Stamp
    pdf.setFillColorRgb(1, 1, 1);
    pdf.drawRectMm(106, sec5Y + 6.2, 92, boxH, { fill: true, stroke: true });
    pdf.drawTextMm('CONFORMIDAD OPERATIVA (FIRMA AUTORIZADA Y SELLO):', 109, sec5Y + 11.5, {
        font: 'F2',
        sizePt: 7.5,
        colorRgb: [0.863, 0, 0]
    });
    pdf.drawTextMm(
        'El transportista acepta las condiciones de cubicaje LDM, reserva',
        109,
        sec5Y + 17.0,
        { font: 'F1', sizePt: 7.0, colorRgb: [0.3, 0.3, 0.3] }
    );
    pdf.drawTextMm(
        'de muelle, escaneo GS1-128 SSCC y canje EPAL (14 dias / 15 EUR).',
        109,
        sec5Y + 20.8,
        { font: 'F1', sizePt: 7.0, colorRgb: [0.3, 0.3, 0.3] }
    );
    pdf.drawLineMm(110, sec5Y + 39.5, 192, sec5Y + 39.5);
    pdf.drawTextMm('Firma, Sello y Fecha de Adhesion: ____ / ____ / 2026', 110, sec5Y + 44.5, {
        font: 'F2',
        sizePt: 7.2
    });

    const buffer = pdf.toBuffer();
    return {
        buffer,
        pageCount: pdf.pages.length,
        protocolVersion: 'PPOS-LOG-SLA-2026.1'
    };
}

module.exports = {
    MM_TO_PT,
    PAGE_FORMATS_MM,
    VectorPdfBuilder,
    normalizeShipmentForDocuments,
    generateSsccLabelsPdf,
    generateDeliveryNotePdf,
    generateCarrierProtocolPdf
};
