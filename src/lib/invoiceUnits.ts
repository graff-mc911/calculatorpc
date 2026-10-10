/**
 * Normalize construction units from Excel/PDF (UA/DE/EN/ES) into app select values.
 * App units: m² | m³ | lm | m | h | d | pcs | kg | Pauschal | Stunde | ft²
 *
 * Never silently map kg→pcs or invent m² as a universal fallback.
 */

export type InvoiceUnit =
  | 'm²'
  | 'm³'
  | 'lm'
  | 'm'
  | 'h'
  | 'd'
  | 'pcs'
  | 'kg'
  | 'Pauschal'
  | 'Stunde'
  | 'ft²';

/** Known units offered in the invoice form select. */
export const KNOWN_INVOICE_UNITS: readonly InvoiceUnit[] = [
  'm²',
  'm³',
  'lm',
  'm',
  'h',
  'd',
  'pcs',
  'kg',
  'Pauschal',
  'Stunde',
  'ft²',
] as const;

export type ResolvedInvoiceUnit = {
  /** Value stored on the line (known code or original unknown text). */
  unit: string;
  /** True when mapped to a known InvoiceUnit. */
  known: boolean;
  /** Normalized known unit when known; otherwise null. */
  normalized: InvoiceUnit | null;
};

/**
 * Fix common export/mojibake forms before matching.
 * Excel/CSV sometimes yields `mÂ²` (UTF-8 m² read as Latin-1) or `m^2`.
 */
function repairUnitMojibake(raw: string): string {
  return String(raw || '')
    .normalize('NFC')
    .replace(/m[ÂÃâã]\s*²/gi, 'm²')
    .replace(/m[ÂÃâã]\s*2/gi, 'm2')
    .replace(/m[ÂÃâã]\s*³/gi, 'm³')
    .replace(/m[ÂÃâã]\s*3/gi, 'm3')
    .replace(/m\s*\^\s*2/gi, 'm2')
    .replace(/m\s*\^\s*3/gi, 'm3')
    .replace(/м\s*\^\s*2/gi, 'м2')
    .replace(/м\s*\^\s*3/gi, 'м3');
}

/** Strip spaces / dots / lowercase for matching. */
export function compactUnitText(raw: string): string {
  return repairUnitMojibake(raw)
    .trim()
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');
}

function matchKnownUnit(s: string): InvoiceUnit | null {
  if (!s) return null;

  // Exact matches (after compact) — ES / pack / flat-rate tokens
  if (
    s === 'ml' ||
    s === 'ml.' ||
    s === 'm.l.' ||
    s === 'm.l' ||
    s === 'metro lineal' ||
    s === 'metros lineales'
  ) {
    return 'lm';
  }

  // Mass — never map to pcs
  if (
    s === 'kg' ||
    s === 'kilo' ||
    s === 'kilos' ||
    s === 'kilogramo' ||
    s === 'kilogramos' ||
    s === 'kilogram' ||
    s === 'kilograms'
  ) {
    return 'kg';
  }

  if (
    s === 'ud' ||
    s === 'ud.' ||
    s === 'uds' ||
    s === 'uds.' ||
    s === 'unidad' ||
    s === 'unidades' ||
    s === 'u' ||
    s === 'un' ||
    s === 'pz' ||
    s === 'pza' ||
    s === 'pieza' ||
    s === 'ea' ||
    s === 'each'
  ) {
    return 'pcs';
  }

  if (
    s === 'global' ||
    s === 'gl' ||
    s === 'glob' ||
    s === 'pa' ||
    s === 'partida' ||
    s === 'partida alzada' ||
    s === 'lote' ||
    s === 'servicio' ||
    s === 'tarifa plana' ||
    s === 'flat' ||
    s === 'flat rate' ||
    s === 'ryczalt' ||
    s === 'ryczałt'
  ) {
    return 'Pauschal';
  }
  if (s === 'hora' || s === 'horas') {
    return 'h';
  }

  // Calendar / work days — ES días (never confuse with bare "d" decimal)
  if (
    s === 'd' ||
    s === 'day' ||
    s === 'days' ||
    s === 'dia' ||
    s === 'dias' ||
    s === 'día' ||
    s === 'días' ||
    s === 'tag' ||
    s === 'tage' ||
    s === 'день' ||
    s === 'дні' ||
    s === 'дней' ||
    s === 'дн' ||
    s === 'дн.'
  ) {
    return 'd';
  }

  // Square meters (before bare "m" / "ml")
  if (
    /^(m2|м2|qm|sqm|sq\.?\s*m|sq\s*m|м\s*2|квадратн|metro\s*cuadrado|metros\s*cuadrados)$/i.test(
      s,
    ) ||
    s === 'm²' ||
    s === 'm 2' ||
    s.includes('м²') ||
    s.includes('квадр') ||
    s.includes('cuadrad') ||
    s.includes('square') ||
    /^m\s*2$/.test(s) ||
    /^м\s*2$/.test(s)
  ) {
    return 'm²';
  }

  // Cubic — never collapse to m²
  if (
    /^(m3|м3|cbm|куб|metro\s*c[uú]bico|cubic)/i.test(s) ||
    s.includes('м³') ||
    s.includes('cubic')
  ) {
    return 'm³';
  }

  // Linear / running meters — ES "ml", DE lfm, UA пог.м
  if (
    /^(ml|lm|lfm|lf|lfdm|lfd\.?m?|мп|пм|пог|погон|metro\s*lineal|metros\s*lineales|m\.l\.?)$/i.test(
      s,
    ) ||
    /погонн|погоні|пог\.?\s*м|м\.?\s*п|laufmeter|laufende\s*meter|linear\s*m|running\s*m|metro\s*lineal/.test(
      s,
    ) ||
    s === 'м.п.' ||
    s === 'м.п' ||
    s === 'м п'
  ) {
    return 'lm';
  }

  // Bare meter — separate from lm synonym when source says "m" (stored as 'm')
  if (s === 'm' || s === 'м' || s === 'метр' || s === 'meter' || s === 'metro') {
    return 'm';
  }

  if (/^(h|hr|hrs|hours|std|stunde|год|години|hour|hora|horas)$/i.test(s)) {
    return s.includes('stunde') || s === 'std' ? 'Stunde' : 'h';
  }

  if (
    /^(d|day|days|dia|dias|día|días|tag|tage|день|дні|дней|дн\.?)$/i.test(s)
  ) {
    return 'd';
  }

  // Countable packs → pcs (not mass)
  if (
    /^(pcs|stk|stück|st|шт|штук|pc|ud|uds|u|unidad|unidades|pieza|piezas|saco|sacos|caja|cajas|rollo|rollos|bote|botes|cartucho|cartuchos|l|lt|lts|litro|litros|liter|litre)$/i.test(
      s,
    )
  ) {
    return 'pcs';
  }

  if (
    /^(pausch|psch|pauschal|паушал|компл|комплект|global|pa|tanto\s*alzado|partida\s*alzada|lote|lotes|kit|set|sets|servicio|servicios)$/i.test(
      s,
    )
  ) {
    return 'Pauschal';
  }

  if (/^(ft2|sqft|sq\.?ft)/i.test(s)) {
    return 'ft²';
  }

  return null;
}

/**
 * Resolve free-text unit → stored value.
 * Unknown units keep the original text (not pcs/m²).
 */
export function resolveInvoiceUnit(
  raw: string | null | undefined,
): ResolvedInvoiceUnit {
  const original = String(raw ?? '').trim();
  const s = compactUnitText(original);
  if (!s) {
    return { unit: '', known: false, normalized: null };
  }
  const known = matchKnownUnit(s);
  if (known) {
    return { unit: known, known: true, normalized: known };
  }
  // Keep original spelling for audit; do not invent pcs/m²
  return { unit: original, known: false, normalized: null };
}

/**
 * Map free-text unit → known InvoiceUnit.
 * @deprecated Prefer resolveInvoiceUnit — unknown units must not silently become fallback.
 * When unknown, returns fallback only if provided; empty raw → fallback.
 */
export function normalizeInvoiceUnit(
  raw: string | null | undefined,
  fallback: InvoiceUnit = 'pcs',
): InvoiceUnit {
  const resolved = resolveInvoiceUnit(raw);
  if (resolved.normalized) return resolved.normalized;
  if (!String(raw ?? '').trim()) return fallback;
  return fallback;
}

/** True when raw unit text clearly means square meters. */
export function looksLikeSquareMeter(raw: string | null | undefined): boolean {
  const s = compactUnitText(String(raw || ''));
  if (!s) return false;
  return matchKnownUnit(s) === 'm²';
}

/** True when raw unit text clearly means pieces / unidades. */
export function looksLikePieceUnit(raw: string | null | undefined): boolean {
  const s = compactUnitText(String(raw || ''));
  if (!s) return false;
  return /^(ud|uds|u|unidad|unidades|pcs|stk|stück|st|шт|штук|pc|pieza|piezas|ea|each)$/.test(
    s,
  );
}

/** True when raw unit is mass (kg) — must not become pcs. */
export function looksLikeMassUnit(raw: string | null | undefined): boolean {
  return resolveInvoiceUnit(raw).normalized === 'kg';
}

/** Localize stored unit label for PDF (ES wordmarks; other languages unchanged). */
export function formatUnitForPdf(unit: string, language: string): string {
  if (language === 'es') {
    if (unit === 'pcs') return 'ud';
    if (unit === 'lm') return 'ml';
    if (unit === 'm') return 'm';
    if (unit === 'd') return 'días';
    if (unit === 'Pauschal') return 'global';
    if (unit === 'Stunde') return 'h';
    if (unit === 'h') return 'h';
    if (unit === 'kg') return 'kg';
  }
  if (language === 'uk' && unit === 'd') return 'дн';
  if (language === 'de' && unit === 'd') return 'Tage';
  return unit;
}

/** Pull quantity + unit from a single cell like "120 m2" / "15 ml" / "8,5 м²". */
export function splitQtyUnit(
  raw: unknown,
): { quantity: number; unit?: string; unitKnown?: boolean; restText?: string } {
  const text = String(raw ?? '').trim();
  if (!text) return { quantity: 0 };

  const digitsOnly = text.replace(/[\s\u00a0]/g, '');
  if (
    /^-?\d{1,3}([.,]\d{3})+([.,]\d+)?$/.test(digitsOnly) ||
    /^-?\d+[.,]\d+$/.test(digitsOnly) ||
    /^-?\d+$/.test(digitsOnly)
  ) {
    const n = Number(
      digitsOnly.includes(',') && digitsOnly.includes('.')
        ? digitsOnly.lastIndexOf(',') > digitsOnly.lastIndexOf('.')
          ? digitsOnly.replace(/\./g, '').replace(',', '.')
          : digitsOnly.replace(/,/g, '')
        : digitsOnly.includes(',')
          ? digitsOnly.replace(',', '.')
          : digitsOnly,
    );
    if (Number.isFinite(n)) return { quantity: n };
  }

  const pure = text.replace(/\s/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(pure)) {
    return { quantity: Number(pure) || 0 };
  }

  const m = text.match(
    /^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Zа-яА-ЯіїєґІЇЄҐ][a-zA-Zа-яА-ЯіїєґІЇЄҐ0-9²³./\-\s]*)$/u,
  );
  if (m) {
    const quantity = Number(m[1].replace(',', '.')) || 0;
    const unitPart = (m[2] || '').trim();
    if (unitPart) {
      const resolved = resolveInvoiceUnit(unitPart);
      return {
        quantity,
        unit: resolved.unit,
        unitKnown: resolved.known,
      };
    }
    return { quantity };
  }

  return { quantity: 0, restText: text };
}

/** True when a row/description is a material-only position (not labor). */
export function isMaterialOnlyLabel(description: string): boolean {
  const d = compactUnitText(description);
  if (!d) return false;
  if (
    /^(material|materiales|мат(?:еріал)?|мат\.?|werkstoff|verbrauch)(\b|:|\s|$)/.test(
      d,
    )
  ) {
    return true;
  }
  if (
    /\b(arbeit|lohn|labor|work|робота|роботи|mano\s*de\s*obra|trabajo|transporte|acarreo|subida|bajada|colocaci[oó]n|montaje|demolici[oó]n|instalaci[oó]n|protecci[oó]n|pintura|enfoscado|gotel[eé]|fábrica|fabrica|tratamiento|preparaci[oó]n)\b/.test(
      d,
    )
  ) {
    return false;
  }
  return false;
}

/** True when description is labor/work (not material). */
export function isLaborOnlyLabel(description: string): boolean {
  const d = compactUnitText(description);
  return /\b(arbeit|lohn|labor|work|робота|роботи|leistung|mano\s*de\s*obra|trabajo)\b/.test(
    d,
  );
}

/** Classify sheet / title as labor vs materials vs unknown. */
export function classifySheetKind(
  title: string,
): 'labor' | 'materials' | 'unknown' {
  const t = compactUnitText(title);
  if (
    /material|материал|матеріал|werkstoff|consumo|consumible/.test(t) &&
    !/mano\s*de\s*obra|arbeit|labor|trabajo\s*de/.test(t)
  ) {
    return 'materials';
  }
  if (
    /mano\s*de\s*obra|arbeit|labor|lohn|робота|trabajo|leistung|obra\s*de\s*mano/.test(
      t,
    )
  ) {
    return 'labor';
  }
  return 'unknown';
}
