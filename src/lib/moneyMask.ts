/**
 * Money masks for estimator UX.
 * Display / typing: `1 500,00` with thin space thousands + comma decimals.
 * Currency display: `1 500,00 €`
 */

const NBSP = '\u00A0';

export function parseMoneyInput(raw: string): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/[€$₴]/g, '')
    .replace(/\s/g, '')
    .replace(/\u00A0/g, '')
    .replace(/[^\d,.\-]/g, '');

  if (!s || s === '-' || s === ',' || s === '.') return NaN;

  let normalized: string;
  if (s.includes(',')) {
    // EU: spaces/dots as thousands, comma as decimal
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    const parts = s.split('.');
    const last = parts.pop()!;
    normalized = parts.join('') + '.' + last;
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/** Format number as `1 500,00` (space thousands, comma decimal). */
export function formatMoneyInput(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return '';
  const neg = value < 0;
  const abs = Math.abs(value);
  const fixed = abs.toFixed(fractionDigits);
  const [intRaw, frac = ''] = fixed.split('.');
  const withSpaces = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${neg ? '-' : ''}${withSpaces},${frac}`;
}

export function formatMoneyDisplay(
  value: number,
  currency = 'EUR',
  _locale = 'uk-UA'
): string {
  const n = Number.isFinite(value) ? value : 0;
  const symbol =
    currency === 'EUR' ? '€' : currency === 'UAH' ? '₴' : currency === 'USD' ? '$' : currency;
  return `${formatMoneyInput(n, 2)}${NBSP}${symbol}`;
}

/**
 * Canonical money formatter for the project calculator (and shared UI).
 * Always guards NaN → `0,00 €`.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currency = 'EUR'
): string {
  const n = typeof value === 'number' ? value : Number(value);
  return formatMoneyDisplay(Number.isFinite(n) ? n : 0, currency);
}

/**
 * Mask while typing: keep digits + one comma/dot decimal; insert thousand spaces.
 * Example progressive: `1` → `15` → `150` → `1 500` → `1 500,5` → `1 500,50`
 */
export function maskMoneyTyping(raw: string): string {
  let s = String(raw ?? '')
    .replace(/[€$₴]/g, '')
    .replace(/\u00A0/g, ' ');

  // Allow only digits, spaces, comma, dot, leading minus
  s = s.replace(/[^\d\s,.\-]/g, '');

  const neg = s.trimStart().startsWith('-');
  s = s.replace(/-/g, '');

  // Prefer comma as decimal; convert first dot to comma if no comma
  if (!s.includes(',') && s.includes('.')) {
    const idx = s.indexOf('.');
    s = s.slice(0, idx) + ',' + s.slice(idx + 1).replace(/[.,]/g, '');
  } else if (s.includes(',')) {
    const idx = s.indexOf(',');
    s = s.slice(0, idx).replace(/[.,]/g, '') + ',' + s.slice(idx + 1).replace(/[.,\s]/g, '');
  }

  const hasComma = s.includes(',');
  const [intPartRaw, fracRaw = ''] = hasComma ? s.split(',') : [s, ''];
  const intDigits = intPartRaw.replace(/\D/g, '');
  const frac = fracRaw.replace(/\D/g, '').slice(0, 2);

  if (!intDigits && !hasComma) return neg ? '-' : '';

  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  let out = `${neg ? '-' : ''}${grouped || '0'}`;
  if (hasComma) out += `,${frac}`;
  return out;
}

/** Qty mask: allow decimals with comma, no forced 2 digits, optional thousands. */
export function maskQtyTyping(raw: string): string {
  let s = String(raw ?? '').replace(/\u00A0/g, ' ').replace(/[^\d\s,.\-]/g, '');
  const neg = s.trimStart().startsWith('-');
  s = s.replace(/-/g, '');
  if (!s.includes(',') && s.includes('.')) {
    const idx = s.indexOf('.');
    s = s.slice(0, idx) + ',' + s.slice(idx + 1).replace(/[.,]/g, '');
  } else if (s.includes(',')) {
    const idx = s.indexOf(',');
    s = s.slice(0, idx).replace(/[.,]/g, '') + ',' + s.slice(idx + 1).replace(/[.,\s]/g, '');
  }
  const hasComma = s.includes(',');
  const [intPartRaw, fracRaw = ''] = hasComma ? s.split(',') : [s, ''];
  const intDigits = intPartRaw.replace(/\D/g, '');
  const frac = fracRaw.replace(/\D/g, '').slice(0, 3);
  if (!intDigits && !hasComma) return neg ? '-' : '';
  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  let out = `${neg ? '-' : ''}${grouped || '0'}`;
  if (hasComma) out += `,${frac}`;
  return out;
}

export function formatQtyDisplay(value: number): string {
  if (!Number.isFinite(value)) return '';
  const neg = value < 0;
  const abs = Math.abs(value);
  // trim trailing zeros but keep up to 3 decimals
  const fixed = abs.toFixed(3).replace(/\.?0+$/, '');
  const [intRaw, frac] = fixed.split('.');
  const withSpaces = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${neg ? '-' : ''}${withSpaces}${frac ? `,${frac}` : ''}`;
}
