import {
  CATALOG_MATERIALS,
  CATALOG_SUPPLIERS,
  CATALOG_UPDATED_AT,
  CATALOG_WORKS,
  PRICE_COUNTRIES,
  catalogWorksByCategory,
  type CatalogMaterial,
  type CatalogSupplier,
  type CatalogWork,
  type CountryMoney,
  type PriceCountryCode,
  type WorkCategory,
  type YoutubeLink,
} from '../data/priceCatalogSeed';

export type {
  PriceCountryCode,
  CatalogWork,
  CatalogMaterial,
  CountryMoney,
  YoutubeLink,
  WorkCategory,
};

export { catalogWorksByCategory };

const CATEGORY_LABELS: Record<WorkCategory, { en: string; uk: string; de: string; es: string }> = {
  tiling: { en: 'Tiling', uk: 'Плитка', de: 'Fliesen', es: 'Alicatado' },
  plaster: { en: 'Plaster', uk: 'Штукатурка', de: 'Putz', es: 'Enlucido' },
  paint: { en: 'Painting', uk: 'Малярка', de: 'Malerarbeiten', es: 'Pintura' },
  drywall: { en: 'Drywall', uk: 'Гіпсокартон', de: 'Trockenbau', es: 'Pladur' },
  masonry: { en: 'Masonry', uk: 'Мурування', de: 'Mauerwerk', es: 'Albañilería' },
  concrete: { en: 'Concrete', uk: 'Бетон', de: 'Beton', es: 'Hormigón' },
  flooring: { en: 'Flooring', uk: 'Підлога', de: 'Bodenbelag', es: 'Suelos' },
  plumbing: { en: 'Plumbing', uk: 'Сантехніка', de: 'Sanitär', es: 'Fontanería' },
  electrical: { en: 'Electrical', uk: 'Електрика', de: 'Elektro', es: 'Electricidad' },
  roofing: { en: 'Roofing', uk: 'Покрівля', de: 'Dach', es: 'Cubierta' },
  insulation: { en: 'Insulation', uk: 'Утеплення', de: 'Dämmung', es: 'Aislamiento' },
  facade: { en: 'Facade', uk: 'Фасад', de: 'Fassade', es: 'Fachada' },
  demolition: { en: 'Demolition', uk: 'Демонтаж', de: 'Abbruch', es: 'Demolición' },
  doors_windows: { en: 'Doors & windows', uk: 'Двері / вікна', de: 'Türen & Fenster', es: 'Puertas y ventanas' },
  outdoor: { en: 'Outdoor', uk: 'Двір / вулиця', de: 'Außenanlagen', es: 'Exterior' },
  other: { en: 'Other', uk: 'Інше', de: 'Sonstiges', es: 'Otros' },
};

const COUNTRY_STORAGE_KEY = 'scblight_work_price_country';
const DEFAULT_COUNTRY: PriceCountryCode = 'DE';

export type WorkSearchHit = {
  work: CatalogWork;
  labor: CountryMoney;
  score: number;
};

export type WorkDetail = {
  work: CatalogWork;
  labor: CountryMoney;
  bom: Array<{
    material: CatalogMaterial;
    qtyPerUnit: number;
    notes?: string;
    unitPrice: CountryMoney;
    lineTotal: number;
  }>;
  buyLinks: Array<{
    supplier: CatalogSupplier;
    productUrl: string;
    materialName: string;
  }>;
  youtube: YoutubeLink[];
  catalogUpdatedAt: string;
};

export function isPriceCountry(value: string | null | undefined): value is PriceCountryCode {
  return value === 'DE' || value === 'UA' || value === 'ES';
}

export function getStoredPriceCountry(): PriceCountryCode {
  try {
    const raw = localStorage.getItem(COUNTRY_STORAGE_KEY);
    if (isPriceCountry(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_COUNTRY;
}

export function setStoredPriceCountry(code: PriceCountryCode): void {
  try {
    localStorage.setItem(COUNTRY_STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}

export function getPriceCountries() {
  return PRICE_COUNTRIES;
}

/** Normalize conversational queries: «120на 60», «120×60», spaces → 120x60 */
export function normalizePriceQuery(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[×хХxX]/g, 'x')
    .replace(/(\d)\s*на\s*(\d)/gi, '$1x$2')
    .replace(/(\d)\s*[x×]\s*(\d)/g, '$1x$2')
    .replace(/[^\p{L}\p{N}x]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(q: string): string[] {
  return normalizePriceQuery(q).split(' ').filter((t) => t.length > 1);
}

function scoreWork(work: CatalogWork, tokens: string[], rawNormalized: string): number {
  if (!tokens.length && !rawNormalized) return 0;

  const haystack = normalizePriceQuery(
    [
      work.slug,
      ...Object.values(work.names),
      ...work.searchAliases,
      work.category,
    ].join(' ')
  );

  let score = 0;
  if (rawNormalized && haystack.includes(rawNormalized)) score += 50;

  for (const token of tokens) {
    if (haystack.includes(token)) score += 10;
    else if (token.length >= 3 && haystack.split(' ').some((w) => w.startsWith(token))) score += 4;
  }

  // Prefer exact size matches (e.g. 120x60)
  const sizeMatch = rawNormalized.match(/\d+x\d+/);
  if (sizeMatch && haystack.includes(sizeMatch[0])) score += 25;

  return score;
}

function catalogMaterialsById(): Map<string, CatalogMaterial> {
  return new Map(CATALOG_MATERIALS.map((m) => [m.id, m]));
}

function catalogSuppliersById(): Map<string, CatalogSupplier> {
  return new Map(CATALOG_SUPPLIERS.map((s) => [s.id, s]));
}

export function searchWorksLocal(
  query: string,
  country: PriceCountryCode,
  limit = 120
): WorkSearchHit[] {
  const normalized = normalizePriceQuery(query);
  const tokens = tokenize(query);

  const hits: WorkSearchHit[] = CATALOG_WORKS.map((work) => {
    const score = normalized ? scoreWork(work, tokens, normalized) : 1;
    return { work, labor: work.labor[country], score };
  }).filter((h) => (normalized ? h.score > 0 : true));

  hits.sort((a, b) => b.score - a.score || a.work.names.en.localeCompare(b.work.names.en));
  return hits.slice(0, limit);
}

export function getWorkDetailLocal(workId: string, country: PriceCountryCode): WorkDetail | null {
  const work = CATALOG_WORKS.find((w) => w.id === workId || w.slug === workId);
  if (!work) return null;

  const materials = catalogMaterialsById();
  const suppliers = catalogSuppliersById();

  const bom = work.materials
    .map((row) => {
      const material = materials.get(row.materialId);
      if (!material) return null;
      const unitPrice = material.prices[country];
      return {
        material,
        qtyPerUnit: row.qtyPerUnit,
        notes: row.notes,
        unitPrice,
        lineTotal: Math.round(row.qtyPerUnit * unitPrice.price * 100) / 100,
      };
    })
    .filter(Boolean) as WorkDetail['bom'];

  const buyLinks: WorkDetail['buyLinks'] = [];
  const seen = new Set<string>();
  for (const row of bom) {
    const links = row.material.supplierLinks[country] || [];
    for (const link of links) {
      const key = `${link.supplierId}:${link.productUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const supplier = suppliers.get(link.supplierId);
      if (!supplier) continue;
      buyLinks.push({
        supplier,
        productUrl: link.productUrl,
        materialName: row.material.name.en,
      });
    }
  }

  // Cap buy links for MVP detail card
  const cappedBuy = buyLinks.slice(0, 6);

  return {
    work,
    labor: work.labor[country],
    bom,
    buyLinks: cappedBuy,
    youtube: work.youtube.slice(0, 4),
    catalogUpdatedAt: CATALOG_UPDATED_AT,
  };
}

export function formatMoney(amount: number, currency: string, locale = 'de-DE'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'UAH' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function localizedWorkName(work: CatalogWork, lang: string): string {
  if (lang === 'uk') return work.names.uk;
  if (lang === 'de') return work.names.de;
  if (lang === 'es') return work.names.es;
  return work.names.en;
}

export function localizedMaterialName(material: CatalogMaterial, lang: string): string {
  if (lang === 'uk') return material.name.uk;
  if (lang === 'de') return material.name.de;
  if (lang === 'es') return material.name.es;
  return material.name.en;
}

export function localizedCountryName(code: PriceCountryCode, lang: string): string {
  const c = PRICE_COUNTRIES.find((x) => x.code === code);
  if (!c) return code;
  if (lang === 'uk') return c.name.uk;
  if (lang === 'de') return c.name.de;
  if (lang === 'es') return c.name.es;
  return c.name.en;
}

export function localizedCategoryName(category: WorkCategory | string, lang: string): string {
  const labels = CATEGORY_LABELS[category as WorkCategory];
  if (!labels) return category;
  if (lang === 'uk') return labels.uk;
  if (lang === 'de') return labels.de;
  if (lang === 'es') return labels.es;
  return labels.en;
}

/**
 * Load catalog works for a country.
 * Tries Supabase `works` / `work_prices` when available; falls back to curated local seed.
 */
export async function loadWorksForCountry(country: PriceCountryCode): Promise<{
  source: 'supabase' | 'local';
  works: CatalogWork[];
  updatedAt: string;
}> {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('work_prices')
      .select('work_id, labor_price, labor_currency, price_min, price_max, updated_at, works(*)')
      .eq('country_code', country)
      .or('valid_to.is.null,valid_to.gte.' + new Date().toISOString().slice(0, 10));

    if (!error && data && data.length > 0) {
      // Remote schema present — MVP still uses local seed for full BOM/YouTube
      // until admin sync lands. Keep probe for future switch-over.
      void data;
    }
  } catch {
    /* tables may not exist yet */
  }

  return {
    source: 'local',
    works: CATALOG_WORKS,
    updatedAt: CATALOG_UPDATED_AT,
  };
}

export function catalogStats() {
  return {
    works: CATALOG_WORKS.length,
    materials: CATALOG_MATERIALS.length,
    suppliers: CATALOG_SUPPLIERS.length,
    countries: PRICE_COUNTRIES.map((c) => c.code),
    updatedAt: CATALOG_UPDATED_AT,
    byCategory: catalogWorksByCategory(),
    allHaveYoutube: CATALOG_WORKS.every((w) => w.youtube.length > 0),
  };
}
