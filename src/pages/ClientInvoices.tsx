import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  FileText,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  PenTool,
  Receipt,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { currencies } from '../lib/languages';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

// ---------------------------------------------------------
// Тип інвойсу
// ---------------------------------------------------------
type InvoiceRow = {
  id: string;
  user_id?: string;
  client_id?: string | null;
  document_no?: string | null;
  document_number?: string | null;
  gross_total?: number | null;
  total_gross?: number | null;
  currency?: string | null;
  status?: string | null;
  date?: string | null;
  signature_data_url?: string | null;
  sent_at?: string | null;
};

// ---------------------------------------------------------
// Тип документа витрат
// ---------------------------------------------------------
type ExpenseDocumentRow = {
  id: string;
  user_id?: string;
  client_id?: string | null;
  invoice_id?: string | null;
  vendor_name?: string | null;
  document_number?: string | null;
  document_date?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  document_type?: string | null;
  expense_category?: string | null;
};

// ---------------------------------------------------------
// Мініатюра інвойсу
// ---------------------------------------------------------
const InvoiceThumbnail: React.FC = () => (
  <div className="w-12 h-14 rounded-lg bg-white/10 border border-white/10 flex-shrink-0 overflow-hidden flex items-center justify-center">
    <div className="w-full h-full p-1 flex flex-col gap-0.5 justify-center">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className={`h-px rounded-full ${
            i === 1
              ? 'bg-white/40 w-3/4'
              : i === 2
              ? 'bg-white/20 w-full'
              : 'bg-white/15 w-full'
          }`}
        />
      ))}
      <div className="h-2 mt-0.5 bg-white/5 rounded-sm w-full" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-px bg-white/10 rounded-full w-full" />
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------
// Бейдж статусу інвойсу
// ---------------------------------------------------------
const StatusBadge: React.FC<{
  status: string;
  t: (key: string) => string;
}> = ({ status, t }) => {
  if (status === 'paid') {
    return (
      <span className="flex items-center gap-1 text-xs text-white/50">
        <CheckCircle size={12} className="text-white/40" />
        {t('paid')}
      </span>
    );
  }

  if (status === 'sent') {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-400/80">
        <Send size={12} />
        {t('sent')}
      </span>
    );
  }

  if (status === 'overdue') {
    return (
      <span className="flex items-center gap-1 text-xs text-red-400/80">
        <AlertCircle size={12} />
        {t('overdue')}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs text-white/40">
      <Clock size={12} />
      {t(status) || t('draft')}
    </span>
  );
};

// ---------------------------------------------------------
// Сторінка інвойсів конкретного клієнта
// ---------------------------------------------------------
export const ClientInvoices: React.FC = () => {
  const { id: clientId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);

  // ---------------------------------------------------------
  // 1. Сесія
  // ---------------------------------------------------------
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
  });

  // ---------------------------------------------------------
  // 2. Дані клієнта
  // ---------------------------------------------------------
  const { data: client } = useQuery({
    queryKey: ['client', clientId, session?.user?.id],
    queryFn: async () => {
      if (!clientId || !session?.user?.id) return null;

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!clientId && !!session?.user?.id,
  });

  // ---------------------------------------------------------
  // 3. Інвойси цього клієнта
  // ---------------------------------------------------------
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<InvoiceRow[]>({
    queryKey: ['client-invoices', clientId, session?.user?.id],
    queryFn: async () => {
      if (!clientId || !session?.user?.id) return [];

      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((inv) => ({
        ...inv,
        document_number: inv.document_no,
        gross_total: inv.total_gross,
      }));
    },
    enabled: !!session?.user?.id && !!clientId,
  });

  // ---------------------------------------------------------
  // 4. Документи витрат цього клієнта
  // ---------------------------------------------------------
  const { data: clientExpenses = [], isLoading: expensesLoading } = useQuery<ExpenseDocumentRow[]>({
    queryKey: ['client-expenses', clientId, session?.user?.id],
    queryFn: async () => {
      if (!clientId || !session?.user?.id) return [];

      const { data, error } = await supabase
        .from('expense_documents')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('client_id', clientId)
        .order('document_date', { ascending: false });

      if (error) throw error;

      return data || [];
    },
    enabled: !!session?.user?.id && !!clientId,
  });

  // ---------------------------------------------------------
  // 5. Форматування суми
  // ---------------------------------------------------------
  const formatCurrency = useCallback((amount: number, currency: string) => {
    const curr = currencies.find((c) => c.code === currency);

    return `${amount.toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${curr?.symbol || currency}`;
  }, []);

  // ---------------------------------------------------------
  // 6. Видалення інвойсу
  // ---------------------------------------------------------
  const handleDeleteConfirm = useCallback(async () => {
    if (!invoiceToDelete || !session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceToDelete)
        .eq('user_id', session.user.id);

      if (error) throw error;

      showSuccess(t('invoiceDeleted') || 'Інвойс видалено');

      await queryClient.invalidateQueries({
        queryKey: ['client-invoices', clientId, session?.user?.id],
      });

      await queryClient.invalidateQueries({
        queryKey: ['invoices'],
      });
    } catch (error) {
      console.error('Помилка видалення інвойсу:', error);
      showError(t('deleteFailed') || 'Не вдалося видалити інвойс');
    } finally {
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
    }
  }, [invoiceToDelete, session?.user?.id, showSuccess, showError, t, queryClient, clientId]);

  // ---------------------------------------------------------
  // 7. Підрахунки
  // ---------------------------------------------------------
  const totalPaid = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status === 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.gross_total || 0), 0),
    [invoices]
  );

  const totalUnpaid = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status !== 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.gross_total || 0), 0),
    [invoices]
  );

  const totalExpenses = useMemo(
    () =>
      clientExpenses.reduce(
        (sum, expense) => sum + Number(expense.total_amount || 0),
        0
      ),
    [clientExpenses]
  );

  const totalRevenue = useMemo(
    () =>
      invoices.reduce((sum, invoice) => sum + Number(invoice.gross_total || 0), 0),
    [invoices]
  );

  const totalProfit = totalRevenue - totalExpenses;

  const isPageLoading = invoicesLoading || expensesLoading;

  return (
    <div className="min-h-screen pt-2 pb-4 px-4 md:px-6 max-w-2xl mx-auto">
      {/* Верхня частина сторінки */}
      <div className="pt-6 pb-4">
        <button
          type="button"
          onClick={() => navigate('/clients')}
          className="flex items-center gap-2 text-white/60 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">{t('clients') || 'Клієнти'}</span>
        </button>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">
              {client?.name || '...'}
            </h1>

            {client?.address && (
              <p className="text-white/50 text-sm mt-1">{client.address}</p>
            )}

            {client?.client_number && (
              <p className="text-white/40 text-xs mt-0.5">
                #{client.client_number}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate(`/invoices/new?client_id=${clientId}`)}
            className="shrink-0 w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            title={t('newInvoice') || 'Новий інвойс'}
          >
            <Plus className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Блок статистики */}
        {(invoices.length > 0 || clientExpenses.length > 0) && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3">
              <p className="text-white/40 text-xs mb-1">
                {t('paid') || 'Оплачено'}
              </p>
              <p className="text-green-400 font-semibold text-sm">
                {formatCurrency(totalPaid, invoices[0]?.currency || 'EUR')}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3">
              <p className="text-white/40 text-xs mb-1">
                {t('unpaid') || 'Не оплачено'}
              </p>
              <p className="text-orange-400 font-semibold text-sm">
                {formatCurrency(totalUnpaid, invoices[0]?.currency || 'EUR')}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3">
              <p className="text-white/40 text-xs mb-1">Витрати</p>
              <p className="text-red-400 font-semibold text-sm">
                {formatCurrency(totalExpenses, invoices[0]?.currency || clientExpenses[0]?.currency || 'EUR')}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3">
              <p className="text-white/40 text-xs mb-1">Прибуток</p>
              <p
                className={`font-semibold text-sm ${
                  totalProfit >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {formatCurrency(totalProfit, invoices[0]?.currency || clientExpenses[0]?.currency || 'EUR')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Список витрат клієнта */}
      {clientExpenses.length > 0 && (
        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-lg mt-2 mb-4">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white">Витрати клієнта</h2>
            </div>
          </div>

          <div>
            {clientExpenses.map((expense, index) => (
              <div key={expense.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-4 px-4 py-4 hover:bg-white/5 active:bg-white/8 transition-all text-left"
                  onClick={() => navigate(`/receipt/${expense.id}`)}
                >
                  <div className="w-12 h-14 rounded-lg bg-red-500/10 border border-red-500/20 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    <Receipt size={18} className="text-red-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/40 mb-0.5">
                      {expense.document_number || '—'}
                    </div>

                    <div className="font-semibold text-white text-base leading-tight truncate">
                      {expense.vendor_name || '—'}
                    </div>

                    <div className="mt-1 text-xs text-white/40 truncate">
                      {expense.expense_category || expense.document_type || 'expense'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-white/40 mb-0.5">
                        {expense.document_date
                          ? format(new Date(expense.document_date), 'dd.MM.yyyy')
                          : '—'}
                      </div>

                      <div className="font-semibold text-red-400 text-base">
                        {formatCurrency(
                          Number(expense.total_amount || 0),
                          expense.currency || 'EUR'
                        )}
                      </div>
                    </div>

                    <ChevronRight size={16} className="text-white/30" />
                  </div>
                </button>

                {index < clientExpenses.length - 1 && (
                  <div className="ml-20 border-b border-white/5" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Список інвойсів */}
      <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-lg mt-2">
        {isPageLoading ? (
          <div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-4 border-b border-white/5 animate-pulse last:border-0"
              >
                <div className="w-12 h-14 rounded-lg bg-white/10 flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-3 bg-white/10 rounded w-24 mb-2" />
                  <div className="h-4 bg-white/15 rounded w-40 mb-2" />
                  <div className="h-3 bg-white/8 rounded w-16" />
                </div>
                <div className="text-right">
                  <div className="h-4 bg-white/15 rounded w-20 mb-1" />
                  <div className="h-3 bg-white/8 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-white/30" />
            </div>

            <p className="text-white/50 text-sm mb-5">
              {t('noInvoicesMessage') || 'Інвойсів ще немає'}
            </p>

            <button
              type="button"
              onClick={() => navigate(`/invoices/new?client_id=${clientId}`)}
              className="px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform"
            >
              {t('newInvoice') || 'Новий інвойс'}
            </button>
          </div>
        ) : (
          <div>
            {invoices.map((invoice, index) => (
              <motion.div
                key={invoice.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <button
                  type="button"
                  className="w-full flex items-center gap-4 px-4 py-4 hover:bg-white/5 active:bg-white/8 transition-all text-left"
                  onClick={() => navigate(`/invoices/${invoice.id}/view`)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setInvoiceToDelete(invoice.id);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <InvoiceThumbnail />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs text-white/40">
                        {invoice.document_number || t('draft')}
                      </span>

                      {invoice.signature_data_url && (
                        <PenTool size={11} className="text-blue-400 shrink-0" />
                      )}

                      {invoice.sent_at && (
                        <Send size={11} className="text-green-400 shrink-0" />
                      )}
                    </div>

                    <div className="font-semibold text-white text-base leading-tight truncate">
                      {client?.name || t('noClient')}
                    </div>

                    <div className="mt-1">
                      <StatusBadge status={invoice.status || 'draft'} t={t} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-white/40 mb-0.5">
                        {invoice.date
                          ? format(new Date(invoice.date), 'dd.MM.yyyy')
                          : '—'}
                      </div>

                      <div className="font-semibold text-white text-base">
                        {formatCurrency(
                          Number(invoice.gross_total || 0),
                          invoice.currency || 'EUR'
                        )}
                      </div>
                    </div>

                    <ChevronRight size={16} className="text-white/30" />
                  </div>
                </button>

                {index < invoices.length - 1 && (
                  <div className="ml-20 border-b border-white/5" />
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Діалог видалення */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setInvoiceToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title={t('deleteInvoice') || 'Видалити інвойс'}
        description={
          t('deleteInvoiceConfirm') ||
          'Ви впевнені, що хочете видалити цей інвойс? Цю дію не можна скасувати.'
        }
      />
    </div>
  );
};