import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Select } from '../components/ui/Select';
import { ArrowLeft, Save, Upload, X, ZoomIn, FileImage, Download } from 'lucide-react';
import { TopNav } from '../components/TopNav';
import { useLanguage } from '../contexts/LanguageContext';
import { AnimatePresence, motion } from 'framer-motion';
import { downloadReceiptPDF } from '../lib/receiptPdfGenerator';
import { useToastContext } from '../contexts/ToastContext';

//
// ОПИС СТРУКТУРИ ФОРМИ
// Тут зберігаються всі поля документа витрат / чека.
//
interface ExpenseFormData {
  document_number: string;   // номер документа / чека
  document_date: string;     // дата документа
  vendor_name: string;       // постачальник / магазин
  items_text: string;        // розпізнані позиції одним текстом
  payment_method: string;    // спосіб оплати
  vat_enabled: boolean;      // чи увімкнено ПДВ
  amount_net: string;        // нетто
  vat_rate: string;          // ставка ПДВ
  vat_amount: string;        // сума ПДВ
  total_amount: string;      // брутто / загальна сума
  currency: string;          // валюта
  original_file_url: string; // посилання на оригінальний файл
  notes: string;             // примітки

  document_type: string;     // тип документа: чек, рахунок постачальника тощо
  expense_category: string;  // категорія витрати
  link_mode: string;         // режим прив’язки: none / client / invoice
  client_id: string;         // ID клієнта
  invoice_id: string;        // ID інвойсу
}

//
// Доступні валюти
//
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'PLN', 'CZK', 'UAH'];

//
// Доступні ставки ПДВ
//
const VAT_RATES = ['0', '7', '10', '19', '20', '21', '23', '25'];

//
// Доступні способи оплати
//
const PAYMENT_METHODS = [
  'Bar',
  'EC-Karte',
  'Kreditkarte',
  'Visa',
  'Mastercard',
  'American Express',
  'PayPal',
  'Apple Pay',
  'Google Pay',
  'TWINT',
  'Überweisung',
  'Scheck',
];

//
// Типи витратних документів
//
const DOCUMENT_TYPES = [
  { value: 'receipt', label: 'Чек' },
  { value: 'supplier_invoice', label: 'Рахунок постачальника' },
  { value: 'subcontractor_invoice', label: 'Рахунок субпідрядника' },
  { value: 'other', label: 'Інше' },
];

//
// Категорії витрат
//
const EXPENSE_CATEGORIES = [
  { value: 'materials', label: 'Матеріали' },
  { value: 'salary', label: 'Зарплата' },
  { value: 'transport', label: 'Транспорт' },
  { value: 'tools', label: 'Інструмент' },
  { value: 'subcontractor', label: 'Субпідрядник' },
  { value: 'other', label: 'Інше' },
];

//
// Куди прив’язувати витрату
//
const LINK_MODES = [
  { value: 'none', label: 'Без привʼязки' },
  { value: 'client', label: 'До клієнта' },
  { value: 'invoice', label: 'До інвойсу' },
];

//
// Перетворює код валюти у символ
// Наприклад EUR -> €
//
function formatCurrencySymbol(currency: string): string {
  const map: Record<string, string> = {
    EUR: '€',
    USD: '$',
    GBP: '£',
    CHF: 'CHF',
    PLN: 'zł',
    CZK: 'Kč',
    UAH: '₴',
  };

  return map[currency] || currency;
}

//
// Безпечне перетворення рядка у число
// Наприклад "59,06" -> 59.06
//
function parseNumber(value: string): number {
  return parseFloat(String(value || '0').replace(',', '.')) || 0;
}

export default function ReceiptForm() {
  // Навігація між сторінками
  const navigate = useNavigate();

  // Беремо id з URL
  const { id } = useParams();

  // React Query client для оновлення кешу
  const queryClient = useQueryClient();

  // Читаємо параметри з URL після OCR / розпізнавання
  const [searchParams] = useSearchParams();

  // Переклади
  const { t } = useLanguage();

  // Toast-повідомлення
  const { showSuccess, showError } = useToastContext();

  // Якщо id !== 'new', значить це режим редагування
  const isEdit = id !== 'new';

  // ref до прихованого input[type=file]
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Стани інтерфейсу
  const [loading, setLoading] = useState(false); // збереження
  const [uploading, setUploading] = useState(false); // завантаження файлу
  const [showOriginalImage, setShowOriginalImage] = useState(false); // модалка перегляду оригіналу
  const [downloadingPdf, setDownloadingPdf] = useState(false); // чи генерується PDF

  // Списки для випадаючих полів
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  // Основні дані форми
  const [formData, setFormData] = useState<ExpenseFormData>({
    document_number: '',
    document_date: new Date().toISOString().split('T')[0],
    vendor_name: '',
    items_text: '',
    payment_method: 'Bar',
    vat_enabled: false,
    amount_net: '',
    vat_rate: '19',
    vat_amount: '0.00',
    total_amount: '',
    currency: 'EUR',
    original_file_url: '',
    notes: '',

    document_type: 'receipt',
    expense_category: 'materials',
    link_mode: 'none',
    client_id: '',
    invoice_id: '',
  });

  // ---------------------------------------------------------
  // Завантаження клієнтів користувача
  // ---------------------------------------------------------
  // Потрібно для випадаючого списку "Клієнт"
  //
  const loadClients = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (!error) {
      setClients(data || []);
    }
  };

  // ---------------------------------------------------------
  // Завантаження інвойсів користувача
  // ---------------------------------------------------------
  // Потрібно для випадаючого списку "Інвойс"
  //
  const loadInvoices = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from('invoices')
      .select('id, document_no, client_id, client_name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error) {
      setInvoices(data || []);
    }
  };

  // ---------------------------------------------------------
  // Завантаження існуючого документа витрат
  // ---------------------------------------------------------
  // Працює, коли ми редагуємо вже створений документ
  //
  const loadExpenseDocument = async () => {
    try {
      const { data, error } = await supabase
        .from('expense_documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          document_number: data.document_number || '',
          document_date: data.document_date || new Date().toISOString().split('T')[0],
          vendor_name: data.vendor_name || '',
          items_text: data.ocr_raw_text || '',
          payment_method: data.payment_method || 'Bar',
          vat_enabled: !!data.vat_enabled,
          amount_net: data.amount_net ? String(data.amount_net) : '',
          vat_rate: data.vat_rate ? String(data.vat_rate) : '19',
          vat_amount: data.vat_amount ? String(data.vat_amount) : '0.00',
          total_amount: data.total_amount ? String(data.total_amount) : '',
          currency: data.currency || 'EUR',
          original_file_url: data.original_file_url || '',
          notes: data.notes || '',

          document_type: data.document_type || 'receipt',
          expense_category: data.expense_category || 'materials',
          link_mode: data.invoice_id ? 'invoice' : data.client_id ? 'client' : 'none',
          client_id: data.client_id || '',
          invoice_id: data.invoice_id || '',
        });

        // Додатково підтягуємо позиції документа
        const { data: itemsData } = await supabase
          .from('expense_document_items')
          .select('*')
          .eq('expense_document_id', data.id)
          .order('sort_order');

        if (itemsData && itemsData.length > 0) {
          const itemsText = itemsData
            .map((item) => item.description || '')
            .filter(Boolean)
            .join('\n');

          setFormData((prev) => ({
            ...prev,
            items_text: itemsText || prev.items_text,
          }));
        }
      }
    } catch (error) {
      console.error('Error loading expense document:', error);
      showError('Не вдалося завантажити документ витрат');
    }
  };

  // ---------------------------------------------------------
  // Початкове завантаження сторінки
  // ---------------------------------------------------------
  // 1. Завантажуємо клієнтів
  // 2. Завантажуємо інвойси
  // 3. Якщо редагування — тягнемо документ з бази
  // 4. Якщо новий документ після OCR — тягнемо дані з URL
  //
  useEffect(() => {
    void loadClients();
    void loadInvoices();

    if (isEdit) {
      void loadExpenseDocument();
      return;
    }

    // OCR-дані з URL
    const scannedVendor = searchParams.get('issuer_name');
    const fileUrlParam = searchParams.get('file_url');

    // Прив’язка після OCR
    const scannedLinkMode = searchParams.get('link_mode') || 'none';
    const scannedClientId = searchParams.get('client_id') || '';
    const scannedInvoiceId = searchParams.get('invoice_id') || '';

    // Якщо є тільки файл без OCR-даних
    if (fileUrlParam && !scannedVendor) {
      setFormData((prev) => ({
        ...prev,
        original_file_url: fileUrlParam,
        link_mode: scannedLinkMode,
        client_id: scannedClientId,
        invoice_id: scannedInvoiceId,
      }));
      return;
    }

    // Якщо прийшли OCR-дані
    if (scannedVendor !== null) {
      const scannedDate = searchParams.get('date') || new Date().toISOString().split('T')[0];
      const scannedGross = searchParams.get('amount_gross') || '';
      const scannedNet = searchParams.get('amount_net') || '';
      const scannedVat = searchParams.get('vat_amount') || '';
      const scannedPayment = searchParams.get('payment_method') || 'Bar';
      const scannedItems = searchParams.get('items') || '';
      const scannedFileUrl = searchParams.get('file_url') || '';
      const scannedReceiptNumber = searchParams.get('receipt_number') || '';

      const grossVal = parseNumber(scannedGross);
      const netVal = parseNumber(scannedNet);
      const vatVal = parseNumber(scannedVat);
      const hasVat = netVal > 0 && vatVal > 0 && netVal < grossVal;

      // Пробуємо вгадати ставку ПДВ
      let detectedVatRate = '19';
      if (hasVat && netVal > 0) {
        const impliedRate = Math.round(((grossVal / netVal) - 1) * 100);
        const knownRates = [0, 7, 10, 19, 20, 21, 23, 25];
        const closest = knownRates.reduce((a, b) =>
          Math.abs(b - impliedRate) < Math.abs(a - impliedRate) ? b : a,
        19);
        detectedVatRate = closest.toString();
      }

      // Підганяємо спосіб оплати під список
      const matchPayment = (raw: string): string => {
        const normalized = raw.toLowerCase().trim();
        for (const method of PAYMENT_METHODS) {
          if (method.toLowerCase() === normalized) return method;
        }
        return 'Bar';
      };

      setFormData((prev) => ({
        ...prev,
        vendor_name: scannedVendor,
        document_date: scannedDate,
        total_amount: scannedGross,
        amount_net: hasVat ? scannedNet : scannedGross,
        vat_amount: hasVat ? scannedVat : '0.00',
        vat_rate: hasVat ? detectedVatRate : '19',
        vat_enabled: hasVat,
        payment_method: matchPayment(scannedPayment),
        items_text: scannedItems,
        original_file_url: scannedFileUrl,
        document_number: scannedReceiptNumber,

        // Прив’язка
        link_mode: scannedLinkMode,
        client_id: scannedClientId,
        invoice_id: scannedInvoiceId,
      }));
    }
  }, [id, isEdit, searchParams]);

  // ---------------------------------------------------------
  // Якщо обраний інвойс, автоматично підтягуємо його клієнта
  // ---------------------------------------------------------
  //
  useEffect(() => {
    if (formData.link_mode !== 'invoice' || !formData.invoice_id) return;

    const selectedInvoice = invoices.find((invoice) => invoice.id === formData.invoice_id);
    if (!selectedInvoice?.client_id) return;

    if (formData.client_id !== selectedInvoice.client_id) {
      setFormData((prev) => ({
        ...prev,
        client_id: selectedInvoice.client_id,
      }));
    }
  }, [formData.link_mode, formData.invoice_id, formData.client_id, invoices]);

  // ---------------------------------------------------------
  // Перерахунок ПДВ
  // ---------------------------------------------------------
  //
  const recalcVat = (net: string, rate: string): { vat: string; gross: string } => {
    const n = parseNumber(net);
    const r = parseNumber(rate);
    const vat = (n * r) / 100;

    return {
      vat: vat.toFixed(2),
      gross: (n + vat).toFixed(2),
    };
  };

  // ---------------------------------------------------------
  // Зміна сум
  // ---------------------------------------------------------
  // Якщо ПДВ вимкнено — нетто = брутто
  // Якщо увімкнено — усе рахується автоматично
  //
  const handleAmountChange = (
    field: 'amount_net' | 'total_amount' | 'vat_rate',
    value: string
  ) => {
    if (!formData.vat_enabled) {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
        total_amount: field === 'total_amount' ? value : prev.total_amount || value,
        amount_net: field === 'amount_net' ? value : value,
        vat_amount: '0.00',
      }));
      return;
    }

    if (field === 'total_amount') {
      const gross = parseNumber(value);
      const rate = parseNumber(formData.vat_rate);
      const net = rate > 0 ? gross / (1 + rate / 100) : gross;
      const vat = gross - net;

      setFormData((prev) => ({
        ...prev,
        total_amount: value,
        amount_net: net.toFixed(2),
        vat_amount: vat.toFixed(2),
      }));
    } else if (field === 'amount_net') {
      const { vat, gross } = recalcVat(value, formData.vat_rate);
      setFormData((prev) => ({
        ...prev,
        amount_net: value,
        vat_amount: vat,
        total_amount: gross,
      }));
    } else if (field === 'vat_rate') {
      const { vat, gross } = recalcVat(formData.amount_net, value);
      setFormData((prev) => ({
        ...prev,
        vat_rate: value,
        vat_amount: vat,
        total_amount: gross,
      }));
    }
  };

  // ---------------------------------------------------------
  // Увімкнення / вимкнення ПДВ
  // ---------------------------------------------------------
  //
  const handleVatToggle = (enabled: boolean) => {
    if (!enabled) {
      setFormData((prev) => ({
        ...prev,
        vat_enabled: false,
        vat_amount: '0.00',
        amount_net: prev.total_amount,
      }));
      return;
    }

    const sourceNet = formData.amount_net || formData.total_amount;
    const { vat, gross } = recalcVat(sourceNet, formData.vat_rate);

    setFormData((prev) => ({
      ...prev,
      vat_enabled: true,
      amount_net: sourceNet,
      vat_amount: vat,
      total_amount: gross,
    }));
  };

  // ---------------------------------------------------------
  // Фільтр інвойсів по клієнту
  // ---------------------------------------------------------
  // Якщо вибраний клієнт — показуємо тільки його інвойси
  //
  const filteredInvoices = useMemo(() => {
    if (!formData.client_id) return invoices;
    return invoices.filter((invoice) => invoice.client_id === formData.client_id);
  }, [invoices, formData.client_id]);

  // ---------------------------------------------------------
  // Завантаження оригінального файлу
  // ---------------------------------------------------------
  //
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showError('Користувач не авторизований');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showError(t('fileSizeLimit10mb') || 'Файл має бути менше 10 МБ');
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('scanned-documents')
        .upload(fileName, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('scanned-documents').getPublicUrl(fileName);

      setFormData((prev) => ({
        ...prev,
        original_file_url: publicUrl,
      }));

      showSuccess('Файл завантажено');
    } catch (error) {
      console.error('Upload error:', error);
      showError('Не вдалося завантажити файл');
    } finally {
      setUploading(false);
    }
  };

  // ---------------------------------------------------------
  // Видалення оригінального файлу
  // ---------------------------------------------------------
  //
  const handleRemoveFile = async () => {
    if (!formData.original_file_url) return;

    try {
      const fileName = formData.original_file_url.split('/').pop();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (fileName && user) {
        await supabase.storage
          .from('scanned-documents')
          .remove([`${user.id}/${fileName}`]);
      }

      setFormData((prev) => ({
        ...prev,
        original_file_url: '',
      }));
    } catch (error) {
      console.error('Remove error:', error);
    }
  };

  // ---------------------------------------------------------
  // Збереження документа витрат
  // ---------------------------------------------------------
  // 1. Зберігаємо сам документ в expense_documents
  // 2. Видаляємо старі позиції
  // 3. Створюємо нові позиції з items_text
  //
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        showError('Користувач не авторизований');
        return;
      }

      const totalAmount = parseNumber(formData.total_amount);
      const amountNet = parseNumber(formData.amount_net);
      const vatAmount = parseNumber(formData.vat_amount);

      const payload = {
        user_id: user.id,
        document_type: formData.document_type,
        vendor_name: formData.vendor_name || '',
        document_number: formData.document_number || '',
        document_date: formData.document_date || null,
        total_amount: totalAmount,
        currency: formData.currency || 'EUR',
        vat_enabled: formData.vat_enabled,
        vat_amount: vatAmount || null,
        payment_method: formData.payment_method || '',
        expense_category: formData.expense_category || 'other',
        original_file_url: formData.original_file_url || null,
        ocr_raw_text: formData.items_text || '',
        client_id:
          formData.link_mode === 'client' || formData.link_mode === 'invoice'
            ? formData.client_id || null
            : null,
        invoice_id:
          formData.link_mode === 'invoice'
            ? formData.invoice_id || null
            : null,
        notes: formData.notes || null,
        updated_at: new Date().toISOString(),
        amount_net: amountNet || null,
        vat_rate: parseNumber(formData.vat_rate) || null,
      };

      let expenseDocumentId = id;

      if (isEdit) {
        const { error } = await supabase
          .from('expense_documents')
          .update(payload)
          .eq('id', id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('expense_documents')
          .insert([payload])
          .select()
          .maybeSingle();

        if (error) throw error;
        expenseDocumentId = data?.id;
      }

      if (!expenseDocumentId) {
        throw new Error('Не вдалося отримати ID документа витрат');
      }

      // Видаляємо старі позиції
      await supabase
        .from('expense_document_items')
        .delete()
        .eq('expense_document_id', expenseDocumentId);

      // Створюємо нові позиції
      const lines = formData.items_text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length > 0) {
        const itemsPayload = lines.map((line, index) => ({
          expense_document_id: expenseDocumentId,
          description: line,
          quantity: null,
          unit: null,
          unit_price: null,
          total_price: null,
          sort_order: index,
        }));

        const { error: itemsError } = await supabase
          .from('expense_document_items')
          .insert(itemsPayload);

        if (itemsError) throw itemsError;
      }

      // Оновлюємо кеш сторінок
      await queryClient.invalidateQueries({ queryKey: ['expense_documents'] });
      await queryClient.invalidateQueries({ queryKey: ['receipts'] });
      await queryClient.invalidateQueries({ queryKey: ['client-expenses'] });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });

      showSuccess('Документ витрат збережено');
      navigate('/receipts');
    } catch (error: any) {
      console.error('Помилка збереження документа витрат:', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });

      showError(error?.message || 'Beleg konnte nicht gespeichert werden');
    } finally {
      setLoading(false);
    }
  };

  // Символ валюти
  const sym = formatCurrencySymbol(formData.currency);

  // Валідація перед збереженням
  const canSave =
    formData.vendor_name.trim() &&
    formData.total_amount &&
    (formData.link_mode !== 'client' || !!formData.client_id) &&
    (formData.link_mode !== 'invoice' || (!!formData.client_id && !!formData.invoice_id));

  // Перевірка, чи файл є зображенням
  const isImageUrl =
    formData.original_file_url &&
    /\.(jpg|jpeg|png|gif|webp|heic|heif)(\?|$)/i.test(formData.original_file_url);

  // ---------------------------------------------------------
  // Генерація PDF документа витрат
  // ---------------------------------------------------------
  //
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);

    try {
      const gross = parseNumber(formData.total_amount);

      await downloadReceiptPDF({
        id: id || 'new',
        store_name: formData.vendor_name,
        date: formData.document_date,
        total: gross,
        items: formData.items_text,
        payment_method: formData.payment_method,
        receipt_number: formData.document_number,
        file_url: formData.original_file_url,
        issuer_name: formData.vendor_name,
        amount_net: parseNumber(formData.amount_net),
        vat_rate: parseNumber(formData.vat_rate),
        vat_amount: parseNumber(formData.vat_amount),
        amount_gross: gross,
        vat_enabled: formData.vat_enabled,
        currency: formData.currency,
        signature_data: '',
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1f24] text-white pb-8 pt-20">
      <TopNav />

      <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-xl mx-auto">
        {/* Верхня панель */}
        <div className="flex items-center gap-3 mb-2">
          <button
            type="button"
            onClick={() => navigate('/receipts')}
            className="p-2 rounded-xl bg-white/8 hover:bg-white/15 transition-all"
          >
            <ArrowLeft size={18} className="text-white/70" />
          </button>

          <h1 className="text-xl font-semibold text-white flex-1">
            {isEdit ? 'Редагувати документ витрат' : 'Новий документ витрат'}
          </h1>

          {isEdit && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/8 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/30 text-white/60 hover:text-orange-400 transition-all text-sm font-medium disabled:opacity-50"
            >
              <Download size={15} />
              PDF
            </button>
          )}
        </div>

        {/* Блок оригінального файлу */}
        {isImageUrl ? (
          <div className="bg-white/6 border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <div className="flex items-center gap-2">
                <FileImage size={15} className="text-orange-400" />
                <span className="text-sm font-medium text-white/80">Оригінальний документ</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowOriginalImage(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/60 hover:text-white text-xs font-medium transition-all"
                >
                  <ZoomIn size={13} />
                  Переглянути
                </button>

                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-400 transition-all"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            <div
              className="cursor-pointer group relative overflow-hidden"
              style={{ maxHeight: 340 }}
              onClick={() => setShowOriginalImage(true)}
            >
              <img
                src={formData.original_file_url}
                alt="Original document"
                className="w-full object-contain bg-white"
                style={{ maxHeight: 340 }}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white/6 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileImage size={15} className="text-white/40" />
                <span className="text-sm text-white/50">Документ не прикріплено</span>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-orange-500/15 border border-white/10 hover:border-orange-500/30 text-white/60 hover:text-orange-400 text-xs font-medium transition-all disabled:opacity-50"
              >
                <Upload size={13} />
                {uploading ? 'Завантаження...' : 'Завантажити'}
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Основна форма */}
        <div className="bg-white/6 border border-white/10 rounded-2xl overflow-hidden">
          {/* Тип і прив’язка */}
          <div className="px-5 pt-5 pb-4 border-b border-white/8">
            <p className="text-xs uppercase tracking-wider text-white/40 font-medium mb-3">
              Тип і привʼязка
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Select
                label="Тип документа"
                value={formData.document_type}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    document_type: e.target.value,
                  }))
                }
                options={DOCUMENT_TYPES}
              />

              <Select
                label="Куди привʼязати"
                value={formData.link_mode}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    link_mode: e.target.value,
                    client_id: e.target.value === 'none' ? '' : prev.client_id,
                    invoice_id: e.target.value !== 'invoice' ? '' : prev.invoice_id,
                  }))
                }
                options={LINK_MODES}
              />

              {(formData.link_mode === 'client' || formData.link_mode === 'invoice') && (
                <Select
                  label="Клієнт"
                  value={formData.client_id}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      client_id: e.target.value,
                      invoice_id: '',
                    }))
                  }
                  options={[
                    { value: '', label: 'Оберіть клієнта' },
                    ...clients.map((client) => ({
                      value: client.id,
                      label: client.name,
                    })),
                  ]}
                />
              )}

              {formData.link_mode === 'invoice' && (
                <Select
                  label="Інвойс"
                  value={formData.invoice_id}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      invoice_id: e.target.value,
                    }))
                  }
                  options={[
                    { value: '', label: 'Оберіть інвойс' },
                    ...filteredInvoices.map((invoice) => ({
                      value: invoice.id,
                      label: `${invoice.document_no || 'Без номера'}${invoice.client_name ? ` — ${invoice.client_name}` : ''}`,
                    })),
                  ]}
                />
              )}

              <Select
                label="Категорія витрати"
                value={formData.expense_category}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    expense_category: e.target.value,
                  }))
                }
                options={EXPENSE_CATEGORIES}
              />
            </div>
          </div>

          {/* Основна інформація */}
          <div className="px-5 pt-5 pb-4 border-b border-white/8">
            <p className="text-xs uppercase tracking-wider text-white/40 font-medium mb-3">
              Основна інформація
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('date')}
                type="date"
                value={formData.document_date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, document_date: e.target.value }))
                }
              />

              <Input
                label="Номер документа"
                value={formData.document_number}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, document_number: e.target.value }))
                }
                placeholder="001"
              />
            </div>
          </div>

          {/* Постачальник */}
          <div className="px-5 py-4 border-b border-white/8">
            <p className="text-xs uppercase tracking-wider text-white/40 font-medium mb-3">
              Магазин / постачальник
            </p>

            <Input
              label="Магазин / постачальник *"
              value={formData.vendor_name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, vendor_name: e.target.value }))
              }
              placeholder="BAUHAUS"
              required
            />
          </div>

          {/* Позиції */}
          <div className="px-5 py-4 border-b border-white/8">
            <p className="text-xs uppercase tracking-wider text-white/40 font-medium mb-3">
              Позиції / опис
            </p>

            <Textarea
              label="Розпізнані позиції"
              value={formData.items_text}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, items_text: e.target.value }))
              }
              placeholder="Один рядок = одна позиція"
              rows={4}
            />
          </div>

          {/* Суми */}
          <div className="px-5 py-4 border-b border-white/8">
            <p className="text-xs uppercase tracking-wider text-white/40 font-medium mb-3">
              Сума і валюта
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Input
                    label={formData.vat_enabled ? 'Нетто' : 'Сума'}
                    type="number"
                    step="0.01"
                    value={formData.vat_enabled ? formData.amount_net : formData.total_amount}
                    onChange={(e) =>
                      formData.vat_enabled
                        ? handleAmountChange('amount_net', e.target.value)
                        : handleAmountChange('total_amount', e.target.value)
                    }
                    placeholder="0.00"
                  />
                </div>

                <Select
                  label={t('currency') || 'Валюта'}
                  value={formData.currency}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, currency: e.target.value }))
                  }
                  options={CURRENCIES.map((currency) => ({
                    value: currency,
                    label: currency,
                  }))}
                />
              </div>

              <div className="flex items-center gap-3 py-1">
                <button
                  type="button"
                  onClick={() => handleVatToggle(!formData.vat_enabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    formData.vat_enabled ? 'bg-orange-500' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      formData.vat_enabled ? 'translate-x-5.5 left-0.5' : 'left-0.5'
                    }`}
                  />
                </button>

                <span className="text-sm text-white/70">Включити ПДВ</span>
              </div>

              {formData.vat_enabled && (
                <div className="bg-white/4 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="ПДВ %"
                      value={formData.vat_rate}
                      onChange={(e) => handleAmountChange('vat_rate', e.target.value)}
                      options={VAT_RATES.map((rate) => ({
                        value: rate,
                        label: `${rate} %`,
                      }))}
                    />

                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">
                        Сума ПДВ
                      </label>
                      <div className="w-full bg-white/5 border border-white/10 rounded-xl text-white/60 py-3 px-4 text-sm">
                        {formData.vat_amount} {sym}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/10">
                    <span className="text-sm font-semibold text-white/80">Брутто</span>
                    <span className="text-lg font-bold text-orange-400">
                      {parseNumber(formData.total_amount).toFixed(2)} {sym}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Спосіб оплати */}
          <div className="px-5 py-4 border-b border-white/8">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Спосіб оплати"
                value={formData.payment_method}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, payment_method: e.target.value }))
                }
                options={PAYMENT_METHODS.map((method) => ({
                  value: method,
                  label: method,
                }))}
              />

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Загальна сума
                </label>
                <div className="w-full bg-orange-500/10 border border-orange-500/30 rounded-xl text-orange-400 font-bold py-3 px-4 text-sm">
                  {parseNumber(formData.total_amount).toFixed(2)} {sym}
                </div>
              </div>
            </div>
          </div>

          {/* Примітки */}
          <div className="px-5 py-4">
            <Textarea
              label="Примітки"
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Додаткові нотатки"
              rows={3}
            />
          </div>
        </div>

        {/* Нижні кнопки */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/receipts')}
            className="flex-1 py-3 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition-all font-medium"
          >
            {t('cancel') || 'Скасувати'}
          </button>

          <button
            type="submit"
            disabled={loading || !canSave}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium transition-all active:scale-95 disabled:opacity-50"
          >
            <Save size={16} />
            {loading ? t('saving') || 'Збереження...' : t('save') || 'Зберегти'}
          </button>
        </div>
      </form>

      {/* Повноекранний перегляд оригінального документа */}
      <AnimatePresence>
        {showOriginalImage && formData.original_file_url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black flex flex-col"
            onClick={() => setShowOriginalImage(false)}
          >
            <div
              className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-white/5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowOriginalImage(false)}
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
                src={formData.original_file_url}
                alt="Original document"
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
    </div>
  );
}