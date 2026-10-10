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
};

export type ImportValidationResult = {
  ok: boolean;
  issues: ImportValidationIssue[];
  reviewItemIndexes: number[];
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
    });
  }
  if (!(Number(item.quantity) > 0) && item.unit !== 'Pauschal') {
    out.push({
      level: 'warning',
      itemIndex: index,
      field: 'quantity',
      message: 'Кількість відсутня або 0',
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
  if (item.needsReview) {
    for (const w of item.reviewWarnings || ['Потребує перевірки']) {
      out.push({ level: 'warning', itemIndex: index, message: w });
    }
  }
  return out;
}

/** Validate draft structure before creating / saving an invoice from import. */
export function validateImportedDraft(draft: DraftLike): ImportValidationResult {
  const issues: ImportValidationIssue[] = [];
  if (!draft?.items?.length) {
    return {
      ok: false,
      issues: [{ level: 'error', message: 'Немає позицій після імпорту' }],
      reviewItemIndexes: [],
    };
  }

  draft.items.forEach((item, i) => {
    issues.push(...lineIssues(item, i));
  });

  for (const w of draft.warnings || []) {
    issues.push({ level: 'warning', message: w });
  }

  const reviewItemIndexes = draft.items
    .map((item, i) => (item.needsReview ? i : -1))
    .filter((i) => i >= 0);

  const hasError = issues.some((i) => i.level === 'error');
  return {
    ok: !hasError,
    issues,
    reviewItemIndexes,
  };
}
