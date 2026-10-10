import * as XLSX from 'xlsx';
import { calculateLineTotal, roundMoney } from './invoiceTotals';
import type { PrefillInvoiceItem } from './invoiceFromProject';
import { extractInvoiceDataFromPDF } from './pdfTextExtractor';
import {
  classifySheetKind,
  isMaterialOnlyLabel,
  looksLikePieceUnit,
  looksLikeSquareMeter,
  resolveInvoiceUnit,
  splitQtyUnit,
} from './invoiceUnits';
import {
  confirmedNumber,
  parseLocaleNumber,
  parseNeedsReview,
  type ParseNumberStatus,
} from './localeNumber';
import {
  canRunBrowserOcr,
  extractEstimateTextViaOcr,
  isSparseExtractedText,
} from './invoiceImportOcr';
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
  /** How line items were obtained */
  extractionMethod?: 'spreadsheet' | 'pdf-text' | 'ocr';
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
 * Returns 0 only as a numeric fallback for legacy callers — prefer parseLocaleNumber
 * + confirmedNumber so empty/invalid are not treated as confirmed zero.
 */
export function parseNumber(
  raw: unknown,
  options?: { preferGroupedThousandsDot?: boolean },
): number {
  return confirmedNumber(parseLocaleNumber(raw, options)) ?? 0;
}

function cellEmpty(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw === 'number') return !Number.isFinite(raw);
  return String(raw).trim() === '';
}

function toItem(partial: {
  description?: string;
  quantity?: number | null;
  unit?: string;
  price?: number | null;
  material?: number | string;
  originalQuantityRaw?: string;
  originalPriceRaw?: string;
  originalUnitRaw?: string;
  needsReview?: boolean;
  critical?: boolean;
  reviewWarnings?: string[];
  quantityStatus?: ParseNumberStatus;
  priceStatus?: ParseNumberStatus;
  unitKnown?: boolean;
  /** Allow inventing qty=1 only for explicit lump-sum / when quantity was present as 1 */
  allowDefaultQtyOne?: boolean;
}): PrefillInvoiceItem | null {
  let description = String(partial.description || '')
    .trim()
    .replace(/\s+/g, ' ');
  let quantity =
    partial.quantity == null || !Number.isFinite(partial.quantity)
      ? 0
      : Number(partial.quantity);
  let price =
    partial.price == null || !Number.isFinite(partial.price)
      ? 0
      : Number(partial.price);
  let materialNum =
    typeof partial.material === 'number'
      ? partial.material
      : parseNumber(partial.material);
  const reviewWarnings = [...(partial.reviewWarnings || [])];
  let needsReview = !!partial.needsReview;
  let critical = !!partial.critical;

  // "Material: 250" inline in description
  const matInline = description.match(
    /(?:^|[|;/])\s*(?:material|матеріал|мат\.?)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i,
  );
  if (matInline && materialNum <= 0) {
    materialNum = parseNumber(matInline[1]);
    description = description.replace(matInline[0], '').trim();
  }

  if (!description && quantity <= 0 && price <= 0 && materialNum <= 0) return null;

  const unitRaw = String(partial.unit || partial.originalUnitRaw || '').trim();
  const resolved = resolveInvoiceUnit(unitRaw);
  let unit = resolved.unit;
  const unitKnown =
    partial.unitKnown !== undefined ? partial.unitKnown : resolved.known;

  if (unitRaw && !unitKnown) {
    // Keep original unit text — do not substitute pcs/m²
    unit = unitRaw;
    needsReview = true;
    critical = true;
    reviewWarnings.push(
      `Невідома одиниця «${unitRaw}» — виберіть коректну перед збереженням`,
    );
  } else if (!unitRaw) {
    unit = 'pcs';
    needsReview = true;
    reviewWarnings.push('Одиниця не вказана — підставлено pcs, перевірте');
  }

  // Do not invent quantity: only default to 1 for Pauschal / explicit allow
  let qty = quantity;
  const qtyStatus = partial.quantityStatus;
  if (qtyStatus === 'invalid') {
    critical = true;
    needsReview = true;
    reviewWarnings.push('Кількість некоректна (не число) — виправте');
  } else if (qtyStatus === 'ambiguous') {
    critical = true;
    needsReview = true;
  } else if (qtyStatus === 'empty' || (qty <= 0 && (price > 0 || materialNum > 0))) {
    if (unit === 'Pauschal' || partial.allowDefaultQtyOne) {
      qty = 1;
    } else {
      critical = true;
      needsReview = true;
      reviewWarnings.push('Порожня кількість — не підставлено 1');
    }
  }

  const priceStatus = partial.priceStatus;
  if (priceStatus === 'invalid') {
    critical = true;
    needsReview = true;
    reviewWarnings.push('Ціна некоректна (не число) — виправте');
  } else if (priceStatus === 'ambiguous') {
    critical = true;
    needsReview = true;
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
      critical,
      unitKnown: true,
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
    critical,
    unitKnown,
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
        fileTotal = confirmedNumber(parseLocaleNumber(totalRaw, numOpts)) ?? undefined;
      }
      break;
    }

    const lineWarnings: string[] = [];
    let needsReview = false;
    let critical = false;
    let quantity: number | null = null;
    let quantityStatus: ParseNumberStatus = 'empty';
    let unit = '';
    let unitKnown = true;

    if (colMap.quantity !== undefined) {
      if (
        typeof qtyRaw === 'number' ||
        (typeof qtyRaw === 'string' && !/\p{L}/u.test(String(qtyRaw)))
      ) {
        const parsed = parseLocaleNumber(qtyRaw, numOpts);
        quantityStatus = parsed.status;
        quantity = confirmedNumber(parsed);
        if (parseNeedsReview(parsed)) {
          needsReview = true;
          if (parsed.status === 'ambiguous') {
            critical = true;
            lineWarnings.push(
              `Неоднозначна кількість «${parsed.original}» → кандидат ${parsed.value}`,
            );
          } else if (parsed.status === 'invalid') {
            critical = true;
            lineWarnings.push(`Кількість «${parsed.original}» некоректна`);
          }
        }
      } else if (colMap.unit === undefined) {
        const split = splitQtyUnit(qtyRaw);
        quantity = split.quantity;
        quantityStatus = split.quantity > 0 ? 'ok' : 'invalid';
        if (split.unit) {
          unit = split.unit;
          unitKnown = split.unitKnown !== false;
        }
        if (quantityStatus === 'invalid' && String(qtyRaw ?? '').trim()) {
          critical = true;
          needsReview = true;
          lineWarnings.push(`Кількість «${qtyRaw}» некоректна`);
        }
      } else {
        const parsed = parseLocaleNumber(qtyRaw, numOpts);
        quantityStatus = parsed.status;
        quantity = confirmedNumber(parsed);
        if (parseNeedsReview(parsed)) {
          needsReview = true;
          if (parsed.status === 'invalid' || parsed.status === 'ambiguous') {
            critical = true;
            lineWarnings.push(
              parsed.status === 'ambiguous'
                ? `Неоднозначна кількість «${parsed.original}» → кандидат ${parsed.value}`
                : `Кількість «${parsed.original}» некоректна`,
            );
          }
        }
      }
    }

    if (colMap.unit !== undefined) {
      const uRaw = String(unitRaw ?? '').trim();
      if (uRaw) {
        const resolved = resolveInvoiceUnit(uRaw);
        if (resolved.known && resolved.normalized) {
          unit = resolved.normalized;
          unitKnown = true;
          // Guard against cross-mapping
          if (looksLikeSquareMeter(uRaw) && unit !== 'm²') {
            unit = 'm²';
            needsReview = true;
            lineWarnings.push(`Одиницю «${uRaw}» виправлено на m²`);
          } else if (looksLikePieceUnit(uRaw) && unit !== 'pcs') {
            unit = 'pcs';
            needsReview = true;
            lineWarnings.push(`Одиницю «${uRaw}» виправлено на pcs/ud`);
          }
        } else {
          unit = uRaw;
          unitKnown = false;
          unknownUnits += 1;
          critical = true;
          needsReview = true;
          lineWarnings.push(`Невідома одиниця «${uRaw}» — збережено оригінал`);
        }
      }
    }

    // Never treat the Pos/# index column as quantity (classic scramble bug)
    if (
      colMap.index !== undefined &&
      colMap.quantity === colMap.index
    ) {
      critical = true;
      needsReview = true;
      lineWarnings.push('Колонка кількості збігається з № — перевірте');
    }

    const priceParsed =
      colMap.price !== undefined
        ? parseLocaleNumber(priceRaw, numOpts)
        : parseLocaleNumber('');
    let price = confirmedNumber(priceParsed);
    const priceStatus = colMap.price !== undefined ? priceParsed.status : 'empty';
    if (parseNeedsReview(priceParsed) && colMap.price !== undefined) {
      needsReview = true;
      if (priceParsed.status === 'ambiguous' || priceParsed.status === 'invalid') {
        critical = true;
        lineWarnings.push(
          priceParsed.status === 'ambiguous'
            ? `Неоднозначна ціна «${priceParsed.original}» → кандидат ${priceParsed.value}`
            : `Ціна «${priceParsed.original}» некоректна`,
        );
      }
    }

    const totalParsed =
      colMap.total !== undefined
        ? parseLocaleNumber(totalRaw, numOpts)
        : parseLocaleNumber('');
    const total = confirmedNumber(totalParsed) ?? 0;

    const material =
      colMap.material !== undefined
        ? confirmedNumber(parseLocaleNumber(matRaw, numOpts)) ?? 0
        : 0;

    const qtyNum = quantity ?? 0;
    const priceNum = price ?? 0;

    // Section header: description but no qty/price/total and empty unit
    if (
      description &&
      qtyNum <= 0 &&
      priceNum <= 0 &&
      total <= 0 &&
      !String(unitRaw ?? '').trim() &&
      quantityStatus === 'empty' &&
      priceStatus === 'empty'
    ) {
      continue;
    }

    // Derive missing unit price from Total only when price cell is empty — flag for review
    if (priceNum <= 0 && total > 0 && qtyNum > 0 && priceStatus === 'empty') {
      price = total / qtyNum;
      needsReview = true;
      critical = true;
      lineWarnings.push(
        `Ціну обчислено з Total (${total}) / qty — підтвердіть`,
      );
    } else if (priceNum <= 0 && total > 0 && qtyNum <= 0) {
      critical = true;
      needsReview = true;
      lineWarnings.push(
        `Є Total (${total}), але немає кількості/ціни — не вигадано значення`,
      );
    }

    // Never silently rewrite qty or price when Total disagrees
    if (priceNum > 0 && total > 0 && qtyNum > 0) {
      const expected = roundMoney(qtyNum * priceNum);
      if (Math.abs(expected - roundMoney(total)) > 0.02) {
        needsReview = true;
        lineWarnings.push(
          `Розбіжність: qty×price=${expected.toFixed(2)}, Total у файлі=${roundMoney(total).toFixed(2)}`,
        );
        warnings.push(
          `Рядок ${rowNum + 1}: qty×price ${expected.toFixed(2)} ≠ Total ${roundMoney(total).toFixed(2)} — значення не змінено`,
        );
      }
    }

    if (!description) continue;

    // Never invent price from thin air when both empty
    if (priceNum <= 0 && qtyNum <= 0 && material <= 0 && total <= 0) continue;

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
      critical,
      quantityStatus,
      priceStatus,
      unitKnown,
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
    warnings.push(
      `Нерозпізнаних одиниць: ${unknownUnits} (збережено оригінал, потрібна перевірка)`,
    );
  }

  return { items, fileTotal };
}

/**
 * Parse CSV into string cells only.
 * XLSX coerces `12,5` → 125 and `20,00` → 2000 — fatal for EU decimals.
 */
function parseCsvRowsAsStrings(text: string): string[][] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const semis = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const sep = semis > commas ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === sep) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    if (ch === '\r') continue;
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

type ParsedSheetResult = {
  sheetName: string;
  items: PrefillInvoiceItem[];
  fileTotal?: number;
  warnings: string[];
  titleCell?: string;
  spanishHeaders: boolean;
};

/**
 * Parse one worksheet (or CSV table) into invoice lines.
 * Materials sheets keep every priced row — never coalesce into Lexware "material" field.
 */
function parseSheetTable(
  rows: unknown[][],
  sheetName: string,
): ParsedSheetResult | null {
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
    return null;
  }

  const titleCell = rows
    .slice(0, headerIdx + 1)
    .flat()
    .map((c) => String(c ?? '').trim())
    .find((t) => t.length > 3 && /[a-zA-Zа-яА-Я]/u.test(t));

  const spanishHeaders = recognizedLabels.some((l) =>
    /trabajo|unidad|medicion|precio|cantidad|material/i.test(normHeader(l)),
  );

  const sheetKind = classifySheetKind(
    [sheetName, titleCell || '', ...recognizedLabels].join(' '),
  );

  const { items: rawItems, fileTotal } = rowsToItems(
    rows.slice(headerIdx + 1),
    colMap,
    warnings,
    { preferGroupedThousandsDot: spanishHeaders },
  );

  // Materials sheet: each row is its own position (saco/ud/lote…).
  // Labor sheet: only coalesce true Lexware "Material …" companion rows.
  let items: PrefillInvoiceItem[];
  if (sheetKind === 'materials') {
    items = rawItems;
  } else {
    const hasMaterialOnly = rawItems.some((it) =>
      isMaterialOnlyLabel(it.description),
    );
    items = hasMaterialOnly ? coalesceMaterialRows(rawItems) : rawItems;
  }

  if (items.length === 0) {
    return null;
  }

  const sum = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  if (fileTotal != null && Math.abs(sum - fileTotal) > 0.05) {
    warnings.push(
      `Аркуш «${sheetName}»: сума ${sum.toFixed(2)} ≠ підсумок у файлі ${fileTotal.toFixed(2)}`,
    );
  }

  return {
    sheetName,
    items,
    fileTotal,
    warnings,
    titleCell,
    spanishHeaders,
  };
}

async function parseSpreadsheet(file: File): Promise<ImportedInvoiceDraft> {
  const buf = await file.arrayBuffer();
  const nameLower = file.name.toLowerCase();
  const isCsv = nameLower.endsWith('.csv') || file.type === 'text/csv';

  const parsedSheets: ParsedSheetResult[] = [];
  const skippedSheets: string[] = [];
  let metaRows: unknown[][] = [];

  if (isCsv) {
    const text = new TextDecoder('utf-8').decode(buf);
    const rows = parseCsvRowsAsStrings(text);
    const sheetName = file.name.replace(/\.[^.]+$/, '') || 'CSV';
    metaRows = rows;
    const one = parseSheetTable(rows, sheetName);
    if (!one) {
      throw new Error(
        'Не знайдено заголовки таблиці. Потрібні колонки: назва, одиниця, кількість, ціна (і/або сума).',
      );
    }
    parsedSheets.push(one);
  } else {
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    if (!wb.SheetNames.length) {
      throw new Error('Spreadsheet has no sheets');
    }
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: true,
      }) as unknown[][];
      if (!metaRows.length) metaRows = rows;
      const one = parseSheetTable(rows, name);
      if (one) {
        parsedSheets.push(one);
      } else {
        skippedSheets.push(name);
      }
    }
  }

  if (parsedSheets.length === 0) {
    throw new Error(
      'Не знайдено жодного аркуша з таблицею позицій (назва, одиниця, кількість, ціна).',
    );
  }

  const meta = guessMetaFromSheet(metaRows);
  const warnings: string[] = [];
  const items: PrefillInvoiceItem[] = [];
  let combinedFileTotal = 0;
  let hasFileTotal = false;

  for (const sheet of parsedSheets) {
    warnings.push(...sheet.warnings);
    items.push(...sheet.items);
    if (sheet.fileTotal != null) {
      combinedFileTotal += sheet.fileTotal;
      hasFileTotal = true;
    }
  }

  const sum = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  if (hasFileTotal && Math.abs(sum - combinedFileTotal) > 0.05) {
    warnings.push(
      `Загальна сума позицій ${sum.toFixed(2)} ≠ сума підсумків аркушів ${combinedFileTotal.toFixed(2)}`,
    );
  }

  const titles = parsedSheets.map((s) => s.titleCell || s.sheetName);
  const document_type = detectDocumentType(file.name, titles);
  const invoice_language = detectInvoiceLanguage(file.name, titles);
  const importedSheet = parsedSheets.map((s) => s.sheetName).join(' + ');

  return {
    ...meta,
    items,
    currency: meta.currency || 'EUR',
    sourceFileName: file.name,
    document_type,
    invoice_language: invoice_language || meta.invoice_language,
    importedSheet,
    skippedSheets: skippedSheets.length ? skippedSheets : undefined,
    warnings: warnings.length ? warnings : undefined,
    extractionMethod: 'spreadsheet',
    notes:
      meta.notes ||
      `Imported from ${file.name}` +
        (parsedSheets.length > 1
          ? ` (аркуші: ${importedSheet})`
          : '') +
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

function parsePdfLineItems(
  text: string,
  opts: { fromOcr?: boolean } = {},
): PrefillInvoiceItem[] {
  const items: PrefillInvoiceItem[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const preferThousands =
    /medici[oó]n|cantidad|precio|trabajo|presupuesto|importe/i.test(text);

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
      `^(.{3,120}?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${PDF_UNIT})\\s+(\\d+(?:[.,]\\d{2})?)(?:\\s+(\\d+(?:[.,]\\d{2})?))?(?:\\s+(\\d+(?:[.,]\\d{2})?))?\\s*$`,
      'i',
    );
    const m = line.match(withUnit);
    if (m) {
      const qtyParsed = parseLocaleNumber(m[2], {
        preferGroupedThousandsDot: preferThousands,
      });
      const quantity = confirmedNumber(qtyParsed);
      const resolved = resolveInvoiceUnit(m[3]);
      const n4 =
        confirmedNumber(
          parseLocaleNumber(m[4], {
            preferGroupedThousandsDot: preferThousands,
          }),
        ) ?? 0;
      const n5 = m[5]
        ? confirmedNumber(
            parseLocaleNumber(m[5], {
              preferGroupedThousandsDot: preferThousands,
            }),
          ) ?? 0
        : 0;
      const n6 = m[6]
        ? confirmedNumber(
            parseLocaleNumber(m[6], {
              preferGroupedThousandsDot: preferThousands,
            }),
          ) ?? 0
        : 0;
      let price: number | null = n4;
      let material = 0;
      const qtyN = quantity ?? 0;
      if (n6 > 0) {
        price = n4;
        material = n5;
      } else if (n5 > 0) {
        if (Math.abs(n5 - qtyN * n4) < 0.05) {
          material = 0;
        } else {
          material = n5;
        }
      }
      const lineWarnings: string[] = [];
      let needsReview = !!opts.fromOcr || qtyParsed.ambiguous || !resolved.known;
      let critical = !!opts.fromOcr || qtyParsed.status === 'ambiguous' || !resolved.known;
      if (opts.fromOcr) lineWarnings.push('Рядок з OCR — обов’язкова перевірка');
      if (qtyParsed.ambiguous) {
        lineWarnings.push(`Неоднозначна кількість «${m[2]}»`);
      }
      if (!resolved.known) {
        lineWarnings.push(`Невідома одиниця «${m[3]}»`);
      }
      const item = toItem({
        description: m[1],
        quantity,
        unit: resolved.unit || m[3],
        price,
        material,
        originalQuantityRaw: m[2],
        originalPriceRaw: m[4],
        originalUnitRaw: m[3],
        needsReview,
        critical,
        quantityStatus: qtyParsed.status,
        unitKnown: resolved.known,
        reviewWarnings: lineWarnings,
      });
      if (item) items.push(item);
      continue;
    }

    const m2 = line.match(
      /^(.{3,120}?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d{2})?)\s+(\d+(?:[.,]\d{2})?)\s*$/,
    );
    if (m2) {
      const item = toItem({
        description: m2[1],
        quantity: parseNumber(m2[2], {
          preferGroupedThousandsDot: preferThousands,
        }),
        unit: 'pcs',
        price: parseNumber(m2[3], {
          preferGroupedThousandsDot: preferThousands,
        }),
        originalQuantityRaw: m2[2],
        originalPriceRaw: m2[3],
        needsReview: true,
        critical: true,
        reviewWarnings: [
          opts.fromOcr
            ? 'OCR: одиниця не вказана — підставлено pcs'
            : 'PDF: одиниця не вказана — підставлено pcs',
        ],
      });
      if (item) items.push(item);
    }
  }
  return coalesceMaterialRows(items);
}

function taxHintsFromText(text: string): string[] {
  const hints: string[] = [];
  if (/iva\s*inclu|mwst\s*inkl|vat\s*incl|brutto|tax\s*included/i.test(text)) {
    hints.push(
      'У документі явно вказано, що податок уже включено в ціну — не додавайте IVA повторно без перевірки',
    );
  }
  if (/(?:iva|mwst|ust|vat|пдв)\s*[:=]?\s*(\d{1,2})(?:[.,]\d+)?\s*%/i.test(text)) {
    const rates = new Set<string>();
    const re =
      /(?:iva|mwst|ust|vat|пдв)\s*[:=]?\s*(\d{1,2})(?:[.,]\d+)?\s*%/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) rates.add(m[1]);
    if (rates.size > 1) {
      hints.push(
        `Знайдено кілька ставок податку (${[...rates].join(', ')}%) — у формі інвойсу одна ставка на документ; перевірте вручну`,
      );
    }
  }
  return hints;
}

async function buildDraftFromPlainText(
  file: File,
  text: string,
  opts: {
    extractionMethod: 'pdf-text' | 'ocr';
    header?: Awaited<ReturnType<typeof extractInvoiceDataFromPDF>>;
  },
): Promise<ImportedInvoiceDraft> {
  const warnings = [...taxHintsFromText(text)];
  if (opts.extractionMethod === 'ocr') {
    warnings.push(
      'Текст отримано через OCR на пристрої — обов’язково перевірте позиції перед збереженням',
    );
  }

  let items = text.trim()
    ? parsePdfLineItems(text, { fromOcr: opts.extractionMethod === 'ocr' })
    : [];

  const header = opts.header;
  if (items.length === 0 && header) {
    const amount = parseNumber(header.totalAmount || '');
    if (amount > 0) {
      const single = toItem({
        description: header.invoiceNumber
          ? `Position ${header.invoiceNumber}`
          : file.name.replace(/\.[^.]+$/, ''),
        quantity: 1,
        unit: 'Pauschal',
        price: amount,
        needsReview: true,
        reviewWarnings: ['Єдина сума з заголовка PDF — розбийте позиції вручну'],
      });
      if (single) items = [single];
    }
  }

  if (items.length === 0) {
    throw new Error(
      opts.extractionMethod === 'ocr'
        ? 'OCR не знайшов таблицю позицій. Краще імпортувати Excel/CSV кошторису.'
        : 'Could not read invoice lines from PDF. Use an Excel/CSV with columns, or a text PDF.',
    );
  }

  const document_type = detectDocumentType(file.name, [text.slice(0, 500)]);
  return {
    client_name: header?.company || undefined,
    document_number: header?.invoiceNumber || undefined,
    date: header?.invoiceDate || undefined,
    currency: header?.currency || 'EUR',
    items,
    sourceFileName: file.name,
    document_type,
    extractionMethod: opts.extractionMethod,
    warnings: warnings.length ? warnings : undefined,
    notes: `Imported from ${file.name}${opts.extractionMethod === 'ocr' ? ' (OCR)' : ''}`,
  };
}

async function parsePdf(file: File): Promise<ImportedInvoiceDraft> {
  const header = await extractInvoiceDataFromPDF(file);
  let text = await extractPdfText(file);
  let method: 'pdf-text' | 'ocr' = 'pdf-text';

  if (isSparseExtractedText(text)) {
    if (canRunBrowserOcr()) {
      try {
        text = await extractEstimateTextViaOcr(file);
        method = 'ocr';
      } catch (err) {
        console.warn('PDF OCR fallback failed', err);
      }
    } else if (!text.trim()) {
      throw new Error(
        'Цей PDF без текстового шару (скан). Відкрийте імпорт у браузері для OCR, або завантажте Excel/CSV.',
      );
    }
  }

  return buildDraftFromPlainText(file, text, {
    extractionMethod: method,
    header,
  });
}

async function parseImageEstimate(file: File): Promise<ImportedInvoiceDraft> {
  if (!canRunBrowserOcr()) {
    throw new Error(
      'Імпорт фото кошторису потребує OCR у браузері. На комп’ютері краще Excel/CSV.',
    );
  }
  const text = await extractEstimateTextViaOcr(file);
  return buildDraftFromPlainText(file, text, { extractionMethod: 'ocr' });
}

export function isInvoiceImportFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const isImage =
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp') ||
    (file.type || '').startsWith('image/');
  // DOC/DOCX intentionally not accepted — no Word parser in this app
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    name.endsWith('.pdf') ||
    file.type === 'application/pdf' ||
    file.type.includes('sheet') ||
    file.type === 'text/csv' ||
    isImage
  );
}

/** Parse Excel/CSV/PDF/image into an editable invoice draft (sales invoice lines). */
export async function importInvoiceFromFile(file: File): Promise<ImportedInvoiceDraft> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    return parsePdf(file);
  }
  if (
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp') ||
    (file.type || '').startsWith('image/')
  ) {
    return parseImageEstimate(file);
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
  throw new Error(
    'Unsupported file type. Use Excel (.xlsx/.xls), CSV, PDF, or image (JPG/PNG). Word DOC/DOCX is not supported.',
  );
}

/** Re-export for callers that validate before save. */
export { validateImportedDraft } from './invoiceImportValidate';
export { isSparseExtractedText, canRunBrowserOcr } from './invoiceImportOcr';

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
