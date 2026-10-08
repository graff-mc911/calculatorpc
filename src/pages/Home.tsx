import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import {
  CpcStatusBadge,
  invoiceStatusLabel,
  invoiceStatusTone,
} from '../components/cpc/CpcStatusBadge';
import { useQuickActionHandlers } from '../components/QuickActionsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { computeHomeMoney } from '../lib/homeMoney';
import { getLastProjectId } from '../lib/lastProject';
import { resolveInvoiceStatus } from '../lib/invoiceFromProject';
import {
  createProject,
  listProjects,
  ProjectsSchemaMissingError,
  type Project,
} from '../lib/projectsApi';

export const Home: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();

  const [projectOpen, setProjectOpen] = useState(false);
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

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, clients(name)')
        .eq('user_id', session?.user?.id || '')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!session?.user?.id,
  });

  const { data: expenseDocuments = [] } = useQuery({
    queryKey: ['expense_documents', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_documents')
        .select('*')
        .eq('user_id', session?.user?.id || '');
      if (error) throw error;
      return data || [];
    },
    enabled: !!session?.user?.id,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-count', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, address')
        .eq('user_id', session?.user?.id || '')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!session?.user?.id,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjects,
    retry: false,
  });

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

  const unpaidTotal = incomeInvoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'draft')
    .reduce((sum, inv) => sum + Number(inv.total_gross || 0), 0);

  const recentInvoices = incomeInvoices.slice(0, 5);
  const invoiceCount = incomeInvoices.length;

  const formatAmount = (v: number) =>
    new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v) + ' €';

  const formatAmountShort = (v: number) =>
    new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v) + ' €';

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
      showSuccess(t('projectCreated') || 'Проект створено');
      qc.invalidateQueries({ queryKey: ['projects'] });
      setProjectOpen(false);
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
      showError(t('projectCreateFailed') || 'Не вдалося створити проект');
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

  const resolveTargetProject = (): Project | null => {
    const list = projects as Project[];
    if (!list.length) return null;
    const last = getLastProjectId();
    if (last) {
      const found = list.find((p) => p.id === last);
      if (found) return found;
    }
    return list[0] || null;
  };

  const goProjectAction = (add: 'work' | 'expense' | 'prepayment') => {
    const p = resolveTargetProject();
    if (!p) {
      showError('Спочатку створіть об’єкт');
      navigate('/projects');
      return;
    }
    navigate(`/projects/${p.id}?add=${add}`);
  };

  useQuickActionHandlers({
    onWork: () => goProjectAction('work'),
    onExpense: () => goProjectAction('expense'),
    onAdvance: () => goProjectAction('prepayment'),
    onPdf: () => navigate('/pdf-creator'),
  });

  return (
    <div className="cpc-page flex flex-col gap-2 pb-4">
      {/* Balance — visual spec */}
      <div className="cpc-card flex items-center justify-between gap-2">
        <div className="min-w-0">
          <small className="cpc-card-label">Загальний баланс</small>
          <b className="block text-[20px] font-semibold cpc-copper tabular-nums truncate">
            {formatAmount(money.profit)}
          </b>
        </div>
        <div className="text-right cpc-muted text-[12px] shrink-0">
          Рахунків:{' '}
          <b style={{ color: 'var(--cpc-text)' }}>{invoiceCount}</b>
        </div>
      </div>

      {/* 2×2 stats */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="cpc-card text-left"
          onClick={() => navigate('/invoices?status=unpaid')}
        >
          <small className="cpc-card-label">Неоплачено</small>
          <b className="block text-[16px] font-semibold cpc-copper tabular-nums">
            {formatAmountShort(unpaidTotal)}
          </b>
        </button>
        <button
          type="button"
          className="cpc-card text-left"
          onClick={() => navigate('/invoices?status=paid')}
        >
          <small className="cpc-card-label">Отримано</small>
          <b className="block text-[16px] font-semibold tabular-nums" style={{ color: 'var(--cpc-text)' }}>
            {formatAmountShort(money.received)}
          </b>
        </button>
        <button
          type="button"
          className="cpc-card text-left"
          onClick={() => navigate('/expenses')}
        >
          <small className="cpc-card-label">Витрачено</small>
          <b className="block text-[16px] font-semibold tabular-nums" style={{ color: 'var(--cpc-text)' }}>
            {formatAmountShort(money.spent)}
          </b>
        </button>
        <div className="cpc-card text-left">
          <small className="cpc-card-label">Чистий прибуток</small>
          <b className="block text-[16px] font-semibold cpc-copper tabular-nums">
            {formatAmountShort(money.profit)}
          </b>
        </div>
      </div>

      {/* Recent invoices */}
      <div className="flex items-center justify-between px-0.5 mt-0.5">
        <b className="font-medium text-[13px]" style={{ color: 'var(--cpc-text)' }}>
          Останні рахунки
        </b>
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="cpc-copper text-[12px] font-medium bg-transparent border-0 cursor-pointer"
        >
          Усі
        </button>
      </div>

      {recentInvoices.length === 0 ? (
        <div className="cpc-card text-center py-6">
          <p className="cpc-muted text-sm mb-3">{t('noInvoicesYet') || 'Рахунків ще немає'}</p>
          <button
            type="button"
            className="cpc-btn-primary min-h-[44px]"
            onClick={() => navigate('/invoices/new')}
          >
            Новий рахунок
          </button>
        </div>
      ) : (
        recentInvoices.map((inv) => {
          const docNo = inv.document_number || inv.document_no || '—';
          const client =
            (inv.clients as { name?: string } | null)?.name ||
            inv.client_name ||
            t('noClient') ||
            '—';
          const resolved = resolveInvoiceStatus(inv.status || 'draft', inv.due_date);
          return (
            <button
              key={inv.id}
              type="button"
              onClick={() => navigate(`/invoices/${inv.id}/view`)}
              className="cpc-card w-full text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[13px] font-medium truncate"
                  style={{ color: 'var(--cpc-text)' }}
                >
                  № {docNo} · {client}
                </span>
                <b
                  className="font-semibold tabular-nums shrink-0 text-[14px]"
                  style={{ color: 'var(--cpc-text)' }}
                >
                  {formatAmountShort(Number(inv.total_gross || 0))}
                </b>
              </div>
              <div className="mt-1.5">
                <CpcStatusBadge
                  label={invoiceStatusLabel(resolved)}
                  tone={invoiceStatusTone(resolved)}
                />
              </div>
            </button>
          );
        })
      )}

      <AnimatePresence>
        {projectOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 px-2 pb-2 sm:pb-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setProjectOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[430px] p-4"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 16,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold" style={{ color: 'var(--cpc-text)' }}>
                  Новий проект
                </h2>
                <button
                  type="button"
                  onClick={() => setProjectOpen(false)}
                  className="w-11 h-11 flex items-center justify-center bg-transparent border-0"
                  style={{ color: 'var(--cpc-muted)' }}
                  aria-label={t('cancel') || 'Скасувати'}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <Input
                  label="Назва"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Наприклад, Квартира…"
                />
                {clients.length > 0 && (
                  <Select
                    label="Клієнт"
                    value={clientId}
                    onChange={(e) => onPickClient(e.target.value)}
                  >
                    <option value="">Без клієнта / свій</option>
                    {clients.map((c: { id: string; name: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
                <Input
                  label="Ім’я клієнта"
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    if (clientId) setClientId('');
                  }}
                />
                <Input
                  label="Адреса"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                <Input
                  label="Валюта"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                />
                <Button
                  className="w-full min-h-[48px]"
                  style={{ background: 'var(--cpc-copper)', color: 'var(--cpc-on-copper)' }}
                  disabled={!name.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}
                >
                  {createMut.isPending ? 'Збереження…' : 'Зберегти'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
