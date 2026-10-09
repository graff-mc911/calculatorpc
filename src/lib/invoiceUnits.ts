/**
 * Normalize construction units from Excel/PDF/UA/DE/EN into app select values.
 * App units: m² | m³ | lm | h | pcs | Pauschal | Stunde | ft²
 */

export type InvoiceUnit =
  | 'm²'
  | 'm³'
  | 'lm'
  | 'h'
  | 'pcs'
  | 'Pauschal'
  | 'Stunde'
  | 'ft²';

/** Strip spaces / dots / lowercase for matching. */
function compact(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Map free-text unit (м2, погонні, lfm, qm…) → stored invoice unit.
 * Defaults to `fallback` when unknown.
 */
export function normalizeInvoiceUnit(
  raw: string | null | undefined,
  fallback: InvoiceUnit = 'pcs',
): InvoiceUnit {
  const s = compact(String(raw || ''));
  if (!s) return fallback;

  // Square meters
  if (
    /^(m2|м2|qm|sqm|sq\.?m|м\s*2|квадратн)/i.test(s) ||
    s === 'm²' ||
    s.includes('м²') ||
    s.includes('квадр')
  ) {
    return 'm²';
  }

  // Cubic
  if (/^(m3|м3|cbm|куб)/i.test(s) || s.includes('м³')) {
    return 'm³';
  }

  // Running / linear meters (погоні / погонні / lfm / laufmeter)
  if (
    /^(lm|lfm|lf|lfdm|lfd\.?m?|мп|пм|пог|погон)/i.test(s) ||
    /погонн|погоні|пог\.?\s*м|м\.?\s*п|laufmeter|laufende\s*meter|linear\s*m|running\s*m/.test(
      s,
    ) ||
    s === 'м.п.' ||
    s === 'м.п' ||
    s === 'м п'
  ) {
    return 'lm';
  }

  // Bare "m" in DE/UA construction sheets usually means laufende Meter
  if (s === 'm' || s === 'м' || s === 'метр' || s === 'meter') {
    return 'lm';
  }

  if (/^(h|hr|hrs|std|stunde|год|години|hour)/i.test(s)) {
    return s.includes('stunde') || s === 'std' ? 'Stunde' : 'h';
  }

  if (/^(pcs|stk|stück|st|шт|штук|pc)/i.test(s)) {
    return 'pcs';
  }

  if (/^(pausch|psch|pauschal|паушал|компл)/i.test(s)) {
    return 'Pauschal';
  }

  if (/^(ft2|sqft|sq\.?ft)/i.test(s)) {
    return 'ft²';
  }

  return fallback;
}

/** Pull quantity + unit from a single cell like "120 m2" / "15 пог.м" / "8,5 м²". */
export function splitQtyUnit(
  raw: unknown,
): { quantity: number; unit?: InvoiceUnit; restText?: string } {
  const text = String(raw ?? '').trim();
  if (!text) return { quantity: 0 };

  // Pure number
  const pure = text.replace(/\s/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(pure)) {
    return { quantity: Number(pure) || 0 };
  }

  const m = text.match(
    /^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Zа-яА-ЯіїєґІЇЄҐ0-9²³./\-\s]+)$/u,
  );
  if (m) {
    const quantity = Number(m[1].replace(',', '.')) || 0;
    const unitPart = (m[2] || '').trim();
    if (unitPart) {
      return { quantity, unit: normalizeInvoiceUnit(unitPart) };
    }
    return { quantity };
  }

  return { quantity: 0, restText: text };
}

/** True when a row/description is a material-only position (not labor). */
export function isMaterialOnlyLabel(description: string): boolean {
  const d = compact(description);
  if (!d) return false;
  if (/\b(arbeit|lohn|labor|work|робота|роботи)\b/.test(d)) return false;
  return (
    /^(material|мат(?:еріал)?|мат\.?|werkstoff|verbrauch)\b/.test(d) ||
    (/\b(material|матеріал|мат\.?)\b/.test(d) && d.length < 48)
  );
}

/** True when description is labor/work (not material). */
export function isLaborOnlyLabel(description: string): boolean {
  const d = compact(description);
  return /\b(arbeit|lohn|labor|work|робота|роботи|leistung)\b/.test(d);
}
