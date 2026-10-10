import * as XLSX from 'xlsx';
import { calculateLineTotal } from './invoiceTotals';
import type { PrefillInvoiceItem } from './invoiceFromProject';
import { extractInvoiceDataFromPDF } from './pdfTextExtractor';
import {
  classifySheetKind,
  compactUnitText,
  isMaterialOnlyLabel,
  normalizeInvoiceUnit,
  splitQtyUnit,
  type InvoiceUnit,
} from './invoiceUnits';
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
};

type ColKey =
  | 'description'
  | 'quantity'
  | 'unit'
  | 'price'
  | 'material'
  | 'total'
  | 'notes'
  | 'pos';

/** Cell role after token classification (words / numbers / metrics). */
export type CellKind = 'empty' | 'word' | 'number' | 'metric' | 'qty_unit' | 'date' | 'mixed';

const HEADER_MAP: Record<ColKey, string[]> = {
  description: [
    'description',
    'desc',
    'item',
    'artikel',
    'leistung',
    'position',
    'bezeichnung',
    'work',
    'service',
    'опис',
    'назва',
    'позиція',
    'робота',
    'найменування',
    'arbeit',
    'trabajo',
    'trabajos',
    'concepto',
    'partida',
    'descripcion',
    'descripción',
    'material',
    'materiales',
    'матеріал',
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
    'medicion',
    'medición',
    'medicion / cant',
    'medición / cant',
    'medición / cant.',
    'cant',
    'cantidad',
    'cant.',
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
    'unidades',
    'ud',
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
    'arbeit',
    'lohn',
    'labor',
    'робота',
    'ціна роботи',
    'arbeitpreis',
    'lohnpreis',
    'precio',
    'precio, sin iva',
    'precio sin iva',
    'p. unitario',
  ],
  material: [
    'materialpreis',
    'mat preis',
    'ціна матеріалу',
    'werkstoff',
    'mat price',
    'material price',
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
    'total, €',
    'total €',
    'importe',
  ],
  notes: [
    'notes',
    'note',
    'bemerkung',
    'bemerkungen',
    'observaciones',
    'observacion',
    'observación',
    'comentario',
    'comments',
    'примітка',
    'нотатки',
  ],
  pos: ['pos', 'nr', 'no', 'nº', 'n°', '#', '№', 'pos.', 'позиция'],
};

function normHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function headerAliasHit(header: string, alias: string): boolean {
  const h = normHeader(header);
  const a = normHeader(alias);
  if (!a) return false;
  if (h === a) return true;
  if (a.length <= 3) {
    return new RegExp(`(^|[^a-zа-яіїєґ0-9])${a}([^a-zа-яіїєґ0-9]|$)`, 'i').test(h);
  }
  return h.includes(a);
}

function matchCol(header: string): ColKey | null {
  const h = normHeader(header);
  if (!h) return null;
  // Prefer specific columns before generic "description" (Material header on materials sheet)
  const order: ColKey[] = [
    'notes',
    'material',
    'quantity',
    'unit',
    'total',
    'price',
    'pos',
    'description',
  ];
  for (const key of order) {
    if (HEADER_MAP[key].some((a) => headerAliasHit(h, a))) return key;
  }
  return null;
}

/** Parse locale numbers: 3,500.00 | 3.500,00 | 3500 | 9.95 */
export function parseNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  let s = String(raw ?? '')
    .trim()
    .replace(/[€$£\s\u00a0]/g, '')
    .replace(/[^\d,.\-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') return 0;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    s = parts[parts.length - 1].length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const METRIC_TOKEN =
  /^(m2|m²|m3|m³|м2|м²|м3|м³|qm|sqm|lm|ml|lfm|lf|ud|uds|u|pcs|stk|шт|h|hr|std|stunde|global|pa|pauschal|паушал|ft2|ft²|metro|metros)$/i;

/**
 * Classify a cell as word / number / metric (unit) / qty+unit / date.
 * Used so parsing never invents roles from position alone.
 */
export function classifyCellKind(raw: unknown): CellKind {
  const text = String(raw ?? '').trim();
  if (!text) return 'empty';

  if (/^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/.test(text) || /^\d{4}-\d{2}-\d{2}/.test(text)) {
    return 'date';
  }

  // Numeric money / qty (3,500.00 · 9.95 · 3500) — before qty+unit
  if (!/[a-zA-Zа-яА-Яіїєґ]/u.test(text) && /[\d]/.test(text)) {
    const asNum = parseNumber(text);
    if (asNum !== 0 || /^0([.,]0+)?$/.test(text.replace(/\s/g, ''))) return 'number';
  }

  const qtyUnit = splitQtyUnit(text);
  if (qtyUnit.unit && qtyUnit.quantity !== 0 && !qtyUnit.restText) return 'qty_unit';

  const unitOnly = normalizeInvoiceUnit(text, 'pcs');
  const asUnit = compactUnitText(text);
  if (METRIC_TOKEN.test(asUnit) || (asUnit.length <= 12 && unitOnly && METRIC_TOKEN.test(asUnit))) {
    // Only treat as metric when the whole cell is a known unit token
    if (/^[a-zA-Zа-яА-Яіїєґ0-9²³./\-\s]+$/u.test(text) && !/\d{2,}/.test(text.replace(/[²³23]/g, ''))) {
      if (
        /^(m[²³23]?|м[²³23]?|qm|lm|ml|lfm|ud|uds|u|pcs|stk|шт|h|hr|std|global|pa|pauschal|ft2|metro|metros|unidad|unidades)$/i.test(
          asUnit,
        )
      ) {
        return 'metric';
      }
    }
  }

  if (/[a-zA-Zа-яА-Яіїєґ]/u.test(text) && parseNumber(text) === 0) return 'word';
  if (/[a-zA-Zа-яА-Яіїєґ]/u.test(text) && parseNumber(text) !== 0) return 'mixed';
  return parseNumber(text) !== 0 ? 'number' : 'word';
}

/** Footer / summary rows must not become line items. */
export function isTotalOrFooterRow(row: unknown[], descIdx: number): boolean {
  const desc = compactUnitText(String(row[descIdx] ?? ''));
  if (!desc) {
    // Row with only a total in the last numeric cells and blank description
    const words = row
      .map((c) => String(c ?? '').trim())
      .filter(Boolean)
      .map((c) => compactUnitText(c));
    if (words.some((w) => /^(total|summe|gesamt|всього|разом|subtotal|suma)$/.test(w))) {
      return true;
    }
  }
  return /^(total|summe|gesamt|всього|разом|subtotal|suma|итого|gesamtbetrag|importe\s*total)$/.test(
    desc,
  );
}

/**
 * Deterministic document type from file name + sheet titles + header cells.
 * Never invents: unknown keywords → invoice (default sales form).
 */
export function detectDocumentType(
  fileName: string,
  titles: string[] = [],
): ImportedDocumentType {
  const blob = compactUnitText([fileName, ...titles].join(' '));

  // Estimate / quote / presupuesto / кошторис / Angebot (non-binding quote)
  if (
    /\b(presupuesto|presupuest|estimate|quotation|quote|кошторис|пропозиц|angebot|kostenvoranschlag|devis|or[cç]amento)\b/.test(
      blob,
    )
  ) {
    return 'estimate';
  }

  // Proposal / Angebot binding / пропозиція
  if (/\b(proposal|vorschlag|пропозиція|proposta|oferta\s*comercial)\b/.test(blob)) {
    return 'proposal';
  }

  // Explicit invoice
  if (
    /\b(invoice|rechnung|factura|рахунок|счет|facture|nota\s*de\s*cobro)\b/.test(blob)
  ) {
    return 'invoice';
  }

  return 'invoice';
}

function detectInvoiceLanguage(fileName: string, titles: string[]): string | undefined {
  const blob = compactUnitText([fileName, ...titles].join(' '));
  if (/\b(presupuesto|trabajo|materiales|mano\s*de\s*obra|unidad|medicion|precio)\b/.test(blob)) {
    return 'es';
  }
  if (/\b(rechnung|leistung|menge|einheit|angebot)\b/.test(blob)) return 'de';
  if (/\b(рахунок|кошторис|робота|матеріал|одиниця)\b/.test(blob)) return 'uk';
  return undefined;
}

function toItem(
  partial: {
    description?: string;
    quantity?: number;
    unit?: string;
    price?: number;
    material?: number | string;
    notes?: string;
  },
  sheetKind: 'labor' | 'materials' | 'unknown' = 'unknown',
): PrefillInvoiceItem | null {
  let description = String(partial.description || '').trim();
  let quantity = Number(partial.quantity) || 0;
  let price = Number(partial.price) || 0;
  let materialNum =
    typeof partial.material === 'number'
      ? partial.material
      : parseNumber(partial.material);

  const note = String(partial.notes || '').trim();
  if (note && description && !description.includes(note)) {
    description = `${description} — ${note}`;
  } else if (note && !description) {
    description = note;
  }

  // "Material: 250" inline in description
  const matInline = description.match(
    /(?:^|[|;/])\s*(?:material|матеріал|мат\.?)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
  );
  if (matInline && materialNum <= 0) {
    materialNum = parseNumber(matInline[1]);
    description = description.replace(matInline[0], '').trim();
  }

  if (!description && quantity <= 0 && price <= 0 && materialNum <= 0) return null;

  const unit = normalizeInvoiceUnit(partial.unit, quantity > 0 ? 'm²' : 'pcs');
  const qty = quantity || (price > 0 || materialNum > 0 ? 1 : 0);

  // Materials sheet / material-only label → Lexware: price in material field
  const treatAsMaterial =
    sheetKind === 'materials' ||
    (isMaterialOnlyLabel(description) && materialNum <= 0 && price > 0);

  if (treatAsMaterial && materialNum <= 0 && price > 0) {
    const lineTotal = calculateLineTotal(qty, 0, price * (qty > 0 ? qty : 1));
    // For materials sheet: qty × unit price goes entirely to material
    const matAmount = qty > 0 ? qty * price : price;
    return {
      quantity: qty || 1,
      quantityDisplay: String(qty || 1),
      unit: unit === 'm²' && qty <= 1 ? 'Pauschal' : unit,
      price: 0,
      priceDisplay: '',
      material: String(matAmount),
      materialDisplay: String(matAmount),
      description: description || 'Material',
      total: calculateLineTotal(1, 0, matAmount) || lineTotal,
    };
  }

  return {
    quantity: qty,
    quantityDisplay: String(qty || ''),
    unit,
    price,
    priceDisplay: price ? String(price) : '',
    material: materialNum > 0 ? String(materialNum) : '',
    materialDisplay: materialNum > 0 ? String(materialNum) : '',
    description: description || 'Position',
    total: calculateLineTotal(qty, price, materialNum || 0),
  };
}

/** Attach material-only rows onto the previous work line (German Lexware style). */
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

function detectHeaderMap(row: unknown[]): Partial<Record<ColKey, number>> | null {
  const map: Partial<Record<ColKey, number>> = {};
  let hits = 0;
  row.forEach((cell, idx) => {
    const key = matchCol(String(cell ?? ''));
    if (key && map[key] === undefined) {
      map[key] = idx;
      hits += 1;
    }
  });
  // "Material" / "Trabajo" count as description
  if (map.description !== undefined && hits >= 2) return map;
  if (
    map.description !== undefined &&
    (map.price !== undefined || map.total !== undefined || map.quantity !== undefined)
  ) {
    return map;
  }
  return null;
}

/**
 * Build line items from rows under a known header map.
 * Recalculates total as qty × price (+ material); sheet total rows are skipped.
 */
function rowsToItems(
  rows: unknown[][],
  colMap: Partial<Record<ColKey, number>>,
  sheetKind: 'labor' | 'materials' | 'unknown',
): PrefillInvoiceItem[] {
  const items: PrefillInvoiceItem[] = [];
  const descIdx = colMap.description ?? 0;

  for (const row of rows) {
    if (!Array.isArray(row) || row.every((c) => String(c ?? '').trim() === '')) continue;
    if (isTotalOrFooterRow(row, descIdx)) continue;

    let description = String(row[descIdx] ?? '').trim();
    // Skip repeated header
    if (matchCol(description) && classifyCellKind(description) === 'word') {
      const maybeHeader = detectHeaderMap(row);
      if (maybeHeader) continue;
    }
    // Pos-only first cell: description may be in mapped column already

    let quantity = 0;
    let unit: InvoiceUnit | string = sheetKind === 'materials' ? 'Pauschal' : 'm²';

    if (colMap.quantity !== undefined) {
      const split = splitQtyUnit(row[colMap.quantity]);
      quantity = split.quantity;
      if (split.unit) unit = split.unit;
    }

    if (colMap.unit !== undefined) {
      const uRaw = String(row[colMap.unit] ?? '').trim();
      if (uRaw) unit = normalizeInvoiceUnit(uRaw, unit as InvoiceUnit);
    }

    if (colMap.unit === undefined) {
      const unitFromDesc = description.match(
        /\b(m[²³23]|м[²³23]|qm|lm|ml|lfm|ud|uds|пог\.?\s*м|м\.?\s*п|погонн\w*|шт|pcs|stk|h|std|global)\b/i,
      );
      if (unitFromDesc) {
        unit = normalizeInvoiceUnit(unitFromDesc[1], unit as InvoiceUnit);
      }
    }

    let price = colMap.price !== undefined ? parseNumber(row[colMap.price]) : 0;
    const lineTotalCell =
      colMap.total !== undefined ? parseNumber(row[colMap.total]) : 0;
    let material =
      colMap.material !== undefined ? parseNumber(row[colMap.material]) : 0;
    const notes =
      colMap.notes !== undefined ? String(row[colMap.notes] ?? '').trim() : '';

    // If unit price missing but line total present → derive price = total / qty
    if (price <= 0 && lineTotalCell > 0 && material <= 0) {
      quantity = quantity > 0 ? quantity : 1;
      price = lineTotalCell / quantity;
    } else if (price <= 0 && lineTotalCell > 0 && material > 0) {
      quantity = quantity > 0 ? quantity : 1;
      const laborPart = lineTotalCell - material;
      price = laborPart > 0 ? laborPart / quantity : 0;
    }

    // Prefer qty × unit price over a mismatched Total cell (recalculate)
    if (quantity > 0 && price > 0 && lineTotalCell > 0) {
      const expected =
        sheetKind === 'materials'
          ? quantity * price
          : quantity * price + material;
      // If Total cell disagrees with qty×price, trust qty×price (don't invent)
      if (Math.abs(expected - lineTotalCell) > 0.05 && Math.abs(expected - lineTotalCell) / expected > 0.02) {
        // keep qty & price; total recalculated in toItem
      }
    }

    if (quantity <= 0 && (price > 0 || material > 0)) quantity = 1;

    // Empty description but has numbers — skip (not a real position)
    if (!description) continue;

    const item = toItem(
      { description, quantity, unit: String(unit), price, material, notes },
      sheetKind,
    );
    if (item) items.push(item);
  }

  // Only coalesce when mixed labor+material on same sheet (unknown / labor)
  if (sheetKind === 'materials') return items;
  return coalesceMaterialRows(items);
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

  // Title row date in trailing cell (Presupuesto … | 09-10-2026)
  if (!meta.date) {
    for (const row of rows.slice(0, 5)) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const kind = classifyCellKind(cell);
        if (kind === 'date') {
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

function sheetTitleFromRows(sheetName: string, rows: unknown[][]): string {
  for (const row of rows.slice(0, 3)) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const t = String(cell ?? '').trim();
      if (t && classifyCellKind(t) === 'word' && t.length > 3) {
        return t;
      }
    }
  }
  return sheetName;
}

function parseSheetRows(
  sheetName: string,
  rows: unknown[][],
): { items: PrefillInvoiceItem[]; title: string; sheetKind: 'labor' | 'materials' | 'unknown' } {
  const title = sheetTitleFromRows(sheetName, rows);
  const sheetKind = classifySheetKind(`${sheetName} ${title}`);

  let headerIdx = -1;
  let colMap: Partial<Record<ColKey, number>> | null = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const found = detectHeaderMap(rows[i] || []);
    if (found) {
      headerIdx = i;
      colMap = found;
      break;
    }
  }

  if (colMap && headerIdx >= 0) {
    return {
      items: rowsToItems(rows.slice(headerIdx + 1), colMap, sheetKind),
      title,
      sheetKind,
    };
  }

  // Fallback: positional scan with cell-kind classification (no inventing columns)
  const items: PrefillInvoiceItem[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const cells = row.map((c) => String(c ?? '').trim());
    if (cells.every((c) => !c)) continue;
    if (isTotalOrFooterRow(row, 0) || isTotalOrFooterRow(row, 1)) continue;

    const kinds = cells.map((c) => classifyCellKind(c));
    const wordIdx = kinds.findIndex((k, i) => k === 'word' && !matchCol(cells[i]));
    if (wordIdx < 0) continue;
    const description = cells[wordIdx];
    if (matchCol(description) === 'description') continue;

    let quantity = 0;
    let unit: InvoiceUnit = sheetKind === 'materials' ? 'Pauschal' : 'm²';
    let price = 0;

    const metricIdx = kinds.findIndex((k) => k === 'metric');
    if (metricIdx >= 0) unit = normalizeInvoiceUnit(cells[metricIdx]);

    const qtyUnitIdx = kinds.findIndex((k) => k === 'qty_unit');
    if (qtyUnitIdx >= 0) {
      const split = splitQtyUnit(cells[qtyUnitIdx]);
      quantity = split.quantity;
      if (split.unit) unit = split.unit;
    }

    const numberIdxs = kinds
      .map((k, i) => (k === 'number' ? i : -1))
      .filter((i) => i >= 0);

    // Typical: [pos?] desc unit qty price total
    if (numberIdxs.length >= 1 && quantity <= 0) {
      quantity = parseNumber(cells[numberIdxs[0]]);
      if (numberIdxs.length >= 2) price = parseNumber(cells[numberIdxs[1]]);
    } else if (numberIdxs.length >= 1) {
      price = parseNumber(cells[numberIdxs[0]]);
      if (numberIdxs.length >= 2) {
        // second number may be price if first was qty already set
        const n1 = parseNumber(cells[numberIdxs[0]]);
        const n2 = parseNumber(cells[numberIdxs[1]]);
        // Prefer: qty already known → n1 is price; else qty=n1 price=n2
        if (quantity > 0) price = n1;
        else {
          quantity = n1;
          price = n2;
        }
      }
    }

    if (quantity <= 0 && price > 0) quantity = 1;
    const item = toItem({ description, quantity, unit, price }, sheetKind);
    if (item) items.push(item);
  }

  return {
    items: sheetKind === 'materials' ? items : coalesceMaterialRows(items),
    title,
    sheetKind,
  };
}

async function parseSpreadsheet(file: File): Promise<ImportedInvoiceDraft> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  const allItems: PrefillInvoiceItem[] = [];
  const titles: string[] = [];
  let meta: Partial<ImportedInvoiceDraft> = {};

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];

    if (!meta.client_name && !meta.date) {
      meta = { ...meta, ...guessMetaFromSheet(rows) };
    } else {
      const more = guessMetaFromSheet(rows);
      meta = {
        ...more,
        ...meta,
        date: meta.date || more.date,
        client_name: meta.client_name || more.client_name,
      };
    }

    const parsed = parseSheetRows(sheetName, rows);
    titles.push(parsed.title, sheetName);
    allItems.push(...parsed.items);
  }

  if (allItems.length === 0) {
    throw new Error('No invoice lines found in spreadsheet');
  }

  const document_type = detectDocumentType(file.name, titles);
  const invoice_language = detectInvoiceLanguage(file.name, titles);

  return {
    ...meta,
    items: allItems,
    currency: meta.currency || 'EUR',
    sourceFileName: file.name,
    document_type,
    invoice_language: invoice_language || meta.invoice_language,
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
        unit: 'm²',
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
