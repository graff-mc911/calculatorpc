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
    s === 'each' ||
    s === 'saco' ||
    s === 'caja' ||
    s === 'rollo' ||
    s === 'bote' ||
    s === 'cartucho' ||
    s === 'kg' ||
    s === 'kilo' ||
    s === 'kilos' ||
    s === 'kilogramo' ||
    s === 'kilogramos' ||
    s === 't' ||
    s === 'to' ||
    s === 'ton' ||
    s === 'tonne' ||
    s === 'tonnes' ||
    s === 'т' ||
    s === 'тонна' ||
    s === 'тонни'
  ) {
    // App select has no kg/t — store as pcs; caller may flag unknown mass units
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

  // Square meters (before bare "m" / "ml") — never fall through to pcs
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

  // Cubic
  if (
    /^(m3|м3|cbm|куб|metro\s*c[uú]bico|cubic)/i.test(s) ||
    s.includes('м³') ||
    s.includes('cubic')
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

  // Full-match only — avoid any word starting with "h…" becoming hours
  if (/^(h|hr|hrs|hours|std|stunde|год|години|hour|hora|horas)$/i.test(s)) {
    return s.includes('stunde') || s === 'std' ? 'Stunde' : 'h';
  }

  // Days — no dedicated select value; map to h with same "time" semantics avoided:
  // keep as pcs so we do not pretend day≡hour. Caller flags via unknown-unit heuristic.
  if (/^(d|day|days|tag|tage|день|дні|dias?)$/i.test(s)) {
    return 'pcs';
  }

  // Pieces / countable packs — ES ud / saco / caja / litro / rollo…
  if (
    /^(pcs|stk|stück|st|шт|штук|pc|ud|uds|u|unidad|unidades|pieza|piezas|saco|sacos|caja|cajas|rollo|rollos|bote|botes|cartucho|cartuchos|l|lt|lts|litro|litros|liter|litre)$/i.test(
      s,
    )
  ) {
    return 'pcs';
  }

  // Flat rate / lump sum / service / set — ES global / pa / lote / servicio
  if (
    /^(pausch|psch|pauschal|паушал|компл|комплект|global|pa|tanto\s*alzado|partida\s*alzada|lote|lotes|kit|set|sets|servicio|servicios)$/i.test(
      s,
    )
  ) {
    return 'Pauschal';
  }

  // Percent is not a qty unit for invoice lines
  if (s === '%' || s === 'percent' || s === 'pct') {
    return fallback;
  }

  if (/^(ft2|sqft|sq\.?ft)/i.test(s)) {
    return 'ft²';
  }

  return fallback;
}

/** True when raw unit text clearly means square meters (for review / force-correct). */
export function looksLikeSquareMeter(raw: string | null | undefined): boolean {
  const s = compactUnitText(String(raw || ''));
  if (!s) return false;
  return (
    normalizeInvoiceUnit(s, 'pcs') === 'm²' ||
    /^(m2|м2|sqm)$/.test(s) ||
    s.includes('cuadrad') ||
    s.includes('квадр')
  );
}

/** True when raw unit text clearly means pieces / unidades. */
export function looksLikePieceUnit(raw: string | null | undefined): boolean {
  const s = compactUnitText(String(raw || ''));
  if (!s) return false;
  return /^(ud|uds|u|unidad|unidades|pcs|stk|stück|st|шт|штук|pc|pieza|piezas|ea|each)$/.test(
    s,
  );
}

/** Localize stored unit label for PDF (ES wordmarks; other languages unchanged). */
export function formatUnitForPdf(unit: string, language: string): string {
  if (language === 'es') {
    if (unit === 'pcs') return 'ud';
    if (unit === 'lm') return 'ml';
    if (unit === 'Pauschal') return 'global';
    if (unit === 'Stunde') return 'h';
  }
  return unit;
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
  // Explicit material line title (Lexware "Material …" or ES item "Material para …")
  if (
    /^(material|materiales|мат(?:еріал)?|мат\.?|werkstoff|verbrauch)(\b|:|\s|$)/.test(
      d,
    )
  ) {
    return true;
  }
  // Work / labor verbs win even if the word "material" appears inside (e.g. transporte de material)
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
