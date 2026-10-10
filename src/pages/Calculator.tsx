import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Building2,
  Calculator as CalcIcon,
  ChevronDown,
  Copy,
  FileText,
  List,
  Pencil,
  Plus,
  Save,
  Search,
  Share2,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { useQuickActionHandlers } from '../components/QuickActionsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { POPULAR_TEMPLATES, loadCustomTemplates, type CalcTemplate } from '../lib/calcTemplates';
import { toPdfCompany } from '../lib/companyProfile';
import { computeHomeMoney } from '../lib/homeMoney';
import { getLastProjectId, setLastProjectId } from '../lib/lastProject';
import { normalizeExpenseCategory } from '../lib/expenseCategories';
import {
  getStoredPriceCountry,
  getWorkDetailLocal,
  localizedCategoryName,
  localizedWorkName,
  searchWorksLocal,
} from '../lib/priceCatalog';
import { shareProjectEstimatePdf } from '../lib/projectPdf';
import { computeProjectMetrics, lineTotal } from '../lib/projectMetrics';
import {
  addExpense,
  addWorkItem,
  createProject,
  deleteExpense,
  deleteWorkItem,
  fetchProjectBundle,
  listProjects,
  ProjectsSchemaMissingError,
  updateWorkItem,
  type Project,
  type ProjectExpense,
  type ProjectWorkItem,
} from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

type DraftWork = {
  localId: string;
  remoteId?: string;
  title: string;
  catalogWorkId?: string | null;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

type ExpenseBucket = {
  materials: number;
  salary: number;
  transportOther: number;
};

type ExpenseSource = 'catalog' | 'manual' | 'project' | 'empty';

type Sheet = 'project' | 'templates' | 'createProject' | null;

const DEFAULT_TITLE = '';
const DEFAULT_QTY = 0;
const DEFAULT_PRICE = 0;
const DEFAULT_UNIT = 'm²';
const DEFAULT_CATALOG: string | null = null;

function uid() {
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

function formatQty(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ',');
}

/** Empty editor fields: show blank, never a forced 0. */
function displayQtyField(n: number) {
  return n > 0 ? formatQty(n) : '';
}

function displayPriceField(n: number) {
  return n > 0 ? formatPrice(n) : '';
}

function formatPrice(n: number) {
  return n.toFixed(2).replace('.', ',');
}

function formatMargin(pct: number) {
  return (
    new Intl.NumberFormat('uk-UA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(pct) + '%'
  );
}

function parseUaNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned || cleaned === '.' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function displayUnit(unit: string) {
  const u = (unit || 'm2').toLowerCase();
  if (u === 'm2' || u === 'м2') return 'm²';
  if (u === 'm3' || u === 'м3') return 'm³';
  return unit || 'm²';
}

function storageUnit(unit: string) {
  const u = (unit || 'm2').trim();
  if (u === 'm²') return 'm2';
  if (u === 'm³') return 'm3';
  return u || 'm2';
}

function suggestCatalogCosts(works: DraftWork[], country: ReturnType<typeof getStoredPriceCountry>) {
  let materials = 0;
  let salary = 0;
  for (const w of works) {
    if (!w.catalogWorkId) continue;
    const detail = getWorkDetailLocal(w.catalogWorkId, country);
    if (!detail) continue;
    const matPer = detail.bom.reduce((sum, row) => sum + row.lineTotal, 0);
    const laborPer = Number(detail.labor?.price) || 0;
    materials += matPer * w.quantity;
    salary += laborPer * w.quantity;
  }
  return {
    materials: Math.round(materials),
    salary: Math.round(salary),
  };
}

function expensesFromProject(expenses: ProjectExpense[]): ExpenseBucket {
  let materials = 0;
  let salary = 0;
  let transportOther = 0;
  for (const e of expenses) {
    const cat = normalizeExpenseCategory(e.category);
    const amt = Number(e.amount) || 0;
    if (cat === 'materials') materials += amt;
    else if (cat === 'salary') salary += amt;
    else transportOther += amt;
  }
  return {
    materials: Math.round(materials * 100) / 100,
    salary: Math.round(salary * 100) / 100,
    transportOther: Math.round(transportOther * 100) / 100,
  };
}

function workFromRemote(item: ProjectWorkItem): DraftWork {
  return {
    localId: uid(),
    remoteId: item.id,
    title: item.title,
    catalogWorkId: item.catalog_work_id,
    category: item.category || 'other',
    quantity: Number(item.quantity) || 0,
    unit: displayUnit(item.unit),
    unitPrice: Number(item.unit_price) || 0,
  };
}

export default function Calculator() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();
  const priceCountry = getStoredPriceCountry();

  const [projectId, setProjectId] = useState<string | null>(() => getLastProjectId());
  const [works, setWorks] = useState<DraftWork[]>([]);
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);

  const [draftTitle, setDraftTitle] = useState(DEFAULT_TITLE);
  const [draftQty, setDraftQty] = useState(DEFAULT_QTY);
  const [draftPrice, setDraftPrice] = useState(DEFAULT_PRICE);
  const [draftUnit, setDraftUnit] = useState(DEFAULT_UNIT);
  const [draftCatalogId, setDraftCatalogId] = useState<string | null>(DEFAULT_CATALOG);
  const [draftCategory, setDraftCategory] = useState('other');
  const [qtyDraft, setQtyDraft] = useState('');
  const [priceDraftText, setPriceDraftText] = useState('');
  const [qtyFocused, setQtyFocused] = useState(false);
  const [priceFocused, setPriceFocused] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [titleHighlight, setTitleHighlight] = useState(0);
  const titleWrapRef = useRef<HTMLDivElement>(null);

  const [expenses, setExpenses] = useState<ExpenseBucket>({
    materials: 0,
    salary: 0,
    transportOther: 0,
  });
  const [expenseSource, setExpenseSource] = useState<{
    materials: ExpenseSource;
    salary: ExpenseSource;
    transportOther: ExpenseSource;
  }>({
    materials: 'empty',
    salary: 'empty',
    transportOther: 'empty',
  });
  const [expenseManual, setExpenseManual] = useState(false);
  const [expenseEditing, setExpenseEditing] = useState(false);
  const [expenseDrafts, setExpenseDrafts] = useState({
    materials: '0',
    salary: '0',
    transportOther: '0',
  });

  const [sheet, setSheet] = useState<Sheet>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [dirty, setDirty] = useState(false);
  const skipCatalogSeed = useRef(true);

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

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjects,
    retry: false,
  });

  const selectedProject = useMemo(
    () => (projects as Project[]).find((p) => p.id === projectId) || null,
    [projects, projectId]
  );

  // Keep projectId valid / default to last or first
  useEffect(() => {
    const list = projects as Project[];
    if (!list.length) {
      if (projectId) setProjectId(null);
      return;
    }
    if (projectId && list.some((p) => p.id === projectId)) return;
    const last = getLastProjectId();
    const next = (last && list.find((p) => p.id === last)?.id) || list[0].id;
    setProjectId(next);
    setLastProjectId(next);
  }, [projects, projectId]);

  // Load project works/expenses into calculator when selection changes
  const loadedProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || !session?.user?.id) return;
    if (loadedProjectRef.current === projectId && !dirty) return;
    let cancelled = false;
    (async () => {
      try {
        const bundle = await fetchProjectBundle(projectId);
        if (cancelled) return;
        const remoteWorks = bundle.workItems.map(workFromRemote);
        setWorks(remoteWorks);
        const fromProj = expensesFromProject(bundle.expenses);
        const hasProjExp =
          fromProj.materials > 0 || fromProj.salary > 0 || fromProj.transportOther > 0;
        if (hasProjExp) {
          setExpenses(fromProj);
          setExpenseSource({
            materials: fromProj.materials > 0 ? 'project' : 'empty',
            salary: fromProj.salary > 0 ? 'project' : 'empty',
            transportOther: fromProj.transportOther > 0 ? 'project' : 'empty',
          });
          setExpenseManual(true);
        } else {
          const suggested = suggestCatalogCosts(remoteWorks, priceCountry);
          setExpenses({
            materials: suggested.materials,
            salary: suggested.salary,
            transportOther: 0,
          });
          setExpenseSource({
            materials: suggested.materials > 0 ? 'catalog' : 'empty',
            salary: suggested.salary > 0 ? 'catalog' : 'empty',
            transportOther: 'empty',
          });
          setExpenseManual(false);
        }
        setEditingLocalId(null);
        resetEditorDefaults();
        setDirty(false);
        loadedProjectRef.current = projectId;
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ProjectsSchemaMissingError) {
          showError(t('projectsSchemaMissing') || 'Apply projects migration');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only reload when projectId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, session?.user?.id]);

  // Catalog suggestions for expenses when works change and user hasn't overridden
  useEffect(() => {
    if (expenseManual) return;
    const suggested = suggestCatalogCosts(works, priceCountry);
    setExpenses((prev) => ({
      materials: suggested.materials,
      salary: suggested.salary,
      transportOther: prev.transportOther,
    }));
    setExpenseSource({
      materials: suggested.materials > 0 ? 'catalog' : 'empty',
      salary: suggested.salary > 0 ? 'catalog' : 'empty',
      transportOther: expenses.transportOther > 0 ? expenseSource.transportOther : 'empty',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [works, expenseManual, priceCountry]);

  // Seed client price from catalog when template changes (new editor only)
  useEffect(() => {
    if (skipCatalogSeed.current) {
      skipCatalogSeed.current = false;
      return;
    }
    if (editingLocalId) return;
    if (!draftCatalogId) return;
    const detail = getWorkDetailLocal(draftCatalogId, priceCountry);
    if (!detail) return;
    const labor = Number(detail.labor?.price);
    if (Number.isFinite(labor) && labor > 0) {
      const next = Math.round(labor * 1.15 * 100) / 100;
      setDraftPrice(next);
      if (!priceFocused) setPriceDraftText(displayPriceField(next));
    }
    if (detail.work?.unit) setDraftUnit(displayUnit(detail.work.unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftCatalogId]);

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

  const metrics = useMemo(
    () =>
      computeProjectMetrics(
        works.map((w) => ({ quantity: w.quantity, unit_price: w.unitPrice })),
        [
          { amount: expenses.materials },
          { amount: expenses.salary },
          { amount: expenses.transportOther },
        ],
        []
      ),
    [works, expenses]
  );

  const clientCost = metrics.estimateTotal;
  const totalCosts = metrics.expenses;
  const profit = metrics.projectedProfit;
  const marginPct = metrics.marginPct;

  const templates: CalcTemplate[] = useMemo(
    () => [...POPULAR_TEMPLATES, ...loadCustomTemplates()],
    [sheet]
  );

  const titleSuggestions = useMemo(() => {
    const q = draftTitle.trim();
    if (q.length < 2) return [];
    return searchWorksLocal(q, priceCountry, 12);
  }, [draftTitle, priceCountry]);

  const showTitleSuggestions =
    titleFocused && draftTitle.trim().length >= 2 && titleSuggestions.length > 0;

  useEffect(() => {
    if (!showTitleSuggestions) {
      setTitleHighlight(0);
      return;
    }
    setTitleHighlight((i) => Math.min(i, titleSuggestions.length - 1));
  }, [showTitleSuggestions, titleSuggestions.length]);

  useEffect(() => {
    if (!titleFocused) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!titleWrapRef.current?.contains(e.target as Node)) {
        setTitleFocused(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [titleFocused]);

  function pickCatalogWork(workId: string) {
    const hit = titleSuggestions.find((h) => h.work.id === workId)
      || searchWorksLocal(draftTitle, priceCountry, 40).find((h) => h.work.id === workId);
    const work = hit?.work || getWorkDetailLocal(workId, priceCountry)?.work;
    if (!work) return;
    setDraftTitle(localizedWorkName(work, language));
    setDraftCatalogId(work.id);
    setDraftCategory(work.category);
    setDraftUnit(displayUnit(work.unit));
    setTitleFocused(false);
    setTitleHighlight(0);
  }

  function resetEditorDefaults() {
    setDraftTitle(DEFAULT_TITLE);
    setDraftQty(DEFAULT_QTY);
    setDraftPrice(DEFAULT_PRICE);
    setDraftUnit(DEFAULT_UNIT);
    setDraftCatalogId(DEFAULT_CATALOG);
    setDraftCategory('other');
    setQtyDraft('');
    setPriceDraftText('');
    setEditingLocalId(null);
  }

  function loadWorkIntoEditor(w: DraftWork) {
    setEditingLocalId(w.localId);
    setDraftTitle(w.title);
    setDraftQty(w.quantity);
    setDraftPrice(w.unitPrice);
    setDraftUnit(w.unit);
    setDraftCatalogId(w.catalogWorkId || null);
    setDraftCategory(w.category || 'other');
    setQtyDraft(displayQtyField(w.quantity));
    setPriceDraftText(displayPriceField(w.unitPrice));
  }

  const bumpQty = (delta: number) => {
    setDraftQty((q) => {
      const next = Math.max(0, Math.round((q + delta) * 10) / 10);
      setQtyDraft(displayQtyField(next));
      return next;
    });
  };

  const bumpPrice = (delta: number) => {
    setDraftPrice((p) => {
      const next = Math.max(0, Math.round((p + delta) * 100) / 100);
      setPriceDraftText(displayPriceField(next));
      return next;
    });
  };

  const commitQty = () => {
    setQtyFocused(false);
    if (!qtyDraft.trim()) {
      setDraftQty(0);
      setQtyDraft('');
      return;
    }
    const n = parseUaNumber(qtyDraft);
    const next = n === null ? 0 : Math.max(0, Math.round(n * 10) / 10);
    setDraftQty(next);
    setQtyDraft(displayQtyField(next));
  };

  const commitPrice = () => {
    setPriceFocused(false);
    if (!priceDraftText.trim()) {
      setDraftPrice(0);
      setPriceDraftText('');
      return;
    }
    const n = parseUaNumber(priceDraftText);
    const next = n === null ? 0 : Math.max(0, Math.round(n * 100) / 100);
    setDraftPrice(next);
    setPriceDraftText(displayPriceField(next));
  };

  const applyTemplate = (tpl: CalcTemplate) => {
    setEditingLocalId(null);
    setDraftTitle(tpl.title);
    setDraftUnit(displayUnit(tpl.unit));
    setDraftPrice(tpl.price);
    setPriceDraftText(formatPrice(tpl.price));
    setDraftCatalogId(tpl.catalogWorkId || null);
    setDraftCategory(tpl.category || 'other');
    if (draftQty <= 0) {
      setDraftQty(1);
      setQtyDraft(formatQty(1));
    }
    setSheet(null);
  };

  const commitEditorToList = () => {
    const title = draftTitle.trim();
    if (!title) {
      showError('Вкажіть назву роботи');
      return;
    }
    if (draftQty <= 0) {
      showError('Кількість має бути більше 0');
      return;
    }
    const next: DraftWork = {
      localId: editingLocalId || uid(),
      remoteId: editingLocalId
        ? works.find((w) => w.localId === editingLocalId)?.remoteId
        : undefined,
      title,
      catalogWorkId: draftCatalogId,
      category: draftCategory,
      quantity: draftQty,
      unit: draftUnit,
      unitPrice: draftPrice,
    };
    setWorks((prev) => {
      const idx = prev.findIndex((w) => w.localId === next.localId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      }
      return [...prev, next];
    });
    setDirty(true);
    resetEditorDefaults();
  };

  const removeWork = (localId: string) => {
    setWorks((prev) => prev.filter((w) => w.localId !== localId));
    if (editingLocalId === localId) resetEditorDefaults();
    setDirty(true);
  };

  const duplicateWork = (w: DraftWork) => {
    setWorks((prev) => [
      ...prev,
      {
        ...w,
        localId: uid(),
        remoteId: undefined,
      },
    ]);
    setDirty(true);
  };

  const selectProject = (id: string) => {
    if (dirty && !window.confirm('Є незбережені зміни. Змінити об’єкт?')) return;
    setProjectId(id);
    setLastProjectId(id);
    setDirty(false);
    loadedProjectRef.current = null;
    setSheet(null);
  };

  const createProjectMut = useMutation({
    mutationFn: async () => {
      const name = newProjectName.trim();
      if (!name) throw new Error('NAME_REQUIRED');
      return createProject({
        name,
        client_name: newClientName.trim() || null,
      });
    },
    onSuccess: (project) => {
      showSuccess(t('projectCreated') || 'Об’єкт створено');
      qc.invalidateQueries({ queryKey: ['projects'] });
      setNewProjectName('');
      setNewClientName('');
      setProjectId(project.id);
      setLastProjectId(project.id);
      loadedProjectRef.current = null;
      setWorks([]);
      setExpenses({ materials: 0, salary: 0, transportOther: 0 });
      setExpenseSource({ materials: 'empty', salary: 'empty', transportOther: 'empty' });
      setExpenseManual(false);
      setDirty(false);
      setSheet(null);
    },
    onError: (err) => {
      if (err instanceof ProjectsSchemaMissingError) {
        showError(t('projectsSchemaMissing') || 'Apply projects migration');
        return;
      }
      if (err instanceof Error && err.message === 'NAME_REQUIRED') {
        showError('Вкажіть назву об’єкта');
        return;
      }
      showError(t('projectCreateFailed') || 'Не вдалося створити об’єкт');
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('NO_PROJECT');
      // Flush editor into the works list before persisting
      let list = [...works];
      if (editingLocalId) {
        list = list.map((w) =>
          w.localId === editingLocalId
            ? {
                ...w,
                title: draftTitle.trim() || w.title,
                quantity: draftQty,
                unitPrice: draftPrice,
                unit: draftUnit,
                catalogWorkId: draftCatalogId,
                category: draftCategory,
              }
            : w
        );
      } else if (draftTitle.trim() && draftQty > 0) {
        list = [
          ...list,
          {
            localId: uid(),
            title: draftTitle.trim(),
            catalogWorkId: draftCatalogId,
            category: draftCategory,
            quantity: draftQty,
            unit: draftUnit,
            unitPrice: draftPrice,
          },
        ];
      }
      if (list.length === 0) throw new Error('NO_WORKS');

      const bundle = await fetchProjectBundle(projectId);
      const remoteIds = new Set(list.map((w) => w.remoteId).filter(Boolean) as string[]);
      for (const existing of bundle.workItems) {
        if (!remoteIds.has(existing.id)) {
          await deleteWorkItem(existing.id, projectId);
        }
      }

      const saved: DraftWork[] = [];
      for (const w of list) {
        if (w.remoteId) {
          const updated = await updateWorkItem(w.remoteId, {
            title: w.title,
            category: w.category,
            quantity: w.quantity,
            unit: storageUnit(w.unit),
            unit_price: w.unitPrice,
          });
          saved.push(workFromRemote(updated));
        } else {
          const created = await addWorkItem({
            project_id: projectId,
            title: w.title,
            category: w.category,
            catalog_work_id: w.catalogWorkId || null,
            quantity: w.quantity,
            unit: storageUnit(w.unit),
            unit_price: w.unitPrice,
          });
          saved.push(workFromRemote(created));
        }
      }

      // Sync calculator expense buckets (managed rows tagged cpc-calc:)
      const managed = bundle.expenses.filter((e) =>
        String(e.notes || '').startsWith('cpc-calc:')
      );
      for (const e of managed) await deleteExpense(e.id, projectId);
      const rows: Array<{ cat: string; amount: number; title: string }> = [
        { cat: 'materials', amount: expenses.materials, title: 'Матеріали' },
        { cat: 'salary', amount: expenses.salary, title: 'Зарплата бригади' },
        {
          cat: 'transport',
          amount: expenses.transportOther,
          title: 'Транспорт та інше',
        },
      ];
      for (const r of rows) {
        if (r.amount > 0) {
          await addExpense({
            project_id: projectId,
            title: r.title,
            category: r.cat,
            amount: r.amount,
            notes: `cpc-calc:${r.cat}`,
          });
        }
      }

      return { projectId, saved };
    },
    onSuccess: ({ projectId: pid, saved }) => {
      setWorks(saved);
      setDirty(false);
      loadedProjectRef.current = pid;
      resetEditorDefaults();
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-bundle', pid] });
      qc.invalidateQueries({ queryKey: ['projects-work-summary'] });
      qc.invalidateQueries({ queryKey: ['project-expenses'] });
      showSuccess('Розрахунок збережено в об’єкт');
    },
    onError: (err) => {
      if (err instanceof ProjectsSchemaMissingError) {
        showError(t('projectsSchemaMissing') || 'Apply projects migration');
        return;
      }
      if (err instanceof Error && err.message === 'NO_PROJECT') {
        showError('Спочатку оберіть або створіть об’єкт');
        setSheet('project');
        return;
      }
      if (err instanceof Error && err.message === 'NO_WORKS') {
        showError('Додайте хоча б одну роботу');
        return;
      }
      showError('Не вдалося зберегти. Перевірте дані й спробуйте ще.');
    },
  });

  const pdfMut = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('NO_PROJECT');
      if (dirty) {
        // Must save first so PDF matches persisted data
        await saveMut.mutateAsync();
      }
      const bundle = await fetchProjectBundle(projectId);
      if (!bundle.workItems.length) throw new Error('NO_WORKS');
      let company = {
        company_name: '',
        company_address: '',
        company_phone: '',
        company_email: '',
      };
      const { data } = await supabase
        .from('company_profile')
        .select('*')
        .eq('user_id', bundle.project.user_id)
        .maybeSingle();
      if (data) company = toPdfCompany(data);
      return shareProjectEstimatePdf({
        project: bundle.project,
        workItems: bundle.workItems,
        expenses: bundle.expenses,
        prepayments: bundle.prepayments,
        company,
        mode: 'client',
        labels: {
          estimateTitle: t('projectPdfTitle') || 'Кошторис',
          internalTitle: t('projectPdfInternalTitle') || 'Внутрішній звіт',
          client: t('clientName') || 'Клієнт',
          address: t('address') || 'Адреса',
          works: t('projectWorks') || 'Роботи',
          qty: t('quantity') || 'К-сть',
          unit: t('unit') || 'Од.',
          unitPrice: t('price') || 'Ціна',
          total: t('total') || 'Сума',
          estimateTotal: t('projectEstimate') || 'Вартість',
          received: t('projectReceived') || 'Отримано',
          balanceDue: t('projectBalanceDue') || 'Залишок',
          overpayment: t('projectOverpayment') || 'Переплата',
          expenses: t('projectExpenses') || 'Витрати',
          projectedProfit: t('projectProfit') || 'Прибуток',
          margin: t('projectMargin') || 'Маржа',
          prepayments: t('projectPrepayments') || 'Аванси',
          ungrouped: t('projectUngrouped') || 'Загальне',
          date: t('date') || 'Дата',
          note: t('notes') || 'Нотатка',
          category: t('category') || 'Категорія',
        },
      });
    },
    onSuccess: (result) => {
      showSuccess(
        result === 'shared'
          ? t('projectPdfShared') || 'PDF надіслано'
          : t('projectPdfDownloaded') || 'PDF завантажено'
      );
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'NO_PROJECT') {
        showError('Спочатку оберіть об’єкт');
        setSheet('project');
        return;
      }
      if (err instanceof Error && err.message === 'NO_WORKS') {
        showError('Немає робіт для PDF — додайте й збережіть');
        return;
      }
      showError(t('projectPdfFailed') || 'Не вдалося створити PDF');
    },
  });

  const goProjectAction = (add: 'expense' | 'prepayment') => {
    if (!projectId) {
      showError('Спочатку оберіть об’єкт');
      setSheet('project');
      return;
    }
    navigate(`/projects/${projectId}?add=${add}`);
  };

  useQuickActionHandlers({
    onWork: () => {
      resetEditorDefaults();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onExpense: () => {
      if (!projectId) {
        showError('Спочатку оберіть об’єкт');
        setSheet('project');
        return;
      }
      setExpenseEditing(true);
      setExpenseDrafts({
        materials: formatQty(expenses.materials),
        salary: formatQty(expenses.salary),
        transportOther: formatQty(expenses.transportOther),
      });
    },
    onAdvance: () => goProjectAction('prepayment'),
    onPdf: () => pdfMut.mutate(),
  });

  const sourceLabel = (s: ExpenseSource) => {
    if (s === 'catalog') return 'з каталогу цін';
    if (s === 'project') return 'з об’єкта';
    if (s === 'manual') return 'вручну';
    return '';
  };

  const openExpenseEdit = () => {
    setExpenseEditing(true);
    setExpenseDrafts({
      materials: formatQty(expenses.materials),
      salary: formatQty(expenses.salary),
      transportOther: formatQty(expenses.transportOther),
    });
  };

  const applyExpenseEdit = () => {
    const next = {
      materials: Math.max(0, parseUaNumber(expenseDrafts.materials) ?? expenses.materials),
      salary: Math.max(0, parseUaNumber(expenseDrafts.salary) ?? expenses.salary),
      transportOther: Math.max(
        0,
        parseUaNumber(expenseDrafts.transportOther) ?? expenses.transportOther
      ),
    };
    setExpenses(next);
    setExpenseSource({
      materials: 'manual',
      salary: 'manual',
      transportOther: 'manual',
    });
    setExpenseManual(true);
    setExpenseEditing(false);
    setDirty(true);
  };

  const balanceLabel =
    t('totalBalance') === 'totalBalance' ? 'Загальний баланс' : t('totalBalance');

  return (
    <div className="cpc-page w-full mx-auto min-w-0 flex flex-col gap-2.5 pb-4">
      {/* Balance */}
      <div className="cpc-card flex items-stretch justify-between gap-2">
        <div className="min-w-0 flex-1">
          <small className="cpc-card-label">{balanceLabel}</small>
          <b className="block text-[18px] font-medium cpc-copper tabular-nums truncate">
            {formatEuroBalance(money.profit)}
          </b>
        </div>
        <div
          className="w-px shrink-0 self-stretch my-0.5"
          style={{ background: 'var(--cpc-line)' }}
        />
        <div className="text-right cpc-muted text-[12px] shrink-0 pl-2 flex flex-col justify-center">
          Рахунків
          <b className="block text-[14px] tabular-nums" style={{ color: 'var(--cpc-text)' }}>
            {invoiceCount}
          </b>
        </div>
      </div>

      {/* Title + templates */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="inline-flex items-center gap-1.5 min-w-0">
          <CalcIcon size={18} style={{ color: 'var(--cpc-copper-light)' }} />
          <h1 className="text-[16px] font-medium truncate" style={{ color: 'var(--cpc-text)' }}>
            Калькулятор
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setSheet('templates')}
          className="inline-flex items-center gap-1 min-h-[40px] px-2 bg-transparent border-0 cursor-pointer shrink-0"
          style={{ color: 'var(--cpc-copper-light)' }}
        >
          <FileText size={15} />
          <span className="text-[12px] font-medium">Шаблони</span>
        </button>
      </div>

      {/* Object selector */}
      <button
        type="button"
        onClick={() => setSheet('project')}
        className="cpc-card w-full text-left flex items-center gap-2.5 cursor-pointer"
      >
        <span
          className="w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(200,121,74,0.14)',
            color: 'var(--cpc-copper-light)',
          }}
        >
          <Building2 size={18} />
        </span>
        <span className="min-w-0 flex-1">
          {selectedProject ? (
            <>
              <b className="block text-[14px] font-medium truncate" style={{ color: 'var(--cpc-text)' }}>
                {selectedProject.name}
              </b>
              <span className="cpc-muted text-[12px] truncate block">
                {selectedProject.client_name || 'Без клієнта'}
              </span>
            </>
          ) : (
            <>
              <b className="block text-[14px] font-medium" style={{ color: 'var(--cpc-text)' }}>
                {projectsLoading ? 'Завантаження…' : 'Оберіть об’єкт'}
              </b>
              <span className="cpc-muted text-[12px]">або створіть новий</span>
            </>
          )}
        </span>
        <ChevronDown size={18} className="shrink-0" style={{ color: 'var(--cpc-muted)' }} />
      </button>

      <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
        <div className="flex flex-col gap-2.5 min-w-0">
          {/* Active work editor */}
          <div className="cpc-card">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="inline-flex items-center gap-1.5">
                <Wrench size={15} style={{ color: 'var(--cpc-copper-light)' }} />
                <small className="cpc-card-label !mb-0">
                  {editingLocalId ? 'Редагування роботи' : 'Робота'}
                </small>
              </div>
            </div>

            <div ref={titleWrapRef} className="relative mb-2">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--cpc-muted)' }}
                />
                <input
                  value={draftTitle}
                  onChange={(e) => {
                    setDraftTitle(e.target.value);
                    setDraftCatalogId(null);
                    setTitleFocused(true);
                    setTitleHighlight(0);
                  }}
                  onFocus={() => setTitleFocused(true)}
                  onKeyDown={(e) => {
                    if (!showTitleSuggestions) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setTitleHighlight((i) => Math.min(i + 1, titleSuggestions.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setTitleHighlight((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter') {
                      const hit = titleSuggestions[titleHighlight];
                      if (hit) {
                        e.preventDefault();
                        pickCatalogWork(hit.work.id);
                      }
                    } else if (e.key === 'Escape') {
                      setTitleFocused(false);
                    }
                  }}
                  placeholder=""
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={showTitleSuggestions}
                  aria-autocomplete="list"
                  className="w-full min-h-[48px] text-[15px] pl-9 pr-3 outline-none"
                  style={{
                    background: 'var(--cpc-bg)',
                    border: '1px solid var(--cpc-line)',
                    borderRadius: 10,
                    color: 'var(--cpc-text)',
                  }}
                />
              </div>
              {showTitleSuggestions && (
                <ul
                  role="listbox"
                  className="absolute z-30 left-0 right-0 mt-1 max-h-[260px] overflow-y-auto py-1 shadow-lg"
                  style={{
                    background: 'var(--cpc-card, var(--cpc-bg))',
                    border: '1px solid var(--cpc-line)',
                    borderRadius: 10,
                  }}
                >
                  {titleSuggestions.map((hit, idx) => {
                    const name = localizedWorkName(hit.work, language);
                    const cat = localizedCategoryName(hit.work.category, language);
                    const active = idx === titleHighlight;
                    return (
                      <li key={hit.work.id} role="option" aria-selected={active}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2.5 min-h-[44px] border-0 cursor-pointer"
                          style={{
                            background: active ? 'var(--cpc-bg)' : 'transparent',
                            color: 'var(--cpc-text)',
                          }}
                          onMouseEnter={() => setTitleHighlight(idx)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickCatalogWork(hit.work.id)}
                        >
                          <span className="block text-[14px] font-medium truncate">{name}</span>
                          <span className="block text-[11px] truncate mt-0.5" style={{ color: 'var(--cpc-muted)' }}>
                            {cat} · {displayUnit(hit.work.unit)} · {formatPrice(hit.labor.price)} €
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-[12px]" style={{ color: 'var(--cpc-text)' }}>
                {draftUnit === 'm²' || draftUnit === 'm2' ? 'Площа, м²' : `Кількість, ${draftUnit}`}
              </span>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  className="cpc-step min-h-[44px] min-w-[44px]"
                  style={{ width: 44, height: 44 }}
                  onClick={() => bumpQty(-1)}
                  aria-label="−"
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={qtyFocused ? qtyDraft : displayQtyField(draftQty)}
                  placeholder=""
                  onFocus={(e) => {
                    setQtyFocused(true);
                    setQtyDraft(displayQtyField(draftQty));
                    e.currentTarget.select();
                  }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!/^[0-9]*([.,][0-9]*)?$/.test(raw)) return;
                    setQtyDraft(raw);
                    if (!raw.trim()) {
                      setDraftQty(0);
                      return;
                    }
                    const n = parseUaNumber(raw);
                    if (n !== null) setDraftQty(Math.max(0, n));
                  }}
                  onBlur={commitQty}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="min-w-[56px] max-w-[80px] min-h-[44px] text-center font-medium tabular-nums text-[13px] outline-none"
                  style={{
                    color: 'var(--cpc-text)',
                    background: 'var(--cpc-bg)',
                    border: '1px solid var(--cpc-line)',
                    borderRadius: 8,
                    padding: '0 4px',
                  }}
                />
                <button
                  type="button"
                  className="cpc-step min-h-[44px] min-w-[44px]"
                  style={{ width: 44, height: 44 }}
                  onClick={() => bumpQty(1)}
                  aria-label="+"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-1.5">
              <span className="text-[12px]" style={{ color: 'var(--cpc-text)' }}>
                Ціна за {draftUnit}, €
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
                <input
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={priceFocused ? priceDraftText : displayPriceField(draftPrice)}
                  placeholder=""
                  onFocus={(e) => {
                    setPriceFocused(true);
                    setPriceDraftText(displayPriceField(draftPrice));
                    e.currentTarget.select();
                  }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!/^[0-9]*([.,][0-9]{0,2})?$/.test(raw)) return;
                    setPriceDraftText(raw);
                    if (!raw.trim()) {
                      setDraftPrice(0);
                      return;
                    }
                    const n = parseUaNumber(raw);
                    if (n !== null) setDraftPrice(Math.max(0, n));
                  }}
                  onBlur={commitPrice}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="min-w-[64px] max-w-[88px] min-h-[44px] text-center font-medium tabular-nums text-[13px] outline-none"
                  style={{
                    color: 'var(--cpc-text)',
                    background: 'var(--cpc-bg)',
                    border: '1px solid var(--cpc-line)',
                    borderRadius: 8,
                    padding: '0 4px',
                  }}
                />
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

            <div className="flex items-center justify-between gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--cpc-line)' }}>
              <span className="cpc-muted text-[12px]">Сума</span>
              <b className="tabular-nums text-[15px]" style={{ color: 'var(--cpc-text)' }}>
                {formatEuro(lineTotal(draftQty, draftPrice))}
              </b>
            </div>

            <button
              type="button"
              onClick={commitEditorToList}
              className="w-full min-h-[44px] mt-2.5 text-[13px] font-medium"
              style={{
                background: 'transparent',
                border: '1px solid rgba(200,121,74,0.55)',
                borderRadius: 10,
                color: 'var(--cpc-copper-light)',
              }}
            >
              {editingLocalId ? 'Оновити роботу' : '+ Додати роботу'}
            </button>
          </div>

          {/* Added works — only when list is non-empty (no empty placeholder) */}
          {works.length > 0 && (
            <div className="cpc-card">
              <div className="inline-flex items-center gap-1.5 mb-2">
                <List size={15} style={{ color: 'var(--cpc-copper-light)' }} />
                <small className="cpc-card-label !mb-0">Додані роботи</small>
              </div>
              <div className="flex flex-col gap-1.5">
                {works.map((w) => (
                  <div
                    key={w.localId}
                    className="flex items-start justify-between gap-2 py-1.5"
                    style={{ borderBottom: '1px solid var(--cpc-line)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <b
                        className="block text-[13px] font-medium truncate"
                        style={{ color: 'var(--cpc-text)' }}
                      >
                        {w.title}
                      </b>
                      <span className="cpc-muted text-[11px] tabular-nums">
                        {formatQty(w.quantity)} {displayUnit(w.unit)} × {formatPrice(w.unitPrice)} €
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <b className="tabular-nums text-[13px] mr-1" style={{ color: 'var(--cpc-text)' }}>
                        {formatEuro(lineTotal(w.quantity, w.unitPrice))}
                      </b>
                      <button
                        type="button"
                        className="w-9 h-9 inline-flex items-center justify-center bg-transparent border-0"
                        style={{ color: 'var(--cpc-muted)' }}
                        aria-label="Редагувати"
                        onClick={() => loadWorkIntoEditor(w)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="w-9 h-9 inline-flex items-center justify-center bg-transparent border-0"
                        style={{ color: 'var(--cpc-muted)' }}
                        aria-label="Дублювати"
                        onClick={() => duplicateWork(w)}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        className="w-9 h-9 inline-flex items-center justify-center bg-transparent border-0"
                        style={{ color: 'var(--cpc-muted)' }}
                        aria-label="Видалити"
                        onClick={() => removeWork(w.localId)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5 min-w-0">
          {/* Expenses */}
          <div className="cpc-card">
            <div className="flex items-center justify-between gap-2 mb-2">
              <small className="cpc-card-label !mb-0">Витрати</small>
              <button
                type="button"
                onClick={openExpenseEdit}
                className="inline-flex items-center gap-1 min-h-[36px] px-1 bg-transparent border-0 cursor-pointer"
                style={{ color: 'var(--cpc-copper-light)' }}
              >
                <Pencil size={13} />
                <span className="text-[12px] font-medium">Редагувати</span>
              </button>
            </div>

            {(
              [
                ['materials', 'Матеріали', expenses.materials, expenseSource.materials],
                ['salary', 'Зарплата бригади', expenses.salary, expenseSource.salary],
                [
                  'transportOther',
                  'Транспорт та інше',
                  expenses.transportOther,
                  expenseSource.transportOther,
                ],
              ] as const
            ).map(([key, label, amount, src]) => (
              <div key={key} className="flex items-center justify-between gap-2 py-0.5">
                <div className="min-w-0">
                  <span className="cpc-muted text-[12px]">{label}</span>
                  {sourceLabel(src) && (
                    <span className="block text-[10px]" style={{ color: 'var(--cpc-muted)' }}>
                      {sourceLabel(src)}
                    </span>
                  )}
                </div>
                <span className="tabular-nums text-[12px]" style={{ color: 'var(--cpc-text)' }}>
                  {formatEuro(amount)}
                </span>
              </div>
            ))}

            <div
              className="flex items-center justify-between gap-2 mt-1.5 pt-1.5"
              style={{ borderTop: '1px solid var(--cpc-line)' }}
            >
              <b className="text-[12px] font-medium" style={{ color: 'var(--cpc-text)' }}>
                Всього витрат
              </b>
              <b className="tabular-nums text-[13px] font-medium" style={{ color: 'var(--cpc-text)' }}>
                {formatEuro(totalCosts)}
              </b>
            </div>
          </div>

          {/* Financial summary */}
          <div className="cpc-card">
            <div className="flex items-center justify-between gap-2">
              <span className="cpc-muted text-[12px]">Вартість для клієнта</span>
              <b className="tabular-nums text-[14px]" style={{ color: 'var(--cpc-text)' }}>
                {formatEuro(clientCost)}
              </b>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="cpc-muted text-[12px]">Витрати</span>
              <b className="tabular-nums text-[14px]" style={{ color: 'var(--cpc-text)' }}>
                {formatEuro(totalCosts)}
              </b>
            </div>
            <div className="cpc-profit mt-2.5 flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 min-w-0">
                <BarChart3 size={16} />
                <div className="min-w-0">
                  <div className="text-[11px] leading-tight">Чистий прибуток</div>
                  <b className="text-[18px] font-medium tabular-nums leading-tight">
                    {formatEuro(profit)}
                  </b>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px]">Маржа</div>
                <b className="text-[14px] font-medium tabular-nums">{formatMargin(marginPct)}</b>
              </div>
            </div>
          </div>

          {/* Actions */}
          <button
            type="button"
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className="cpc-btn-primary w-full min-h-[52px] text-[15px] font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save size={18} />
            {saveMut.isPending ? 'Зберігаємо…' : 'Зберегти в об’єкт'}
          </button>
          <button
            type="button"
            disabled={pdfMut.isPending || saveMut.isPending}
            onClick={() => pdfMut.mutate()}
            className="w-full min-h-[52px] text-[15px] font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
            style={{
              background: 'transparent',
              border: '1px solid rgba(200,121,74,0.55)',
              borderRadius: 10,
              color: 'var(--cpc-copper-light)',
            }}
          >
            <Share2 size={18} />
            {pdfMut.isPending ? 'PDF…' : 'Створити PDF / Поділитися'}
          </button>
        </div>
      </div>

      {/* Sheets */}
      <AnimatePresence>
        {sheet === 'project' && (
          <SheetFrame onClose={() => setSheet(null)} title="Обрати об’єкт">
            <div className="space-y-1.5 mb-3">
              {(projects as Project[]).map((p) => {
                const active = p.id === projectId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectProject(p.id)}
                    className="w-full text-left min-h-[52px] px-3 py-2"
                    style={{
                      background: active ? 'rgba(200,121,74,0.14)' : 'var(--cpc-bg)',
                      border: `1px solid ${active ? 'var(--cpc-copper)' : 'var(--cpc-line)'}`,
                      borderRadius: 10,
                      color: 'var(--cpc-text)',
                    }}
                  >
                    <b className="block text-[14px] font-medium truncate">{p.name}</b>
                    <span className="cpc-muted text-[12px]">
                      {p.client_name || 'Без клієнта'}
                    </span>
                  </button>
                );
              })}
              {!projectsLoading && (projects as Project[]).length === 0 && (
                <p className="cpc-muted text-sm text-center py-3">Об’єктів ще немає</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSheet('createProject')}
              className="cpc-btn-primary w-full min-h-[48px] inline-flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Створити новий об’єкт
            </button>
          </SheetFrame>
        )}

        {sheet === 'createProject' && (
          <SheetFrame onClose={() => setSheet('project')} title="Новий об’єкт">
            <label className="cpc-card-label mb-1 block">Назва об’єкта</label>
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Квартира, вул. …"
              className="w-full min-h-[48px] text-[15px] px-3 outline-none mb-3"
              style={{
                background: 'var(--cpc-bg)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 10,
                color: 'var(--cpc-text)',
              }}
            />
            <label className="cpc-card-label mb-1 block">Клієнт (текст, без нового запису)</label>
            <input
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Ім’я клієнта"
              className="w-full min-h-[48px] text-[15px] px-3 outline-none mb-4"
              style={{
                background: 'var(--cpc-bg)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 10,
                color: 'var(--cpc-text)',
              }}
            />
            <button
              type="button"
              disabled={createProjectMut.isPending}
              onClick={() => createProjectMut.mutate()}
              className="cpc-btn-primary w-full min-h-[48px] disabled:opacity-50"
            >
              {createProjectMut.isPending ? 'Створюємо…' : 'Створити'}
            </button>
          </SheetFrame>
        )}

        {sheet === 'templates' && (
          <SheetFrame onClose={() => setSheet(null)} title="Шаблони робіт">
            <div className="space-y-1.5">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="w-full text-left min-h-[48px] px-3 py-2"
                  style={{
                    background: 'var(--cpc-bg)',
                    border: '1px solid var(--cpc-line)',
                    borderRadius: 10,
                    color: 'var(--cpc-text)',
                  }}
                >
                  <b className="block text-[14px] font-medium">{tpl.title}</b>
                  <span className="cpc-muted text-[12px]">
                    {displayUnit(tpl.unit)} · {formatPrice(tpl.price)} €
                  </span>
                </button>
              ))}
            </div>
          </SheetFrame>
        )}

        {expenseEditing && (
          <SheetFrame onClose={() => setExpenseEditing(false)} title="Редагувати витрати">
            <p className="cpc-muted text-[12px] mb-3">
              Каталожні суми — підказка з прайсу (BOM × к-сть, зарплата × к-сть). Можна змінити
              вручну; вигадані витрати не підставляються.
            </p>
            {(
              [
                ['materials', 'Матеріали'],
                ['salary', 'Зарплата бригади'],
                ['transportOther', 'Транспорт та інше'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="mb-3">
                <label className="cpc-card-label mb-1 block">{label}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={expenseDrafts[key]}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!/^[0-9]*([.,][0-9]*)?$/.test(raw)) return;
                    setExpenseDrafts((d) => ({ ...d, [key]: raw }));
                  }}
                  className="w-full min-h-[48px] text-[16px] px-3 outline-none tabular-nums"
                  style={{
                    background: 'var(--cpc-bg)',
                    border: '1px solid var(--cpc-line)',
                    borderRadius: 10,
                    color: 'var(--cpc-text)',
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={applyExpenseEdit}
              className="cpc-btn-primary w-full min-h-[48px]"
            >
              Застосувати
            </button>
          </SheetFrame>
        )}
      </AnimatePresence>
    </div>
  );
}

function SheetFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-2 pb-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[var(--cpc-shell-max)] md:max-w-[480px] max-h-[75vh] overflow-y-auto p-4"
        style={{
          background: 'var(--cpc-card)',
          border: '1px solid var(--cpc-line)',
          borderRadius: 16,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold" style={{ color: 'var(--cpc-text)' }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 bg-transparent border-0"
            style={{ color: 'var(--cpc-muted)' }}
            aria-label="Закрити"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
