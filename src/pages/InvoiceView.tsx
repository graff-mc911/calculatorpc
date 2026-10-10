import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  PenTool,
  Send,
  Mail,
  ZoomIn,
  ZoomOut,
  Edit2,
  Eye,
  Receipt,
  Share2,
  Printer,
  Link2,
  Copy,
  CheckCircle,
  X,
  Banknote,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { InvoicePreview } from '../components/InvoicePreview';
import { SignatureCanvas } from '../components/SignatureCanvas';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { calculateLineTotal } from '../lib/invoiceTotals';
import { downloadPdfFiles, fetchPdfBlob, shareOrDownloadPdf } from '../lib/shareInvoice';
import { generateInvoicePDFBlob } from '../lib/pdfGenerator';
import { currencies, invoiceDocumentLabel, invoicePdfFileName } from '../lib/languages';
import {
  buildCompanyFromInvoice,
  resolveCompanyLogoUrl,
  resolveCompanySignatureUrl,
} from '../lib/companyProfile';
import { maskMoneyTyping, parseMoneyInput } from '../lib/moneyMask';
import {
  addInvoicePayment,
  listInvoicePayments,
  remainingBalance,
  sumPayments,
  type InvoicePayment,
} from '../lib/invoicePayments';

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

const formatMoney = (amount: number, currency = 'EUR') => {
  return `${amount.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
};

export const InvoiceView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { showSuccess, showError } = useToastContext();

  const [invoice, setInvoice] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [invoiceExpenses, setInvoiceExpenses] = useState<ExpenseDocumentRow[]>([]);

  const [showSignatureModal, setShowSignatureModal] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payMode, setPayMode] = useState<'full' | 'partial' | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payCurrency, setPayCurrency] = useState('EUR');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showFullScreenPDF, setShowFullScreenPDF] = useState(false);
  const [pdfZoom, setPdfZoom] = useState(100);
  const [sharing, setSharing] = useState(false);

  const isMobile = window.innerWidth < 768;

  const findPdfInStorage = useCallback(async (userId: string, invoiceId: string) => {
    const { data: files, error } = await supabase.storage
      .from('invoice-pdfs')
      .list(userId);

    if (error || !files) return null;

    const matchedPdf = files.find((file) => file.name.startsWith(`${invoiceId}-invoice`));
    if (!matchedPdf) return null;

    const filePath = `${userId}/${matchedPdf.name}`;

    const {
      data: { publicUrl },
    } = supabase.storage.from('invoice-pdfs').getPublicUrl(filePath);

    return publicUrl || null;
  }, []);

  const fetchInvoice = useCallback(async () => {
    try {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !id) return;

      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (invoiceError) throw invoiceError;

      if (!invoiceData) {
        showError(t('invoiceNotFound') || 'Інвойс не знайдено');
        navigate('/invoices');
        return;
      }

      const { data: itemsData } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', id)
        .order('sort_order');

      const invoiceWithItems = {
        ...invoiceData,
        document_number: invoiceData.document_no,
        client_number: invoiceData.client_number,
        work_period_start: invoiceData.work_period_start,
        work_period_end: invoiceData.work_period_end,
        vat_enabled: invoiceData.tax_percent > 0,
        vat_rate: invoiceData.tax_percent || 0,
        vat_amount: invoiceData.tax_amount,
        net_total: invoiceData.total_net,
        gross_total: invoiceData.total_gross,
        project_area: invoiceData.total_project_area,
        object_address: invoiceData.object_address,
        signature_data_url: invoiceData.signature_data_url,
        signed_by: invoiceData.signed_by,
        signed_at: invoiceData.signed_at,
        items:
          itemsData?.map((item) => {
            const quantity = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            const material = item.material || '';
            return {
              quantity,
              quantityDisplay: String(item.quantity ?? ''),
              unit: item.unit,
              price,
              material,
              description: item.description || '',
              total: calculateLineTotal(quantity, price, material),
            };
          }) || [],
      };

      setInvoice(invoiceWithItems);

      try {
        const rows = await listInvoicePayments(id);
        setPayments(rows);
      } catch (payErr) {
        console.warn('Invoice payments load failed', payErr);
        setPayments([]);
      }

      const { data: expensesData, error: expensesError } = await supabase
        .from('expense_documents')
        .select('*')
        .eq('user_id', user.id)
        .eq('invoice_id', id)
        .order('document_date', { ascending: false });

      if (expensesError) {
        console.error('Помилка завантаження витрат інвойсу:', expensesError);
        setInvoiceExpenses([]);
      } else {
        setInvoiceExpenses((expensesData || []) as ExpenseDocumentRow[]);
      }

      let resolvedPdfUrl = invoiceData.pdf_url || invoiceData.uploaded_pdf_url || null;

      if (!resolvedPdfUrl) {
        const storagePdfUrl = await findPdfInStorage(user.id, id);

        if (storagePdfUrl) {
          resolvedPdfUrl = storagePdfUrl;

          await supabase
            .from('invoices')
            .update({ pdf_url: storagePdfUrl })
            .eq('id', id);
        }
      }

      setPdfUrl(resolvedPdfUrl);

      if (invoiceData.client_id) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('*')
          .eq('id', invoiceData.client_id)
          .maybeSingle();

        setClient(clientData);
      } else {
        setClient(null);
      }

      const { data: profileData } = await supabase
        .from('company_profile')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      setCompanyProfile(profileData || null);
    } catch (error) {
      console.error(error);
      showError(t('errorLoadingInvoice') || 'Помилка завантаження інвойсу');
    } finally {
      setIsLoading(false);
    }
  }, [findPdfInStorage, id, navigate, showError, t]);

  useEffect(() => {
    if (id) {
      void fetchInvoice();
    }
  }, [id, fetchInvoice]);

  const handleSaveSignature = async (signatureDataUrl: string, signerName: string) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          signature_data_url: signatureDataUrl,
          signed_by: signerName,
          signed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setShowSignatureModal(false);
      showSuccess(t('signatureSaved') || 'Підпис збережено');
      await fetchInvoice();
    } catch {
      showError(t('failedSaveSignature') || 'Не вдалося зберегти підпис');
    }
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim()) {
      showError(t('enterEmailAddress') || 'Введіть email');
      return;
    }

    setSendingEmail(true);

    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          sent_at: new Date().toISOString(),
          sent_to: emailTo.trim(),
        })
        .eq('id', id);

      if (error) throw error;

      setShowEmailModal(false);
      setEmailTo('');
      showSuccess(t('invoiceSent') || 'Інвойс позначено як відправлений');
      await fetchInvoice();
    } catch {
      showError(t('failedSendInvoice') || 'Не вдалося відправити інвойс');
    } finally {
      setSendingEmail(false);
    }
  };

  const buildShareInvoiceData = () => {
    if (!invoice) return null;

    return {
      document_number: invoice.document_no || invoice.document_number || 'invoice',
      date: invoice.date,
      client_name: client?.name || invoice.client_name || '',
      client_address: client?.address || invoice.client_address || '',
      client_tax_number: client?.tax_number || invoice.client_tax_number || '',
      client_number: invoice.client_number || client?.client_number || '',
      currency: invoice.currency || 'EUR',
      items: (invoice.items || []).map((item: any) => ({
        description: item.description || '',
        material: item.material,
        quantity: Number(item.quantity) || 0,
        unit: item.unit,
        price: Number(item.price) || 0,
        total: calculateLineTotal(item.quantity, item.price, item.material),
      })),
      vat_enabled: !!invoice.vat_enabled || Number(invoice.tax_percent || 0) > 0,
      vat_rate: invoice.vat_rate || invoice.tax_percent || 0,
      notes: invoice.notes || '',
      signature_data_url: resolveCompanySignatureUrl(invoice, companyProfile),
      signed_by: invoice.signed_by || '',
      service_period_start: invoice.work_period_start,
      service_period_end: invoice.work_period_end,
      object_address: invoice.object_address || '',
      // Prefer stored invoice document language (e.g. es from Presupuesto import)
      invoice_language: invoice.invoice_language || language || 'en',
    };
  };

  const buildPdfBlob = async (): Promise<{ blob: Blob; fileName: string; shareLabel: string }> => {
    if (!invoice) {
      throw new Error('Invoice data missing');
    }

    const docNo = invoice.document_no || invoice.document_number || 'invoice';
    const invoiceLang = invoice.invoice_language || language || 'en';
    const shareLabel = invoiceDocumentLabel(invoiceLang, docNo);
    const fileName = invoicePdfFileName(invoiceLang, docNo);
    let blob: Blob | null = null;

    if (invoice.source === 'uploaded' && pdfUrl) {
      try {
        blob = await fetchPdfBlob(pdfUrl);
      } catch (error) {
        console.warn('Could not fetch stored PDF, generating locally', error);
      }
    }

    if (!blob) {
      const invoicePayload = buildShareInvoiceData();
      if (!invoicePayload) {
        throw new Error('Invoice data missing');
      }

      const companyData = buildCompanyFromInvoice(invoice, companyProfile);
      const logoUrl = resolveCompanyLogoUrl(invoice, companyProfile);
      blob = await generateInvoicePDFBlob(invoicePayload, companyData, logoUrl);
    }

    return { blob, fileName, shareLabel };
  };

  const markInvoiceStatus = async (status: 'sent' | 'paid') => {
    if (!invoice?.id) return;
    const { error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', invoice.id);
    if (error) throw error;
    setInvoice((prev: any) => (prev ? { ...prev, status } : prev));
  };

  const handleShareInvoice = async () => {
    if (!invoice) return;

    setSharing(true);
    try {
      const { blob, fileName, shareLabel } = await buildPdfBlob();

      const result = await shareOrDownloadPdf({
        blob,
        fileName,
        title: shareLabel,
        text: shareLabel,
      });

      // Promote draft → sent after a successful share (simple status model)
      if (invoice.status === 'draft' || !invoice.status) {
        try {
          await markInvoiceStatus('sent');
        } catch (e) {
          console.warn('Could not set sent status', e);
        }
      }

      if (result === 'downloaded') {
        showSuccess(t('pdfDownloaded') || t('downloadPdf') || 'PDF downloaded');
      } else {
        showSuccess(t('invoiceShared') || t('share') || 'Shared');
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('Share invoice error:', error);
      showError(error?.message || t('shareFailed') || 'Could not share invoice');
    } finally {
      setSharing(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    setDownloadingPdf(true);
    try {
      const { blob, fileName } = await buildPdfBlob();
      downloadPdfFiles([{ blob, fileName }]);
      showSuccess(t('pdfDownloaded') || t('downloadPdf') || 'PDF downloaded');
    } catch (error: any) {
      console.error('Download PDF error:', error);
      showError(error?.message || t('shareFailed') || 'Could not download PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const openPayModal = () => {
    if (!invoice) return;
    const invCurrency = invoice.currency || 'EUR';
    const total = Number(invoice.gross_total || invoice.total_gross || invoice.uploaded_amount || 0);
    const paid = sumPayments(payments);
    const due = remainingBalance(total, paid);
    setPayMode(null);
    setPayCurrency(invCurrency);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayAmount(due > 0 ? String(due).replace('.', ',') : '');
    setPayModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!invoice?.id || !payMode) return;
    const total = Number(invoice.gross_total || invoice.total_gross || invoice.uploaded_amount || 0);
    const paidSoFar = sumPayments(payments);
    const due = remainingBalance(total, paidSoFar);

    let amount = 0;
    if (payMode === 'full') {
      amount = due > 0 ? due : total;
    } else {
      amount = parseMoneyInput(payAmount);
      if (!(amount > 0)) {
        showError('Вкажіть суму оплати');
        return;
      }
      if (due > 0 && amount > due + 0.009) {
        showError(`Сума більша за залишок (${formatMoney(due, payCurrency)})`);
        return;
      }
    }
    if (!(amount > 0)) {
      showError('Немає суми до оплати');
      return;
    }

    setMarkingPaid(true);
    try {
      const row = await addInvoicePayment({
        invoice_id: invoice.id,
        amount,
        currency: payCurrency || invoice.currency || 'EUR',
        paid_at: payDate || new Date().toISOString().slice(0, 10),
        note: payMode === 'full' ? 'full' : 'partial',
      });
      const nextPayments = [...payments, row];
      setPayments(nextPayments);
      const paidTotal = sumPayments(nextPayments);
      const rem = remainingBalance(total, paidTotal);
      if (rem <= 0.009) {
        await markInvoiceStatus('paid');
        showSuccess(t('paid') || 'Оплачено повністю');
      } else {
        if (invoice.status === 'draft' || !invoice.status) {
          try {
            await markInvoiceStatus('sent');
          } catch {
            /* ignore */
          }
        }
        showSuccess(`Оплату записано. Залишок: ${formatMoney(rem, payCurrency)}`);
      }
      setPayModalOpen(false);
      setPayMode(null);
    } catch (error: any) {
      console.error('Mark paid error:', error);
      showError(error?.message || t('error') || 'Не вдалося зберегти оплату');
    } finally {
      setMarkingPaid(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const shareablePreviewUrl =
    typeof window !== 'undefined' && id
      ? `${window.location.origin}/invoices/${id}/preview`
      : '';

  const handleCopyShareLink = async () => {
    if (!shareablePreviewUrl) return;
    try {
      await navigator.clipboard.writeText(shareablePreviewUrl);
      setLinkCopied(true);
      showSuccess(t('linkCopied') || t('pdfShareLinkCopied') || 'Link copied');
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      showError(t('shareFailed') || 'Could not copy link');
    }
  };

  const totalInvoiceAmount = Number(invoice?.gross_total || invoice?.total_gross || 0);
  const totalInvoiceExpenses = useMemo(() => {
    if (!invoiceExpenses) return 0;
    return invoiceExpenses.reduce((sum, expense) => sum + Number(expense?.total_amount || 0), 0);
  }, [invoiceExpenses]);
  const totalInvoiceProfit = totalInvoiceAmount - totalInvoiceExpenses;
  const statsCurrency = invoice?.currency || invoiceExpenses[0]?.currency || 'EUR';
  const paidTotal = sumPayments(payments);
  const debtRemaining = remainingBalance(totalInvoiceAmount, paidTotal);

  if (isLoading) {
    return (
      <div className="min-h-screen pt-2 px-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  const invoiceData = {
    ...invoice,
    document_number: invoice.document_no || invoice.document_number,
    due_date: invoice.due_date || '',
    gross_total: invoice.total_gross || invoice.gross_total,
    net_total: invoice.total_net || invoice.net_total,
    items: invoice.items || [],
    client_name: client?.name || invoice.client_name,
    client_address: client?.address || invoice.client_address,
    client_email: client?.email,
    client_phone: client?.phone,
    client_tax_number: client?.tax_number,
    signature_data_url: resolveCompanySignatureUrl(invoice, companyProfile),
    signed_by: invoice.signed_by,
    signed_at: invoice.signed_at,
  };

  return (
    <div className="invoice-print-root min-h-screen pt-2 pb-10 px-3 md:px-6 max-w-6xl mx-auto w-full min-w-0 overflow-x-clip">
      <div className="invoice-action-bar no-print mb-6">
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="flex items-center justify-center p-2 bg-white/10 backdrop-blur-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/20 rounded-xl mb-4 transition-all active:scale-95"
          title={t('back')}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex justify-between items-start gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-white mb-1">
              {t('invoicePreviewTitle')}
            </h2>
            <p className="text-white/60 text-sm break-words">
              {invoice.document_no || invoice.document_number}
            </p>
          </div>
        </div>

        {/* Primary mobile actions — Share stays one tap via Web Share API */}
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={downloadingPdf}
            className="min-h-[52px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium disabled:opacity-50"
            style={{
              background: 'var(--cpc-card)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 12,
              color: 'var(--cpc-text)',
            }}
          >
            <Download size={18} style={{ color: 'var(--cpc-copper-light)' }} />
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => void handleShareInvoice()}
            disabled={sharing}
            className="min-h-[52px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium disabled:opacity-50"
            style={{
              background: 'var(--cpc-copper)',
              border: '1px solid var(--cpc-copper)',
              borderRadius: 12,
              color: 'var(--cpc-on-copper)',
            }}
          >
            <Share2 size={18} />
            Share
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            type="button"
            onClick={handlePrint}
            className="bg-white/10 border border-white/10 text-white hover:bg-white/20"
          >
            <Printer size={16} className="mr-2" />
            {t('print') || 'Друкувати'}
          </Button>

          <Button
            type="button"
            onClick={() => navigate(`/invoices/${id}/edit`)}
            className="bg-white/10 border border-white/10 text-orange-400 hover:bg-white/20"
          >
            <Edit2 size={16} className="mr-2" />
            {t('edit') || 'Редагувати'}
          </Button>

          <Button
            type="button"
            onClick={() => {
              setEmailTo(client?.email || '');
              setLinkCopied(false);
              setShowEmailModal(true);
            }}
            className="bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30"
          >
            <Send size={16} className="mr-2" />
            {t('sendToClient') || t('sendInvoice') || 'Send to client'}
          </Button>

          <Button
            type="button"
            onClick={openPayModal}
            disabled={markingPaid || debtRemaining <= 0.009}
            className={
              debtRemaining <= 0.009
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-60'
                : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30'
            }
          >
            <CheckCircle size={16} className="mr-2" />
            {debtRemaining <= 0.009
              ? 'Paid'
              : payments.length > 0
                ? 'Додати оплату'
                : 'Mark as Paid'}
          </Button>

          {!invoice.signature_data_url && (
            <button
              type="button"
              onClick={() => setShowSignatureModal(true)}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-blue-400 transition-all active:scale-95"
              title={t('sign') || 'Підписати'}
            >
              <PenTool size={18} />
            </button>
          )}

          {pdfUrl && (
            <button
              type="button"
              onClick={() => setShowFullScreenPDF(true)}
              className="p-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-all active:scale-95"
              title={t('viewFile') || 'Переглянути PDF'}
            >
              <Eye size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="invoice-preview-chrome no-print grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3">
          <p className="text-white/40 text-xs mb-1">Сума інвойсу</p>
          <p className="text-white font-semibold text-sm">
            {formatMoney(totalInvoiceAmount, statsCurrency)}
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3">
          <p className="text-white/40 text-xs mb-1">Витрати по інвойсу</p>
          <p className="text-red-400 font-semibold text-sm">
            {formatMoney(totalInvoiceExpenses, statsCurrency)}
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3">
          <p className="text-white/40 text-xs mb-1">Маржа / прибуток</p>
          <p className={`font-semibold text-sm ${totalInvoiceProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatMoney(totalInvoiceProfit, statsCurrency)}
          </p>
        </div>
      </div>

      <InvoicePreview
        invoice={invoiceData}
        client={client}
        companyProfile={companyProfile}
      />

      {pdfUrl && (
        <div className="invoice-preview-chrome no-print bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              {t('invoicePreviewTitle') || 'PDF інвойсу'}
            </h3>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleShareInvoice()}
                disabled={sharing}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-400 transition-all disabled:opacity-60"
                title={t('share') || 'Поділитися'}
              >
                <Share2 size={20} />
              </button>

              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-blue-400 transition-all"
                title={t('download') || 'Завантажити'}
              >
                <Download size={20} />
              </a>

              <button
                type="button"
                onClick={() => setShowFullScreenPDF(true)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-orange-400 transition-all"
                title={t('view') || 'Переглянути'}
              >
                <Eye size={20} />
              </button>
            </div>
          </div>

          {!isMobile ? (
            <div className="rounded-xl overflow-hidden">
              <iframe
                src={`${pdfUrl}#view=FitH`}
                className="w-full border-0"
                style={{ height: '800px' }}
                title="Invoice PDF"
              />
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ height: '70vh' }}>
              <iframe
                src={`${pdfUrl}#toolbar=1&navpanes=0&view=FitH`}
                className="h-full w-full border-0 bg-white"
                style={{ width: '100%', height: '100%' }}
                title="Invoice PDF"
              />
            </div>
          )}
        </div>
      )}

      {invoiceExpenses.length > 0 && (
        <div className="invoice-preview-chrome no-print bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-5 w-5 text-red-400" />
            <h3 className="text-lg font-semibold text-white">
              Витрати по цьому інвойсу ({invoiceExpenses.length})
            </h3>
          </div>

          <div className="space-y-3">
            {invoiceExpenses.map((expense) => (
              <button
                key={expense.id}
                type="button"
                onClick={() => navigate(`/receipt/${expense.id}`)}
                className="w-full flex items-center justify-between gap-3 bg-white/5 hover:bg-white/10 rounded-xl p-4 transition-all text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                    <Receipt size={18} className="text-red-400" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-white font-medium break-words">
                      {expense.vendor_name || t('expense')}
                    </p>
                    <p className="text-white/50 text-sm break-words">
                      {expense.document_number || expense.expense_category || expense.document_type || t('expense')}
                    </p>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-white/40 mb-0.5">
                    {expense.document_date
                      ? new Date(expense.document_date).toLocaleDateString('uk-UA')
                      : '—'}
                  </div>
                  <div className="font-semibold text-red-400 text-sm">
                    {formatMoney(Number(expense.total_amount || 0), expense.currency || statsCurrency)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showSignatureModal && (
        <SignatureCanvas
          onSave={handleSaveSignature}
          onClose={() => setShowSignatureModal(false)}
          existingSignature={invoice.signature_data_url}
          existingSignerName={invoice.signed_by}
        />
      )}

      {payModalOpen && (
        <div className="no-print fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl max-w-md w-full border border-white/10">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Banknote className="text-emerald-400" size={24} />
                <div>
                  <h3 className="text-xl font-semibold text-white">Оплата</h3>
                  <p className="text-white/50 text-xs mt-0.5">
                    Залишок: {formatMoney(debtRemaining, payCurrency || statsCurrency)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPayModalOpen(false);
                  setPayMode(null);
                }}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="text-white" size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPayMode('full');
                    setPayAmount(
                      debtRemaining > 0
                        ? String(debtRemaining).replace('.', ',')
                        : String(totalInvoiceAmount).replace('.', ',')
                    );
                  }}
                  className="w-full text-left px-4 py-3.5 rounded-xl border transition-all"
                  style={{
                    background:
                      payMode === 'full' ? 'rgba(80,180,120,0.18)' : 'rgba(255,255,255,0.04)',
                    borderColor:
                      payMode === 'full' ? 'rgba(120,200,150,0.55)' : 'rgba(255,255,255,0.12)',
                  }}
                >
                  <p className="text-white font-medium">Оплата повністю</p>
                  <p className="text-white/50 text-xs mt-0.5">
                    {formatMoney(
                      debtRemaining > 0 ? debtRemaining : totalInvoiceAmount,
                      payCurrency || statsCurrency
                    )}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPayMode('partial')}
                  className="w-full text-left px-4 py-3.5 rounded-xl border transition-all"
                  style={{
                    background:
                      payMode === 'partial' ? 'rgba(80,180,120,0.18)' : 'rgba(255,255,255,0.04)',
                    borderColor:
                      payMode === 'partial' ? 'rgba(120,200,150,0.55)' : 'rgba(255,255,255,0.12)',
                  }}
                >
                  <p className="text-white font-medium">Оплата частинами</p>
                  <p className="text-white/50 text-xs mt-0.5">
                    Вкажіть суму, валюту та дату платежу
                  </p>
                </button>
              </div>

              {payMode === 'partial' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Сума
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={payAmount}
                      onChange={(e) => setPayAmount(maskMoneyTyping(e.target.value))}
                      placeholder="0,00"
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 tabular-nums"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        Валюта
                      </label>
                      <select
                        value={payCurrency}
                        onChange={(e) => setPayCurrency(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        {currencies.map((c) => (
                          <option key={c.code} value={c.code} className="bg-slate-900">
                            {c.code} ({c.symbol})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        Дата оплати
                      </label>
                      <input
                        type="date"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        style={{ colorScheme: 'dark' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {payMode === 'full' && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Дата оплати
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-white/10">
              <Button
                type="button"
                onClick={() => {
                  setPayModalOpen(false);
                  setPayMode(null);
                }}
                className="flex-1 bg-white/10 border border-white/10 text-white hover:bg-white/20"
              >
                {t('cancel') || 'Скасувати'}
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirmPayment()}
                disabled={markingPaid || !payMode}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {markingPaid ? 'Збереження...' : 'Підтвердити'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showEmailModal && (
        <div className="no-print fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl max-w-md w-full border border-white/10">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Mail className="text-green-400" size={24} />
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {t('sendToClient') || t('sendInvoice') || 'Send to client'}
                  </h3>
                  <p className="text-white/50 text-xs mt-0.5">
                    {t('emailOrLink') || 'Email the client or share a link'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft className="text-white" size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  {t('recipientEmail') || 'Email отримувача'}
                </label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder={t('enterEmail') || 'Введіть email'}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <Link2 size={16} />
                  {t('orShareLink') || t('shareableLink') || 'Shareable link'}
                </div>
                <p className="text-xs text-white/40 break-all">{shareablePreviewUrl}</p>
                <Button
                  type="button"
                  onClick={() => void handleCopyShareLink()}
                  className="w-full bg-white/10 border border-white/10 text-white hover:bg-white/20"
                >
                  <Copy size={16} className="mr-2" />
                  {linkCopied
                    ? (t('linkCopied') || 'Link copied')
                    : (t('copyLink') || 'Copy link')}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleShareInvoice()}
                  disabled={sharing}
                  className="w-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/30"
                >
                  <Share2 size={16} className="mr-2" />
                  {t('share') || 'Share'}
                </Button>
              </div>

              {invoice.sent_at && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <p className="text-sm text-blue-300">
                    {t('previouslySent') || 'Раніше відправлено на'}: {invoice.sent_to}
                  </p>
                  <p className="text-xs text-blue-300/60 mt-1">
                    {new Date(invoice.sent_at).toLocaleString('uk-UA')}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-white/10">
              <Button
                onClick={() => setShowEmailModal(false)}
                className="flex-1 bg-white/10 border border-white/10 text-white hover:bg-white/20"
              >
                {t('cancel') || 'Скасувати'}
              </Button>

              <Button
                onClick={handleSendEmail}
                disabled={sendingEmail || !emailTo.trim()}
                className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingEmail ? (
                  t('sending') || 'Відправка...'
                ) : (
                  <>
                    <Send size={18} className="mr-2" />
                    {t('send') || 'Відправити'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showFullScreenPDF && pdfUrl && (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col">
          <div className="bg-slate-900 border-b border-white/10 p-3 md:p-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setShowFullScreenPDF(false);
                  setPdfZoom(100);
                }}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft className="text-white" size={20} />
              </button>

              <h3 className="text-sm md:text-lg font-semibold text-white truncate">
                {invoice.document_no || invoice.document_number}
              </h3>
            </div>

            <div className="flex items-center gap-1 md:gap-2">
              {!isMobile && (
                <>
                  <button
                    type="button"
                    onClick={() => setPdfZoom((prev) => Math.max(50, prev - 10))}
                    disabled={pdfZoom <= 50}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ZoomOut className="text-white" size={18} />
                  </button>

                  <span className="text-white font-medium text-sm min-w-[60px] text-center">
                    {pdfZoom}%
                  </span>

                  <button
                    type="button"
                    onClick={() => setPdfZoom((prev) => Math.min(200, prev + 10))}
                    disabled={pdfZoom >= 200}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ZoomIn className="text-white" size={18} />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => void handleShareInvoice()}
                disabled={sharing}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-60"
                title={t('share') || 'Поділитися'}
              >
                <Share2 className="text-cyan-400" size={18} />
              </button>

              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title={t('download') || 'Завантажити'}
              >
                <Download className="text-white" size={18} />
              </a>
            </div>
          </div>

          <div className="relative flex-1 min-h-0 overflow-hidden bg-slate-800">
            {isMobile ? (
              <iframe
                src={`${pdfUrl}#toolbar=1&navpanes=0&view=FitH`}
                className="absolute inset-0 h-full w-full border-0 bg-white"
                style={{ width: '100%', height: '100%', minHeight: '100%' }}
                title="Invoice PDF Fullscreen"
              />
            ) : (
              <div className="h-full overflow-auto p-4 flex justify-center">
                <div
                  className="bg-white shadow-2xl"
                  style={{
                    transform: `scale(${pdfZoom / 100})`,
                    transformOrigin: 'top center',
                    width: '210mm',
                  }}
                >
                  <iframe
                    src={`${pdfUrl}#view=FitH`}
                    className="w-full border-0"
                    style={{ height: 'calc(100vh - 90px)', minHeight: '600px' }}
                    title="Invoice PDF Fullscreen"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};