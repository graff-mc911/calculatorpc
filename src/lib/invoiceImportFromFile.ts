import * as XLSX from 'xlsx';
import { calculateLineTotal, roundMoney } from './invoiceTotals';
import type { PrefillInvoiceItem } from './invoiceFromProject';
import { extractInvoiceDataFromPDF } from './pdfTextExtractor';
import {
  isMaterialOnlyLabel,
  normalizeInvoiceUnit,
  splitQtyUnit,
} from './invoiceUnits';
import { parseLocaleNumber } from './localeNumber';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export const INVOICE_IMPORT_STORAGE_KEY = 'cpc-invoice-import-v1';

/** Sales document kinds stored on invoices.document_type */
export type ImportedDocumentType = 'invoice' | 'estimate' | 'proposal';

export type ImportedInvoiceDraft = {
  client_name?: string;
  document_number?: string;
  date?: string;
  currency?: string;
  notes?: string;
  object_address?: string;
  /** Document labels language for DIN 5008 PDF (German standard). */
  invoice_language?: string;
  /** Detected from file name / titles — not guessed from layout. */
  document_type?: ImportedDocumentType;
  items: PrefillInvoiceItem[];
  sourceFileName?: string;
  importedSheet?: string;
  skippedSheets?: string[];
  warnings?: string[];
};

type ColKey =
  | 'description'
  | 'quantity'
  | 'unit'
  | 'price'
  | 'material'
  | 'total'
  | 'note'
  | 'index';

/** Normalize header / alias: NFD, strip diacritics, lowercase, collapse spaces, trim trailing punctuation. */
function normHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/g, '')
    .trim();
}

/** Raw aliases (written without diacritics). Normalized once at module load. */
const HEADER_ALIASES_RAW: Record<ColKey, string[]> = {
  description: [
    'description',
    'desc',
    'item',
    'artikel',
    'leistung',
    'bezeichnung',
    'work',
    'service',
    'опис',
    'назва',
    'робота',
    'найменування',
    'arbeit',
    'position',
    'позиція',
    'trabajo',
    'descripcion',
    'concepto',
    'designacion',
    'partida',
  ],
  quantity: [
    'qty',
    'quantity',
    'menge',
    'anzahl',
    'qty.',
    'кількість',
    'к-сть',
    'ксть',
    'кол',
    'cantidad',
    'cant',
    'medicion',
    'medicion / cant',
  ],
  unit: [
    'unit',
    'einheit',
    'me',
    'од',
    'од.',
    'одиниця',
    'um',
    'од вим',
    'unidad',
    'ud',
    'unid',
  ],
  price: [
    'price',
    'preis',
    'unit price',
    'einzelpreis',
    'ep',
    'rate',
    'ціна',
    'ставка',
    'ціна од',
    'arbeitpreis',
    'lohnpreis',
    'precio',
    'precio sin iva',
    'precio, sin iva',
    'precio unitario',
    'pu',
  ],
  material: [
    'materialpreis',
    'mat preis',
    'ціна матеріалу',
    'werkstoff',
    'mat price',
    'material price',
    'material',
    'materiales',
  ],
  total: [
    'total',
    'summe',
    'amount',
    'betrag',
    'line total',
    'сума',
    'всього',
    'разом',
    'total €',
    'importe',
  ],
  note: [
    'observaciones',
    'notas',
    'nota',
    'comentarios',
    'примітка',
    'bemerkung',
    'notes',
    'note',
    'comments',
  ],
  index: ['#', '№', 'nº', 'n°', 'no', 'no.', 'num', 'pos', 'pos.', 'п/п', 'nr'],
};

const HEADER_MAP: Record<ColKey, string[]> = (
  Object.keys(HEADER_ALIASES_RAW) as ColKey[]
).reduce(
  (acc, key) => {
    acc[key] = HEADER_ALIASES_RAW[key].map((a) => normHeader(a)).filter(Boolean);
    return acc;
  },
  {} as Record<ColKey, string[]>,
);

function headerAliasHit(headerNorm: string, aliasNorm: string): boolean {
  if (!aliasNorm) return false;
  if (headerNorm === aliasNorm) return true;
  if (aliasNorm.length <= 5) {
    return new RegExp(
      `(^|[^a-zа-яіїєґ0-9])${aliasNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zа-яіїєґ0-9]|$)`,
      'i',
    ).test(headerNorm);
  }
  return headerNorm.includes(aliasNorm);
}

function matchCol(header: string): ColKey | null {
  const h = normHeader(header);
  if (!h) return null;
  const order: ColKey[] = [
    'note',
    'index',
    'quantity',
    'unit',
    'total',
    'material',
    'price',
    'description',
  ];
  for (const key of order) {
    if (HEADER_MAP[key].some((a) => headerAliasHit(h, a))) return key;
  }
  return null;
}

/**
 * Parse a numeric cell. Never extracts digits from text that contains letters.
 * For Spanish thousand-dot ambiguity (`1.250`), use parseLocaleNumber with options.
 */
export function parseNumber(
  raw: unknown,
  options?: { preferGroupedThousandsDot?: boolean },
): number {
  return parseLocaleNumber(raw, options).value;
}

function cellEmpty(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw === 'number') return !Number.isFinite(raw);
  return String(raw).trim() === '';
}

function toItem(partial: {
  description?: string;
  quantity?: number;
  unit?: string;
  price?: number;
  material?: number | string;
  originalQuantityRaw?: string;
  originalPriceRaw?: string;
  originalUnitRaw?: string;
  needsReview?: boolean;
  reviewWarnings?: string[];
  /** Allow inventing qty=1 only for explicit lump-sum / when quantity was present as 1 */
  allowDefaultQtyOne?: boolean;
}): PrefillInvoiceItem | null {
  let description = String(partial.description || '')
    .trim()
    .replace(/\s+/g, ' ');
  let quantity = Number(partial.quantity) || 0;
  let price = Number(partial.price) || 0;
  let materialNum =
    typeof partial.material === 'number'
      ? partial.material
      : parseNumber(partial.material);
  const reviewWarnings = [...(partial.reviewWarnings || [])];
  let needsReview = !!partial.needsReview;

  // "Material: 250" inline in description
  const matInline = description.match(
    /(?:^|[|;/])\s*(?:material|матеріал|мат\.?)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
  );
  if (matInline && materialNum <= 0) {
    materialNum = parseNumber(matInline[1]);
    description = description.replace(matInline[0], '').trim();
  }

  if (!description && quantity <= 0 && price <= 0 && materialNum <= 0) return null;

  const unitRaw = String(partial.unit || '').trim();
  const unit = normalizeInvoiceUnit(unitRaw, 'pcs');
  if (
    unitRaw &&
    normalizeInvoiceUnit(unitRaw, 'pcs') === 'pcs' &&
    normalizeInvoiceUnit(unitRaw, 'm³') === 'm³'
  ) {
    needsReview = true;
    reviewWarnings.push(`Невідома одиниця «${unitRaw}» → pcs`);
  }

  // Do not invent quantity: only default to 1 for Pauschal / explicit allow
  let qty = quantity;
  if (qty <= 0 && (price > 0 || materialNum > 0)) {
    if (unit === 'Pauschal' || partial.allowDefaultQtyOne) {
      qty = 1;
    } else {
      needsReview = true;
      reviewWarnings.push('Порожня кількість — перевірте перед збереженням');
    }
  }

  if (isMaterialOnlyLabel(description) && materialNum <= 0 && price > 0 && qty <= 1) {
    const matAmount = roundMoney(price);
    return {
      quantity: 1,
      quantityDisplay: '1',
      unit: 'Pauschal',
      price: 0,
      priceDisplay: '',
      material: String(matAmount),
      materialDisplay: String(matAmount),
      description: description || 'Material',
      originalDescription: description || 'Material',
      originalQuantityRaw: partial.originalQuantityRaw,
      originalPriceRaw: partial.originalPriceRaw,
      originalUnitRaw: partial.originalUnitRaw || unitRaw,
      total: calculateLineTotal(1, 0, matAmount),
      needsReview,
      reviewWarnings: reviewWarnings.length ? reviewWarnings : undefined,
    };
  }

  const roundedPrice = roundMoney(price);

  return {
    quantity: qty,
    quantityDisplay: String(qty || ''),
    unit,
    price: roundedPrice,
    priceDisplay: roundedPrice ? String(roundedPrice) : '',
    material: materialNum > 0 ? String(roundMoney(materialNum)) : '',
    materialDisplay: materialNum > 0 ? String(roundMoney(materialNum)) : '',
    description: description || 'Position',
    originalDescription: description || 'Position',
    originalQuantityRaw: partial.originalQuantityRaw,
    originalPriceRaw: partial.originalPriceRaw,
    originalUnitRaw: partial.originalUnitRaw || unitRaw,
    total: calculateLineTotal(qty, roundedPrice, materialNum || 0),
    needsReview,
    reviewWarnings: reviewWarnings.length ? reviewWarnings : undefined,
  };
}

function coalesceMaterialRows(items: PrefillInvoiceItem[]): PrefillInvoiceItem[] {
  const out: PrefillInvoiceItem[] = [];
  for (const item of items) {
    const matOnly =
      isMaterialOnlyLabel(item.description) ||
      (item.price === 0 &&
        parseNumber(item.material) > 0 &&
        /material|матеріал/i.test(item.description));

    if (matOnly && out.length > 0) {
      const prev = out[out.length - 1];
      const add = parseNumber(item.material) || item.price || item.total || 0;
      if (add > 0 && !parseNumber(prev.material)) {
        const material = String(add);
        out[out.length - 1] = {
          ...prev,
          material,
          materialDisplay: material,
          total: calculateLineTotal(prev.quantity, prev.price, add),
        };
        continue;
      }
    }
    out.push(item);
  }
  return out;
}

/** Build column map from a header row. Material→description when description missing. */
function buildColMap(row: unknown[]): {
  map: Partial<Record<ColKey, number>>;
  keys: ColKey[];
  labels: string[];
} {
  const map: Partial<Record<ColKey, number>> = {};
  const keys: ColKey[] = [];
  const labels: string[] = [];

  row.forEach((cell, idx) => {
    const label = String(cell ?? '').trim();
    if (!label) return;
    const key = matchCol(label);
    if (!key) return;
    labels.push(label);

    if (key === 'material' && map.description === undefined) {
      map.description = idx;
      if (!keys.includes('description')) keys.push('description');
      return;
    }
    if (map[key] === undefined) {
      map[key] = idx;
      keys.push(key);
    }
  });

  return { map, keys, labels };
}

function isValidHeaderMap(map: Partial<Record<ColKey, number>>, keys: ColKey[]): boolean {
  if (map.description === undefined) return false;
  const unique = new Set(keys);
  if (unique.size < 3) return false;
  return (
    map.quantity !== undefined || map.price !== undefined || map.total !== undefined
  );
}

function detectDocumentType(
  fileName: string,
  titles: string[] = [],
): ImportedDocumentType {
  const blob = [fileName, ...titles].join(' ').toLowerCase();
  if (
    /\b(presupuesto|presupuest|estimate|quotation|quote|кошторис|angebot|kostenvoranschlag|devis)\b/.test(
      blob,
    )
  ) {
    return 'estimate';
  }
  if (/\b(proposal|vorschlag|пропозиція|proposta)\b/.test(blob)) return 'proposal';
  if (/\b(invoice|rechnung|factura|рахунок|facture)\b/.test(blob)) return 'invoice';
  return 'invoice';
}

function detectInvoiceLanguage(fileName: string, titles: string[]): string | undefined {
  const blob = [fileName, ...titles].join(' ').toLowerCase();
  if (/\b(presupuesto|trabajo|materiales|mano de obra|unidad|medicion|precio)\b/.test(blob)) {
    return 'es';
  }
  if (/\b(rechnung|leistung|menge|einheit|angebot)\b/.test(blob)) return 'de';
  if (/\b(рахунок|кошторис|робота|матеріал|одиниця)\b/.test(blob)) return 'uk';
  return undefined;
}

function guessMetaFromSheet(rows: unknown[][]): Partial<ImportedInvoiceDraft> {
  const meta: Partial<ImportedInvoiceDraft> = {};
  const labelClient = /^(client|kunde|customer|клієнт|заказчик|firma|company|cliente)\b/i;
  const labelDate = /^(date|datum|дата|rechnungsdatum|fecha)\b/i;
  const labelNumber = /^(invoice|rechnung|номер|document|nr\.?|no\.?|factura)\b/i;
  const labelAddress = /^(address|adresse|адреса|object|об.?єкт|direccion|dirección)\b/i;

  for (const row of rows.slice(0, 25)) {
    if (!Array.isArray(row)) continue;
    const a = String(row[0] ?? '').trim();
    const b = String(row[1] ?? '').trim();
    if (!a || !b) continue;
    if (!meta.client_name && labelClient.test(a)) meta.client_name = b;
    if (!meta.date && labelDate.test(a)) {
      const n = parseExcelDate(b);
      if (n) meta.date = n;
    }
    if (!meta.document_number && labelNumber.test(a)) meta.document_number = b;
    if (!meta.object_address && labelAddress.test(a)) meta.object_address = b;
  }

  if (!meta.date) {
    for (const row of rows.slice(0, 5)) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (typeof cell === 'string' || typeof cell === 'number') {
          const n = parseExcelDate(String(cell));
          if (n) {
            meta.date = n;
            break;
          }
        }
      }
      if (meta.date) break;
    }
  }

  return meta;
}

function parseExcelDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const de = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (de) {
    const dd = de[1].padStart(2, '0');
    const mm = de[2].padStart(2, '0');
    return `${de[3]}-${mm}-${dd}`;
  }
  const n = Number(raw);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return utc.toISOString().slice(0, 10);
  }
  return '';
}

function rowsToItems(
  rows: unknown[][],
  colMap: Partial<Record<ColKey, number>>,
  warnings: string[],
  opts: { preferGroupedThousandsDot?: boolean } = {},
): { items: PrefillInvoiceItem[]; fileTotal?: number } {
  const items: PrefillInvoiceItem[] = [];
  let fileTotal: number | undefined;
  const descIdx = colMap.description!;
  let unknownUnits = 0;
  const numOpts = {
    preferGroupedThousandsDot: !!opts.preferGroupedThousandsDot,
  };

  for (let rowNum = 0; rowNum < rows.length; rowNum++) {
    const row = rows[rowNum];
    if (!Array.isArray(row)) continue;

    const descriptionRaw = row[descIdx];
    const description = String(descriptionRaw ?? '')
      .trim()
      .replace(/\s+/g, ' ');

    const qtyRaw = colMap.quantity !== undefined ? row[colMap.quantity] : undefined;
    const priceRaw = colMap.price !== undefined ? row[colMap.price] : undefined;
    const totalRaw = colMap.total !== undefined ? row[colMap.total] : undefined;
    const unitRaw = colMap.unit !== undefined ? row[colMap.unit] : undefined;
    const matRaw = colMap.material !== undefined ? row[colMap.material] : undefined;

    // Never read numbers from columns left of description (index / №)
    if (
      cellEmpty(descriptionRaw) &&
      cellEmpty(qtyRaw) &&
      cellEmpty(priceRaw) &&
      cellEmpty(totalRaw)
    ) {
      continue;
    }

    // Total / footer row → capture fileTotal and stop
    if (/^(total|subtotal|suma|importe total|gesamt|summe|итого|разом|всього)\b/i.test(description)) {
      if (colMap.total !== undefined) {
        fileTotal = parseLocaleNumber(totalRaw, numOpts).value;
      }
      break;
    }

    const lineWarnings: string[] = [];
    let needsReview = false;
    let quantity = 0;
    let unit = '';

    if (colMap.quantity !== undefined) {
      if (
        typeof qtyRaw === 'number' ||
        (typeof qtyRaw === 'string' && !/\p{L}/u.test(String(qtyRaw)))
      ) {
        const parsed = parseLocaleNumber(qtyRaw, numOpts);
        quantity = parsed.value;
        if (parsed.ambiguous) {
          needsReview = true;
          lineWarnings.push(
            `Неоднозначна кількість «${parsed.original}» → ${parsed.value}`,
          );
        }
      } else if (colMap.unit === undefined) {
        const split = splitQtyUnit(qtyRaw);
        quantity = split.quantity;
        if (split.unit) unit = split.unit;
      } else {
        const parsed = parseLocaleNumber(qtyRaw, numOpts);
        quantity = parsed.value;
        if (parsed.ambiguous) {
          needsReview = true;
          lineWarnings.push(
            `Неоднозначна кількість «${parsed.original}» → ${parsed.value}`,
          );
        }
      }
    }

    if (colMap.unit !== undefined) {
      const uRaw = String(unitRaw ?? '').trim();
      if (uRaw) {
        const asPcs = normalizeInvoiceUnit(uRaw, 'pcs');
        const asSentinel = normalizeInvoiceUnit(uRaw, 'm³');
        if (asPcs === 'pcs' && asSentinel === 'm³') unknownUnits += 1;
        unit = asPcs;
      }
    }

    const priceParsed =
      colMap.price !== undefined
        ? parseLocaleNumber(priceRaw, numOpts)
        : { value: 0, ambiguous: false, original: '' };
    let price = priceParsed.value;
    if (priceParsed.ambiguous) {
      needsReview = true;
      lineWarnings.push(`Неоднозначна ціна «${priceParsed.original}» → ${price}`);
    }

    const totalParsed =
      colMap.total !== undefined
        ? parseLocaleNumber(totalRaw, numOpts)
        : { value: 0, ambiguous: false, original: '' };
    let total = totalParsed.value;

    const material =
      colMap.material !== undefined
        ? parseLocaleNumber(matRaw, numOpts).value
        : 0;

    // Section header: description but no qty/price/total and empty unit
    if (
      description &&
      quantity <= 0 &&
      price <= 0 &&
      total <= 0 &&
      !String(unitRaw ?? '').trim()
    ) {
      continue;
    }

    if (price <= 0 && total > 0) {
      price = total / (quantity || 1);
    }

    if (price > 0 && total > 0 && quantity > 0) {
      const expected = roundMoney(quantity * price);
      if (Math.abs(expected - roundMoney(total)) > 0.02) {
        price = total / quantity;
        warnings.push(
          `Рядок ${rowNum + 1}: розбіжність qty×price і Total — взято Total/qty`,
        );
      }
    }

    if (!description) continue;

    // Never invent price from thin air when both empty
    if (price <= 0 && quantity <= 0 && material <= 0 && total <= 0) continue;

    const item = toItem({
      description,
      quantity,
      unit: unit || String(unitRaw ?? ''),
      price,
      material,
      originalQuantityRaw:
        qtyRaw == null || qtyRaw === '' ? undefined : String(qtyRaw),
      originalPriceRaw:
        priceRaw == null || priceRaw === '' ? undefined : String(priceRaw),
      originalUnitRaw:
        unitRaw == null || unitRaw === '' ? undefined : String(unitRaw),
      needsReview,
      reviewWarnings: lineWarnings,
      allowDefaultQtyOne: false,
    });
    if (item) {
      if (item.needsReview && item.reviewWarnings?.length) {
        for (const w of item.reviewWarnings) {
          warnings.push(`Рядок ${rowNum + 1}: ${w}`);
        }
      }
      items.push(item);
    }
  }

  if (unknownUnits > 0) {
    warnings.push(`Нерозпізнаних одиниць: ${unknownUnits} ( підставлено pcs )`);
  }

  return { items, fileTotal };
}

async function parseSpreadsheet(file: File): Promise<ImportedInvoiceDraft> {
  const buf = await file.arrayBuffer();
  const nameLower = file.name.toLowerCase();
  const isCsv = nameLower.endsWith('.csv') || file.type === 'text/csv';
  let wb: XLSX.WorkBook;
  if (isCsv) {
    // UTF-8 string + FS so UA headers (Опис;Кількість;Од;Ціна;Сума) round-trip
    const text = new TextDecoder('utf-8').decode(buf);
    const firstLine = text.split(/\r?\n/)[0] || '';
    const semis = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    wb = XLSX.read(text, {
      type: 'string',
      cellDates: true,
      codepage: 65001,
      FS: semis > commas ? ';' : undefined,
    });
  } else {
    wb = XLSX.read(buf, { type: 'array', cellDates: true });
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('Spreadsheet has no sheets');
  }
  const skippedSheets = wb.SheetNames.slice(1);
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

  const meta = guessMetaFromSheet(rows);
  const warnings: string[] = [];

  let headerIdx = -1;
  let colMap: Partial<Record<ColKey, number>> | null = null;
  let recognizedLabels: string[] = [];

  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const { map, keys, labels } = buildColMap(rows[i] || []);
    if (isValidHeaderMap(map, keys)) {
      headerIdx = i;
      colMap = map;
      recognizedLabels = labels;
      break;
    }
    if (labels.length) recognizedLabels = labels;
  }

  if (!colMap || headerIdx < 0) {
    const listed = recognizedLabels.length
      ? recognizedLabels.join(', ')
      : '(немає)';
    throw new Error(
      `Не знайдено заголовки таблиці. Потрібні колонки: назва, одиниця, кількість, ціна (і/або сума). Розпізнані: ${listed}`,
    );
  }

  const spanishHeaders = recognizedLabels.some((l) =>
    /trabajo|unidad|medicion|precio|cantidad|material/i.test(normHeader(l)),
  );
  const { items: rawItems, fileTotal } = rowsToItems(
    rows.slice(headerIdx + 1),
    colMap,
    warnings,
    { preferGroupedThousandsDot: spanishHeaders },
  );

  const hasMaterialOnly = rawItems.some((it) => isMaterialOnlyLabel(it.description));
  const items = hasMaterialOnly ? coalesceMaterialRows(rawItems) : rawItems;

  if (items.length === 0) {
    throw new Error('No invoice lines found in spreadsheet');
  }

  const sum = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  if (fileTotal != null && Math.abs(sum - fileTotal) > 0.05) {
    warnings.push(
      `Сума позицій ${sum.toFixed(2)} не збігається з підсумком у файлі ${fileTotal.toFixed(2)}`,
    );
  }

  const titleCell = rows
    .slice(0, headerIdx + 1)
    .flat()
    .map((c) => String(c ?? '').trim())
    .find((t) => t.length > 3 && /[a-zA-Zа-яА-Я]/u.test(t));
  const document_type = detectDocumentType(file.name, [
    sheetName,
    titleCell || '',
  ]);
  const invoice_language = detectInvoiceLanguage(file.name, [
    sheetName,
    titleCell || '',
  ]);

  return {
    ...meta,
    items,
    currency: meta.currency || 'EUR',
    sourceFileName: file.name,
    document_type,
    invoice_language: invoice_language || meta.invoice_language,
    importedSheet: sheetName,
    skippedSheets: skippedSheets.length ? skippedSheets : undefined,
    warnings: warnings.length ? warnings : undefined,
    notes:
      meta.notes ||
      `Imported from ${file.name}` +
        (document_type === 'estimate' ? ' (estimate / presupuesto)' : ''),
  };
}

async function extractPdfText(file: File, maxPages = 8): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    type Run = { str: string; y: number; x: number };
    const runs: Run[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const t = item as { str: string; transform: number[] };
      runs.push({ str: t.str, x: t.transform[4], y: Math.round(t.transform[5]) });
    }
    runs.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: string[] = [];
    let curY: number | null = null;
    let buf = '';
    for (const r of runs) {
      if (curY === null || Math.abs(curY - r.y) <= 2) {
        buf += (buf ? ' ' : '') + r.str;
        curY = r.y;
      } else {
        if (buf.trim()) lines.push(buf.trim());
        buf = r.str;
        curY = r.y;
      }
    }
    if (buf.trim()) lines.push(buf.trim());
    pages.push(lines.join('\n'));
  }
  return pages.join('\n');
}

const PDF_UNIT =
  'm²|m2|m³|m3|qm|lm|ml|lfm|lfd\\.m|ud|uds|м²|м2|м³|пог\\.?\\s*м|м\\.п\\.?|шт|pcs|stk|h|std|psch|pauschal|global';

function parsePdfLineItems(text: string): PrefillInvoiceItem[] {
  const items: PrefillInvoiceItem[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (
      /rechnung|invoice|datum|seite|page|gesamt|total|summe|netto|brutto|iban|bic|ust|mwst|vat|reverse|presupuesto/i.test(
        line,
      ) &&
      !/\d+[.,]\d{2}/.test(line)
    ) {
      continue;
    }

    const withUnit = new RegExp(
      `^(.{3,80}?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${PDF_UNIT})\\s+(\\d+(?:[.,]\\d{2})?)(?:\\s+(\\d+(?:[.,]\\d{2})?))?(?:\\s+(\\d+(?:[.,]\\d{2})?))?\\s*$`,
      'i',
    );
    const m = line.match(withUnit);
    if (m) {
      const quantity = parseNumber(m[2]);
      const unit = normalizeInvoiceUnit(m[3]);
      const n4 = parseNumber(m[4]);
      const n5 = m[5] ? parseNumber(m[5]) : 0;
      const n6 = m[6] ? parseNumber(m[6]) : 0;
      let price = n4;
      let material = 0;
      if (n6 > 0) {
        price = n4;
        material = n5;
      } else if (n5 > 0) {
        if (Math.abs(n5 - quantity * n4) < 0.05) {
          material = 0;
        } else {
          material = n5;
        }
      }
      const item = toItem({
        description: m[1],
        quantity,
        unit,
        price,
        material,
      });
      if (item) items.push(item);
      continue;
    }

    const m2 = line.match(
      /^(.{3,80}?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d{2})?)\s+(\d+(?:[.,]\d{2})?)\s*$/,
    );
    if (m2) {
      const item = toItem({
        description: m2[1],
        quantity: parseNumber(m2[2]),
        unit: 'pcs',
        price: parseNumber(m2[3]),
      });
      if (item) items.push(item);
    }
  }
  return coalesceMaterialRows(items);
}

async function parsePdf(file: File): Promise<ImportedInvoiceDraft> {
  const header = await extractInvoiceDataFromPDF(file);
  const text = await extractPdfText(file);
  let items = text.trim() ? parsePdfLineItems(text) : [];

  if (items.length === 0) {
    const amount = parseNumber(header.totalAmount || '');
    if (amount > 0) {
      const single = toItem({
        description: header.invoiceNumber
          ? `Position ${header.invoiceNumber}`
          : file.name.replace(/\.[^.]+$/, ''),
        quantity: 1,
        unit: 'Pauschal',
        price: amount,
      });
      if (single) items = [single];
    }
  }

  if (items.length === 0) {
    throw new Error(
      'Could not read invoice lines from PDF. Use an Excel/CSV with columns, or a text PDF.',
    );
  }

  const document_type = detectDocumentType(file.name, [text.slice(0, 500)]);

  return {
    client_name: header.company || undefined,
    document_number: header.invoiceNumber || undefined,
    date: header.invoiceDate || undefined,
    currency: header.currency || 'EUR',
    items,
    sourceFileName: file.name,
    document_type,
    notes: `Imported from ${file.name}`,
  };
}

export function isInvoiceImportFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    name.endsWith('.pdf') ||
    file.type === 'application/pdf' ||
    file.type.includes('sheet') ||
    file.type === 'text/csv'
  );
}

/** Parse Excel/CSV/PDF into an editable invoice draft (sales invoice lines). */
export async function importInvoiceFromFile(file: File): Promise<ImportedInvoiceDraft> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    return parsePdf(file);
  }
  if (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    file.type.includes('sheet') ||
    file.type === 'text/csv'
  ) {
    return parseSpreadsheet(file);
  }
  throw new Error('Unsupported file type. Use Excel (.xlsx), CSV, or PDF.');
}

export function storeInvoiceImportDraft(draft: ImportedInvoiceDraft): void {
  sessionStorage.setItem(INVOICE_IMPORT_STORAGE_KEY, JSON.stringify(draft));
}

export function consumeInvoiceImportDraft(): ImportedInvoiceDraft | null {
  try {
    const raw = sessionStorage.getItem(INVOICE_IMPORT_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(INVOICE_IMPORT_STORAGE_KEY);
    const parsed = JSON.parse(raw) as ImportedInvoiceDraft;
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    return parsed;
  } catch {
    sessionStorage.removeItem(INVOICE_IMPORT_STORAGE_KEY);
    return null;
  }
}
