'use strict';

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

module.exports = { MM_TO_PT, PAGE_FORMATS_MM, VectorPdfBuilder };
