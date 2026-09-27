/**
 * Curated price catalog bootstrap (DE / UA / ES).
 * Source of truth for MVP until Supabase migration is applied;
 * mirrors schema in supabase/migrations/*_create_price_catalog.sql
 */

export type PriceCountryCode = 'DE' | 'UA' | 'ES';

export type LocalizedName = {
  en: string;
  uk: string;
  de: string;
  es: string;
};

export type YoutubeLink = {
  url: string;
  title: string;
  lang: string;
};

export type CountryMoney = {
  price: number;
  currency: string;
  min?: number;
  max?: number;
  updatedAt: string;
  source?: string;
};

export type CatalogSupplier = {
  id: string;
  countryCode: PriceCountryCode;
  name: string;
  url: string;
  notes?: string;
};

export type CatalogMaterial = {
  id: string;
  name: LocalizedName;
  unit: string;
  aliases: string[];
  prices: Record<PriceCountryCode, CountryMoney>;
  /** supplier id → optional product deep link */
  supplierLinks: Partial<
    Record<PriceCountryCode, Array<{ supplierId: string; productUrl: string }>>
  >;
};

export type CatalogWork = {
  id: string;
  slug: string;
  category: 'tiling' | 'plaster' | 'paint' | 'drywall' | 'other';
  unit: string;
  names: LocalizedName;
  searchAliases: string[];
  youtube: YoutubeLink[];
  labor: Record<PriceCountryCode, CountryMoney>;
  materials: Array<{ materialId: string; qtyPerUnit: number; notes?: string }>;
};

export const PRICE_COUNTRIES: Array<{
  code: PriceCountryCode;
  name: LocalizedName;
  currency: string;
  locale: string;
}> = [
  {
    code: 'DE',
    name: { en: 'Germany', uk: 'Німеччина', de: 'Deutschland', es: 'Alemania' },
    currency: 'EUR',
    locale: 'de-DE',
  },
  {
    code: 'UA',
    name: { en: 'Ukraine', uk: 'Україна', de: 'Ukraine', es: 'Ucrania' },
    currency: 'UAH',
    locale: 'uk-UA',
  },
  {
    code: 'ES',
    name: { en: 'Spain', uk: 'Іспанія', de: 'Spanien', es: 'España' },
    currency: 'EUR',
    locale: 'es-ES',
  },
];

const UPDATED = '2026-09-01';

export const CATALOG_SUPPLIERS: CatalogSupplier[] = [
  { id: 'sup-de-hornbach', countryCode: 'DE', name: 'Hornbach', url: 'https://www.hornbach.de/' },
  { id: 'sup-de-obi', countryCode: 'DE', name: 'OBI', url: 'https://www.obi.de/' },
  { id: 'sup-ua-epicentr', countryCode: 'UA', name: 'Епіцентр', url: 'https://epicentrk.ua/' },
  { id: 'sup-ua-leroy', countryCode: 'UA', name: 'Leroy Merlin UA', url: 'https://leroymerlin.ua/' },
  { id: 'sup-es-leroy', countryCode: 'ES', name: 'Leroy Merlin', url: 'https://www.leroymerlin.es/' },
  { id: 'sup-es-bauhaus', countryCode: 'ES', name: 'Bauhaus', url: 'https://www.bauhaus.es/' },
];

function money(
  de: number,
  ua: number,
  es: number,
  opts?: { deMinMax?: [number, number]; uaMinMax?: [number, number]; esMinMax?: [number, number] }
): Record<PriceCountryCode, CountryMoney> {
  return {
    DE: {
      price: de,
      currency: 'EUR',
      min: opts?.deMinMax?.[0],
      max: opts?.deMinMax?.[1],
      updatedAt: UPDATED,
      source: 'curated',
    },
    UA: {
      price: ua,
      currency: 'UAH',
      min: opts?.uaMinMax?.[0],
      max: opts?.uaMinMax?.[1],
      updatedAt: UPDATED,
      source: 'curated',
    },
    ES: {
      price: es,
      currency: 'EUR',
      min: opts?.esMinMax?.[0],
      max: opts?.esMinMax?.[1],
      updatedAt: UPDATED,
      source: 'curated',
    },
  };
}

function matLinks(
  dePath: string,
  uaPath: string,
  esPath: string
): CatalogMaterial['supplierLinks'] {
  return {
    DE: [
      { supplierId: 'sup-de-hornbach', productUrl: `https://www.hornbach.de/${dePath}` },
      { supplierId: 'sup-de-obi', productUrl: `https://www.obi.de/search/${encodeURIComponent(dePath)}` },
    ],
    UA: [
      { supplierId: 'sup-ua-epicentr', productUrl: `https://epicentrk.ua/ua/search/?q=${encodeURIComponent(uaPath)}` },
      { supplierId: 'sup-ua-leroy', productUrl: `https://leroymerlin.ua/search/?q=${encodeURIComponent(uaPath)}` },
    ],
    ES: [
      { supplierId: 'sup-es-leroy', productUrl: `https://www.leroymerlin.es/search?q=${encodeURIComponent(esPath)}` },
      { supplierId: 'sup-es-bauhaus', productUrl: `https://www.bauhaus.es/buscar?q=${encodeURIComponent(esPath)}` },
    ],
  };
}

export const CATALOG_MATERIALS: CatalogMaterial[] = [
  {
    id: 'mat-tile-120x60',
    name: {
      en: 'Porcelain tile 120×60',
      uk: 'Керамограніт 120×60',
      de: 'Feinsteinzeug 120×60',
      es: 'Gres porcelánico 120×60',
    },
    unit: 'm2',
    aliases: ['плитка 120x60', '120на60', 'fliesen 120x60', 'baldosa 120x60'],
    prices: money(38, 890, 32),
    supplierLinks: matLinks('fliesen-120x60', 'плитка 120x60', 'azulejo 120x60'),
  },
  {
    id: 'mat-tile-60x60',
    name: {
      en: 'Porcelain tile 60×60',
      uk: 'Керамограніт 60×60',
      de: 'Feinsteinzeug 60×60',
      es: 'Gres porcelánico 60×60',
    },
    unit: 'm2',
    aliases: ['плитка 60x60', 'fliesen 60x60'],
    prices: money(28, 620, 24),
    supplierLinks: matLinks('fliesen-60x60', 'плитка 60x60', 'azulejo 60x60'),
  },
  {
    id: 'mat-tile-30x60',
    name: {
      en: 'Ceramic tile 30×60',
      uk: 'Керамічна плитка 30×60',
      de: 'Keramikfliese 30×60',
      es: 'Azulejo 30×60',
    },
    unit: 'm2',
    aliases: ['плитка 30x60', 'fliesen 30x60'],
    prices: money(22, 480, 18),
    supplierLinks: matLinks('fliesen-30x60', 'плитка 30x60', 'azulejo 30x60'),
  },
  {
    id: 'mat-adhesive-c2',
    name: {
      en: 'Tile adhesive C2',
      uk: 'Клей для плитки C2',
      de: 'Fliesenkleber C2',
      es: 'Cemento cola C2',
    },
    unit: 'kg',
    aliases: ['клей c2', 'fliesenkleber', 'cemento cola'],
    prices: money(0.85, 18, 0.75),
    supplierLinks: matLinks('fliesenkleber-c2', 'клей плитка C2', 'cemento cola C2'),
  },
  {
    id: 'mat-grout',
    name: {
      en: 'Tile grout',
      uk: 'Фуга / затирка',
      de: 'Fugenmörtel',
      es: 'Lechada / junta',
    },
    unit: 'kg',
    aliases: ['фуга', 'затирка', 'fugenmörtel', 'lechada'],
    prices: money(4.5, 95, 3.8),
    supplierLinks: matLinks('fugenmoertel', 'затирка', 'lechada junta'),
  },
  {
    id: 'mat-primer',
    name: {
      en: 'Primer / bonding agent',
      uk: 'Ґрунт / праймер',
      de: 'Grundierung',
      es: 'Imprimación',
    },
    unit: 'l',
    aliases: ['грунт', 'праймер', 'grundierung', 'imprimacion'],
    prices: money(6.5, 140, 5.5),
    supplierLinks: matLinks('grundierung', 'грунт', 'imprimacion'),
  },
  {
    id: 'mat-spacers',
    name: {
      en: 'Tile spacers',
      uk: 'Хрестики для плитки',
      de: 'Fliesenkreuze',
      es: 'Crucetas',
    },
    unit: 'pcs',
    aliases: ['хрестики', 'fliesenkreuze', 'crucetas'],
    prices: money(0.02, 0.5, 0.02),
    supplierLinks: matLinks('fliesenkreuze', 'хрестики плитка', 'crucetas'),
  },
  {
    id: 'mat-waterproof',
    name: {
      en: 'Waterproofing membrane',
      uk: 'Гідроізоляція',
      de: 'Abdichtung',
      es: 'Impermeabilizante',
    },
    unit: 'm2',
    aliases: ['гідроізоляція', 'abdichtung', 'impermeabilizante'],
    prices: money(12, 280, 10),
    supplierLinks: matLinks('abdichtung', 'гідроізоляція', 'impermeabilizante'),
  },
  {
    id: 'mat-gypsum-plaster',
    name: {
      en: 'Gypsum plaster',
      uk: 'Гіпсова штукатурка',
      de: 'Gipsputz',
      es: 'Yeso / escayola',
    },
    unit: 'kg',
    aliases: ['гіпс', 'штукатурка', 'gipsputz', 'yeso'],
    prices: money(0.45, 9, 0.4),
    supplierLinks: matLinks('gipsputz', 'гіпсова штукатурка', 'yeso'),
  },
  {
    id: 'mat-cement-plaster',
    name: {
      en: 'Cement plaster',
      uk: 'Цементна штукатурка',
      de: 'Zementputz',
      es: 'Mortero de cemento',
    },
    unit: 'kg',
    aliases: ['цементна штукатурка', 'zementputz', 'mortero'],
    prices: money(0.35, 7, 0.3),
    supplierLinks: matLinks('zementputz', 'цементна штукатурка', 'mortero cemento'),
  },
  {
    id: 'mat-skim-coat',
    name: {
      en: 'Skim coat / finishing putty',
      uk: 'Фінішна шпаклівка',
      de: 'Feinspachtel',
      es: 'Pasta de acabado',
    },
    unit: 'kg',
    aliases: ['шпаклівка', 'feinspachtel', 'pasta acabado'],
    prices: money(1.2, 28, 1.0),
    supplierLinks: matLinks('feinspachtel', 'шпаклівка', 'pasta acabado'),
  },
  {
    id: 'mat-interior-paint',
    name: {
      en: 'Interior wall paint',
      uk: 'Фарба інтер\'єрна',
      de: 'Innenfarbe',
      es: 'Pintura interior',
    },
    unit: 'l',
    aliases: ['фарба', 'innenfarbe', 'pintura'],
    prices: money(4.8, 110, 4.2),
    supplierLinks: matLinks('innenfarbe', 'фарба інтерєрна', 'pintura interior'),
  },
  {
    id: 'mat-exterior-paint',
    name: {
      en: 'Facade paint',
      uk: 'Фасадна фарба',
      de: 'Fassadenfarbe',
      es: 'Pintura de fachada',
    },
    unit: 'l',
    aliases: ['фасадна фарба', 'fassadenfarbe', 'pintura fachada'],
    prices: money(7.5, 175, 6.5),
    supplierLinks: matLinks('fassadenfarbe', 'фасадна фарба', 'pintura fachada'),
  },
  {
    id: 'mat-paint-roller',
    name: {
      en: 'Paint roller set',
      uk: 'Валик малярний',
      de: 'Farbroller',
      es: 'Rodillo de pintura',
    },
    unit: 'pcs',
    aliases: ['валик', 'farbroller', 'rodillo'],
    prices: money(8, 180, 7),
    supplierLinks: matLinks('farbroller', 'валик', 'rodillo pintura'),
  },
  {
    id: 'mat-drywall-board',
    name: {
      en: 'Drywall board 12.5 mm',
      uk: 'Гіпсокартон 12.5 мм',
      de: 'Gipskartonplatte 12,5 mm',
      es: 'Placa yeso laminado 12,5 mm',
    },
    unit: 'm2',
    aliases: ['гіпсокартон', 'gipskarton', 'pladur'],
    prices: money(4.2, 95, 3.5),
    supplierLinks: matLinks('gipskartonplatte', 'гіпсокартон', 'placa yeso'),
  },
  {
    id: 'mat-drywall-profile',
    name: {
      en: 'Metal stud profile',
      uk: 'Профіль для ГКЛ',
      de: 'CW/UW Profil',
      es: 'Perfil metálico',
    },
    unit: 'lm',
    aliases: ['профіль', 'cw profil', 'perfil'],
    prices: money(2.8, 65, 2.4),
    supplierLinks: matLinks('cw-profil', 'профіль гкл', 'perfil metalico'),
  },
  {
    id: 'mat-joint-compound',
    name: {
      en: 'Joint compound',
      uk: 'Шпаклівка для швів ГКЛ',
      de: 'Fugenspachtel',
      es: 'Pasta de juntas',
    },
    unit: 'kg',
    aliases: ['шовна шпаклівка', 'fugenspachtel', 'pasta juntas'],
    prices: money(1.1, 25, 0.95),
    supplierLinks: matLinks('fugenspachtel', 'шпаклівка швів', 'pasta juntas'),
  },
  {
    id: 'mat-silicone',
    name: {
      en: 'Sanitary silicone',
      uk: 'Санітарний силікон',
      de: 'Sanitärsilikon',
      es: 'Silicona sanitaria',
    },
    unit: 'pcs',
    aliases: ['силікон', 'sanitärsilikon', 'silicona'],
    prices: money(6.5, 145, 5.5),
    supplierLinks: matLinks('sanitaersilikon', 'силікон', 'silicona sanitaria'),
  },
  {
    id: 'mat-screed',
    name: {
      en: 'Floor screed mix',
      uk: 'Суміш для стяжки',
      de: 'Estrichmörtel',
      es: 'Mortero de solera',
    },
    unit: 'kg',
    aliases: ['стяжка', 'estrich', 'solera'],
    prices: money(0.28, 6, 0.25),
    supplierLinks: matLinks('estrichmoertel', 'стяжка', 'mortero solera'),
  },
  {
    id: 'mat-mesh',
    name: {
      en: 'Reinforcing mesh',
      uk: 'Армуюча сітка',
      de: 'Armierungsgewebe',
      es: 'Malla de refuerzo',
    },
    unit: 'm2',
    aliases: ['сітка', 'armierungsgewebe', 'malla'],
    prices: money(1.8, 42, 1.5),
    supplierLinks: matLinks('armierungsgewebe', 'армуюча сітка', 'malla refuerzo'),
  },
];

/** Curated topic links (YouTube search) — replace with fixed video IDs after editorial review */
const YT = {
  tileDe: {
    url: 'https://www.youtube.com/results?search_query=Gro%C3%9Fformat+Fliesen+verlegen',
    title: 'Großformat Fliesen verlegen',
    lang: 'de',
  },
  tileUk: {
    url: 'https://www.youtube.com/results?search_query=%D1%83%D0%BA%D0%BB%D0%B0%D0%B4%D0%B0%D0%BD%D0%BD%D1%8F+%D0%BF%D0%BB%D0%B8%D1%82%D0%BA%D0%B8+120x60',
    title: 'Укладання плитки 120×60',
    lang: 'uk',
  },
  tileEs: {
    url: 'https://www.youtube.com/results?search_query=colocar+azulejos+gran+formato',
    title: 'Colocar azulejos de gran formato',
    lang: 'es',
  },
  plasterDe: {
    url: 'https://www.youtube.com/results?search_query=Gipsputz+richtig+auftragen',
    title: 'Gipsputz richtig auftragen',
    lang: 'de',
  },
  plasterUk: {
    url: 'https://www.youtube.com/results?search_query=%D1%88%D1%82%D1%83%D0%BA%D0%B0%D1%82%D1%83%D1%80%D0%BA%D0%B0+%D1%81%D1%82%D1%96%D0%BD+%D0%B3%D1%96%D0%BF%D1%81',
    title: 'Штукатурка стін гіпсом',
    lang: 'uk',
  },
  paintDe: {
    url: 'https://www.youtube.com/results?search_query=W%C3%A4nde+streichen+Profi+Tipps',
    title: 'Wände streichen – Profi-Tipps',
    lang: 'de',
  },
  paintUk: {
    url: 'https://www.youtube.com/results?search_query=%D1%84%D0%B0%D1%80%D0%B1%D1%83%D0%B2%D0%B0%D0%BD%D0%BD%D1%8F+%D1%81%D1%82%D1%96%D0%BD+%D1%82%D0%B5%D1%85%D0%BD%D1%96%D0%BA%D0%B0',
    title: 'Фарбування стін — техніка',
    lang: 'uk',
  },
  drywallDe: {
    url: 'https://www.youtube.com/results?search_query=Trockenbau+Wand+aufbauen',
    title: 'Trockenbau Wand aufbauen',
    lang: 'de',
  },
};

function work(
  partial: Omit<CatalogWork, 'labor'> & {
    laborPrices: [number, number, number];
    laborRanges?: {
      de?: [number, number];
      ua?: [number, number];
      es?: [number, number];
    };
  }
): CatalogWork {
  const [de, ua, es] = partial.laborPrices;
  const { laborPrices: _lp, laborRanges, ...rest } = partial;
  return {
    ...rest,
    labor: money(de, ua, es, {
      deMinMax: laborRanges?.de,
      uaMinMax: laborRanges?.ua,
      esMinMax: laborRanges?.es,
    }),
  };
}

export const CATALOG_WORKS: CatalogWork[] = [
  work({
    id: 'work-tile-120x60',
    slug: 'tile-laying-120x60',
    category: 'tiling',
    unit: 'm2',
    names: {
      en: 'Tile laying 120×60',
      uk: 'Укладання плитки 120×60',
      de: 'Fliesenverlegung 120×60',
      es: 'Colocación de azulejos 120×60',
    },
    searchAliases: [
      'вкладання плитки формат 120на 60',
      'укладання плитки 120x60',
      'плитка 120на60',
      'плитка 120 x 60',
      'fliesen 120x60',
      'großformat fliesen',
      'grossformat fliesen verlegen',
      'azulejos 120x60',
      'baldosa 120x60',
      'tiling 120x60',
      'large format tile',
    ],
    youtube: [YT.tileDe, YT.tileUk, YT.tileEs],
    laborPrices: [45, 550, 35],
    laborRanges: { de: [35, 55], ua: [400, 700], es: [25, 45] },
    materials: [
      { materialId: 'mat-tile-120x60', qtyPerUnit: 1.05, notes: '+5% waste' },
      { materialId: 'mat-adhesive-c2', qtyPerUnit: 5 },
      { materialId: 'mat-grout', qtyPerUnit: 0.4 },
      { materialId: 'mat-primer', qtyPerUnit: 0.15 },
      { materialId: 'mat-spacers', qtyPerUnit: 25 },
    ],
  }),
  work({
    id: 'work-tile-60x60',
    slug: 'tile-laying-60x60',
    category: 'tiling',
    unit: 'm2',
    names: {
      en: 'Tile laying 60×60',
      uk: 'Укладання плитки 60×60',
      de: 'Fliesenverlegung 60×60',
      es: 'Colocación de azulejos 60×60',
    },
    searchAliases: ['плитка 60x60', 'fliesen 60x60', 'azulejos 60x60', 'tile 60x60'],
    youtube: [YT.tileDe, YT.tileUk],
    laborPrices: [38, 480, 30],
    laborRanges: { de: [30, 48], ua: [350, 600], es: [22, 40] },
    materials: [
      { materialId: 'mat-tile-60x60', qtyPerUnit: 1.08 },
      { materialId: 'mat-adhesive-c2', qtyPerUnit: 4.5 },
      { materialId: 'mat-grout', qtyPerUnit: 0.5 },
      { materialId: 'mat-primer', qtyPerUnit: 0.15 },
      { materialId: 'mat-spacers', qtyPerUnit: 30 },
    ],
  }),
  work({
    id: 'work-tile-30x60',
    slug: 'tile-laying-30x60',
    category: 'tiling',
    unit: 'm2',
    names: {
      en: 'Tile laying 30×60',
      uk: 'Укладання плитки 30×60',
      de: 'Fliesenverlegung 30×60',
      es: 'Colocación de azulejos 30×60',
    },
    searchAliases: ['плитка 30x60', 'fliesen 30x60', 'wall tile', 'стінова плитка'],
    youtube: [YT.tileUk, YT.tileEs],
    laborPrices: [42, 520, 32],
    laborRanges: { de: [32, 52], ua: [380, 650], es: [24, 42] },
    materials: [
      { materialId: 'mat-tile-30x60', qtyPerUnit: 1.1 },
      { materialId: 'mat-adhesive-c2', qtyPerUnit: 4 },
      { materialId: 'mat-grout', qtyPerUnit: 0.6 },
      { materialId: 'mat-primer', qtyPerUnit: 0.15 },
    ],
  }),
  work({
    id: 'work-tile-bathroom-wall',
    slug: 'bathroom-wall-tiling',
    category: 'tiling',
    unit: 'm2',
    names: {
      en: 'Bathroom wall tiling',
      uk: 'Плитка у ванній (стіни)',
      de: 'Bad Wandfliesen',
      es: 'Alicatado baño (paredes)',
    },
    searchAliases: ['плитка ванна', 'bad fliesen', 'baño azulejos', 'bathroom tile'],
    youtube: [YT.tileDe, YT.tileUk],
    laborPrices: [48, 600, 38],
    laborRanges: { de: [38, 60], ua: [450, 750], es: [28, 48] },
    materials: [
      { materialId: 'mat-tile-30x60', qtyPerUnit: 1.1 },
      { materialId: 'mat-waterproof', qtyPerUnit: 1.05 },
      { materialId: 'mat-adhesive-c2', qtyPerUnit: 4 },
      { materialId: 'mat-grout', qtyPerUnit: 0.55 },
      { materialId: 'mat-silicone', qtyPerUnit: 0.05 },
    ],
  }),
  work({
    id: 'work-tile-floor',
    slug: 'floor-tiling',
    category: 'tiling',
    unit: 'm2',
    names: {
      en: 'Floor tiling',
      uk: 'Укладання підлогової плитки',
      de: 'Bodenfliesen verlegen',
      es: 'Solado cerámico',
    },
    searchAliases: ['підлога плитка', 'bodenfliesen', 'suelo azulejo', 'floor tile'],
    youtube: [YT.tileDe, YT.tileEs],
    laborPrices: [40, 500, 32],
    laborRanges: { de: [32, 50], ua: [380, 620], es: [24, 42] },
    materials: [
      { materialId: 'mat-tile-60x60', qtyPerUnit: 1.08 },
      { materialId: 'mat-adhesive-c2', qtyPerUnit: 5 },
      { materialId: 'mat-grout', qtyPerUnit: 0.5 },
      { materialId: 'mat-primer', qtyPerUnit: 0.2 },
    ],
  }),
  work({
    id: 'work-tile-terrace',
    slug: 'outdoor-terrace-tiling',
    category: 'tiling',
    unit: 'm2',
    names: {
      en: 'Outdoor terrace tiling',
      uk: 'Плитка на терасу / вулицю',
      de: 'Terrassenfliesen',
      es: 'Solado terraza exterior',
    },
    searchAliases: ['тераса плитка', 'terrassenfliesen', 'terraza azulejo', 'outdoor tile'],
    youtube: [YT.tileDe, YT.tileEs],
    laborPrices: [52, 650, 42],
    laborRanges: { de: [42, 65], ua: [500, 800], es: [32, 55] },
    materials: [
      { materialId: 'mat-tile-60x60', qtyPerUnit: 1.1 },
      { materialId: 'mat-adhesive-c2', qtyPerUnit: 5.5 },
      { materialId: 'mat-grout', qtyPerUnit: 0.55 },
      { materialId: 'mat-waterproof', qtyPerUnit: 1 },
    ],
  }),
  work({
    id: 'work-tile-grouting',
    slug: 'tile-grouting',
    category: 'tiling',
    unit: 'm2',
    names: {
      en: 'Tile grouting',
      uk: 'Затирка швів плитки',
      de: 'Fliesen verfugen',
      es: 'Rejuntado de azulejos',
    },
    searchAliases: ['затирка', 'фугування', 'verfugen', 'rejuntado', 'grouting'],
    youtube: [YT.tileUk],
    laborPrices: [12, 150, 10],
    laborRanges: { de: [8, 16], ua: [100, 200], es: [7, 14] },
    materials: [{ materialId: 'mat-grout', qtyPerUnit: 0.5 }],
  }),
  work({
    id: 'work-tile-removal',
    slug: 'tile-removal',
    category: 'tiling',
    unit: 'm2',
    names: {
      en: 'Old tile removal',
      uk: 'Демонтаж старої плитки',
      de: 'Fliesen entfernen',
      es: 'Demolición de azulejos',
    },
    searchAliases: ['демонтаж плитки', 'fliesen entfernen', 'quitar azulejos', 'tile removal'],
    youtube: [YT.tileDe],
    laborPrices: [28, 320, 22],
    laborRanges: { de: [20, 35], ua: [250, 400], es: [16, 30] },
    materials: [],
  }),
  work({
    id: 'work-waterproofing',
    slug: 'bathroom-waterproofing',
    category: 'tiling',
    unit: 'm2',
    names: {
      en: 'Bathroom waterproofing',
      uk: 'Гідроізоляція ванної',
      de: 'Bad Abdichtung',
      es: 'Impermeabilización baño',
    },
    searchAliases: ['гідроізоляція', 'abdichtung bad', 'impermeabilizacion', 'waterproofing'],
    youtube: [YT.tileUk, YT.tileDe],
    laborPrices: [22, 280, 18],
    laborRanges: { de: [16, 28], ua: [200, 350], es: [14, 24] },
    materials: [
      { materialId: 'mat-waterproof', qtyPerUnit: 1.1 },
      { materialId: 'mat-primer', qtyPerUnit: 0.2 },
      { materialId: 'mat-mesh', qtyPerUnit: 0.3 },
    ],
  }),
  work({
    id: 'work-silicone-seal',
    slug: 'silicone-sealing',
    category: 'tiling',
    unit: 'lm',
    names: {
      en: 'Silicone sealing',
      uk: 'Герметизація силіконом',
      de: 'Silikonfugen',
      es: 'Sellado con silicona',
    },
    searchAliases: ['силікон', 'silikonfuge', 'silicona', 'hermetic'],
    youtube: [YT.tileUk],
    laborPrices: [8, 90, 6.5],
    laborRanges: { de: [5, 12], ua: [60, 120], es: [4, 10] },
    materials: [{ materialId: 'mat-silicone', qtyPerUnit: 0.15 }],
  }),
  work({
    id: 'work-gypsum-plaster',
    slug: 'gypsum-plaster-walls',
    category: 'plaster',
    unit: 'm2',
    names: {
      en: 'Gypsum plaster (walls)',
      uk: 'Гіпсова штукатурка стін',
      de: 'Gipsputz Wände',
      es: 'Enlucido de yeso',
    },
    searchAliases: [
      'штукатурка',
      'гіпсова штукатурка',
      'gipsputz',
      'putz',
      'enlucido',
      'yeso',
      'plaster walls',
    ],
    youtube: [YT.plasterDe, YT.plasterUk],
    laborPrices: [18, 220, 14],
    laborRanges: { de: [14, 24], ua: [160, 280], es: [10, 20] },
    materials: [
      { materialId: 'mat-gypsum-plaster', qtyPerUnit: 12 },
      { materialId: 'mat-primer', qtyPerUnit: 0.15 },
    ],
  }),
  work({
    id: 'work-cement-plaster',
    slug: 'cement-plaster-exterior',
    category: 'plaster',
    unit: 'm2',
    names: {
      en: 'Cement plaster (exterior)',
      uk: 'Цементна штукатурка (фасад)',
      de: 'Zementputz Fassade',
      es: 'Enfoscado de cemento',
    },
    searchAliases: ['цементна штукатурка', 'zementputz', 'enfoscado', 'facade plaster'],
    youtube: [YT.plasterDe],
    laborPrices: [24, 300, 18],
    laborRanges: { de: [18, 32], ua: [220, 380], es: [14, 26] },
    materials: [
      { materialId: 'mat-cement-plaster', qtyPerUnit: 15 },
      { materialId: 'mat-mesh', qtyPerUnit: 1.05 },
      { materialId: 'mat-primer', qtyPerUnit: 0.2 },
    ],
  }),
  work({
    id: 'work-machine-plaster',
    slug: 'machine-plaster',
    category: 'plaster',
    unit: 'm2',
    names: {
      en: 'Machine-applied plaster',
      uk: 'Машинна штукатурка',
      de: 'Maschinenputz',
      es: 'Yeso proyectado',
    },
    searchAliases: ['машинна штукатурка', 'maschinenputz', 'yeso proyectado'],
    youtube: [YT.plasterDe, YT.plasterUk],
    laborPrices: [14, 180, 12],
    laborRanges: { de: [10, 18], ua: [140, 230], es: [9, 16] },
    materials: [
      { materialId: 'mat-gypsum-plaster', qtyPerUnit: 10 },
      { materialId: 'mat-primer', qtyPerUnit: 0.12 },
    ],
  }),
  work({
    id: 'work-plaster-repair',
    slug: 'plaster-patch-repair',
    category: 'plaster',
    unit: 'm2',
    names: {
      en: 'Plaster patch repair',
      uk: 'Ремонт штукатурки (плями)',
      de: 'Putzreparatur',
      es: 'Reparación de enlucido',
    },
    searchAliases: ['ремонт штукатурки', 'putzreparatur', 'reparacion yeso'],
    youtube: [YT.plasterUk],
    laborPrices: [32, 400, 26],
    laborRanges: { de: [25, 40], ua: [300, 500], es: [20, 35] },
    materials: [
      { materialId: 'mat-gypsum-plaster', qtyPerUnit: 8 },
      { materialId: 'mat-skim-coat', qtyPerUnit: 2 },
      { materialId: 'mat-primer', qtyPerUnit: 0.2 },
    ],
  }),
  work({
    id: 'work-skim-coat',
    slug: 'skim-coat-finish',
    category: 'plaster',
    unit: 'm2',
    names: {
      en: 'Skim coat / finishing putty',
      uk: 'Фінішна шпаклівка',
      de: 'Feinspachtelung',
      es: 'Enlucido fino / pasta',
    },
    searchAliases: ['шпаклівка', 'фініш', 'feinspachtel', 'pasta acabado', 'skim coat'],
    youtube: [YT.plasterUk, YT.plasterDe],
    laborPrices: [12, 160, 10],
    laborRanges: { de: [9, 16], ua: [120, 200], es: [7, 14] },
    materials: [
      { materialId: 'mat-skim-coat', qtyPerUnit: 1.5 },
      { materialId: 'mat-primer', qtyPerUnit: 0.1 },
    ],
  }),
  work({
    id: 'work-decorative-plaster',
    slug: 'decorative-plaster',
    category: 'plaster',
    unit: 'm2',
    names: {
      en: 'Decorative plaster',
      uk: 'Декоративна штукатурка',
      de: 'Dekorputz',
      es: 'Estuco decorativo',
    },
    searchAliases: ['декоративна штукатурка', 'dekorputz', 'estuco', 'venetian'],
    youtube: [YT.plasterDe],
    laborPrices: [35, 450, 28],
    laborRanges: { de: [28, 45], ua: [350, 550], es: [22, 38] },
    materials: [
      { materialId: 'mat-cement-plaster', qtyPerUnit: 4 },
      { materialId: 'mat-primer', qtyPerUnit: 0.2 },
    ],
  }),
  work({
    id: 'work-paint-interior',
    slug: 'interior-wall-painting',
    category: 'paint',
    unit: 'm2',
    names: {
      en: 'Interior wall painting',
      uk: 'Фарбування стін (інтер\'єр)',
      de: 'Innenwände streichen',
      es: 'Pintura interior de paredes',
    },
    searchAliases: [
      'фарбування',
      'малярка',
      'streichen',
      'innenfarbe',
      'pintura paredes',
      'paint walls',
      'painting',
    ],
    youtube: [YT.paintDe, YT.paintUk],
    laborPrices: [10, 130, 8],
    laborRanges: { de: [7, 14], ua: [90, 170], es: [6, 12] },
    materials: [
      { materialId: 'mat-interior-paint', qtyPerUnit: 0.25 },
      { materialId: 'mat-primer', qtyPerUnit: 0.12 },
      { materialId: 'mat-paint-roller', qtyPerUnit: 0.02 },
    ],
  }),
  work({
    id: 'work-paint-ceiling',
    slug: 'ceiling-painting',
    category: 'paint',
    unit: 'm2',
    names: {
      en: 'Ceiling painting',
      uk: 'Фарбування стелі',
      de: 'Decke streichen',
      es: 'Pintura de techo',
    },
    searchAliases: ['стеля фарба', 'decke streichen', 'pintura techo', 'ceiling paint'],
    youtube: [YT.paintDe, YT.paintUk],
    laborPrices: [12, 150, 10],
    laborRanges: { de: [9, 16], ua: [110, 190], es: [7, 14] },
    materials: [
      { materialId: 'mat-interior-paint', qtyPerUnit: 0.22 },
      { materialId: 'mat-primer', qtyPerUnit: 0.1 },
    ],
  }),
  work({
    id: 'work-paint-facade',
    slug: 'facade-painting',
    category: 'paint',
    unit: 'm2',
    names: {
      en: 'Facade painting',
      uk: 'Фарбування фасаду',
      de: 'Fassade streichen',
      es: 'Pintura de fachada',
    },
    searchAliases: ['фасад фарба', 'fassade streichen', 'pintura fachada', 'exterior paint'],
    youtube: [YT.paintDe],
    laborPrices: [16, 200, 13],
    laborRanges: { de: [12, 22], ua: [150, 260], es: [10, 18] },
    materials: [
      { materialId: 'mat-exterior-paint', qtyPerUnit: 0.3 },
      { materialId: 'mat-primer', qtyPerUnit: 0.15 },
    ],
  }),
  work({
    id: 'work-paint-wood',
    slug: 'wood-painting',
    category: 'paint',
    unit: 'm2',
    names: {
      en: 'Wood painting / varnish',
      uk: 'Фарбування дерева',
      de: 'Holz streichen',
      es: 'Pintura de madera',
    },
    searchAliases: ['дерево фарба', 'holz streichen', 'pintura madera'],
    youtube: [YT.paintUk],
    laborPrices: [18, 220, 14],
    laborRanges: { de: [14, 24], ua: [160, 280], es: [10, 20] },
    materials: [
      { materialId: 'mat-interior-paint', qtyPerUnit: 0.2 },
      { materialId: 'mat-primer', qtyPerUnit: 0.1 },
    ],
  }),
  work({
    id: 'work-primer-only',
    slug: 'primer-application',
    category: 'paint',
    unit: 'm2',
    names: {
      en: 'Primer application',
      uk: 'Нанесення ґрунту',
      de: 'Grundierung auftragen',
      es: 'Aplicar imprimación',
    },
    searchAliases: ['грунтування', 'grundierung', 'imprimacion', 'primer'],
    youtube: [YT.paintDe],
    laborPrices: [4, 50, 3.5],
    laborRanges: { de: [3, 6], ua: [35, 70], es: [2.5, 5] },
    materials: [{ materialId: 'mat-primer', qtyPerUnit: 0.15 }],
  }),
  work({
    id: 'work-wallpaper-remove-paint',
    slug: 'wallpaper-remove-and-paint',
    category: 'paint',
    unit: 'm2',
    names: {
      en: 'Wallpaper removal + paint',
      uk: 'Зняття шпалер + фарбування',
      de: 'Tapete entfernen + streichen',
      es: 'Quitar papel + pintar',
    },
    searchAliases: ['шпалери зняти', 'tapete entfernen', 'quitar papel', 'wallpaper remove'],
    youtube: [YT.paintUk, YT.paintDe],
    laborPrices: [18, 230, 15],
    laborRanges: { de: [14, 24], ua: [170, 300], es: [11, 20] },
    materials: [
      { materialId: 'mat-skim-coat', qtyPerUnit: 0.8 },
      { materialId: 'mat-primer', qtyPerUnit: 0.15 },
      { materialId: 'mat-interior-paint', qtyPerUnit: 0.25 },
    ],
  }),
  work({
    id: 'work-texture-paint',
    slug: 'texture-paint',
    category: 'paint',
    unit: 'm2',
    names: {
      en: 'Texture / effect paint',
      uk: 'Декоративне фарбування',
      de: 'Effektfarbe / Struktur',
      es: 'Pintura decorativa / textura',
    },
    searchAliases: ['декоративне фарбування', 'effektfarbe', 'pintura textura'],
    youtube: [YT.paintDe],
    laborPrices: [22, 280, 18],
    laborRanges: { de: [16, 30], ua: [200, 350], es: [14, 25] },
    materials: [
      { materialId: 'mat-interior-paint', qtyPerUnit: 0.35 },
      { materialId: 'mat-primer', qtyPerUnit: 0.15 },
    ],
  }),
  work({
    id: 'work-drywall-partition',
    slug: 'drywall-partition',
    category: 'drywall',
    unit: 'm2',
    names: {
      en: 'Drywall partition wall',
      uk: 'Перегородка з гіпсокартону',
      de: 'Trockenbauwand',
      es: 'Tabique de pladur',
    },
    searchAliases: ['гіпсокартон перегородка', 'trockenbau', 'pladur tabique', 'drywall wall'],
    youtube: [YT.drywallDe],
    laborPrices: [45, 550, 38],
    laborRanges: { de: [35, 55], ua: [400, 700], es: [28, 48] },
    materials: [
      { materialId: 'mat-drywall-board', qtyPerUnit: 2.1 },
      { materialId: 'mat-drywall-profile', qtyPerUnit: 3.5 },
      { materialId: 'mat-joint-compound', qtyPerUnit: 1.2 },
    ],
  }),
  work({
    id: 'work-drywall-ceiling',
    slug: 'drywall-ceiling',
    category: 'drywall',
    unit: 'm2',
    names: {
      en: 'Drywall ceiling',
      uk: 'Стеля з гіпсокартону',
      de: 'Trockenbaudecke',
      es: 'Techo de pladur',
    },
    searchAliases: ['гіпсокартон стеля', 'trockenbaudecke', 'techo pladur'],
    youtube: [YT.drywallDe],
    laborPrices: [48, 580, 40],
    laborRanges: { de: [38, 60], ua: [450, 720], es: [30, 52] },
    materials: [
      { materialId: 'mat-drywall-board', qtyPerUnit: 1.1 },
      { materialId: 'mat-drywall-profile', qtyPerUnit: 2.8 },
      { materialId: 'mat-joint-compound', qtyPerUnit: 1 },
    ],
  }),
  work({
    id: 'work-drywall-jointing',
    slug: 'drywall-jointing',
    category: 'drywall',
    unit: 'm2',
    names: {
      en: 'Drywall taping & jointing',
      uk: 'Шпаклювання швів ГКЛ',
      de: 'Trockenbau verspachteln',
      es: 'Enlucido de juntas pladur',
    },
    searchAliases: ['шви гкл', 'verspachteln', 'juntas pladur', 'drywall finish'],
    youtube: [YT.drywallDe, YT.plasterUk],
    laborPrices: [14, 170, 12],
    laborRanges: { de: [10, 18], ua: [120, 220], es: [9, 16] },
    materials: [
      { materialId: 'mat-joint-compound', qtyPerUnit: 1.5 },
      { materialId: 'mat-primer', qtyPerUnit: 0.1 },
    ],
  }),
  work({
    id: 'work-screed',
    slug: 'floor-screed',
    category: 'other',
    unit: 'm2',
    names: {
      en: 'Floor screed',
      uk: 'Стяжка підлоги',
      de: 'Estrich einbringen',
      es: 'Solera / recrecido',
    },
    searchAliases: ['стяжка', 'estrich', 'solera', 'screed', 'вирівнювання підлоги'],
    youtube: [YT.plasterDe],
    laborPrices: [20, 250, 16],
    laborRanges: { de: [15, 28], ua: [180, 320], es: [12, 22] },
    materials: [
      { materialId: 'mat-screed', qtyPerUnit: 20 },
      { materialId: 'mat-primer', qtyPerUnit: 0.2 },
    ],
  }),
  work({
    id: 'work-leveling-compound',
    slug: 'self-leveling-compound',
    category: 'other',
    unit: 'm2',
    names: {
      en: 'Self-leveling compound',
      uk: 'Самонівелююча суміш',
      de: 'Nivelliermasse',
      es: 'Autonivelante',
    },
    searchAliases: ['нівелір', 'nivelliermasse', 'autonivelante', 'self leveling'],
    youtube: [YT.plasterUk],
    laborPrices: [16, 200, 13],
    laborRanges: { de: [12, 22], ua: [150, 260], es: [10, 18] },
    materials: [
      { materialId: 'mat-screed', qtyPerUnit: 8 },
      { materialId: 'mat-primer', qtyPerUnit: 0.2 },
    ],
  }),
  work({
    id: 'work-mosaic',
    slug: 'mosaic-tiling',
    category: 'tiling',
    unit: 'm2',
    names: {
      en: 'Mosaic tiling',
      uk: 'Укладання мозаїки',
      de: 'Mosaik verlegen',
      es: 'Colocación de mosaico',
    },
    searchAliases: ['мозаїка', 'mosaik', 'mosaico', 'mosaic'],
    youtube: [YT.tileDe, YT.tileEs],
    laborPrices: [65, 800, 55],
    laborRanges: { de: [50, 80], ua: [600, 1000], es: [40, 70] },
    materials: [
      { materialId: 'mat-tile-30x60', qtyPerUnit: 1.15 },
      { materialId: 'mat-adhesive-c2', qtyPerUnit: 4 },
      { materialId: 'mat-grout', qtyPerUnit: 1.2 },
    ],
  }),
  work({
    id: 'work-baseboard',
    slug: 'baseboard-install',
    category: 'other',
    unit: 'lm',
    names: {
      en: 'Baseboard installation',
      uk: 'Монтаж плінтуса',
      de: 'Sockelleisten montieren',
      es: 'Instalación de rodapié',
    },
    searchAliases: ['плінтус', 'sockelleiste', 'rodapie', 'baseboard'],
    youtube: [YT.drywallDe],
    laborPrices: [6, 75, 5],
    laborRanges: { de: [4, 9], ua: [50, 100], es: [3.5, 7] },
    materials: [],
  }),
  work({
    id: 'work-anti-mold',
    slug: 'anti-mold-treatment',
    category: 'paint',
    unit: 'm2',
    names: {
      en: 'Anti-mold treatment',
      uk: 'Обробка від плісняви',
      de: 'Schimmelbehandlung',
      es: 'Tratamiento antihongos',
    },
    searchAliases: ['пліснява', 'schimmel', 'moho', 'mold', 'антигрибок'],
    youtube: [YT.paintUk],
    laborPrices: [14, 170, 11],
    laborRanges: { de: [10, 18], ua: [120, 220], es: [8, 15] },
    materials: [
      { materialId: 'mat-primer', qtyPerUnit: 0.2 },
      { materialId: 'mat-interior-paint', qtyPerUnit: 0.2 },
    ],
  }),
  work({
    id: 'work-spray-paint',
    slug: 'spray-painting',
    category: 'paint',
    unit: 'm2',
    names: {
      en: 'Spray painting',
      uk: 'Фарбування фарбопультом',
      de: 'Spritzlackierung',
      es: 'Pintura a pistola',
    },
    searchAliases: ['фарбопульт', 'spritzlack', 'pistola pintura', 'spray paint'],
    youtube: [YT.paintDe],
    laborPrices: [14, 180, 11],
    laborRanges: { de: [10, 18], ua: [130, 230], es: [8, 15] },
    materials: [
      { materialId: 'mat-interior-paint', qtyPerUnit: 0.3 },
      { materialId: 'mat-primer', qtyPerUnit: 0.12 },
    ],
  }),
  work({
    id: 'work-epoxy-floor',
    slug: 'epoxy-floor-coating',
    category: 'other',
    unit: 'm2',
    names: {
      en: 'Epoxy floor coating',
      uk: 'Епоксидне покриття підлоги',
      de: 'Epoxidboden',
      es: 'Revestimiento epoxi',
    },
    searchAliases: ['епоксид', 'epoxidboden', 'epoxi suelo', 'epoxy floor'],
    youtube: [YT.plasterDe],
    laborPrices: [35, 450, 28],
    laborRanges: { de: [28, 45], ua: [350, 550], es: [22, 38] },
    materials: [
      { materialId: 'mat-primer', qtyPerUnit: 0.25 },
      { materialId: 'mat-screed', qtyPerUnit: 2 },
    ],
  }),
  work({
    id: 'work-tile-niche',
    slug: 'tile-niche-shelf',
    category: 'tiling',
    unit: 'pcs',
    names: {
      en: 'Tiled niche / shelf',
      uk: 'Плиткова ніша / полиця',
      de: 'Fliesennische',
      es: 'Nicho alicatado',
    },
    searchAliases: ['ніша плитка', 'fliesennische', 'nicho azulejo'],
    youtube: [YT.tileDe, YT.tileUk],
    laborPrices: [120, 1500, 95],
    laborRanges: { de: [90, 160], ua: [1100, 2000], es: [70, 130] },
    materials: [
      { materialId: 'mat-tile-30x60', qtyPerUnit: 1.5 },
      { materialId: 'mat-adhesive-c2', qtyPerUnit: 3 },
      { materialId: 'mat-waterproof', qtyPerUnit: 1 },
      { materialId: 'mat-grout', qtyPerUnit: 0.5 },
    ],
  }),
  work({
    id: 'work-render-mesh',
    slug: 'facade-mesh-render',
    category: 'plaster',
    unit: 'm2',
    names: {
      en: 'Facade mesh + render',
      uk: 'Фасад: сітка + штукатурка',
      de: 'WDVS Armierung + Putz',
      es: 'Malla + enfoscado fachada',
    },
    searchAliases: ['фасад сітка', 'wdvs', 'armierung', 'malla fachada'],
    youtube: [YT.plasterDe],
    laborPrices: [28, 350, 22],
    laborRanges: { de: [22, 36], ua: [260, 440], es: [16, 30] },
    materials: [
      { materialId: 'mat-mesh', qtyPerUnit: 1.1 },
      { materialId: 'mat-cement-plaster', qtyPerUnit: 8 },
      { materialId: 'mat-primer', qtyPerUnit: 0.2 },
    ],
  }),
];

export const CATALOG_UPDATED_AT = UPDATED;
