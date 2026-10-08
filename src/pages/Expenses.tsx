import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import {
  EXPENSE_CATEGORIES,
  categoryI18nKey,
  categoryLabelUk,
  type ExpenseCategory,
} from '../lib/expenseCategories';
import { formatCurrency, maskMoneyTyping, parseMoneyInput } from '../lib/moneyMask';
import { computeProjectMetrics } from '../lib/projectMetrics';
import {
  addExpense,
  deleteExpense,
  fetchProjectBundle,
  listProjectExpenses,
  listProjects,
  ProjectsSchemaMissingError,
  type Project,
  type ProjectExpense,
} from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

function formatCompact(value: number, currency = 'EUR') {
  const n = Number.isFinite(value) ? value : 0;
  if (Math.abs(n - Math.round(n)) < 0.005) {
    return formatCurrency(Math.round(n), currency).replace(/,00(?=\s)/, '');
  }
  return formatCurrency(n, currency);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateShort(iso: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export default function Expenses() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();

  const [projectId, setProjectId] = useState(searchParams.get('project') || '');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('materials');
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState('');

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjects,
    retry: false,
  });

  const { data: allExpenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['project-expenses', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjectExpenses,
    retry: false,
  });

  // Default to newest project once list loads
  useEffect(() => {
    if (projectId) return;
    if (projects.length > 0) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const selectedProject = useMemo(
    () => (projects as Project[]).find((p) => p.id === projectId) || null,
    [projects, projectId]
  );

  const currency = selectedProject?.currency || 'EUR';

  const { data: bundle } = useQuery({
    queryKey: ['project-bundle', projectId],
    enabled: !!projectId && !!session?.user?.id,
    queryFn: () => fetchProjectBundle(projectId),
    retry: false,
  });

  const metrics = useMemo(() => {
    if (!bundle) return null;
    return computeProjectMetrics(
      bundle.workItems,
      bundle.expenses,
      bundle.prepayments,
      Number(bundle.project.expense_budget) || 0
    );
  }, [bundle]);

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects as Project[]) map.set(p.id, p);
    return map;
  }, [projects]);

  const list = useMemo(() => {
    const rows = allExpenses as ProjectExpense[];
    if (!projectId) return rows;
    return rows.filter((e) => e.project_id === projectId);
  }, [allExpenses, projectId]);

  const total = useMemo(
    () => list.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [list]
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['project-expenses'] });
    qc.invalidateQueries({ queryKey: ['project-bundle', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['projects-work-summary'] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('NO_PROJECT');
      const n = parseMoneyInput(amount);
      if (!title.trim()) throw new Error('NO_TITLE');
      if (!Number.isFinite(n) || n <= 0) throw new Error('NO_AMOUNT');
      return addExpense({
        project_id: projectId,
        title: title.trim(),
        category,
        amount: n,
        expense_date: date || todayIso(),
        notes: note.trim() || null,
      });
    },
    onSuccess: () => {
      showSuccess(t('projectExpenseAdded') || 'Збережено');
      setTitle('');
      setAmount('');
      setNote('');
      setDate(todayIso());
      setCategory('materials');
      invalidate();
    },
    onError: (err) => {
      if (err instanceof ProjectsSchemaMissingError) {
        showError(t('projectsSchemaMissing') || 'Apply projects migration');
        return;
      }
      if (err instanceof Error) {
        if (err.message === 'NO_PROJECT') {
          showError('Оберіть об’єкт');
          return;
        }
        if (err.message === 'NO_TITLE') {
          showError('Що купили?');
          return;
        }
        if (err.message === 'NO_AMOUNT') {
          showError('Вкажіть суму');
          return;
        }
      }
      showError(t('error') || 'Помилка збереження');
    },
  });

  const catLabel = (cat: string) => {
    const key = categoryI18nKey(cat);
    const translated = t(key);
    if (translated && translated !== key) return translated;
    return categoryLabelUk(cat);
  };

  return (
    <div className="cpc-page px-3 w-full max-w-[430px] mx-auto min-w-0 pb-6">
      <h1 className="text-xl font-medium mb-3" style={{ color: 'var(--cpc-text)' }}>
        Витрати
      </h1>

      {/* Object picker — expense must hit a project for metrics */}
      <div className="mb-3">
        <label className="cpc-card-label mb-1.5 block">Об’єкт</label>
        {projectsLoading ? (
          <p className="cpc-muted text-sm">Завантаження…</p>
        ) : projects.length === 0 ? (
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="cpc-btn-primary w-full min-h-[48px]"
          >
            Спочатку створіть об’єкт
          </button>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
            {(projects as Project[]).map((p) => {
              const active = p.id === projectId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProjectId(p.id)}
                  className="shrink-0 min-h-[40px] px-3 text-[13px] font-medium"
                  style={{
                    background: active ? 'var(--cpc-copper)' : 'var(--cpc-card)',
                    color: active ? 'var(--cpc-on-copper)' : 'var(--cpc-text)',
                    border: `1px solid ${active ? 'var(--cpc-copper)' : 'var(--cpc-line)'}`,
                    borderRadius: 9,
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {metrics?.budgetExceeded && (
        <div
          className="mb-3 px-3 py-2.5 text-[13px] font-medium"
          style={{
            background: 'rgba(200,80,80,0.14)',
            border: '1px solid rgba(200,80,80,0.35)',
            borderRadius: 12,
            color: '#f0a8a8',
          }}
          role="alert"
        >
          {t('projectBudgetExceeded') || 'Бюджет перевищено'}
          {metrics.budgetBase > 0 && (
            <span className="block text-[12px] font-normal mt-0.5 opacity-90">
              Витрачено {formatCompact(metrics.expenses, currency)} з{' '}
              {formatCompact(metrics.budgetBase, currency)}
            </span>
          )}
        </div>
      )}

      {/* Quick add form */}
      <div className="cpc-card mb-3 space-y-3">
        <div>
          <label className="cpc-card-label mb-1">Що купили?</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Цемент"
            className="w-full min-h-[48px] text-[16px] px-3 bg-transparent outline-none"
            style={{
              background: 'var(--cpc-bg)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 10,
              color: 'var(--cpc-text)',
            }}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="cpc-card-label mb-1">Сума</label>
          <div className="relative">
            <input
              value={amount}
              onChange={(e) => setAmount(maskMoneyTyping(e.target.value))}
              inputMode="decimal"
              placeholder="120"
              className="w-full min-h-[56px] text-[24px] font-medium tabular-nums px-3 pr-10 outline-none"
              style={{
                background: 'var(--cpc-bg)',
                border: '2px solid var(--cpc-copper)',
                borderRadius: 12,
                color: 'var(--cpc-text)',
              }}
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] pointer-events-none"
              style={{ color: 'var(--cpc-muted)' }}
            >
              €
            </span>
          </div>
        </div>

        <div>
          <label className="cpc-card-label mb-1.5">Категорія</label>
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className="min-h-[40px] px-2.5 text-[12px] font-medium"
                  style={{
                    background: active ? 'var(--cpc-copper)' : 'var(--cpc-bg)',
                    color: active ? 'var(--cpc-on-copper)' : 'var(--cpc-text)',
                    border: `1px solid ${active ? 'var(--cpc-copper)' : 'var(--cpc-line)'}`,
                    borderRadius: 9,
                  }}
                >
                  {catLabel(c)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="cpc-card-label mb-1">Дата</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full min-h-[48px] text-[16px] px-3 outline-none"
            style={{
              background: 'var(--cpc-bg)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 10,
              color: 'var(--cpc-text)',
              colorScheme: 'dark',
            }}
          />
        </div>

        <div>
          <label className="cpc-card-label mb-1">Нотатка — необов’язково</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Склад / доставка"
            className="w-full min-h-[44px] text-[15px] px-3 outline-none"
            style={{
              background: 'var(--cpc-bg)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 10,
              color: 'var(--cpc-text)',
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || !projectId}
          className="cpc-btn-primary w-full min-h-[52px] text-[16px] font-medium disabled:opacity-40"
        >
          {saveMut.isPending ? 'Зберігаємо…' : 'Зберегти'}
        </button>
      </div>

      {/* Impact strip when project selected */}
      {metrics && projectId && (
        <div className="grid grid-cols-2 gap-2 mb-3 text-[12px]">
          <div className="cpc-card py-2 px-3">
            <span className="cpc-muted">Витрачено</span>
            <b className="block tabular-nums text-[15px]" style={{ color: 'var(--cpc-text)' }}>
              {formatCompact(metrics.expenses, currency)}
            </b>
          </div>
          <div className="cpc-card py-2 px-3">
            <span className="cpc-muted">Прибуток</span>
            <b className="block tabular-nums text-[15px] cpc-profit" style={{ background: 'none', padding: 0 }}>
              {formatCompact(metrics.projectedProfit, currency)}
            </b>
          </div>
          <div className="cpc-card py-2 px-3">
            <span className="cpc-muted">Margin</span>
            <b className="block tabular-nums text-[15px]" style={{ color: 'var(--cpc-text)' }}>
              {Number.isFinite(metrics.marginPct) ? `${metrics.marginPct.toFixed(1)}%` : '—'}
            </b>
          </div>
          <div className="cpc-card py-2 px-3">
            <span className="cpc-muted">Бюджет</span>
            <b className="block tabular-nums text-[15px]" style={{ color: 'var(--cpc-text)' }}>
              {metrics.budgetBase > 0 ? formatCompact(metrics.budgetBase, currency) : '—'}
            </b>
          </div>
        </div>
      )}

      {/* List */}
      <section className="mb-3">
        <h2 className="text-[13px] font-medium mb-2 px-0.5" style={{ color: 'var(--cpc-text)' }}>
          Список
        </h2>
        {expensesLoading ? (
          <div className="cpc-card cpc-muted text-sm text-center py-4">Завантаження…</div>
        ) : list.length === 0 ? (
          <div className="cpc-card cpc-muted text-sm text-center py-5">
            Витрат ще немає — додайте за 5 секунд вище
          </div>
        ) : (
          <div
            className="cpc-card divide-y"
            style={{ borderColor: 'var(--cpc-line)' }}
          >
            {list.map((e) => {
              const projName = projectById.get(e.project_id)?.name;
              return (
                <div
                  key={e.id}
                  className="flex items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[14px] font-medium truncate"
                      style={{ color: 'var(--cpc-text)' }}
                    >
                      {e.title || catLabel(String(e.category))}
                    </p>
                    <p className="cpc-muted text-[11px] mt-0.5">
                      {catLabel(String(e.category))}
                      {' · '}
                      {formatDateShort(e.expense_date)}
                      {!projectId && projName ? ` · ${projName}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <b
                      className="tabular-nums text-[14px] font-medium"
                      style={{ color: 'var(--cpc-text)' }}
                    >
                      {formatCompact(Number(e.amount), currency)}
                    </b>
                    <button
                      type="button"
                      className="w-9 h-9 flex items-center justify-center bg-transparent border-0"
                      style={{ color: 'var(--cpc-muted)' }}
                      aria-label={t('delete') || 'Видалити'}
                      onClick={async () => {
                        if (!window.confirm('Видалити витрату?')) return;
                        try {
                          await deleteExpense(e.id, e.project_id);
                          qc.invalidateQueries({ queryKey: ['project-expenses'] });
                          qc.invalidateQueries({ queryKey: ['project-bundle', e.project_id] });
                          qc.invalidateQueries({ queryKey: ['projects'] });
                        } catch (err) {
                          if (err instanceof ProjectsSchemaMissingError) {
                            showError(t('projectsSchemaMissing') || 'Apply projects migration');
                          } else {
                            showError(t('error') || 'Помилка');
                          }
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Total */}
      <div
        className="cpc-card flex items-end justify-between"
        style={{
          borderColor: 'rgba(224,151,95,0.35)',
          background: 'rgba(200,121,74,0.10)',
        }}
      >
        <div>
          <span className="cpc-card-label">Всього витрат</span>
          <b className="block text-[26px] font-semibold tabular-nums cpc-copper leading-tight">
            {formatCompact(total, currency)}
          </b>
        </div>
        {selectedProject && (
          <button
            type="button"
            onClick={() => navigate(`/projects/${selectedProject.id}`)}
            className="text-[12px] cpc-copper bg-transparent border-0 min-h-[36px] pb-0.5"
          >
            До об’єкта →
          </button>
        )}
      </div>

      <p className="cpc-muted text-[11px] text-center mt-3 px-2">
        Витрата на об’єкті одразу змінює Витрачено, Прибуток, Margin і Бюджет.
      </p>
    </div>
  );
}
