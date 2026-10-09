import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt,
  ChevronRight,
  CheckCircle,
  Download,
  Trash2,
  FileText,
  Upload,
  X,
  ZoomIn,
  ScanLine,
} from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { downloadReceiptPDF } from '../lib/receiptPdfGenerator';
import ReceiptScanReview from '../components/ReceiptScanReview';
import { ScannedReceiptData } from '../lib/receiptOCR';
import { saveExpenseFromScan } from '../lib/scanSync';
import { EXPENSE_CATEGORIES, categoryI18nKey, normalizeExpenseCategory } from '../lib/expenseCategories';

interface ExpenseDocumentType {
  id: string;
  vendor_name: string;
  document_date: string;
  total_amount: number;
  ocr_raw_text: string;
  payment_method: string;
  document_number: string;
  original_file_url: string;
  created_at: string;
  currency: string;
  document_type: string;
  expense_category: string;
  client_id: string | null;
  invoice_id: string | null;
  amount_net?: number | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  vat_enabled?: boolean | null;
  notes?: string | null;
}

const ReceiptThumbnail: React.FC<{
  fileUrl?: string;
  onView?: () => void;
}> = ({ fileUrl, onView }) => {
  const [imgError, setImgError] = useState(false);

  if (fileUrl && !imgError) {
    const isImage = /\.(jpg|jpeg|png|gif|webp|heic|heif)(\?|$)/i.test(fileUrl);

    if (isImage) {
      return (
        <div
          className={`w-12 h-14 rounded-lg bg-white/10 border border-white/10 flex-shrink-0 overflow-hidden relative group ${
            onView ? 'cursor-pointer' : ''
          }`}
          onClick={onView}
        >
          <img
            src={fileUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
          {onView && (
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ZoomIn size={14} className="text-white" />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="w-12 h-14 rounded-lg bg-white/10 border border-white/10 flex-shrink-0 overflow-hidden flex items-center justify-center">
        <Receipt size={20} className="text-white/40" />
      </div>
    );
  }

  return (
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
};

const PaidBadge: React.FC<{ method: string; category?: string; documentType?: string }> = ({
  method,
  category,
  documentType,
}) => {
  const parts = [method, category, documentType].filter(Boolean);

  if (parts.length === 0) return null;

  return (
    <span className="flex items-center gap-1 text-xs text-white/50">
      <CheckCircle size={12} className="text-white/40" />
      {parts.join(' • ')}
    </span>
  );
};

export default function Receipts() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scanFile, setScanFile] = useState<File | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // ---------------------------------------------------------
  // 1. Сесія користувача
  // ---------------------------------------------------------
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  // ---------------------------------------------------------
  // 2. Завантаження всіх документів витрат
  // ---------------------------------------------------------
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expense_documents', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_documents')
        .select('*')
        .eq('user_id', session?.user?.id || '')
        .order('document_date', { ascending: false });

      if (error) throw error;

      return (data || []) as ExpenseDocumentType[];
    },
    enabled: !!session?.user?.id,
  });

  // ---------------------------------------------------------
  // 3. Формат суми
  // ---------------------------------------------------------
  const formatCurrency = useCallback((amount: number, currency?: string) => {
    return (
      new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount) +
      ' ' +
      (currency || 'EUR')
    );
  }, []);

  const filteredExpenses = React.useMemo(() => {
    if (categoryFilter === 'all') return expenses;
    return expenses.filter(
      (e) => normalizeExpenseCategory(e.expense_category || 'other') === categoryFilter,
    );
  }, [expenses, categoryFilter]);

  const totalBalance = React.useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + Number(e.total_amount || 0), 0),
    [filteredExpenses],
  );

  // ---------------------------------------------------------
  // 4. Видалення документа витрат
  // ---------------------------------------------------------
  const handleDeleteConfirm = useCallback(async () => {
    if (!expenseToDelete) return;

    try {
      const { error } = await supabase
        .from('expense_documents')
        .delete()
        .eq('id', expenseToDelete);

      if (error) throw error;

      showSuccess('Документ витрат видалено');
      queryClient.invalidateQueries({ queryKey: ['expense_documents'] });
    } catch {
      showError('Не вдалося видалити документ витрат');
    } finally {
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
    }
  }, [expenseToDelete, showSuccess, showError, queryClient]);

  // ---------------------------------------------------------
  // 5. Завантаження файлу з пристрою для OCR
  // ---------------------------------------------------------
  const handleUploadFromDevice = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (file.size > 20 * 1024 * 1024) {
        showError('Файл занадто великий (макс. 20 МБ)');
        return;
      }

      setScanFile(file);
    },
    [showError]
  );

  // ---------------------------------------------------------
  // 6. Після OCR переходимо в форму створення документа витрат
  // ---------------------------------------------------------
  // Замість прямого insert одразу переходимо на ReceiptForm,
  // де користувач ще вибере:
  // - тип документа
  // - без прив’язки / до клієнта / до інвойсу
  const handleScanConfirm = useCallback(
    async (data: ScannedReceiptData, fileUrl: string) => {
      setScanFile(null);
      try {
        await saveExpenseFromScan(data, fileUrl);
        showSuccess(t('scanSavedToExpenses'));
        queryClient.invalidateQueries({ queryKey: ['expense_documents'] });
      } catch {
        showError(t('errorSavingReceipt'));
      }
    },
    [showSuccess, showError, t, queryClient]
  );

  return (
    <div className="min-h-screen pt-2 pb-8 px-4 md:px-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">
            Документи витрат
          </h2>
          <p className="text-white/60 text-sm mt-1">
            Чеки, рахунки постачальників, рахунки субпідрядників
          </p>
        </div>

        <div className="flex gap-2">
          {/* Dedicated scan page */}
          <button
            onClick={() => navigate('/scan')}
            className="p-2.5 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400 hover:bg-teal-500/25 transition-all active:scale-95"
            title={t('scanReceiptTitle')}
          >
            <ScanLine size={18} />
          </button>

          {/* Кнопка OCR / завантаження файлу */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-white/8 border border-white/10 text-white/60 hover:bg-white/15 hover:text-white/90 transition-all active:scale-95"
            title="Завантажити фото або PDF"
          >
            <Upload size={18} />
          </button>

          {/* Кнопка ручного створення */}
          <button
            onClick={() => navigate('/receipt/new')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25 transition-all active:scale-95 text-sm font-medium"
          >
            <FileText size={16} />
            Новий
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleUploadFromDevice}
        className="hidden"
      />

      {expenses.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="rounded-2xl bg-white/8 border border-white/10 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-white/45 text-xs uppercase tracking-wider">
                {t('expenseBalance')}
              </p>
              <p className="text-xl font-semibold text-cyan-300 mt-0.5">
                {formatCurrency(totalBalance)}
              </p>
            </div>
            <p className="text-white/40 text-xs text-right">
              {filteredExpenses.length} / {expenses.length}
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                categoryFilter === 'all'
                  ? 'bg-orange-500/20 border border-orange-500/40 text-orange-300'
                  : 'bg-white/5 border border-white/10 text-white/55'
              }`}
            >
              {t('allCategories')}
            </button>
            {EXPENSE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  categoryFilter === cat
                    ? 'bg-orange-500/20 border border-orange-500/40 text-orange-300'
                    : 'bg-white/5 border border-white/10 text-white/55'
                }`}
              >
                {t(categoryI18nKey(cat))}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-lg">
        {isLoading ? (
          <div>
            {[1, 2, 3, 4, 5].map((i) => (
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
        ) : filteredExpenses.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-orange-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Receipt size={32} className="text-orange-400" />
            </div>

            <h3 className="text-lg font-semibold text-white mb-2">
              {expenses.length === 0
                ? (t('noExpenseDocuments') || 'Документів витрат ще немає')
                : t('noExpensesInCategory')}
            </h3>

            <p className="text-white/60 mb-6 text-sm">
              {t('scanPageSubtitle')}
            </p>

            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => navigate('/scan')}
                className="bg-teal-500/15 border border-teal-500/30 text-teal-400 hover:bg-teal-500/25 px-6 py-2.5 rounded-xl font-medium transition-all active:scale-95 flex items-center gap-2 mx-auto"
              >
                <ScanLine size={16} />
                {t('scanReceiptTitle')}
              </button>
              <button
                onClick={() => navigate('/receipt/new')}
                className="bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25 px-6 py-2.5 rounded-xl font-medium transition-all active:scale-95 flex items-center gap-2 mx-auto"
              >
                <FileText size={16} />
                {t('addReceipt') || 'Створити документ'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {filteredExpenses.map((expense, index) => (
              <motion.div
                key={expense.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <div className="flex items-center w-full group">
                  <div className="pl-4">
                    <ReceiptThumbnail
                      fileUrl={expense.original_file_url}
                      onView={
                        /\.(jpg|jpeg|png|gif|webp|heic|heif)(\?|$)/i.test(
                          expense.original_file_url || ''
                        )
                          ? () => setViewerUrl(expense.original_file_url)
                          : undefined
                      }
                    />
                  </div>

                  <button
                    className="flex-1 min-w-0 flex items-center gap-4 px-3 py-4 hover:bg-white/5 active:bg-white/8 transition-all text-left"
                    onClick={() => navigate(`/receipt/${expense.id}`)}
                  >
                    <div style={{ display: 'none' }} />

                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/40 mb-0.5">
                        {expense.document_number
                          ? `Документ ${expense.document_number}`
                          : '—'}
                      </div>

                      <div className="font-semibold text-white text-base leading-tight truncate">
                        {expense.vendor_name || '—'}
                      </div>

                      <div className="mt-1">
                        <PaidBadge
                          method={expense.payment_method}
                          category={t(categoryI18nKey(expense.expense_category || 'other'))}
                          documentType={expense.document_type}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-white/40 mb-0.5">
                          {expense.document_date
                            ? format(new Date(expense.document_date), 'dd.MM.yyyy')
                            : '—'}
                        </div>

                        <div className="font-semibold text-white text-base">
                          {formatCurrency(
                            Number(expense.total_amount || 0),
                            expense.currency || 'EUR'
                          )}
                        </div>
                      </div>

                      <ChevronRight size={16} className="text-white/30" />
                    </div>
                  </button>

                  {/* Завантажити PDF документа */}
                  <button
                    className="mr-1 p-2 rounded-lg bg-white/10 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/30 text-white/50 hover:text-orange-400 transition-all active:scale-95 flex-shrink-0"
                    title={t('saveAsPdf') || 'Save as PDF'}
                    onClick={async (e) => {
                      e.stopPropagation();

                      await downloadReceiptPDF({
                        id: expense.id,
                        store_name: expense.vendor_name,
                        date: expense.document_date,
                        total: Number(expense.total_amount || 0),
                        items: expense.ocr_raw_text || '',
                        payment_method: expense.payment_method || '',
                        receipt_number: expense.document_number || '',
                        file_url: expense.original_file_url || '',
                        issuer_name: expense.vendor_name || '',
                        amount_net: Number(expense.amount_net || 0),
                        vat_rate: Number(expense.vat_rate || 0),
                        vat_amount: Number(expense.vat_amount || 0),
                        amount_gross: Number(expense.total_amount || 0),
                        vat_enabled: !!expense.vat_enabled,
                        currency: expense.currency || 'EUR',
                        signature_data: '',
                      });
                    }}
                  >
                    <Download size={14} />
                  </button>

                  {/* Видалення */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpenseToDelete(expense.id);
                      setDeleteDialogOpen(true);
                    }}
                    className="mr-3 pl-1 pr-2 py-4 text-white/30 hover:text-red-400 transition-colors active:scale-90 md:opacity-0 md:group-hover:opacity-100"
                    title={t('delete') || 'Delete'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {index < filteredExpenses.length - 1 && (
                  <div className="ml-20 border-b border-white/5" />
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setExpenseToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Видалити документ витрат"
        description="Ви впевнені, що хочете видалити цей документ? Цю дію не можна скасувати."
      />

      <AnimatePresence>
        {viewerUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black flex flex-col"
            onClick={() => setViewerUrl(null)}
          >
            <div
              className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-white/5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setViewerUrl(null)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all"
              >
                <X size={20} className="text-white" />
              </button>

              <span className="text-white/70 text-sm font-medium">
                Оригінальний документ
              </span>

              <div className="w-10" />
            </div>

            <div
              className="flex-1 overflow-auto p-4 flex items-start justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={viewerUrl}
                alt="Original receipt"
                className="max-w-full rounded-lg shadow-2xl"
                style={{ minWidth: '100%', objectFit: 'contain' }}
              />
            </div>

            <div className="p-3 bg-black/90 border-t border-white/5">
              <p className="text-white/30 text-xs text-center">
                Натисніть, щоб закрити
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scanFile && (
          <ReceiptScanReview
            file={scanFile}
            onClose={() => setScanFile(null)}
            onConfirm={handleScanConfirm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}