/**
 * Locale-aware number parsing for construction estimates (ES/DE/UA).
 * Never strips letters to salvage digits. Distinguishes ok / empty / invalid / ambiguous.
 */

export type ParseNumberStatus = 'ok' | 'empty' | 'invalid' | 'ambiguous';

export type ParsedLocaleNumber = {
  /** ok | empty | invalid | ambiguous — never treat invalid/empty as a confirmed 0 */
  status: ParseNumberStatus;
  /**
   * Confirmed or candidate numeric value.
   * null when status is empty or invalid (do not invent 0 as “truth”).
   * For ambiguous, holds the preferred reading (still requires review).
   */
  value: number | null;
  /** True when the string could be read more than one way */
  ambiguous: boolean;
  /** Raw cleaned numeric text before numeric conversion */
  normalized: string;
  original: string;
};

export type ParseLocaleNumberOptions = {
  /**
   * When true, a single thousand-group like `1.250` is read as 1250
   * (Spanish/German estimate style) and marked ambiguous.
   * When false, the same form is read as decimal 1.25 and marked ambiguous.
   */
  preferGroupedThousandsDot?: boolean;
};

function stripMoneyNoise(raw: string): string {
  // Spaces / NBSP / thin space / apostrophe thousands (CH/FR) are separators, not digits
  return raw
    .trim()
    .replace(/[€$£]/g, '')
    .replace(/[\s\u00a0\u202f']/g, '');
}

function result(
  status: ParseNumberStatus,
  value: number | null,
  normalized: string,
  original: string,
  ambiguous = false,
): ParsedLocaleNumber {
  return { status, value, ambiguous, normalized, original };
}

/**
 * Parse a numeric cell / money string.
 * Invalid / empty → value null (not 0). Ambiguous → candidate value + status ambiguous.
 */
export function parseLocaleNumber(
  raw: unknown,
  options: ParseLocaleNumberOptions = {},
): ParsedLocaleNumber {
  const original = raw == null ? '' : String(raw);
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return result('invalid', null, '', original);
    }
    return result('ok', raw, String(raw), original);
  }

  let s = stripMoneyNoise(original);
  if (!s) {
    return result('empty', null, '', original);
  }
  // Never extract digits from words / mixed text
  if (/\p{L}/u.test(s)) {
    return result('invalid', null, '', original);
  }
  s = s.replace(/[^\d,.\-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') {
    return result('invalid', null, '', original);
  }

  let ambiguous = false;

  if (s.includes(',') && s.includes('.')) {
    // Decimal is the separator that appears last
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  } else if (s.includes('.')) {
    if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) {
      // 1.234.567 — clearly thousands
      s = s.replace(/\./g, '');
    } else if (/^\d{1,3}\.\d{3}$/.test(s)) {
      // 1.250 — ambiguous (1250 vs 1.250)
      ambiguous = true;
      if (options.preferGroupedThousandsDot) {
        s = s.replace(/\./g, '');
      }
      // else keep as decimal 1.250 → 1.25
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n)) {
    return result('invalid', null, s, original);
  }
  if (ambiguous) {
    return result('ambiguous', n, s, original, true);
  }
  return result('ok', n, s, original);
}

/** Confirmed numeric value for calculations; null if empty/invalid. */
export function confirmedNumber(parsed: ParsedLocaleNumber): number | null {
  if (parsed.status === 'ok' || parsed.status === 'ambiguous') {
    return parsed.value;
  }
  return null;
}

/** True when the parse must be reviewed before invoice confirmation. */
export function parseNeedsReview(parsed: ParsedLocaleNumber): boolean {
  return (
    parsed.status === 'ambiguous' ||
    parsed.status === 'invalid' ||
    parsed.status === 'empty'
  );
}

/** Round money to cents (deterministic, avoids float drift for display/totals). */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Integer cents for exact money arithmetic. */
export function toCents(amount: number): number {
  return Math.round(roundMoney(amount) * 100);
}

export function fromCents(cents: number): number {
  return roundMoney(cents / 100);
}
