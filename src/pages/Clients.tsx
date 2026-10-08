import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, MessageCircle, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import {
  emptyClientStats,
  mailtoHref,
  telHref,
  whatsappHref,
  type ClientMoneyStats,
} from '../lib/clientContact';
import { formatCurrency } from '../lib/moneyMask';
import { offlineStore } from '../lib/offlineStore';
import { computeProjectMetrics } from '../lib/projectMetrics';
import { listProjects, type Project } from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

type Client = {
  id: string;
  user_id?: string;
  client_number?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

function formatCompact(value: number, currency = 'EUR') {
  const n = Number.isFinite(value) ? value : 0;
  if (Math.abs(n - Math.round(n)) < 0.005) {
    return formatCurrency(Math.round(n), currency).replace(/,00(?=\s)/, '');
  }
  return formatCurrency(n, currency);
}

export const Clients: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string } | null>(
    null
  );

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
  });

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', session?.user?.id],
    queryFn: async () => {
      const userId = session?.user?.id || '';
      if (!userId) return [];
      if (!navigator.onLine) return offlineStore.getClients(userId);

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) {
        console.error('Помилка завантаження клієнтів:', error);
        return offlineStore.getClients(userId);
      }
      const rows = (data as Client[]) || [];
      await offlineStore.saveClients(rows);
      return rows;
    },
    enabled: !!session?.user?.id,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjects,
    retry: false,
  });

  const projectIds = useMemo(() => (projects as Project[]).map((p) => p.id), [projects]);

  const { data: workByProject = {} } = useQuery({
    queryKey: ['projects-work-summary', session?.user?.id, projectIds.join(',')],
    enabled: !!session?.user?.id && projectIds.length > 0,
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
    queryKey: ['projects-money-summary', session?.user?.id, projectIds.join(',')],
    enabled: !!session?.user?.id && projectIds.length > 0,
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
      for (const id of projectIds) map[id] = { expenses: [], prepayments: [] };
      for (const row of exp.data || []) {
        map[row.project_id as string]?.expenses.push({ amount: Number(row.amount) });
      }
      for (const row of prep.data || []) {
        map[row.project_id as string]?.prepayments.push({ amount: Number(row.amount) });
      }
      return map;
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices-client-rollups', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, client_id, status, total_gross, gross_total')
        .eq('user_id', session!.user!.id);
      if (error) throw error;
      return data || [];
    },
  });

  const statsByClient = useMemo(() => {
    const map = new Map<string, ClientMoneyStats>();
    for (const c of clients) map.set(c.id, emptyClientStats());

    for (const p of projects as Project[]) {
      if (!p.client_id || !map.has(p.client_id)) continue;
      const stats = map.get(p.client_id)!;
      stats.projectCount += 1;
      const metrics = computeProjectMetrics(
        workByProject[p.id] || [],
        moneyByProject[p.id]?.expenses || [],
        moneyByProject[p.id]?.prepayments || [],
        Number(p.expense_budget) || 0
      );
      stats.received += metrics.received;
      stats.debt += metrics.balanceDue;
    }

    for (const inv of invoices) {
      const cid = inv.client_id as string | null;
      if (!cid || !map.has(cid)) continue;
      map.get(cid)!.invoiceCount += 1;
    }

    return map;
  }, [clients, projects, workByProject, moneyByProject, invoices]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const userId = session?.user?.id;
      if (!userId) throw new Error('Користувач не авторизований');
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      showSuccess(t('clientDeleted') || 'Контакт видалено');
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    },
    onError: (error: any) => {
      showError(error?.message || t('errorDeletingClient') || 'Не вдалося видалити контакт');
    },
  });

  const handleDeleteClick = useCallback((e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setClientToDelete({ id, name });
    setDeleteDialogOpen(true);
  }, []);

  const filteredClients = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter((client) =>
      [client.name, client.email, client.phone, client.address, client.client_number]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [clients, search]);

  return (
    <div className="cpc-page px-3 w-full max-w-[430px] mx-auto min-w-0 pb-6">
      <div className="flex items-center gap-2 mb-3">
        <h1 className="flex-1 text-xl font-medium truncate" style={{ color: 'var(--cpc-text)' }}>
          Клієнти
        </h1>
        <button
          type="button"
          onClick={() => navigate('/clients/new')}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-[13px] font-medium shrink-0"
          style={{
            background: 'var(--cpc-copper)',
            color: 'var(--cpc-on-copper)',
            borderRadius: 10,
            border: 'none',
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
          Новий
        </button>
      </div>

      <div
        className="flex items-center gap-2 mb-3 px-2.5 min-h-[44px]"
        style={{
          background: 'var(--cpc-card)',
          border: '1px solid var(--cpc-line)',
          borderRadius: 12,
        }}
      >
        <Search size={16} style={{ color: 'var(--cpc-muted)' }} aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук клієнта…"
          className="flex-1 bg-transparent border-0 outline-none text-[13px] min-w-0"
          style={{ color: 'var(--cpc-text)' }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="cpc-card h-28 animate-pulse" />
          ))}
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="cpc-card text-center py-12">
          <Users size={28} className="mx-auto mb-3 cpc-copper" />
          <p className="text-[15px] font-medium mb-1" style={{ color: 'var(--cpc-text)' }}>
            {search ? 'Нічого не знайдено' : 'Клієнтів ще немає'}
          </p>
          <p className="cpc-muted text-sm mb-4">
            Простий контакт для об’єктів — не CRM
          </p>
          {!search && (
            <button
              type="button"
              onClick={() => navigate('/clients/new')}
              className="cpc-btn-primary min-h-[44px] px-5"
            >
              Додати клієнта
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredClients.map((client) => {
            const stats = statsByClient.get(client.id) || emptyClientStats();
            const call = telHref(client.phone);
            const wa = whatsappHref(client.phone);
            const mail = mailtoHref(client.email);
            return (
              <article
                key={client.id}
                className="cpc-card cursor-pointer active:scale-[0.99] transition-transform"
                onClick={() => navigate(`/clients/${client.id}`)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h2
                      className="text-[16px] font-medium truncate"
                      style={{ color: 'var(--cpc-text)' }}
                    >
                      {client.name || '—'}
                    </h2>
                    {client.phone && (
                      <p className="cpc-muted text-[12px] mt-0.5 tabular-nums">{client.phone}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) =>
                      handleDeleteClick(e, client.id, client.name || 'Без назви')
                    }
                    className="w-9 h-9 flex items-center justify-center bg-transparent border-0 shrink-0"
                    style={{ color: 'var(--cpc-muted)' }}
                    aria-label="Видалити"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] mb-2.5">
                  <div className="flex justify-between gap-2">
                    <span className="cpc-muted">Проекти</span>
                    <b className="tabular-nums" style={{ color: 'var(--cpc-text)' }}>
                      {stats.projectCount}
                    </b>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="cpc-muted">Рахунки</span>
                    <b className="tabular-nums" style={{ color: 'var(--cpc-text)' }}>
                      {stats.invoiceCount}
                    </b>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="cpc-muted">Отримано</span>
                    <b className="tabular-nums cpc-copper">
                      {formatCompact(stats.received)}
                    </b>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="cpc-muted">Борг</span>
                    <b
                      className="tabular-nums"
                      style={{ color: stats.debt > 0 ? '#f0a8a8' : 'var(--cpc-text)' }}
                    >
                      {formatCompact(stats.debt)}
                    </b>
                  </div>
                </div>

                {(call || wa || mail) && (
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {call && (
                      <a
                        href={call}
                        className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1 text-[11px] font-medium no-underline"
                        style={{
                          background: 'var(--cpc-bg)',
                          border: '1px solid var(--cpc-line)',
                          borderRadius: 9,
                          color: 'var(--cpc-copper-light)',
                        }}
                      >
                        <Phone size={13} /> Call
                      </a>
                    )}
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1 text-[11px] font-medium no-underline"
                        style={{
                          background: 'var(--cpc-bg)',
                          border: '1px solid var(--cpc-line)',
                          borderRadius: 9,
                          color: 'var(--cpc-copper-light)',
                        }}
                      >
                        <MessageCircle size={13} /> WhatsApp
                      </a>
                    )}
                    {mail && (
                      <a
                        href={mail}
                        className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1 text-[11px] font-medium no-underline"
                        style={{
                          background: 'var(--cpc-bg)',
                          border: '1px solid var(--cpc-line)',
                          borderRadius: 9,
                          color: 'var(--cpc-copper-light)',
                        }}
                      >
                        <Mail size={13} /> Email
                      </a>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setClientToDelete(null);
        }}
        onConfirm={() => {
          if (clientToDelete) deleteMutation.mutate(clientToDelete.id);
        }}
        title={t('deleteClient') || 'Видалити контакт'}
        description={`Видалити «${clientToDelete?.name}»? Об’єкти залишаться.`}
      />
    </div>
  );
};
