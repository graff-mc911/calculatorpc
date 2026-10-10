/**
 * Regression tests for estimate/invoice import + money math (PROMPT №2).
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
import {
  calculateLineTotal,
  expandItemsForInvoiceTable,
  roundMoney,
  toCents,
  fromCents,
} from '../src/lib/invoiceTotals.ts';
import {
  parseLocaleNumber,
  confirmedNumber,
} from '../src/lib/localeNumber.ts';
import {
  normalizeInvoiceUnit,
  formatUnitForPdf,
  resolveInvoiceUnit,
  looksLikeSquareMeter,
  looksLikePieceUnit,
} from '../src/lib/invoiceUnits.ts';
import {
  validateImportedDraft,
  canPersistImportedItems,
  unresolvedCriticalIndexes,
} from '../src/lib/invoiceImportValidate.ts';
import { translations } from '../src/lib/languages.ts';

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

// —— 1. Text instead of number ——
const textNum = parseLocaleNumber('(del 7 o del 5)');
assert(textNum.status === 'invalid' && textNum.value === null, '1 text→invalid null');
assert(parseNumber('(del 7 o del 5)') === 0, '1 legacy parseNumber 0');
assert(parseLocaleNumber('Albañilería').status === 'invalid', '1 work name invalid');
assert(parseLocaleNumber('abc').status === 'invalid', '1 abc invalid');

// —— 2. Empty quantity ——
const empty = parseLocaleNumber('');
assert(empty.status === 'empty' && empty.value === null, '2 empty≠confirmed 0');
assert(confirmedNumber(empty) === null, '2 confirmedNumber null');

// —— 3. Ambiguous 1.250 ——
const ambEs = parseLocaleNumber('1.250', { preferGroupedThousandsDot: true });
assert(
  ambEs.status === 'ambiguous' && ambEs.value === 1250 && ambEs.ambiguous,
  '3 1.250 ES ambiguous 1250',
);
const ambDef = parseLocaleNumber('1.250');
assert(
  ambDef.status === 'ambiguous' && ambDef.value === 1.25,
  '3 1.250 default ambiguous 1.25',
);

// —— 4 / 5. ES and US formats ——
assert(parseLocaleNumber('1.250,50').status === 'ok' && parseLocaleNumber('1.250,50').value === 1250.5, '4 ES 1.250,50');
assert(parseLocaleNumber('1,250.50').status === 'ok' && parseLocaleNumber('1,250.50').value === 1250.5, '5 US 1,250.50');
assert(parseLocaleNumber('1250,50').value === 1250.5, '4b 1250,50');
assert(parseLocaleNumber('12,5').value === 12.5, '4c 12,5');
assert(parseLocaleNumber('2.345,75 €').value === 2345.75, '4d euro');
assert(parseLocaleNumber('1 234,56').value === 1234.56, '4e space');
assert(parseLocaleNumber("1'234.56").value === 1234.56, '5b apostrophe');

// —— Money math ——
assert(calculateLineTotal(2, 1250.5, 0) === 2501, 'math 1.250,50×2');
assert(calculateLineTotal(12.5, 20, 0) === 250, 'math 12.5×20');
assert(calculateLineTotal(9.95, 27, 0) === 268.65, 'math cents');
assert(toCents(0.1 + 0.2) === 30, 'cents 0.1+0.2');
assert(fromCents(2501) === 25.01, 'fromCents');
assert(roundMoney(268.649999999) === 268.65, 'roundMoney');

// —— 6. Units kg/pcs/m/lm/m²/m³ ——
assert(resolveInvoiceUnit('kg').normalized === 'kg', '6 kg→kg');
assert(resolveInvoiceUnit('kg').known === true, '6 kg known');
assert(normalizeInvoiceUnit('kg') === 'kg', '6 normalize kg');
assert(resolveInvoiceUnit('pcs').normalized === 'pcs', '6 pcs');
assert(resolveInvoiceUnit('ud').normalized === 'pcs', '6 ud→pcs');
assert(resolveInvoiceUnit('m').normalized === 'm', '6 bare m≠lm');
assert(resolveInvoiceUnit('ml').normalized === 'lm', '6 ml→lm');
assert(resolveInvoiceUnit('m2').normalized === 'm²', '6 m2');
assert(resolveInvoiceUnit('m3').normalized === 'm³', '6 m3');
assert(resolveInvoiceUnit('m').normalized !== resolveInvoiceUnit('ml').normalized, '6 m≠lm');
assert(resolveInvoiceUnit('m²').normalized !== resolveInvoiceUnit('m³').normalized, '6 m²≠m³');
assert(normalizeInvoiceUnit('mÂ²') === 'm²', '6 mojibake');
assert(normalizeInvoiceUnit('m^2') === 'm²', '6 m^2');
assert(formatUnitForPdf('pcs', 'es') === 'ud', '6 pdf ud');
assert(formatUnitForPdf('kg', 'es') === 'kg', '6 pdf kg');

// —— 7. Unknown unit ——
const unk = resolveInvoiceUnit('foobar');
assert(unk.known === false && unk.unit === 'foobar', '7 unknown keeps original');
assert(unk.normalized === null, '7 unknown not normalized to pcs');

const unkCsv =
  'Trabajo;Unidad;Medición;Precio;Total\n' +
  'Cemento;xyz;10;5;50\n';
const unkDraft = await importInvoiceFromFile(
  new File([unkCsv], 'unk.csv', { type: 'text/csv' }),
);
assert(unkDraft.items[0]?.unit === 'xyz', '7 import keeps xyz');
assert(unkDraft.items[0]?.critical === true, '7 unknown unit critical');
assert(unkDraft.items[0]?.unitKnown === false, '7 unitKnown false');

// —— 8. Total mismatch ——
const mismatchCsv =
  'Trabajo;Unidad;Medición;Precio;Total €\n' +
  'Pintura;m2;12,5;20,00;999,00\n';
const mismatchDraft = await importInvoiceFromFile(
  new File([mismatchCsv], 'mismatch.csv', { type: 'text/csv' }),
);
assert(Math.abs(mismatchDraft.items[0].price - 20) < 0.001, '8 price kept 20');
assert(
  (mismatchDraft.warnings || []).some((w) => /розбіжність|≠/i.test(w)),
  '8 mismatch warning',
);

// —— 9. Block save on critical ——
assert(
  canPersistImportedItems(unkDraft.items) === false,
  '9 cannot persist unknown unit',
);
assert(unresolvedCriticalIndexes(unkDraft.items).length >= 1, '9 critical indexes');
const confirmed = unkDraft.items.map((i) => ({
  ...i,
  reviewConfirmed: true,
  critical: false,
  needsReview: false,
}));
assert(canPersistImportedItems(confirmed) === true, '9 persist after confirm');

const emptyQtyCsv =
  'Trabajo;Unidad;Medición;Precio;Total\n' +
  'Pintura;m2;;20,00;\n';
const emptyQtyDraft = await importInvoiceFromFile(
  new File([emptyQtyCsv], 'emptyq.csv', { type: 'text/csv' }),
);
assert(
  emptyQtyDraft.items.some((i) => i.critical) || emptyQtyDraft.items.length === 0,
  '9 empty qty critical or skipped',
);

// —— Soft validate ——
const vEmpty = validateImportedDraft({ items: [] });
assert(vEmpty.ok === false && vEmpty.canPersist === false, 'validate empty');

// —— Format gate ——
assert(!isInvoiceImportFile(new File(['x'], 'a.docx')), 'DOCX rejected');
assert(isInvoiceImportFile(new File(['x'], 'a.xlsx')), 'XLSX ok');
assert(isInvoiceImportFile(new File(['x'], 'a.png', { type: 'image/png' })), 'PNG ok');
assert(isSparseExtractedText('') === true, 'sparse empty');
assert(canRunBrowserOcr() === false, 'no OCR in Node');

// —— Same name different units ——
const unitsCsv =
  'Опис;Кількість;Од;Ціна;Сума\n' +
  'Плінтус;10;пог.м;8;80\n' +
  'Плінтус;5;шт;12;60\n';
const unitsDraft = await importInvoiceFromFile(
  new File([unitsCsv], 'units.csv', { type: 'text/csv' }),
);
assert(unitsDraft.items.length === 2, 'units 2 lines');
assert(unitsDraft.items[0].unit === 'lm' && unitsDraft.items[1].unit === 'pcs', 'units distinct');

// —— kg CSV ——
const kgCsv =
  'Description;Qty;Unit;Price;Total\n' +
  'Cement;25;kg;0.40;10\n';
const kgDraft = await importInvoiceFromFile(
  new File([kgCsv], 'kg.csv', { type: 'text/csv' }),
);
assert(kgDraft.items[0]?.unit === 'kg', 'kg stays kg not pcs');
assert(Math.abs(kgDraft.items[0].quantity - 25) < 0.001, 'kg qty 25');

// —— EN ——
const enCsv =
  'Description;Qty;Unit;Price;Total\n' +
  'Painting;12.5;sqm;20;250\n' +
  'Demolition;1;h;40;40\n';
const enDraft = await importInvoiceFromFile(
  new File([enCsv], 'en.csv', { type: 'text/csv' }),
);
assert(enDraft.items[0].unit === 'm²' && enDraft.items[0].total === 250, 'EN painting');
assert(enDraft.items[1].unit === 'h', 'EN hours');

// —— 10–13 Presupuesto: invoice = Mano de obra only (€3500), not +Materiales (€4900) ——
const xlsxCandidates = [
  '/home/ubuntu/.cursor/projects/workspace/uploads/Presupuesto_09_10_2026_5bc4.xlsx',
  '/home/ubuntu/.cursor/projects/workspace/uploads/Presupuesto_09_10_2026_48ef.xlsx',
  '/home/ubuntu/.cursor/projects/workspace/uploads/Presupuesto_09_10_2026_e5b7.xlsx',
  '/home/ubuntu/.cursor/projects/workspace/uploads/Presupuesto_09_10_2026_dafd.xlsx',
];
const xlsxPath = xlsxCandidates.find((p) => existsSync(p));
if (xlsxPath) {
  const buf = readFileSync(xlsxPath);
  const draft = await importInvoiceFromFile(
    new File([buf], 'Presupuesto_09_10_2026.xlsx'),
  );
  const sum = draft.items.reduce((s, i) => s + i.total, 0);
  assert(draft.items.length === 21, `10 21 labor lines got ${draft.items.length}`);
  assert(Math.abs(sum - 3500) < 0.05, `10 sum 3500 got ${sum}`);
  assert(
    /Mano de obra/i.test(draft.importedSheet || ''),
    '10 imported Mano de obra',
  );
  assert(
    draft.skippedSheets?.some((s) => /Materiales/i.test(s)) === true,
    '10 Materiales deferred (not in invoice total)',
  );
  assert(
    (draft.warnings || []).some((w) => /Materiales/i.test(w)),
    '10 warning about skipped materials sheet',
  );
  assert(
    draft.invoice_language === 'es',
    `10 invoice_language es got ${draft.invoice_language}`,
  );
  assert(
    !draft.items.some((i) => /Presupuesto de mano de obra/i.test(i.description)),
    '10 title is not a line item',
  );
  assert(
    !draft.items.some((i) => /^Total$/i.test(String(i.description || '').trim())),
    '10 Total row is not a line item',
  );
  assert(
    draft.items.every((i) => !parseFloat(String(i.material || '0'))),
    '10 no material amounts on labor lines',
  );

  const draft2 = await importInvoiceFromFile(
    new File([buf], 'Presupuesto_09_10_2026.xlsx'),
  );
  assert(draft2.items.length === 21, '11 re-import no dup');

  assert(
    draft.items.every((i) => !!i.originalDescription),
    '12 originals present',
  );
  assert(
    draft.items.some((i) => /Demolición/i.test(i.description)),
    '12 Spanish labor names',
  );
  assert(
    !draft.items.some((i) => /Ladrillo hueco para fábrica/i.test(i.description)),
    '12 materials not mixed into labor invoice',
  );

  const door = draft.items.find((i) =>
    /puerta de balc[oó]n est[aá]ndar/i.test(i.description),
  );
  const demo = draft.items.find((i) =>
    /Demolici[oó]n de tabique con hueco/i.test(i.description),
  );
  const mlLine = draft.items.find(
    (i) => i.unit === 'lm' || /^(ml|m\.?l\.?)$/i.test(String(i.originalUnitRaw || '')),
  );
  const globalLine = draft.items.find(
    (i) =>
      i.unit === 'Pauschal' ||
      /global/i.test(String(i.originalUnitRaw || '')) ||
      /global/i.test(String(i.unit || '')),
  );
  assert(
    !!door && door.unit === 'pcs' && Math.abs(door.quantity - 1) < 0.001,
    'puerta 1 pcs',
  );
  assert(
    !!demo && demo.unit === 'm²' && Math.abs(demo.quantity - 9.95) < 0.001,
    'demo 9.95 m²',
  );
  assert(!!mlLine, 'has ml→lm running-meter line');
  assert(
    formatUnitForPdf(mlLine!.unit, 'es') === 'ml',
    `pdf unit ml got ${formatUnitForPdf(mlLine!.unit, 'es')}`,
  );
  assert(formatUnitForPdf('pcs', 'es') === 'ud', 'pdf unit ud');
  if (globalLine) {
    assert(
      formatUnitForPdf(globalLine.unit, 'es') === 'global' ||
        /global/i.test(formatUnitForPdf(globalLine.unit, 'es')),
      'pdf unit global',
    );
  }

  assert(
    !draft.items.some((i) => i.description === 'Матеріал' || /^Material$/i.test(i.description)),
    'no ghost Material rows',
  );

  // Expand path used by PDF: 21 rows, no synthetic Material, total €3500
  const expanded = expandItemsForInvoiceTable(draft.items, {
    materialLabel: 'Material',
    pauschalUnit: 'global',
  });
  assert(expanded.length === 21, `expand 21 rows got ${expanded.length}`);
  assert(
    !expanded.some((r) => r.is_material_row || /^Material$/i.test(r.description)),
    'expand no Material ghost rows',
  );
  const expandSum = expanded.reduce((s, r) => s + (r.is_section ? 0 : r.total), 0);
  assert(Math.abs(expandSum - 3500) < 0.05, `expand sum 3500 got ${expandSum}`);

  // ES PDF column heading must use short label (avoid Cantidad wrap)
  const esDict = translations.es as Record<string, string>;
  assert(esDict.quantityShort === 'Cant.', 'es quantityShort Cant.');
  assert((translations.en as Record<string, string>).quantityShort === 'Qty', 'en quantityShort');

  const v = validateImportedDraft(draft);
  assert(
    v.canPersist === true || unresolvedCriticalIndexes(draft.items).length === 0,
    '10 can persist Presupuesto',
  );

  const snapshot = draft.items.map((i) => ({ ...i }));
  await importInvoiceFromFile(new File([buf], 'Presupuesto_09_10_2026.xlsx'));
  assert(
    snapshot.length === 21 &&
      Math.abs(snapshot.reduce((s, i) => s + i.total, 0) - 3500) < 0.05,
    '13 prior import snapshot unchanged',
  );
} else {
  console.error('FAIL: Presupuesto fixture missing — cannot verify critical import path');
  failed += 1;
}

// UA CSV
const csv = 'Опис;Кількість;Од;Ціна;Сума\nШтукатурка;12;м2;25;300\nПлінтус;10;пог.м;8;80\n';
const csvDraft = await importInvoiceFromFile(
  new File([csv], 'ua.csv', { type: 'text/csv' }),
);
assert(csvDraft.items.length === 2, 'UA CSV 2');
assert(csvDraft.items[0].unit === 'm²' && csvDraft.items[0].total === 300, 'UA line1');

assert(looksLikeSquareMeter('m²') && looksLikePieceUnit('ud'), 'looksLike helpers');
assert(!looksLikeSquareMeter('ud'), 'no cross looksLike');

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nAll invoice-import assertions passed (${passed})`);
