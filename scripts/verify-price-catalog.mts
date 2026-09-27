/**
 * Sanity check for expanded price catalog (no scrapers).
 * Run: npx --yes tsx scripts/verify-price-catalog.mts
 */
import {
  catalogStats,
  catalogWorksByCategory,
  getWorkDetailLocal,
  normalizePriceQuery,
  searchWorksLocal,
} from '../src/lib/priceCatalog.ts';
import { CATALOG_WORKS } from '../src/data/priceCatalogSeed.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const stats = catalogStats();
assert(stats.works >= 80, `expected >=80 works, got ${stats.works}`);
assert(stats.materials >= 40, `expected >=40 materials, got ${stats.materials}`);
assert(stats.countries.join(',') === 'DE,UA,ES', 'countries DE/UA/ES');
assert(stats.allHaveYoutube, 'every work must have YouTube');

const missingYt = CATALOG_WORKS.filter((w) => !w.youtube?.length);
assert(missingYt.length === 0, `works without YouTube: ${missingYt.map((w) => w.id).join(',')}`);

const byCat = catalogWorksByCategory();
const expectedCats = [
  'tiling',
  'plaster',
  'paint',
  'drywall',
  'masonry',
  'concrete',
  'flooring',
  'plumbing',
  'electrical',
  'roofing',
  'insulation',
  'facade',
  'demolition',
  'doors_windows',
  'outdoor',
];
for (const c of expectedCats) {
  assert((byCat[c] || 0) >= 1, `missing category ${c}`);
}

assert(normalizePriceQuery('вкладання плитки формат 120на 60').includes('120x60'), 'normalize 120на 60');
assert(normalizePriceQuery('Fliesen 120×60') === 'fliesen 120x60', 'normalize ×');

const hits = searchWorksLocal('вкладання плитки формат 120на 60', 'DE');
assert(hits.length > 0, 'search returns hits');
assert(hits[0].work.slug.includes('120x60') || hits[0].work.id.includes('120x60'), 'top hit is 120x60 tiling');
assert(hits[0].labor.currency === 'EUR', 'DE labor EUR');

const ua = searchWorksLocal('плитка 120x60', 'UA');
assert(ua[0].labor.currency === 'UAH', 'UA labor UAH');

const masonry = searchWorksLocal('кладка цегли', 'UA');
assert(masonry.length > 0 && masonry[0].work.category === 'masonry', 'masonry search');

const plumbing = searchWorksLocal('WC montieren', 'DE');
assert(plumbing.length > 0 && plumbing[0].work.category === 'plumbing', 'plumbing search');

const detail = getWorkDetailLocal(hits[0].work.id, 'DE');
assert(detail, 'detail exists');
assert(detail!.bom.length >= 2, 'BOM has materials');
assert(detail!.buyLinks.length >= 1, 'buy links');
assert(detail!.youtube.length >= 1, 'youtube');
assert(detail!.labor.updatedAt, 'updated_at shown');

// Spot-check i18n names present
for (const w of CATALOG_WORKS) {
  assert(w.names.en && w.names.uk && w.names.de && w.names.es, `i18n names missing on ${w.id}`);
  assert(w.labor.DE && w.labor.UA && w.labor.ES, `country prices missing on ${w.id}`);
  for (const yt of w.youtube) {
    assert(yt.url.includes('youtube.com'), `non-YouTube url on ${w.id}`);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      works: stats.works,
      materials: stats.materials,
      allHaveYoutube: stats.allHaveYoutube,
      byCategory: byCat,
      topHit: hits[0].work.slug,
      laborDE: hits[0].labor.price,
      bom: detail!.bom.length,
      buy: detail!.buyLinks.length,
      yt: detail!.youtube.length,
      updatedAt: stats.updatedAt,
    },
    null,
    2
  )
);
