import { supabase } from './supabase';
import { calculateLineTotal } from './invoiceTotals';
import { generateInvoicePDFBlob } from './pdfGenerator';
import { fetchPdfBlob } from './shareInvoice';
import { invoicePdfFileName } from './languages';
import {
  buildCompanyFromInvoice,
  resolveCompanyLogoUrl,
  resolveCompanySignatureUrl,
} from './companyProfile';

type AnyInvoice = Record<string, any>;

async function generatePdfFromInvoice(
  invoice: AnyInvoice,
  userId: string,
  companyProfile?: AnyInvoice | null,
  labelLanguage?: string
): Promise<Blob> {
  const { data: itemsData } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('sort_order');

  let clientName = invoice.clients?.name || invoice.client_name || '';
  let clientAddress = invoice.client_address || '';
  let clientTaxNumber = invoice.client_tax_number || '';
  let clientNumber = invoice.client_number || '';

  if (invoice.client_id) {
    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .eq('id', invoice.client_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (clientData) {
      clientName = clientData.name || clientName;
      clientAddress = clientData.address || clientAddress;
      clientTaxNumber = clientData.tax_number || clientTaxNumber;
      clientNumber = clientData.client_number || clientNumber;
    }
  }

  const items =
    itemsData?.map((item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const material = item.material || '';
      return {
        description: item.description || '',
        material,
        quantity,
        unit: item.unit || '',
        price,
        total: calculateLineTotal(quantity, price, material),
      };
    }) || [];

  const invoicePayload = {
    document_number: invoice.document_no || invoice.document_number || '',
    date: invoice.date || new Date().toISOString().split('T')[0],
    client_name: clientName,
    client_address: clientAddress,
    client_tax_number: clientTaxNumber,
    client_number: clientNumber,
    currency: invoice.currency || 'EUR',
    items,
    vat_enabled: !!invoice.vat_enabled || Number(invoice.tax_percent || 0) > 0,
    vat_rate: invoice.vat_rate || invoice.tax_percent || 0,
    notes: invoice.notes || '',
    signature_data_url: resolveCompanySignatureUrl(invoice, companyProfile),
    signed_by: invoice.signed_by || '',
    service_period_start: invoice.work_period_start,
    service_period_end: invoice.work_period_end,
    object_address: invoice.object_address || '',
    // Prefer current UI language (language list), then stored snapshot
    invoice_language: labelLanguage || invoice.invoice_language || 'en',
  };

  const companyData = buildCompanyFromInvoice(invoice, companyProfile);
  const logoUrl = resolveCompanyLogoUrl(invoice, companyProfile);

  return generateInvoicePDFBlob(invoicePayload, companyData, logoUrl);
}

/**
 * Resolve a shareable/downloadable PDF for a saved invoice row.
 * Created invoices are always regenerated in the current app language.
 */
export async function resolveInvoicePdfFile(
  invoice: AnyInvoice,
  userId: string,
  companyProfile?: AnyInvoice | null,
  labelLanguage?: string
): Promise<{ blob: Blob; fileName: string }> {
  const docNo = invoice.document_no || invoice.document_number || invoice.id || 'invoice';
  const lang = labelLanguage || invoice.invoice_language || 'en';
  const fileName = invoicePdfFileName(lang, String(docNo));

  // Uploaded external PDFs keep their original file
  if (invoice.source === 'uploaded') {
    const candidateUrls = [
      invoice.uploaded_pdf_url,
      invoice.pdf_url,
    ].filter((url): url is string => typeof url === 'string' && url.length > 0);

    for (const url of candidateUrls) {
      try {
        const blob = await fetchPdfBlob(url);
        return { blob, fileName };
      } catch (error) {
        console.warn('Could not fetch invoice PDF url', url, error);
      }
    }
    throw new Error(`PDF not available for invoice ${docNo}`);
  }

  // Always regenerate created invoices in the current app language
  const blob = await generatePdfFromInvoice(invoice, userId, companyProfile, lang);
  return { blob, fileName };
}

export async function resolveInvoicePdfFiles(
  invoices: AnyInvoice[],
  userId: string,
  companyProfile?: AnyInvoice | null,
  labelLanguage?: string
): Promise<Array<{ blob: Blob; fileName: string }>> {
  const files: Array<{ blob: Blob; fileName: string }> = [];

  for (const invoice of invoices) {
    files.push(await resolveInvoicePdfFile(invoice, userId, companyProfile, labelLanguage));
  }

  return files;
}
