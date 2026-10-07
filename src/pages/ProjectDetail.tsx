import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Minus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { QuickActionsBar } from '../components/QuickActionsBar';
import { MoneyInput, QtyInput } from '../components/projects/MoneyInput';
import { EXPENSE_CATEGORIES, categoryI18nKey } from '../lib/expenseCategories';
import {
  formatCurrency,
  formatMoneyInput,
  formatQtyDisplay,
  parseMoneyInput,
} from '../lib/moneyMask';
import { computeProjectMetrics, lineTotal } from '../lib/projectMetrics';
import { shareProjectEstimatePdf, type ProjectPdfMode } from '../lib/projectPdf';
import {
  PROJECT_STATUSES,
  addExpense,
  addPrepayment,
  addWorkItem,
  deleteExpense,
  deletePrepayment,
  deleteProject,
  deleteWorkItem,
  fetchProjectBundle,
  ProjectsSchemaMissingError,
  updateProject,
  updateWorkItem,
  uploadProjectReceipt,
  type ProjectStatus,
  type ProjectWorkItem,
} from '../lib/projectsApi';
import { CATALOG_WORKS, type WorkCategory } from '../data/priceCatalogSeed';
import {
  getStoredPriceCountry,
  localizedCategoryName,
  localizedWorkName,
} from '../lib/priceCatalog';
import { translateUnit } from '../lib/languages';
import { supabase } from '../lib/supabase';

type Tab = 'works' | 'expenses' | 'prepayments';
type Sheet = null | 'work' | 'expense' | 'prepayment' | 'pdf';

/** All catalog categories that have seed works (skip empty `other`). */
const TEMPLATE_GROUPS: WorkCategory[] = [
  'demolition',
  'masonry',
  'concrete',
  'drywall',
  'plaster',
  'tiling',
  'paint',
  'flooring',
  'plumbing',
  'electrical',
  'roofing',
  'insulation',
  'facade',
  'doors_windows',
  'outdoor',
];

const STAGE_PRESETS = [
  { id: 'Bathroom', en: 'Bathroom', uk: 'Ванна', de: 'Bad' },
  { id: 'Kitchen', en: 'Kitchen', uk: 'Кухня', de: 'Küche' },
  { id: 'Living', en: 'Living', uk: 'Вітальня', de: 'Wohnzimmer' },
  { id: 'Hall', en: 'Hall', uk: 'Коридор', de: 'Flur' },
  { id: 'Facade', en: 'Facade', uk: 'Фасад', de: 'Fassade' },
  { id: 'Roof', en: 'Roof', uk: 'Дах', de: 'Dach' },
] as const;

function statusLabel(status: string, t: (k: string) => string): string {
  const key = `projectStatus_${status}`;
  const v = t(key);
  return v === key ? status.replace('_', ' ') : v;
}

function statusChipClass(status: string): string {
  switch (status) {
    case 'draft':
      return 'cpc-badge-draft border-transparent';
    case 'in_progress':
      return 'cpc-badge-wait border-transparent';
    case 'completed':
      return 'cpc-badge-paid border-transparent';
    case 'paid':
      return 'cpc-badge-paid border-transparent';
    default:
      return 'cpc-badge-draft border-transparent';
  }
}

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();
  const receiptRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('works');
  const [sheet, setSheet] = useState<Sheet>(null);

  const [workCategory, setWorkCategory] = useState<WorkCategory>('tiling');
  const [templateId, setTemplateId] = useState('');
  const [workTitle, setWorkTitle] = useState('');
  const [workGroup, setWorkGroup] = useState('');
  const [workQty, setWorkQty] = useState('1');
  const [workUnit, setWorkUnit] = useState('m2');
  const [workPrice, setWorkPrice] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ tiling: true });

  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('materials');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expReceipt, setExpReceipt] = useState<File | null>(null);

  const [prepAmount, setPrepAmount] = useState('');
  const [prepDate, setPrepDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [prepNote, setPrepNote] = useState('');

  const [budgetDraft, setBudgetDraft] = useState('');
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({});
  const [editingMeta, setEditingMeta] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [addressDraft, setAddressDraft] = useState('');

  const { data: bundle, isLoading, error, isError } = useQuery({
    queryKey: ['project-bundle', id],
    enabled: !!id,
    queryFn: () => fetchProjectBundle(id),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-picker'],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return [];
      const { data, error: err } = await supabase
        .from('clients')
        .select('id, name, address')
        .eq('user_id', uid)
        .order('name');
      if (err) return [];
      return data || [];
    },
  });

  const schemaMissing = isError && error instanceof ProjectsSchemaMissingError;

  useEffect(() => {
    if (!bundle) return;
    setNameDraft(bundle.project.name || '');
    setAddressDraft(bundle.project.address || '');
    setBudgetDraft(
      Number(bundle.project.expense_budget)
        ? formatMoneyInput(Number(bundle.project.expense_budget), 2)
        : ''
    );
    const qd: Record<string, string> = {};
    const pd: Record<string, string> = {};
    const gd: Record<string, string> = {};
    for (const w of bundle.workItems) {
      qd[w.id] = formatQtyDisplay(Number(w.quantity));
      pd[w.id] = formatMoneyInput(Number(w.unit_price), 2);
      gd[w.id] = w.group_key || '';
    }
    setQtyDrafts(qd);
    setPriceDrafts(pd);
    setGroupDrafts(gd);
  }, [
    bundle?.project.updated_at,
    bundle?.workItems.map((w) => `${w.id}:${w.quantity}:${w.unit_price}:${w.group_key}`).join('|'),
  ]);

  const metrics = useMemo(() => {
    if (!bundle) return computeProjectMetrics([], [], [], 0);
    return computeProjectMetrics(
      bundle.workItems,
      bundle.expenses,
      bundle.prepayments,
      Number(bundle.project.expense_budget) || 0
    );
  }, [bundle]);

  const groupedWorks = useMemo(() => {
    const items = bundle?.workItems || [];
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const key = (item.group_key || '').trim() || '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [bundle?.workItems]);

  const templatesByCat = useMemo(() => {
    const map: Record<string, typeof CATALOG_WORKS> = {};
    for (const cat of TEMPLATE_GROUPS) {
      map[cat] = CATALOG_WORKS.filter((w) => w.category === cat);
    }
    return map;
  }, []);

  const priceCountry = getStoredPriceCountry();
  const currencySymbol =
    bundle?.project.currency === 'UAH' ? '₴' : bundle?.project.currency === 'USD' ? '$' : '€';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['project-bundle', id] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['projects-work-summary'] });
    qc.invalidateQueries({ queryKey: ['projects-money-summary'] });
  };

  const onSchemaErr = (err: unknown) => {
    if (err instanceof ProjectsSchemaMissingError) {
      showError(t('projectsSchemaMissing') || 'Apply projects migration in Supabase');
      return;
    }
    showError(t('saveFailed') || 'Save failed');
  };

  const addWorkMut = useMutation({
    mutationFn: async () => {
      const qty = parseMoneyInput(workQty);
      const price = parseMoneyInput(workPrice);
      if (!workTitle.trim() || !Number.isFinite(qty) || qty < 0 || !Number.isFinite(price)) {
        throw new Error('INVALID');
      }
      return addWorkItem({
        project_id: id,
        title: workTitle.trim(),
        category: workCategory,
        catalog_work_id: templateId || null,
        group_key: workGroup,
        quantity: qty,
        unit: workUnit,
        unit_price: price,
        sort_order: bundle?.workItems.length || 0,
      });
    },
    onSuccess: () => {
      showSuccess(t('projectWorkAdded') || 'Work added');
      setSheet(null);
      setWorkTitle('');
      setTemplateId('');
      setWorkQty('1');
      setWorkPrice('');
      invalidate();
    },
    onError: onSchemaErr,
  });

  const addExpMut = useMutation({
    mutationFn: async () => {
      const amount = parseMoneyInput(expAmount);
      if (!expTitle.trim() || !Number.isFinite(amount) || amount < 0) throw new Error('INVALID');
      let receipt_url: string | null = null;
      if (expReceipt) {
        receipt_url = await uploadProjectReceipt(id, expReceipt, expReceipt.name);
      }
      return addExpense({
        project_id: id,
        title: expTitle.trim(),
        category: expCategory,
        amount,
        expense_date: expDate,
        receipt_url,
      });
    },
    onSuccess: () => {
      showSuccess(t('projectExpenseAdded') || 'Expense added');
      setSheet(null);
      setExpTitle('');
      setExpAmount('');
      setExpReceipt(null);
      invalidate();
    },
    onError: onSchemaErr,
  });

  const addPrepMut = useMutation({
    mutationFn: async () => {
      const amount = parseMoneyInput(prepAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('INVALID');
      return addPrepayment({
        project_id: id,
        amount,
        paid_at: prepDate,
        note: prepNote || null,
      });
    },
    onSuccess: () => {
      showSuccess(t('projectPrepaymentAdded') || 'Prepayment added');
      setSheet(null);
      setPrepAmount('');
      setPrepNote('');
      invalidate();
    },
    onError: onSchemaErr,
  });

  const saveStatus = async (status: ProjectStatus) => {
    try {
      await updateProject(id, { status });
      showSuccess(t('saved') || 'Saved');
      invalidate();
    } catch (err) {
      onSchemaErr(err);
    }
  };

  const saveClient = async (clientId: string) => {
    const c = clients.find((x: { id: string }) => x.id === clientId);
    try {
      await updateProject(id, {
        client_id: clientId || null,
        client_name: c?.name || null,
        address: c?.address || bundle?.project.address || null,
      });
      invalidate();
    } catch (err) {
      onSchemaErr(err);
    }
  };

  const budgetMut = useMutation({
    mutationFn: async () => {
      const n = parseMoneyInput(budgetDraft);
      if (!Number.isFinite(n) || n < 0) throw new Error('INVALID');
      return updateProject(id, { expense_budget: n });
    },
    onSuccess: () => {
      showSuccess(t('saved') || 'Saved');
      invalidate();
    },
    onError: onSchemaErr,
  });

  const metaMut = useMutation({
    mutationFn: async () => {
      const name = nameDraft.trim();
      if (!name) throw new Error('INVALID');
      return updateProject(id, {
        name,
        address: addressDraft.trim() || null,
      });
    },
    onSuccess: () => {
      showSuccess(t('saved') || 'Saved');
      setEditingMeta(false);
      invalidate();
    },
    onError: onSchemaErr,
  });

  const pdfMut = useMutation({
    mutationFn: async (mode: ProjectPdfMode) => {
      if (!bundle) throw new Error('NO_PROJECT');
      let company: Record<string, unknown> = {
        company_name: 'Construction Project Calculator',
        company_address: '',
        company_phone: '',
        company_email: '',
      };
      const { data } = await supabase
        .from('company_profile')
        .select('*')
        .eq('user_id', bundle.project.user_id)
        .maybeSingle();
      if (data) {
        const { toPdfCompany } = await import('../lib/companyProfile');
        company = toPdfCompany(data);
      }
      return shareProjectEstimatePdf({
        project: bundle.project,
        workItems: bundle.workItems,
        expenses: bundle.expenses,
        prepayments: bundle.prepayments,
        company,
        mode,
        labels: {
          estimateTitle: t('projectPdfTitle') || 'Estimate',
          internalTitle: t('projectPdfInternalTitle') || 'Internal cost report',
          client: t('clientName'),
          address: t('address'),
          works: t('projectWorks') || 'Works',
          qty: t('quantity'),
          unit: t('unit'),
          unitPrice: t('price'),
          total: t('total') || 'Total',
          estimateTotal: t('projectEstimate') || 'Estimate',
          received: t('projectReceived') || 'Received',
          balanceDue: t('projectBalanceDue') || 'Balance due',
          overpayment: t('projectOverpayment') || 'Overpayment',
          expenses: t('projectExpenses') || 'Expenses',
          projectedProfit: t('projectProfit') || 'Projected profit',
          margin: t('projectMargin') || 'Margin',
          prepayments: t('projectPrepayments') || 'Prepayments',
          ungrouped: t('projectUngrouped') || 'General',
          date: t('date'),
          note: t('notes'),
          category: t('category') || 'Category',
        },
      });
    },
    onSuccess: (result) => {
      setSheet(null);
      showSuccess(
        result === 'shared'
          ? t('projectPdfShared') || 'Shared'
          : t('projectPdfDownloaded') || 'Downloaded'
      );
    },
    onError: () => showError(t('projectPdfFailed') || 'PDF failed'),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteProject(id),
    onSuccess: () => {
      showSuccess(t('projectDeleted') || 'Deleted');
      navigate('/projects');
    },
    onError: onSchemaErr,
  });

  const applyTemplate = (catalogId: string, cat?: WorkCategory) => {
    setTemplateId(catalogId);
    const work = CATALOG_WORKS.find((w) => w.id === catalogId);
    if (!work) return;
    if (cat) setWorkCategory(cat);
    else setWorkCategory(work.category as WorkCategory);
    setWorkTitle(localizedWorkName(work, language));
    setWorkUnit(work.unit);
    const labor = work.labor[priceCountry];
    if (labor) setWorkPrice(formatMoneyInput(labor.price, 2));
  };

  const bumpQty = async (itemId: string, quantity: number, delta: number) => {
    const base = Number.isFinite(quantity) ? quantity : 0;
    const next = Math.max(0, Math.round((base + delta) * 1000) / 1000);
    setQtyDrafts((d) => ({ ...d, [itemId]: formatQtyDisplay(next) }));
    try {
      await updateWorkItem(itemId, { quantity: next });
      invalidate();
    } catch (err) {
      onSchemaErr(err);
    }
  };

  const commitQty = async (itemId: string, raw: string) => {
    const n = parseMoneyInput(raw);
    if (!Number.isFinite(n) || n < 0) return;
    try {
      await updateWorkItem(itemId, { quantity: n });
      invalidate();
    } catch (err) {
      onSchemaErr(err);
    }
  };

  const commitPrice = async (itemId: string, raw: string) => {
    const price = parseMoneyInput(raw);
    if (!Number.isFinite(price)) return;
    try {
      await updateWorkItem(itemId, { unit_price: price });
      invalidate();
    } catch (err) {
      onSchemaErr(err);
    }
  };

  const commitGroup = async (itemId: string, group_key: string) => {
    try {
      await updateWorkItem(itemId, { group_key });
      invalidate();
    } catch (err) {
      onSchemaErr(err);
    }
  };

  if (isLoading) {
    return (
      <div className="cpc-page px-4 cpc-muted text-sm max-w-[430px] mx-auto">
        {t('loading') || 'Loading…'}
      </div>
    );
  }

  if (schemaMissing || !bundle) {
    return (
      <div className="cpc-page px-3 w-full max-w-[430px] mx-auto">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="text-white/60 text-sm mb-4 inline-flex items-center gap-2 min-h-[44px]"
        >
          <ArrowLeft size={16} /> {t('back')}
        </button>
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-amber-100 text-sm">
          {t('projectsSchemaMissing') ||
            'Apply migration 20261006220000_create_project_estimator.sql in Supabase.'}
        </div>
      </div>
    );
  }

  const { project, workItems, expenses, prepayments } = bundle;
  const currency = project.currency || 'EUR';
  const progressPct = Math.round(metrics.expenseProgressCapped * 100);
  const rawProgressPct = Math.round(metrics.expenseProgress * 100);

  return (
    <div className="cpc-page px-3 w-full max-w-[430px] mx-auto min-w-0 pb-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="w-11 h-11 shrink-0 flex items-center justify-center"
          style={{
            background: 'var(--cpc-card)',
            border: '1px solid var(--cpc-line)',
            borderRadius: 12,
            color: 'var(--cpc-text)',
          }}
          aria-label={t('back')}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-medium truncate leading-tight" style={{ color: 'var(--cpc-text)' }}>
            {project.name}
          </h1>
          <p className="text-xs truncate mt-0.5 cpc-muted">
            {project.client_name || t('noClient') || 'No client'}
            {project.address ? ` · ${project.address}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNameDraft(project.name || '');
            setAddressDraft(project.address || '');
            setEditingMeta((v) => !v);
          }}
          className="w-11 h-11 shrink-0 flex items-center justify-center"
          style={{
            background: 'var(--cpc-card)',
            border: '1px solid var(--cpc-line)',
            borderRadius: 12,
            color: 'var(--cpc-muted)',
          }}
          aria-label={t('edit') || 'Edit'}
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t('projectDeleteConfirm') || 'Delete this project?')) {
              deleteMut.mutate();
            }
          }}
          className="w-11 h-11 shrink-0 flex items-center justify-center text-red-300"
          style={{
            background: 'rgba(200,80,80,0.1)',
            border: '1px solid rgba(200,80,80,0.25)',
            borderRadius: 12,
          }}
          aria-label={t('delete')}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {editingMeta && (
        <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3 space-y-2.5">
          <Input
            label={t('projectName') || 'Project name'}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <Input
            label={t('address') || 'Site address'}
            value={addressDraft}
            onChange={(e) => setAddressDraft(e.target.value)}
            placeholder={t('projectAddressPlaceholder') || 'Site / object address'}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              className="flex-1"
              disabled={metaMut.isPending || !nameDraft.trim()}
              onClick={() => metaMut.mutate()}
            >
              {t('save') || 'Save'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setEditingMeta(false)}
            >
              {t('cancel') || 'Cancel'}
            </Button>
          </div>
        </div>
      )}

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PROJECT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => saveStatus(s)}
            className={`min-h-[44px] px-3 rounded-full text-[11px] font-semibold border transition-all ${
              project.status === s
                ? statusChipClass(s)
                : 'bg-transparent text-white/35 border-white/10'
            }`}
          >
            {statusLabel(s, t)}
          </button>
        ))}
      </div>

      {clients.length > 0 && (
        <div className="mb-3">
          <Select
            label={t('clients') || 'Client'}
            value={project.client_id || ''}
            onChange={(e) => saveClient(e.target.value)}
          >
            <option value="">{t('noClient') || 'No client'}</option>
            {clients.map((c: { id: string; name: string }) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Balance + invoice count — calculator mockup header card */}
      <div className="cpc-card flex items-center justify-between gap-2 mb-2">
        <div>
          <small className="cpc-card-label">{t('totalBalance') === 'totalBalance' ? 'Загальний баланс' : t('totalBalance')}</small>
          <b className="block text-[18px] font-medium cpc-copper tabular-nums">
            {formatCurrency(metrics.projectedProfit, currency)}
          </b>
        </div>
        <div className="text-right cpc-muted text-[12px]">
          {t('invoices') || 'Рахунків'}:{' '}
          <b style={{ color: 'var(--cpc-text)' }}>{workItems.length}</b>
        </div>
      </div>

      {/* Metrics dashboard */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        {[
          { label: t('projectEstimate') || 'Estimate', value: metrics.estimateTotal, copper: false },
          { label: t('projectReceived') || 'Received', value: metrics.received, copper: false },
          { label: t('projectBalanceDue') || 'Balance due', value: metrics.balanceDue, copper: true },
          { label: t('projectExpenses') || 'Expenses', value: metrics.expenses, copper: false },
        ].map((m) => (
          <div key={m.label} className="cpc-card">
            <small className="cpc-card-label">{m.label}</small>
            <b
              className={`block text-[15px] font-medium leading-tight tabular-nums ${m.copper ? 'cpc-copper' : ''}`}
              style={m.copper ? undefined : { color: 'var(--cpc-text)' }}
            >
              {formatCurrency(m.value, currency)}
            </b>
          </div>
        ))}
      </div>

      {/* Client cost + profit card (mockup calculator) */}
      <div className="flex items-center justify-between px-0.5 mb-2">
        <span className="cpc-muted text-[12px]">{t('projectEstimate') || 'Вартість для клієнта'}</span>
        <b className="text-[16px] font-medium tabular-nums" style={{ color: 'var(--cpc-text)' }}>
          {formatCurrency(metrics.estimateTotal, currency)}
        </b>
      </div>
      <div className="cpc-profit mb-3">
        <div className="text-[11px]">{t('projectProfit') || 'Прогнозований прибуток'}</div>
        <div className="flex items-center justify-between gap-2">
          <b className="text-[22px] font-medium tabular-nums">
            {formatCurrency(metrics.projectedProfit, currency)}
          </b>
          <b className="text-[12px] font-medium tabular-nums">
            {Number.isFinite(metrics.marginPct) ? `${metrics.marginPct.toFixed(0)}%` : '0%'}
          </b>
        </div>
      </div>

      {/* Overpayment — separate from balance due, never breaks UI */}
      {metrics.overpayment > 0 && (
        <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-3">
          <p className="text-emerald-200/70 text-[10px] uppercase tracking-wider mb-1">
            {t('projectOverpayment') || 'Overpayment'}
          </p>
          <p className="text-emerald-200 text-[15px] font-semibold tabular-nums">
            {formatCurrency(metrics.overpayment, currency)}
          </p>
          <p className="text-emerald-200/50 text-[10px] mt-1">
            {t('projectOverpaymentHint') || 'Prepayments exceed estimate'}
          </p>
        </div>
      )}

      {/* Budget progress — bar capped 100%, exceeded label when over */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3 mb-3">
        <div className="flex items-end justify-between gap-2 mb-2">
          <p className="text-white/50 text-xs pb-2">{t('projectExpenseBudget') || 'Expense budget'}</p>
          <div className="w-36">
            <MoneyInput
              value={budgetDraft}
              onChange={setBudgetDraft}
              onCommit={() => budgetMut.mutate()}
              currencyHint={currencySymbol}
              inputClassName="!py-2 !text-sm"
            />
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className={`h-full ${metrics.budgetExceeded ? 'bg-red-400' : 'bg-teal-400'}`}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <p className="text-white/35 text-[10px] tabular-nums">
            {formatCurrency(metrics.expenses, currency)} /{' '}
            {formatCurrency(metrics.budgetBase, currency)} ({progressPct}%)
          </p>
          {metrics.budgetExceeded && (
            <p className="text-red-300 text-[10px] font-semibold shrink-0">
              {t('projectBudgetExceeded') || 'Budget exceeded'}
              {rawProgressPct > 100 ? ` · ${rawProgressPct}%` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.06] border border-white/10 mb-3">
        {(
          [
            ['works', t('projectWorks') || 'Works'],
            ['expenses', t('projectExpenses') || 'Expenses'],
            ['prepayments', t('projectPrepayments') || 'Prepayments'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 min-h-[44px] text-xs rounded-xl transition-all ${
              tab === key ? 'bg-white/12 text-white font-semibold shadow' : 'text-white/45'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'works' && (
        <div className="space-y-3">
          {workItems.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-6">
              {t('projectWorksEmpty') || 'Add works from templates'}
            </p>
          ) : (
            groupedWorks.map(([groupKey, items]) => (
              <div key={groupKey} className="space-y-2">
                <p className="text-orange-300/80 text-[11px] font-semibold uppercase tracking-wider px-1">
                  {groupKey === '__none__' ? t('projectUngrouped') || 'General' : groupKey}
                </p>
                {items.map((item: ProjectWorkItem) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.03] px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium leading-snug">{item.title}</p>
                        <p className="text-white/35 text-[10px] mt-0.5">
                          {localizedCategoryName(item.category, language)} ·{' '}
                          {translateUnit(item.unit, t)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteWorkItem(item.id, id);
                          invalidate();
                        }}
                        className="w-11 h-11 flex items-center justify-center text-white/30 hover:text-red-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <input
                      value={groupDrafts[item.id] ?? item.group_key ?? ''}
                      onChange={(e) =>
                        setGroupDrafts((d) => ({ ...d, [item.id]: e.target.value }))
                      }
                      onBlur={(e) => commitGroup(item.id, e.target.value.trim())}
                      placeholder={t('projectGroup') || 'Room / stage'}
                      className="w-full mb-2 min-h-[44px] bg-black/25 border border-white/10 rounded-lg text-white/80 text-xs px-2.5 py-2 focus:outline-none focus:border-orange-400/50"
                    />

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="w-11 h-11 flex items-center justify-center rounded-lg bg-black/25 text-white/70 border border-white/10"
                        onClick={() => bumpQty(item.id, Number(item.quantity), -1)}
                        aria-label="−"
                      >
                        <Minus size={16} />
                      </button>
                      <QtyInput
                        value={qtyDrafts[item.id] ?? formatQtyDisplay(Number(item.quantity))}
                        onChange={(v) => setQtyDrafts((d) => ({ ...d, [item.id]: v }))}
                        onCommit={() => commitQty(item.id, qtyDrafts[item.id] ?? '')}
                        ariaLabel={t('quantity')}
                      />
                      <button
                        type="button"
                        className="w-11 h-11 flex items-center justify-center rounded-lg bg-black/25 text-white/70 border border-white/10"
                        onClick={() => bumpQty(item.id, Number(item.quantity), 1)}
                        aria-label="+"
                      >
                        <Plus size={16} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <MoneyInput
                          value={
                            priceDrafts[item.id] ?? formatMoneyInput(Number(item.unit_price), 2)
                          }
                          onChange={(v) => setPriceDrafts((d) => ({ ...d, [item.id]: v }))}
                          onCommit={() => commitPrice(item.id, priceDrafts[item.id] ?? '')}
                          currencyHint={currencySymbol}
                          inputClassName="!py-2.5 !text-sm !rounded-lg"
                        />
                      </div>
                      <span className="text-white/85 text-xs font-semibold tabular-nums shrink-0 w-[76px] text-right">
                        {formatCurrency(lineTotal(item.quantity, item.unit_price), currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'expenses' && (
        <div className="space-y-2">
          {expenses.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-10">
              {t('projectExpensesEmpty') || 'No expenses yet'}
            </p>
          ) : (
            expenses.map((e) => (
              <div
                key={e.id}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3.5 flex items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{e.title}</p>
                  <p className="text-white/35 text-[10px]">
                    {t(categoryI18nKey(e.category)) || e.category} · {e.expense_date}
                  </p>
                </div>
                <p className="text-red-300 text-sm font-semibold tabular-nums shrink-0">
                  {formatCurrency(Number(e.amount), currency)}
                </p>
                {e.receipt_url ? (
                  <a
                    href={e.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-11 h-11 shrink-0 text-sky-300/80 hover:text-sky-200 flex items-center justify-center"
                    aria-label={t('projectReceiptOpen') || 'Open receipt'}
                    title={t('projectReceiptOpen') || 'Open receipt'}
                  >
                    <ExternalLink size={15} />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={async () => {
                    await deleteExpense(e.id, id);
                    invalidate();
                  }}
                  className="w-11 h-11 shrink-0 text-white/30 hover:text-red-300 flex items-center justify-center"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'prepayments' && (
        <div className="space-y-2">
          {prepayments.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-10">
              {t('projectPrepaymentsEmpty') || 'No prepayments yet'}
            </p>
          ) : (
            prepayments.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3.5 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-green-300 text-sm font-semibold tabular-nums">
                    {formatCurrency(Number(p.amount), currency)}
                  </p>
                  <p className="text-white/35 text-[10px]">
                    {p.paid_at}
                    {p.note ? ` · ${p.note}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await deletePrepayment(p.id, id);
                    invalidate();
                  }}
                  className="w-11 h-11 text-white/30 hover:text-red-300 flex items-center justify-center"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Sticky Quick Actions — above BottomNav */}
      <div
        className="fixed inset-x-0 z-40 px-3 pointer-events-none"
        style={{ bottom: 'calc(52px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-[430px] mx-auto pointer-events-auto">
          <QuickActionsBar
            handlers={{
              onWork: () => {
                setTab('works');
                setSheet('work');
              },
              onExpense: () => {
                setTab('expenses');
                setSheet('expense');
              },
              onAdvance: () => {
                setTab('prepayments');
                setSheet('prepayment');
              },
              onPdf: () => setSheet('pdf'),
            }}
          />
        </div>
      </div>
      <div className="h-16" aria-hidden />

      {/* Sheets */}
      <AnimatePresence>
        {sheet && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-2 pb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheet(null)}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[430px] max-h-[88vh] overflow-y-auto rounded-2xl bg-[#24313a] border border-white/10 p-4 pb-6"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm">
                  {sheet === 'work' && (t('projectAddWork') || 'Add work')}
                  {sheet === 'expense' && (t('projectAddExpense') || 'Add expense')}
                  {sheet === 'prepayment' && (t('projectAddPrepayment') || 'Add prepayment')}
                  {sheet === 'pdf' && (t('projectPdfShare') || 'Share PDF')}
                </h2>
                <button
                  type="button"
                  onClick={() => setSheet(null)}
                  className="w-11 h-11 flex items-center justify-center text-white/50"
                >
                  <X size={18} />
                </button>
              </div>

              {sheet === 'pdf' && (
                <div className="space-y-2">
                  <p className="text-white/45 text-xs mb-2">
                    {t('projectPdfShareHint') ||
                      'Client estimate hides expenses. Internal report includes costs.'}
                  </p>
                  <Button
                    className="w-full min-h-[48px] !bg-cyan-500/25 !text-cyan-100"
                    disabled={pdfMut.isPending}
                    onClick={() => pdfMut.mutate('client')}
                  >
                    {t('projectPdfClient') || 'Client estimate (commercial)'}
                  </Button>
                  <Button
                    className="w-full min-h-[48px] !bg-white/10 !text-white/80"
                    disabled={pdfMut.isPending}
                    onClick={() => pdfMut.mutate('internal')}
                  >
                    {t('projectPdfInternal') || 'Internal cost report'}
                  </Button>
                </div>
              )}

              {sheet === 'work' && (
                <div className="space-y-3">
                  {/* Expandable work templates */}
                  <div>
                    <p className="text-xs text-white/55 mb-1.5 uppercase tracking-wide">
                      {t('projectTemplates') || 'Templates'}
                    </p>
                    <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/10">
                      {TEMPLATE_GROUPS.map((cat) => {
                        const open = !!expandedCats[cat];
                        const list = templatesByCat[cat] || [];
                        return (
                          <div key={cat}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCats((s) => ({ ...s, [cat]: !s[cat] }))
                              }
                              className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 text-left bg-white/[0.04] hover:bg-white/[0.07]"
                            >
                              {open ? (
                                <ChevronDown size={16} className="text-orange-300 shrink-0" />
                              ) : (
                                <ChevronRight size={16} className="text-white/40 shrink-0" />
                              )}
                              <span className="text-white text-sm font-medium flex-1">
                                {localizedCategoryName(cat, language)}
                              </span>
                              <span className="text-white/35 text-[10px]">{list.length}</span>
                            </button>
                            {open && (
                              <div className="max-h-40 overflow-y-auto bg-black/20">
                                {list.length === 0 ? (
                                  <p className="text-white/30 text-xs px-3 py-2">—</p>
                                ) : (
                                  list.map((w) => (
                                    <button
                                      key={w.id}
                                      type="button"
                                      onClick={() => applyTemplate(w.id, cat)}
                                      className={`w-full min-h-[44px] text-left px-3 py-2 text-sm border-t border-white/5 ${
                                        templateId === w.id
                                          ? 'bg-orange-500/20 text-orange-100'
                                          : 'text-white/75 hover:bg-white/5'
                                      }`}
                                    >
                                      {localizedWorkName(w, language)}
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Input
                    label={t('description')}
                    value={workTitle}
                    onChange={(e) => setWorkTitle(e.target.value)}
                  />
                  <div>
                    <p className="text-xs text-white/55 mb-1.5 uppercase tracking-wide">
                      {t('projectGroup') || 'Room / stage'}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {STAGE_PRESETS.map((p) => {
                        const label =
                          language === 'uk' ? p.uk : language === 'de' ? p.de : p.en;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setWorkGroup(label)}
                            className={`min-h-[44px] px-3 rounded-full text-[11px] border ${
                              workGroup === label || workGroup === p.id
                                ? 'bg-orange-500/25 text-orange-100 border-orange-400/40'
                                : 'bg-white/5 text-white/50 border-white/10'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      value={workGroup}
                      onChange={(e) => setWorkGroup(e.target.value)}
                      placeholder={t('projectGroupPlaceholder') || 'e.g. Bathroom'}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs text-white/55 mb-1.5 uppercase tracking-wide">
                        {t('quantity')}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="w-11 h-11 flex items-center justify-center rounded-lg bg-black/25 text-white/70 border border-white/10"
                          onClick={() => {
                            const n = parseMoneyInput(workQty);
                            const base = Number.isFinite(n) ? n : 0;
                            setWorkQty(formatQtyDisplay(Math.max(0, base - 1)));
                          }}
                        >
                          <Minus size={14} />
                        </button>
                        <QtyInput
                          value={workQty}
                          onChange={setWorkQty}
                          className="!w-full !flex-1"
                          ariaLabel={t('quantity')}
                        />
                        <button
                          type="button"
                          className="w-11 h-11 flex items-center justify-center rounded-lg bg-black/25 text-white/70 border border-white/10"
                          onClick={() => {
                            const n = parseMoneyInput(workQty);
                            const base = Number.isFinite(n) ? n : 0;
                            setWorkQty(formatQtyDisplay(base + 1));
                          }}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <Input
                      label={t('unit')}
                      value={workUnit}
                      onChange={(e) => setWorkUnit(e.target.value)}
                    />
                    <MoneyInput
                      label={t('price')}
                      value={workPrice}
                      onChange={setWorkPrice}
                      currencyHint={currencySymbol}
                    />
                  </div>
                  <Button
                    className="w-full min-h-[48px] !bg-orange-500/30 !text-orange-100"
                    disabled={addWorkMut.isPending}
                    onClick={() => addWorkMut.mutate()}
                  >
                    {t('save')}
                  </Button>
                </div>
              )}

              {sheet === 'expense' && (
                <div className="space-y-3">
                  <Input
                    label={t('description')}
                    value={expTitle}
                    onChange={(e) => setExpTitle(e.target.value)}
                  />
                  <MoneyInput
                    label={t('projectAmount') || 'Amount'}
                    value={expAmount}
                    onChange={setExpAmount}
                    currencyHint={currencySymbol}
                  />
                  <Select
                    label={t('category') || 'Category'}
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(categoryI18nKey(c)) || c}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label={t('date')}
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                  />
                  <input
                    ref={receiptRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => setExpReceipt(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => receiptRef.current?.click()}
                    className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-white/70 text-sm"
                  >
                    <Camera size={18} />
                    {expReceipt
                      ? expReceipt.name
                      : t('projectAddReceiptPhoto') || 'Receipt photo (optional)'}
                  </button>
                  <Button
                    className="w-full min-h-[48px] !bg-orange-500/30 !text-orange-100"
                    disabled={addExpMut.isPending}
                    onClick={() => addExpMut.mutate()}
                  >
                    {t('save')}
                  </Button>
                </div>
              )}

              {sheet === 'prepayment' && (
                <div className="space-y-3">
                  <MoneyInput
                    label={t('projectAmount') || 'Amount'}
                    value={prepAmount}
                    onChange={setPrepAmount}
                    currencyHint={currencySymbol}
                  />
                  <Input
                    label={t('date')}
                    type="date"
                    value={prepDate}
                    onChange={(e) => setPrepDate(e.target.value)}
                  />
                  <Input
                    label={t('notes')}
                    value={prepNote}
                    onChange={(e) => setPrepNote(e.target.value)}
                  />
                  <Button
                    className="w-full min-h-[48px] !bg-orange-500/30 !text-orange-100"
                    disabled={addPrepMut.isPending}
                    onClick={() => addPrepMut.mutate()}
                  >
                    {t('save')}
                  </Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
