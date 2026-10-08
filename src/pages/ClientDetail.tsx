import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { mailtoHref, resolveClientNote, telHref, whatsappHref } from '../lib/clientContact';
import { formatCurrency } from '../lib/moneyMask';
import { computeProjectMetrics } from '../lib/projectMetrics';
import { listProjects, type Project } from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

function formatCompact(value: number, currency = 'EUR') {
  const n = Number.isFinite(value) ? value : 0;
  if (Math.abs(n - Math.round(n)) < 0.005) {
    return formatCurrency(Math.round(n), currency).replace(/,00(?=\s)/, '');
  }
  return formatCurrency(n, currency);
}

export default function ClientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id, session?.user?.id],
    enabled: !!id && !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .eq('user_id', session!.user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjects,
    retry: false,
  });

  const clientProjects = useMemo(
    () => (projects as Project[]).filter((p) => p.client_id === id),
    [projects, id]
  );

  const projectIds = useMemo(() => clientProjects.map((p) => p.id), [clientProjects]);

  const { data: workByProject = {} } = useQuery({
    queryKey: ['client-projects-work', id, projectIds.join(',')],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_work_items')
        .select('project_id, quantity, unit_price')
        .in('project_id', projectIds);
      if (error) throw error;
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
    queryKey: ['client-projects-money', id, projectIds.join(',')],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const [exp, prep] = await Promise.all([
        supabase.from('project_expenses').select('project_id, amount').in('project_id', projectIds),
        supabase
          .from('project_prepayments')
          .select('project_id, amount')
          .in('project_id', projectIds),
      ]);
      if (exp.error) throw exp.error;
      if (prep.error) throw prep.error;
      const map: Record<
        string,
        { expenses: { amount: number }[]; prepayments: { amount: number }[] }
      > = {};
      for (const pid of projectIds) map[pid] = { expenses: [], prepayments: [] };
      for (const row of exp.data || []) {
        map[row.project_id as string]?.expenses.push({ amount: Number(row.amount) });
      }
      for (const row of prep.data || []) {
        map[row.project_id as string]?.prepayments.push({ amount: Number(row.amount) });
      }
      return map;
    },
  });

  const { data: invoiceCount = 0 } = useQuery({
    queryKey: ['client-invoice-count', id],
    enabled: !!id && !!session?.user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session!.user!.id)
        .eq('client_id', id);
      if (error) throw error;
      return count || 0;
    },
  });

  const rollup = useMemo(() => {
    let received = 0;
    let debt = 0;
    for (const p of clientProjects) {
      const m = computeProjectMetrics(
        workByProject[p.id] || [],
        moneyByProject[p.id]?.expenses || [],
        moneyByProject[p.id]?.prepayments || [],
        Number(p.expense_budget) || 0
      );
      received += m.received;
      debt += m.balanceDue;
    }
    return { received, debt };
  }, [clientProjects, workByProject, moneyByProject]);

  if (isLoading) {
    return (
      <div className="cpc-page mx-auto">
        <div className="cpc-card h-40 animate-pulse" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="cpc-page mx-auto">
        <p className="cpc-muted">Клієнта не знайдено</p>
        <button type="button" className="cpc-btn-primary mt-3" onClick={() => navigate('/clients')}>
          До списку
        </button>
      </div>
    );
  }

  const call = telHref(client.phone);
  const wa = whatsappHref(client.phone);
  const mail = mailtoHref(client.email);
  const note = resolveClientNote(client.id, (client as { note?: string | null }).note);

  return (
    <div className="cpc-page w-full mx-auto min-w-0 pb-6">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => navigate('/clients')}
          className="w-10 h-10 flex items-center justify-center bg-transparent border-0"
          style={{ color: 'var(--cpc-muted)' }}
          aria-label={t('back') || 'Назад'}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="flex-1 text-xl font-medium truncate" style={{ color: 'var(--cpc-text)' }}>
          {client.name || 'Клієнт'}
        </h1>
        <button
          type="button"
          onClick={() => navigate(`/clients/${id}/edit`)}
          className="w-10 h-10 flex items-center justify-center bg-transparent border-0"
          style={{ color: 'var(--cpc-copper-light)' }}
          aria-label={t('edit') || 'Редагувати'}
        >
          <Pencil size={18} />
        </button>
      </div>

      {/* Contact */}
      <div className="cpc-card mb-3 space-y-1.5 text-[13px]">
        {client.phone && (
          <div className="flex justify-between gap-2">
            <span className="cpc-muted">Телефон</span>
            <span className="tabular-nums" style={{ color: 'var(--cpc-text)' }}>
              {client.phone}
            </span>
          </div>
        )}
        {client.email && (
          <div className="flex justify-between gap-2">
            <span className="cpc-muted">Email</span>
            <span className="truncate" style={{ color: 'var(--cpc-text)' }}>
              {client.email}
            </span>
          </div>
        )}
        {client.address && (
          <div className="flex justify-between gap-2">
            <span className="cpc-muted">Адреса</span>
            <span className="text-right" style={{ color: 'var(--cpc-text)' }}>
              {client.address}
            </span>
          </div>
        )}
        {note && (
          <div className="pt-1.5 mt-1" style={{ borderTop: '1px solid var(--cpc-line)' }}>
            <span className="cpc-muted block mb-0.5">Нотатка</span>
            <p className="text-[13px] whitespace-pre-wrap" style={{ color: 'var(--cpc-text)' }}>
              {note}
            </p>
          </div>
        )}
        {!client.phone && !client.email && !client.address && !note && (
          <p className="cpc-muted text-sm">Контактні дані не вказані</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-[12px]">
        <div className="cpc-card py-2.5 px-3">
          <span className="cpc-muted">Проекти</span>
          <b className="block text-[18px] tabular-nums" style={{ color: 'var(--cpc-text)' }}>
            {clientProjects.length}
          </b>
        </div>
        <div className="cpc-card py-2.5 px-3">
          <span className="cpc-muted">Рахунки</span>
          <b className="block text-[18px] tabular-nums" style={{ color: 'var(--cpc-text)' }}>
            {invoiceCount}
          </b>
        </div>
        <div className="cpc-card py-2.5 px-3">
          <span className="cpc-muted">Отримано</span>
          <b className="block text-[16px] tabular-nums cpc-copper">{formatCompact(rollup.received)}</b>
        </div>
        <div className="cpc-card py-2.5 px-3">
          <span className="cpc-muted">Борг</span>
          <b
            className="block text-[16px] tabular-nums"
            style={{ color: rollup.debt > 0 ? '#f0a8a8' : 'var(--cpc-text)' }}
          >
            {formatCompact(rollup.debt)}
          </b>
        </div>
      </div>

      {/* Actions */}
      {(call || wa || mail) && (
        <div className="flex gap-1.5 mb-4">
          {call && (
            <a
              href={call}
              className="flex-1 min-h-[52px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium no-underline"
              style={{
                background: 'var(--cpc-copper)',
                borderRadius: 12,
                color: 'var(--cpc-on-copper)',
              }}
            >
              <Phone size={18} /> Call
            </a>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-h-[52px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium no-underline"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 12,
                color: 'var(--cpc-copper-light)',
              }}
            >
              <MessageCircle size={18} /> WhatsApp
            </a>
          )}
          {mail && (
            <a
              href={mail}
              className="flex-1 min-h-[52px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium no-underline"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 12,
                color: 'var(--cpc-copper-light)',
              }}
            >
              <Mail size={18} /> Email
            </a>
          )}
        </div>
      )}

      {/* Projects */}
      <section className="mb-4">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <h2 className="text-[13px] font-medium" style={{ color: 'var(--cpc-text)' }}>
            Об’єкти
          </h2>
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="text-[12px] cpc-copper bg-transparent border-0 min-h-[36px]"
          >
            Усі об’єкти
          </button>
        </div>
        {clientProjects.length === 0 ? (
          <div className="cpc-card cpc-muted text-sm text-center py-5">
            Немає об’єктів у цього клієнта
          </div>
        ) : (
          <div className="space-y-1.5">
            {clientProjects.map((p) => {
              const m = computeProjectMetrics(
                workByProject[p.id] || [],
                moneyByProject[p.id]?.expenses || [],
                moneyByProject[p.id]?.prepayments || [],
                Number(p.expense_budget) || 0
              );
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="cpc-card w-full text-left flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p
                      className="text-[14px] font-medium truncate"
                      style={{ color: 'var(--cpc-text)' }}
                    >
                      {p.name}
                    </p>
                    <p className="cpc-muted text-[11px] mt-0.5">
                      Отримано {formatCompact(m.received, p.currency)} · Борг{' '}
                      {formatCompact(m.balanceDue, p.currency)}
                    </p>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--cpc-muted)' }} />
                </button>
              );
            })}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => navigate(`/clients/${id}/invoices`)}
        className="cpc-card w-full text-left flex items-center justify-between gap-2 min-h-[52px]"
      >
        <span className="inline-flex items-center gap-2 text-[14px]" style={{ color: 'var(--cpc-text)' }}>
          <FileText size={16} className="cpc-copper" />
          Рахунки клієнта
          {invoiceCount > 0 ? ` · ${invoiceCount}` : ''}
        </span>
        <ChevronRight size={16} style={{ color: 'var(--cpc-muted)' }} />
      </button>
    </div>
  );
}
