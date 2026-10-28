# MISIÓN SPINE-04 / SPINE-04R — BUDGET APP SPINE CALCULATOR INTEGRATION & GOVERNANCE REPORT

**Repository:** `PrintPriceOS/PrintPricePro_BookPrice`  
**Branch:** `feat/spine-04-budget-spine-integration`  
**Base Reference:** `main` (`e98acd01c9f8e5bb5c0d5629c646c7fa068bd1aa`)  
**Control Plane Reference Contract:** [PR #11 (`feat/spine-03r-caliper-and-engine`)](https://github.com/PrintPriceOS/ppos-control-plane/pull/11)  

---

## 1. Architectural Summary & Zero-Duplicated-Math Guarantee

In strict compliance with PrintPrice OS invariants and `SPINE-04` / `SPINE-04R` governance rules:

1. **Zero Client-Side or BFF Formula Duplication**:
   - Neither `lib/spineApi.ts`, `components/BookSpineGeometryPanel.tsx`, nor `server/server.js` contain any Livonia Excel mathematical constants (`1.0718`, `0.9964`, `1.1906`, `1.1338`, `1.5213`, `0.7`) or bulk-estimation heuristics.
   - All block thickness (`netPaperBlockMm`, `totalBlockWithEndpapersMm`), spine rounding (`spineWidthMm`), extended cover spread (`netCoverWidthMm`, `flatCoverWidthMm`), hardcover board dimensions (`boardWidthMm`, `boardHeightMm`), hinge scores (`leftHingeScoreMm`), turn-in (`turnInMm`), and circular arc radii ($R(x)$) are resolved exclusively by Control Plane's `/api/v1/spine/calculate`.

2. **Authoritative BFF Proxy Routes (`server/server.js`)**:
   - `GET /api/budget/spine/profiles` $\to$ `${CONTROL_PLANE_BASE_URL}/api/v1/spine/profiles`
   - `POST /api/budget/spine/calculate` $\to$ `${CONTROL_PLANE_BASE_URL}/api/v1/spine/calculate` (preserving `Idempotency-Key` and enforcing `sanitizeSpineCalculateRequest` provenance & format validation)
   - `GET /api/budget/spine/calculations/:id` $\to$ `${CONTROL_PLANE_BASE_URL}/api/v1/spine/calculations/:id`
   - **Honest Upstream Governance (`SPINE_NOT_AVAILABLE`)**: If Control Plane does not yet have `/api/v1/spine/*` active in the target environment (`404`, `502`, `503`, `504`, or connection failure), the BFF returns `HTTP 503` with `error.code = "SPINE_NOT_AVAILABLE"` and generates **zero synthetic dimensions**.

---

## 2. SPINE-04R Governance & Authoritative Data Remediation

### SPINE-04-R01 — Zero Assumed Technical Values or Unverified Provenance
- **Removed Synthetic Cover Caliper (`280 µm`)**: `lib/spineApi.ts` never injects `coverCaliperUm || 280`. When `selectedCoverMaterial.caliperUm` is absent, `coverCaliperUm` is sent as `null` (`coverCaliperSource: 'NONE'`, `coverCaliperConfidenceStatus: 'MISSING'`). For sewn softcover (`SOFTCOVER_STANDARD` + `SEWN`), Control Plane explicitly flags `MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER` (`PROVISIONAL_ESTIMATE`).
- **Removed Synthetic Provenance & Confidence (`VERIFIED` / `LIVONIA_REFERENCE_IMPORT`)**: Neither `lib/spineApi.ts` nor `components/AdvancedPaperSelector.tsx` falls back to `'VERIFIED'` or `'LIVONIA_REFERENCE_IMPORT'`. If a material has `caliperUm > 0` without a verified `caliperSource` or `caliperConfidenceStatus`, `normalizeMaterialCaliperProvenance()` sets `caliperSource: 'NONE'` and `caliperConfidenceStatus: 'PROVISIONAL_ESTIMATED'`.
- **Removed Hardcoded Hardcover Profile Parameters**: `lib/spineApi.ts` no longer hardcodes `boardThicknessMm: 2.4`, `overhangMm: 2.5`, or `foldingSignaturePages: 16`. `BookSpineGeometryPanel.tsx` fetches the active `COLIBRI_HARDCOVER_STANDARD_V2` profile rules from `/api/budget/spine/profiles` (`resolveHardcoverParametersFromProfile()`); if authoritative profile parameters are missing, readiness halts with `HARDCOVER_PROFILE_PARAMETERS_REQUIRED` (`HTTP 422` in BFF).

### SPINE-04-R02 — Strict Book Format & Dimension Validation (Zero Fallback to `A5`)
- **Removed Silent Fallback (`|| STANDARD_SIZE_LOOKUP_MM.A5`)**: `resolveTrimDimensionsMm()` in `lib/spineApi.ts` validates `book_size`, `custom_width`, `custom_height`, and `orientation`.
- Unrecognized `book_size`, missing/out-of-bounds custom dimensions (`< 50 mm` or `> 1000 mm`), or invalid `orientation` return `valid: false` with `INVALID_BOOK_DIMENSIONS` (`UNRECOGNIZED_BOOK_SIZE_FORMAT`, `INVALID_CUSTOM_BOOK_DIMENSIONS`, `INVALID_BOOK_ORIENTATION`, or `MISSING_BOOK_SIZE`), blocking spine calculation in both the UI and BFF (`HTTP 422`).

### SPINE-04-R03 — Explicit Epistemic & Industrial Certification States
- Replaced the generic `VALIDATED` visual badge in `components/BookSpineGeometryPanel.tsx` with `deriveSpinePanelStatusFromResult(result)` and a 5-step epistemic certification matrix (`data-testid="spine-certification-matrix"`):
  1. `MATH_VALIDATED_PENDING_INDUSTRIAL` (`MATH_BRANCH_VALIDATED` — formula verified, pending physical workshop validation)
  2. `EXCEL_EXAMPLE_PARITY_ONLY` (`EXCEL_EXAMPLE_PARITY` — matches saved Excel example only)
  3. `PROVISIONAL_ESTIMATE` (`PROVISIONAL_ESTIMATE` — unverified provenance or missing cover caliper)
  4. `REQUIRES_TECH_APPROVAL` (`operationalStatus === 'REQUIRES_TECH_APPROVAL'`)
  5. `PRINTHOUSE_TECHNICALLY_VALIDATED` (`PRINTHOUSE_TECHNICALLY_VALIDATED` — printhouse validated, pending release certification)
  6. `PRODUCTION_CERTIFIED` (Strictly reserved for `certificationTier === 'PRODUCTION_CERTIFIED'` AND `operationalStatus === 'PRODUCTION_SAFE'` AND `canReleaseToManufacturing === true`)

---

## 3. Files Added & Modified

| File | Role |
| :--- | :--- |
| [types.ts](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/types.ts) | Added caliper provenance fields, `SpineBindingProfileRules`, and the full typed contract for `/api/v1/spine/*`. |
| [lib/spineApi.ts](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/lib/spineApi.ts) | Typed client for `/api/budget/spine/*`, strict format validator (`resolveTrimDimensionsMm`), provenance normalizer (`normalizeMaterialCaliperProvenance`), hardcover profile rule extractor (`resolveHardcoverParametersFromProfile`), and governance readiness evaluator (`resolveSpineRequestReadiness`). |
| [components/BookSpineGeometryPanel.tsx](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/components/BookSpineGeometryPanel.tsx) | PrintPrice OS Design System component displaying Spine & Cover geometry, proportional SVG technical blueprint, 5-step epistemic certification matrix strip, and 12 explicit governance states. |
| [components/AdvancedPaperSelector.tsx](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/components/AdvancedPaperSelector.tsx) | Preserves authoritative caliper provenance (`caliperUm`, `bulkFactor`, `caliperSource`, `caliperConfidenceStatus` defaulting to `'PROVISIONAL_ESTIMATED'` when unverified) and displays physical microns ($\mu\text{m}$). |
| [components/ConfigurationSummary.tsx](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/components/ConfigurationSummary.tsx) | Displays calculated Spine & Cover Spread dimensions and explicit governance states in both Desktop and Mobile summaries. |
| [App.tsx](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/App.tsx) | Integrates `BookSpineGeometryPanel` in the book configuration workflow and wires one-click switching from Standard Presets to the Certified Paper Catalog. |
| [server/server.js](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/server.js) | Implements `/api/budget/spine/*` BFF proxy routes with `sanitizeSpineCalculateRequest()` validation and `SPINE_NOT_AVAILABLE` protection. |
| [server/scripts/test_spine_04_integration.js](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/scripts/test_spine_04_integration.js) | Automated integration & governance test suite (46 assertions across 9 sections) verifying PR #11 contract parity and all `SPINE-04R` R01/R02/R03 invariants. |
| [.github/workflows/ci.yml](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/.github/workflows/ci.yml) | Runs `test_spine_04_integration.js` alongside TypeScript typecheck, Vite build, and `verify_budget_01d_regression.js`. |

---

## 4. Governance & Mathematical Verification Matrix

| Scenario | Input Specification | Expected / Verified Output | Status |
| :--- | :--- | :--- | :--- |
| **Same GSM, Smooth Offset (`98 µm`)** | `170×240 mm`, `200 pp`, `Amber Graphic 100 gsm (98 µm)`, Softcover Sewn | Block: `9.80 mm` · Spine: `11.5 mm` · Net Cover: `351.5×240.0 mm` · With Bleed: `357.5×246.0 mm` | **PASS** |
| **Same GSM, High-Bulk Paper (`175 µm`)** | `170×240 mm`, `200 pp`, `Holmen Book Cream 2.0 100 gsm (175 µm)`, Softcover Sewn | Block: `17.50 mm` · Spine: `20.0 mm` · Net Cover: `360.0×240.0 mm` · With Bleed: `366.0×246.0 mm` | **PASS** |
| **Softcover Glued vs Sewn** | `170×240 mm`, `200 pp`, `98 µm`, Glued (`GLUED`) vs Sewn (`SEWN`) | Glued Spine: `10.5 mm` vs Sewn Spine: `11.5 mm` | **PASS** |
| **Softcover with Flaps (`90 mm`)** | `170×240 mm`, `200 pp`, `98 µm`, `SOFTCOVER_WITH_FLAPS` (`90 mm`) | Net Cover: `535.5×240.0 mm` · With Bleed: `541.5×246.0 mm` | **PASS** |
| **Hardcover Colibri Governance** | `170×240 mm`, `200 pp`, `HARDCOVER` (`SEWN`, profile-governed `2.4 mm` board) | `operationalStatus: REQUIRES_TECH_APPROVAL`, `canReleaseToManufacturing: false`, Board `165×245 mm`, Rastri `10.5 mm`, Turn-in `18.0 mm` | **PASS** |
| **R01: Missing Cover Caliper (Sewn)** | `SOFTCOVER_STANDARD` + `SEWN` without `coverCaliperUm` | Sent as `coverCaliperUm: null` (`NONE` / `MISSING`), returns `PROVISIONAL_ESTIMATE` + `MISSING_COVER_CALIPER_FOR_SEWN_SOFTCOVER` | **PASS** |
| **R01: Unverified Interior Provenance** | `caliperUm: 120` without `caliperSource` / `caliperConfidenceStatus` | Normalized to `caliperSource: 'NONE'`, `caliperConfidenceStatus: 'PROVISIONAL_ESTIMATED'` (never `VERIFIED`) | **PASS** |
| **R01: Hardcover Missing Profile Params** | `HARDCOVER` without Control Plane profile parameters | Blocked with `HARDCOVER_PROFILE_PARAMETERS_REQUIRED` (`HTTP 422`) | **PASS** |
| **R02: Unrecognized Book Size / Custom** | `book_size: 'FOOBAR_SIZE'` or `Custom` without valid mm | Blocked with `INVALID_BOOK_DIMENSIONS` (`UNRECOGNIZED_BOOK_SIZE_FORMAT` / `INVALID_CUSTOM_BOOK_DIMENSIONS`), zero fallback to `A5` | **PASS** |
| **R03: Epistemic Certification States** | `MATH_BRANCH_VALIDATED`, `EXCEL_EXAMPLE_PARITY`, `PRINTHOUSE_TECHNICALLY_VALIDATED`, `PRODUCTION_CERTIFIED` | Distinct UI badges and 5-step certification matrix strip (`PRODUCTION_CERTIFIED` only when `canReleaseToManufacturing === true`) | **PASS** |
| **Flexibound Experimental Gate** | `FLEXI_STANDARD` (`SEWN`) | Blocked (`EXPERIMENTAL_DISABLED` / `INVALID_BLOCKED`, `spineWidthMm: null`) | **PASS** |
| **Missing Caliper Gate** | Standard Preset or Catalog Variant with `caliperUm: null` | Blocked with `CALIPER_VERIFICATION_REQUIRED` / `MISSING_SEGMENT_CALIPER` (`spineWidthMm: null`) | **PASS** |
| **Control Plane Spine Inactive** | Upstream `/api/v1/spine/*` returns `404` / unreachable | Returns `HTTP 503` `SPINE_NOT_AVAILABLE` with zero synthetic dimensions | **PASS** |
| **BPE Economic Regression** | `verify_budget_01d_regression.js` (10 scenarios, 16 price assertions) | `100%` pass (`0.00 EUR` drift on BPE quotes) | **PASS** |
