/** de-DE style money helpers for mobile inputs (1.234,56). */

export function parseMoneyInput(raw: string): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/[^\d,.\-]/g, '');

  if (!s || s === '-' || s === ',' || s === '.') return NaN;

  // Prefer comma as decimal when present (EU style)
  let normalized: string;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    // 1.234.56 → treat dots as thousands
    const parts = s.split('.');
    const last = parts.pop()!;
    normalized = parts.join('') + '.' + last;
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export function formatMoneyInput(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatMoneyDisplay(
  value: number,
  currency = 'EUR',
  locale = 'de-DE'
): string {
  const n = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${formatMoneyInput(n)} ${currency}`;
  }
}

/** Soft mask while typing: keep digits + one decimal separator. */
export function maskMoneyTyping(raw: string): string {
  let s = String(raw ?? '').replace(/[^\d,.]/g, '');
  const sep = s.includes(',') ? ',' : s.includes('.') ? '.' : '';
  if (!sep) return s.replace(/\D/g, '');

  const idx = s.indexOf(sep);
  const intPart = s.slice(0, idx).replace(/\D/g, '');
  let frac = s.slice(idx + 1).replace(/\D/g, '').slice(0, 2);
  // Drop extra separators in fractional part
  return frac.length > 0 || s.endsWith(sep) ? `${intPart}${sep}${frac}` : intPart;
}
