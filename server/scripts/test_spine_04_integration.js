'use strict';

/**
 * SPINE-04 / SPINE-04R — Budget App Spine Calculator Integration & Governance Test Suite
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
 * 9. SPINE-04R R01/R02/R03 Authoritative Governance & Regression Cases:
 *    - Absence of cover caliper (coverCaliperUm === null, never assumed as 280 µm -> MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER & PROVISIONAL_ESTIMATE)
 *    - Interior caliper without provenance (caliperSource === 'NONE' -> downgraded to PROVISIONAL_ESTIMATED, never assumed as LIVONIA_REFERENCE_IMPORT / VERIFIED)
 *    - Unknown confidence status -> downgraded to PROVISIONAL_ESTIMATED
 *    - Unrecognized book format (e.g. 'B5_UNKNOWN', missing custom dimensions, invalid orientation) -> INVALID_BOOK_DIMENSIONS (never silently converted to A5)
 *    - Hardcover profile without certified parameters (missing boardThicknessMm / overhangMm / foldingSignaturePages) -> HARDCOVER_PROFILE_PARAMETERS_REQUIRED
 *    - Mathematically valid response that is not production certified -> MATH_VALIDATED_PENDING_INDUSTRIAL / EXCEL_EXAMPLE_PARITY_ONLY (never conflated with industrial release)
 *    - Paper change invalidating previous spine result fingerprint immediately
 *    - Zero duplicated Livonia formulas or unverified fallbacks in frontend bundle
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const ts = require('typescript');
const jwt = require('jsonwebtoken');

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
        roundingStepMm: 0.5,
        rules: {
          gluedOffsetMm: 0.7,
          sewnSlopeFactor: 1.0718,
          sewnCoverCaliperMultiplier: 2.0,
          sewnInnerOffsetMm: -0.66,
          sewnOuterInterceptMm: 0.9964,
          bleedPerSideMm: 3.0,
          flaps: {
            panelTurnAllowanceMm: 2.0,
            panelAuxReferenceOffsetMm: 5.0,
            maxFlapClearanceFromWidthMm: 16.0,
          },
        },
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
        roundingStepMm: 0.5,
        rules: {
          separateEndpapersThicknessMm: 0.6,
          allowedBoardThicknessesMm: [1.0, 2.0, 2.4, 3.0],
          allowedOverhangsMm: [2.5, 3.0],
          allowedSignaturePages: [16, 32],
          maxSewnSwellingBlockMm: 78.0,
          maxGluedBlockMm: 63.0,
        },
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
      let worstConfidence = 'VERIFIED';
      const confidenceOrder = {
        VERIFIED: 3,
        REFERENCE_IMPORTED: 2,
        PROVISIONAL_ESTIMATED: 1,
        MISSING: 0,
      };

      const breakdown = segs.map((s, i) => {
        const pages = Number(s.pages || 0);
        const um = s.caliperUm != null && Number(s.caliperUm) > 0 ? Number(s.caliperUm) : null;
        totalPages += pages;
        if (!um) {
          issues.push({
            code: 'MISSING_SEGMENT_CALIPER',
            severity: 'ERROR',
            message: 'Missing segment caliper (µm).',
          });
          worstConfidence = 'MISSING';
        } else {
          const conf = s.caliperConfidenceStatus || 'REFERENCE_IMPORTED';
          if ((confidenceOrder[conf] ?? 1) < (confidenceOrder[worstConfidence] ?? 3)) {
            worstConfidence = conf;
          }
          if (conf === 'PROVISIONAL_ESTIMATED') {
            issues.push({
              code: 'PROVISIONAL_CALIPER_USED',
              severity: 'WARNING',
              message: 'Segment uses a provisional/estimated caliper.',
            });
          }
        }
        const t = um ? (pages / 2) * (um / 1000) : 0;
        netBlock += t;
        return {
          segmentIndex: i + 1,
          pages,
          sheets: pages / 2,
          caliperUm: um,
          thicknessMm: t,
          variantId: s.variantId || null,
          gsm: s.gsm || null,
          caliperSource: s.caliperSource || 'NONE',
          caliperConfidenceStatus: s.caliperConfidenceStatus || (um ? 'REFERENCE_IMPORTED' : 'MISSING'),
        };
      });

      const isHc = cat === 'HARDCOVER';
      const isFlexi = cat.startsWith('FLEXI');
      const endp = isHc && input.hardcover?.endpapersMode === 'SEPARATE' ? 0.6 : 0;
      const totalBlock = netBlock + endp;
      let spineWidthMm = 0;
      if (cat.startsWith('SOFTCOVER')) {
        const covUmRaw = input.cover?.caliperUm;
        const covUm = covUmRaw != null && Number(covUmRaw) > 0 ? Number(covUmRaw) : 0;
        if (proc === 'SEWN' && covUm <= 0) {
          issues.push({
            code: 'MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER',
            severity: 'WARNING',
            message: 'Missing cover caliper makes sewn softcover calculation provisional.',
          });
          if (worstConfidence !== 'MISSING') worstConfidence = 'PROVISIONAL_ESTIMATED';
        }
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
      const hasMissingCoverWarn = issues.some(
        (x) => x.code === 'MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER'
      );
      let status = 'MATH_VALIDATED';
      if (hasErr) {
        status = 'INVALID_BLOCKED';
      } else if (isHc) {
        status = 'REQUIRES_TECH_REVIEW';
      } else if (worstConfidence === 'PROVISIONAL_ESTIMATED' || hasMissingCoverWarn) {
        status = 'PROVISIONAL_ESTIMATE';
      }
      const flapW = cat === 'SOFTCOVER_WITH_FLAPS' ? Number(input.cover?.flapWidthMm || 0) : 0;
      const netCoverW = isHc
        ? 2 * (W - 5) + 2 * 10.5 + spineWidthMm
        : 2 * W + spineWidthMm + (flapW > 0 ? 2 * flapW + 4 : 0);
      const netCoverH = isHc ? H + 5 : H;
      const flatCoverW = isHc ? netCoverW + 36 : netCoverW + 6;
      const flatCoverH = isHc ? netCoverH + 36 : netCoverH + 6;
      return {
        engineVersion: '2.0.0',
        profileId: isHc
          ? 'livonia-colibri-hardcover'
          : isFlexi
            ? 'livonia-colibri-flexi'
            : 'livonia-alegro-softcover',
        profileVersion: '2.0.0',
        fullProfileKey: isHc
          ? 'livonia-colibri-hardcover@2.0.0'
          : 'livonia-alegro-softcover@2.0.0',
        machineryLine: isHc ? 'Kolbus / Colibri Hardcover Line' : 'Müller Martini Alegro',
        operationalStatus: isFlexi
          ? 'EXPERIMENTAL_DISABLED'
          : isHc
            ? 'REQUIRES_TECH_APPROVAL'
            : 'MATH_VALIDATED_ACTIVE',
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
          caliperConfidenceSummary: worstConfidence,
          issues,
        },
      };
    },
  };
}

/**
 * Compiles and loads TypeScript modules (lib/spineApi.ts & deriveSpinePanelStatusFromResult)
 * in-memory so we can directly unit-test R01, R02, and R03 functions.
 */
function loadSpineClientModule() {
  const spineApiTsPath = path.resolve(__dirname, '../../lib/spineApi.ts');
  const source = fs.readFileSync(spineApiTsPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const mod = { exports: {} };
  const sandbox = {
    module: mod,
    exports: mod.exports,
    require: (id) => {
      if (id === '../types') return {};
      return require(id);
    },
    fetch: global.fetch,
    console,
  };
  vm.runInNewContext(transpiled, sandbox, { filename: 'spineApi.js' });
  return mod.exports;
}

function loadDeriveSpinePanelStatus() {
  const panelTsPath = path.resolve(__dirname, '../../components/BookSpineGeometryPanel.tsx');
  const source = fs.readFileSync(panelTsPath, 'utf8');
  const match = source.match(
    /export function deriveSpinePanelStatusFromResult[\s\S]*?\n\}/
  );
  if (!match) {
    throw new Error('Could not locate deriveSpinePanelStatusFromResult in BookSpineGeometryPanel.tsx');
  }
  const transpiled = ts.transpileModule(match[0], {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(transpiled, { module: mod, exports: mod.exports }, { filename: 'status.js' });
  return mod.exports.deriveSpinePanelStatusFromResult;
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

      if (req.method === 'POST' && parsedUrl.pathname === '/api/auth/login') {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
          const body = JSON.parse(raw || '{}');
          const accounts = {
            'tester-alpha@printprice.pro': {
              id: 'usr_tester_alpha',
              email: 'tester-alpha@printprice.pro',
              name: 'Alpha Tester',
              role: 'PRINTHOUSE',
              tenant_id: 'tenant_alpha',
              printhouse_id: 'ph_alpha',
            },
            'tester-beta@printprice.pro': {
              id: 'usr_tester_beta',
              email: 'tester-beta@printprice.pro',
              name: 'Beta Tester',
              role: 'PRINTHOUSE',
              tenant_id: 'tenant_beta',
              printhouse_id: 'ph_beta',
            },
          };
          const acct = accounts[body.email];
          if (!acct || body.password !== 'TestPass!2026') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid credentials' }));
            return;
          }
          const token = jwt.sign(
            {
              sub: acct.id,
              jti: `jti_${acct.id}`,
              email: acct.email,
              role: acct.role,
              tenant_id: acct.tenant_id,
              printhouse_id: acct.printhouse_id,
            },
            process.env.BPE_JWT_SECRET,
            {
              issuer: 'https://auth.printprice.pro',
              audience: 'ppos:control',
              expiresIn: '1h',
            }
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: true,
              token,
              access_token: token,
              user: acct,
            })
          );
        });
        return;
      }

      // Helper to verify BFF -> Control Plane delegated JWT on /api/v1/spine/*
      const verifyUpstreamSpineTenant = () => {
        const auth = req.headers['authorization'] || '';
        if (!auth.startsWith('Bearer ')) return null;
        try {
          const decoded = jwt.verify(auth.slice(7), process.env.BPE_JWT_SECRET, {
            issuer: 'https://auth.printprice.pro',
            audience: 'ppos:control',
          });
          if (!decoded.tenant_id || !decoded.bff_delegated || (!decoded.delegated_user_id && !decoded.delegated_order_id)) {
            return null;
          }
          return decoded;
        } catch {
          return null;
        }
      };

      if (req.method === 'GET' && parsedUrl.pathname === '/api/v1/spine/profiles') {
        const claims = verifyUpstreamSpineTenant();
        if (!claims) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Missing delegated tenant context' } }));
          return;
        }
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
              tenantId: claims.tenant_id,
              profiles,
            },
          })
        );
        return;
      }

      if (req.method === 'POST' && parsedUrl.pathname === '/api/v1/spine/calculate') {
        const claims = verifyUpstreamSpineTenant();
        if (!claims) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Missing delegated tenant context' } }));
          return;
        }
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
          try {
            const payload = JSON.parse(raw || '{}');
            if (payload.externalOrderIntentId) {
              for (const existing of savedSnapshots.values()) {
                if (
                  existing.externalOrderIntentId === payload.externalOrderIntentId &&
                  existing.tenantId &&
                  existing.tenantId !== claims.tenant_id
                ) {
                  res.writeHead(403, { 'Content-Type': 'application/json' });
                  res.end(
                    JSON.stringify({
                      ok: false,
                      error: {
                        code: 'FORBIDDEN_TENANT_MISMATCH',
                        message: 'Order belongs to another tenant.',
                      },
                    })
                  );
                  return;
                }
              }
            }
            const result = cpEngine.executeSpineCalculation(payload);
            const idempKey = req.headers['idempotency-key'];
            const snapshotId = idempKey
              ? `scs_idemp_${crypto.createHash('md5').update(`${claims.tenant_id}:${idempKey}`).digest('hex').slice(0, 12)}`
              : `scs_${crypto.randomUUID()}`;
            const enriched = {
              ...result,
              tenantId: claims.tenant_id,
              delegatedUserId: claims.delegated_user_id,
              externalOrderIntentId: payload.externalOrderIntentId || null,
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
        const claims = verifyUpstreamSpineTenant();
        if (!claims) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Missing delegated tenant context' } }));
          return;
        }
        const id = decodeURIComponent(calcMatch[1]);
        const snap = savedSnapshots.get(id);
        if (!snap) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }));
          return;
        }
        if (snap.tenantId && snap.tenantId !== claims.tenant_id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: false,
              error: {
                code: 'FORBIDDEN_TENANT_MISMATCH',
                message: 'Cross-tenant snapshot access is forbidden.',
              },
            })
          );
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

let defaultAuthCookie = '';

function requestBudget(method, reqPath, body = null, headers = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const mergedHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (!options.skipDefaultCookie && !mergedHeaders.Cookie && !mergedHeaders.Authorization && defaultAuthCookie) {
      mergedHeaders.Cookie = defaultAuthCookie;
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: BUDGET_PORT,
        path: reqPath,
        method,
        headers: mergedHeaders,
      },
      (res) => {
        let raw = '';
        const setCookie = res.headers['set-cookie'] || [];
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw), setCookie });
          } catch {
            resolve({ status: res.statusCode, raw, setCookie });
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
    throw new Error(`SPINE-04R Assertion Failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runTests() {
  const upstreamServer = await startMockControlPlaneServer();
  console.log(`[SPINE_04_TEST] Mock Control Plane Spine server listening on ${UPSTREAM_PORT}`);

  require('../server.js');
  await new Promise((r) => setTimeout(r, 1200));

  const spineClient = loadSpineClientModule();
  const deriveSpinePanelStatusFromResult = loadDeriveSpinePanelStatus();

  try {
    console.log('\n======================================================================');
    console.log('MISIÓN SPINE-04R — SUITE DE GOBERNANZA Y DATOS AUTORITATIVOS');
    console.log('======================================================================\n');

    // 0. SPINE-06R F01: Establish authenticated session for tenant_alpha via POST /api/auth/login
    console.log('[0/10] Authenticating tester session (tenant_alpha) via POST /api/auth/login...');
    const loginAlphaRes = await requestBudget(
      'POST',
      '/api/auth/login',
      { email: 'tester-alpha@printprice.pro', password: 'TestPass!2026' },
      {},
      { skipDefaultCookie: true }
    );
    assert(
      loginAlphaRes.status === 200 && loginAlphaRes.data.tenant_id === 'tenant_alpha',
      'POST /api/auth/login authenticates tester and binds tenant_alpha'
    );
    const alphaCookieHeader = (loginAlphaRes.setCookie || [])
      .map((c) => c.split(';')[0])
      .join('; ');
    assert(alphaCookieHeader.includes('pp_session_id='), 'Signed pp_session_id cookie issued on login');
    defaultAuthCookie = alphaCookieHeader;

    const sessionProbeRes = await requestBudget('GET', '/api/auth/session');
    assert(
      sessionProbeRes.status === 200 &&
        sessionProbeRes.data.authenticated === true &&
        sessionProbeRes.data.user?.tenant_id === 'tenant_alpha',
      'GET /api/auth/session returns bound user and tenant_alpha'
    );

    // 1. Profile listing
    console.log('[1/10] Verifying GET /api/budget/spine/profiles...');
    const profRes = await requestBudget('GET', '/api/budget/spine/profiles');
    assert(profRes.status === 200 && profRes.data.ok === true, 'Profiles endpoint returns HTTP 200 ok:true');
    assert(
      Array.isArray(profRes.data.data.profiles) && profRes.data.data.profiles.length >= 2,
      'Profiles list includes active Alegro Softcover and Colibri Hardcover profiles'
    );
    const hcProfileFromApi = profRes.data.data.profiles.find(
      (p) => p.profileId === 'livonia-colibri-hardcover'
    );
    assert(
      Boolean(hcProfileFromApi?.rules?.allowedBoardThicknessesMm?.length),
      'Hardcover profile exposes authoritative allowedBoardThicknessesMm rules'
    );

    // 2. Same GSM (100 gsm), different physical caliper (98 µm vs 175 µm)
    console.log('\n[2/9] Verifying Same GSM (100 gsm) with Different Caliper (98 µm vs 175 µm)...');
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
          caliperSource: 'MANUFACTURER_DATASHEET',
          caliperConfidenceStatus: 'VERIFIED',
        },
      ],
      cover: {
        gsm: 240,
        caliperUm: 285,
        caliperSource: 'MANUFACTURER_DATASHEET',
        caliperConfidenceStatus: 'VERIFIED',
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
          caliperSource: 'MANUFACTURER_DATASHEET',
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
    console.log('\n[3/9] Verifying GET /api/budget/spine/calculations/:id...');
    const snapId = amberRes.data.data.snapshotId;
    const snapRes = await requestBudget('GET', `/api/budget/spine/calculations/${encodeURIComponent(snapId)}`);
    assert(snapRes.status === 200 && snapRes.data.ok === true, 'Snapshot retrieved via BFF proxy');
    assert(snapRes.data.data.spineWidthMm === 11.5, 'Retrieved snapshot preserves exact 11.5 mm spineWidthMm');

    // 4. Softcover Glued vs Sewn & Softcover with Flaps
    console.log('\n[4/9] Verifying Softcover Glued vs Sewn & Flaps...');
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
      cover: {
        gsm: 240,
        caliperUm: 285,
        flapWidthMm: 90,
        caliperSource: 'MANUFACTURER_DATASHEET',
        caliperConfidenceStatus: 'VERIFIED',
      },
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
    console.log('\n[5/9] Verifying Hardcover Colibri Governance (REQUIRES_TECH_APPROVAL)...');
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
    console.log('\n[6/9] Verifying Flexibound Governance (EXPERIMENTAL_DISABLED)...');
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
    console.log('\n[7/9] Verifying Missing Caliper Governance (MISSING_SEGMENT_CALIPER)...');
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

    // 8. Control Plane Spine Module Inactive -> 503 SPINE_NOT_AVAILABLE
    console.log('\n[8/9] Verifying SPINE_NOT_AVAILABLE Governance...');
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

    // 9. SPINE-04R R01, R02 & R03 Authoritative Governance Regression Matrix
    console.log('\n[9/9] Verifying SPINE-04R R01, R02 & R03 Regression Cases...');

    const baseBookSpec = {
      copies: 1000,
      interior_pages: 200,
      cover_pages: 4,
      book_size: '170 x 240 mm',
      orientation: 'portrait',
      delivery_country: 'ES',
      interior_print: '4/4',
      cover_print: '4/0',
      cover_print_rev: 0,
      paper_type_interior: 'offset',
      paper_weight_interior: 100,
      paper_type_cover: 'mc',
      paper_weight_cover: 240,
      paper_type_endpaper: 'offset',
      paper_weight_endpapers: 140,
      pms_interior: 0,
      pms_cover: 0,
      binding_method: 'thread_sewn_sc',
      finishing_options: 'matt_lam_scratch',
      uv_varnish: false,
      endpapers: 'none',
      endpapers_print: '',
      paper_mode_interior: 'advanced',
      interior_paper_material: {
        variantId: 'pvar_amber_100_98um',
        productId: 'pprod_amber',
        productName: 'Amber Graphic',
        category: 'OFFSET',
        gsm: 100,
        caliperUm: 98,
        caliperSource: 'MANUFACTURER_DATASHEET',
        caliperConfidenceStatus: 'VERIFIED',
      },
      paper_mode_cover: 'standard',
      cover_paper_material: null,
    };

    // 9a. R01: Absence of cover caliper -> coverCaliperUm is null (never 280), triggers MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER & PROVISIONAL_ESTIMATE
    const readinessNoCoverUm = spineClient.resolveSpineRequestReadiness(baseBookSpec);
    assert(
      readinessNoCoverUm.status === 'READY' &&
        readinessNoCoverUm.requestPayload.cover.caliperUm === null &&
        readinessNoCoverUm.requestPayload.cover.caliperSource === 'NONE' &&
        readinessNoCoverUm.requestPayload.cover.caliperConfidenceStatus === 'MISSING',
      'R01: Missing cover caliper is sent as null / NONE / MISSING (never 280 / LIVONIA_REFERENCE_IMPORT / VERIFIED)'
    );

    const noCoverCalcRes = await requestBudget(
      'POST',
      '/api/budget/spine/calculate',
      readinessNoCoverUm.requestPayload
    );
    assert(
      noCoverCalcRes.status === 200 &&
        noCoverCalcRes.data.data.manufacturingValidation.status === 'PROVISIONAL_ESTIMATE' &&
        noCoverCalcRes.data.data.manufacturingValidation.issues.some(
          (i) => i.code === 'MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER'
        ) &&
        deriveSpinePanelStatusFromResult(noCoverCalcRes.data.data) === 'PROVISIONAL_ESTIMATE',
      'R01: Sewn softcover without cover caliper produces PROVISIONAL_ESTIMATE and MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER'
    );

    // 9b. R01: Interior caliper without provenance (caliperSource missing/NONE) -> downgraded to PROVISIONAL_ESTIMATED
    const readinessNoProvenance = spineClient.resolveSpineRequestReadiness({
      ...baseBookSpec,
      interior_paper_material: {
        ...baseBookSpec.interior_paper_material,
        caliperSource: null,
        caliperConfidenceStatus: null,
      },
    });
    assert(
      readinessNoProvenance.requestPayload.segments[0].caliperSource === 'NONE' &&
        readinessNoProvenance.requestPayload.segments[0].caliperConfidenceStatus ===
          'PROVISIONAL_ESTIMATED',
      'R01: Interior caliper without provenance is marked NONE / PROVISIONAL_ESTIMATED (never VERIFIED or LIVONIA_REFERENCE_IMPORT)'
    );

    // 9c. R01: Unknown confidence status -> downgraded to PROVISIONAL_ESTIMATED
    const readinessUnknownConf = spineClient.resolveSpineRequestReadiness({
      ...baseBookSpec,
      interior_paper_material: {
        ...baseBookSpec.interior_paper_material,
        caliperSource: 'SUPPLIER_IMPORT',
        caliperConfidenceStatus: 'UNTRUSTED_CUSTOM_LABEL',
      },
    });
    assert(
      readinessUnknownConf.requestPayload.segments[0].caliperConfidenceStatus ===
        'PROVISIONAL_ESTIMATED',
      'R01: Unrecognized confidence status is downgraded to PROVISIONAL_ESTIMATED'
    );

    // Also verify BFF sanitization downgrades spoofed VERIFIED when caliperSource is missing
    const spoofedBffRes = await requestBudget('POST', '/api/budget/spine/calculate', {
      bindingCategory: 'SOFTCOVER_STANDARD',
      processingType: 'GLUED',
      trimWidthMm: 170,
      trimHeightMm: 240,
      segments: [
        {
          segmentIndex: 1,
          pages: 200,
          gsm: 100,
          caliperUm: 98,
          caliperSource: 'NONE',
          caliperConfidenceStatus: 'VERIFIED',
        },
      ],
    });
    assert(
      spoofedBffRes.status === 200 &&
        spoofedBffRes.data.data.manufacturingValidation.status === 'PROVISIONAL_ESTIMATE' &&
        spoofedBffRes.data.data.manufacturingValidation.caliperConfidenceSummary ===
          'PROVISIONAL_ESTIMATED',
      'R01: BFF sanitizes segment with caliperSource=NONE so it cannot claim VERIFIED confidence'
    );

    // 9d. R02: Unrecognized format, missing custom dimensions, and orientation handling
    const unrecognizedFormatReadiness = spineClient.resolveSpineRequestReadiness({
      ...baseBookSpec,
      book_size: 'B5_UNREGISTERED',
    });
    assert(
      unrecognizedFormatReadiness.status === 'INVALID_BOOK_DIMENSIONS' &&
        unrecognizedFormatReadiness.reasonCode === 'UNRECOGNIZED_BOOK_SIZE_FORMAT' &&
        unrecognizedFormatReadiness.requestPayload === null &&
        unrecognizedFormatReadiness.trimDimensionsMm.trimWidthMm === null,
      'R02: Unrecognized book_size returns INVALID_BOOK_DIMENSIONS (UNRECOGNIZED_BOOK_SIZE_FORMAT) without falling back to A5'
    );

    const missingCustomDimsReadiness = spineClient.resolveSpineRequestReadiness({
      ...baseBookSpec,
      book_size: 'Custom',
      custom_width: undefined,
      custom_height: undefined,
    });
    assert(
      missingCustomDimsReadiness.status === 'INVALID_BOOK_DIMENSIONS' &&
        missingCustomDimsReadiness.reasonCode === 'INVALID_CUSTOM_BOOK_DIMENSIONS' &&
        missingCustomDimsReadiness.requestPayload === null,
      'R02: Custom size with missing dimensions returns INVALID_BOOK_DIMENSIONS'
    );

    const invalidOrientationReadiness = spineClient.resolveSpineRequestReadiness({
      ...baseBookSpec,
      orientation: 'diagonal_invalid',
    });
    assert(
      invalidOrientationReadiness.status === 'INVALID_BOOK_DIMENSIONS' &&
        invalidOrientationReadiness.reasonCode === 'INVALID_BOOK_ORIENTATION' &&
        invalidOrientationReadiness.requestPayload === null,
      'R02: Invalid orientation returns INVALID_BOOK_DIMENSIONS (INVALID_BOOK_ORIENTATION)'
    );

    const landscapeA5Dims = spineClient.resolveTrimDimensionsMm({
      ...baseBookSpec,
      book_size: 'A5',
      orientation: 'landscape',
    });
    assert(
      landscapeA5Dims.valid === true &&
        landscapeA5Dims.trimWidthMm === 210 &&
        landscapeA5Dims.trimHeightMm === 148,
      'R02: Landscape A5 correctly swaps trim dimensions to 210 x 148 mm'
    );

    // 9e. R01: Hardcover profile without certified parameters -> HARDCOVER_PROFILE_PARAMETERS_REQUIRED
    const hcWithoutParamsReadiness = spineClient.resolveSpineRequestReadiness(
      {
        ...baseBookSpec,
        binding_method: 'thread_sewn_hc',
      },
      { hardcoverProfileParams: null }
    );
    assert(
      hcWithoutParamsReadiness.status === 'HARDCOVER_PROFILE_PARAMETERS_REQUIRED' &&
        hcWithoutParamsReadiness.requestPayload === null,
      'R01: Hardcover without authorized profile parameters returns HARDCOVER_PROFILE_PARAMETERS_REQUIRED'
    );

    const bffHcMissingParamsRes = await requestBudget('POST', '/api/budget/spine/calculate', {
      bindingCategory: 'HARDCOVER',
      processingType: 'SEWN',
      trimWidthMm: 170,
      trimHeightMm: 240,
      segments: amberPayload.segments,
      hardcover: {},
    });
    assert(
      bffHcMissingParamsRes.status === 422 &&
        bffHcMissingParamsRes.data.error?.code === 'HARDCOVER_PROFILE_PARAMETERS_REQUIRED',
      'R01: BFF rejects HARDCOVER calculation request lacking explicit profile parameters with HTTP 422'
    );

    // 9f. R03: Separation of Certification States
    const statusMathPending = deriveSpinePanelStatusFromResult(amberRes.data.data);
    assert(
      statusMathPending === 'MATH_VALIDATED_PENDING_INDUSTRIAL',
      `R03: Mathematically valid response with MATH_BRANCH_VALIDATED tier maps to MATH_VALIDATED_PENDING_INDUSTRIAL (got ${statusMathPending})`
    );

    const statusExcelParity = deriveSpinePanelStatusFromResult({
      ...amberRes.data.data,
      certificationTier: 'EXCEL_EXAMPLE_PARITY',
      manufacturingValidation: {
        ...amberRes.data.data.manufacturingValidation,
        certificationTier: 'EXCEL_EXAMPLE_PARITY',
      },
    });
    assert(
      statusExcelParity === 'EXCEL_EXAMPLE_PARITY_ONLY',
      `R03: EXCEL_EXAMPLE_PARITY tier maps to EXCEL_EXAMPLE_PARITY_ONLY (got ${statusExcelParity})`
    );

    const statusPrinthouseVal = deriveSpinePanelStatusFromResult({
      ...amberRes.data.data,
      certificationTier: 'PRINTHOUSE_TECHNICALLY_VALIDATED',
      manufacturingValidation: {
        ...amberRes.data.data.manufacturingValidation,
        certificationTier: 'PRINTHOUSE_TECHNICALLY_VALIDATED',
        levels: {
          ...amberRes.data.data.manufacturingValidation.levels,
          printhouseTechnicallyValidated: true,
        },
      },
    });
    assert(
      statusPrinthouseVal === 'PRINTHOUSE_TECHNICALLY_VALIDATED',
      `R03: PRINTHOUSE_TECHNICALLY_VALIDATED tier maps to PRINTHOUSE_TECHNICALLY_VALIDATED (got ${statusPrinthouseVal})`
    );

    const statusProdCert = deriveSpinePanelStatusFromResult({
      ...amberRes.data.data,
      certificationTier: 'PRODUCTION_CERTIFIED',
      manufacturingValidation: {
        ...amberRes.data.data.manufacturingValidation,
        certificationTier: 'PRODUCTION_CERTIFIED',
        canReleaseToManufacturing: true,
        levels: {
          excelExampleParity: true,
          mathBranchValidated: true,
          printhouseTechnicallyValidated: true,
          productionCertifiedForManufacturing: true,
        },
      },
    });
    assert(
      statusProdCert === 'PRODUCTION_CERTIFIED',
      `R03: Only PRODUCTION_CERTIFIED with canReleaseToManufacturing=true maps to PRODUCTION_CERTIFIED (got ${statusProdCert})`
    );

    // 9g. Paper changes invalidate previous fingerprint immediately
    const fpAmber = spineClient.resolveSpineRequestReadiness(baseBookSpec).fingerprint;
    const fpHolmen = spineClient.resolveSpineRequestReadiness({
      ...baseBookSpec,
      interior_paper_material: {
        ...baseBookSpec.interior_paper_material,
        variantId: 'pvar_holmen_100_175um',
        caliperUm: 175,
      },
    }).fingerprint;
    assert(
      fpAmber !== fpHolmen,
      'Paper variant / caliper change immediately produces a distinct readiness fingerprint to invalidate stale geometry'
    );

    // Static verification that frontend files contain zero Livonia magic numbers AND zero R01/R02 fallbacks
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

    const forbiddenFallbacks = [
      'coverCaliperUm || 280',
      "|| 'LIVONIA_REFERENCE_IMPORT'",
      "|| 'VERIFIED'",
      '|| STANDARD_SIZE_LOOKUP_MM.A5',
    ];
    for (const pattern of forbiddenFallbacks) {
      assert(
        !clientApiSource.includes(pattern) && !panelSource.includes(pattern),
        `Frontend contains zero unverified fallback pattern (${pattern})`
      );
    }

    // 10. SPINE-06R F01: Multi-Tenant Isolation, Unauthenticated Rejection, Cross-Tenant Spoofing & Token Manipulation
    console.log('\n[10/10] Verifying SPINE-06R F01 Multi-Tenant Isolation & Token Security...');

    // 10a. Unauthenticated / untenanted call is rejected with 403 TENANT_CONTEXT_REQUIRED
    const unauthCalcRes = await requestBudget(
      'POST',
      '/api/budget/spine/calculate',
      amberPayload,
      {},
      { skipDefaultCookie: true }
    );
    assert(
      unauthCalcRes.status === 403 && unauthCalcRes.data.error?.code === 'TENANT_CONTEXT_REQUIRED',
      'F01: Unauthenticated request to /api/budget/spine/calculate is rejected with 403 TENANT_CONTEXT_REQUIRED'
    );

    const unauthProfRes = await requestBudget(
      'GET',
      '/api/budget/spine/profiles',
      null,
      {},
      { skipDefaultCookie: true }
    );
    assert(
      unauthProfRes.status === 403 && unauthProfRes.data.error?.code === 'TENANT_CONTEXT_REQUIRED',
      'F01: Unauthenticated request to /api/budget/spine/profiles is rejected with 403 TENANT_CONTEXT_REQUIRED'
    );

    // 10b. Manipulated / forged Bearer JWT is rejected with 401 UNAUTHORIZED
    const forgedToken = jwt.sign(
      { sub: 'usr_attacker', tenant_id: 'tenant_alpha', role: 'PRINTHOUSE' },
      'wrong_attacker_secret_key',
      { issuer: 'https://auth.printprice.pro', audience: 'ppos:control' }
    );
    const manipulatedJwtRes = await requestBudget(
      'POST',
      '/api/budget/spine/calculate',
      amberPayload,
      { Authorization: `Bearer ${forgedToken}` },
      { skipDefaultCookie: true }
    );
    assert(
      manipulatedJwtRes.status === 401 && manipulatedJwtRes.data.error?.code === 'UNAUTHORIZED',
      'F01: Manipulated / forged Bearer JWT is rejected with 401 UNAUTHORIZED'
    );

    // 10c. Authenticate second tenant (tenant_beta) and verify isolation
    const loginBetaRes = await requestBudget(
      'POST',
      '/api/auth/login',
      { email: 'tester-beta@printprice.pro', password: 'TestPass!2026' },
      {},
      { skipDefaultCookie: true }
    );
    const betaCookieHeader = (loginBetaRes.setCookie || [])
      .map((c) => c.split(';')[0])
      .join('; ');
    assert(
      loginBetaRes.status === 200 && loginBetaRes.data.tenant_id === 'tenant_beta' && betaCookieHeader.includes('pp_session_id='),
      'F01: Second tester login binds tenant_beta to its own session cookie'
    );

    // 10d. Client-supplied tenant spoofing in body/header while authenticated as tenant_beta -> 403 FORBIDDEN_TENANT_MISMATCH
    const spoofBodyRes = await requestBudget(
      'POST',
      '/api/budget/spine/calculate',
      { ...amberPayload, tenantId: 'tenant_alpha' },
      { Cookie: betaCookieHeader },
      { skipDefaultCookie: true }
    );
    assert(
      spoofBodyRes.status === 403 && spoofBodyRes.data.error?.code === 'FORBIDDEN_TENANT_MISMATCH',
      'F01: Spoofing tenantId=tenant_alpha in body while authenticated as tenant_beta returns 403 FORBIDDEN_TENANT_MISMATCH'
    );

    const spoofHeaderRes = await requestBudget(
      'POST',
      '/api/budget/spine/calculate',
      amberPayload,
      { Cookie: betaCookieHeader, 'x-tenant-id': 'tenant_alpha' },
      { skipDefaultCookie: true }
    );
    assert(
      spoofHeaderRes.status === 403 && spoofHeaderRes.data.error?.code === 'FORBIDDEN_TENANT_MISMATCH',
      'F01: Spoofing x-tenant-id=tenant_alpha header while authenticated as tenant_beta returns 403 FORBIDDEN_TENANT_MISMATCH'
    );

    // 10e. Cross-tenant snapshot retrieval: tenant_beta cannot read snapshot created by tenant_alpha
    const crossTenantSnapRes = await requestBudget(
      'GET',
      `/api/budget/spine/calculations/${encodeURIComponent(snapId)}`,
      null,
      { Cookie: betaCookieHeader },
      { skipDefaultCookie: true }
    );
    assert(
      crossTenantSnapRes.status === 403 &&
        crossTenantSnapRes.data.error?.code === 'FORBIDDEN_TENANT_MISMATCH',
      'F01: Cross-tenant GET /api/budget/spine/calculations/:id by tenant_beta returns 403 FORBIDDEN_TENANT_MISMATCH'
    );

    // 10f. Cross-tenant order calculation: create snapshot with order intent under tenant_alpha, then attempt with tenant_beta
    const alphaOrderCalc = await requestBudget(
      'POST',
      '/api/budget/spine/calculate',
      { ...amberPayload, externalOrderIntentId: 'oi_alpha_exclusive_001' },
      { Cookie: alphaCookieHeader },
      { skipDefaultCookie: true }
    );
    assert(alphaOrderCalc.status === 200, 'F01: tenant_alpha calculates spine for oi_alpha_exclusive_001');

    const betaCrossOrderCalc = await requestBudget(
      'POST',
      '/api/budget/spine/calculate',
      { ...amberPayload, externalOrderIntentId: 'oi_alpha_exclusive_001' },
      { Cookie: betaCookieHeader },
      { skipDefaultCookie: true }
    );
    assert(
      betaCrossOrderCalc.status === 403 &&
        betaCrossOrderCalc.data.error?.code === 'FORBIDDEN_TENANT_MISMATCH',
      'F01: tenant_beta attempting to calculate spine for tenant_alpha order returns 403 FORBIDDEN_TENANT_MISMATCH'
    );

    console.log('\n======================================================================');
    console.log('✅ SPINE-04R / SPINE-06R INTEGRATION & GOVERNANCE SUITE: ALL ASSERTIONS PASSED');
    console.log('======================================================================\n');
    upstreamServer.close();
    process.exit(0);
  } catch (err) {
    console.error('\n[SPINE_04R_TEST_FAILURE]', err);
    upstreamServer.close();
    process.exit(1);
  }
}

runTests();
