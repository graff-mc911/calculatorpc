import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Building2, Plus, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { formatCurrency } from '../lib/moneyMask';
import { computeProjectMetrics } from '../lib/projectMetrics';
import {
  createProject,
  listProjects,
  ProjectsSchemaMissingError,
  type Project,
} from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

function statusChip(status: string, t: (k: string) => string) {
  const key = `projectStatus_${status}`;
  const label = t(key) === key ? status : t(key);
  const cls =
    status === 'paid' || status === 'completed'
      ? 'cpc-badge cpc-badge-paid'
      : status === 'in_progress'
        ? 'cpc-badge cpc-badge-wait'
        : 'cpc-badge cpc-badge-draft';
  return <span className={cls}>{label}</span>;
}

export default function Projects() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [currency, setCurrency] = useState('EUR');

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
      const map: Record<string, { expenses: { amount: number }[]; prepayments: { amount: number }[] }> =
        {};
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
      setOpen(false);
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

  const cards = useMemo(() => {
    return projects.map((p: Project) => {
      const metrics = computeProjectMetrics(
        workByProject[p.id] || [],
        moneyByProject[p.id]?.expenses || [],
        moneyByProject[p.id]?.prepayments || [],
        Number(p.expense_budget) || 0
      );
      return { project: p, metrics };
    });
  }, [projects, workByProject, moneyByProject]);

  return (
    <div className="cpc-page px-3 w-full max-w-[430px] mx-auto min-w-0">
      <div className="flex items-center gap-2.5 mb-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-11 h-11 flex items-center justify-center"
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
          <h1 className="text-xl font-medium truncate" style={{ color: 'var(--cpc-text)' }}>
            {t('projectsNav') || 'Проекти'}
          </h1>
          <p className="cpc-muted text-xs mt-0.5">
            {t('projectsSubtitle') || 'Кошторис, аванси та витрати по об’єкту'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-11 h-11 flex items-center justify-center"
          style={{
            background: 'rgba(200,121,74,0.22)',
            border: '1px solid rgba(224,151,95,0.4)',
            borderRadius: 12,
            color: 'var(--cpc-copper-light)',
          }}
          aria-label={t('projectNew') || 'New project'}
        >
          <Plus size={22} />
        </button>
      </div>

      {schemaMissing && (
        <div className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-amber-100 text-sm">
          {t('projectsSchemaMissing') ||
            'Apply migration 20261006220000_create_project_estimator.sql in Supabase SQL Editor.'}
        </div>
      )}

      {isLoading ? (
        <p className="text-white/50 text-sm">{t('loading') || 'Loading…'}</p>
      ) : cards.length === 0 && !schemaMissing ? (
        <div className="cpc-card px-5 py-10 text-center">
          <Building2 className="mx-auto mb-3 cpc-muted" size={36} />
          <p className="text-sm mb-1" style={{ color: 'var(--cpc-text)' }}>
            {t('projectsEmpty') || 'No projects yet'}
          </p>
          <p className="cpc-muted text-xs mb-4">
            {t('projectsEmptyHint') || 'Create an object to estimate works and track money.'}
          </p>
          <button type="button" className="cpc-btn-primary min-h-[48px] w-full" onClick={() => setOpen(true)}>
            {t('projectNew') || 'New project'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map(({ project, metrics }, i) => (
            <motion.button
              key={project.id}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="cpc-card w-full text-left active:scale-[0.99] transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--cpc-text)' }}>
                    {project.name}
                  </p>
                  {project.address && (
                    <p className="cpc-muted text-xs mt-0.5 truncate">{project.address}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {statusChip(project.status, t)}
                  <span className="cpc-copper text-xs font-medium tabular-nums">
                    {metrics.marginPct.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="cpc-muted">{t('projectEstimate') || 'Estimate'}</p>
                  <p className="font-medium tabular-nums" style={{ color: 'var(--cpc-text)' }}>
                    {formatCurrency(metrics.estimateTotal, project.currency)}
                  </p>
                </div>
                <div>
                  <p className="cpc-muted">{t('projectBalanceDue') || 'Balance'}</p>
                  <p className="cpc-copper font-medium tabular-nums">
                    {formatCurrency(metrics.balanceDue, project.currency)}
                  </p>
                </div>
                <div>
                  <p className="cpc-muted">{t('projectProfit') || 'Profit'}</p>
                  <p className="cpc-copper font-medium tabular-nums">
                    {formatCurrency(metrics.projectedProfit, project.currency)}
                  </p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-2 pb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-[430px] rounded-2xl bg-[#24313a] border border-white/10 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold">{t('projectNew') || 'New project'}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-10 h-10 text-white/50"
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
                    <option value="">{t('noClient') || 'No client'} / {t('projectCustomClient') || 'custom'}</option>
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
                  className="w-full min-h-[48px] !bg-orange-500/30 !text-orange-100"
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
}
