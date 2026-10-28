'use strict';

/**
 * SPINE-04 — Budget App Spine Calculator Integration & Governance Test Suite
 *
 * Validates:
 * 1. BFF proxy routes (/api/budget/spine/profiles, /api/budget/spine/calculate, /api/budget/spine/calculations/:id)
 * 2. 100% mathematical parity with Control Plane PR #11 Spine Engine (zero frontend/BFF duplicated formulas)
 * 3. Same GSM (100 gsm) with different catalog calipers (98 µm Amber Graphic vs 175 µm Holmen Book Cream)
 *    producing distinct spine widths (11.5 mm vs 20.0 mm) and flat cover widths (357.5 mm vs 366.0 mm)
 * 4. Softcover Glued vs Sewn differentiation and Softcover with Flaps (Atloki)
 * 5. Hardcover Colibri governance: REQUIRES_TECH_APPROVAL & canReleaseToManufacturing: false
 * 6. Flexibound governance: EXPERIMENTAL_DISABLED / INVALID_BLOCKED (HTTP 422 / blocked status)
 * 7. Missing caliper governance: MISSING_SEGMENT_CALIPER / CALIPER_VERIFICATION_REQUIRED
 * 8. Control Plane Spine module inactive (HTTP 404 / 503 upstream) -> honest 503 SPINE_NOT_AVAILABLE
 *    with zero synthetic dimensions
 * 9. Zero duplicated Livonia formulas in frontend bundle (lib/spineApi.ts & components/BookSpineGeometryPanel.tsx)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPSTREAM_PORT = 3094;
const BUDGET_PORT = 3014;

process.env.NODE_ENV = 'test';
process.env.PERSISTENCE_ADAPTER = 'json';
process.env.PORT = String(BUDGET_PORT);
process.env.CONTROL_PLANE_URL = `http://127.0.0.1:${UPSTREAM_PORT}`;
process.env.SESSION_SECRET = 'spine_04_session_secret_2026';
process.env.SIGNING_SECRET = 'spine_04_signing_secret_2026';
process.env.OFFER_SIGNING_SECRET = 'spine_04_offer_signing_secret_2026';
process.env.BPE_JWT_SECRET = 'spine_04_bpe_jwt_secret_2026';
process.env.ADMIN_API_TOKEN = 'spine_04_admin_token_2026';

// Load PR #11 reference engine if available in adjacent Control Plane workspace,
// otherwise use embedded deterministic reference implementation from PR #11.
const cpEnginePath = path.resolve(
  __dirname,
  '../../../ppos-control-plane-phase-10-intelligence-layer/src/api/services/spine/spineCalculationEngine.js'
);

let cpEngine;
if (fs.existsSync(cpEnginePath)) {
  cpEngine = require(cpEnginePath);
  console.log('[SPINE_04_TEST] Loaded Control Plane PR #11 spineCalculationEngine.js directly.');
} else {
  // Deterministic fallback for GitHub Actions CI where only PrintPricePro_BookPrice is checked out
  const ceilToStep = (v, s = 0.5) => Math.ceil(Math.round((v / s) * 1e9) / 1e9) * s;
  const mroundToStep = (v, s = 0.5) => Math.floor(Math.round((v / s) * 1e9) / 1e9 + 0.5) * s;
  cpEngine = {
    BUILTIN_BINDING_PROFILES: {
      'livonia-alegro-softcover@2.0.0': {
        profileId: 'livonia-alegro-softcover',
        version: '2.0.0',
        fullProfileKey: 'livonia-alegro-softcover@2.0.0',
        displayName: 'Livonia Print — Alegro Softcover (Standard & Flaps)',
        machineryLine: 'Müller Martini Alegro',
        operationalStatus: 'MATH_VALIDATED_ACTIVE',
        certificationTier: 'MATH_BRANCH_VALIDATED',
        supportedBindingCategories: ['SOFTCOVER_STANDARD', 'SOFTCOVER_WITH_FLAPS'],
        supportedProcessingTypes: ['GLUED', 'SEWN'],
      },
      'livonia-colibri-hardcover@2.0.0': {
        profileId: 'livonia-colibri-hardcover',
        version: '2.0.0',
        fullProfileKey: 'livonia-colibri-hardcover@2.0.0',
        displayName: 'Livonia Print — Colibri Hardcover & Dust Jacket',
        machineryLine: 'Kolbus / Colibri Hardcover Line',
        operationalStatus: 'REQUIRES_TECH_APPROVAL',
        certificationTier: 'MATH_BRANCH_VALIDATED',
        supportedBindingCategories: ['HARDCOVER'],
        supportedProcessingTypes: ['SEWN', 'GLUED'],
      },
    },
    executeSpineCalculation: (input) => {
      const cat = input.bindingCategory || 'SOFTCOVER_STANDARD';
      const proc = input.processingType || 'SEWN';
      const W = Number(input.trimWidthMm);
      const H = Number(input.trimHeightMm);
      const segs = input.segments || [];
      let netBlock = 0;
      let totalPages = 0;
      const issues = [];
      const breakdown = segs.map((s, i) => {
        const pages = Number(s.pages || 0);
        const um = s.caliperUm != null ? Number(s.caliperUm) : null;
        totalPages += pages;
        if (!um || um <= 0) {
          issues.push({
            code: 'MISSING_SEGMENT_CALIPER',
            severity: 'ERROR',
            message: 'Missing segment caliper (µm).',
          });
        }
        const t = um > 0 ? (pages / 2) * (um / 1000) : 0;
        netBlock += t;
        return {
          segmentIndex: i + 1,
          pages,
          sheets: pages / 2,
          caliperUm: um,
          thicknessMm: t,
          variantId: s.variantId || null,
          gsm: s.gsm || null,
          caliperSource: s.caliperSource || 'LIVONIA_REFERENCE_IMPORT',
          caliperConfidenceStatus: s.caliperConfidenceStatus || (um > 0 ? 'VERIFIED' : 'MISSING'),
        };
      });

      const isHc = cat === 'HARDCOVER';
      const isFlexi = cat.startsWith('FLEXI');
      const endp = isHc && input.hardcover?.endpapersMode === 'SEPARATE' ? 0.6 : 0;
      const totalBlock = netBlock + endp;
      let spineWidthMm = 0;
      if (cat.startsWith('SOFTCOVER')) {
        const covUm = Number(input.cover?.caliperUm || 0);
        const glued = ceilToStep(netBlock + 0.7, 0.5);
        const sewn = ceilToStep(1.0718 * (netBlock + (2 * covUm) / 1000 - 0.66) + 0.9964, 0.5);
        spineWidthMm = proc === 'GLUED' ? glued : sewn;
      } else {
        const swell = 1.1338 * totalBlock + 1.5213;
        spineWidthMm = mroundToStep(swell, 0.5);
      }
      if (isFlexi) {
        issues.push({
          code: 'PROFILE_REQUIRES_PRINTHOUSE_TECH_APPROVAL',
          severity: 'ERROR',
          message: 'Flexi profile is EXPERIMENTAL_DISABLED.',
        });
      }
      const hasErr = issues.some((x) => x.severity === 'ERROR');
      const status = hasErr ? 'INVALID_BLOCKED' : isHc ? 'REQUIRES_TECH_REVIEW' : 'MATH_VALIDATED';
      const flapW = cat === 'SOFTCOVER_WITH_FLAPS' ? Number(input.cover?.flapWidthMm || 0) : 0;
      const netCoverW = isHc ? 2 * (W - 5) + 2 * 10.5 + spineWidthMm : 2 * W + spineWidthMm + (flapW > 0 ? 2 * flapW + 4 : 0);
      const netCoverH = isHc ? H + 5 : H;
      const flatCoverW = isHc ? netCoverW + 36 : netCoverW + 6;
      const flatCoverH = isHc ? netCoverH + 36 : netCoverH + 6;
      return {
        engineVersion: '2.0.0',
        profileId: isHc ? 'livonia-colibri-hardcover' : isFlexi ? 'livonia-colibri-flexi' : 'livonia-alegro-softcover',
        profileVersion: '2.0.0',
        fullProfileKey: isHc ? 'livonia-colibri-hardcover@2.0.0' : 'livonia-alegro-softcover@2.0.0',
        machineryLine: isHc ? 'Kolbus / Colibri Hardcover Line' : 'Müller Martini Alegro',
        operationalStatus: isFlexi ? 'EXPERIMENTAL_DISABLED' : isHc ? 'REQUIRES_TECH_APPROVAL' : 'MATH_VALIDATED_ACTIVE',
        certificationTier: isFlexi ? 'EXCEL_EXAMPLE_PARITY' : 'MATH_BRANCH_VALIDATED',
        inputCanonicalHash: crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'),
        outputCanonicalHash: crypto.createHash('sha256').update(String(spineWidthMm)).digest('hex'),
        blockThickness: {
          totalPages,
          netPaperBlockMm: netBlock,
          endpapersAllowanceMm: endp,
          totalBlockWithEndpapersMm: totalBlock,
          segmentBreakdown: breakdown,
        },
        bindingAdjustment: {
          processingType: proc,
          spineShape: input.hardcover?.spineShape || 'SQUARE',
          sewnSwellingBlockMm: isHc ? 1.1338 * totalBlock + 1.5213 : null,
          theoreticalWithBoardMm: isHc ? totalBlock + 4.8 : null,
          gluedCandidateSpineMm: spineWidthMm,
          sewnCandidateSpineMm: spineWidthMm,
        },
        spineWidthMm: hasErr ? null : spineWidthMm,
        rawFormulaSpineWidthMm: spineWidthMm,
        coverGeometry: {
          bleedPerSideMm: isHc ? 0 : 3,
          netCoverWidthMm: netCoverW,
          netCoverHeightMm: netCoverH,
          flatCoverWidthMm: flatCoverW,
          flatCoverHeightMm: flatCoverH,
          panels: {
            leftFlapMm: flapW || null,
            backPanelMm: isHc ? W - 5 : W,
            leftHingeScoreMm: isHc ? 10.5 : null,
            spineMm: spineWidthMm,
            rightHingeScoreMm: isHc ? 10.5 : null,
            frontPanelMm: isHc ? W - 5 : W,
            rightFlapMm: flapW || null,
            panelAuxRefMm: null,
            turnInMm: isHc ? 18 : null,
            boardWidthMm: isHc ? W - 5 : null,
            boardHeightMm: isHc ? H + 5 : null,
          },
        },
        manufacturingValidation: {
          status,
          certificationTier: isFlexi ? 'EXCEL_EXAMPLE_PARITY' : 'MATH_BRANCH_VALIDATED',
          levels: {
            excelExampleParity: true,
            mathBranchValidated: !hasErr,
            printhouseTechnicallyValidated: false,
            productionCertifiedForManufacturing: false,
          },
          canUseForCoverTemplatePreview: !hasErr,
          canReleaseToManufacturing: false,
          requiresTechnologistApproval: true,
          caliperConfidenceSummary: hasErr ? 'MISSING' : 'VERIFIED',
          issues,
        },
      };
    },
  };
}

let simulateUpstream404 = false;
const savedSnapshots = new Map();

function startMockControlPlaneServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (simulateUpstream404) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        return;
      }

      const parsedUrl = new URL(req.url, `http://127.0.0.1:${UPSTREAM_PORT}`);

      if (req.method === 'GET' && parsedUrl.pathname === '/api/v1/spine/profiles') {
        const profiles = Object.values(cpEngine.BUILTIN_BINDING_PROFILES).filter(
          (p) =>
            parsedUrl.searchParams.get('includeExperimental') === 'true' ||
            p.operationalStatus !== 'EXPERIMENTAL_DISABLED'
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            data: {
              tenantId: 'tenant_livonia_default',
              profiles,
            },
          })
        );
        return;
      }

      if (req.method === 'POST' && parsedUrl.pathname === '/api/v1/spine/calculate') {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
          try {
            const payload = JSON.parse(raw || '{}');
            const result = cpEngine.executeSpineCalculation(payload);
            const idempKey = req.headers['idempotency-key'];
            const snapshotId = idempKey
              ? `scs_idemp_${crypto.createHash('md5').update(idempKey).digest('hex').slice(0, 12)}`
              : `scs_${crypto.randomUUID()}`;
            const enriched = {
              ...result,
              snapshotId,
              snapshotLifecycleStatus: 'ACTIVE',
            };
            savedSnapshots.set(snapshotId, enriched);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, data: enriched }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                ok: false,
                error: { code: 'SPINE_CALCULATION_ERROR', message: err.message },
              })
            );
          }
        });
        return;
      }

      const calcMatch = parsedUrl.pathname.match(/^\/api\/v1\/spine\/calculations\/([^/]+)$/);
      if (req.method === 'GET' && calcMatch) {
        const id = decodeURIComponent(calcMatch[1]);
        const snap = savedSnapshots.get(id);
        if (!snap) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, data: snap }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unknown route' }));
    });

    server.listen(UPSTREAM_PORT, '127.0.0.1', () => resolve(server));
  });
}

function requestBudget(method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: BUDGET_PORT,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`SPINE-04 Assertion Failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runTests() {
  const upstreamServer = await startMockControlPlaneServer();
  console.log(`[SPINE_04_TEST] Mock Control Plane Spine server listening on ${UPSTREAM_PORT}`);

  require('../server.js');
  await new Promise((r) => setTimeout(r, 1200));

  try {
    console.log('\n======================================================================');
    console.log('MISIÓN SPINE-04 — SUITE DE INTEGRACIÓN BUDGET APP ↔ CONTROL PLANE SPINE');
    console.log('======================================================================\n');

    // 1. Profile listing
    console.log('[1/8] Verifying GET /api/budget/spine/profiles...');
    const profRes = await requestBudget('GET', '/api/budget/spine/profiles');
    assert(profRes.status === 200 && profRes.data.ok === true, 'Profiles endpoint returns HTTP 200 ok:true');
    assert(
      Array.isArray(profRes.data.data.profiles) && profRes.data.data.profiles.length >= 2,
      'Profiles list includes active Alegro Softcover and Colibri Hardcover profiles'
    );

    // 2. Same GSM (100 gsm), different physical caliper (98 µm vs 175 µm)
    console.log('\n[2/8] Verifying Same GSM (100 gsm) with Different Caliper (98 µm vs 175 µm)...');
    const amberPayload = {
      bindingCategory: 'SOFTCOVER_STANDARD',
      processingType: 'SEWN',
      trimWidthMm: 170,
      trimHeightMm: 240,
      segments: [
        {
          segmentIndex: 1,
          pages: 200,
          variantId: 'pvar_amber_100_98um',
          paperFamilyName: 'Amber Graphic (100 gsm)',
          gsm: 100,
          caliperUm: 98,
          caliperConfidenceStatus: 'VERIFIED',
        },
      ],
      cover: {
        gsm: 240,
        caliperUm: 285,
      },
    };

    const holmenPayload = {
      ...amberPayload,
      segments: [
        {
          segmentIndex: 1,
          pages: 200,
          variantId: 'pvar_holmen_100_175um',
          paperFamilyName: 'Holmen Book Cream 2.0 (100 gsm)',
          gsm: 100,
          caliperUm: 175,
          caliperConfidenceStatus: 'VERIFIED',
        },
      ],
    };

    const amberRes = await requestBudget('POST', '/api/budget/spine/calculate', amberPayload, {
      'Idempotency-Key': 'spine04-amber-test',
    });
    const holmenRes = await requestBudget('POST', '/api/budget/spine/calculate', holmenPayload);

    assert(amberRes.status === 200 && amberRes.data.ok === true, 'Amber Graphic 100gsm (98 µm) calculation succeeded');
    assert(holmenRes.status === 200 && holmenRes.data.ok === true, 'Holmen Book Cream 100gsm (175 µm) calculation succeeded');

    assert(
      amberRes.data.data.blockThickness.netPaperBlockMm === 9.8,
      `Amber 200pp @ 98 µm netPaperBlockMm === 9.80 mm (got ${amberRes.data.data.blockThickness.netPaperBlockMm})`
    );
    assert(
      amberRes.data.data.spineWidthMm === 11.5,
      `Amber 200pp @ 98 µm sewn spineWidthMm === 11.5 mm (got ${amberRes.data.data.spineWidthMm})`
    );
    assert(
      amberRes.data.data.coverGeometry.flatCoverWidthMm === 357.5,
      `Amber 170x240 flatCoverWidthMm with bleed === 357.5 mm (got ${amberRes.data.data.coverGeometry.flatCoverWidthMm})`
    );

    assert(
      holmenRes.data.data.blockThickness.netPaperBlockMm === 17.5,
      `Holmen 200pp @ 175 µm netPaperBlockMm === 17.50 mm (got ${holmenRes.data.data.blockThickness.netPaperBlockMm})`
    );
    assert(
      holmenRes.data.data.spineWidthMm === 20.0,
      `Holmen 200pp @ 175 µm sewn spineWidthMm === 20.0 mm (got ${holmenRes.data.data.spineWidthMm})`
    );
    assert(
      holmenRes.data.data.coverGeometry.flatCoverWidthMm === 366.0,
      `Holmen 170x240 flatCoverWidthMm with bleed === 366.0 mm (got ${holmenRes.data.data.coverGeometry.flatCoverWidthMm})`
    );

    // 3. Snapshot retrieval by ID
    console.log('\n[3/8] Verifying GET /api/budget/spine/calculations/:id...');
    const snapId = amberRes.data.data.snapshotId;
    const snapRes = await requestBudget('GET', `/api/budget/spine/calculations/${encodeURIComponent(snapId)}`);
    assert(snapRes.status === 200 && snapRes.data.ok === true, 'Snapshot retrieved via BFF proxy');
    assert(snapRes.data.data.spineWidthMm === 11.5, 'Retrieved snapshot preserves exact 11.5 mm spineWidthMm');

    // 4. Softcover Glued vs Sewn & Softcover with Flaps
    console.log('\n[4/8] Verifying Softcover Glued vs Sewn & Flaps...');
    const gluedRes = await requestBudget('POST', '/api/budget/spine/calculate', {
      ...amberPayload,
      processingType: 'GLUED',
    });
    assert(
      gluedRes.data.data.spineWidthMm === 10.5,
      `Amber 200pp @ 98 µm GLUED spineWidthMm === 10.5 mm (got ${gluedRes.data.data.spineWidthMm})`
    );

    const flapsRes = await requestBudget('POST', '/api/budget/spine/calculate', {
      ...amberPayload,
      bindingCategory: 'SOFTCOVER_WITH_FLAPS',
      cover: { gsm: 240, caliperUm: 285, flapWidthMm: 90 },
    });
    assert(
      flapsRes.data.data.coverGeometry.netCoverWidthMm === 535.5,
      `Softcover with 90mm flaps netCoverWidthMm === 535.5 mm (got ${flapsRes.data.data.coverGeometry.netCoverWidthMm})`
    );
    assert(
      flapsRes.data.data.coverGeometry.flatCoverWidthMm === 541.5,
      `Softcover with 90mm flaps flatCoverWidthMm === 541.5 mm (got ${flapsRes.data.data.coverGeometry.flatCoverWidthMm})`
    );

    // 5. Hardcover Colibri Governance (REQUIRES_TECH_APPROVAL & canReleaseToManufacturing: false)
    console.log('\n[5/8] Verifying Hardcover Colibri Governance (REQUIRES_TECH_APPROVAL)...');
    const hcRes = await requestBudget('POST', '/api/budget/spine/calculate', {
      bindingCategory: 'HARDCOVER',
      processingType: 'SEWN',
      trimWidthMm: 170,
      trimHeightMm: 240,
      segments: amberPayload.segments,
      hardcover: {
        endpapersMode: 'SEPARATE',
        boardThicknessMm: 2.4,
        blockPaperCoating: 'UNCOATED',
        spineShape: 'SQUARE',
        overhangMm: 2.5,
        foldingSignaturePages: 16,
      },
    });
    assert(hcRes.status === 200 && hcRes.data.ok === true, 'Hardcover calculation returns HTTP 200');
    assert(
      hcRes.data.data.operationalStatus === 'REQUIRES_TECH_APPROVAL',
      `Hardcover operationalStatus === REQUIRES_TECH_APPROVAL (got ${hcRes.data.data.operationalStatus})`
    );
    assert(
      hcRes.data.data.manufacturingValidation.canReleaseToManufacturing === false,
      'Hardcover canReleaseToManufacturing is strictly false'
    );
    assert(
      hcRes.data.data.coverGeometry.panels.boardWidthMm === 165 &&
        hcRes.data.data.coverGeometry.panels.boardHeightMm === 245,
      'Hardcover board dimensions computed (165 x 245 mm)'
    );

    // 6. Flexibound Governance (EXPERIMENTAL_DISABLED / INVALID_BLOCKED)
    console.log('\n[6/8] Verifying Flexibound Governance (EXPERIMENTAL_DISABLED)...');
    const flexiRes = await requestBudget('POST', '/api/budget/spine/calculate', {
      bindingCategory: 'FLEXI_STANDARD',
      processingType: 'SEWN',
      trimWidthMm: 170,
      trimHeightMm: 240,
      segments: amberPayload.segments,
    });
    assert(
      flexiRes.data.data.operationalStatus === 'EXPERIMENTAL_DISABLED' &&
        flexiRes.data.data.manufacturingValidation.status === 'INVALID_BLOCKED' &&
        flexiRes.data.data.spineWidthMm === null,
      'Flexibound is blocked with EXPERIMENTAL_DISABLED and spineWidthMm === null'
    );

    // 7. Missing Caliper Governance (MISSING_SEGMENT_CALIPER)
    console.log('\n[7/8] Verifying Missing Caliper Governance (MISSING_SEGMENT_CALIPER)...');
    const missingCaliperRes = await requestBudget('POST', '/api/budget/spine/calculate', {
      bindingCategory: 'SOFTCOVER_STANDARD',
      processingType: 'SEWN',
      trimWidthMm: 170,
      trimHeightMm: 240,
      segments: [{ segmentIndex: 1, pages: 200, gsm: 100, caliperUm: null }],
    });
    assert(
      missingCaliperRes.data.data.manufacturingValidation.status === 'INVALID_BLOCKED' &&
        missingCaliperRes.data.data.spineWidthMm === null &&
        missingCaliperRes.data.data.manufacturingValidation.issues.some(
          (i) => i.code === 'MISSING_SEGMENT_CALIPER'
        ),
      'Missing caliperUm blocks spine calculation (spineWidthMm === null, MISSING_SEGMENT_CALIPER)'
    );

    // 8. Control Plane Spine Module Inactive -> 503 SPINE_NOT_AVAILABLE & Zero Duplicated Client Math
    console.log('\n[8/8] Verifying SPINE_NOT_AVAILABLE Governance & Zero Frontend Duplicated Math...');
    simulateUpstream404 = true;
    const unavailRes = await requestBudget('POST', '/api/budget/spine/calculate', amberPayload);
    assert(
      unavailRes.status === 503 &&
        unavailRes.data.ok === false &&
        unavailRes.data.error?.code === 'SPINE_NOT_AVAILABLE' &&
        !unavailRes.data.data,
      'Upstream 404 returns HTTP 503 SPINE_NOT_AVAILABLE with zero synthetic dimensions'
    );
    simulateUpstream404 = false;

    // Static verification that frontend files contain zero Livonia magic numbers (1.0718, 1.1906, 1.1338, 0.9964)
    const clientApiSource = fs.readFileSync(path.resolve(__dirname, '../../lib/spineApi.ts'), 'utf8');
    const panelSource = fs.readFileSync(
      path.resolve(__dirname, '../../components/BookSpineGeometryPanel.tsx'),
      'utf8'
    );
    const forbiddenFormulaConstants = ['1.0718', '0.9964', '1.1906', '1.1338', '1.5213', '1.1636'];
    for (const token of forbiddenFormulaConstants) {
      assert(
        !clientApiSource.includes(token) && !panelSource.includes(token),
        `Frontend contains zero duplicated Livonia formula constant (${token})`
      );
    }

    console.log('\n======================================================================');
    console.log('✅ SPINE-04 INTEGRATION & GOVERNANCE SUITE: ALL ASSERTIONS PASSED');
    console.log('======================================================================\n');
    upstreamServer.close();
    process.exit(0);
  } catch (err) {
    console.error('\n[SPINE_04_TEST_FAILURE]', err);
    upstreamServer.close();
    process.exit(1);
  }
}

runTests();

