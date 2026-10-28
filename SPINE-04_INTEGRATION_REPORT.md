# MISIÓN SPINE-04 — BUDGET APP SPINE CALCULATOR INTEGRATION REPORT

**Repository:** `PrintPriceOS/PrintPricePro_BookPrice`  
**Branch:** `feat/spine-04-budget-spine-integration`  
**Base Reference:** `main` (`e98acd01c9f8e5bb5c0d5629c646c7fa068bd1aa`)  
**Control Plane Reference Contract:** [PR #11 (`feat/spine-03r-caliper-and-engine`)](https://github.com/PrintPriceOS/ppos-control-plane/pull/11)  

---

## 1. Architectural Summary & Zero-Duplicated-Math Guarantee

In strict compliance with PrintPrice OS invariants and `SPINE-04` governance rules:

1. **Zero Client-Side or BFF Formula Duplication**:
   - Neither `lib/spineApi.ts`, `components/BookSpineGeometryPanel.tsx`, nor `server/server.js` contain any Livonia Excel mathematical constants (`1.0718`, `0.9964`, `1.1906`, `1.1338`, `1.5213`, `0.7`) or bulk-estimation heuristics.
   - All block thickness (`netPaperBlockMm`, `totalBlockWithEndpapersMm`), spine rounding (`spineWidthMm`), extended cover spread (`netCoverWidthMm`, `flatCoverWidthMm`), hardcover board dimensions (`boardWidthMm`, `boardHeightMm`), hinge scores (`leftHingeScoreMm`), turn-in (`turnInMm`), and circular arc radii ($R(x)$) are resolved exclusively by Control Plane's `/api/v1/spine/calculate`.

2. **Authoritative BFF Proxy Routes (`server/server.js`)**:
   - `GET /api/budget/spine/profiles` $\to$ `${CONTROL_PLANE_BASE_URL}/api/v1/spine/profiles`
   - `POST /api/budget/spine/calculate` $\to$ `${CONTROL_PLANE_BASE_URL}/api/v1/spine/calculate` (preserving `Idempotency-Key`)
   - `GET /api/budget/spine/calculations/:id` $\to$ `${CONTROL_PLANE_BASE_URL}/api/v1/spine/calculations/:id`
   - **Honest Upstream Governance (`SPINE_NOT_AVAILABLE`)**: If Control Plane does not yet have `/api/v1/spine/*` active in the target environment (`404`, `502`, `503`, `504`, or connection failure), the BFF returns `HTTP 503` with `error.code = "SPINE_NOT_AVAILABLE"` and generates **zero synthetic dimensions**.

---

## 2. Files Added & Modified

| File | Role |
| :--- | :--- |
| [types.ts](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/types.ts) | Added caliper provenance fields (`caliperUm`, `bulkFactor`, `caliperSource`, `caliperConfidenceStatus`, `caliperRevision`) to `CatalogPaperVariant` & `SelectedPaperMaterial`, and added the full typed contract for `/api/v1/spine/*` (`SpineCalculationRequestPayload`, `SpineCalculationResult`, `SpineValidationIssue`, certification & operational status enums). |
| [lib/spineApi.ts](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/lib/spineApi.ts) | Typed client for `/api/budget/spine/*`, pure format dimension lookup (`resolveTrimDimensionsMm`), binding mapper (`mapBindingMethodToSpineContract`), and governance readiness evaluator (`resolveSpineRequestReadiness`). |
| [components/BookSpineGeometryPanel.tsx](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/components/BookSpineGeometryPanel.tsx) | PrintPrice OS Design System component displaying Spine Width, Net Paper Block, Extended Flat Cover (net spread & with bleed/turn-in), Verified Caliper & Certification Tier, Hardcover Colibri board/hinge/turn-in sub-grid, proportional SVG technical blueprint, and governance states (`CALIPER_VERIFICATION_REQUIRED`, `REQUIRES_TECH_APPROVAL`, `SPINE_NOT_AVAILABLE`, `ERROR`, `CALCULATING`). |
| [components/AdvancedPaperSelector.tsx](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/components/AdvancedPaperSelector.tsx) | Preserves full caliper provenance (`caliperUm`, `bulkFactor`, `caliperSource`, `caliperConfidenceStatus`) when selecting a catalog variant and surfaces physical microns ($\mu\text{m}$) in variant selectors and technical cards. |
| [components/ConfigurationSummary.tsx](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/components/ConfigurationSummary.tsx) | Displays calculated Spine & Cover Spread dimensions (or governance status) in both the Desktop Configuration Snapshot card and the Mobile Sticky Bottom Drawer. |
| [App.tsx](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/App.tsx) | Integrates `BookSpineGeometryPanel` in the book configuration workflow and wires one-click switching from Standard Presets to the Certified Paper Catalog. |
| [server/server.js](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/server.js) | Implements `/api/budget/spine/profiles`, `/api/budget/spine/calculate`, and `/api/budget/spine/calculations/:id` BFF proxy routes with `SPINE_NOT_AVAILABLE` protection. |
| [server/scripts/test_spine_04_integration.js](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/scripts/test_spine_04_integration.js) | Automated integration & governance test suite verifying PR #11 contract parity, same-GSM different-caliper differentiation, hardcover approval gating, flexi blocking, missing caliper blocking, and `SPINE_NOT_AVAILABLE`. |
| [.github/workflows/ci.yml](file:///C:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/.github/workflows/ci.yml) | Runs `test_spine_04_integration.js` alongside TypeScript typecheck, Vite build, and `verify_budget_01d_regression.js`. |

---

## 3. Governance & Mathematical Verification Matrix

| Scenario | Input Specification | Expected / Verified Output | Status |
| :--- | :--- | :--- | :--- |
| **Same GSM, Smooth Offset (`98 µm`)** | `170×240 mm`, `200 pp`, `Amber Graphic 100 gsm (98 µm)`, Softcover Sewn | Block: `9.80 mm` · Spine: `11.5 mm` · Net Cover: `351.5×240.0 mm` · With Bleed: `357.5×246.0 mm` | **PASS** |
| **Same GSM, High-Bulk Paper (`175 µm`)** | `170×240 mm`, `200 pp`, `Holmen Book Cream 2.0 100 gsm (175 µm)`, Softcover Sewn | Block: `17.50 mm` · Spine: `20.0 mm` · Net Cover: `360.0×240.0 mm` · With Bleed: `366.0×246.0 mm` | **PASS** |
| **Softcover Glued vs Sewn** | `170×240 mm`, `200 pp`, `98 µm`, Glued (`GLUED`) vs Sewn (`SEWN`) | Glued Spine: `10.5 mm` vs Sewn Spine: `11.5 mm` | **PASS** |
| **Softcover with Flaps (`90 mm`)** | `170×240 mm`, `200 pp`, `98 µm`, `SOFTCOVER_WITH_FLAPS` (`90 mm`) | Net Cover: `535.5×240.0 mm` · With Bleed: `541.5×246.0 mm` | **PASS** |
| **Hardcover Colibri Governance** | `170×240 mm`, `200 pp`, `HARDCOVER` (`SEWN`, `2.4 mm` board) | `operationalStatus: REQUIRES_TECH_APPROVAL`, `canReleaseToManufacturing: false`, Board `165×245 mm`, Rastri `10.5 mm`, Turn-in `18.0 mm` | **PASS** |
| **Flexibound Experimental Gate** | `FLEXI_STANDARD` (`SEWN`) | Blocked (`EXPERIMENTAL_DISABLED` / `INVALID_BLOCKED`, `spineWidthMm: null`) | **PASS** |
| **Missing Caliper Gate** | Standard Preset or Catalog Variant with `caliperUm: null` | Blocked with `CALIPER_VERIFICATION_REQUIRED` / `MISSING_SEGMENT_CALIPER` (`spineWidthMm: null`) | **PASS** |
| **Control Plane Spine Inactive** | Upstream `/api/v1/spine/*` returns `404` / unreachable | Returns `HTTP 503` `SPINE_NOT_AVAILABLE` with zero synthetic dimensions | **PASS** |
| **BPE Economic Regression** | `verify_budget_01d_regression.js` (10 scenarios, 16 price assertions) | `100%` pass (`0.00 EUR` drift on BPE quotes) | **PASS** |

