import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { useQuickActionHandlers } from '../components/QuickActionsContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { MoneyInput, QtyInput } from '../components/projects/MoneyInput';
import {
  EXPENSE_CATEGORIES,
  categoryI18nKey,
  categoryLabelUk,
} from '../lib/expenseCategories';
import {
  formatCurrency,
  formatMoneyInput,
  formatQtyDisplay,
  parseMoneyInput,
} from '../lib/moneyMask';
import {
  PAYMENT_METHODS,
  composePaymentNote,
  parsePaymentNote,
} from '../lib/paymentNote';
import { setLastProjectId } from '../lib/lastProject';
import {
  computeProjectMetrics,
  lineTotal,
  type ProjectInvoiceMoney,
} from '../lib/projectMetrics';
import { resolveInvoiceStatus } from '../lib/invoiceFromProject';
import { rankLinkableInvoices } from '../lib/projectInvoiceLink';
import {
  CpcStatusBadge,
  invoiceStatusLabel,
  invoiceStatusTone,
} from '../components/cpc/CpcStatusBadge';
import { shareProjectEstimatePdf, type ProjectPdfMode } from '../lib/projectPdf';
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

type Sheet = null | 'work' | 'expense' | 'prepayment' | 'pdf' | 'menu' | 'linkInvoice';

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

function formatCompact(value: number, currency: string) {
  const n = Number.isFinite(value) ? value : 0;
  if (Math.abs(n - Math.round(n)) < 0.005) {
    return formatCurrency(Math.round(n), currency).replace(/,00(?=\s)/, '');
  }
  return formatCurrency(n, currency);
}

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();
  const receiptRef = useRef<HTMLInputElement>(null);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);

  const [workCategory, setWorkCategory] = useState<WorkCategory>('plaster');
  const [templateId, setTemplateId] = useState('');
  const [workTitle, setWorkTitle] = useState('');
  const [workGroup, setWorkGroup] = useState('');
  const [workQty, setWorkQty] = useState('1');
  const [workUnit, setWorkUnit] = useState('m2');
  const [workPrice, setWorkPrice] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ plaster: true });

  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('materials');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expNote, setExpNote] = useState('');
  const [expReceipt, setExpReceipt] = useState<File | null>(null);

  const [prepAmount, setPrepAmount] = useState('');
  const [prepDate, setPrepDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [prepMethod, setPrepMethod] = useState('');
  const [prepNote, setPrepNote] = useState('');

  const [editingMeta, setEditingMeta] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [addressDraft, setAddressDraft] = useState('');
  const [clientDraft, setClientDraft] = useState('');
  const [linkInvoiceQuery, setLinkInvoiceQuery] = useState('');

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

  const { data: projectInvoices = [] } = useQuery({
    queryKey: ['project-invoices', id],
    enabled: !!id,
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return [];
      const { data, error: err } = await supabase
        .from('invoices')
        .select('id, document_no, total_gross, status, due_date, date, created_at')
        .eq('user_id', uid)
        .eq('project_id', id)
        .order('created_at', { ascending: false });
      if (err) {
        console.warn('project invoices load failed', err);
        return [];
      }
      return data || [];
    },
  });

  const invoiceIds = projectInvoices.map((inv) => inv.id).filter(Boolean);
  const { data: invoicePaymentRows = [] } = useQuery({
    queryKey: ['project-invoice-payments', id, invoiceIds.join(',')],
    enabled: !!id && invoiceIds.length > 0,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('invoice_payments')
        .select('invoice_id, amount, paid_at, currency')
        .in('invoice_id', invoiceIds)
        .order('paid_at', { ascending: true });
      if (err) {
        console.warn('project invoice payments load failed', err);
        return [];
      }
      return data || [];
    },
  });

  const { data: allRecentInvoices = [] } = useQuery({
    queryKey: ['project-linkable-invoices', id],
    enabled: !!id && !!bundle?.project && projectInvoices.length === 0,
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return [];
      const { data, error: err } = await supabase
        .from('invoices')
        .select(
          'id, document_no, total_gross, status, client_id, object_address, notes, project_id, clients(name)'
        )
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(40);
      if (err) {
        console.warn('linkable invoices load failed', err);
        return [];
      }
      return (data || []).map((row: any) => ({
        ...row,
        clients: Array.isArray(row.clients) ? row.clients[0] || null : row.clients,
      }));
    },
  });

  const schemaMissing = isError && error instanceof ProjectsSchemaMissingError;

  useEffect(() => {
    if (!bundle) return;
    setNameDraft(bundle.project.name || '');
    setAddressDraft(bundle.project.address || '');
    setClientDraft(bundle.project.client_id || '');
  }, [bundle?.project.updated_at]);

  useEffect(() => {
    if (id) setLastProjectId(id);
  }, [id]);

  const invoiceMoney: ProjectInvoiceMoney[] = useMemo(() => {
    const paidByInvoice: Record<string, number> = {};
    for (const row of invoicePaymentRows) {
      const invId = String(row.invoice_id || '');
      if (!invId) continue;
      paidByInvoice[invId] = (paidByInvoice[invId] || 0) + (Number(row.amount) || 0);
    }
    return projectInvoices.map((inv) => ({
      total_gross: inv.total_gross,
      status: inv.status,
      paid_amount: paidByInvoice[inv.id] ?? 0,
    }));
  }, [projectInvoices, invoicePaymentRows]);

  const metrics = useMemo(() => {
    if (!bundle?.project) return computeProjectMetrics([], [], [], 0, invoiceMoney);
    return computeProjectMetrics(
      Array.isArray(bundle.workItems) ? bundle.workItems : [],
      Array.isArray(bundle.expenses) ? bundle.expenses : [],
      Array.isArray(bundle.prepayments) ? bundle.prepayments : [],
      Number(bundle.project.expense_budget) || 0,
      invoiceMoney
    );
  }, [bundle, invoiceMoney]);

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
    qc.invalidateQueries({ queryKey: ['projects-invoice-summary'] });
    qc.invalidateQueries({ queryKey: ['project-invoices', id] });
    qc.invalidateQueries({ queryKey: ['project-invoice-payments'] });
    qc.invalidateQueries({ queryKey: ['project-linkable-invoices', id] });
  };

  const linkInvoiceMut = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error: err } = await supabase
        .from('invoices')
        .update({ project_id: id })
        .eq('id', invoiceId);
      if (err) throw err;

      // Pull invoice lines into empty work sheet so the project shows the same scope.
      const existingWorks = Array.isArray(bundle?.workItems) ? bundle!.workItems : [];
      if (existingWorks.length === 0) {
        const { data: items, error: itemsErr } = await supabase
          .from('invoice_items')
          .select('description, material, quantity, unit, price, sort_order')
          .eq('invoice_id', invoiceId)
          .order('sort_order');
        if (itemsErr) {
          console.warn('invoice items import skipped', itemsErr);
        } else {
          let order = 0;
          for (const item of items || []) {
            const title = String(item.description || item.material || '').trim();
            if (!title) continue;
            await addWorkItem({
              project_id: id,
              title,
              quantity: Number(item.quantity) || 1,
              unit: String(item.unit || 'pcs'),
              unit_price: Number(item.price) || 0,
              sort_order: order++,
            });
          }
        }
      }

      // Keep object price aligned with invoice total when budget was empty/different.
      const linked = allRecentInvoices.find((inv) => inv.id === invoiceId) ||
        projectInvoices.find((inv) => inv.id === invoiceId);
      const gross = Number(
        linked?.total_gross ??
          (
            await supabase
              .from('invoices')
              .select('total_gross')
              .eq('id', invoiceId)
              .maybeSingle()
          ).data?.total_gross
      );
      if (gross > 0 && bundle?.project) {
        const budget = Number(bundle.project.expense_budget) || 0;
        if (budget <= 0 || Math.abs(budget - gross) > 0.05) {
          try {
            await updateProject(id, { expense_budget: gross });
          } catch {
            /* optional */
          }
        }
      }
    },
    onSuccess: () => {
      showSuccess('Рахунок прив’язано · роботи й суми оновлено');
      setSheet(null);
      setLinkInvoiceQuery('');
      invalidate();
    },
    onError: (err: any) => {
      showError(err?.message || 'Не вдалося прив’язати рахунок');
    },
  });

  const onSchemaErr = (err: unknown) => {
    if (err instanceof ProjectsSchemaMissingError) {
      showError(t('projectsSchemaMissing') || 'Apply projects migration in Supabase');
      return;
    }
    showError(t('saveFailed') || 'Save failed');
  };

  const resetWorkForm = () => {
    setEditingWorkId(null);
    setWorkTitle('');
    setTemplateId('');
    setWorkQty('1');
    setWorkPrice('');
    setWorkGroup('');
    setWorkUnit('m2');
  };

  const openAddWork = () => {
    resetWorkForm();
    setSheet('work');
  };

  // In-page quick actions: open sheets locally (no ?add= remount that wipes the form)
  useQuickActionHandlers({
    onWork: () => openAddWork(),
    onExpense: () => setSheet('expense'),
    onAdvance: () => setSheet('prepayment'),
    onPdf: () => setSheet('pdf'),
  });

  // Deep-link from global + FAB: /projects/:id?add=work|expense|prepayment
  // Consume each ?add= once — avoid re-running openAddWork and wiping template picks.
  const consumedAddRef = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !bundle) return;
    const add = searchParams.get('add');
    if (!add) {
      consumedAddRef.current = null;
      return;
    }
    const token = `${id}:${add}`;
    if (consumedAddRef.current === token) return;
    consumedAddRef.current = token;
    if (add === 'work') openAddWork();
    else if (add === 'expense') setSheet('expense');
    else if (add === 'prepayment') setSheet('prepayment');
    const next = new URLSearchParams(searchParams);
    next.delete('add');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, bundle?.project.id, searchParams.get('add')]);

  const openEditWork = (item: ProjectWorkItem) => {
    setEditingWorkId(item.id);
    setWorkTitle(item.title);
    setWorkCategory((item.category as WorkCategory) || 'other');
    setTemplateId(item.catalog_work_id || '');
    setWorkGroup(item.group_key || '');
    setWorkQty(formatQtyDisplay(Number(item.quantity)));
    setWorkUnit(item.unit || 'm2');
    setWorkPrice(formatMoneyInput(Number(item.unit_price), 2));
    setSheet('work');
  };

  const saveWorkMut = useMutation({
    mutationFn: async (mode: 'close' | 'continue' = 'close') => {
      const qty = parseMoneyInput(workQty);
      const price = parseMoneyInput(workPrice);
      if (!workTitle.trim()) throw new Error('NO_TITLE');
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('NO_QTY');
      if (!Number.isFinite(price) || price < 0) throw new Error('NO_PRICE');
      if (editingWorkId) {
        const updated = await updateWorkItem(editingWorkId, {
          title: workTitle.trim(),
          category: workCategory,
          group_key: workGroup,
          quantity: qty,
          unit: workUnit || 'm2',
          unit_price: price,
        });
        return { item: updated, mode, edited: true as const };
      }
      const created = await addWorkItem({
        project_id: id,
        title: workTitle.trim(),
        category: workCategory,
        catalog_work_id: templateId || null,
        group_key: workGroup,
        quantity: qty,
        unit: workUnit || 'm2',
        unit_price: price,
        sort_order: bundle?.workItems.length || 0,
      });
      return { item: created, mode, edited: false as const };
    },
    onSuccess: ({ mode, edited }) => {
      showSuccess(
        edited
          ? t('saved') || 'Збережено'
          : t('projectWorkAdded') || 'Роботу додано',
      );
      invalidate();
      if (mode === 'continue' && !edited) {
        // Keep sheet open for the next pick; clear fields for a new line
        resetWorkForm();
        setSheet('work');
        return;
      }
      setSheet(null);
      resetWorkForm();
    },
    onError: (err) => {
      if (err instanceof Error) {
        if (err.message === 'NO_TITLE') {
          showError('Вкажіть назву роботи або оберіть шаблон');
          return;
        }
        if (err.message === 'NO_QTY') {
          showError('Кількість має бути більше 0');
          return;
        }
        if (err.message === 'NO_PRICE') {
          showError('Вкажіть ціну за одиницю');
          return;
        }
      }
      onSchemaErr(err);
    },
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
        notes: expNote.trim() || null,
      });
    },
    onSuccess: () => {
      showSuccess(t('projectExpenseAdded') || 'Expense added');
      setSheet(null);
      setExpTitle('');
      setExpAmount('');
      setExpNote('');
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
        note: composePaymentNote(prepMethod, prepNote),
      });
    },
    onSuccess: () => {
      showSuccess(t('projectPrepaymentAdded') || 'Оплату збережено');
      setSheet(null);
      setPrepAmount('');
      setPrepMethod('');
      setPrepNote('');
      invalidate();
    },
    onError: onSchemaErr,
  });

  const metaMut = useMutation({
    mutationFn: async () => {
      const name = nameDraft.trim();
      if (!name) throw new Error('INVALID');
      const c = clients.find((x: { id: string }) => x.id === clientDraft);
      return updateProject(id, {
        name,
        address: addressDraft.trim() || null,
        client_id: clientDraft || null,
        client_name: c?.name || bundle?.project.client_name || null,
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
          margin: t('projectMargin') || 'Маржа',
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
    const work = CATALOG_WORKS.find((w) => w.id === catalogId);
    if (!work) {
      showError('Шаблон не знайдено');
      return;
    }
    const nextCat = (cat || work.category) as WorkCategory;
    setTemplateId(catalogId);
    setEditingWorkId(null);
    setWorkCategory(nextCat);
    setExpandedCats((s) => ({ ...s, [nextCat]: true }));
    setWorkTitle(localizedWorkName(work, language));
    setWorkUnit(work.unit || 'm2');
    if (!workQty.trim() || parseMoneyInput(workQty) <= 0) setWorkQty('1');
    const labor = work.labor[priceCountry] || work.labor.ES || work.labor.DE || work.labor.UA;
    if (labor && Number.isFinite(labor.price)) {
      setWorkPrice(formatMoneyInput(labor.price, 2));
    }
  };

  const duplicateWork = async (item: ProjectWorkItem) => {
    try {
      await addWorkItem({
        project_id: id,
        title: item.title,
        category: item.category,
        catalog_work_id: item.catalog_work_id,
        group_key: item.group_key,
        quantity: Number(item.quantity),
        unit: item.unit,
        unit_price: Number(item.unit_price),
        sort_order: (bundle?.workItems.length || 0) + 1,
      });
      showSuccess(t('projectWorkAdded') || 'Work added');
      invalidate();
    } catch (err) {
      onSchemaErr(err);
    }
  };

  const createInvoice = () => {
    if (!bundle) return;
    const params = new URLSearchParams({
      project_id: id,
      from_project: '1',
    });
    if (bundle.project.client_id) params.set('client_id', bundle.project.client_id);
    navigate(`/invoices/new?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="cpc-page px-4 cpc-muted text-sm mx-auto">
        {t('loading') || 'Loading…'}
      </div>
    );
  }

  if (schemaMissing) {
    return (
      <div className="cpc-page px-3 w-full mx-auto">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="cpc-muted text-sm mb-4 inline-flex items-center gap-2 min-h-[44px] bg-transparent border-0"
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

  if (isError || !bundle?.project) {
    return (
      <div className="cpc-page px-3 w-full mx-auto">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="cpc-muted text-sm mb-4 inline-flex items-center gap-2 min-h-[44px] bg-transparent border-0"
        >
          <ArrowLeft size={16} /> {t('back')}
        </button>
        <div className="cpc-card text-center py-6">
          <p className="text-sm mb-2" style={{ color: 'var(--cpc-text)' }}>
            Не вдалося відкрити об&apos;єкт
          </p>
          <p className="cpc-muted text-xs mb-4 break-all">
            {error instanceof Error ? error.message : 'Спробуйте ще раз'}
          </p>
          <button
            type="button"
            className="cpc-btn-primary min-h-[44px]"
            onClick={() => qc.invalidateQueries({ queryKey: ['project-bundle', id] })}
          >
            Оновити
          </button>
        </div>
      </div>
    );
  }

  const project = bundle.project;
  const workItems = Array.isArray(bundle.workItems) ? bundle.workItems : [];
  const expenses = Array.isArray(bundle.expenses) ? bundle.expenses : [];
  const prepayments = Array.isArray(bundle.prepayments) ? bundle.prepayments : [];
  const currency = project.currency || 'EUR';
  const objectPrice = metrics.estimateTotal;
  const clientLabel = project.client_name || t('noClient') || 'Без клієнта';
  const recentExpenses = [...expenses].sort((a, b) =>
    String(b.expense_date || b.created_at).localeCompare(String(a.expense_date || a.created_at))
  );
  const recentPayments = [...prepayments].sort((a, b) =>
    String(b.paid_at || b.created_at).localeCompare(String(a.paid_at || a.created_at))
  );
  const rankedLinkable = rankLinkableInvoices(allRecentInvoices as any[], {
    id,
    client_id: project.client_id,
    client_name: project.client_name,
    name: project.name,
    address: project.address,
    expense_budget: project.expense_budget,
  });
  const suggestedLinkable = rankedLinkable.filter((inv) => inv.score >= 25).slice(0, 6);
  const filteredLinkable = (() => {
    const q = linkInvoiceQuery.trim().toLowerCase();
    if (!q) return rankedLinkable;
    return rankedLinkable.filter((inv) => {
      const hay = [
        inv.document_no,
        inv.clients?.name,
        inv.object_address,
        inv.notes,
        String(inv.total_gross ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  })();
  const invoicePayDisplay = invoicePaymentRows.map((row) => ({
    id: `invpay-${row.invoice_id}-${row.paid_at}-${row.amount}`,
    amount: Number(row.amount) || 0,
    paid_at: row.paid_at,
    note: 'З рахунку',
  }));

  return (
    <div className="cpc-page w-full mx-auto min-w-0 pb-8">
      {/* HEADER */}
      <div className="flex items-start gap-2 mb-3">
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
        <div className="flex-1 min-w-0 pt-0.5">
          <h1 className="text-[18px] font-medium truncate leading-tight" style={{ color: 'var(--cpc-text)' }}>
            {project.name}
          </h1>
          <p className="cpc-muted text-[12px] truncate mt-0.5">{clientLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditingMeta((v) => !v)}
          className="min-h-[44px] px-3 text-[12px] font-medium shrink-0"
          style={{
            background: 'var(--cpc-card)',
            border: '1px solid var(--cpc-line)',
            borderRadius: 10,
            color: 'var(--cpc-text)',
          }}
        >
          Редагувати
        </button>
        <button
          type="button"
          onClick={() => setSheet('menu')}
          className="w-11 h-11 shrink-0 flex items-center justify-center"
          style={{
            background: 'var(--cpc-card)',
            border: '1px solid var(--cpc-line)',
            borderRadius: 12,
            color: 'var(--cpc-muted)',
          }}
          aria-label="More"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {editingMeta && (
        <div className="cpc-card mb-3 space-y-2.5">
          <Input label="Назва об’єкта" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
          {clients.length > 0 && (
            <Select label="Клієнт" value={clientDraft} onChange={(e) => setClientDraft(e.target.value)}>
              <option value="">—</option>
              {clients.map((c: { id: string; name: string }) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <Input
            label="Адреса"
            value={addressDraft}
            onChange={(e) => setAddressDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="flex-1 min-h-[44px]"
              style={{ background: 'var(--cpc-copper)', color: 'var(--cpc-on-copper)' }}
              disabled={metaMut.isPending || !nameDraft.trim()}
              onClick={() => metaMut.mutate()}
            >
              {t('save') || 'Зберегти'}
            </Button>
            <Button
              variant="secondary"
              className="flex-1 min-h-[44px]"
              onClick={() => setEditingMeta(false)}
            >
              {t('cancel') || 'Скасувати'}
            </Button>
          </div>
        </div>
      )}

      {/* ФІНАНСОВИЙ БЛОК */}
      <div className="cpc-card mb-3">
        <div className="flex items-end justify-between gap-2 mb-2">
          <div>
            <small className="cpc-card-label">Ціна об’єкта</small>
            <b className="block text-[22px] font-medium tabular-nums" style={{ color: 'var(--cpc-text)' }}>
              {formatCompact(objectPrice, currency)}
            </b>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] mb-3">
          <div className="flex justify-between gap-2">
            <span className="cpc-muted">Отримано</span>
            <b className="tabular-nums font-medium" style={{ color: 'var(--cpc-text)' }}>
              {formatCompact(metrics.received, currency)}
            </b>
          </div>
          <div className="flex justify-between gap-2">
            <span className="cpc-muted">Залишок</span>
            <b className="tabular-nums font-medium cpc-copper">
              {formatCompact(metrics.balanceDue, currency)}
            </b>
          </div>
          {metrics.overpayment > 0 && (
            <div className="flex justify-between gap-2 col-span-2">
              <span className="cpc-muted">Переплата</span>
              <b className="tabular-nums font-medium" style={{ color: '#f0a8a8' }}>
                {formatCompact(metrics.overpayment, currency)}
              </b>
            </div>
          )}
          <div className="flex justify-between gap-2 col-span-2">
            <span className="cpc-muted">Витрачено</span>
            <b className="tabular-nums font-medium" style={{ color: 'var(--cpc-text)' }}>
              {formatCompact(metrics.expenses, currency)}
            </b>
          </div>
        </div>
        <div className="cpc-profit">
          <div className="text-[11px] font-medium tracking-wide">ПРИБУТОК</div>
          <div className="flex items-end justify-between gap-2 mt-0.5">
            <b className="text-[26px] font-semibold tabular-nums leading-none">
              {formatCompact(metrics.projectedProfit, currency)}
            </b>
            <b className="text-[13px] font-medium tabular-nums">
              {t('projectMargin') || 'Маржа'}{' '}
              {Number.isFinite(metrics.marginPct) ? metrics.marginPct.toFixed(1) : '0'}%
            </b>
          </div>
        </div>
        {metrics.budgetExceeded && (
          <div
            className="mt-3 px-3 py-2 text-[12px] font-medium"
            style={{
              background: 'rgba(200,80,80,0.14)',
              border: '1px solid rgba(200,80,80,0.35)',
              borderRadius: 10,
              color: '#f0a8a8',
            }}
            role="alert"
          >
            {t('projectBudgetExceeded') || 'Бюджет перевищено'}
            {metrics.budgetBase > 0 && (
              <span className="block font-normal mt-0.5 opacity-90">
                Витрачено {formatCompact(metrics.expenses, currency)} з{' '}
                {formatCompact(metrics.budgetBase, currency)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ШВИДКІ ДІЇ — 2×2 on narrow phones, 4-up from ~380px */}
      <div className="grid grid-cols-2 min-[380px]:grid-cols-4 gap-1.5 mb-4">
        {[
          { key: 'work', label: 'Робота', onClick: openAddWork },
          { key: 'exp', label: 'Витрата', onClick: () => setSheet('expense') },
          { key: 'adv', label: 'Аванс', onClick: () => setSheet('prepayment') },
          {
            key: 'inv',
            label: 'Рахунок',
            onClick: () => {
              if (workItems.length > 0) createInvoice();
              else setSheet('linkInvoice');
            },
          },
        ].map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={a.onClick}
            className="min-h-[52px] text-[12px] font-medium active:scale-[0.98] transition-transform"
            style={{
              background: 'var(--cpc-card)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 10,
              color: 'var(--cpc-copper-light)',
            }}
          >
            + {a.label}
          </button>
        ))}
      </div>

      <div className="cpc-desk-split mb-4">
      {/* РОБОТИ */}
      <section className="cpc-desk-split-main min-w-0">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <h2 className="text-[13px] font-medium" style={{ color: 'var(--cpc-text)' }}>
            Роботи
          </h2>
          <button
            type="button"
            onClick={openAddWork}
            className="text-[12px] cpc-copper bg-transparent border-0 min-h-[36px]"
          >
            + Робота
          </button>
        </div>
        {workItems.length === 0 ? (
          <div className="cpc-card text-center py-5">
            <p className="cpc-muted text-sm mb-2">Ще немає робіт</p>
            <button type="button" className="cpc-btn-primary" onClick={openAddWork}>
              Додати роботу
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {workItems.map((item) => {
              const qty = Number(item.quantity) || 0;
              const price = Number(item.unit_price) || 0;
              const sum = lineTotal(qty, price);
              const unitLabel = translateUnit(item.unit, t) || item.unit;
              return (
                <div key={item.id} className="cpc-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[14px] truncate" style={{ color: 'var(--cpc-text)' }}>
                        {item.title}
                      </p>
                      <p className="cpc-muted text-[12px] mt-0.5 tabular-nums">
                        {formatQtyDisplay(qty)} {unitLabel} × {formatCompact(price, currency)}
                      </p>
                    </div>
                    <b className="tabular-nums text-[14px] font-medium shrink-0" style={{ color: 'var(--cpc-text)' }}>
                      {formatCompact(sum, currency)}
                    </b>
                  </div>
                  <div className="flex gap-1 mt-2">
                    <button
                      type="button"
                      onClick={() => openEditWork(item)}
                      className="flex-1 min-h-[40px] text-[11px] inline-flex items-center justify-center gap-1"
                      style={{
                        background: 'var(--cpc-bg)',
                        border: '1px solid var(--cpc-line)',
                        borderRadius: 8,
                        color: 'var(--cpc-muted)',
                      }}
                    >
                      <Pencil size={12} /> Редаг.
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateWork(item)}
                      className="flex-1 min-h-[40px] text-[11px] inline-flex items-center justify-center gap-1"
                      style={{
                        background: 'var(--cpc-bg)',
                        border: '1px solid var(--cpc-line)',
                        borderRadius: 8,
                        color: 'var(--cpc-muted)',
                      }}
                    >
                      <Copy size={12} /> Дубль
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm('Видалити роботу?')) return;
                        try {
                          await deleteWorkItem(item.id, id);
                          invalidate();
                        } catch (err) {
                          onSchemaErr(err);
                        }
                      }}
                      className="min-h-[40px] px-3 text-[11px] inline-flex items-center justify-center"
                      style={{
                        background: 'rgba(200,80,80,0.12)',
                        border: '1px solid rgba(200,80,80,0.25)',
                        borderRadius: 8,
                        color: '#f0a0a0',
                      }}
                      aria-label={t('delete')}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="cpc-desk-split-side flex flex-col gap-4 min-w-0">
      {/* ВИТРАТИ */}
      <section>
        <div className="flex items-center justify-between mb-2 px-0.5">
          <h2 className="text-[13px] font-medium" style={{ color: 'var(--cpc-text)' }}>
            Витрати
          </h2>
          <button
            type="button"
            onClick={() => setSheet('expense')}
            className="text-[12px] cpc-copper bg-transparent border-0 min-h-[36px]"
          >
            + Витрата
          </button>
        </div>
        {recentExpenses.length === 0 ? (
          <div className="cpc-card cpc-muted text-sm text-center py-4">Витрат ще немає</div>
        ) : (
          <div className="cpc-card divide-y" style={{ borderColor: 'var(--cpc-line)' }}>
            {recentExpenses.slice(0, 8).map((e) => {
              const catKey = categoryI18nKey(String(e.category));
              const cat =
                t(catKey) !== catKey ? t(catKey) : categoryLabelUk(String(e.category));
              const dateStr = String(e.expense_date || '').slice(0, 10);
              const dateLabel = dateStr
                ? dateStr.split('-').reverse().join('.')
                : '';
              return (
              <div key={e.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-[13px] truncate" style={{ color: 'var(--cpc-text)' }}>
                    {e.title || cat}
                  </p>
                  <p className="cpc-muted text-[11px]">
                    {cat}
                    {dateLabel ? ` · ${dateLabel}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <b className="tabular-nums text-[13px]" style={{ color: 'var(--cpc-text)' }}>
                    {formatCompact(Number(e.amount), currency)}
                  </b>
                  <button
                    type="button"
                    className="w-9 h-9 flex items-center justify-center bg-transparent border-0"
                    style={{ color: 'var(--cpc-muted)' }}
                    onClick={async () => {
                      try {
                        await deleteExpense(e.id, id);
                        invalidate();
                      } catch (err) {
                        onSchemaErr(err);
                      }
                    }}
                    aria-label={t('delete')}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ОПЛАТИ */}
      <section>
        <div className="flex items-center justify-between mb-2 px-0.5">
          <h2 className="text-[13px] font-medium" style={{ color: 'var(--cpc-text)' }}>
            Оплати
          </h2>
          <button
            type="button"
            onClick={() => setSheet('prepayment')}
            className="text-[12px] cpc-copper bg-transparent border-0 min-h-[36px]"
          >
            + Оплата
          </button>
        </div>
        {recentPayments.length === 0 && invoicePayDisplay.length === 0 ? (
          <div className="cpc-card cpc-muted text-sm text-center py-4">Оплат ще немає</div>
        ) : (
          <div className="cpc-card">
            <div className="divide-y" style={{ borderColor: 'var(--cpc-line)' }}>
              {invoicePayDisplay.map((p) => {
                const dateStr = String(p.paid_at || '').slice(0, 10);
                const dateLabel = dateStr
                  ? dateStr.split('-').reverse().join('.')
                  : '';
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-[13px] tabular-nums" style={{ color: 'var(--cpc-text)' }}>
                        {dateLabel || '—'}
                      </p>
                      <p className="cpc-muted text-[11px]">{p.note}</p>
                    </div>
                    <b className="tabular-nums text-[13px] cpc-copper shrink-0">
                      {formatCompact(p.amount, currency)}
                    </b>
                  </div>
                );
              })}
              {recentPayments.map((p) => {
                const { method, comment } = parsePaymentNote(p.note);
                const dateStr = String(p.paid_at || '').slice(0, 10);
                const dateLabel = dateStr
                  ? dateStr.split('-').reverse().join('.')
                  : '';
                return (
                <div key={p.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-[13px] tabular-nums" style={{ color: 'var(--cpc-text)' }}>
                      {dateLabel || '—'}
                    </p>
                    <p className="cpc-muted text-[11px]">
                      {method || comment
                        ? `${method || '—'}${comment ? ` · ${comment}` : ''}`
                        : 'Аванс / оплата'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <b className="tabular-nums text-[13px] cpc-copper">
                      {formatCompact(Number(p.amount), currency)}
                    </b>
                    <button
                      type="button"
                      className="w-9 h-9 flex items-center justify-center bg-transparent border-0"
                      style={{ color: 'var(--cpc-muted)' }}
                      onClick={async () => {
                        try {
                          await deletePrepayment(p.id, id);
                          invalidate();
                        } catch (err) {
                          onSchemaErr(err);
                        }
                      }}
                      aria-label={t('delete')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
            <div
              className="flex justify-between pt-2 mt-1 text-[13px]"
              style={{ borderTop: '1px solid var(--cpc-line)' }}
            >
              <span className="cpc-muted">Отримано</span>
              <b className="tabular-nums" style={{ color: 'var(--cpc-text)' }}>
                {formatCompact(metrics.received, currency)}
              </b>
            </div>
            {metrics.overpayment > 0 && (
              <div className="flex justify-between pt-1 text-[13px]">
                <span className="cpc-muted">Переплата</span>
                <b className="tabular-nums" style={{ color: '#f0a8a8' }}>
                  {formatCompact(metrics.overpayment, currency)}
                </b>
              </div>
            )}
          </div>
        )}
      </section>
      </div>
      </div>

      {/* РАХУНОК */}
      <section className="mb-2 lg:max-w-md">
        <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
          <h2 className="text-[13px] font-medium" style={{ color: 'var(--cpc-text)' }}>
            Рахунок
            {projectInvoices.length > 0 ? ` (${projectInvoices.length})` : ''}
          </h2>
        </div>

        {projectInvoices.length > 0 && (
          <div className="cpc-card mb-2 space-y-2">
            {projectInvoices.map((inv, idx) => {
              const status = resolveInvoiceStatus(inv.status, inv.due_date);
              const paidAmt = Number(invoiceMoney[idx]?.paid_amount) || 0;
              const gross = Number(inv.total_gross) || 0;
              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="w-full text-left flex items-center justify-between gap-3 min-h-[48px] bg-transparent border-0 px-0"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: 'var(--cpc-text)' }}>
                      {inv.document_no || 'Invoice'}
                    </p>
                    <p className="cpc-muted text-[11px] tabular-nums">
                      {formatCompact(gross, currency)}
                      {paidAmt > 0 ? ` · оплачено ${formatCompact(paidAmt, currency)}` : ''}
                    </p>
                  </div>
                  <CpcStatusBadge tone={invoiceStatusTone(status)}>
                    {invoiceStatusLabel(status)}
                  </CpcStatusBadge>
                </button>
              );
            })}
          </div>
        )}

        {projectInvoices.length === 0 && (
          <div className="space-y-2 mb-2">
            {suggestedLinkable.length > 0 && (
              <div className="cpc-card space-y-2">
                <p className="cpc-muted text-[11px]">Схожі рахунки — натисніть Прив’язати:</p>
                {suggestedLinkable.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-2 min-h-[44px]"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                      className="min-w-0 text-left bg-transparent border-0 p-0"
                    >
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--cpc-text)' }}>
                        {inv.document_no || 'Invoice'}
                      </p>
                      <p className="cpc-muted text-[11px] tabular-nums">
                        {formatCompact(Number(inv.total_gross) || 0, currency)}
                        {inv.clients?.name ? ` · ${inv.clients.name}` : ''}
                      </p>
                    </button>
                    <button
                      type="button"
                      disabled={linkInvoiceMut.isPending}
                      onClick={() => linkInvoiceMut.mutate(inv.id)}
                      className="min-h-[36px] px-2.5 text-[12px] font-medium shrink-0"
                      style={{
                        background: 'var(--cpc-copper)',
                        color: 'var(--cpc-on-copper)',
                        border: 'none',
                        borderRadius: 9,
                      }}
                    >
                      Прив’язати
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setSheet('linkInvoice')}
              className="w-full min-h-[48px] text-[14px] font-medium inline-flex items-center justify-center gap-2"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-copper)',
                borderRadius: 12,
                color: 'var(--cpc-copper)',
              }}
            >
              <FileText size={16} />
              Прив’язати рахунок
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={createInvoice}
          className="cpc-btn-primary w-full min-h-[52px] text-[15px] inline-flex items-center justify-center gap-2"
          disabled={workItems.length === 0}
        >
          <FileText size={18} />
          {projectInvoices.length > 0 ? 'Ще рахунок' : 'Створити рахунок з робіт'}
        </button>
        {workItems.length === 0 && projectInvoices.length === 0 && (
          <p className="cpc-muted text-[11px] text-center mt-2">
            Оберіть існуючий інвойс (напр. INV-2026-0001) через «Прив’язати рахунок»
          </p>
        )}
        {workItems.length === 0 && projectInvoices.length > 0 && (
          <p className="cpc-muted text-[11px] text-center mt-2">
            Суми й роботи взято з рахунку.
          </p>
        )}
      </section>

      {/* SHEETS */}
      <AnimatePresence>
        {sheet && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-2 pb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setSheet(null);
              resetWorkForm();
            }}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[var(--cpc-shell-max)] md:max-w-[520px] max-h-[88vh] overflow-y-auto p-4 pb-6"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 16,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm" style={{ color: 'var(--cpc-text)' }}>
                  {sheet === 'work' && (editingWorkId ? 'Редагувати роботу' : 'Додати роботу')}
                  {sheet === 'expense' && 'Додати витрату'}
                  {sheet === 'prepayment' && 'Зберегти оплату'}
                  {sheet === 'pdf' && 'PDF'}
                  {sheet === 'menu' && 'Меню'}
                  {sheet === 'linkInvoice' && 'Прив’язати рахунок'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSheet(null);
                    resetWorkForm();
                  }}
                  className="w-11 h-11 flex items-center justify-center bg-transparent border-0"
                  style={{ color: 'var(--cpc-muted)' }}
                >
                  <X size={18} />
                </button>
              </div>

              {sheet === 'linkInvoice' && (
                <div className="space-y-3">
                  <Input
                    label="Пошук"
                    value={linkInvoiceQuery}
                    onChange={(e) => setLinkInvoiceQuery(e.target.value)}
                    placeholder="INV-2026-0001, Carla, Magraner…"
                  />
                  {filteredLinkable.length === 0 ? (
                    <p className="cpc-muted text-sm text-center py-4">Рахунків не знайдено</p>
                  ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {filteredLinkable.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between gap-2 px-2 py-2"
                          style={{
                            background: 'var(--cpc-bg)',
                            border: '1px solid var(--cpc-line)',
                            borderRadius: 10,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => navigate(`/invoices/${inv.id}`)}
                            className="min-w-0 text-left bg-transparent border-0 p-0"
                          >
                            <p className="text-[13px] font-medium truncate" style={{ color: 'var(--cpc-text)' }}>
                              {inv.document_no || 'Invoice'}
                              {inv.score >= 25 ? ' · схожий' : ''}
                            </p>
                            <p className="cpc-muted text-[11px] tabular-nums">
                              {formatCompact(Number(inv.total_gross) || 0, currency)}
                              {inv.clients?.name ? ` · ${inv.clients.name}` : ''}
                            </p>
                          </button>
                          <button
                            type="button"
                            disabled={linkInvoiceMut.isPending}
                            onClick={() => linkInvoiceMut.mutate(inv.id)}
                            className="min-h-[36px] px-2.5 text-[12px] font-medium shrink-0"
                            style={{
                              background: 'var(--cpc-copper)',
                              color: 'var(--cpc-on-copper)',
                              border: 'none',
                              borderRadius: 9,
                            }}
                          >
                            Прив’язати
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {sheet === 'menu' && (
                <div className="space-y-2">
                  <Button
                    className="w-full min-h-[48px]"
                    style={{ background: 'var(--cpc-bg)', color: 'var(--cpc-text)' }}
                    onClick={() => setSheet('pdf')}
                  >
                    PDF кошторис
                  </Button>
                  <Button
                    className="w-full min-h-[48px] !bg-red-500/20 !text-red-200"
                    onClick={() => {
                      if (window.confirm(t('projectDeleteConfirm') || 'Видалити об’єкт?')) {
                        deleteMut.mutate();
                      }
                    }}
                  >
                    Видалити об’єкт
                  </Button>
                </div>
              )}

              {sheet === 'pdf' && (
                <div className="space-y-2">
                  <Button
                    className="w-full min-h-[48px]"
                    style={{ background: 'var(--cpc-copper)', color: 'var(--cpc-on-copper)' }}
                    disabled={pdfMut.isPending}
                    onClick={() => pdfMut.mutate('client')}
                  >
                    Для клієнта
                  </Button>
                  <Button
                    className="w-full min-h-[48px]"
                    style={{ background: 'var(--cpc-bg)', color: 'var(--cpc-text)' }}
                    disabled={pdfMut.isPending}
                    onClick={() => pdfMut.mutate('internal')}
                  >
                    Внутрішній звіт
                  </Button>
                </div>
              )}

              {sheet === 'work' && (
                <div className="space-y-3">
                  {!editingWorkId && (
                    <div>
                      <p className="cpc-muted text-xs mb-1.5">Шаблони</p>
                      <div
                        className="rounded-xl overflow-hidden divide-y"
                        style={{ border: '1px solid var(--cpc-line)', borderColor: 'var(--cpc-line)' }}
                      >
                        {TEMPLATE_GROUPS.map((cat) => {
                          const open = !!expandedCats[cat];
                          const list = templatesByCat[cat] || [];
                          return (
                            <div key={cat} style={{ borderColor: 'var(--cpc-line)' }}>
                              <button
                                type="button"
                                onClick={() => setExpandedCats((s) => ({ ...s, [cat]: !s[cat] }))}
                                className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 text-left bg-transparent border-0"
                                style={{ color: 'var(--cpc-text)' }}
                              >
                                {open ? (
                                  <ChevronDown size={16} className="cpc-copper shrink-0" />
                                ) : (
                                  <ChevronRight size={16} className="cpc-muted shrink-0" />
                                )}
                                <span className="text-sm font-medium flex-1">
                                  {localizedCategoryName(cat, language)}
                                </span>
                                <span className="cpc-muted text-[10px]">{list.length}</span>
                              </button>
                              {open && (
                                <div className="max-h-36 overflow-y-auto" style={{ background: 'var(--cpc-bg)' }}>
                                  {list.map((w) => (
                                    <button
                                      key={w.id}
                                      type="button"
                                      onClick={() => applyTemplate(w.id, cat)}
                                      className="w-full min-h-[44px] text-left px-3 py-2 text-sm border-0"
                                      style={{
                                        background:
                                          templateId === w.id ? 'rgba(200,121,74,0.2)' : 'transparent',
                                        color:
                                          templateId === w.id
                                            ? 'var(--cpc-copper-light)'
                                            : 'var(--cpc-muted)',
                                      }}
                                    >
                                      {localizedWorkName(w, language)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Input
                    label="Назва"
                    value={workTitle}
                    onChange={(e) => setWorkTitle(e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="cpc-muted text-xs mb-1.5">Кількість</p>
                      <QtyInput value={workQty} onChange={setWorkQty} className="!w-full" ariaLabel="qty" />
                    </div>
                    <Input label="Од." value={workUnit} onChange={(e) => setWorkUnit(e.target.value)} />
                    <MoneyInput
                      label="Ціна"
                      value={workPrice}
                      onChange={setWorkPrice}
                      currencyHint={currencySymbol}
                    />
                  </div>
                  {!workTitle.trim() && (
                    <p className="cpc-muted text-[11px]">
                      Оберіть шаблон вище або впишіть назву вручну
                    </p>
                  )}
                  <Button
                    className="w-full min-h-[48px]"
                    style={{ background: 'var(--cpc-copper)', color: 'var(--cpc-on-copper)' }}
                    disabled={saveWorkMut.isPending}
                    onClick={() => saveWorkMut.mutate('close')}
                  >
                    {saveWorkMut.isPending
                      ? t('saving') || 'Збереження…'
                      : editingWorkId
                        ? t('save') || 'Зберегти'
                        : 'Додати до списку'}
                  </Button>
                  {!editingWorkId && (
                    <Button
                      className="w-full min-h-[48px]"
                      style={{ background: 'var(--cpc-bg)', color: 'var(--cpc-text)' }}
                      disabled={saveWorkMut.isPending}
                      onClick={() => saveWorkMut.mutate('continue')}
                    >
                      Додати і ще одну
                    </Button>
                  )}
                </div>
              )}

              {sheet === 'expense' && (
                <div className="space-y-3">
                  <Input
                    label="Що купили?"
                    value={expTitle}
                    onChange={(e) => setExpTitle(e.target.value)}
                    placeholder="Цемент"
                  />
                  <MoneyInput
                    label="Сума"
                    value={expAmount}
                    onChange={setExpAmount}
                    currencyHint={currencySymbol}
                  />
                  <div>
                    <label className="cpc-card-label mb-1.5 block">Категорія</label>
                    <div className="flex flex-wrap gap-1.5">
                      {EXPENSE_CATEGORIES.map((c) => {
                        const key = categoryI18nKey(c);
                        const label = t(key) !== key ? t(key) : categoryLabelUk(c);
                        const active = expCategory === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setExpCategory(c)}
                            className="min-h-[40px] px-2.5 text-[12px] font-medium"
                            style={{
                              background: active ? 'var(--cpc-copper)' : 'var(--cpc-bg)',
                              color: active ? 'var(--cpc-on-copper)' : 'var(--cpc-text)',
                              border: `1px solid ${
                                active ? 'var(--cpc-copper)' : 'var(--cpc-line)'
                              }`,
                              borderRadius: 9,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Input
                    label="Дата"
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                  />
                  <Input
                    label="Нотатка — необов’язково"
                    value={expNote}
                    onChange={(e) => setExpNote(e.target.value)}
                    placeholder="Склад / доставка"
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
                    className="w-full min-h-[48px] flex items-center justify-center gap-2 text-sm"
                    style={{
                      background: 'var(--cpc-bg)',
                      border: '1px solid var(--cpc-line)',
                      borderRadius: 10,
                      color: 'var(--cpc-muted)',
                    }}
                  >
                    <Camera size={18} />
                    {expReceipt ? expReceipt.name : 'Фото чека (необов’язково)'}
                  </button>
                  <Button
                    className="w-full min-h-[48px]"
                    style={{ background: 'var(--cpc-copper)', color: 'var(--cpc-on-copper)' }}
                    disabled={addExpMut.isPending}
                    onClick={() => addExpMut.mutate()}
                  >
                    {t('save') || 'Зберегти'}
                  </Button>
                </div>
              )}

              {sheet === 'prepayment' && (
                <div className="space-y-3">
                  <MoneyInput
                    label="Сума"
                    value={prepAmount}
                    onChange={setPrepAmount}
                    currencyHint={currencySymbol}
                  />
                  <Input
                    label="Дата"
                    type="date"
                    value={prepDate}
                    onChange={(e) => setPrepDate(e.target.value)}
                  />
                  <div>
                    <label className="cpc-card-label mb-1.5 block">
                      Спосіб оплати — необов’язково
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {PAYMENT_METHODS.map((m) => {
                        const active = prepMethod === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPrepMethod(active ? '' : m)}
                            className="min-h-[40px] px-2.5 text-[12px] font-medium"
                            style={{
                              background: active ? 'var(--cpc-copper)' : 'var(--cpc-bg)',
                              color: active ? 'var(--cpc-on-copper)' : 'var(--cpc-text)',
                              border: `1px solid ${
                                active ? 'var(--cpc-copper)' : 'var(--cpc-line)'
                              }`,
                              borderRadius: 9,
                            }}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Input
                    label="Коментар — необов’язково"
                    value={prepNote}
                    onChange={(e) => setPrepNote(e.target.value)}
                    placeholder="Аванс / фінал"
                  />
                  <Button
                    className="w-full min-h-[48px]"
                    style={{ background: 'var(--cpc-copper)', color: 'var(--cpc-on-copper)' }}
                    disabled={addPrepMut.isPending}
                    onClick={() => addPrepMut.mutate()}
                  >
                    Зберегти оплату
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
