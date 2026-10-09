import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { InvoiceDocument } from './invoice/Din5008InvoiceDocument';
import { useLanguage } from '../contexts/LanguageContext';
import { calculateLineTotal } from '../lib/invoiceTotals';
import {
  buildCompanyFromInvoice,
  resolveCompanyLogoUrl,
  resolveCompanySignatureUrl,
} from '../lib/companyProfile';

interface InvoicePreviewProps {
  invoice: any;
  client?: any;
  companyProfile?: any;
  onClose?: () => void;
}

/** A4 @ 96dpi — matches InvoiceDocument fixed layout width */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

/**
 * Scales the fixed A4 InvoiceDocument to fit the container width so mobile
 * never clips meta/table columns. Optional zoom multiplies the fit scale.
 */
function ScaledInvoiceSurface({
  data,
  zoom = 1,
  className = '',
  allowScrollWhenZoomed = true,
}: {
  data: any;
  zoom?: number;
  className?: string;
  allowScrollWhenZoomed?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const pad = 2;
      const available = Math.max(el.clientWidth - pad, 120);
      setFitScale(Math.min(available / A4_WIDTH_PX, 1));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('orientationchange', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  const scale = fitScale * zoom;
  const scaledW = A4_WIDTH_PX * scale;
  const scaledH = A4_HEIGHT_PX * scale;
  const overflowX = allowScrollWhenZoomed && zoom > 1.01;

  return (
    <div
      ref={containerRef}
      className={`w-full max-w-full ${overflowX ? 'overflow-x-auto' : 'overflow-x-hidden'} ${className}`}
    >
      <div
        className="relative mx-auto"
        style={{
          width: overflowX ? scaledW : '100%',
          maxWidth: '100%',
          height: scaledH,
        }}
      >
        <div
          className="bg-white shadow-lg origin-top-left"
          style={{
            width: A4_WIDTH_PX,
            minHeight: A4_HEIGHT_PX,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <InvoiceDocument data={data} />
        </div>
      </div>
    </div>
  );
}

export const InvoicePreview: React.FC<InvoicePreviewProps> = ({
  invoice,
  client,
  companyProfile,
  onClose,
}) => {
  const { t, language } = useLanguage();
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!onClose) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [onClose]);

  const companyData = useMemo(
    () => buildCompanyFromInvoice(invoice, companyProfile),
    [invoice, companyProfile],
  );

  const companyLogoUrl = useMemo(
    () => resolveCompanyLogoUrl(invoice, companyProfile),
    [invoice, companyProfile],
  );

  const invoiceData = useMemo(
    () => ({
      document_number: invoice?.document_number || invoice?.document_no || '',
      date: invoice?.date || '',
      due_date: invoice?.due_date || '',
      work_period_start: invoice?.work_period_start || '',
      work_period_end: invoice?.work_period_end || '',
      client_name: client?.name || invoice?.client_name || '',
      client_number: invoice?.client_number || client?.client_number || '',
      client_address: client?.address || invoice?.client_address || '',
      client_tax_number: client?.tax_number || invoice?.client_tax_number || '',
      client_email: client?.email || invoice?.client_email || '',
      client_phone: client?.phone || invoice?.client_phone || '',
      currency: invoice?.currency || 'EUR',
      items: (invoice?.items || []).map((i: any) => {
        const quantity = Number(i.quantity) || 0;
        const price = Number(i.price) || 0;
        const material = i.material ?? '';
        const total =
          i.total != null && Number.isFinite(Number(i.total))
            ? Number(i.total)
            : calculateLineTotal(quantity, price, material);
        return {
          description: i.description || '',
          material,
          quantity,
          unit: i.unit,
          price,
          total,
          is_section: !!i.is_section,
        };
      }),
      vat_enabled: !!invoice?.vat_enabled,
      vat_rate: invoice?.vat_rate || 0,
      object_address: invoice?.object_address || '',
      notes: invoice?.notes || '',
      service_period_start: invoice?.work_period_start || '',
      service_period_end: invoice?.work_period_end || '',
      invoice_language: language || invoice?.invoice_language || 'en',
      signature_data_url: resolveCompanySignatureUrl(invoice, companyProfile),
      signed_by: invoice?.signed_by || '',
      signed_at: invoice?.signed_at || '',
      company_name: companyData.company_name,
      company_address: companyData.company_address,
      company_phone: companyData.company_phone,
      company_email: companyData.company_email,
      company_tax_number: companyData.company_tax_number,
      company_bank: companyData.company_bank,
      company_iban: companyData.company_iban,
      company_bic: companyData.company_bic,
      company_logo_url: companyLogoUrl,
    }),
    [invoice, client, companyProfile, companyData, companyLogoUrl, language],
  );

  const zoomIn = () => setZoom((z) => Math.min(z + 0.15, 2.5));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.5));
  const resetZoom = () => setZoom(1);

  // Inline (InvoiceView page) — scale-to-fit, no app-chrome overflow
  if (!onClose) {
    return (
      <div className="w-full max-w-full overflow-x-hidden rounded-2xl border border-white/10 bg-neutral-900/40 p-2 sm:p-3">
        <ScaledInvoiceSurface data={invoiceData} zoom={1} />
      </div>
    );
  }

  // Modal preview
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-full flex-col overflow-hidden">
        <div className="flex items-center justify-between bg-black/70 p-3 flex-shrink-0 gap-2">
          <span className="text-white text-sm sm:text-base truncate">{t('preview')}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={zoomOut} className="rounded-lg bg-white/10 p-2 text-white" aria-label="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </button>
            <button type="button" onClick={zoomIn} className="rounded-lg bg-white/10 p-2 text-white" aria-label="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" onClick={resetZoom} className="rounded-lg bg-white/10 p-2 text-white" aria-label="Reset zoom">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button type="button" onClick={onClose} className="rounded-lg bg-white/10 p-2 text-white" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-neutral-900 p-2 sm:p-4">
          <ScaledInvoiceSurface data={invoiceData} zoom={zoom} allowScrollWhenZoomed />
        </div>
      </div>
    </div>
  );
};
