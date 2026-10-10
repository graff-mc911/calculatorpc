/**
 * Locale-aware number parsing for construction estimates (ES/DE/UA).
 * Never strips letters to salvage digits. Ambiguous forms are flagged.
 */

export type ParsedLocaleNumber = {
  value: number;
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
  return raw
    .trim()
    .replace(/[€$£\s\u00a0]/g, '');
}

/**
 * Parse a numeric cell / money string.
 * Returns value 0 + ambiguous false for empty / non-numeric text with letters.
 */
export function parseLocaleNumber(
  raw: unknown,
  options: ParseLocaleNumberOptions = {},
): ParsedLocaleNumber {
  const original = raw == null ? '' : String(raw);
  if (typeof raw === 'number') {
    return {
      value: Number.isFinite(raw) ? raw : 0,
      ambiguous: false,
      normalized: String(raw),
      original,
    };
  }

  let s = stripMoneyNoise(original);
  if (!s) {
    return { value: 0, ambiguous: false, normalized: '', original };
  }
  // Never extract digits from words / mixed text
  if (/\p{L}/u.test(s)) {
    return { value: 0, ambiguous: false, normalized: '', original };
  }
  s = s.replace(/[^\d,.\-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') {
    return { value: 0, ambiguous: false, normalized: '', original };
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
  return {
    value: Number.isFinite(n) ? n : 0,
    ambiguous,
    normalized: s,
    original,
  };
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
