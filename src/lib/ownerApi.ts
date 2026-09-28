import { supabase } from './supabase';
import type { CatalogMaterial, CatalogWork, PriceCountryCode } from '../data/priceCatalogSeed';

export type OwnerStats = {
  total_users: number;
  by_country: Record<string, number>;
};

export type AnnouncementKind = 'info' | 'promo' | 'warning';

export type SiteAnnouncement = {
  id: string;
  kind: AnnouncementKind;
  body: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function fetchOwnerStats(): Promise<OwnerStats> {
  const { data, error } = await supabase.rpc('owner_user_stats');
  if (error) throw error;
  const payload = (data ?? {}) as OwnerStats;
  return {
    total_users: Number(payload.total_users ?? 0),
    by_country: payload.by_country ?? {},
  };
}

export async function fetchActiveAnnouncement(): Promise<SiteAnnouncement | null> {
  const { data, error } = await supabase
    .from('site_announcements')
    .select('id, kind, body, is_active, starts_at, ends_at, updated_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Table may not exist until migration applied
    return null;
  }
  return (data as SiteAnnouncement) ?? null;
}

export async function fetchOwnerAnnouncements(): Promise<SiteAnnouncement[]> {
  const { data, error } = await supabase
    .from('site_announcements')
    .select('id, kind, body, is_active, starts_at, ends_at, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data as SiteAnnouncement[]) ?? [];
}

export async function publishAnnouncement(input: {
  id?: string | null;
  kind: AnnouncementKind;
  body: string;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<SiteAnnouncement> {
  const { data, error } = await supabase.rpc('owner_publish_announcement', {
    p_kind: input.kind,
    p_body: input.body,
    p_is_active: input.isActive,
    p_starts_at: input.startsAt ?? null,
    p_ends_at: input.endsAt ?? null,
    p_id: input.id ?? null,
  });
  if (error) throw error;
  return data as SiteAnnouncement;
}

export type WorkPriceOverride = {
  slug: string;
  labor_price: number;
  labor_currency: string;
  price_min: number | null;
  price_max: number | null;
  updated_at: string;
};

export type MaterialPriceOverride = {
  slug: string;
  price: number;
  currency: string;
  updated_at: string;
};

export async function fetchWorkPriceOverrides(
  country: PriceCountryCode
): Promise<Map<string, WorkPriceOverride>> {
  const map = new Map<string, WorkPriceOverride>();
  const { data, error } = await supabase
    .from('work_prices')
    .select('labor_price, labor_currency, price_min, price_max, updated_at, works!inner(slug)')
    .eq('country_code', country)
    .or('valid_to.is.null,valid_to.gte.' + new Date().toISOString().slice(0, 10));

  if (error || !data) return map;

  for (const row of data as Array<{
    labor_price: number;
    labor_currency: string;
    price_min: number | null;
    price_max: number | null;
    updated_at: string;
    works: { slug: string } | { slug: string }[];
  }>) {
    const works = Array.isArray(row.works) ? row.works[0] : row.works;
    const slug = works?.slug;
    if (!slug) continue;
    map.set(slug, {
      slug,
      labor_price: Number(row.labor_price),
      labor_currency: row.labor_currency,
      price_min: row.price_min != null ? Number(row.price_min) : null,
      price_max: row.price_max != null ? Number(row.price_max) : null,
      updated_at: row.updated_at,
    });
  }
  return map;
}

export async function fetchMaterialPriceOverrides(
  country: PriceCountryCode
): Promise<Map<string, MaterialPriceOverride>> {
  const map = new Map<string, MaterialPriceOverride>();
  const { data, error } = await supabase
    .from('material_prices')
    .select('price, currency, updated_at, materials!inner(slug)')
    .eq('country_code', country)
    .or('valid_to.is.null,valid_to.gte.' + new Date().toISOString().slice(0, 10));

  if (error || !data) return map;

  for (const row of data as Array<{
    price: number;
    currency: string;
    updated_at: string;
    materials: { slug: string } | { slug: string }[];
  }>) {
    const materials = Array.isArray(row.materials) ? row.materials[0] : row.materials;
    const slug = materials?.slug;
    if (!slug) continue;
    map.set(slug, {
      slug,
      price: Number(row.price),
      currency: row.currency,
      updated_at: row.updated_at,
    });
  }
  return map;
}

export async function upsertWorkPriceFromCatalog(
  work: CatalogWork,
  country: PriceCountryCode,
  values: {
    laborPrice: number;
    priceMin?: number | null;
    priceMax?: number | null;
  }
) {
  const currency = work.labor[country]?.currency
    || (country === 'UA' ? 'UAH' : 'EUR');

  const { data, error } = await supabase.rpc('owner_upsert_work_price', {
    p_slug: work.slug,
    p_country_code: country,
    p_labor_price: values.laborPrice,
    p_price_min: values.priceMin ?? null,
    p_price_max: values.priceMax ?? null,
    p_currency: currency,
    p_category: work.category,
    p_unit: work.unit,
    p_name_en: work.names.en,
    p_name_uk: work.names.uk,
    p_name_de: work.names.de,
    p_name_es: work.names.es,
    p_search_aliases: work.searchAliases,
    p_youtube_urls: work.youtube,
  });
  if (error) throw error;
  return data;
}

export async function upsertMaterialPriceFromCatalog(
  material: CatalogMaterial,
  country: PriceCountryCode,
  price: number
) {
  const currency = material.prices[country]?.currency
    || (country === 'UA' ? 'UAH' : 'EUR');

  const { data, error } = await supabase.rpc('owner_upsert_material_price', {
    p_slug: material.id,
    p_country_code: country,
    p_price: price,
    p_currency: currency,
    p_unit: material.unit,
    p_name_en: material.name.en,
    p_name_uk: material.name.uk,
    p_name_de: material.name.de,
    p_name_es: material.name.es,
    p_aliases: material.aliases,
  });
  if (error) throw error;
  return data;
}

export async function syncMyPriceCountry(country: PriceCountryCode) {
  const { error } = await supabase.rpc('upsert_my_price_country', {
    p_country_code: country,
  });
  // Non-fatal if migration not applied
  if (error) return false;
  return true;
}
