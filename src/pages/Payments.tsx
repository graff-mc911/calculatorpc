import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { formatCurrency, maskMoneyTyping, parseMoneyInput } from '../lib/moneyMask';
import {
  PAYMENT_METHODS,
  composePaymentNote,
  parsePaymentNote,
} from '../lib/paymentNote';
import { computeProjectMetrics } from '../lib/projectMetrics';
import {
  addPrepayment,
  deletePrepayment,
  fetchProjectBundle,
  listProjectPrepayments,
  listProjects,
  ProjectsSchemaMissingError,
  type Project,
  type ProjectPrepayment,
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

export default function Payments() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();

  const [projectId, setProjectId] = useState(searchParams.get('project') || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso);
  const [method, setMethod] = useState('');
  const [comment, setComment] = useState('');

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

  const { data: allPayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['project-prepayments', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjectPrepayments,
    retry: false,
  });

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
    const rows = allPayments as ProjectPrepayment[];
    if (!projectId) return rows;
    return rows.filter((p) => p.project_id === projectId);
  }, [allPayments, projectId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['project-prepayments'] });
    qc.invalidateQueries({ queryKey: ['project-bundle', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['projects-work-summary'] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('NO_PROJECT');
      const n = parseMoneyInput(amount);
      if (!Number.isFinite(n) || n <= 0) throw new Error('NO_AMOUNT');
      return addPrepayment({
        project_id: projectId,
        amount: n,
        paid_at: date || todayIso(),
        note: composePaymentNote(method, comment),
      });
    },
    onSuccess: () => {
      showSuccess(t('projectPrepaymentAdded') || 'Оплату збережено');
      setAmount('');
      setComment('');
      setMethod('');
      setDate(todayIso());
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
        if (err.message === 'NO_AMOUNT') {
          showError('Вкажіть суму');
          return;
        }
      }
      showError(t('error') || 'Помилка збереження');
    },
  });

  return (
    <div className="cpc-page w-full mx-auto min-w-0 pb-6">
      <h1 className="text-xl font-medium mb-3" style={{ color: 'var(--cpc-text)' }}>
        Аванси та оплати
      </h1>

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

      {/* Live money snapshot */}
      {metrics && projectId && (
        <div className="cpc-card mb-3 space-y-2">
          <div className="flex items-end justify-between gap-2">
            <div>
              <span className="cpc-card-label">Ціна об’єкта</span>
              <b
                className="block text-[22px] font-medium tabular-nums"
                style={{ color: 'var(--cpc-text)' }}
              >
                {formatCompact(metrics.estimateTotal, currency)}
              </b>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
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
              <span className="cpc-muted">Прибуток</span>
              <b className="tabular-nums font-medium" style={{ color: 'var(--cpc-text)' }}>
                {formatCompact(metrics.projectedProfit, currency)}
              </b>
            </div>
          </div>
        </div>
      )}

      <div className="cpc-desk-split">
      {/* Quick add */}
      <div className="cpc-card cpc-desk-split-main space-y-3">
        <div>
          <label className="cpc-card-label mb-1">Сума</label>
          <div className="relative">
            <input
              value={amount}
              onChange={(e) => setAmount(maskMoneyTyping(e.target.value))}
              inputMode="decimal"
              placeholder="4 000"
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
          <label className="cpc-card-label mb-1.5">Спосіб оплати — необов’язково</label>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => {
              const active = method === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(active ? '' : m)}
                  className="min-h-[40px] px-2.5 text-[12px] font-medium"
                  style={{
                    background: active ? 'var(--cpc-copper)' : 'var(--cpc-bg)',
                    color: active ? 'var(--cpc-on-copper)' : 'var(--cpc-text)',
                    border: `1px solid ${active ? 'var(--cpc-copper)' : 'var(--cpc-line)'}`,
                    borderRadius: 9,
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="cpc-card-label mb-1">Коментар — необов’язково</label>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Аванс / фінал"
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
          {saveMut.isPending ? 'Зберігаємо…' : 'Зберегти оплату'}
        </button>
      </div>

      {/* History */}
      <section className="cpc-desk-split-side min-w-0">
        <h2 className="text-[13px] font-medium mb-2 px-0.5" style={{ color: 'var(--cpc-text)' }}>
          Історія оплат
        </h2>
        {paymentsLoading ? (
          <div className="cpc-card cpc-muted text-sm text-center py-4">Завантаження…</div>
        ) : list.length === 0 ? (
          <div className="cpc-card cpc-muted text-sm text-center py-5">
            Оплат ще немає — запишіть першу вище
          </div>
        ) : (
          <div className="cpc-card divide-y" style={{ borderColor: 'var(--cpc-line)' }}>
            {list.map((p) => {
              const { method: m, comment: c } = parsePaymentNote(p.note);
              const projName = projectById.get(p.project_id)?.name;
              return (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[14px] font-medium tabular-nums"
                      style={{ color: 'var(--cpc-text)' }}
                    >
                      {formatDateShort(p.paid_at)}
                    </p>
                    <p className="cpc-muted text-[11px] mt-0.5">
                      {m || '—'}
                      {c ? ` · ${c}` : ''}
                      {!projectId && projName ? ` · ${projName}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <b className="tabular-nums text-[14px] font-medium cpc-copper">
                      {formatCompact(Number(p.amount), currency)}
                    </b>
                    <button
                      type="button"
                      className="w-9 h-9 flex items-center justify-center bg-transparent border-0"
                      style={{ color: 'var(--cpc-muted)' }}
                      aria-label={t('delete') || 'Видалити'}
                      onClick={async () => {
                        if (!window.confirm('Видалити оплату?')) return;
                        try {
                          await deletePrepayment(p.id, p.project_id);
                          qc.invalidateQueries({ queryKey: ['project-prepayments'] });
                          qc.invalidateQueries({
                            queryKey: ['project-bundle', p.project_id],
                          });
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

      {selectedProject && (
        <button
          type="button"
          onClick={() => navigate(`/projects/${selectedProject.id}`)}
          className="w-full text-center text-[12px] cpc-copper bg-transparent border-0 min-h-[40px] mt-2"
        >
          До об’єкта →
        </button>
      )}

      <p className="cpc-muted text-[11px] text-center mt-2 px-2">
        Оплата одразу оновлює Отримано, Залишок, Переплату та Прибуток.
      </p>
      </section>
      </div>
    </div>
  );
}
