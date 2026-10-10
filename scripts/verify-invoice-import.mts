/**
 * Regression tests for estimate/invoice import + money math.
 * Run: npx tsx scripts/verify-invoice-import.mts
 */
import { readFileSync, existsSync } from 'fs';
import {
  importInvoiceFromFile,
  isInvoiceImportFile,
  parseNumber,
  isSparseExtractedText,
  canRunBrowserOcr,
} from '../src/lib/invoiceImportFromFile.ts';
import { calculateLineTotal, roundMoney, toCents, fromCents } from '../src/lib/invoiceTotals.ts';
import { parseLocaleNumber } from '../src/lib/localeNumber.ts';
import { normalizeInvoiceUnit, formatUnitForPdf } from '../src/lib/invoiceUnits.ts';
import { validateImportedDraft } from '../src/lib/invoiceImportValidate.ts';

let failed = 0;
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    passed += 1;
    console.log('OK:', msg);
  }
}

// —— 1. Spanish / locale numbers ——
assert(
  parseLocaleNumber('1.250,50').value === 1250.5,
  '1.250,50 → 1250.50',
);
assert(parseLocaleNumber('1250,50').value === 1250.5, '1250,50 → 1250.5');
assert(parseLocaleNumber('12,5').value === 12.5, '12,5 → 12.5');
assert(
  parseLocaleNumber('2.345,75 €').value === 2345.75,
  '2.345,75 € → 2345.75',
);
assert(parseLocaleNumber('1,234.56').value === 1234.56, 'US 1,234.56');
assert(parseLocaleNumber('1234.56').value === 1234.56, 'plain 1234.56');
assert(parseLocaleNumber('1 234,56').value === 1234.56, 'space thousands EU');
assert(parseLocaleNumber("1'234.56").value === 1234.56, "apostrophe thousands");
assert(parseLocaleNumber('0,75').value === 0.75, '0,75');
assert(parseLocaleNumber('0.75').value === 0.75, '0.75');
assert(
  parseLocaleNumber('1.250', { preferGroupedThousandsDot: true }).value === 1250 &&
    parseLocaleNumber('1.250', { preferGroupedThousandsDot: true }).ambiguous,
  '1.250 ES thousands + ambiguous',
);
assert(
  parseLocaleNumber('1.250').value === 1.25 && parseLocaleNumber('1.250').ambiguous,
  '1.250 default decimal + ambiguous',
);
assert(parseNumber('(del 7 o del 5)') === 0, 'text with digits → 0, not 75');
assert(parseNumber('Albañilería') === 0, 'work name → 0');

// —— 2 / 3. Money math (cents, no float drift) ——
assert(
  calculateLineTotal(2, 1250.5, 0) === 2501,
  '1.250,50 × 2 = 2.501,00',
);
assert(
  calculateLineTotal(12.5, 20, 0) === 250,
  '12,5 m² × 20,00 € = 250,00 €',
);
assert(
  calculateLineTotal(9.95, 27, 0) === 268.65,
  '9.95 × 27 = 268.65 (cents)',
);
assert(toCents(0.1 + 0.2) === 30, '0.1+0.2 → 30 cents via roundMoney path');
assert(fromCents(2501) === 25.01, 'fromCents(2501) → 25.01');
assert(fromCents(toCents(1250.5)) === 1250.5, 'toCents/fromCents round-trip');
assert(roundMoney(268.649999999) === 268.65, 'roundMoney float noise');

// —— 4. Empty qty/price not invented ——
assert(parseLocaleNumber('').value === 0, 'empty → 0');
assert(parseLocaleNumber(null).value === 0, 'null → 0');
assert(parseNumber('abc') === 0, 'letters → 0');

// —— 5. Units ——
assert(normalizeInvoiceUnit('ml') === 'lm', 'ml → lm');
assert(normalizeInvoiceUnit('ud') === 'pcs', 'ud → pcs');
assert(normalizeInvoiceUnit('global') === 'Pauschal', 'global → Pauschal');
assert(normalizeInvoiceUnit('m2') === 'm²', 'm2 → m²');
assert(normalizeInvoiceUnit('sq m') === 'm²', 'sq m → m²');
assert(normalizeInvoiceUnit('cbm') === 'm³', 'cbm → m³');
assert(normalizeInvoiceUnit('Stk.') === 'pcs', 'Stk. → pcs');
assert(normalizeInvoiceUnit('set') === 'Pauschal', 'set → Pauschal');
assert(normalizeInvoiceUnit('kg') === 'pcs', 'kg → pcs (app has no kg)');
assert(normalizeInvoiceUnit('tonne') === 'pcs', 'tonne → pcs (no t in select)');
assert(formatUnitForPdf('pcs', 'es') === 'ud', 'PDF es pcs→ud');
assert(formatUnitForPdf('lm', 'es') === 'ml', 'PDF es lm→ml');
assert(formatUnitForPdf('Pauschal', 'es') === 'global', 'PDF es Pauschal→global');
assert(
  normalizeInvoiceUnit('m²') !== normalizeInvoiceUnit('ml'),
  'm² ≠ ml/lm',
);
assert(
  normalizeInvoiceUnit('m³') !== normalizeInvoiceUnit('m²'),
  'm³ ≠ m²',
);

// —— 6. Format gate: DOC not claimed; images yes ——
assert(
  !isInvoiceImportFile(new File(['x'], 'a.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })),
  'DOCX not accepted',
);
assert(
  !isInvoiceImportFile(new File(['x'], 'a.doc')),
  'DOC not accepted',
);
assert(
  isInvoiceImportFile(new File(['x'], 'a.xlsx')),
  'XLSX accepted',
);
assert(
  isInvoiceImportFile(new File(['x'], 'scan.png', { type: 'image/png' })),
  'PNG image accepted (OCR path in browser)',
);
assert(
  isInvoiceImportFile(new File(['x'], 'a.pdf', { type: 'application/pdf' })),
  'PDF accepted',
);

// —— 7. Sparse PDF text detection (OCR trigger) ——
assert(isSparseExtractedText('') === true, 'empty text is sparse');
assert(isSparseExtractedText('abc') === true, 'short text is sparse');
assert(
  isSparseExtractedText(
    'Trabajo Unidad Medición Precio Total\nPintura 12,5 m2 20,00 250,00\n'.repeat(3),
  ) === false,
  'table-like text not sparse',
);
assert(canRunBrowserOcr() === false, 'Node has no browser OCR (expected)');

// —— 8. Synthetic EU CSV with mismatch (must NOT silently rewrite price) ——
const mismatchCsv =
  'Trabajo;Unidad;Medición;Precio;Total €\n' +
  'Pintura;m2;12,5;20,00;999,00\n';
const mismatchDraft = await importInvoiceFromFile(
  new File([mismatchCsv], 'mismatch.csv', { type: 'text/csv' }),
);
assert(mismatchDraft.items.length === 1, 'mismatch CSV 1 line');
assert(
  Math.abs(mismatchDraft.items[0].price - 20) < 0.001,
  'mismatch: price kept 20 (not rewritten from Total)',
);
assert(
  mismatchDraft.items[0].needsReview === true,
  'mismatch: needsReview flagged',
);
assert(
  (mismatchDraft.warnings || []).some((w) => /розбіжність|≠/i.test(w)),
  'mismatch: warning surfaced',
);

// —— 9. Same name, different units stay separate ——
const unitsCsv =
  'Опис;Кількість;Од;Ціна;Сума\n' +
  'Плінтус;10;пог.м;8;80\n' +
  'Плінтус;5;шт;12;60\n';
const unitsDraft = await importInvoiceFromFile(
  new File([unitsCsv], 'units.csv', { type: 'text/csv' }),
);
assert(unitsDraft.items.length === 2, 'same name different units → 2 lines');
assert(unitsDraft.items[0].unit === 'lm' && unitsDraft.items[1].unit === 'pcs', 'units distinct');

// —— 10. Long multiline-ish description (single cell) ——
const longCsv =
  'Description;Qty;Unit;Price;Total\n' +
  '"Drywall / Trockenbau — 12.5mm boards, acoustic, incl. jointing";3;m2;45;135\n';
const longDraft = await importInvoiceFromFile(
  new File([longCsv], 'long.csv', { type: 'text/csv' }),
);
assert(
  longDraft.items[0]?.description.includes('Drywall') &&
    longDraft.items[0]?.description.includes('acoustic'),
  'long work name preserved',
);

// —— 11. VAT-included hint + multi-rate note via PDF-like text is unit-tested in taxHints
// Covered indirectly: validation + spreadsheet IVA column as description noise
const ivaCsv =
  'Trabajo;Unidad;Cantidad;Precio;Total\n' +
  'Alicatado;m2;10;25;250\n' +
  'Total;;;250\n';
const ivaDraft = await importInvoiceFromFile(
  new File([ivaCsv], 'iva.csv', { type: 'text/csv' }),
);
assert(ivaDraft.items.length === 1, 'Total footer not imported as line');
assert(Math.abs(ivaDraft.items[0].total - 250) < 0.02, 'IVA CSV line total');

// —— 12. validateImportedDraft ——
const vEmpty = validateImportedDraft({ items: [] });
assert(vEmpty.ok === false, 'validate empty draft fails');
const vOk = validateImportedDraft({
  items: [
    {
      quantity: 2,
      quantityDisplay: '2',
      unit: 'm²',
      price: 10,
      priceDisplay: '10',
      material: '',
      materialDisplay: '',
      description: 'Pintura',
      total: 20,
    },
  ],
});
assert(vOk.ok === true, 'validate clean draft ok');
const vReview = validateImportedDraft({
  items: [
    {
      quantity: 0,
      quantityDisplay: '',
      unit: 'm²',
      price: 10,
      priceDisplay: '10',
      material: '',
      materialDisplay: '',
      description: 'Enlucido',
      total: 0,
      needsReview: true,
      reviewWarnings: ['Порожня кількість'],
    },
  ],
});
assert(vReview.reviewItemIndexes.length === 1, 'validate flags review index');

// —— 13. Corrupted / incomplete table ——
let threw = false;
try {
  await importInvoiceFromFile(
    new File(['hello;;;;\nworld;;;;\n'], 'bad.csv', { type: 'text/csv' }),
  );
} catch {
  threw = true;
}
assert(threw, 'incomplete CSV without headers throws');

// —— 14. EN CSV ——
const enCsv =
  'Description;Qty;Unit;Price;Total\n' +
  'Painting;12.5;sqm;20;250\n' +
  'Demolition;1;h;40;40\n';
const enDraft = await importInvoiceFromFile(
  new File([enCsv], 'en.csv', { type: 'text/csv' }),
);
assert(enDraft.items.length === 2, 'EN CSV 2 lines');
assert(enDraft.items[0].unit === 'm²' && enDraft.items[0].total === 250, 'EN painting');
assert(enDraft.items[1].unit === 'h', 'EN hours');

// —— 15. File totals mismatch warning ——
const sumCsv =
  'Trabajo;Unidad;Medición;Precio;Total €\n' +
  'A;m2;1;10;10\n' +
  'B;m2;1;10;10\n' +
  'Total;;;;999\n';
const sumDraft = await importInvoiceFromFile(
  new File([sumCsv], 'sum.csv', { type: 'text/csv' }),
);
assert(
  (sumDraft.warnings || []).some((w) => /не збігається|3500|999/i.test(w) || /999/.test(w)),
  'file total mismatch warning',
);

// —— Real Presupuesto file ——
const xlsxPath =
  '/home/ubuntu/.cursor/projects/workspace/uploads/Presupuesto_09_10_2026_dafd.xlsx';
if (existsSync(xlsxPath)) {
  const buf = readFileSync(xlsxPath);
  const draft = await importInvoiceFromFile(
    new File([buf], 'Presupuesto_09_10_2026.xlsx'),
  );
  const sum = draft.items.reduce((s, i) => s + i.total, 0);
  assert(draft.items.length === 21, `21 lines, got ${draft.items.length}`);
  assert(Math.abs(sum - 3500) < 0.05, `sum 3500, got ${sum}`);
  assert(draft.importedSheet === 'Mano de obra', 'importedSheet Mano de obra');
  assert(
    draft.skippedSheets?.includes('Materiales') === true,
    'skipped Materiales',
  );
  assert(
    !draft.items.some((i) => /^total$/i.test(i.description)),
    'no Total row',
  );
  assert(
    !draft.items.some((i) => i.description === 'Trabajo'),
    'no header Trabajo row',
  );
  const p4 = draft.items[3];
  assert(
    Math.abs(p4.quantity - 5.1) < 0.001 &&
      Math.abs(p4.price - 33) < 0.001 &&
      Math.abs(p4.total - 168.3) < 0.02,
    'pos4 del 7 o del 5 → 5.1×33=168.30',
  );
  assert(
    draft.items.every((i) => !!i.originalDescription),
    'original Spanish descriptions preserved',
  );
  assert(
    draft.items.some((i) => /Demolición/i.test(i.description)),
    'Spanish work names kept',
  );
  assert(draft.extractionMethod === 'spreadsheet', 'extractionMethod spreadsheet');

  const draft2 = await importInvoiceFromFile(
    new File([buf], 'Presupuesto_09_10_2026.xlsx'),
  );
  assert(
    draft2.items.length === draft.items.length && draft.items.length === 21,
    're-import same count, no duplication in parser',
  );

  const v = validateImportedDraft(draft);
  assert(v.ok === true, 'Presupuesto draft validates ok');
} else {
  console.warn('SKIP file tests: Presupuesto xlsx not in uploads');
}

// UA CSV
const csv = 'Опис;Кількість;Од;Ціна;Сума\nШтукатурка;12;м2;25;300\nПлінтус;10;пог.м;8;80\n';
const csvDraft = await importInvoiceFromFile(
  new File([csv], 'ua.csv', { type: 'text/csv' }),
);
assert(csvDraft.items.length === 2, 'UA CSV 2 lines');
assert(csvDraft.items[0].unit === 'm²' && csvDraft.items[0].total === 300, 'CSV line1');
assert(csvDraft.items[1].unit === 'lm' && csvDraft.items[1].total === 80, 'CSV line2');

// Text PDF line heuristic (synthetic plain text via CSV path already covers structure;
// PDF OCR cannot run in Node — documented)
assert(
  true,
  'scanned PDF/photo OCR: browser-only path (canRunBrowserOcr=false in Node) — not claimed green here',
);

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nAll invoice-import assertions passed (${passed})`);
