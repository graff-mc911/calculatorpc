import * as XLSX from 'xlsx';
import { calculateLineTotal } from './invoiceTotals';
import type { PrefillInvoiceItem } from './invoiceFromProject';
import { extractInvoiceDataFromPDF } from './pdfTextExtractor';
import {
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

export type ImportedInvoiceDraft = {
  client_name?: string;
  document_number?: string;
  date?: string;
  currency?: string;
  notes?: string;
  object_address?: string;
  /** Document labels language for DIN 5008 PDF (German standard). */
  invoice_language?: string;
  items: PrefillInvoiceItem[];
  sourceFileName?: string;
};

type ColKey =
  | 'description'
  | 'quantity'
  | 'unit'
  | 'price'
  | 'material'
  | 'total';

const HEADER_MAP: Record<ColKey, string[]> = {
  description: [
    'description',
    'desc',
    'item',
    'artikel',
    'leistung',
    'position',
    'pos',
    'bezeichnung',
    'work',
    'service',
    'опис',
    'назва',
    'позиція',
    'робота',
    'найменування',
    'arbeit',
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
  ],
  material: [
    'material',
    'mat',
    'mat.',
    'матеріал',
    'мат',
    'материал',
    'materialpreis',
    'mat preis',
    'ціна матеріалу',
    'werkstoff',
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
  ],
};

function normHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function headerAliasHit(header: string, alias: string): boolean {
  const h = header;
  const a = alias;
  if (!a) return false;
  if (h === a) return true;
  // Short aliases (me, mat, ep…) must be whole tokens — avoid "menge"→unit via "me"
  if (a.length <= 3) {
    return new RegExp(`(^|[^a-zа-яіїєґ0-9])${a}([^a-zа-яіїєґ0-9]|$)`, 'i').test(h);
  }
  return h.includes(a);
}

function matchCol(header: string): ColKey | null {
  const h = normHeader(header);
  if (!h) return null;
  // Prefer material / unit before generic "price" so "Materialpreis" wins
  const order: ColKey[] = [
    'material',
    'quantity',
    'unit',
    'total',
    'price',
    'description',
  ];
  for (const key of order) {
    if (HEADER_MAP[key].some((a) => headerAliasHit(h, a))) return key;
  }
  return null;
}

function parseNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  let s = String(raw ?? '')
    .trim()
    .replace(/[€$£\s]/g, '')
    .replace(/[^\d,.\-]/g, '');
  if (!s) return 0;
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

function toItem(partial: {
  description?: string;
  quantity?: number;
  unit?: string;
  price?: number;
  material?: number | string;
}): PrefillInvoiceItem | null {
  let description = String(partial.description || '').trim();
  let quantity = Number(partial.quantity) || 0;
  let price = Number(partial.price) || 0;
  let materialNum =
    typeof partial.material === 'number'
      ? partial.material
      : parseNumber(partial.material);

  // "Material: 250" / "Матеріал 180€" inside description
  const matInline = description.match(
    /(?:^|[|;/])\s*(?:material|матеріал|мат\.?)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
  );
  if (matInline && materialNum <= 0) {
    materialNum = parseNumber(matInline[1]);
    description = description.replace(matInline[0], '').trim();
  }

  if (!description && quantity <= 0 && price <= 0 && materialNum <= 0) return null;

  const unit = normalizeInvoiceUnit(partial.unit, quantity > 0 ? 'm²' : 'pcs');
  const material = materialNum > 0 ? String(materialNum) : '';
  const qty = quantity || (price > 0 || materialNum > 0 ? 1 : 0);

  // Pure material line → Lexware-style: work qty/price empty-ish, material filled
  if (isMaterialOnlyLabel(description) && materialNum <= 0 && price > 0 && quantity <= 1) {
    return {
      quantity: 1,
      quantityDisplay: '1',
      unit: 'Pauschal',
      price: 0,
      priceDisplay: '',
      material: String(price),
      materialDisplay: String(price),
      description: description || 'Material',
      total: calculateLineTotal(1, 0, price),
    };
  }

  return {
    quantity: qty,
    quantityDisplay: String(qty || ''),
    unit,
    price,
    priceDisplay: price ? String(price) : '',
    material,
    materialDisplay: material,
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
      (item.price === 0 && parseNumber(item.material) > 0 && /material|матеріал/i.test(item.description));

    if (matOnly && out.length > 0) {
      const prev = out[out.length - 1];
      const add =
        parseNumber(item.material) ||
        item.price ||
        item.total ||
        0;
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
  if (map.description !== undefined && hits >= 2) return map;
  if (map.description !== undefined && (map.price !== undefined || map.total !== undefined)) {
    return map;
  }
  return null;
}

function rowsToItems(
  rows: unknown[][],
  colMap: Partial<Record<ColKey, number>>,
): PrefillInvoiceItem[] {
  const items: PrefillInvoiceItem[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.every((c) => String(c ?? '').trim() === '')) continue;
    const descIdx = colMap.description ?? 0;
    let description = String(row[descIdx] ?? '').trim();
    if (matchCol(description) === 'description') continue;

    let quantity = 0;
    let unit: InvoiceUnit | string = 'm²';

    if (colMap.quantity !== undefined) {
      const split = splitQtyUnit(row[colMap.quantity]);
      quantity = split.quantity;
      if (split.unit) unit = split.unit;
    }

    if (colMap.unit !== undefined) {
      const uRaw = String(row[colMap.unit] ?? '').trim();
      if (uRaw) unit = normalizeInvoiceUnit(uRaw, unit as InvoiceUnit);
    }

    // Unit glued into description: "Spachteln m2" / "Плінтус пог.м"
    if (colMap.unit === undefined) {
      const unitFromDesc = description.match(
        /\b(m[²³23]|м[²³23]|qm|lm|lfm|пог\.?\s*м|м\.?\s*п|погонн\w*|шт|pcs|stk|h|std)\b/i,
      );
      if (unitFromDesc) {
        unit = normalizeInvoiceUnit(unitFromDesc[1], unit as InvoiceUnit);
      }
    }

    let price = colMap.price !== undefined ? parseNumber(row[colMap.price]) : 0;
    const total = colMap.total !== undefined ? parseNumber(row[colMap.total]) : 0;
    let material =
      colMap.material !== undefined ? parseNumber(row[colMap.material]) : 0;

    if (price <= 0 && total > 0 && material <= 0) {
      quantity = quantity > 0 ? quantity : 1;
      price = (total - material) / quantity;
    } else if (price <= 0 && total > 0 && material > 0) {
      quantity = quantity > 0 ? quantity : 1;
      const laborPart = total - material;
      price = laborPart > 0 ? laborPart / quantity : 0;
    }
    if (quantity <= 0 && (price > 0 || material > 0)) quantity = 1;

    const item = toItem({ description, quantity, unit: String(unit), price, material });
    if (item) items.push(item);
  }
  return coalesceMaterialRows(items);
}

function guessMetaFromSheet(rows: unknown[][]): Partial<ImportedInvoiceDraft> {
  const meta: Partial<ImportedInvoiceDraft> = {};
  const labelClient = /^(client|kunde|customer|клієнт|заказчик|firma|company)\b/i;
  const labelDate = /^(date|datum|дата|rechnungsdatum)\b/i;
  const labelNumber = /^(invoice|rechnung|номер|document|nr\.?|no\.?)\b/i;
  const labelAddress = /^(address|adresse|адреса|object|об.?єкт)\b/i;

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
  return meta;
}

function parseExcelDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const de = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
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

async function parseSpreadsheet(file: File): Promise<ImportedInvoiceDraft> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  const meta = guessMetaFromSheet(rows);

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

  let items: PrefillInvoiceItem[] = [];
  if (colMap && headerIdx >= 0) {
    items = rowsToItems(rows.slice(headerIdx + 1), colMap);
  } else {
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const cells = row.map((c) => String(c ?? '').trim());
      if (cells.every((c) => !c)) continue;
      if (matchCol(cells[0])) continue;

      let description = '';
      let quantity = 0;
      let unit: InvoiceUnit = 'm²';
      let price = 0;
      let material = 0;

      for (const cell of cells) {
        if (!cell) continue;
        const split = splitQtyUnit(cell);
        if (!description && split.restText && !parseNumber(cell)) {
          description = cell;
          continue;
        }
        if (!description && /[a-zA-Zа-яА-Яіїєґ]/u.test(cell) && !/^\d/.test(cell)) {
          // "120 m2" handled below; plain text = description
          if (split.quantity <= 0) {
            description = cell;
            continue;
          }
        }
        if (split.quantity > 0 && split.unit && quantity <= 0) {
          quantity = split.quantity;
          unit = split.unit;
          continue;
        }
      }

      const nums = cells
        .map((c) => ({ c, n: parseNumber(c), split: splitQtyUnit(c) }))
        .filter((x) => x.n > 0);

      if (!description) {
        description =
          cells.find((c) => c && parseNumber(c) <= 0 && !matchCol(c)) || '';
      }
      if (!description) continue;

      if (quantity <= 0 && nums[0]) {
        quantity = nums[0].split.unit ? nums[0].split.quantity : nums[0].n;
        if (nums[0].split.unit) unit = nums[0].split.unit;
      }

      // Heuristic: qty, labor price, material[, total]
      if (nums.length >= 3) {
        price = nums[1].n;
        material = nums[2].n;
        // if last looks like total ≈ qty*price+mat, treat nums[2] as total not material
        const maybeTotal = nums[nums.length - 1].n;
        const expect = quantity * price + (nums.length >= 4 ? nums[2].n : 0);
        if (nums.length === 3 && Math.abs(maybeTotal - quantity * nums[1].n) < 0.05) {
          price = nums[1].n;
          material = 0;
        } else if (nums.length >= 4) {
          material = nums[2].n;
          price = nums[1].n;
        } else if (
          nums.length === 3 &&
          Math.abs(maybeTotal - (quantity * nums[1].n + nums[2].n)) < 0.05
        ) {
          // unlikely with only 3 — keep material
        }
        void expect;
      } else if (nums.length === 2) {
        price = nums[1].n;
      } else if (nums.length === 1) {
        price = nums[0].n;
        quantity = quantity || 1;
      }

      // Unit tokens in any cell
      for (const cell of cells) {
        if (/m[²³23]|пог|lm|lfm|м\.?\s*п|шт|pcs/i.test(cell) && splitQtyUnit(cell).unit) {
          unit = splitQtyUnit(cell).unit || unit;
        } else if (/^(m2|м2|qm|lm|пог|шт|pcs|m²)$/i.test(cell.trim())) {
          unit = normalizeInvoiceUnit(cell);
        }
      }

      const item = toItem({ description, quantity, unit, price, material });
      if (item) items.push(item);
    }
    items = coalesceMaterialRows(items);
  }

  if (items.length === 0) {
    throw new Error('No invoice lines found in spreadsheet');
  }

  return {
    ...meta,
    items,
    currency: meta.currency || 'EUR',
    sourceFileName: file.name,
    notes: meta.notes || `Imported from ${file.name}`,
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
  'm²|m2|m³|m3|qm|lm|lfm|lfd\\.m|м²|м2|м³|пог\\.?\\s*м|м\\.п\\.?|шт|pcs|stk|h|std|psch|pauschal';

function parsePdfLineItems(text: string): PrefillInvoiceItem[] {
  const items: PrefillInvoiceItem[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (
      /rechnung|invoice|datum|seite|page|gesamt|total|summe|netto|brutto|iban|bic|ust|mwst|vat|reverse/i.test(
        line,
      ) &&
      !/\d+[.,]\d{2}/.test(line)
    ) {
      continue;
    }

    // desc qty unit labor material? total?
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
        // qty unit price material total
        price = n4;
        material = n5;
      } else if (n5 > 0) {
        // could be price+total or price+material
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

  return {
    client_name: header.company || undefined,
    document_number: header.invoiceNumber || undefined,
    date: header.invoiceDate || undefined,
    currency: header.currency || 'EUR',
    items,
    sourceFileName: file.name,
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
