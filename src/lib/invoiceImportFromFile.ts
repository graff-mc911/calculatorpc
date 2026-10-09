import * as XLSX from 'xlsx';
import { calculateLineTotal } from './invoiceTotals';
import type { PrefillInvoiceItem } from './invoiceFromProject';
import { extractInvoiceDataFromPDF } from './pdfTextExtractor';
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
  items: PrefillInvoiceItem[];
  sourceFileName?: string;
};

type ColKey = 'description' | 'quantity' | 'unit' | 'price' | 'material' | 'total';

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
  unit: ['unit', 'einheit', 'me', 'од', 'од.', 'одиниця', 'um'],
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
  ],
  material: ['material', 'mat', 'mat.', 'матеріал', 'мат'],
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

function matchCol(header: string): ColKey | null {
  const h = normHeader(header);
  if (!h) return null;
  for (const [key, aliases] of Object.entries(HEADER_MAP) as [ColKey, string[]][]) {
    if (aliases.some((a) => h === a || h.includes(a))) return key;
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
  const description = String(partial.description || '').trim();
  const quantity = Number(partial.quantity) || 0;
  const price = Number(partial.price) || 0;
  const materialNum =
    typeof partial.material === 'number'
      ? partial.material
      : parseNumber(partial.material);
  if (!description && quantity <= 0 && price <= 0) return null;
  if (!description && price <= 0 && quantity <= 0) return null;
  const unit = String(partial.unit || 'pcs').trim() || 'pcs';
  const material = materialNum > 0 ? String(materialNum) : '';
  return {
    quantity: quantity || (price > 0 ? 1 : 0),
    quantityDisplay: String(quantity || (price > 0 ? 1 : '')),
    unit,
    price,
    priceDisplay: price ? String(price) : '',
    material,
    materialDisplay: material,
    description: description || 'Position',
    total: calculateLineTotal(quantity || (price > 0 ? 1 : 0), price, materialNum || 0),
  };
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
    const description = String(row[descIdx] ?? '').trim();
    // skip repeated header-like rows
    if (matchCol(description) === 'description') continue;

    let quantity =
      colMap.quantity !== undefined ? parseNumber(row[colMap.quantity]) : 0;
    let price = colMap.price !== undefined ? parseNumber(row[colMap.price]) : 0;
    const total = colMap.total !== undefined ? parseNumber(row[colMap.total]) : 0;
    const unit =
      colMap.unit !== undefined ? String(row[colMap.unit] ?? '').trim() : 'pcs';
    const material =
      colMap.material !== undefined ? parseNumber(row[colMap.material]) : 0;

    if (price <= 0 && total > 0) {
      quantity = quantity > 0 ? quantity : 1;
      price = total / quantity;
    }
    if (quantity <= 0 && price > 0) quantity = 1;

    const item = toItem({ description, quantity, unit, price, material });
    if (item) items.push(item);
  }
  return items;
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
    // Excel serial
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
    // Heuristic: first col text, last numeric cols = qty/price/total
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const cells = row.map((c) => String(c ?? '').trim());
      if (cells.every((c) => !c)) continue;
      if (matchCol(cells[0])) continue;
      const nums = cells
        .map((c, i) => ({ i, n: parseNumber(c) }))
        .filter((x) => x.n > 0);
      if (nums.length === 0) continue;
      const description = cells.find((c, i) => c && !parseNumber(c) && i < cells.length) || '';
      if (!description) continue;
      const price = nums[nums.length - 1]?.n || 0;
      const quantity = nums.length >= 2 ? nums[0].n : 1;
      const item = toItem({
        description,
        quantity: nums.length >= 2 ? quantity : 1,
        price: nums.length >= 2 ? nums[nums.length - 1].n / (quantity || 1) : price,
        unit: 'pcs',
      });
      // Prefer explicit price column if 3 numbers: qty, price, total
      if (nums.length >= 3) {
        const q = nums[0].n;
        const p = nums[1].n;
        const fixed = toItem({ description, quantity: q, price: p, unit: 'pcs' });
        if (fixed) items.push(fixed);
      } else if (item) {
        items.push(item);
      }
    }
  }

  if (items.length === 0) {
    throw new Error('No invoice lines found in spreadsheet');
  }

  return {
    ...meta,
    items,
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
    // Keep some line structure via Y positions
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

function parsePdfLineItems(text: string): PrefillInvoiceItem[] {
  const items: PrefillInvoiceItem[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/rechnung|invoice|datum|seite|page|gesamt|total|summe|netto|brutto|iban|bic|ust|mwst|vat/i.test(line)
      && !/\d+[.,]\d{2}/.test(line)) {
      continue;
    }
    // description ... qty unit price total  OR description qty price total
    const m = line.match(
      /^(.{3,80}?)\s+(\d+(?:[.,]\d+)?)\s*(m²|m2|m³|m3|m|h|hrs|stk|pcs|шт|psch|pausch)?\s+(\d+(?:[.,]\d{2})?)\s+(\d+(?:[.,]\d{2})?)\s*$/i,
    );
    if (m) {
      const quantity = parseNumber(m[2]);
      const unit = m[3] || 'pcs';
      const price = parseNumber(m[4]);
      const item = toItem({ description: m[1], quantity, unit, price });
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
  return items;
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
          ? `Invoice ${header.invoiceNumber}`
          : file.name.replace(/\.[^.]+$/, ''),
        quantity: 1,
        unit: 'pcs',
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
