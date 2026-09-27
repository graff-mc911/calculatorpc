/**
 * Quick sanity check for price catalog search (no scrapers).
 * Run: npx --yes tsx scripts/verify-price-catalog.mts
 */
import {
  catalogStats,
  getWorkDetailLocal,
  normalizePriceQuery,
  searchWorksLocal,
} from '../src/lib/priceCatalog.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const stats = catalogStats();
assert(stats.works >= 30, `expected >=30 works, got ${stats.works}`);
assert(stats.materials >= 15, `expected >=15 materials, got ${stats.materials}`);
assert(stats.countries.join(',') === 'DE,UA,ES', 'countries DE/UA/ES');

assert(normalizePriceQuery('вкладання плитки формат 120на 60').includes('120x60'), 'normalize 120на 60');
assert(normalizePriceQuery('Fliesen 120×60') === 'fliesen 120x60', 'normalize ×');

const hits = searchWorksLocal('вкладання плитки формат 120на 60', 'DE');
assert(hits.length > 0, 'search returns hits');
assert(hits[0].work.slug.includes('120x60') || hits[0].work.id.includes('120x60'), 'top hit is 120x60 tiling');
assert(hits[0].labor.currency === 'EUR', 'DE labor EUR');

const ua = searchWorksLocal('плитка 120x60', 'UA');
assert(ua[0].labor.currency === 'UAH', 'UA labor UAH');

const detail = getWorkDetailLocal(hits[0].work.id, 'DE');
assert(detail, 'detail exists');
assert(detail!.bom.length >= 2, 'BOM has materials');
assert(detail!.buyLinks.length >= 1, 'buy links');
assert(detail!.youtube.length >= 1, 'youtube');
assert(detail!.labor.updatedAt, 'updated_at shown');

console.log(
  JSON.stringify(
    {
      ok: true,
      works: stats.works,
      materials: stats.materials,
      topHit: hits[0].work.slug,
      laborDE: hits[0].labor.price,
      bom: detail!.bom.length,
      buy: detail!.buyLinks.length,
      yt: detail!.youtube.length,
    },
    null,
    2
  )
);
