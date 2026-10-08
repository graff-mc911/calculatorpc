/**
 * project_prepayments has only `note` — pack optional payment method into it
 * without a schema change. Format: "Готівка · comment" or just one of the parts.
 */

export const PAYMENT_METHODS = ['Готівка', 'Картка', 'Переказ', 'Інше'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const SEP = ' · ';

export function composePaymentNote(
  method: string,
  comment: string
): string | null {
  const m = method.trim();
  const c = comment.trim();
  if (m && c) return `${m}${SEP}${c}`;
  return m || c || null;
}

export function parsePaymentNote(note: string | null | undefined): {
  method: string;
  comment: string;
} {
  const raw = String(note || '').trim();
  if (!raw) return { method: '', comment: '' };
  for (const m of PAYMENT_METHODS) {
    if (raw === m) return { method: m, comment: '' };
    if (raw.startsWith(m + SEP)) {
      return { method: m, comment: raw.slice(m.length + SEP.length) };
    }
  }
  return { method: '', comment: raw };
}
