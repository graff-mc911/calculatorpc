import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Search } from 'lucide-react';
import {
  CATALOG_MATERIALS,
  CATALOG_WORKS,
  PRICE_COUNTRIES,
  type CatalogMaterial,
  type CatalogWork,
  type PriceCountryCode,
} from '../data/priceCatalogSeed';
import {
  formatMoney,
  localizedMaterialName,
  localizedWorkName,
  normalizePriceQuery,
} from '../lib/priceCatalog';
import {
  fetchMaterialPriceOverrides,
  fetchOwnerAnnouncements,
  fetchOwnerStats,
  fetchWorkPriceOverrides,
  publishAnnouncement,
  upsertMaterialPriceFromCatalog,
  upsertWorkPriceFromCatalog,
  type AnnouncementKind,
  type SiteAnnouncement,
} from '../lib/ownerApi';

type Tab = 'overview' | 'prices' | 'announce';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Огляд' },
  { id: 'prices', label: 'Ціни' },
  { id: 'announce', label: 'Оголошення' },
];

export default function Owner() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 md:px-6 max-w-5xl mx-auto">
      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="flex items-center justify-center p-2 bg-white/10 backdrop-blur-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/20 rounded-xl mb-6 transition-all active:scale-95"
        title="Назад у Settings"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <h1 className="text-2xl font-semibold text-white mb-2">Кабінет власника</h1>
      <p className="text-white/45 text-sm mb-6">
        Користувачі, ціни каталогу та текст у хедері
      </p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-all active:scale-95 ${
              tab === t.id
                ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'prices' && <PricesTab />}
      {tab === 'announce' && <AnnounceTab />}
    </div>
  );
}

function OverviewTab() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['owner-stats'],
    queryFn: fetchOwnerStats,
    retry: false,
  });

  const countries = useMemo(() => {
    const map = data?.by_country ?? {};
    const keys = Object.keys(map);
    if (!keys.includes('unknown') && keys.length === 0) {
      return [{ code: 'unknown', count: data?.total_users ?? 0 }];
    }
    const preferred = ['DE', 'UA', 'ES', 'unknown'];
    const ordered = [
      ...preferred.filter((k) => k in map),
      ...keys.filter((k) => !preferred.includes(k)).sort(),
    ];
    return ordered.map((code) => ({ code, count: Number(map[code] ?? 0) }));
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <p className="text-white/50 text-sm mb-2">Користувачі</p>
          {isLoading ? (
            <p className="text-white/40 text-3xl font-semibold">…</p>
          ) : error ? (
            <p className="text-red-400 text-sm">
              Статистика недоступна (застосуйте міграцію owner admin).
            </p>
          ) : (
            <p className="text-white text-4xl font-semibold">{data?.total_users ?? 0}</p>
          )}
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <p className="text-white/50 text-sm mb-3">Країни (агрегат)</p>
          {isLoading ? (
            <p className="text-white/40 text-sm">…</p>
          ) : error ? (
            <p className="text-red-400 text-sm">Немає даних</p>
          ) : (
            <ul className="space-y-1.5">
              {countries.map((row) => (
                <li key={row.code} className="flex justify-between text-sm">
                  <span className="text-white/70">
                    {row.code === 'unknown' ? 'Невідомо' : row.code}
                  </span>
                  <span className="text-white font-medium">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void refetch()}
        disabled={isFetching}
        className="px-4 py-2 text-sm bg-white/10 border border-white/10 rounded-xl text-white/70 hover:text-white hover:bg-white/20 disabled:opacity-50"
      >
        {isFetching ? 'Оновлення…' : 'Оновити'}
      </button>
      <p className="text-white/30 text-xs">
        Лише агрегати. Країна з `user_app_meta` (напр. після вибору країни цін); інакше —
        Невідомо.
      </p>
    </div>
  );
}

function PricesTab() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'works' | 'materials'>('works');
  const [country, setCountry] = useState<PriceCountryCode>('DE');
  const [query, setQuery] = useState('');
  const [editingWork, setEditingWork] = useState<CatalogWork | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<CatalogMaterial | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: workOverrides } = useQuery({
    queryKey: ['owner-work-price-overrides', country],
    queryFn: () => fetchWorkPriceOverrides(country),
    retry: false,
  });

  const { data: materialOverrides } = useQuery({
    queryKey: ['owner-material-price-overrides', country],
    queryFn: () => fetchMaterialPriceOverrides(country),
    retry: false,
  });

  const countryMeta = PRICE_COUNTRIES.find((c) => c.code === country);
  const locale = countryMeta?.locale || 'de-DE';
  const q = normalizePriceQuery(query);

  const workRows = useMemo(() => {
    return CATALOG_WORKS.filter((w) => {
      if (!q) return true;
      const hay = normalizePriceQuery(
        [w.slug, w.names.en, w.names.uk, w.names.de, ...w.searchAliases].join(' ')
      );
      return hay.includes(q) || q.split(' ').every((t) => hay.includes(t));
    }).map((work) => {
      const ov = workOverrides?.get(work.slug);
      const labor = ov
        ? {
            price: ov.labor_price,
            currency: ov.labor_currency,
            min: ov.price_min ?? undefined,
            max: ov.price_max ?? undefined,
            updatedAt: ov.updated_at.slice(0, 10),
          }
        : work.labor[country];
      return { work, labor };
    });
  }, [q, country, workOverrides]);

  const materialRows = useMemo(() => {
    return CATALOG_MATERIALS.filter((m) => {
      if (!q) return true;
      const hay = normalizePriceQuery(
        [m.id, m.name.en, m.name.uk, m.name.de, ...m.aliases].join(' ')
      );
      return hay.includes(q) || q.split(' ').every((t) => hay.includes(t));
    }).map((material) => {
      const ov = materialOverrides?.get(material.id);
      const price = ov
        ? {
            price: ov.price,
            currency: ov.currency,
            updatedAt: ov.updated_at.slice(0, 10),
          }
        : material.prices[country];
      return { material, price };
    });
  }, [q, country, materialOverrides]);

  const onSaveWork = async (values: {
    laborPrice: number;
    priceMin: number | null;
    priceMax: number | null;
  }) => {
    if (!editingWork) return;
    setSaving(true);
    setSaveError(null);
    try {
      await upsertWorkPriceFromCatalog(editingWork, country, values);
      await queryClient.invalidateQueries({ queryKey: ['owner-work-price-overrides'] });
      await queryClient.invalidateQueries({ queryKey: ['price-overrides'] });
      setEditingWork(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const onSaveMaterial = async (price: number) => {
    if (!editingMaterial) return;
    setSaving(true);
    setSaveError(null);
    try {
      await upsertMaterialPriceFromCatalog(editingMaterial, country, price);
      await queryClient.invalidateQueries({ queryKey: ['owner-material-price-overrides'] });
      await queryClient.invalidateQueries({ queryKey: ['price-overrides'] });
      setEditingMaterial(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setMode('works')}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              mode === 'works' ? 'bg-white/15 text-white' : 'text-white/50'
            }`}
          >
            Ціни робіт
          </button>
          <button
            type="button"
            onClick={() => setMode('materials')}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              mode === 'materials' ? 'bg-white/15 text-white' : 'text-white/50'
            }`}
          >
            Матеріали
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-white/60">
          Країна
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value as PriceCountryCode)}
            className="bg-white/10 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm"
          >
            {PRICE_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-[#1e272e]">
                {c.code}
              </option>
            ))}
          </select>
        </label>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук…"
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30"
          />
        </div>
      </div>

      {saveError && <p className="text-red-400 text-sm">{saveError}</p>}

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 bg-[#1e272e]/90 text-white/50">
              <tr>
                <th className="px-3 py-2 font-medium">Назва</th>
                <th className="px-3 py-2 font-medium">Од.</th>
                <th className="px-3 py-2 font-medium">Ціна</th>
                <th className="px-3 py-2 font-medium hidden sm:table-cell">Min–Max</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Оновлено</th>
                <th className="px-3 py-2 font-medium w-20" />
              </tr>
            </thead>
            <tbody>
              {mode === 'works'
                ? workRows.slice(0, 200).map(({ work, labor }) => (
                    <tr key={work.id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-3 py-2 text-white">
                        {localizedWorkName(work, 'uk')}
                      </td>
                      <td className="px-3 py-2 text-white/50">{work.unit}</td>
                      <td className="px-3 py-2 text-white">
                        {formatMoney(labor.price, labor.currency, locale)}
                      </td>
                      <td className="px-3 py-2 text-white/50 hidden sm:table-cell">
                        {labor.min != null && labor.max != null
                          ? `${labor.min}–${labor.max}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-white/40 hidden md:table-cell">
                        {labor.updatedAt}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setEditingWork(work)}
                          className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
                          aria-label="Редагувати"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                : materialRows.slice(0, 200).map(({ material, price }) => (
                    <tr key={material.id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-3 py-2 text-white">
                        {localizedMaterialName(material, 'uk')}
                      </td>
                      <td className="px-3 py-2 text-white/50">{material.unit}</td>
                      <td className="px-3 py-2 text-white">
                        {formatMoney(price.price, price.currency, locale)}
                      </td>
                      <td className="px-3 py-2 text-white/50 hidden sm:table-cell">—</td>
                      <td className="px-3 py-2 text-white/40 hidden md:table-cell">
                        {price.updatedAt}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setEditingMaterial(material)}
                          className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
                          aria-label="Редагувати"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingWork && (
        <WorkEditModal
          work={editingWork}
          country={country}
          override={workOverrides?.get(editingWork.slug)}
          saving={saving}
          onClose={() => setEditingWork(null)}
          onSave={onSaveWork}
        />
      )}

      {editingMaterial && (
        <MaterialEditModal
          material={editingMaterial}
          country={country}
          override={materialOverrides?.get(editingMaterial.id)}
          saving={saving}
          onClose={() => setEditingMaterial(null)}
          onSave={onSaveMaterial}
        />
      )}
    </div>
  );
}

function WorkEditModal({
  work,
  country,
  override,
  saving,
  onClose,
  onSave,
}: {
  work: CatalogWork;
  country: PriceCountryCode;
  override?: { labor_price: number; price_min: number | null; price_max: number | null; labor_currency: string };
  saving: boolean;
  onClose: () => void;
  onSave: (v: { laborPrice: number; priceMin: number | null; priceMax: number | null }) => void;
}) {
  const base = work.labor[country];
  const currency = override?.labor_currency || base.currency;
  const [laborPrice, setLaborPrice] = useState(String(override?.labor_price ?? base.price));
  const [priceMin, setPriceMin] = useState(
    String(override?.price_min ?? base.min ?? '')
  );
  const [priceMax, setPriceMax] = useState(
    String(override?.price_max ?? base.max ?? '')
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-[#24303a] border border-white/10 rounded-2xl p-5 shadow-xl">
        <h3 className="text-white font-medium mb-1">{localizedWorkName(work, 'uk')}</h3>
        <p className="text-white/40 text-xs mb-4">
          {country} · валюта {currency} (з країни)
        </p>
        <label className="block text-sm text-white/60 mb-1">Labor</label>
        <input
          type="number"
          step="0.01"
          value={laborPrice}
          onChange={(e) => setLaborPrice(e.target.value)}
          className="w-full mb-3 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white"
        />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm text-white/60 mb-1">Min</label>
            <input
              type="number"
              step="0.01"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-1">Max</label>
            <input
              type="number"
              step="0.01"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/10 text-white/70 text-sm"
          >
            Скасувати
          </button>
          <button
            type="button"
            disabled={saving || !laborPrice}
            onClick={() =>
              onSave({
                laborPrice: Number(laborPrice),
                priceMin: priceMin === '' ? null : Number(priceMin),
                priceMax: priceMax === '' ? null : Number(priceMax),
              })
            }
            className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Збереження…' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MaterialEditModal({
  material,
  country,
  override,
  saving,
  onClose,
  onSave,
}: {
  material: CatalogMaterial;
  country: PriceCountryCode;
  override?: { price: number; currency: string };
  saving: boolean;
  onClose: () => void;
  onSave: (price: number) => void;
}) {
  const base = material.prices[country];
  const currency = override?.currency || base.currency;
  const [price, setPrice] = useState(String(override?.price ?? base.price));

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-[#24303a] border border-white/10 rounded-2xl p-5 shadow-xl">
        <h3 className="text-white font-medium mb-1">
          {localizedMaterialName(material, 'uk')}
        </h3>
        <p className="text-white/40 text-xs mb-4">
          {country} · {currency} / {material.unit}
        </p>
        <label className="block text-sm text-white/60 mb-1">Ціна</label>
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full mb-4 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/10 text-white/70 text-sm"
          >
            Скасувати
          </button>
          <button
            type="button"
            disabled={saving || !price}
            onClick={() => onSave(Number(price))}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Збереження…' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnnounceTab() {
  const queryClient = useQueryClient();
  const { data: list, error, isLoading, refetch } = useQuery({
    queryKey: ['owner-announcements'],
    queryFn: fetchOwnerAnnouncements,
    retry: false,
  });

  const active = list?.find((a) => a.is_active) || list?.[0] || null;
  const [kind, setKind] = useState<AnnouncementKind>('promo');
  const [body, setBody] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    setEditId(active.id);
    setKind(active.kind);
    setBody(active.body);
    setIsActive(active.is_active);
    setStartsAt(active.starts_at ? active.starts_at.slice(0, 16) : '');
    setEndsAt(active.ends_at ? active.ends_at.slice(0, 16) : '');
  }, [active?.id]);

  const onPublish = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await publishAnnouncement({
        id: editId,
        kind,
        body,
        isActive,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      await queryClient.invalidateQueries({ queryKey: ['owner-announcements'] });
      await queryClient.invalidateQueries({ queryKey: ['site-announcement-active'] });
      setMsg('Опубліковано');
      await refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const previewClass =
    kind === 'warning'
      ? 'text-amber-400'
      : kind === 'promo'
        ? 'text-orange-300/90'
        : 'text-white/70';

  return (
    <div className="space-y-4 max-w-xl">
      {isLoading && <p className="text-white/40 text-sm">Завантаження…</p>}
      {error && (
        <p className="text-red-400 text-sm">
          Оголошення потребують міграції owner admin.
        </p>
      )}

      <div className="bg-white/10 border border-white/10 rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-sm text-white/60 mb-2">Тип</p>
          <div className="flex gap-3 text-sm text-white/80">
            {(['info', 'promo', 'warning'] as AnnouncementKind[]).map((k) => (
              <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="announce-kind"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                {k}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1">
            Текст ({body.length}/120)
          </label>
          <input
            value={body}
            maxLength={120}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Акція: −20% на Pro до 30.09"
            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Активне
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Початок (опційно)</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Кінець (опційно)</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm"
            />
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-3">
          <p className="text-xs text-white/40 mb-1">Попередній перегляд у хедері</p>
          <p className={`text-sm truncate ${previewClass}`} title={body}>
            {body || '—'}
          </p>
        </div>

        <button
          type="button"
          disabled={saving || !body.trim()}
          onClick={() => void onPublish()}
          className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Публікація…' : 'Опублікувати'}
        </button>
        {msg && <p className="text-sm text-white/60">{msg}</p>}
      </div>

      {list && list.length > 0 && (
        <div className="text-xs text-white/40 space-y-1">
          <p>Останні записи:</p>
          {list.slice(0, 5).map((a: SiteAnnouncement) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setEditId(a.id);
                setKind(a.kind);
                setBody(a.body);
                setIsActive(a.is_active);
                setStartsAt(a.starts_at ? a.starts_at.slice(0, 16) : '');
                setEndsAt(a.ends_at ? a.ends_at.slice(0, 16) : '');
              }}
              className="block w-full text-left truncate hover:text-white/70"
            >
              {a.is_active ? '●' : '○'} [{a.kind}] {a.body}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
