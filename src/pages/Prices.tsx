import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  PlayCircle,
  Search,
  ShoppingBag,
  Tag,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  formatMoney,
  getStoredPriceCountry,
  getWorkDetailLocal,
  localizedCountryName,
  localizedMaterialName,
  localizedWorkName,
  searchWorksLocal,
  setStoredPriceCountry,
  type PriceCountryCode,
  type WorkDetail,
  type WorkSearchHit,
  getPriceCountries,
  catalogStats,
} from '../lib/priceCatalog';

const DEBOUNCE_MS = 350;

export default function Prices() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const countries = getPriceCountries();
  const stats = catalogStats();

  const [country, setCountry] = useState<PriceCountryCode>(() => getStoredPriceCountry());
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    setStoredPriceCountry(country);
    setSelectedId(null);
  }, [country]);

  const hits: WorkSearchHit[] = useMemo(
    () => searchWorksLocal(debouncedQuery, country),
    [debouncedQuery, country]
  );

  const detail: WorkDetail | null = useMemo(
    () => (selectedId ? getWorkDetailLocal(selectedId, country) : null),
    [selectedId, country]
  );

  const countryMeta = countries.find((c) => c.code === country);
  const locale = countryMeta?.locale || 'de-DE';

  const onSelectCountry = (code: PriceCountryCode) => {
    setCountry(code);
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 md:px-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/10"
          aria-label={t('back')}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-white truncate">
            {t('pricesTitle') || 'Ціни робіт'}
          </h1>
          <p className="text-white/45 text-xs mt-0.5">
            {t('pricesSubtitle') || 'Орієнтовні ціни праці та матеріалів за країною'}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <MapPin size={12} />
          {t('priceCountry') || 'Країна цін'}
          <span className="text-white/25 normal-case tracking-normal">
            ({t('priceCountryHint') || 'окремо від мови інтерфейсу'})
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {countries.map((c) => {
            const active = c.code === country;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => onSelectCountry(c.code)}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all border ${
                  active
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {localizedCountryName(c.code, language)} ({c.code})
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            t('pricesSearchPlaceholder') || 'напр. вкладання плитки формат 120на 60'
          }
          className="w-full pl-10 pr-10 py-3 rounded-2xl bg-white/10 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/60"
            aria-label={t('cancel')}
          >
            <X size={16} />
          </button>
        )}
      </div>

      <p className="text-amber-200/70 text-xs mb-4 leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
        {t('pricesDisclaimer') ||
          'Орієнтовні ринкові ціни, не комерційна пропозиція. Перевіряйте актуальність у постачальників.'}
        {' · '}
        {t('pricesUpdated') || 'Оновлено'}: {stats.updatedAt}
      </p>

      <AnimatePresence mode="wait">
        {detail ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-sm text-orange-300/90 hover:text-orange-200 flex items-center gap-1"
            >
              <ArrowLeft size={14} />
              {t('pricesBackToResults') || 'До результатів'}
            </button>

            <div className="bg-white/10 border border-white/10 rounded-2xl p-4 md:p-5">
              <div className="flex items-start gap-2 mb-3">
                <Tag size={16} className="text-orange-400 mt-1 shrink-0" />
                <div>
                  <h2 className="text-lg font-semibold text-white leading-snug">
                    {localizedWorkName(detail.work, language)}
                  </h2>
                  <p className="text-white/40 text-xs mt-1 capitalize">
                    {detail.work.category} · {detail.work.unit}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-black/20 border border-white/5 px-3.5 py-3 mb-4">
                <p className="text-white/45 text-xs mb-1">
                  {t('pricesLabor') || 'Робота (праця)'}
                </p>
                <p className="text-2xl font-semibold text-green-400">
                  {formatMoney(detail.labor.price, detail.labor.currency, locale)}
                  <span className="text-sm font-normal text-white/40"> / {detail.work.unit}</span>
                </p>
                {detail.labor.min != null && detail.labor.max != null && (
                  <p className="text-white/45 text-xs mt-1">
                    {t('pricesRange') || 'Діапазон'}:{' '}
                    {formatMoney(detail.labor.min, detail.labor.currency, locale)} –{' '}
                    {formatMoney(detail.labor.max, detail.labor.currency, locale)}
                  </p>
                )}
                <p className="text-white/30 text-[11px] mt-1.5">
                  {t('pricesUpdated') || 'Оновлено'}: {detail.labor.updatedAt}
                </p>
              </div>

              {detail.bom.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-white/70 text-sm font-medium mb-2">
                    {t('pricesMaterials') || 'Матеріали (BOM на 1 од.)'}
                  </h3>
                  <ul className="space-y-2">
                    {detail.bom.map((row) => (
                      <li
                        key={row.material.id}
                        className="flex justify-between gap-3 text-sm border-b border-white/5 pb-2 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="text-white/85 truncate">
                            {localizedMaterialName(row.material, language)}
                          </p>
                          <p className="text-white/35 text-xs">
                            {row.qtyPerUnit} {row.material.unit} ×{' '}
                            {formatMoney(row.unitPrice.price, row.unitPrice.currency, locale)}
                            {row.notes ? ` · ${row.notes}` : ''}
                          </p>
                        </div>
                        <p className="text-white/70 shrink-0 tabular-nums">
                          {formatMoney(row.lineTotal, row.unitPrice.currency, locale)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.buyLinks.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-white/70 text-sm font-medium mb-2 flex items-center gap-1.5">
                    <ShoppingBag size={14} />
                    {t('pricesWhereToBuy') || 'Де купити'}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {detail.buyLinks.map((link) => (
                      <a
                        key={`${link.supplier.id}-${link.productUrl}`}
                        href={link.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm text-white/80"
                      >
                        <span className="truncate">
                          {link.supplier.name}
                          <span className="text-white/35"> · {link.materialName}</span>
                        </span>
                        <ExternalLink size={14} className="text-white/35 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {detail.youtube.length > 0 && (
                <div>
                  <h3 className="text-white/70 text-sm font-medium mb-2 flex items-center gap-1.5">
                    <PlayCircle size={14} />
                    YouTube
                  </h3>
                  <div className="flex flex-col gap-2">
                    {detail.youtube.map((yt) => (
                      <a
                        key={yt.url + yt.title}
                        href={yt.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm text-white/80"
                      >
                        <span className="truncate">
                          {yt.title}
                          <span className="text-white/35"> · {yt.lang.toUpperCase()}</span>
                        </span>
                        <ExternalLink size={14} className="text-white/35 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {hits.length === 0 ? (
              <p className="text-white/45 text-sm text-center py-10">
                {t('pricesNoResults') || 'Нічого не знайдено. Спробуйте інший запит.'}
              </p>
            ) : (
              hits.map((hit, i) => (
                <motion.button
                  key={hit.work.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  onClick={() => setSelectedId(hit.work.id)}
                  className="w-full text-left px-4 py-3.5 rounded-2xl bg-white/10 border border-white/10 hover:bg-white/15 hover:border-orange-500/30 transition-all"
                >
                  <div className="flex justify-between gap-3 items-start">
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">
                        {localizedWorkName(hit.work, language)}
                      </p>
                      <p className="text-white/35 text-xs mt-0.5 capitalize">
                        {hit.work.category} · {hit.work.unit}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-green-400 font-semibold tabular-nums">
                        {formatMoney(hit.labor.price, hit.labor.currency, locale)}
                      </p>
                      <p className="text-white/30 text-[11px]">/ {hit.work.unit}</p>
                    </div>
                  </div>
                </motion.button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
