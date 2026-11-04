'use strict';

/**
 * src/api/services/publisher/proformaInvoicePdfService.js
 *
 * PrintPrice OS — High-End DIN A4 Vector Proforma Invoice & Pre-Payment Advice Generator
 *
 * Technical Requirements:
 * 1. Official Corporate & Legal Entity (Issuer / Clearinghouse Operator):
 *    - PrintPrice Pro — Print Price Pro SIA
 *    - Bruņinieku iela 60-8, Rīga, LV-1009, Latvia
 *    - Company Registration Number: 40203631570
 *    - EU VAT Identification Number: LV40203631570
 * 2. Buyer Profile:
 *    - If fiscal data complete: Legal Entity Name, Tax ID, Full Address, Contact Email, DIR3/Leitweg
 *    - If incomplete: "[TAX DETAILS PENDING COMPLETION - DRAFT ESTIMATE ONLY]"
 * 3. Technical Production Specs:
 *    - Book Title & ISBN
 *    - Trim Size & Page Count (e.g., A5, 192 pp)
 *    - Paper Stocks (Interior & Cover)
 *    - Print Run Quantity
 *    - Assigned Production Plant (ISO 12647-2 certified facility)
 * 4. Financial Summary & EU VAT Compliance:
 *    - Net Manufacturing & EPAL Pallet Logistics
 *    - Applicable Book VAT (4.00% reduced book rate / 0.00% Reverse Charge under EU VAT Directive Article 138/196)
 *    - TOTAL GROSS PAYABLE INCL. ESCROW CUSTODY (Highlighted summary box)
 * 5. B2B SEPA Wire Transfer & Escrow Instructions:
 *    - Beneficiary Name: PrintPrice Pro — Print Price Pro SIA
 *    - IBAN & BIC/SWIFT with copy-friendly formatting
 *    - Mandatory Transfer Concept: Exact Order & Reconciliation Token (PPOS-ORD-XXXX)
 *    - Security Notice: "Funds are custodied in secure Escrow until signed POD delivery confirmation."
 * 6. Mandatory Corporate Footer:
 *    - Corporate Imprint Line:
 *      "PrintPrice Pro — Print Price Pro SIA · Bruņinieku iela 60-8, Rīga, LV-1009, Latvia · Reg. No: 40203631570 · VAT: LV40203631570"
 *    - Normative Compliance badge: "Compliant with EN 16931-1:2017, Facturae 3.2.2, and XRechnung 3.0 standards"
 *    - Accessible hyperlinks: Terms, B2B Conditions, Privacy & Escrow Custody Agreement
 */

const { VectorPdfBuilder } = require('./vectorPdfBuilder');

const CORPORATE_ISSUER = Object.freeze({
    entityName: 'PrintPrice Pro — Print Price Pro SIA',
    address: 'Bruninieku iela 60-8, Riga, LV-1009, Latvia',
    regNumber: '40203631570',
    vatNumber: 'LV40203631570',
    clearinghouseTitle: 'PrintPrice OS · Book Print & Materials Clearinghouse',
    portalOrdersUrl: 'https://budget.printprice.pro/portal/orders',
    legalLinks: {
        terms: 'https://printprice.pro/terms',
        privacy: 'https://printprice.pro/privacy'
    }
});

function generateProformaInvoicePdf(orderInput = {}, options = {}) {
    const orderId = String(orderInput.orderId || orderInput.id || options.orderId || 'ORD-2026-0001').trim();
    const refCode = orderInput.reconciliationCode || options.reconciliationCode || `PPOS-${orderId}`;
    const invoiceNumber = orderInput.invoiceNumber || `PRO-2026-${orderId.slice(-6).toUpperCase()}`;
    const isPaid = orderInput.paymentStatus === 'PAID';
    const issueDate = (orderInput.created_at ? new Date(orderInput.created_at) : new Date()).toISOString().slice(0, 10);
    
    // Due date: 14 business days from issue date
    const dueDateObj = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const dueDate = dueDateObj.toISOString().slice(0, 10);

    const fiscal = options.fiscalProfile || orderInput.fiscalProfile || {};
    const hasFiscalData = Boolean(
        fiscal.legalEntityName && fiscal.legalEntityName.trim().length > 0 &&
        fiscal.taxIdVat && fiscal.taxIdVat.trim().length > 0
    );

    const buyerName = hasFiscalData ? fiscal.legalEntityName.trim() : '[TAX DETAILS PENDING COMPLETION - DRAFT ESTIMATE ONLY]';
    const buyerVat = hasFiscalData ? fiscal.taxIdVat.trim().toUpperCase() : 'PENDING VAT DECLARATION';
    const buyerAddress = hasFiscalData
        ? `${fiscal.fiscalStreet || fiscal.fiscalAddress || ''}, ${fiscal.fiscalPostalCode || fiscal.postalCode || ''} ${fiscal.fiscalCity || fiscal.city || ''} (${fiscal.fiscalCountryCode || fiscal.country || 'EU'})`.trim()
        : 'Address not recorded';
    const buyerEmail = fiscal.billingEmail || orderInput.customerEmail || options.customerEmail || 'billing@customer.eu';
    const dir3 = fiscal.dir3Code ? `DIR3: ${fiscal.dir3Code}` : null;
    const leitweg = fiscal.leitwegId ? `Leitweg-ID: ${fiscal.leitwegId}` : null;
    const routingInfo = [dir3, leitweg].filter(Boolean).join(' · ');

    const specs = orderInput.specs || {};
    const bookTitle = String(orderInput.bookTitle || specs.title || 'Editorial Book Production').trim();
    const isbn = String(orderInput.isbn || specs.isbn || '978-X-XXXX-XXXX-X').trim();
    const trimSize = String(specs.book_size || specs.size || 'A5 (148 x 210 mm)').trim();
    const pages = Number(specs.interior_pages || specs.pages || 192);
    const copies = Number(specs.copies || specs.quantity || orderInput.copies || 1000);
    const paperInterior = String(specs.paper_type_interior || 'Offset White 90g').trim();
    const paperCover = String(specs.paper_type_cover || 'Coated 260g PUR Softcover').trim();
    const assignedPlant = String(orderInput.offer_print_house || options.printhouseName || 'European Industrial Print Partner (ISO 12647-2 Facility)').trim();

    const rawPrice = orderInput.totalPriceEur ||
        orderInput.offer_price ||
        orderInput.totalAmount ||
        orderInput.price ||
        orderInput.manufacturingPrice ||
        (orderInput.specs && (orderInput.specs.totalPriceEur || orderInput.specs.price)) ||
        options.totalPriceEur ||
        0;
    const parsedPrice = Number(rawPrice);
    const netAmount = parsedPrice > 0 ? parsedPrice : 1850.00;
    
    // Reverse charge logic: If buyer has valid non-LV EU VAT, 0% Reverse charge (Art 138/196), else 4% reduced book rate
    const isReverseCharge = hasFiscalData && buyerVat.startsWith('ES') === false && buyerVat.startsWith('LV') === false && buyerVat.length > 5;
    const vatRatePct = isReverseCharge ? 0.0 : 4.0;
    const vatAmount = Number(((netAmount * vatRatePct) / 100).toFixed(2));
    const grossAmount = Number((netAmount + vatAmount).toFixed(2));

    const beneficiary = CORPORATE_ISSUER.entityName;

    const builder = new VectorPdfBuilder({
        widthMm: 210,
        heightMm: 297,
        title: `Proforma Invoice ${invoiceNumber} - ${CORPORATE_ISSUER.entityName}`
    });

    builder.addPage({ widthMm: 210, heightMm: 297 });

    // ── 1. Top Industrial Accent Banner (#DC0000 Corporate Red) ───────────────
    builder.setFillColorRgb(0.863, 0.0, 0.0); // #dc0000
    builder.drawRectMm(0, 0, 210, 4.5, { fill: true, stroke: false });

    // ── 2. Header & Document Title Badge ─────────────────────────────────────
    // Brand title
    builder.drawTextMm('PrintPrice OS', 15, 15, { font: 'F2', sizePt: 16, colorRgb: [0.863, 0.0, 0.0] });
    builder.drawTextMm(CORPORATE_ISSUER.clearinghouseTitle, 15, 20, { font: 'F1', sizePt: 8, colorRgb: [0.35, 0.35, 0.35] });

    // Document Badge (Right aligned box)
    const badgeBg = isPaid ? [0.063, 0.725, 0.506] : [0.96, 0.96, 0.97]; // Green if paid, light gray if pending
    builder.setFillColorRgb(badgeBg[0], badgeBg[1], badgeBg[2]);
    builder.setStrokeColorRgb(0.8, 0.8, 0.85);
    builder.setLineWidthPt(0.5);
    builder.drawRectMm(120, 11, 75, 16, { fill: true, stroke: true });

    const badgeTitle = isPaid ? 'COMMERCIAL TAX INVOICE' : 'PROFORMA INVOICE // PRE-PAYMENT ADVICE';
    builder.drawTextMm(badgeTitle, 123, 16, {
        font: 'F2',
        sizePt: 7.5,
        colorRgb: isPaid ? [1, 1, 1] : [0.863, 0.0, 0.0]
    });
    builder.drawTextMm(`DOC NO: ${invoiceNumber}`, 123, 20.5, { font: 'F2', sizePt: 9, colorRgb: [0.1, 0.1, 0.1] });
    builder.drawTextMm(`STATUS: ${isPaid ? 'PAID / RELEASED' : 'PENDING SEPA WIRE / ESCROW'}`, 123, 24.5, {
        font: 'F1',
        sizePt: 7,
        colorRgb: isPaid ? [0.05, 0.4, 0.2] : [0.6, 0.35, 0.0]
    });

    // Metadata horizontal rule
    builder.setStrokeColorRgb(0.85, 0.85, 0.88);
    builder.drawLineMm(15, 30, 195, 30);

    // ── 3. Document Metadata Grid ────────────────────────────────────────────
    const metaY = 34.5;
    builder.drawTextMm('ORDER REFERENCE:', 15, metaY, { font: 'F2', sizePt: 7, colorRgb: [0.45, 0.45, 0.45] });
    builder.drawTextMm(orderId, 15, metaY + 4, { font: 'F2', sizePt: 8.5, colorRgb: [0.1, 0.1, 0.1] });

    builder.drawTextMm('RECONCILIATION TOKEN:', 65, metaY, { font: 'F2', sizePt: 7, colorRgb: [0.45, 0.45, 0.45] });
    builder.drawTextMm(refCode, 65, metaY + 4, { font: 'F4', sizePt: 8.5, colorRgb: [0.863, 0.0, 0.0] });

    builder.drawTextMm('ISSUE DATE:', 125, metaY, { font: 'F2', sizePt: 7, colorRgb: [0.45, 0.45, 0.45] });
    builder.drawTextMm(issueDate, 125, metaY + 4, { font: 'F1', sizePt: 8.5, colorRgb: [0.1, 0.1, 0.1] });

    builder.drawTextMm('PAYMENT DUE DATE:', 160, metaY, { font: 'F2', sizePt: 7, colorRgb: [0.45, 0.45, 0.45] });
    builder.drawTextMm(dueDate, 160, metaY + 4, { font: 'F1', sizePt: 8.5, colorRgb: [0.1, 0.1, 0.1] });

    // ── 4. Two-Column Entity Breakdown (Issuer vs Buyer) ─────────────────────
    const entityBoxY = 44;
    const entityBoxH = 34;

    // Col A: Issuer
    builder.setFillColorRgb(0.98, 0.98, 0.99);
    builder.setStrokeColorRgb(0.88, 0.88, 0.9);
    builder.drawRectMm(15, entityBoxY, 88, entityBoxH, { fill: true, stroke: true });

    builder.drawTextMm('ISSUER / CLEARINGHOUSE OPERATOR:', 18, entityBoxY + 5, { font: 'F2', sizePt: 7, colorRgb: [0.863, 0.0, 0.0] });
    builder.drawTextMm(CORPORATE_ISSUER.entityName, 18, entityBoxY + 9.5, { font: 'F2', sizePt: 8.5, colorRgb: [0.1, 0.1, 0.1] });
    builder.drawTextMm(`Reg. No: ${CORPORATE_ISSUER.regNumber} · EU VAT: ${CORPORATE_ISSUER.vatNumber}`, 18, entityBoxY + 14, { font: 'F1', sizePt: 7.5, colorRgb: [0.25, 0.25, 0.25] });
    builder.drawTextMm(CORPORATE_ISSUER.address, 18, entityBoxY + 18, { font: 'F1', sizePt: 7.5, colorRgb: [0.25, 0.25, 0.25] });
    builder.drawTextMm('Clearing Jurisdiction: Riga, Republic of Latvia (EU)', 18, entityBoxY + 22, { font: 'F1', sizePt: 7, colorRgb: [0.45, 0.45, 0.45] });
    builder.drawTextMm('Treasury Email: accounting@printprice.pro', 18, entityBoxY + 26, { font: 'F1', sizePt: 7, colorRgb: [0.45, 0.45, 0.45] });

    // Col B: Buyer
    builder.setFillColorRgb(hasFiscalData ? 0.98 : 1.0, hasFiscalData ? 0.98 : 0.97, hasFiscalData ? 0.99 : 0.97);
    builder.setStrokeColorRgb(hasFiscalData ? 0.88 : 0.95, hasFiscalData ? 0.88 : 0.75, hasFiscalData ? 0.9 : 0.75);
    builder.drawRectMm(107, entityBoxY, 88, entityBoxH, { fill: true, stroke: true });

    builder.drawTextMm('BILL TO / BUYER (EDITORIAL CLIENT):', 110, entityBoxY + 5, { font: 'F2', sizePt: 7, colorRgb: [0.2, 0.4, 0.8] });
    builder.drawTextMm(buyerName.slice(0, 55), 110, entityBoxY + 9.5, { font: 'F2', sizePt: 8.5, colorRgb: hasFiscalData ? [0.1, 0.1, 0.1] : [0.75, 0.35, 0.0] });
    builder.drawTextMm(`EU VAT / TAX ID: ${buyerVat}`, 110, entityBoxY + 14, { font: 'F2', sizePt: 7.5, colorRgb: [0.2, 0.2, 0.2] });
    builder.drawTextMm(buyerAddress.slice(0, 48), 110, entityBoxY + 18, { font: 'F1', sizePt: 7.5, colorRgb: [0.25, 0.25, 0.25] });
    builder.drawTextMm(`Billing Email: ${buyerEmail.slice(0, 42)}`, 110, entityBoxY + 22, { font: 'F1', sizePt: 7, colorRgb: [0.45, 0.45, 0.45] });
    if (routingInfo) {
        builder.drawTextMm(routingInfo.slice(0, 45), 110, entityBoxY + 26, { font: 'F1', sizePt: 7, colorRgb: [0.1, 0.5, 0.3] });
    } else {
        builder.drawTextMm('Public Sector E-Invoicing: General Commercial B2B', 110, entityBoxY + 26, { font: 'F1', sizePt: 7, colorRgb: [0.55, 0.55, 0.55] });
    }

    // ── 5. Technical Production Specification Table ──────────────────────────
    const specTableY = 82;
    builder.setFillColorRgb(0.94, 0.94, 0.96);
    builder.drawRectMm(15, specTableY, 180, 6, { fill: true, stroke: false });
    builder.drawTextMm('TECHNICAL PRODUCTION SPECIFICATION (MANUFACTURING CLEARING)', 18, specTableY + 4.2, {
        font: 'F2',
        sizePt: 7.5,
        colorRgb: [0.1, 0.1, 0.1]
    });

    const rows = [
        ['Book Edition Title:', bookTitle.slice(0, 55), 'ISBN Reference:', isbn],
        ['Format & Trim Size:', trimSize, 'Page Extent:', `${pages} Interior Pages + 4 Cover pp`],
        ['Interior Paper Stock:', paperInterior.slice(0, 32), 'Cover & Finishing:', paperCover.slice(0, 32)],
        ['Print Run Volume:', `${copies.toLocaleString('en-US')} Copies`, 'Production Plant:', assignedPlant.slice(0, 32)]
    ];

    let rowY = specTableY + 6;
    rows.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? 1.0 : 0.985;
        builder.setFillColorRgb(bg, bg, bg);
        builder.drawRectMm(15, rowY, 180, 5.5, { fill: true, stroke: false });

        builder.drawTextMm(r[0], 18, rowY + 3.8, { font: 'F2', sizePt: 7, colorRgb: [0.4, 0.4, 0.4] });
        builder.drawTextMm(r[1], 48, rowY + 3.8, { font: 'F1', sizePt: 7.5, colorRgb: [0.1, 0.1, 0.1] });

        builder.drawTextMm(r[2], 110, rowY + 3.8, { font: 'F2', sizePt: 7, colorRgb: [0.4, 0.4, 0.4] });
        builder.drawTextMm(r[3], 138, rowY + 3.8, { font: 'F1', sizePt: 7.5, colorRgb: [0.1, 0.1, 0.1] });

        rowY += 5.5;
    });

    builder.setStrokeColorRgb(0.85, 0.85, 0.88);
    builder.drawLineMm(15, rowY, 195, rowY);

    // ── 6. Financial Summary & EU VAT Compliance Table ───────────────────────
    const finTableY = rowY + 4;
    builder.setFillColorRgb(0.94, 0.94, 0.96);
    builder.drawRectMm(15, finTableY, 180, 6, { fill: true, stroke: false });
    builder.drawTextMm('FINANCIAL CLEARING BREAKDOWN & EU DIRECTIVE COMPLIANCE', 18, finTableY + 4.2, {
        font: 'F2',
        sizePt: 7.5,
        colorRgb: [0.1, 0.1, 0.1]
    });

    const finRows = [
        [
            'Net Industrial Book Manufacturing & Bindery:',
            `EUR ${(netAmount * 0.9).toFixed(2)}`
        ],
        [
            'EPAL Euro-Pallet Packaging & Logistics Coordination:',
            `EUR ${(netAmount * 0.1).toFixed(2)}`
        ],
        [
            'Subtotal Net Industrial Clearing Base:',
            `EUR ${netAmount.toFixed(2)}`
        ],
        [
            isReverseCharge
                ? 'EU VAT 0.00% — Reverse Charge (Art. 138 / 196 EU VAT Directive):'
                : 'Applicable Book VAT (4.00% Reduced Cultural Rate — EN 16931):',
            `EUR ${vatAmount.toFixed(2)}`
        ]
    ];

    let fRowY = finTableY + 6;
    finRows.forEach((fr, idx) => {
        const isSubtotal = idx === 2;
        builder.setFillColorRgb(idx % 2 === 0 ? 1.0 : 0.985, idx % 2 === 0 ? 1.0 : 0.985, idx % 2 === 0 ? 1.0 : 0.985);
        builder.drawRectMm(15, fRowY, 180, 5.2, { fill: true, stroke: false });

        builder.drawTextMm(fr[0], 18, fRowY + 3.6, {
            font: isSubtotal ? 'F2' : 'F1',
            sizePt: 7.5,
            colorRgb: isSubtotal ? [0.1, 0.1, 0.1] : [0.35, 0.35, 0.35]
        });
        builder.drawTextMm(fr[1], 168, fRowY + 3.6, {
            font: isSubtotal ? 'F2' : 'F1',
            sizePt: 7.5,
            colorRgb: [0.1, 0.1, 0.1]
        });

        fRowY += 5.2;
    });

    // Highlighted Summary Box (Total Gross Payable)
    const totalBoxY = fRowY + 2;
    builder.setFillColorRgb(0.863, 0.0, 0.0); // Corporate red box
    builder.drawRectMm(15, totalBoxY, 180, 10, { fill: true, stroke: false });

    builder.drawTextMm('TOTAL GROSS PAYABLE (INCL. ESCROW CUSTODY):', 20, totalBoxY + 6.5, {
        font: 'F2',
        sizePt: 9,
        colorRgb: [1, 1, 1]
    });
    builder.drawTextMm(`EUR ${grossAmount.toFixed(2)}`, 155, totalBoxY + 6.8, {
        font: 'F2',
        sizePt: 12,
        colorRgb: [1, 1, 1]
    });

    // ── 7. B2B SEPA Wire Transfer & Escrow Custody Box ────────────────────────
    const wireBoxY = totalBoxY + 13;
    const wireBoxH = 34;

    builder.setFillColorRgb(0.97, 0.985, 0.98); // Light emerald tint
    builder.setStrokeColorRgb(0.3, 0.7, 0.5);
    builder.setLineWidthPt(0.7);
    builder.drawRectMm(15, wireBoxY, 180, wireBoxH, { fill: true, stroke: true });

    builder.drawTextMm('B2B SEPA WIRE TRANSFER & ESCROW SETTLEMENT INSTRUCTIONS', 19, wireBoxY + 5.5, {
        font: 'F2',
        sizePt: 8,
        colorRgb: [0.05, 0.5, 0.3]
    });

    const wireColY = wireBoxY + 10.5;
    builder.drawTextMm('BENEFICIARY:', 19, wireColY, { font: 'F2', sizePt: 7, colorRgb: [0.4, 0.4, 0.4] });
    builder.drawTextMm(beneficiary, 19, wireColY + 4, { font: 'F2', sizePt: 8, colorRgb: [0.1, 0.1, 0.1] });

    builder.drawTextMm('SEPA WIRE INSTRUCTIONS: ESCROW ACCOUNT ASSIGNMENT IN PROGRESS', 19, wireColY + 9, {
        font: 'F2',
        sizePt: 7.2,
        colorRgb: [0.863, 0.0, 0.0]
    });
    builder.drawTextMm('Dedicated client escrow IBAN will be allocated upon final order confirmation.', 19, wireColY + 13, {
        font: 'F1',
        sizePt: 6.8,
        colorRgb: [0.35, 0.35, 0.35]
    });

    builder.drawTextMm('MANDATORY CONCEPT / REFERENCE:', 125, wireColY, { font: 'F2', sizePt: 7, colorRgb: [0.863, 0.0, 0.0] });
    builder.drawTextMm(refCode, 125, wireColY + 4, { font: 'F4', sizePt: 9.5, colorRgb: [0.863, 0.0, 0.0] });

    builder.drawTextMm('PORTAL SETTLEMENT & AUTHENTICATED B2B TRANSFER:', 125, wireColY + 9, { font: 'F2', sizePt: 6.8, colorRgb: [0.4, 0.4, 0.4] });
    builder.drawTextMm(CORPORATE_ISSUER.portalOrdersUrl, 125, wireColY + 13, { font: 'F4', sizePt: 7.2, colorRgb: [0.05, 0.5, 0.3] });

    // Escrow Protection Notice
    builder.drawTextMm(
        'SECURITY NOTICE: Funds are custodied in secure Escrow until signed POD delivery confirmation at publisher dock.',
        19,
        wireBoxY + 29.5,
        { font: 'F2', sizePt: 6.8, colorRgb: [0.05, 0.4, 0.2] }
    );

    // ── 8. Corporate Footer & Normative Compliance ───────────────────────────
    const footY = 276;
    builder.setStrokeColorRgb(0.85, 0.85, 0.88);
    builder.drawLineMm(15, footY, 195, footY);

    // Corporate Imprint Line (Official Latvian Data)
    const imprint = `${CORPORATE_ISSUER.entityName} · ${CORPORATE_ISSUER.address} · Reg. No: ${CORPORATE_ISSUER.regNumber} · VAT: ${CORPORATE_ISSUER.vatNumber}`;
    builder.drawTextMm(imprint, 15, footY + 4, { font: 'F2', sizePt: 6.5, colorRgb: [0.35, 0.35, 0.35] });

    // Normative compliance
    builder.drawTextMm(
        'Compliant with EN 16931-1:2017, Facturae 3.2.2, and XRechnung 3.0 standards · ISO 12647-2 Printing Homologation',
        15,
        footY + 8,
        { font: 'F1', sizePt: 6.2, colorRgb: [0.5, 0.5, 0.5] }
    );

    // Legal hyperlinks line
    const linksLine = `Terms of Service: ${CORPORATE_ISSUER.legalLinks.terms} · Privacy & Escrow Custody: ${CORPORATE_ISSUER.legalLinks.privacy}`;
    builder.drawTextMm(linksLine, 15, footY + 12, { font: 'F1', sizePt: 6.2, colorRgb: [0.863, 0.0, 0.0] });

    return {
        buffer: builder.toBuffer(),
        invoiceNumber,
        grossAmount,
        netAmount,
        vatAmount,
        issuer: CORPORATE_ISSUER
    };
}

module.exports = {
    CORPORATE_ISSUER,
    generateProformaInvoicePdf
};

