import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  FileText,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  Trash2,
  Upload,
  ExternalLink,
  Pencil,
  Sparkles,
  Save,
  X,
  Check,
  FileSpreadsheet,
  Search,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { extractInvoiceDataFromPDF } from '../lib/pdfTextExtractor';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { currencies, invoiceDocumentLabel } from '../lib/languages';
import { motion, AnimatePresence } from 'framer-motion';
import { exportInvoicesToCSV } from '../lib/exportData';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { offlineStore } from '../lib/offlineStore';
import { downloadPdfFiles, shareOrDownloadPdfs } from '../lib/shareInvoice';
import { resolveInvoicePdfFiles } from '../lib/resolveInvoicePdf';

/**
 * Назва bucket у Supabase Storage для завантажених зовнішніх PDF.
 * Використовуємо invoice-pdfs, бо він уже задіяний у проекті.
 */
const UPLOADED_INVOICES_BUCKET = 'invoice-pdfs';

/**
 * Share glyph from the user PNG sheet (plain variant).
 * Uses a CSS mask so the icon follows button text color on the dark header.
 */
const ShareIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 16,
  className = '',
}) => (
  <span
    aria-hidden
    className={`inline-block flex-shrink-0 bg-current ${className}`}
    style={{
      width: size,
      height: size,
      WebkitMaskImage: 'url(/share-icon.png)',
      maskImage: 'url(/share-icon.png)',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);

/**
 * Тип пропсів для модалки завантаження зовнішнього рахунку.
 */
interface UploadInvoiceModalProps {
  onClose: () => void;
  userId: string;
  onSuccess: () => void;
}

/**
 * Тип пропсів для модалки редагування завантаженого рахунку.
 */
interface EditUploadedInvoiceModalProps {
  invoice: Record<string, any>;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Фільтр по статусах рахунків.
 * `unpaid` = draft + sent (matches Home «Неоплачено» card).
 */
type FilterStatus = 'all' | 'draft' | 'sent' | 'paid' | 'overdue' | 'unpaid';

const VALID_FILTERS: FilterStatus[] = ['all', 'draft', 'sent', 'paid', 'overdue', 'unpaid'];

function parseStatusParam(value: string | null): FilterStatus {
  if (value && (VALID_FILTERS as string[]).includes(value)) {
    return value as FilterStatus;
  }
  return 'all';
}

/**
 * Маленька мініатюра звичайного рахунку в списку.
 */
const InvoiceThumbnail: React.FC<{ invoice: Record<string, unknown> }> = () => {
  return (
    <div className="w-12 h-14 rounded-lg bg-white/10 border border-white/10 flex-shrink-0 overflow-hidden flex items-center justify-center">
      <div className="w-full h-full p-1 flex flex-col gap-0.5 justify-center">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`h-px rounded-full ${
              i === 1 ? 'bg-white/40 w-3/4' : i === 2 ? 'bg-white/20 w-full' : 'bg-white/15 w-full'
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

/**
 * Бейдж статусу для звичайних рахунків.
 */
const StatusBadge: React.FC<{ status: string; t: (key: string) => string }> = ({ status, t }) => {
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

/**
 * Якщо користувач вибрав фото, перетворюємо його у PDF.
 * Якщо файл уже PDF — повертаємо як є.
 */
const convertFileToPdf = async (file: File): Promise<File> => {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (isPdf) {
    return file;
  }

  const isImage = file.type.startsWith('image/');
  if (!isImage) {
    throw new Error('Підтримуються тільки PDF або зображення');
  }

  // Зчитуємо картинку як base64/data URL
  const imageUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Створюємо HTMLImageElement для визначення розмірів
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = imageUrl;
  });

  // Створюємо PDF розміром під оригінальне зображення
  const pdf = new jsPDF({
    orientation: img.width > img.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [img.width, img.height],
  });

  const imageFormat = file.type.includes('png') ? 'PNG' : 'JPEG';
  pdf.addImage(imageUrl, imageFormat, 0, 0, img.width, img.height);

  const blob = pdf.output('blob');
  const safeName = file.name.replace(/\.[^.]+$/, '');

  return new File([blob], `${safeName}.pdf`, {
    type: 'application/pdf',
  });
};

/**
 * Нормалізація суми з різних форматів OCR.
 * Приклади:
 * 1190,00
 * 1.190,00
 * € 1 190,00
 * 1190.00 EUR
 */
const normalizeAmount = (value: string): number => {
  if (!value) return 0;

  const cleaned = value.replace(/\s/g, '').replace(/[^\d,.-]/g, '');

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  // Якщо є і кома, і крапка
  if (lastComma !== -1 && lastDot !== -1) {
    // Якщо остання кома правіше крапки => кома десяткова, крапки це розділювач тисяч
    if (lastComma > lastDot) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }

    // Якщо остання крапка правіше коми => крапка десяткова, коми це розділювач тисяч
    return parseFloat(cleaned.replace(/,/g, ''));
  }

  // Якщо є тільки кома — вважаємо її десятковим роздільником
  if (lastComma !== -1) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }

  // Якщо є тільки крапка
  if (lastDot !== -1) {
    const parts = cleaned.split('.');

    // Якщо крапка одна і після неї рівно 2 цифри — це десятковий роздільник
    if (parts.length === 2 && parts[1].length <= 2) {
      return parseFloat(cleaned);
    }

    // Інакше вважаємо крапки розділювачами тисяч
    return parseFloat(cleaned.replace(/\./g, ''));
  }

  return parseFloat(cleaned);
};

/**
 * Модалка для завантаження зовнішнього рахунку.
 * Логіка:
 * - файл завжди зберігаємо як PDF
 * - створюємо запис в invoices, щоб документ був у списку рахунків
 * - одночасно створюємо запис в expense_documents, щоб це була витрата
 */
const UploadInvoiceModal: React.FC<UploadInvoiceModalProps> = ({ onClose, userId, onSuccess }) => {
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Вибраний файл
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Поля, які можна підтягнути автоматично з PDF
  const [amount, setAmount] = useState('');
  const [issuer, setIssuer] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);

  // Стани завантаження та аналізу
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);

  // Які поля були успішно розпізнані автоматично
  const [parsedFields, setParsedFields] = useState<{
    company?: boolean;
    amount?: boolean;
    date?: boolean;
  }>({});

  /**
   * Обробка вибору файлу:
   * - перевірка розміру
   * - перетворення фото в PDF
   * - OCR/парсинг PDF
   * - заповнення форми
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    if (rawFile.size > 20 * 1024 * 1024) {
      showError('Файл занадто великий (макс. 20 МБ)');
      return;
    }

    setParsing(true);
    setParsedFields({});

    try {
      const pdfFile = await convertFileToPdf(rawFile);
      setSelectedFile(pdfFile);

      // Пробуємо витягнути дані з PDF
      const parsed = await extractInvoiceDataFromPDF(pdfFile);

      const detected: { company?: boolean; amount?: boolean; date?: boolean } = {};

      // Якщо знайдено компанію — підставляємо її
      if (parsed.company) {
        setIssuer(parsed.company);
        detected.company = true;
      } else {
        // Якщо не знайдено — беремо назву файлу як запасний варіант
        const cleanName = pdfFile.name.replace(/\.pdf$/i, '').replace(/[_]/g, ' ').trim();
        setIssuer(cleanName);
      }

      // Якщо знайдена сума — підставляємо як є, без ламання формату
      if (parsed.totalAmount) {
        setAmount(parsed.totalAmount);
        detected.amount = true;
      }

      // Якщо знайдена дата — підставляємо її
      if (parsed.invoiceDate) {
        setInvoiceDate(parsed.invoiceDate);
        detected.date = true;
      }

      setParsedFields(detected);
    } catch (error: any) {
      console.error('PARSE ERROR:', error);

      // Якщо парсинг впав, хоча б підставляємо назву файлу
      const cleanName = rawFile.name.replace(/\.[^.]+$/i, '').replace(/[_]/g, ' ').trim();
      setIssuer(cleanName);

      showError(error?.message || 'Не вдалося повністю обробити файл');
    } finally {
      setParsing(false);
    }
  };

  /**
   * Фінальне завантаження:
   * 1. PDF завантажуємо в Storage
   * 2. Створюємо uploaded invoice в invoices — для списку
   * 3. Створюємо expense document — для віднімання з прибутку
   */
  const handleSubmit = async () => {
    if (!selectedFile) {
      showError(t('selectFile') || 'Будь ласка, оберіть файл');
      return;
    }

    const parsedAmountCheck = normalizeAmount(amount);

    if (isNaN(parsedAmountCheck) || parsedAmountCheck <= 0) {
      showError(t('enterAmount') || 'Введіть коректну суму');
      return;
    }

    setUploading(true);

    try {
      // Додатково гарантуємо, що файл саме PDF
      const pdfFile = await convertFileToPdf(selectedFile);

      // Очищаємо назву файлу від небажаних символів
      const safeFileName = pdfFile.name.replace(/[^\w.-]/g, '_').replace(/_+/g, '_');

      // Унікальний шлях файлу в storage
      const fileName = `${userId}/${Date.now()}_${safeFileName}`;

      console.log('USER ID:', userId);
      console.log('PDF FILE:', pdfFile);
      console.log('FILE NAME:', fileName);
      console.log('FILE TYPE:', pdfFile.type);
      console.log('FILE SIZE:', pdfFile.size);
      console.log('BUCKET:', UPLOADED_INVOICES_BUCKET);

      // 1. Завантаження PDF у storage bucket
      const { error: uploadError } = await supabase.storage
        .from(UPLOADED_INVOICES_BUCKET)
        .upload(fileName, pdfFile, {
          upsert: true,
          contentType: 'application/pdf',
        });

      if (uploadError) {
        console.error('STORAGE ERROR:', uploadError);
        throw new Error(uploadError.message || 'Помилка Storage при завантаженні PDF');
      }

      // 2. Отримуємо публічне посилання на файл
      const {
        data: { publicUrl },
      } = supabase.storage.from(UPLOADED_INVOICES_BUCKET).getPublicUrl(fileName);

      if (!publicUrl) {
        throw new Error('Не вдалося отримати publicUrl PDF');
      }

      console.log('PUBLIC URL:', publicUrl);

      const parsedAmount = parsedAmountCheck;
      const documentNo = `EXT-${Date.now().toString().slice(-6)}`;

      // 3. Створюємо запис у invoices, щоб документ відображався в списку рахунків
      const invoicePayload = {
        user_id: userId,
        client_name: issuer || pdfFile.name.replace(/\.pdf$/i, ''),
        date: invoiceDate,
        status: 'paid',
        source: 'uploaded',
        uploaded_pdf_url: publicUrl,
        pdf_url: publicUrl,
        uploaded_amount: parsedAmount,
        total_net: parsedAmount,
        total_gross: parsedAmount,
        currency: 'EUR',
        document_type: 'expense',
        document_no: documentNo,
      };

      console.log('INVOICE PAYLOAD:', invoicePayload);

      const { data: insertedInvoice, error: dbError } = await supabase
        .from('invoices')
        .insert(invoicePayload)
        .select()
        .single();

      if (dbError) {
        console.error('DB ERROR:', dbError);
        throw new Error(dbError.message || 'Помилка запису в таблицю invoices');
      }

      // 4. Створюємо запис у expense_documents, щоб сума віднімалася як витрата
      const expensePayload = {
        user_id: userId,
        invoice_id: insertedInvoice.id,
        vendor_name: issuer || pdfFile.name.replace(/\.pdf$/i, ''),
        document_number: documentNo,
        document_date: invoiceDate,
        total_amount: parsedAmount,
        amount_net: parsedAmount,
        vat_amount: 0,
        vat_rate: 0,
        currency: 'EUR',
        payment_method: 'bank',
        document_type: 'supplier_invoice',
        expense_category: 'subcontractor',
        original_file_url: publicUrl,
      };

      console.log('EXPENSE PAYLOAD:', expensePayload);

      const { error: expenseError } = await supabase.from('expense_documents').insert(expensePayload);

      if (expenseError) {
        console.error('EXPENSE ERROR:', expenseError);
        throw new Error(expenseError.message || 'Помилка запису в таблицю expense_documents');
      }

      showSuccess(t('invoiceUploaded') || 'Документ завантажено');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('UPLOAD MODAL ERROR:', err);
      showError(err?.message || 'Помилка завантаження');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-t-3xl p-6 pb-10 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-base">
            {t('uploadExternalInvoice') || 'Завантажити чужий рахунок'}
          </h3>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/70 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Кнопка вибору файлу */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className={`w-full flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed transition-all ${
            selectedFile
              ? 'border-teal-500/50 bg-teal-500/5'
              : 'border-white/15 bg-white/3 hover:border-white/25 hover:bg-white/5'
          }`}
        >
          {selectedFile ? (
            <>
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
                {parsing ? (
                  <Clock size={20} className="text-teal-400 animate-spin" />
                ) : (
                  <FileText size={20} className="text-teal-400" />
                )}
              </div>

              <p className="text-teal-300 text-sm font-medium text-center truncate max-w-full px-2">
                {selectedFile.name}
              </p>

              {parsing ? (
                <p className="text-teal-400/60 text-xs flex items-center gap-1.5">
                  <Sparkles size={11} />
                  {t('analyzingPDF') || 'Аналіз PDF...'}
                </p>
              ) : (
                <p className="text-white/30 text-xs">{(selectedFile.size / 1024).toFixed(0)} KB</p>
              )}
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center">
                <Upload size={20} className="text-white/50" />
              </div>
              <p className="text-white/60 text-sm">
                {t('selectPdfFile') || 'Оберіть PDF або фото документа'}
              </p>
              <p className="text-white/25 text-xs">PDF або фото до 20 МБ</p>
            </>
          )}
        </button>

        {/* Прихований input для вибору файлу */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Показуємо, які поля були визначені автоматично */}
        {Object.keys(parsedFields).length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <Sparkles size={12} className="text-teal-400 flex-shrink-0" />
            <p className="text-teal-400/80 text-xs">
              {t('autoDetected') || 'Автоматично розпізнано'}:
              {parsedFields.company && (
                <span className="ml-1 px-1.5 py-0.5 bg-teal-500/15 rounded text-teal-300">
                  {t('company') || 'фірма'}
                </span>
              )}
              {parsedFields.amount && (
                <span className="ml-1 px-1.5 py-0.5 bg-teal-500/15 rounded text-teal-300">
                  {t('amount') || 'сума'}
                </span>
              )}
              {parsedFields.date && (
                <span className="ml-1 px-1.5 py-0.5 bg-teal-500/15 rounded text-teal-300">
                  {t('date') || 'дата'}
                </span>
              )}
            </p>
          </div>
        )}

        {/* Поля форми */}
        <div className="space-y-3">
          <div
            className={`bg-white/5 border rounded-xl px-4 py-3 transition-colors ${
              parsedFields.company ? 'border-teal-500/30' : 'border-white/8'
            }`}
          >
            <p className="text-white/35 text-[11px] uppercase tracking-wider mb-1">
              {t('issuerName') || 'Назва / Фірма'}
            </p>
            <input
              type="text"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder={t('issuerPlaceholder') || 'Назва компанії або постачальника'}
              className="w-full bg-transparent text-white text-sm outline-none placeholder-white/20"
            />
          </div>

          <div className="flex gap-3">
            <div
              className={`flex-1 bg-white/5 border rounded-xl px-4 py-3 transition-colors ${
                parsedFields.amount ? 'border-teal-500/30' : 'border-white/8'
              }`}
            >
              <p className="text-white/35 text-[11px] uppercase tracking-wider mb-1">
                {t('amount') || 'Сума'}
              </p>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent text-white text-sm outline-none placeholder-white/20"
              />
            </div>

            <div
              className={`flex-1 bg-white/5 border rounded-xl px-4 py-3 transition-colors ${
                parsedFields.date ? 'border-teal-500/30' : 'border-white/8'
              }`}
            >
              <p className="text-white/35 text-[11px] uppercase tracking-wider mb-1">
                {t('date') || 'Дата'}
              </p>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full bg-transparent text-white text-sm outline-none"
              />
            </div>
          </div>
        </div>

        {/* Кнопка підтвердження завантаження */}
        <button
          onClick={handleSubmit}
          disabled={uploading || !selectedFile || parsing}
          className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <Clock size={16} className="animate-spin" />
              {t('uploading') || 'Завантаження...'}
            </>
          ) : (
            <>
              <Upload size={16} />
              {t('uploadInvoice') || 'Завантажити рахунок'}
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
};

/**
 * Модалка редагування вже завантаженого зовнішнього рахунку.
 */
const EditUploadedInvoiceModal: React.FC<EditUploadedInvoiceModalProps> = ({
  invoice,
  onClose,
  onSuccess,
}) => {
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();

  // Початкові значення підтягуємо з invoice
  const [issuer, setIssuer] = useState((invoice.client_name as string) || '');
  const [amount, setAmount] = useState(
    invoice.uploaded_amount != null
      ? String(invoice.uploaded_amount)
      : invoice.total_gross != null
      ? String(invoice.total_gross)
      : ''
  );
  const [invoiceDate, setInvoiceDate] = useState(
    invoice.date ? String(invoice.date).split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [saving, setSaving] = useState(false);

  /**
   * Зберігає змінені поля в таблицю invoices.
   * Якщо це uploaded invoice, то паралельно оновлюємо й expense_documents.
   */
  const handleSave = async () => {
    const parsedAmount = normalizeAmount(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showError(t('enterAmount') || 'Введіть коректну суму');
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          client_name: issuer.trim() || (invoice.client_name as string),
          uploaded_amount: parsedAmount,
          total_net: parsedAmount,
          total_gross: parsedAmount,
          date: invoiceDate,
        })
        .eq('id', invoice.id as string);

      if (error) throw error;

      // Для завантажених інвойсів синхронізуємо відповідну витрату
      if (invoice.source === 'uploaded') {
        const { error: expenseUpdateError } = await supabase
          .from('expense_documents')
          .update({
            vendor_name: issuer.trim() || (invoice.client_name as string),
            document_date: invoiceDate,
            total_amount: parsedAmount,
            amount_net: parsedAmount,
          })
          .eq('invoice_id', invoice.id as string);

        if (expenseUpdateError) {
          console.error('EXPENSE UPDATE ERROR:', expenseUpdateError);
        }
      }

      showSuccess(t('saved') || 'Збережено');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('EDIT INVOICE ERROR:', error);
      showError(t('saveFailed') || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-t-3xl p-6 pb-10 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-base">
            {t('editExternalInvoice') || 'Редагувати рахунок'}
          </h3>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/70 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <FileText size={16} className="text-teal-400 flex-shrink-0" />
          <span className="text-white/50 text-sm truncate">{String(invoice.document_no || '')}</span>
        </div>

        <div className="space-y-3">
          <div className="bg-white/5 border border-white/8 rounded-xl px-4 py-3">
            <p className="text-white/35 text-[11px] uppercase tracking-wider mb-1">
              {t('issuerName') || 'Від кого (постачальник)'}
            </p>
            <input
              type="text"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder={t('issuerPlaceholder') || 'Назва компанії або постачальника'}
              className="w-full bg-transparent text-white text-sm outline-none placeholder-white/20"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 bg-white/5 border border-white/8 rounded-xl px-4 py-3">
              <p className="text-white/35 text-[11px] uppercase tracking-wider mb-1">
                {t('amount') || 'Сума (€)'}
              </p>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent text-white text-sm outline-none placeholder-white/20"
              />
            </div>

            <div className="flex-1 bg-white/5 border border-white/8 rounded-xl px-4 py-3">
              <p className="text-white/35 text-[11px] uppercase tracking-wider mb-1">
                {t('date') || 'Дата'}
              </p>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full bg-transparent text-white text-sm outline-none"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Clock size={16} className="animate-spin" />
              {t('saving') || 'Збереження...'}
            </>
          ) : (
            <>
              <Pencil size={16} />
              {t('saveChanges') || 'Зберегти зміни'}
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
};

/**
 * Головна сторінка списку рахунків.
 */
export const Invoices: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();

  // Стани UI
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoicesToDelete, setInvoicesToDelete] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterStatus>(() =>
    parseStatusParam(searchParams.get('status')),
  );
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editUploadedInvoice, setEditUploadedInvoice] = useState<Record<string, any> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupMode, setGroupMode] = useState<'none' | 'day' | 'month' | 'year'>('month');

  /** Sync filter when arriving via Home cards (?status=paid|unpaid|…). */
  useEffect(() => {
    setActiveFilter(parseStatusParam(searchParams.get('status')));
  }, [searchParams]);

  const applyFilter = useCallback(
    (next: FilterStatus) => {
      setActiveFilter(next);
      if (next === 'all') {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ status: next }, { replace: true });
      }
    },
    [setSearchParams],
  );

  /**
   * Отримуємо поточну сесію користувача.
   */
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  /**
   * Отримуємо список рахунків.
   * Якщо немає інтернету — беремо з локального кешу.
   * Якщо є інтернет — беремо з Supabase і оновлюємо локальний кеш.
   */
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', session?.user?.id],
    queryFn: async () => {
      const userId = session?.user?.id || '';

      if (!navigator.onLine) {
        const cached = await offlineStore.getInvoices(userId);
        return cached.map((inv) => ({
          ...inv,
          document_number: inv['document_no'],
          gross_total: inv['total_gross'],
        }));
      }

      const { data, error } = await supabase
        .from('invoices')
        .select('*, clients(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('LOAD INVOICES ERROR:', error);

        const cached = await offlineStore.getInvoices(userId);
        return cached.map((inv) => ({
          ...inv,
          document_number: inv['document_no'],
          gross_total: inv['total_gross'],
        }));
      }

      const rows = data || [];
      await offlineStore.saveInvoices(rows);

      return rows.map((inv) => ({
        ...inv,
        document_number: inv.document_no,
        gross_total: inv.total_gross,
      }));
    },
    enabled: !!session?.user?.id,
  });

  /**
   * Форматування суми з потрібною валютою.
   */
  const formatCurrency = useCallback((amount: number, currency: string) => {
    const curr = currencies.find((c) => c.code === currency);

    return `${amount.toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${curr?.symbol || currency}`;
  }, []);

  /**
   * Експорт списку рахунків у CSV.
   */
  const handleExportCSV = useCallback(() => {
    try {
      exportInvoicesToCSV(invoices);
      showSuccess(t('dataExported') || 'Data exported successfully');
    } catch (error) {
      console.error('EXPORT CSV ERROR:', error);
      showError(t('exportFailed') || 'Failed to export data');
    }
  }, [invoices, showSuccess, showError, t]);

  /**
   * Фільтрований список: статус + пошук (номер, ім'я, дата, адреса).
   */
  const filteredInvoices = React.useMemo(() => {
    const byStatus =
      activeFilter === 'all'
        ? invoices
        : activeFilter === 'unpaid'
          ? invoices.filter((inv) => inv.status === 'sent' || inv.status === 'draft')
          : invoices.filter((inv) => inv.status === activeFilter);

    const q = searchQuery.trim().toLowerCase();
    const searched = !q
      ? byStatus
      : byStatus.filter((inv) => {
          const hay = [
            inv.document_no,
            inv.document_number,
            inv.clients?.name,
            inv.client_name,
            inv.date,
            inv.object_address,
            inv.project_area,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        });

    return [...searched].sort((a, b) => {
      const da = new Date(a.date || a.created_at || 0).getTime();
      const db = new Date(b.date || b.created_at || 0).getTime();
      return db - da;
    });
  }, [invoices, activeFilter, searchQuery]);

  const groupedInvoices = React.useMemo(() => {
    if (groupMode === 'none') {
      return [{ key: 'all', label: '', items: filteredInvoices }];
    }

    const groups = new Map<string, typeof filteredInvoices>();
    for (const inv of filteredInvoices) {
      const d = new Date(inv.date || inv.created_at || Date.now());
      let key: string;
      if (groupMode === 'year') {
        key = String(d.getFullYear());
      } else if (groupMode === 'day') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inv);
    }

    return Array.from(groups.entries()).map(([key, items]) => {
      let label = key;
      if (groupMode === 'year') {
        label = key;
      } else if (groupMode === 'day') {
        const [y, m, day] = key.split('-');
        label = format(new Date(Number(y), Number(m) - 1, Number(day)), 'dd MMMM yyyy');
      } else {
        const [y, m] = key.split('-');
        label = format(new Date(Number(y), Number(m) - 1, 1), 'MMMM yyyy');
      }
      return { key, label, items };
    });
  }, [filteredInvoices, groupMode]);

  const selectionCount = selectedIds.size;
  const allFilteredSelected =
    filteredInvoices.length > 0 && filteredInvoices.every((inv) => selectedIds.has(inv.id));

  const toggleInvoiceSelection = useCallback((invoiceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) {
        next.delete(invoiceId);
      } else {
        next.add(invoiceId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected =
        filteredInvoices.length > 0 && filteredInvoices.every((inv) => prev.has(inv.id));

      if (allSelected) {
        return new Set();
      }

      return new Set(filteredInvoices.map((inv) => inv.id));
    });
  }, [filteredInvoices]);

  const loadCompanyProfile = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return null;

    const { data } = await supabase
      .from('company_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    return data;
  }, [session?.user?.id]);

  const prepareSelectedPdfFiles = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      throw new Error(t('shareFailed') || 'Could not share invoice');
    }

    const targets = invoices.filter((inv) => selectedIds.has(inv.id));
    if (targets.length === 0) {
      throw new Error(t('noInvoicesSelected') || 'No invoices selected');
    }

    const companyProfile = await loadCompanyProfile();
    const files = await resolveInvoicePdfFiles(targets, userId, companyProfile, language);
    return { files, targets };
  }, [session?.user?.id, invoices, selectedIds, loadCompanyProfile, t, language]);

  /**
   * Поділитися обраними рахунками (Web Share API / завантаження).
   */
  const handleShareSelected = useCallback(async () => {
    if (selectionCount === 0) {
      showError(t('selectInvoicesToShare') || 'Select invoices to share');
      return;
    }

    setSelectionBusy(true);
    try {
      const { files, targets } = await prepareSelectedPdfFiles();
      const singleLabel =
        files.length === 1
          ? invoiceDocumentLabel(
              language || 'uk',
              targets[0]?.document_no || targets[0]?.document_number || files[0].fileName
            )
          : null;
      const result = await shareOrDownloadPdfs({
        files,
        title: singleLabel || t('invoices') || 'Invoices',
        text:
          singleLabel ||
          `${t('invoices') || 'Invoices'}: ${files.map((f) => f.fileName).join(', ')}`,
        openMailtoFallback: true,
      });

      if (result === 'downloaded') {
        showSuccess(t('invoicesSaved') || t('pdfDownloaded') || 'PDF saved to device');
      } else {
        showSuccess(
          files.length === 1
            ? t('invoiceShared') || 'Invoice shared'
            : t('invoicesShared') || 'Invoices shared'
        );
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('SHARE SELECTED ERROR:', error);
      showError(error?.message || t('shareFailed') || 'Could not share invoice');
    } finally {
      setSelectionBusy(false);
    }
  }, [selectionCount, prepareSelectedPdfFiles, showError, showSuccess, t, language]);
  const handleSaveSelected = useCallback(async () => {
    if (selectionCount === 0) {
      showError(t('noInvoicesSelected') || 'No invoices selected');
      return;
    }

    setSelectionBusy(true);
    try {
      const { files } = await prepareSelectedPdfFiles();
      downloadPdfFiles(files);
      showSuccess(
        files.length === 1
          ? t('pdfDownloaded') || 'PDF saved to device'
          : t('invoicesSaved') || 'Invoices saved to device'
      );
    } catch (error: any) {
      console.error('SAVE SELECTED ERROR:', error);
      showError(error?.message || t('exportFailed') || 'Failed to save invoices');
    } finally {
      setSelectionBusy(false);
    }
  }, [selectionCount, prepareSelectedPdfFiles, showError, showSuccess, t]);

  /**
   * Підтвердження видалення одного або кількох рахунків.
   * Для uploaded invoice також пробуємо видалити пов’язану витрату.
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (invoicesToDelete.length === 0) return;

    try {
      for (const invoiceId of invoicesToDelete) {
        if (!navigator.onLine) {
          await offlineStore.deleteInvoice(invoiceId);
          await offlineStore.enqueueMutation({
            table: 'invoices',
            operation: 'delete',
            data: { id: invoiceId },
            timestamp: Date.now(),
          });
          continue;
        }

        const invoiceToRemove = invoices.find((inv) => inv.id === invoiceId);
        if (invoiceToRemove?.source === 'uploaded') {
          const { error: expenseDeleteError } = await supabase
            .from('expense_documents')
            .delete()
            .eq('invoice_id', invoiceId);

          if (expenseDeleteError) {
            console.error('DELETE EXPENSE ERROR:', expenseDeleteError);
          }
        }

        const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
        if (error) throw error;

        await offlineStore.deleteInvoice(invoiceId);
      }

      showSuccess(
        invoicesToDelete.length === 1
          ? t('invoiceDeleted') || 'Invoice deleted successfully'
          : t('invoicesDeleted') || 'Invoices deleted'
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        invoicesToDelete.forEach((id) => next.delete(id));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['expense_documents'] });
    } catch (error) {
      console.error('DELETE INVOICE ERROR:', error);
      showError(t('deleteFailed') || 'Failed to delete invoice');
    } finally {
      setDeleteDialogOpen(false);
      setInvoicesToDelete([]);
    }
  }, [invoicesToDelete, invoices, showSuccess, showError, t, queryClient]);

  /**
   * Вкладки фільтрації.
   */
  const filterTabs: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: t('allStatuses') || 'All' },
    { key: 'unpaid', label: t('unpaid') },
    { key: 'draft', label: t('draft') },
    { key: 'sent', label: t('sent') },
    { key: 'paid', label: t('paid') },
    { key: 'overdue', label: t('overdue') },
  ];

  return (
    <div className="cpc-page px-3 md:px-6 w-full max-w-[430px] md:max-w-2xl mx-auto">
      {/* Верхній заголовок сторінки */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-medium" style={{ color: 'var(--cpc-text)' }}>{t('invoices')}</h2>
          <p className="cpc-muted text-sm mt-1">{t('manageInvoices')}</p>
        </div>

        {/* Persistent header: only + (Add Invoice). Other actions appear on selection. */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/invoices/new')}
            className="p-2.5 transition-all active:scale-95"
            style={{
              background: 'rgba(200,121,74,0.22)',
              border: '1px solid rgba(224,151,95,0.4)',
              borderRadius: 12,
              color: 'var(--cpc-copper-light)',
            }}
            title={t('newInvoice')}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Secondary archive actions (not in header): upload external + CSV */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setUploadModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-medium hover:bg-teal-500/25 transition-all active:scale-95"
          type="button"
        >
          <Upload size={14} />
          {t('uploadExternalInvoice') || 'Upload'}
        </button>
        <button
          onClick={handleExportCSV}
          disabled={!invoices.length}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-white/70 text-xs font-medium hover:bg-white/12 transition-all disabled:opacity-50 active:scale-95"
          type="button"
        >
          <FileSpreadsheet size={14} />
          {t('export') || 'CSV'}
        </button>
      </div>

      {/* Панель дій для обраних рахунків */}
      <AnimatePresence>
        {selectionCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl bg-white/8 border border-white/10 backdrop-blur-xl"
          >
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={toggleSelectAllFiltered}
                className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                  allFilteredSelected
                    ? 'bg-cyan-500 border-cyan-400 text-white'
                    : 'border-white/30 bg-white/5 text-transparent'
                }`}
                title={t('selectAll') || 'Select all'}
                type="button"
              >
                <Check size={12} className={allFilteredSelected ? 'opacity-100' : 'opacity-0'} />
              </button>
              <p className="text-sm text-white/80 truncate">
                {t('selectedCount') || 'Selected'}: {selectionCount}
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleShareSelected}
                disabled={selectionBusy}
                className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 transition-all disabled:opacity-50 active:scale-95"
                title={t('sendToAccountant') || t('share') || 'Send'}
              >
                <ShareIcon size={15} />
              </button>
              <button
                onClick={handleSaveSelected}
                disabled={selectionBusy}
                className="p-2 rounded-xl bg-white/10 border border-white/10 text-white/80 hover:bg-white/15 transition-all disabled:opacity-50 active:scale-95"
                title={t('saveToDevice') || 'Export'}
              >
                <Save size={15} />
              </button>
              <button
                onClick={handleExportCSV}
                disabled={selectionBusy || selectionCount === 0}
                className="p-2 rounded-xl bg-white/10 border border-white/10 text-white/70 hover:bg-white/15 transition-all disabled:opacity-50 active:scale-95"
                title={t('export') || 'CSV'}
              >
                <FileSpreadsheet size={15} />
              </button>
              <button
                onClick={() => {
                  setInvoicesToDelete(Array.from(selectedIds));
                  setDeleteDialogOpen(true);
                }}
                disabled={selectionBusy}
                className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 transition-all disabled:opacity-50 active:scale-95"
                title={t('deleteSelected') || 'Delete selected'}
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={clearSelection}
                disabled={selectionBusy}
                className="p-2 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/10 transition-all disabled:opacity-50 active:scale-95"
                title={t('clearSelection') || 'Clear selection'}
              >
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Пошук архіву + групування за датою */}
      <div className="mb-3 space-y-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('invoiceArchiveSearch') || t('searchInvoices')}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/6 border border-white/10 text-white text-sm outline-none focus:border-orange-400/40"
          />
        </div>
        <div className="flex gap-1.5">
          {(
            [
              { key: 'day' as const, label: t('groupByDay') || 'Day' },
              { key: 'month' as const, label: t('groupByMonth') },
              { key: 'year' as const, label: t('groupByYear') },
              { key: 'none' as const, label: t('allStatuses') || 'All' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setGroupMode(opt.key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                groupMode === opt.key
                  ? 'bg-white/15 text-white'
                  : 'bg-white/5 text-white/45 hover:text-white/70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Фільтри по статусах */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        {filterTabs.map((tab) => {
          const count =
            tab.key === 'all'
              ? invoices.length
              : tab.key === 'unpaid'
                ? invoices.filter((inv) => inv.status === 'sent' || inv.status === 'draft').length
                : invoices.filter((inv) => inv.status === tab.key).length;

          const isActive = activeFilter === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => applyFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                isActive
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                  : 'bg-white/8 text-white/50 hover:text-white/80 hover:bg-white/12 border border-white/10'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-white/40'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Основний блок зі списком рахунків */}
      <div className="cpc-card overflow-hidden !p-0">
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
        ) : filteredInvoices.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-orange-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <FileText size={32} className="text-orange-400" />
            </div>

            <h3 className="text-lg font-semibold text-white mb-2">{t('noInvoicesMessage')}</h3>
            <p className="text-white/60 mb-6 text-sm">{t('createFirstIn30Sec')}</p>

            {activeFilter === 'all' && (
              <button
                onClick={() => navigate('/invoices/new')}
                className="bg-white/10 backdrop-blur-xl border border-white/10 text-orange-500 hover:bg-white/20 px-6 py-2.5 rounded-xl font-medium transition-all active:scale-95"
              >
                {t('createInvoice')}
              </button>
            )}
          </div>
        ) : (
          <div>
            {groupedInvoices.map((group) => (
              <div key={group.key}>
                {group.label ? (
                  <div className="px-4 py-2 bg-white/5 border-b border-white/5">
                    <p className="text-xs font-medium uppercase tracking-wider text-white/45">
                      {group.label}
                    </p>
                  </div>
                ) : null}
                {group.items.map((invoice, index) => {
              const isUploaded = invoice.source === 'uploaded';
              const isSelected = selectedIds.has(invoice.id);

              return (
                <motion.div
                  key={invoice.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                >
                  <div
                    className={`flex items-center group ${
                      isSelected ? 'bg-cyan-500/10' : isUploaded ? 'bg-teal-500/5' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleInvoiceSelection(invoice.id);
                      }}
                      className={`ml-3 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-cyan-500 border-cyan-400 text-white'
                          : 'border-white/30 bg-white/5 hover:border-white/50'
                      }`}
                      aria-label={t('select') || 'Select'}
                      aria-pressed={isSelected}
                    >
                      {isSelected && <Check size={12} />}
                    </button>

                    <div className="pl-3 flex-shrink-0">
                      {isUploaded ? (
                        <div className="w-12 h-14 rounded-lg bg-teal-500/15 border border-teal-500/25 flex-shrink-0 flex items-center justify-center">
                          <FileText size={20} className="text-teal-400" />
                        </div>
                      ) : (
                        <InvoiceThumbnail invoice={invoice} />
                      )}
                    </div>

                    <button
                      className="flex-1 flex items-center gap-4 px-3 py-4 hover:bg-white/5 active:bg-white/8 transition-all text-left"
                      onClick={() => {
                        if (isUploaded && invoice.uploaded_pdf_url) {
                          window.open(invoice.uploaded_pdf_url as string, '_blank', 'noopener,noreferrer');
                        } else {
                          navigate(`/invoices/${invoice.id}/view`);
                        }
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs text-white/40">
                            {invoice.document_no || invoice.document_number || t('noDraftNumber')}
                          </span>

                          {isUploaded && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/20 font-medium">
                              PDF
                            </span>
                          )}
                        </div>

                        <div
                          className={`font-semibold text-base leading-tight truncate ${
                            isUploaded ? 'text-teal-100' : 'text-white'
                          }`}
                        >
                          {invoice.clients?.name || invoice.client_name || t('noClient')}
                        </div>

                        <div className="mt-1">
                          {isUploaded ? (
                            <span className="flex items-center gap-1 text-xs text-teal-400/70">
                              <ExternalLink size={11} />
                              {t('externalInvoice') || 'Зовнішній рахунок'}
                            </span>
                          ) : (
                            <StatusBadge status={invoice.status} t={t} />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-white/40 mb-0.5">
                            {invoice.date ? format(new Date(invoice.date), 'dd.MM.yyyy') : '—'}
                          </div>

                          <div
                            className={`font-semibold text-base ${
                              isUploaded ? 'text-teal-300' : 'text-white'
                            }`}
                          >
                            {formatCurrency(
                              Number(invoice.total_gross ?? invoice.gross_total ?? 0),
                              invoice.currency || 'EUR'
                            )}
                          </div>
                        </div>

                        <ChevronRight size={16} className="text-white/30" />
                      </div>
                    </button>

                    {isUploaded && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditUploadedInvoice(invoice);
                        }}
                        className="pr-4 pl-2 py-4 text-white/30 hover:text-teal-400 transition-colors active:scale-90"
                        title={t('edit') || 'Редагувати'}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {!isUploaded && <div className="w-3 flex-shrink-0" />}
                  </div>

                  {index < group.items.length - 1 && <div className="ml-24 border-b border-white/5" />}
                </motion.div>
              );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setInvoicesToDelete([]);
        }}
        onConfirm={handleDeleteConfirm}
        title={
          invoicesToDelete.length > 1
            ? t('deleteSelected') || 'Delete selected'
            : t('deleteInvoice') || 'Delete Invoice'
        }
        description={
          invoicesToDelete.length > 1
            ? t('deleteSelectedConfirm') ||
              'Are you sure you want to delete the selected invoices? This action cannot be undone.'
            : t('deleteInvoiceConfirm') ||
              'Are you sure you want to delete this invoice? This action cannot be undone.'
        }
      />

      <AnimatePresence>
        {uploadModalOpen && session?.user?.id && (
          <UploadInvoiceModal
            onClose={() => setUploadModalOpen(false)}
            userId={session.user.id}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['invoices'] });
              queryClient.invalidateQueries({ queryKey: ['expense_documents'] });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editUploadedInvoice && (
          <EditUploadedInvoiceModal
            invoice={editUploadedInvoice}
            onClose={() => setEditUploadedInvoice(null)}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['invoices'] });
              queryClient.invalidateQueries({ queryKey: ['expense_documents'] });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};