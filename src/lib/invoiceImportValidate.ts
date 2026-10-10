/**
 * Deterministic validation of an imported estimate draft before invoice persist.
 * Rule-based only — no invented confidence scores.
 */
import type { PrefillInvoiceItem } from './invoiceFromProject';
import { calculateLineTotal, roundMoney } from './invoiceTotals';

export type ImportValidationIssue = {
  level: 'error' | 'warning';
  itemIndex?: number;
  field?: string;
  message: string;
  /** Critical issues block save until edit or explicit confirm */
  critical?: boolean;
};

export type ImportValidationResult = {
  ok: boolean;
  /** True when no unresolved critical issues remain */
  canPersist: boolean;
  issues: ImportValidationIssue[];
  reviewItemIndexes: number[];
  criticalItemIndexes: number[];
};

type DraftLike = {
  items: PrefillInvoiceItem[];
  warnings?: string[];
};

function lineIssues(item: PrefillInvoiceItem, index: number): ImportValidationIssue[] {
  const out: ImportValidationIssue[] = [];
  const desc = (item.description || '').trim();
  if (!desc) {
    out.push({
      level: 'error',
      itemIndex: index,
      field: 'description',
      message: 'Порожня назва роботи',
      critical: true,
    });
  }
  if (!(Number(item.quantity) > 0) && item.unit !== 'Pauschal') {
    out.push({
      level: 'error',
      itemIndex: index,
      field: 'quantity',
      message: 'Кількість відсутня або 0',
      critical: true,
    });
  }
  if (!(Number(item.price) > 0) && !(parseFloat(String(item.material || '0')) > 0)) {
    out.push({
      level: 'warning',
      itemIndex: index,
      field: 'price',
      message: 'Немає ціни та матеріалу',
    });
  }
  if (item.unitKnown === false || (item.critical && /одиниц/i.test((item.reviewWarnings || []).join(' ')))) {
    out.push({
      level: 'error',
      itemIndex: index,
      field: 'unit',
      message: `Одиниця потребує перевірки: «${item.originalUnitRaw || item.unit}»`,
      critical: true,
    });
  }
  const expected = calculateLineTotal(item.quantity, item.price, item.material);
  if (
    item.total != null &&
    Number.isFinite(item.total) &&
    Math.abs(roundMoney(item.total) - expected) > 0.02
  ) {
    out.push({
      level: 'warning',
      itemIndex: index,
      field: 'total',
      message: `Сума позиції ${item.total} ≠ qty×price ${expected}`,
    });
  }
  if (item.critical && !item.reviewConfirmed) {
    for (const w of item.reviewWarnings || ['Критична невизначеність']) {
      out.push({
        level: 'error',
        itemIndex: index,
        message: w,
        critical: true,
      });
    }
  } else if (item.needsReview && !item.reviewConfirmed) {
    for (const w of item.reviewWarnings || ['Потребує перевірки']) {
      out.push({ level: 'warning', itemIndex: index, message: w });
    }
  }
  return out;
}

/** Unresolved critical lines that must be fixed or explicitly confirmed. */
export function unresolvedCriticalIndexes(
  items: PrefillInvoiceItem[],
): number[] {
  return items
    .map((item, i) =>
      item.critical && !item.reviewConfirmed ? i : -1,
    )
    .filter((i) => i >= 0);
}

/** Whether items may be persisted to an invoice. */
export function canPersistImportedItems(items: PrefillInvoiceItem[]): boolean {
  return unresolvedCriticalIndexes(items).length === 0;
}

/** Validate draft structure before creating / saving an invoice from import. */
export function validateImportedDraft(draft: DraftLike): ImportValidationResult {
  const issues: ImportValidationIssue[] = [];
  if (!draft?.items?.length) {
    return {
      ok: false,
      canPersist: false,
      issues: [{ level: 'error', message: 'Немає позицій після імпорту', critical: true }],
      reviewItemIndexes: [],
      criticalItemIndexes: [],
    };
  }

  draft.items.forEach((item, i) => {
    issues.push(...lineIssues(item, i));
  });

  for (const w of draft.warnings || []) {
    issues.push({ level: 'warning', message: w });
  }

  const reviewItemIndexes = draft.items
    .map((item, i) => (item.needsReview && !item.reviewConfirmed ? i : -1))
    .filter((i) => i >= 0);

  const criticalItemIndexes = unresolvedCriticalIndexes(draft.items);
  const hasError = issues.some((i) => i.level === 'error');
  return {
    ok: !hasError,
    canPersist: criticalItemIndexes.length === 0,
    issues,
    reviewItemIndexes,
    criticalItemIndexes,
  };
}
