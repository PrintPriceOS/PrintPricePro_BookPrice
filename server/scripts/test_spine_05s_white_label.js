/**
 * SPINE-05S — White-label regression guard for Budget App customer-facing UI.
 *
 * Fails if an external company / machine brand name ("Livonia", "Colibri", "Alegro", "Kolbus")
 * or legacy spreadsheet branding ("Excel ... Parity") appears in user-visible string literals /
 * JSX text of the Budget App frontend, and verifies the presentation mapping helpers used for
 * dynamic backend identifiers (fullProfileKey, caliperSource, certificationTier).
 *
 * Internal identifiers are intentionally allowed (enums, API field names, provenance codes such
 * as LIVONIA_REFERENCE_IMPORT, data-testid attributes, code comments) — provenance must stay
 * auditable and is never mutated.
 */
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const assert = (cond, msg, detail) => {
  if (cond) { passed++; console.log(`  ✓ PASS: ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}${detail ? ' — ' + detail : ''}`); }
};

const ROOT = path.resolve(__dirname, '../..');
const FILES = [
  'App.tsx',
  'components/BookSpineGeometryPanel.tsx',
  'components/ConfigurationSummary.tsx',
  'components/AdvancedPaperSelector.tsx',
  'components/BookPriceForm.tsx',
  'components/PrintOffersPanel.tsx',
  'lib/spineApi.ts',
];

const BRAND = /\b(livonia|colibri|alegro|kolbus)\b/i;
const LEGACY_SHEET = /excel[^'"`\n]{0,40}parity|parity[^'"`\n]{0,10}excel/i;

// Strip comments, then inspect only string literals and JSX text that are not pure identifiers.
function visibleCandidates(src) {
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const out = [];
  const lit = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  let m;
  while ((m = lit.exec(noComments))) out.push(m[2]);
  const jsxText = />([^<>{}]+)</g;
  while ((m = jsxText.exec(noComments))) out.push(m[1]);
  // Exclude internal identifiers: ALL_CAPS_SNAKE codes, kebab ids, data-testid values, regex sources.
  return out.filter((s) => {
    const t = s.trim();
    if (!t) return false;
    if (/^[A-Z0-9_]+$/.test(t)) return false;            // enum / provenance code
    if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(t)) return false; // data-testid / kebab id
    if (t.includes('\\b(')) return false;                  // regex source of the scrubber itself
    return true;
  });
}

console.log('\n[SPINE-05S] White-label static scan of customer-facing strings');
for (const rel of FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const hits = visibleCandidates(src).filter((s) => BRAND.test(s) || LEGACY_SHEET.test(s));
  assert(hits.length === 0, `${rel} has no external brand / legacy spreadsheet branding in visible strings`, hits.join(' | '));
}

console.log('\n[SPINE-05S] Required replacement labels are present');
const panel = fs.readFileSync(path.join(ROOT, 'components/BookSpineGeometryPanel.tsx'), 'utf8');
for (const label of [
  '2. Reference Model Validation',
  'Reference Model Validated',
  'Reference Model Validated · Industrial Approval Pending',
  'REFERENCE MODEL VALIDATED · NOT INDUSTRIALLY CERTIFIED',
  'experimental Flexibound reference model',
  'Flexibound — Technical Reference',
]) {
  assert(panel.includes(label), `Panel contains "${label}"`);
}

console.log('\n[SPINE-05S] Raw certification enums are never interpolated into visible text');
assert(!panel.includes('(${tier})'), 'Certification matrix does not render raw tier enum (e.g. EXCEL_EXAMPLE_PARITY)');
assert(!panel.includes('Governance ({spineResult.certificationTier}'), 'Governance notice does not render raw tier enum');

console.log('\n[SPINE-05S] Internal identifiers and provenance preserved (not mutated)');
assert(panel.includes("certificationTier === 'EXCEL_EXAMPLE_PARITY'"), 'EXCEL_EXAMPLE_PARITY enum still used internally');
assert(fs.readFileSync(path.join(ROOT, 'lib/spineApi.ts'), 'utf8').includes("'LIVONIA_REFERENCE_IMPORT'"), 'LIVONIA_REFERENCE_IMPORT provenance code preserved in API contract');

console.log('\n[SPINE-05S] Presentation mapping helpers (transpiled from the panel source)');
// Extract and evaluate the pure helper block without a TS toolchain.
const start = panel.indexOf('const EXTERNAL_BRAND_PATTERN');
const rest = panel.slice(start);
const end = start + rest.search(/\r?\nexport (type|interface) /);
const block = panel.slice(start, end)
  .replace(/export function/g, 'function')
  .replace(/\(([a-zA-Z]+)\?: string \| null\): string/g, '($1)');
// eslint-disable-next-line no-new-func
const helpers = new Function(`${block}; return { presentProfileLabel, presentCaliperSource, presentCertificationTier, presentText };`)();

const flexi = helpers.presentProfileLabel('livonia-colibri-flexi@2.0.0');
assert(flexi === 'Flexibound — Technical Reference', 'livonia-colibri-flexi@2.0.0 → "Flexibound — Technical Reference"', flexi);
assert(!BRAND.test(helpers.presentProfileLabel('livonia-alegro-softcover@2.0.0')), 'Softcover profile key rendered without brand');
assert(!BRAND.test(helpers.presentProfileLabel('livonia-colibri-hardcover@2.0.0')), 'Hardcover profile key rendered without brand');
assert(!BRAND.test(helpers.presentCaliperSource('LIVONIA_REFERENCE_IMPORT')), 'LIVONIA_REFERENCE_IMPORT rendered as neutral provenance label');
assert(helpers.presentCertificationTier('EXCEL_EXAMPLE_PARITY') === 'REFERENCE MODEL VALIDATED', 'EXCEL_EXAMPLE_PARITY tier rendered as REFERENCE MODEL VALIDATED');
assert(!BRAND.test(helpers.presentText('Uses the Livonia Colibri Flexi reference formula (KOLBUS / COLIBRI FLEXI)')), 'Free-text engine messages are scrubbed of brand names');

console.log(`\nWHITE-LABEL RESULTS: ${passed} PASSED, ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
