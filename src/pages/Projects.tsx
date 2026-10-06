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
import { formatMoneyDisplay } from '../lib/moneyMask';
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
    status === 'paid'
      ? 'bg-green-500/20 text-green-200'
      : status === 'completed'
        ? 'bg-emerald-500/15 text-emerald-200'
        : status === 'in_progress'
          ? 'bg-sky-500/20 text-sky-200'
          : 'bg-white/10 text-white/60';
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
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
    <div className="min-h-screen pt-[4.5rem] pb-24 px-3 w-full max-w-[430px] mx-auto min-w-0">
      <div className="flex items-center gap-2.5 mb-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-11 h-11 rounded-2xl bg-white/[0.07] border border-white/10 flex items-center justify-center text-white/80"
          aria-label={t('back')}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-white truncate">
            {t('projectsNav') || 'Об’єкти'}
          </h1>
          <p className="text-white/45 text-xs mt-0.5">
            {t('projectsSubtitle') || 'Кошторис, аванси та витрати по об’єкту'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-11 h-11 rounded-2xl bg-orange-500/25 border border-orange-400/35 flex items-center justify-center text-orange-200"
          aria-label={t('projectNew') || 'New project'}
        >
          <Plus size={22} />
        </button>
      </div>

      {schemaMissing && (
        <div className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-amber-100 text-sm space-y-2">
          <p>
            {t('projectsSchemaMissing') ||
              'Apply migration 20261006220000_create_project_estimator.sql in Supabase SQL Editor.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/projects/demo?demo=1')}
            className="w-full min-h-[44px] rounded-xl bg-orange-500/25 text-orange-100 border border-orange-400/30 text-sm font-medium"
          >
            {t('projectOpenDemo') || 'Open UX demo'}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-white/50 text-sm">{t('loading') || 'Loading…'}</p>
      ) : cards.length === 0 && !schemaMissing ? (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.03] px-5 py-10 text-center">
          <Building2 className="mx-auto mb-3 text-white/30" size={36} />
          <p className="text-white/70 text-sm mb-1">{t('projectsEmpty') || 'No projects yet'}</p>
          <p className="text-white/40 text-xs mb-4">
            {t('projectsEmptyHint') || 'Create an object to estimate works and track money.'}
          </p>
          <Button className="min-h-[48px]" onClick={() => setOpen(true)}>
            {t('projectNew') || 'New project'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {cards.map(({ project, metrics }, i) => (
            <motion.button
              key={project.id}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="w-full text-left rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.03] px-3.5 py-3.5 hover:bg-white/[0.08] active:scale-[0.99] transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-white font-semibold truncate">{project.name}</p>
                  {project.address && (
                    <p className="text-white/40 text-xs mt-0.5 truncate">{project.address}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {statusChip(project.status, t)}
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${
                      metrics.marginPct >= 20
                        ? 'bg-green-500/15 text-green-300'
                        : metrics.marginPct >= 0
                          ? 'bg-amber-500/15 text-amber-200'
                          : 'bg-red-500/15 text-red-300'
                    }`}
                  >
                    {metrics.marginPct.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-white/35">{t('projectEstimate') || 'Estimate'}</p>
                  <p className="text-white/90 font-medium tabular-nums">
                    {formatMoneyDisplay(metrics.estimateTotal, project.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-white/35">{t('projectBalanceDue') || 'Balance'}</p>
                  <p className="text-orange-300 font-medium tabular-nums">
                    {formatMoneyDisplay(metrics.balanceDue, project.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-white/35">{t('projectProfit') || 'Profit'}</p>
                  <p
                    className={`font-medium tabular-nums ${
                      metrics.projectedProfit >= 0 ? 'text-green-300' : 'text-red-300'
                    }`}
                  >
                    {formatMoneyDisplay(metrics.projectedProfit, project.currency)}
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
