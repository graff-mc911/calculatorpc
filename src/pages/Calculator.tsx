import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useQuickActionHandlers } from '../components/QuickActionsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { POPULAR_TEMPLATES } from '../lib/calcTemplates';
import { computeHomeMoney } from '../lib/homeMoney';
import { getLastProjectId } from '../lib/lastProject';
import {
  getStoredPriceCountry,
  getWorkDetailLocal,
} from '../lib/priceCatalog';
import {
  addWorkItem,
  listProjects,
  ProjectsSchemaMissingError,
  type Project,
} from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

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

export default function Calculator() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();

  const [workId, setWorkId] = useState(DEFAULT_WORK_ID);
  const [area, setArea] = useState(DEFAULT_AREA);
  const [pricePerM2, setPricePerM2] = useState(DEFAULT_PRICE);
  const [projectSheet, setProjectSheet] = useState(false);
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
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, clients(name)')
        .eq('user_id', session?.user?.id || '')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: expenseDocuments = [] } = useQuery({
    queryKey: ['expense_documents', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_documents')
        .select('*')
        .eq('user_id', session?.user?.id || '');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjects,
    retry: false,
  });

  const uploadedInvoices = invoices.filter(
    (inv) => inv.source === 'uploaded' || inv.uploaded_pdf_url
  );
  const incomeInvoices = invoices.filter(
    (inv) => !(inv.source === 'uploaded' || inv.uploaded_pdf_url)
  );
  const expenseInvoiceIds = new Set(
    expenseDocuments
      .map((exp: { invoice_id?: string | null }) => exp.invoice_id)
      .filter((id) => !!id)
  );
  const uploadedExpenses = uploadedInvoices
    .filter((inv) => !expenseInvoiceIds.has(inv.id))
    .map((inv) => ({
      total_amount: Number(inv.uploaded_amount ?? inv.total_gross ?? inv.total_net ?? 0),
      document_date: inv.date || inv.created_at,
      created_at: inv.created_at,
    }));
  const money = computeHomeMoney(incomeInvoices, [...expenseDocuments, ...uploadedExpenses]);
  const invoiceCount = incomeInvoices.length;

  const workOptions = POPULAR_TEMPLATES;
  const activeTpl = workOptions.find((w) => w.catalogWorkId === workId) || workOptions[0];
  const detail = useMemo(
    () => getWorkDetailLocal(workId, priceCountry),
    [workId, priceCountry]
  );

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

  const bumpArea = (delta: number) =>
    setArea((a) => Math.max(0, Math.round((a + delta) * 10) / 10));
  const bumpPrice = (delta: number) =>
    setPricePerM2((p) => Math.max(0, Math.round((p + delta) * 100) / 100));

  const resolveTargetProject = (): Project | null => {
    const list = projects as Project[];
    if (!list.length) return null;
    const last = getLastProjectId();
    if (last) {
      const found = list.find((p) => p.id === last);
      if (found) return found;
    }
    return list[0] || null;
  };

  const addMut = useMutation({
    mutationFn: async (projectId: string) => {
      const work = detail?.work;
      return addWorkItem({
        project_id: projectId,
        title: activeTpl?.title || work?.names?.uk || 'Робота',
        category: activeTpl?.category || work?.category || 'other',
        catalog_work_id: work?.id || workId,
        quantity: area,
        unit: work?.unit || 'm2',
        unit_price: pricePerM2,
      });
    },
    onSuccess: (_item, projectId) => {
      showSuccess(t('projectWorkAdded') || 'Роботу додано до об’єкта');
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-bundle', projectId] });
      qc.invalidateQueries({ queryKey: ['projects-work-summary'] });
      setProjectSheet(false);
      navigate(`/projects/${projectId}`);
    },
    onError: (err) => {
      if (err instanceof ProjectsSchemaMissingError) {
        showError(t('projectsSchemaMissing') || 'Apply projects migration');
        return;
      }
      showError('Не вдалося додати. Перевірте кількість і ціну.');
    },
  });

  const onAddWork = () => {
    const list = projects as Project[];
    if (list.length === 0) {
      showError('Спочатку створіть об’єкт');
      navigate('/projects');
      return;
    }
    if (list.length === 1) {
      addMut.mutate(list[0].id);
      return;
    }
    const resolved = resolveTargetProject();
    if (resolved && list.length > 1) {
      setProjectSheet(true);
      return;
    }
    setProjectSheet(true);
  };

  const goProjectAction = (add: 'expense' | 'prepayment') => {
    const p = resolveTargetProject();
    if (!p) {
      showError('Спочатку створіть об’єкт');
      navigate('/projects');
      return;
    }
    navigate(`/projects/${p.id}?add=${add}`);
  };

  useQuickActionHandlers({
    onWork: onAddWork,
    onExpense: () => goProjectAction('expense'),
    onAdvance: () => goProjectAction('prepayment'),
    onPdf: () => navigate('/pdf-creator'),
  });

  const balanceLabel =
    t('totalBalance') === 'totalBalance' ? 'Загальний баланс' : t('totalBalance');
  const inputLabel = t('inputData') === 'inputData' ? 'Вхідні дані' : t('inputData');
  const workLabel = t('work') === 'work' ? 'Робота' : t('work');
  const areaLabel = 'Площа, м²';
  const priceLabel = 'Ціна за м², €';
  const materialsLabel =
    t('expenseCat_materials') === 'expenseCat_materials'
      ? 'Матеріали'
      : t('expenseCat_materials');
  const brigadeLabel = 'Зарплата бригади';
  const totalCostsLabel = 'Разом витрат';
  const clientCostLabel = 'Вартість для клієнта';
  const profitLabel =
    t('projectProfit') === 'projectProfit' ? 'Прогнозований прибуток' : t('projectProfit');
  const accountsLabel = 'Рахунків';

  return (
    <div className="cpc-page px-3 w-full max-w-[430px] mx-auto min-w-0 flex flex-col gap-2 pb-4">
      {/* 1. Balance */}
      <div className="cpc-card flex items-center justify-between gap-2">
        <div className="min-w-0">
          <small className="cpc-card-label">{balanceLabel}</small>
          <b className="block text-[18px] font-medium cpc-copper tabular-nums truncate">
            {formatEuroBalance(money.profit)}
          </b>
        </div>
        <div className="text-right cpc-muted text-[12px] shrink-0">
          {accountsLabel}:{' '}
          <b style={{ color: 'var(--cpc-text)' }}>{invoiceCount}</b>
        </div>
      </div>

      {/* 2. Input data */}
      <div className="cpc-card">
        <small className="cpc-card-label">{inputLabel}</small>

        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-[12px]" style={{ color: 'var(--cpc-text)' }}>
            {workLabel}
          </span>
          <select
            value={workId}
            onChange={(e) => setWorkId(e.target.value)}
            className="cpc-input-pill text-[12px] min-h-[44px] min-w-[130px] max-w-[58%] truncate appearance-none"
            style={{ color: 'var(--cpc-text)' }}
            aria-label={workLabel}
          >
            {workOptions.map((w) => (
              <option key={w.id} value={w.catalogWorkId || w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-[12px]" style={{ color: 'var(--cpc-text)' }}>
            {areaLabel}
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              className="cpc-step min-h-[44px] min-w-[44px]"
              style={{ width: 44, height: 44 }}
              onClick={() => bumpArea(-1)}
              aria-label="−"
            >
              −
            </button>
            <b
              className="min-w-[44px] text-center font-medium tabular-nums text-[13px]"
              style={{ color: 'var(--cpc-text)' }}
            >
              {area}
            </b>
            <button
              type="button"
              className="cpc-step min-h-[44px] min-w-[44px]"
              style={{ width: 44, height: 44 }}
              onClick={() => bumpArea(1)}
              aria-label="+"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-[12px]" style={{ color: 'var(--cpc-text)' }}>
            {priceLabel}
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              className="cpc-step min-h-[44px] min-w-[44px]"
              style={{ width: 44, height: 44 }}
              onClick={() => bumpPrice(-1)}
              aria-label="−"
            >
              −
            </button>
            <b
              className="min-w-[44px] text-center font-medium tabular-nums text-[13px]"
              style={{ color: 'var(--cpc-text)' }}
            >
              {pricePerM2.toFixed(2).replace('.', ',')}
            </b>
            <button
              type="button"
              className="cpc-step min-h-[44px] min-w-[44px]"
              style={{ width: 44, height: 44 }}
              onClick={() => bumpPrice(1)}
              aria-label="+"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 3. Cost breakdown */}
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

      {/* 4. Profit banner */}
      <div className="cpc-profit">
        <div className="text-[11px]">{profitLabel}</div>
        <div className="flex items-end justify-between gap-2">
          <b className="text-[22px] font-medium tabular-nums leading-tight">
            {formatEuro(profit)}
          </b>
          <b className="text-[12px] font-medium tabular-nums">{profitPct}%</b>
        </div>
      </div>

      <AnimatePresence>
        {projectSheet && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-2 pb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setProjectSheet(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[430px] max-h-[70vh] overflow-y-auto p-4"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 16,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold" style={{ color: 'var(--cpc-text)' }}>
                  Обрати об’єкт
                </h2>
                <button
                  type="button"
                  onClick={() => setProjectSheet(false)}
                  className="w-11 h-11 bg-transparent border-0"
                  style={{ color: 'var(--cpc-muted)' }}
                  aria-label={t('cancel') || 'Скасувати'}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-1.5">
                {(projects as Project[]).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={addMut.isPending}
                    onClick={() => addMut.mutate(p.id)}
                    className="w-full text-left min-h-[52px] px-3 py-2"
                    style={{
                      background: 'var(--cpc-bg)',
                      border: '1px solid var(--cpc-line)',
                      borderRadius: 10,
                      color: 'var(--cpc-text)',
                    }}
                  >
                    <b className="block text-[14px] font-medium truncate">{p.name}</b>
                    {p.client_name && (
                      <span className="cpc-muted text-[12px]">{p.client_name}</span>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
