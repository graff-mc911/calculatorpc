import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  FileText,
  Minus,
  Plus,
  Trash2,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { EXPENSE_CATEGORIES, categoryI18nKey } from '../lib/expenseCategories';
import { formatMoneyDisplay, maskMoneyTyping, parseMoneyInput } from '../lib/moneyMask';
import { computeProjectMetrics, lineTotal } from '../lib/projectMetrics';
import { shareProjectEstimatePdf } from '../lib/projectPdf';
import {
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
} from '../lib/projectsApi';
import {
  CATALOG_WORKS,
  type WorkCategory,
} from '../data/priceCatalogSeed';
import {
  getStoredPriceCountry,
  localizedCategoryName,
  localizedWorkName,
} from '../lib/priceCatalog';
import { translateUnit } from '../lib/languages';
import { supabase } from '../lib/supabase';

type Tab = 'works' | 'expenses' | 'prepayments';
type Sheet = null | 'work' | 'expense' | 'prepayment';

const WORK_CATEGORIES: WorkCategory[] = [
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
  'other',
];

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();
  const receiptRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('works');
  const [sheet, setSheet] = useState<Sheet>(null);

  // Work form
  const [workCategory, setWorkCategory] = useState<WorkCategory>('tiling');
  const [templateId, setTemplateId] = useState('');
  const [workTitle, setWorkTitle] = useState('');
  const [workGroup, setWorkGroup] = useState('');
  const [workQty, setWorkQty] = useState('1');
  const [workUnit, setWorkUnit] = useState('m2');
  const [workPrice, setWorkPrice] = useState('');

  // Expense form
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('materials');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expReceipt, setExpReceipt] = useState<File | null>(null);

  // Prepayment form
  const [prepAmount, setPrepAmount] = useState('');
  const [prepDate, setPrepDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [prepNote, setPrepNote] = useState('');

  const [budgetDraft, setBudgetDraft] = useState('');

  const { data: bundle, isLoading, error, isError } = useQuery({
    queryKey: ['project-bundle', id],
    enabled: !!id,
    queryFn: () => fetchProjectBundle(id),
  });

  const schemaMissing = isError && error instanceof ProjectsSchemaMissingError;

  const metrics = useMemo(() => {
    if (!bundle) {
      return computeProjectMetrics([], [], [], 0);
    }
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

  const templates = useMemo(() => {
    return CATALOG_WORKS.filter((w) => w.category === workCategory);
  }, [workCategory]);

  const priceCountry = getStoredPriceCountry();

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
      if (!workTitle.trim() || !Number.isFinite(qty) || !Number.isFinite(price)) {
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

  const pdfMut = useMutation({
    mutationFn: async () => {
      if (!bundle) throw new Error('NO_PROJECT');
      const { data: company } = await supabase
        .from('company_profile')
        .select('*')
        .eq('user_id', bundle.project.user_id)
        .maybeSingle();

      return shareProjectEstimatePdf({
        project: bundle.project,
        workItems: bundle.workItems,
        expenses: bundle.expenses,
        prepayments: bundle.prepayments,
        company: company || {},
        labels: {
          estimateTitle: t('projectPdfTitle') || 'Estimate / Invoice',
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
          expenses: t('projectExpenses') || 'Expenses',
          projectedProfit: t('projectProfit') || 'Projected profit',
          margin: t('projectMargin') || 'Margin',
          prepayments: t('projectPrepayments') || 'Prepayments',
          ungrouped: t('projectUngrouped') || 'General',
          date: t('date'),
          note: t('notes'),
        },
      });
    },
    onSuccess: (result) => {
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

  const applyTemplate = (catalogId: string) => {
    setTemplateId(catalogId);
    const work = CATALOG_WORKS.find((w) => w.id === catalogId);
    if (!work) return;
    setWorkTitle(localizedWorkName(work, language));
    setWorkUnit(work.unit);
    const labor = work.labor[priceCountry];
    if (labor) setWorkPrice(String(labor.price).replace('.', ','));
  };

  const bumpQty = async (itemId: string, quantity: number, delta: number) => {
    const next = Math.max(0, Math.round((quantity + delta) * 1000) / 1000);
    try {
      await updateWorkItem(itemId, { quantity: next });
      invalidate();
    } catch (err) {
      onSchemaErr(err);
    }
  };

  const saveUnitPrice = async (itemId: string, raw: string) => {
    const price = parseMoneyInput(raw);
    if (!Number.isFinite(price)) return;
    try {
      await updateWorkItem(itemId, { unit_price: price });
      invalidate();
    } catch (err) {
      onSchemaErr(err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 px-4 text-white/50 text-sm">
        {t('loading') || 'Loading…'}
      </div>
    );
  }

  if (schemaMissing || !bundle) {
    return (
      <div className="min-h-screen pt-20 px-4 max-w-[430px] mx-auto">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="text-white/60 text-sm mb-4 inline-flex items-center gap-2"
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
  const progressPct = Math.min(150, Math.round(metrics.expenseProgress * 100));

  return (
    <div className="min-h-screen pt-20 pb-28 px-4 max-w-[430px] mx-auto md:max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70"
          aria-label={t('back')}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-white truncate">{project.name}</h1>
          <p className="text-white/40 text-xs truncate">
            {project.client_name || t('noClient') || 'No client'}
            {project.address ? ` · ${project.address}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t('projectDeleteConfirm') || 'Delete this project?')) {
              deleteMut.mutate();
            }
          }}
          className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-300"
          aria-label={t('delete')}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[
          {
            label: t('projectEstimate') || 'Estimate',
            value: metrics.estimateTotal,
            color: 'text-white',
          },
          {
            label: t('projectReceived') || 'Received',
            value: metrics.received,
            color: 'text-green-300',
          },
          {
            label: t('projectBalanceDue') || 'Balance due',
            value: metrics.balanceDue,
            color: 'text-orange-300',
          },
          {
            label: t('projectExpenses') || 'Expenses',
            value: metrics.expenses,
            color: 'text-red-300',
          },
          {
            label: t('projectProfit') || 'Profit',
            value: metrics.projectedProfit,
            color: metrics.projectedProfit >= 0 ? 'text-green-300' : 'text-red-300',
          },
          {
            label: t('projectMargin') || 'Margin',
            value: metrics.marginPct,
            color: metrics.marginPct >= 0 ? 'text-cyan-300' : 'text-red-300',
            isPct: true,
          },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
          >
            <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{m.label}</p>
            <p className={`text-sm font-semibold leading-tight ${m.color}`}>
              {m.isPct
                ? `${metrics.marginPct.toFixed(1)}%`
                : formatMoneyDisplay(m.value, currency)}
            </p>
          </div>
        ))}
      </div>

      {/* Budget bar */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-white/50 text-xs">
            {t('projectExpenseBudget') || 'Expense budget'}
          </p>
          <div className="flex items-center gap-1">
            <input
              value={budgetDraft || String(project.expense_budget || '')}
              onChange={(e) => setBudgetDraft(maskMoneyTyping(e.target.value))}
              onBlur={() => {
                if (budgetDraft !== '') budgetMut.mutate();
              }}
              placeholder="0"
              className="w-24 bg-transparent text-right text-white text-xs border-b border-white/20 focus:outline-none focus:border-orange-400 py-0.5"
              inputMode="decimal"
            />
            <button
              type="button"
              onClick={() => budgetMut.mutate()}
              className="text-[10px] text-orange-300 px-1"
            >
              {t('save')}
            </button>
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className={`h-full ${progressPct > 100 ? 'bg-red-400' : 'bg-teal-400'}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progressPct)}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <p className="text-white/35 text-[10px] mt-1.5">
          {formatMoneyDisplay(metrics.expenses, currency)} /{' '}
          {formatMoneyDisplay(
            metrics.expenseBudget > 0 ? metrics.expenseBudget : metrics.estimateTotal,
            currency
          )}{' '}
          ({progressPct}%)
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 mb-4">
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
            className={`flex-1 text-xs py-2 rounded-lg transition-all ${
              tab === key ? 'bg-white/10 text-white font-medium' : 'text-white/45'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'works' && (
        <div className="space-y-3">
          {workItems.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-8">
              {t('projectWorksEmpty') || 'Add works from templates'}
            </p>
          ) : (
            groupedWorks.map(([groupKey, items]) => (
              <div key={groupKey} className="space-y-2">
                <p className="text-white/35 text-[10px] uppercase tracking-wider px-1">
                  {groupKey === '__none__'
                    ? t('projectUngrouped') || 'General'
                    : groupKey}
                </p>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium leading-snug">
                          {item.title}
                        </p>
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
                        className="text-white/30 hover:text-red-300 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-black/20 rounded-lg p-0.5">
                        <button
                          type="button"
                          className="w-8 h-8 flex items-center justify-center text-white/70"
                          onClick={() => bumpQty(item.id, Number(item.quantity), -1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-10 text-center text-white text-sm tabular-nums">
                          {Number(item.quantity)}
                        </span>
                        <button
                          type="button"
                          className="w-8 h-8 flex items-center justify-center text-white/70"
                          onClick={() => bumpQty(item.id, Number(item.quantity), 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <input
                        defaultValue={String(item.unit_price).replace('.', ',')}
                        onBlur={(e) => saveUnitPrice(item.id, e.target.value)}
                        onChange={(e) => {
                          e.target.value = maskMoneyTyping(e.target.value);
                        }}
                        className="flex-1 min-w-0 bg-black/20 rounded-lg px-2 py-2 text-right text-white text-sm focus:outline-none focus:ring-1 focus:ring-orange-400/50"
                        inputMode="decimal"
                        aria-label={t('price')}
                      />
                      <span className="text-white/70 text-xs font-semibold tabular-nums shrink-0 w-[72px] text-right">
                        {formatMoneyDisplay(lineTotal(item.quantity, item.unit_price), currency)}
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
            <p className="text-white/40 text-sm text-center py-8">
              {t('projectExpensesEmpty') || 'No expenses yet'}
            </p>
          ) : (
            expenses.map((e) => (
              <div
                key={e.id}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{e.title}</p>
                  <p className="text-white/35 text-[10px]">
                    {t(categoryI18nKey(e.category)) || e.category} · {e.expense_date}
                  </p>
                  {e.receipt_url && (
                    <a
                      href={e.receipt_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-300 text-[10px] underline"
                    >
                      {t('projectReceipt') || 'Receipt'}
                    </a>
                  )}
                </div>
                <p className="text-red-300 text-sm font-semibold tabular-nums">
                  {formatMoneyDisplay(Number(e.amount), currency)}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteExpense(e.id, id);
                    invalidate();
                  }}
                  className="text-white/30 hover:text-red-300 p-1"
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
            <p className="text-white/40 text-sm text-center py-8">
              {t('projectPrepaymentsEmpty') || 'No prepayments yet'}
            </p>
          ) : (
            prepayments.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-green-300 text-sm font-semibold tabular-nums">
                    {formatMoneyDisplay(Number(p.amount), currency)}
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
                  className="text-white/30 hover:text-red-300 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Sticky Quick Actions */}
      <div className="fixed bottom-0 inset-x-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-[#1e272e] via-[#1e272e]/95 to-transparent">
        <div className="max-w-[430px] mx-auto grid grid-cols-4 gap-2">
          {[
            {
              key: 'work',
              icon: Wrench,
              label: t('projectQaWork') || '+ Work',
              onClick: () => {
                setTab('works');
                setSheet('work');
              },
            },
            {
              key: 'expense',
              icon: Wallet,
              label: t('projectQaExpense') || '+ Expense',
              onClick: () => {
                setTab('expenses');
                setSheet('expense');
              },
            },
            {
              key: 'prepay',
              icon: Plus,
              label: t('projectQaPrepay') || '+ Prepay',
              onClick: () => {
                setTab('prepayments');
                setSheet('prepayment');
              },
            },
            {
              key: 'pdf',
              icon: FileText,
              label: 'PDF',
              onClick: () => pdfMut.mutate(),
            },
          ].map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              disabled={a.key === 'pdf' && pdfMut.isPending}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/10 backdrop-blur-xl px-1 py-2.5 active:scale-95"
            >
              <a.icon size={16} className="text-orange-300" />
              <span className="text-[10px] text-white/75 font-medium leading-tight text-center">
                {a.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Sheets */}
      <AnimatePresence>
        {sheet && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-3 pb-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="w-full max-w-[430px] max-h-[85vh] overflow-y-auto rounded-2xl bg-[#24313a] border border-white/10 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm">
                  {sheet === 'work' && (t('projectAddWork') || 'Add work')}
                  {sheet === 'expense' && (t('projectAddExpense') || 'Add expense')}
                  {sheet === 'prepayment' && (t('projectAddPrepayment') || 'Add prepayment')}
                </h2>
                <button type="button" onClick={() => setSheet(null)} className="text-white/50 p-1">
                  <X size={18} />
                </button>
              </div>

              {sheet === 'work' && (
                <div className="space-y-3">
                  <Select
                    label={t('projectCategory') || 'Category'}
                    value={workCategory}
                    onChange={(e) => {
                      setWorkCategory(e.target.value as WorkCategory);
                      setTemplateId('');
                    }}
                  >
                    {WORK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {localizedCategoryName(c, language)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label={t('projectTemplate') || 'Template'}
                    value={templateId}
                    onChange={(e) => applyTemplate(e.target.value)}
                  >
                    <option value="">{t('projectCustomWork') || 'Custom / blank'}</option>
                    {templates.map((w) => (
                      <option key={w.id} value={w.id}>
                        {localizedWorkName(w, language)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label={t('description')}
                    value={workTitle}
                    onChange={(e) => setWorkTitle(e.target.value)}
                  />
                  <Input
                    label={t('projectGroup') || 'Room / stage'}
                    value={workGroup}
                    onChange={(e) => setWorkGroup(e.target.value)}
                    placeholder={t('projectGroupPlaceholder') || 'e.g. Bathroom'}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      label={t('quantity')}
                      value={workQty}
                      onChange={(e) => setWorkQty(maskMoneyTyping(e.target.value))}
                      inputMode="decimal"
                    />
                    <Input
                      label={t('unit')}
                      value={workUnit}
                      onChange={(e) => setWorkUnit(e.target.value)}
                    />
                    <Input
                      label={t('price')}
                      value={workPrice}
                      onChange={(e) => setWorkPrice(maskMoneyTyping(e.target.value))}
                      inputMode="decimal"
                    />
                  </div>
                  <Button
                    className="w-full !bg-orange-500/25 !text-orange-200"
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
                  <Input
                    label={t('projectAmount') || 'Amount'}
                    value={expAmount}
                    onChange={(e) => setExpAmount(maskMoneyTyping(e.target.value))}
                    inputMode="decimal"
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
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-white/70 text-sm"
                  >
                    <Camera size={16} />
                    {expReceipt
                      ? expReceipt.name
                      : t('projectAddReceiptPhoto') || 'Receipt photo (optional)'}
                  </button>
                  <Button
                    className="w-full !bg-orange-500/25 !text-orange-200"
                    disabled={addExpMut.isPending}
                    onClick={() => addExpMut.mutate()}
                  >
                    {t('save')}
                  </Button>
                </div>
              )}

              {sheet === 'prepayment' && (
                <div className="space-y-3">
                  <Input
                    label={t('projectAmount') || 'Amount'}
                    value={prepAmount}
                    onChange={(e) => setPrepAmount(maskMoneyTyping(e.target.value))}
                    inputMode="decimal"
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
                    className="w-full !bg-orange-500/25 !text-orange-200"
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
