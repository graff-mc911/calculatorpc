import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Plus, Search, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { formatCurrency, parseMoneyInput } from '../lib/moneyMask';
import { computeProjectMetrics } from '../lib/projectMetrics';
import {
  createProject,
  listProjects,
  uploadProjectReceipt,
  ProjectsSchemaMissingError,
  type Project,
  type ProjectStatus,
} from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

type FilterKey = 'all' | 'active' | 'done';

function isActiveStatus(status: ProjectStatus | string) {
  return status === 'draft' || status === 'in_progress';
}

function isDoneStatus(status: ProjectStatus | string) {
  return status === 'completed' || status === 'paid';
}

function formatCompact(value: number, currency: string) {
  const n = Number.isFinite(value) ? value : 0;
  if (Math.abs(n - Math.round(n)) < 0.005) {
    const whole = formatCurrency(Math.round(n), currency);
    return whole.replace(/,00(?=\s)/, '');
  }
  return formatCurrency(n, currency);
}

export default function Projects() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const {
    data: projects = [],
    isLoading,
    error,
    isError,
  } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjects,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-picker', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('clients')
        .select('id, name, address')
        .eq('user_id', session!.user!.id)
        .order('name');
      if (err) return [];
      return data || [];
    },
  });

  const schemaMissing = isError && error instanceof ProjectsSchemaMissingError;

  const { data: workByProject = {} } = useQuery({
    queryKey: ['projects-work-summary', session?.user?.id, projects.map((p) => p.id).join(',')],
    enabled: !!session?.user?.id && projects.length > 0,
    queryFn: async () => {
      const ids = projects.map((p) => p.id);
      const { data, error: err } = await supabase
        .from('project_work_items')
        .select('project_id, quantity, unit_price')
        .in('project_id', ids);
      if (err) throw err;
      const map: Record<string, Array<{ quantity: number; unit_price: number }>> = {};
      for (const row of data || []) {
        const pid = row.project_id as string;
        if (!map[pid]) map[pid] = [];
        map[pid].push({
          quantity: Number(row.quantity),
          unit_price: Number(row.unit_price),
        });
      }
      return map;
    },
  });

  const { data: moneyByProject = {} } = useQuery({
    queryKey: ['projects-money-summary', session?.user?.id, projects.map((p) => p.id).join(',')],
    enabled: !!session?.user?.id && projects.length > 0,
    queryFn: async () => {
      const ids = projects.map((p) => p.id);
      const [exp, prep] = await Promise.all([
        supabase.from('project_expenses').select('project_id, amount').in('project_id', ids),
        supabase.from('project_prepayments').select('project_id, amount').in('project_id', ids),
      ]);
      if (exp.error) throw exp.error;
      if (prep.error) throw prep.error;
      const map: Record<
        string,
        { expenses: { amount: number }[]; prepayments: { amount: number }[] }
      > = {};
      for (const id of ids) map[id] = { expenses: [], prepayments: [] };
      for (const row of exp.data || []) {
        map[row.project_id as string]?.expenses.push({ amount: Number(row.amount) });
      }
      for (const row of prep.data || []) {
        map[row.project_id as string]?.prepayments.push({ amount: Number(row.amount) });
      }
      return map;
    },
  });

  const resetForm = () => {
    setName('');
    setClientId('');
    setClientName('');
    setBudget('');
    setStartDate('');
    setNotes('');
    setPhoto(null);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const budgetNum = parseMoneyInput(budget);
      const noteParts: string[] = [];
      if (startDate.trim()) noteParts.push(`Дата: ${startDate.trim()}`);
      if (notes.trim()) noteParts.push(notes.trim());

      const project = await createProject({
        name,
        client_id: clientId || null,
        client_name: clientName || null,
        expense_budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : 0,
        notes: noteParts.length ? noteParts.join('\n') : null,
      });

      if (photo) {
        try {
          await uploadProjectReceipt(project.id, photo, photo.name || 'cover.jpg');
        } catch {
          // Photo is optional — project already created
        }
      }
      return project;
    },
    onSuccess: (project) => {
      showSuccess(t('projectCreated') || 'Об’єкт створено');
      qc.invalidateQueries({ queryKey: ['projects'] });
      setOpen(false);
      resetForm();
      navigate(`/projects/${project.id}`);
    },
    onError: (err) => {
      if (err instanceof ProjectsSchemaMissingError) {
        showError(t('projectsSchemaMissing') || 'Apply Supabase migration for projects');
        return;
      }
      showError(t('projectCreateFailed') || 'Не вдалося створити об’єкт');
    },
  });

  const onPickClient = (id: string) => {
    setClientId(id);
    const c = clients.find((x: { id: string }) => x.id === id);
    if (c) {
      setClientName(c.name || '');
    } else {
      setClientName('');
    }
  };

  const cards = useMemo(() => {
    return projects.map((p: Project) => {
      const metrics = computeProjectMetrics(
        workByProject[p.id] || [],
        moneyByProject[p.id]?.expenses || [],
        moneyByProject[p.id]?.prepayments || [],
        Number(p.expense_budget) || 0
      );
      const progressPct =
        metrics.estimateTotal > 0
          ? Math.min(100, Math.round((metrics.received / metrics.estimateTotal) * 100))
          : 0;
      return { project: p, metrics, progressPct };
    });
  }, [projects, workByProject, moneyByProject]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter(({ project }) => {
      if (filter === 'active' && !isActiveStatus(project.status)) return false;
      if (filter === 'done' && !isDoneStatus(project.status)) return false;
      if (!q) return true;
      const hay = [project.name, project.client_name || '', project.address || '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [cards, filter, query]);

  const title = t('projectsNav') === 'projectsNav' ? 'Об’єкти' : t('projectsNav');
  const newLabel = t('projectNew') === 'projectNew' ? 'Новий об’єкт' : t('projectNew');
  const sumLabel = 'Сума';
  const receivedLabel =
    t('projectReceived') === 'projectReceived' ? 'Отримано' : t('projectReceived');
  const balanceLabel = 'Залишок';
  const expensesLabel =
    t('projectExpenses') === 'projectExpenses' ? 'Витрати' : t('projectExpenses');
  const profitLabel = 'Прибуток';
  const progressLabel = 'Прогрес';
  const searchPlaceholder = 'Пошук об’єкта або клієнта…';
  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'Всі' },
    { key: 'active', label: 'Активні' },
    { key: 'done', label: 'Завершені' },
  ];

  return (
    <div className="cpc-page px-3 w-full max-w-[430px] mx-auto min-w-0 pb-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <h1 className="flex-1 text-xl font-medium truncate" style={{ color: 'var(--cpc-text)' }}>
          {title}
        </h1>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-[13px] font-medium shrink-0"
          style={{
            background: 'var(--cpc-copper)',
            color: 'var(--cpc-on-copper)',
            borderRadius: 10,
            border: 'none',
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
          {newLabel}
        </button>
      </div>

      {/* Search */}
      <div
        className="flex items-center gap-2 mb-2 px-2.5 min-h-[44px]"
        style={{
          background: 'var(--cpc-card)',
          border: '1px solid var(--cpc-line)',
          borderRadius: 12,
        }}
      >
        <Search size={16} style={{ color: 'var(--cpc-muted)' }} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="flex-1 bg-transparent border-0 outline-none text-[13px] min-w-0"
          style={{ color: 'var(--cpc-text)' }}
          aria-label={searchPlaceholder}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="p-1 bg-transparent border-0"
            style={{ color: 'var(--cpc-muted)' }}
            aria-label="Clear"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 mb-3">
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className="min-h-[36px] px-3 text-[12px] font-medium"
              style={{
                background: active ? 'rgba(200,121,74,0.22)' : 'var(--cpc-card)',
                border: `1px solid ${active ? 'rgba(224,151,95,0.45)' : 'var(--cpc-line)'}`,
                borderRadius: 9,
                color: active ? 'var(--cpc-copper-light)' : 'var(--cpc-muted)',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {schemaMissing && (
        <div className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-amber-100 text-sm">
          {t('projectsSchemaMissing') ||
            'Apply migration 20261006220000_create_project_estimator.sql in Supabase SQL Editor.'}
        </div>
      )}

      {isLoading ? (
        <p className="cpc-muted text-sm">{t('loading') || 'Завантаження…'}</p>
      ) : cards.length === 0 && !schemaMissing ? (
        <div className="cpc-card px-5 py-10 text-center">
          <Building2 className="mx-auto mb-3 cpc-muted" size={36} />
          <p className="text-sm mb-1" style={{ color: 'var(--cpc-text)' }}>
            {t('projectsEmpty') || 'Об’єктів ще немає'}
          </p>
          <p className="cpc-muted text-xs mb-4">
            {t('projectsEmptyHint') || 'Створіть об’єкт, щоб бачити гроші на місці.'}
          </p>
          <button
            type="button"
            className="cpc-btn-primary min-h-[48px] w-full"
            onClick={() => setOpen(true)}
          >
            {newLabel}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cpc-card text-center py-8">
          <p className="cpc-muted text-sm">Нічого не знайдено</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(({ project, metrics, progressPct }, i) => {
            const client =
              project.client_name ||
              clients.find((c: { id: string }) => c.id === project.client_id)?.name ||
              '—';
            const barWidth = `${progressPct}%`;
            return (
              <motion.button
                key={project.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.2) }}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="cpc-card w-full text-left active:scale-[0.99] transition-transform"
              >
                <div className="mb-2">
                  <p
                    className="font-medium text-[15px] leading-snug truncate"
                    style={{ color: 'var(--cpc-text)' }}
                  >
                    {project.name}
                  </p>
                  <p className="cpc-muted text-[12px] mt-0.5 truncate">{client}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="cpc-muted">{sumLabel}</span>
                    <b className="font-medium tabular-nums" style={{ color: 'var(--cpc-text)' }}>
                      {formatCompact(metrics.estimateTotal, project.currency)}
                    </b>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="cpc-muted">{receivedLabel}</span>
                    <b className="font-medium tabular-nums" style={{ color: 'var(--cpc-text)' }}>
                      {formatCompact(metrics.received, project.currency)}
                    </b>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="cpc-muted">{balanceLabel}</span>
                    <b className="font-medium tabular-nums cpc-copper">
                      {formatCompact(metrics.balanceDue, project.currency)}
                    </b>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="cpc-muted">{expensesLabel}</span>
                    <b className="font-medium tabular-nums" style={{ color: 'var(--cpc-text)' }}>
                      {formatCompact(metrics.expenses, project.currency)}
                    </b>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 col-span-2">
                    <span className="cpc-muted">{profitLabel}</span>
                    <b className="font-medium tabular-nums cpc-copper">
                      {formatCompact(metrics.projectedProfit, project.currency)}
                    </b>
                  </div>
                </div>

                <div className="mt-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="cpc-muted text-[11px]">{progressLabel}</span>
                    <span
                      className="text-[11px] font-medium tabular-nums"
                      style={{ color: 'var(--cpc-text)' }}
                    >
                      {progressPct}%
                    </span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden"
                    style={{ background: 'var(--cpc-line)', borderRadius: 4 }}
                    role="progressbar"
                    aria-valuenow={progressPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full transition-[width] duration-300"
                      style={{
                        width: barWidth,
                        background: 'var(--cpc-copper)',
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* FAB — always easy on mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-40 right-4 w-14 h-14 flex items-center justify-center shadow-lg"
        style={{
          bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
          background: 'var(--cpc-copper)',
          color: 'var(--cpc-on-copper)',
          borderRadius: 16,
          border: 'none',
        }}
        aria-label={newLabel}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 px-2 pb-2 sm:pb-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!createMut.isPending) {
                setOpen(false);
                resetForm();
              }
            }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[430px] p-4 max-h-[90vh] overflow-y-auto"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 16,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold" style={{ color: 'var(--cpc-text)' }}>
                  {newLabel}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  className="w-10 h-10 flex items-center justify-center bg-transparent border-0"
                  style={{ color: 'var(--cpc-muted)' }}
                  aria-label={t('cancel')}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <Input
                  label="Назва об’єкта"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('projectNamePlaceholder') || 'напр. Ремонт квартири'}
                  autoFocus
                />

                {clients.length > 0 ? (
                  <Select
                    label="Клієнт"
                    value={clientId}
                    onChange={(e) => onPickClient(e.target.value)}
                  >
                    <option value="">— без клієнта / свій —</option>
                    {clients.map((c: { id: string; name: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                ) : null}

                {!clientId && (
                  <Input
                    label={clients.length > 0 ? 'Або ім’я клієнта' : 'Клієнт'}
                    value={clientName}
                    onChange={(e) => {
                      setClientName(e.target.value);
                      if (clientId) setClientId('');
                    }}
                    placeholder="Ім’я клієнта"
                  />
                )}

                <Input
                  label="Ціна / бюджет, €"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="8 500"
                  inputMode="decimal"
                />

                <Input
                  label="Дата (необов’язково)"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />

                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: 'var(--cpc-muted)' }}
                  >
                    Фото (необов’язково)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                    className="w-full text-[12px]"
                    style={{ color: 'var(--cpc-text)' }}
                  />
                </div>

                <Input
                  label="Нотатка (необов’язково)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Коротко про об’єкт"
                />

                <Button
                  className="w-full min-h-[48px]"
                  style={{ background: 'var(--cpc-copper)', color: 'var(--cpc-on-copper)' }}
                  disabled={!name.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}
                >
                  {createMut.isPending ? t('saving') || 'Збереження…' : 'Створити'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
