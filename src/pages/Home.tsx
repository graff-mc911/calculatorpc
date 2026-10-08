import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { QuickActionsBar } from '../components/QuickActionsBar';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { computeHomeMoney } from '../lib/homeMoney';
import {
  createProject,
  listProjects,
  ProjectsSchemaMissingError,
  type Project,
} from '../lib/projectsApi';

function invoiceStatusBadge(status: string, t: (k: string) => string) {
  const label = t(status);
  const text = label === status ? status : label;
  if (status === 'paid') {
    return <span className="cpc-badge cpc-badge-paid">{text}</span>;
  }
  if (status === 'sent' || status === 'overdue') {
    return <span className="cpc-badge cpc-badge-wait">{text}</span>;
  }
  return <span className="cpc-badge cpc-badge-draft">{text}</span>;
}

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

  const uploadedInvoices = invoices.filter((inv) => inv.source === 'uploaded' || inv.uploaded_pdf_url);
  const incomeInvoices = invoices.filter((inv) => !(inv.source === 'uploaded' || inv.uploaded_pdf_url));

  const expenseInvoiceIds = new Set(
    expenseDocuments.map((exp: { invoice_id?: string | null }) => exp.invoice_id).filter((id) => !!id)
  );

  const uploadedExpenses = uploadedInvoices
    .filter((inv) => !expenseInvoiceIds.has(inv.id))
    .map((inv) => ({
      total_amount: Number(inv.uploaded_amount ?? inv.total_gross ?? inv.total_net ?? 0),
      document_date: inv.date || inv.created_at,
      created_at: inv.created_at,
    }));

  const mergedExpenses = [...expenseDocuments, ...uploadedExpenses];
  const money = computeHomeMoney(incomeInvoices, mergedExpenses);

  const unpaidTotal = incomeInvoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'draft')
    .reduce((sum, inv) => sum + Number(inv.total_gross || 0), 0);

  const recentInvoices = incomeInvoices.slice(0, 5);
  const lastProject = (projects as Project[])[0];

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
      showSuccess(t('projectCreated') || 'Project created');
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

  const balanceLabel = t('totalBalance');
  const unpaidLabel = t('unpaidInvoices');
  const receivedLabel = t('totalRevenue');
  const spentLabel = t('totalExpenses') === 'totalExpenses' ? 'Витрачено' : t('totalExpenses');
  const profitLabel = t('netProfit');
  const recentLabel = t('recentInvoices');
  const allLabel = t('viewAll') === 'viewAll' ? (t('seeAll') === 'seeAll' ? 'Усі' : t('seeAll')) : t('viewAll');

  return (
    <div className="cpc-page px-3 w-full max-w-[430px] mx-auto min-w-0 flex flex-col gap-2">
      {/* Balance */}
      <div className="cpc-card">
        <small className="cpc-card-label">
          {balanceLabel === 'totalBalance' ? 'Загальний баланс' : balanceLabel}
        </small>
        <b className="block text-[20px] font-medium cpc-copper tabular-nums">
          {formatAmount(money.profit)}
        </b>
      </div>

      {/* 2×2 stats — mockup Overview */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="cpc-card text-left"
          onClick={() => navigate('/invoices?status=unpaid')}
        >
          <small className="cpc-card-label">
            {unpaidLabel === 'unpaidInvoices' ? 'Неоплачено' : unpaidLabel}
          </small>
          <b className="block font-medium cpc-copper tabular-nums">{formatAmountShort(unpaidTotal)}</b>
        </button>
        <button
          type="button"
          className="cpc-card text-left"
          onClick={() => navigate('/invoices?status=paid')}
        >
          <small className="cpc-card-label">
            {receivedLabel === 'totalRevenue' ? 'Отримано' : receivedLabel}
          </small>
          <b className="block font-medium tabular-nums" style={{ color: 'var(--cpc-text)' }}>
            {formatAmountShort(money.received)}
          </b>
        </button>
        <button
          type="button"
          className="cpc-card text-left"
          onClick={() => navigate('/expenses')}
        >
          <small className="cpc-card-label">{spentLabel}</small>
          <b className="block font-medium tabular-nums" style={{ color: 'var(--cpc-text)' }}>
            {formatAmountShort(money.spent)}
          </b>
        </button>
        <div className="cpc-card text-left">
          <small className="cpc-card-label">
            {profitLabel === 'netProfit' ? 'Чистий прибуток' : profitLabel}
          </small>
          <b className="block font-medium cpc-copper tabular-nums">
            {formatAmountShort(money.profit)}
          </b>
        </div>
      </div>

      {/* Recent invoices */}
      <div className="flex items-center justify-between px-0.5">
        <b className="font-medium text-[12px]" style={{ color: 'var(--cpc-text)' }}>
          {recentLabel === 'recentInvoices' ? 'Останні рахунки' : recentLabel}
        </b>
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="cpc-copper text-[12px] bg-transparent border-0 cursor-pointer"
        >
          {allLabel}
        </button>
      </div>

      {recentInvoices.length === 0 ? (
        <div className="cpc-card text-center py-6">
          <p className="cpc-muted text-sm mb-3">{t('noInvoicesYet')}</p>
          <button type="button" className="cpc-btn-primary" onClick={() => navigate('/invoices/new')}>
            {t('newInvoice')}
          </button>
        </div>
      ) : (
        recentInvoices.map((inv) => {
          const docNo = inv.document_number || inv.document_no || '—';
          const client =
            (inv.clients as { name?: string } | null)?.name ||
            inv.client_name ||
            t('noClient');
          return (
            <button
              key={inv.id}
              type="button"
              onClick={() => navigate(`/invoices/${inv.id}/preview`)}
              className="cpc-card w-full text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] truncate" style={{ color: 'var(--cpc-text)' }}>
                  № {docNo} · {client}
                </span>
                <b className="font-medium tabular-nums shrink-0" style={{ color: 'var(--cpc-text)' }}>
                  {formatAmountShort(Number(inv.total_gross || 0))}
                </b>
              </div>
              <div className="mt-1">{invoiceStatusBadge(inv.status || 'draft', t)}</div>
            </button>
          );
        })
      )}

      <div className="flex-1 min-h-2" />

      <QuickActionsBar
        handlers={{
          onWork: () => (lastProject ? navigate(`/projects/${lastProject.id}`) : setProjectOpen(true)),
          onExpense: () => navigate('/expenses'),
          onAdvance: () => (lastProject ? navigate(`/projects/${lastProject.id}`) : navigate('/projects')),
          onPdf: () => navigate('/pdf-creator'),
        }}
      />

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
                  {t('projectNew') || 'New project'}
                </h2>
                <button
                  type="button"
                  onClick={() => setProjectOpen(false)}
                  className="w-10 h-10 flex items-center justify-center bg-transparent border-0"
                  style={{ color: 'var(--cpc-muted)' }}
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
                    <option value="">
                      {t('noClient') || 'No client'} / {t('projectCustomClient') || 'custom'}
                    </option>
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
                  className="w-full min-h-[48px]"
                  style={{ background: 'var(--cpc-copper)', color: 'var(--cpc-on-copper)' }}
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
};
