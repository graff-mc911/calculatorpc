/**
 * Normalize construction units from Excel/PDF (UA/DE/EN/ES) into app select values.
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
export function compactUnitText(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Map free-text unit → stored invoice unit.
 * Spanish: ml = metro lineal, ud = unidad, global/pa = Pauschal
 */
export function normalizeInvoiceUnit(
  raw: string | null | undefined,
  fallback: InvoiceUnit = 'pcs',
): InvoiceUnit {
  const s = compactUnitText(String(raw || ''));
  if (!s) return fallback;

  // Square meters (before bare "m" / "ml")
  if (
    /^(m2|м2|qm|sqm|sq\.?m|м\s*2|квадратн|metro\s*cuadrado|metros\s*cuadrados)$/i.test(s) ||
    s === 'm²' ||
    s.includes('м²') ||
    s.includes('квадр') ||
    s.includes('cuadrad')
  ) {
    return 'm²';
  }

  // Cubic
  if (
    /^(m3|м3|cbm|куб|metro\s*c[uú]bico)/i.test(s) ||
    s.includes('м³')
  ) {
    return 'm³';
  }

  // Linear / running meters — ES "ml", DE lfm, UA пог.м
  // IMPORTANT: "ml" is metro lineal (ES), NOT millilitre in construction sheets
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

  // Bare "m" / "м" in construction = linear meter (not m²)
  if (s === 'm' || s === 'м' || s === 'метр' || s === 'meter' || s === 'metro') {
    return 'lm';
  }

  if (/^(h|hr|hrs|std|stunde|год|години|hour|hora|horas)$/i.test(s)) {
    return s.includes('stunde') || s === 'std' ? 'Stunde' : 'h';
  }

  // Pieces / units — ES ud / uds / unidad
  if (
    /^(pcs|stk|stück|st|шт|штук|pc|ud|uds|u|unidad|unidades|pieza|piezas)$/i.test(s)
  ) {
    return 'pcs';
  }

  // Flat rate / lump sum — ES global / pa / tanto alzado
  if (
    /^(pausch|psch|pauschal|паушал|компл|global|pa|tanto\s*alzado|partida\s*alzada|lote|kit)$/i.test(
      s,
    )
  ) {
    return 'Pauschal';
  }

  if (/^(ft2|sqft|sq\.?ft)/i.test(s)) {
    return 'ft²';
  }

  return fallback;
}

/** Pull quantity + unit from a single cell like "120 m2" / "15 ml" / "8,5 м²". */
export function splitQtyUnit(
  raw: unknown,
): { quantity: number; unit?: InvoiceUnit; restText?: string } {
  const text = String(raw ?? '').trim();
  if (!text) return { quantity: 0 };

  // Pure number (incl. 3,500.00 / 3.500,00) — not qty+unit
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

  // qty + unit: unit part must start with a letter (not ",500.00")
  const m = text.match(
    /^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Zа-яА-ЯіїєґІЇЄҐ][a-zA-Zа-яА-ЯіїєґІЇЄҐ0-9²³./\-\s]*)$/u,
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
  const d = compactUnitText(description);
  if (!d) return false;
  // Work / labor verbs win even if the word "material" appears inside
  if (
    /\b(arbeit|lohn|labor|work|робота|роботи|mano\s*de\s*obra|trabajo|transporte|acarreo|subida|bajada|colocaci[oó]n|montaje|demolici[oó]n|instalaci[oó]n|protecci[oó]n|pintura|enfoscado|gotel[eé]|fábrica|fabrica|tratamiento|preparaci[oó]n)\b/.test(
      d,
    )
  ) {
    return false;
  }
  // Only rows that *are* a material label (Lexware "Material …"), not any cell mentioning materials
  return /^(material|materiales|мат(?:еріал)?|мат\.?|werkstoff|verbrauch)(\b|:|\s|$)/.test(
    d,
  );
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
