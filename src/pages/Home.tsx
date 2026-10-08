import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { QuickActionsBar } from '../components/QuickActionsBar';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { computeHomeMoney } from '../lib/homeMoney';
import {
  createProject,
  listProjects,
  addWorkItem,
  ProjectsSchemaMissingError,
  type Project,
} from '../lib/projectsApi';
import {
  getStoredPriceCountry,
  getWorkDetailLocal,
  localizedWorkName,
} from '../lib/priceCatalog';
import { CATALOG_WORKS } from '../data/priceCatalogSeed';

const DEFAULT_WORK_ID = 'work-gypsum-plaster';
const DEFAULT_AREA = 150;
const DEFAULT_PRICE = 25;

function formatEuro(v: number, digits = 0) {
  return (
    new Intl.NumberFormat('uk-UA', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(v) + ' €'
  );
}

function formatEuroBalance(v: number) {
  return (
    new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v) + ' €'
  );
}

export const Home: React.FC = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();

  const [projectOpen, setProjectOpen] = useState(false);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [currency, setCurrency] = useState('EUR');

  const [workId, setWorkId] = useState(DEFAULT_WORK_ID);
  const [area, setArea] = useState(DEFAULT_AREA);
  const [pricePerM2, setPricePerM2] = useState(DEFAULT_PRICE);
  const priceCountry = getStoredPriceCountry();

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, clients(name)')
        .eq('user_id', session?.user?.id || '')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!session?.user?.id,
  });

  const { data: expenseDocuments = [] } = useQuery({
    queryKey: ['expense_documents', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_documents')
        .select('*')
        .eq('user_id', session?.user?.id || '');

      if (error) throw error;
      return data || [];
    },
    enabled: !!session?.user?.id,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-count', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, address')
        .eq('user_id', session?.user?.id || '')
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!session?.user?.id,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjects,
    retry: false,
  });

  const uploadedInvoices = invoices.filter((inv) => inv.source === 'uploaded' || inv.uploaded_pdf_url);
  const incomeInvoices = invoices.filter((inv) => !(inv.source === 'uploaded' || inv.uploaded_pdf_url));

  const expenseInvoiceIds = new Set(
    expenseDocuments.map((exp: { invoice_id?: string | null }) => exp.invoice_id).filter((id) => !!id)
  );

  const uploadedExpenses = uploadedInvoices
    .filter((inv) => !expenseInvoiceIds.has(inv.id))
    .map((inv) => ({
      total_amount: Number(inv.uploaded_amount ?? inv.total_gross ?? inv.total_net ?? 0),
      document_date: inv.date || inv.created_at,
      created_at: inv.created_at,
    }));

  const mergedExpenses = [...expenseDocuments, ...uploadedExpenses];
  const money = computeHomeMoney(incomeInvoices, mergedExpenses);
  const invoiceCount = incomeInvoices.length;
  const lastProject = (projects as Project[])[0];

  const workOptions = useMemo(
    () =>
      [...CATALOG_WORKS].sort((a, b) =>
        localizedWorkName(a, language).localeCompare(localizedWorkName(b, language), language)
      ),
    [language]
  );

  const detail = useMemo(() => getWorkDetailLocal(workId, priceCountry), [workId, priceCountry]);

  // When user picks another work, seed selling price from catalog labor.
  // Skip first mount so mockup defaults (150 m² / 25 €) stay intact.
  const skipPriceSeed = useRef(true);
  useEffect(() => {
    if (skipPriceSeed.current) {
      skipPriceSeed.current = false;
      return;
    }
    if (!detail) return;
    const labor = Number(detail.labor?.price);
    if (Number.isFinite(labor) && labor > 0) {
      setPricePerM2(Math.round(labor * 1.15 * 100) / 100);
    }
  }, [workId]); // eslint-disable-line react-hooks/exhaustive-deps

  const materialsPerM2 = useMemo(() => {
    if (!detail) return 0;
    return detail.bom.reduce((sum, row) => sum + row.lineTotal, 0);
  }, [detail]);

  const laborPerM2 = Number(detail?.labor?.price) || 0;

  const materials = Math.round(materialsPerM2 * area);
  const brigade = Math.round(laborPerM2 * area);
  const totalCosts = materials + brigade;
  const clientCost = Math.round(pricePerM2 * area);
  const profit = clientCost - totalCosts;
  const profitPct = clientCost > 0 ? Math.round((profit / clientCost) * 100) : 0;

  const bumpArea = (delta: number) => setArea((a) => Math.max(0, Math.round((a + delta) * 10) / 10));
  const bumpPrice = (delta: number) =>
    setPricePerM2((p) => Math.max(0, Math.round((p + delta) * 100) / 100));

  const createMut = useMutation({
    mutationFn: () =>
      createProject({
        name,
        client_id: clientId || null,
        client_name: clientName || null,
        address: address || null,
        currency,
      }),
    onSuccess: (project) => {
      showSuccess(t('projectCreated') || 'Project created');
      qc.invalidateQueries({ queryKey: ['projects'] });
      setProjectOpen(false);
      setName('');
      setClientId('');
      setClientName('');
      setAddress('');
      navigate(`/projects/${project.id}`);
    },
    onError: (err) => {
      if (err instanceof ProjectsSchemaMissingError) {
        showError(t('projectsSchemaMissing') || 'Apply Supabase migration for projects');
        return;
      }
      showError(t('projectCreateFailed') || 'Could not create project');
    },
  });

  const addToProjectMut = useMutation({
    mutationFn: async () => {
      if (!lastProject) throw new Error('no-project');
      const work = detail?.work;
      return addWorkItem({
        project_id: lastProject.id,
        title: work ? localizedWorkName(work, language) : 'Work',
        category: work?.category || 'other',
        catalog_work_id: work?.id || null,
        quantity: area,
        unit: work?.unit || 'm2',
        unit_price: pricePerM2,
      });
    },
    onSuccess: () => {
      showSuccess(t('projectWorkAdded') || 'Роботу додано до проекту');
      qc.invalidateQueries({ queryKey: ['projects'] });
      if (lastProject) navigate(`/projects/${lastProject.id}`);
    },
    onError: (err) => {
      if (err instanceof ProjectsSchemaMissingError) {
        showError(t('projectsSchemaMissing') || 'Apply Supabase migration for projects');
        return;
      }
      showError(t('projectCreateFailed') || 'Could not add work');
    },
  });

  const onPickClient = (id: string) => {
    setClientId(id);
    const c = clients.find((x: { id: string }) => x.id === id);
    if (c) {
      setClientName(c.name || '');
      if (c.address) setAddress(c.address);
    } else {
      setClientName('');
    }
  };

  const onQuickWork = () => {
    if (lastProject) {
      addToProjectMut.mutate();
      return;
    }
    setProjectOpen(true);
  };

  const balanceLabel =
    t('totalBalance') === 'totalBalance' ? 'Загальний баланс' : t('totalBalance');
  const inputLabel = 'Вхідні дані';
  const workLabel = 'Робота';
  const areaLabel = 'Площа, м²';
  const priceLabel = 'Ціна за м², €';
  const materialsLabel = 'Матеріали';
  const brigadeLabel = 'Зарплата бригади';
  const totalCostsLabel = 'Разом витрат';
  const clientCostLabel = 'Вартість для клієнта';
  const profitLabel = 'Прогнозований прибуток';
  const accountsLabel = 'Рахунків';

  return (
    <div className="cpc-page px-3 w-full max-w-[430px] mx-auto min-w-0 flex flex-col gap-2">
      {/* 1. Balance card */}
      <div className="cpc-card flex items-center justify-between gap-2">
        <div>
          <small className="cpc-card-label">{balanceLabel}</small>
          <b className="block text-[18px] font-medium cpc-copper tabular-nums">
            {formatEuroBalance(money.profit)}
          </b>
        </div>
        <div className="text-right cpc-muted text-[12px] shrink-0">
          {accountsLabel}:{' '}
          <b style={{ color: 'var(--cpc-text)' }}>{invoiceCount}</b>
        </div>
      </div>

      {/* 2. Input data card */}
      <div className="cpc-card">
        <small className="cpc-card-label">{inputLabel}</small>

        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-[12px]" style={{ color: 'var(--cpc-text)' }}>
            {workLabel}
          </span>
          <select
            value={workId}
            onChange={(e) => setWorkId(e.target.value)}
            className="cpc-input-pill text-[12px] min-w-[130px] max-w-[58%] truncate appearance-none"
            style={{ color: 'var(--cpc-text)' }}
            aria-label={workLabel}
          >
            {workOptions.map((w) => (
              <option key={w.id} value={w.id}>
                {localizedWorkName(w, language)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-[12px]" style={{ color: 'var(--cpc-text)' }}>
            {areaLabel}
          </span>
          <div className="inline-flex items-center gap-1">
            <button type="button" className="cpc-step" onClick={() => bumpArea(-1)} aria-label="−">
              −
            </button>
            <b
              className="min-w-[44px] text-center font-medium tabular-nums text-[13px]"
              style={{ color: 'var(--cpc-text)' }}
            >
              {area}
            </b>
            <button type="button" className="cpc-step" onClick={() => bumpArea(1)} aria-label="+">
              +
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-[12px]" style={{ color: 'var(--cpc-text)' }}>
            {priceLabel}
          </span>
          <div className="inline-flex items-center gap-1">
            <button type="button" className="cpc-step" onClick={() => bumpPrice(-1)} aria-label="−">
              −
            </button>
            <b
              className="min-w-[44px] text-center font-medium tabular-nums text-[13px]"
              style={{ color: 'var(--cpc-text)' }}
            >
              {pricePerM2.toFixed(2).replace('.', ',')}
            </b>
            <button type="button" className="cpc-step" onClick={() => bumpPrice(1)} aria-label="+">
              +
            </button>
          </div>
        </div>
      </div>

      {/* 3. Results */}
      <div className="cpc-card">
        <div className="flex items-center justify-between gap-2">
          <span className="cpc-muted text-[12px]">{materialsLabel}</span>
          <span className="tabular-nums text-[12px]" style={{ color: 'var(--cpc-text)' }}>
            {formatEuro(materials)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="cpc-muted text-[12px]">{brigadeLabel}</span>
          <span className="tabular-nums text-[12px]" style={{ color: 'var(--cpc-text)' }}>
            {formatEuro(brigade)}
          </span>
        </div>
        <div
          className="flex items-center justify-between gap-2 mt-1 pt-1"
          style={{ borderTop: '1px solid var(--cpc-line)' }}
        >
          <b className="font-medium text-[12px]" style={{ color: 'var(--cpc-text)' }}>
            {totalCostsLabel}
          </b>
          <b className="font-medium tabular-nums text-[12px]" style={{ color: 'var(--cpc-text)' }}>
            {formatEuro(totalCosts)}
          </b>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="cpc-muted text-[12px]">{clientCostLabel}</span>
        <b className="text-[16px] font-medium tabular-nums" style={{ color: 'var(--cpc-text)' }}>
          {formatEuro(clientCost)}
        </b>
      </div>

      {/* 4. Copper profit banner */}
      <div className="cpc-profit">
        <div className="text-[11px]">{profitLabel}</div>
        <div className="flex items-end justify-between gap-2">
          <b className="text-[22px] font-medium tabular-nums leading-tight">{formatEuro(profit)}</b>
          <b className="text-[12px] font-medium tabular-nums">{profitPct}%</b>
        </div>
      </div>

      {/* Spacer before sticky quick actions */}
      <div className="flex-1 min-h-[8px]" aria-hidden />

      {/* 5. Quick actions — sticky above BottomNav */}
      <div
        className="fixed inset-x-0 z-40 px-3 pointer-events-none"
        style={{ bottom: 'calc(52px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-[430px] mx-auto pointer-events-auto">
          <QuickActionsBar
            handlers={{
              onWork: onQuickWork,
              onExpense: () => navigate('/scan'),
              onAdvance: () =>
                lastProject ? navigate(`/projects/${lastProject.id}`) : navigate('/projects'),
              onPdf: () => navigate('/pdf-creator'),
            }}
          />
        </div>
      </div>
      <div className="h-16" aria-hidden />

      <AnimatePresence>
        {projectOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 px-2 pb-2 sm:pb-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setProjectOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[430px] p-4"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 16,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold" style={{ color: 'var(--cpc-text)' }}>
                  {t('projectNew') || 'New project'}
                </h2>
                <button
                  type="button"
                  onClick={() => setProjectOpen(false)}
                  className="w-10 h-10 flex items-center justify-center bg-transparent border-0"
                  style={{ color: 'var(--cpc-muted)' }}
                  aria-label={t('cancel')}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <Input
                  label={t('projectName') || 'Name'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('projectNamePlaceholder') || 'e.g. Flat renovation'}
                />
                {clients.length > 0 && (
                  <Select
                    label={t('clients') || 'Client'}
                    value={clientId}
                    onChange={(e) => onPickClient(e.target.value)}
                  >
                    <option value="">
                      {t('noClient') || 'No client'} / {t('projectCustomClient') || 'custom'}
                    </option>
                    {clients.map((c: { id: string; name: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
                <Input
                  label={t('clientName')}
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    if (clientId) setClientId('');
                  }}
                />
                <Input
                  label={t('address')}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                <Input
                  label={t('currency')}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                />
                <Button
                  className="w-full min-h-[48px]"
                  style={{ background: 'var(--cpc-copper)', color: 'var(--cpc-on-copper)' }}
                  disabled={!name.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}
                >
                  {createMut.isPending ? t('saving') || 'Saving…' : t('save')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
