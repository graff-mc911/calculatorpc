import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { translations, translateUnit } from './languages';
import { expandItemsForInvoiceTable } from './invoiceTotals';
import { ensurePdfUnicodeFont } from './pdfUnicodeFont';
import { formatUnitForPdf } from './invoiceUnits';

interface InvoiceItem {
  description: string;
  material?: string | number;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  is_section?: boolean;
}

interface CompanyProfile {
  company_name?: string;
  company_address?: string;
  company_phone?: string;
  company_email?: string;
  company_tax_number?: string;
  company_bank?: string;
  company_iban?: string;
  company_bic?: string;
}

interface InvoiceData {
  document_number: string;
  date: string;
  client_name: string;
  client_address?: string;
  client_tax_number?: string;
  client_number?: string;
  currency: string;
  items: InvoiceItem[];
  vat_enabled: boolean;
  vat_rate: number;
  notes?: string;
  signature_data_url?: string;
  signed_by?: string;
  service_period_start?: string;
  service_period_end?: string;
  work_period_start?: string;
  work_period_end?: string;
  object_address?: string;
  invoice_language?: string;
}

function formatDeDate(raw?: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('de-DE');
}

function money(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * DIN 5008 / German construction invoice PDF — mirrors InvoiceDocument layout.
 * Labels from translations[invoice_language] (document language of the invoice).
 */
export const generateInvoicePDF = async (
  invoice: InvoiceData,
  company: CompanyProfile,
  logoUrl?: string,
): Promise<jsPDF> => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const font = await ensurePdfUnicodeFont(doc);

  const leftMargin = 20;
  const rightMargin = 18;
  const topMargin = 15;
  let y = topMargin;

  // invoice_language is the document language (from import/form), not UI locale
  const lang = (invoice.invoice_language || 'en') as keyof typeof translations;
  const dict = translations[lang] || translations.en;
  const t = (key: string): string =>
    ((dict as Record<string, string>)[key] as string) ||
    ((translations.en as Record<string, string>)[key] as string) ||
    key;

  const periodStart = invoice.work_period_start || invoice.service_period_start || invoice.date;
  const periodEnd =
    invoice.work_period_end || invoice.service_period_end || periodStart || invoice.date;
  const periodText =
    periodStart && periodEnd && periodStart !== periodEnd
      ? `${formatDeDate(periodStart)} ${t('servicePeriodTo')} ${formatDeDate(periodEnd)}`
      : formatDeDate(periodStart || invoice.date);

  // —— Header: logo + company (left only, sample RE0009) ——
  if (logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      doc.addImage(img, 'PNG', leftMargin, y, 40, 18);
      y += 20;
    } catch {
      console.warn('Failed to load logo');
    }
  }

  doc.setFont(font, 'bold');
  doc.setFontSize(11);
  if (company.company_name) {
    doc.text(company.company_name, leftMargin, y);
    y += 5;
  }
  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  if (company.company_address) {
    company.company_address.split('\n').forEach((line) => {
      doc.text(line, leftMargin, y);
      y += 4;
    });
  }
  if (company.company_phone) {
    doc.text(`${t('phoneLabel')}: ${company.company_phone}`, leftMargin, y);
    y += 4;
  }
  if (company.company_email) {
    doc.text(company.company_email, leftMargin, y);
    y += 4;
  }
  y += 6;

  // —— Recipient left + meta right (sample RE0009) ——
  const blockTop = y;
  const metaXLabel = pageWidth - rightMargin - 62;
  const metaXValue = pageWidth - rightMargin;
  let metaY = blockTop;
  doc.setFontSize(9);
  const metaRows: Array<[string, string]> = [
    [t('invoiceNumber'), invoice.document_number],
    [t('customerNumber'), invoice.client_number || '—'],
    [t('date'), formatDeDate(invoice.date)],
    [t('performancePeriod'), periodText],
  ];
  metaRows.forEach(([label, value]) => {
    doc.setFont(font, 'normal');
    doc.text(`${label}:`, metaXLabel, metaY);
    doc.text(value, metaXValue, metaY, { align: 'right' });
    metaY += 5;
  });

  let leftY = blockTop;
  doc.setFontSize(6.5);
  doc.setFont(font, 'normal');
  if (company.company_name && company.company_address) {
    const ret = `${company.company_name}, ${company.company_address.split('\n').join(', ')}`;
    doc.text(ret, leftMargin, leftY);
    const tw = doc.getTextWidth(ret);
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(leftMargin, leftY + 0.8, leftMargin + tw, leftY + 0.8);
    leftY += 6;
  }

  doc.setFontSize(10);
  doc.setFont(font, 'bold');
  if (invoice.client_name) {
    doc.text(invoice.client_name, leftMargin, leftY);
    leftY += 5;
  }
  doc.setFont(font, 'normal');
  if (invoice.client_address) {
    invoice.client_address.split('\n').forEach((line) => {
      doc.text(line, leftMargin, leftY);
      leftY += 4.2;
    });
  }

  y = Math.max(leftY, metaY) + 6;

  // —— Title + BVH ——
  doc.setFontSize(14);
  doc.setFont(font, 'bold');
  doc.text(`${t('invoiceTitle')} ${invoice.document_number}`, leftMargin, y);
  y += 7;

  if (invoice.object_address) {
    doc.setFontSize(10);
    doc.text(`${t('projectRefBvh')}: ${invoice.object_address}`, leftMargin, y);
    y += 6;
  }

  // —— Intro ——
  doc.setFontSize(10);
  doc.setFont(font, 'normal');
  const contentWidth = pageWidth - leftMargin - rightMargin;
  doc.text(`${t('dearSalutation')},`, leftMargin, y);
  y += 6;
  const intro = doc.splitTextToSize(t('thankYouText'), contentWidth);
  doc.text(intro, leftMargin, y);
  y += intro.length * 4.5 + 3;
  const quality = doc.splitTextToSize(t('qualityText'), contentWidth);
  doc.text(quality, leftMargin, y);
  y += quality.length * 4.5 + 6;

  // —— Items (Lexware-style: material = own flat-rate row) ——
  const tableRows = expandItemsForInvoiceTable(invoice.items || [], {
    materialLabel: t('material'),
    pauschalUnit: t('unitPauschal'),
  }).map((row) =>
    row.is_section
      ? row
      : {
          ...row,
          unit:
            lang === 'es'
              ? formatUnitForPdf(row.unit, lang)
              : translateUnit(row.unit, t),
        }
  );

  let pos = 0;
  const body = tableRows.map((item) => {
    if (item.is_section) {
      return [
        {
          content: item.description,
          colSpan: 6,
          styles: { fontStyle: 'bold', fillColor: [245, 245, 245] },
        },
      ];
    }
    pos += 1;
    return [
      String(pos),
      item.description,
      Number(item.quantity).toLocaleString('de-DE'),
      item.unit,
      money(item.price),
      money(item.total),
    ];
  });

  const netTotal = tableRows.reduce((s, i) => (i.is_section ? s : s + i.total), 0);
  const vatAmount = invoice.vat_enabled ? (netTotal * invoice.vat_rate) / 100 : 0;
  const grossTotal = netTotal + vatAmount;
  const footerReserve = 32;
  const bottomMargin = footerReserve + 8;

  if (invoice.vat_enabled) {
    body.push([
      { content: t('netAmount'), colSpan: 5, styles: { fontStyle: 'bold' } },
      { content: money(netTotal), styles: { halign: 'right' } },
    ] as any);
    body.push([
      { content: `${t('vat')} ${invoice.vat_rate} %`, colSpan: 5 },
      { content: money(vatAmount), styles: { halign: 'right' } },
    ] as any);
  }
  body.push([
    {
      content: invoice.vat_enabled
        ? t('grossAmount')
        : String(t('totalAmountStar')).replace(/\*+\s*$/, ''),
      colSpan: 5,
      styles: { fontStyle: 'bold' },
    },
    { content: money(grossTotal), styles: { fontStyle: 'bold', halign: 'right' } },
  ] as any);

  const drawPageFooter = (pageNumber: number, pageCount: number) => {
    const footerY = pageHeight - 28;
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(leftMargin, footerY - 3, pageWidth - rightMargin, footerY - 3);

    doc.setFontSize(7);
    let fl = footerY;
    doc.setFont(font, 'bold');
    if (company.company_name) {
      doc.text(company.company_name, leftMargin, fl);
      fl += 3.2;
    }
    doc.setFont(font, 'normal');
    if (company.company_address) {
      doc.text(company.company_address.split('\n').join(', '), leftMargin, fl);
      fl += 3.2;
    }
    if (company.company_phone) {
      doc.text(`${t('phoneLabel')}: ${company.company_phone}`, leftMargin, fl);
      fl += 3.2;
    }
    if (company.company_email) {
      doc.text(company.company_email, leftMargin, fl);
    }

    const centerX = pageWidth / 2;
    let fc = footerY;
    if (company.company_tax_number) {
      const taxLine = `${t('taxNumber')}: ${company.company_tax_number}${
        invoice.signed_by ? ` ${invoice.signed_by}` : ''
      }`;
      doc.text(taxLine, centerX, fc, { align: 'center' });
      fc += 3.5;
    }
    doc.text(`${t('pageLabel')} ${pageNumber}/${pageCount}`, centerX, fc, { align: 'center' });

    let fr = footerY;
    const rightX = pageWidth - rightMargin;
    if (company.company_bank) {
      doc.text(company.company_bank, rightX, fr, { align: 'right' });
      fr += 3.2;
    }
    if (company.company_iban) {
      doc.text(`${t('ibanLabel')}: ${company.company_iban}`, rightX, fr, { align: 'right' });
      fr += 3.2;
    }
    if (company.company_bic) {
      doc.text(`${t('bicLabel')}: ${company.company_bic}`, rightX, fr, { align: 'right' });
    }
  };

  autoTable(doc, {
    startY: y,
    head: [
      [
        t('position'),
        t('designation'),
        lang === 'es' ? t('quantityShort') : t('amountShort'),
        t('unit'),
        t('unitPriceShort'),
        t('totalPriceShort'),
      ],
    ],
    body: body as any,
    theme: 'grid',
    styles: {
      font,
      fontSize: 9,
      cellPadding: 2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: 'linebreak',
    },
    headStyles: {
      font,
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'left' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
    },
    // Keep table inside A4; continue on next pages when rows overflow
    margin: {
      left: leftMargin,
      right: rightMargin,
      top: topMargin,
      bottom: bottomMargin,
    },
    rowPageBreak: 'auto',
    showHead: 'everyPage',
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  const contentWidthNotes = pageWidth - leftMargin - rightMargin;

  // Notes block only (under table). New page if it does not fit.
  const notesTitle = t('notes');
  const notesBody = invoice.notes?.trim() || '—';
  const notesLines = doc.splitTextToSize(notesBody, contentWidthNotes);
  let notesBlockH = 6 + notesLines.length * 4.5;
  if (invoice.signed_by) notesBlockH += 8;
  if (invoice.signature_data_url) notesBlockH += 18;

  if (y + notesBlockH > pageHeight - bottomMargin) {
    doc.addPage();
    y = topMargin;
  }

  doc.setFont(font, 'bold');
  doc.text(notesTitle, leftMargin, y);
  y += 5;
  doc.setFont(font, 'normal');
  doc.text(notesLines, leftMargin, y);
  y += notesLines.length * 4.5 + 4;

  if (invoice.signed_by) {
    doc.setFont(font, 'bold');
    doc.text(invoice.signed_by, leftMargin, y);
    doc.setFont(font, 'normal');
    y += 6;
  }

  if (invoice.signature_data_url) {
    if (y + 18 > pageHeight - bottomMargin) {
      doc.addPage();
      y = topMargin;
    }
    try {
      doc.addImage(invoice.signature_data_url, 'PNG', leftMargin, y, 40, 15);
      y += 18;
    } catch {
      /* ignore */
    }
  }

  // Footer + correct page numbers on every A4 page
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawPageFooter(p, pageCount);
  }

  return doc;
};

const loadImage = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
};

export const downloadInvoicePDF = async (
  invoice: InvoiceData,
  company: CompanyProfile,
  logoUrl?: string,
) => {
  const doc = await generateInvoicePDF(invoice, company, logoUrl);
  doc.save(`Rechnung_${invoice.document_number}.pdf`);
};

export const generateInvoicePDFBlob = async (
  invoice: InvoiceData,
  company: CompanyProfile,
  logoUrl?: string,
): Promise<Blob> => {
  const doc = await generateInvoicePDF(invoice, company, logoUrl);
  return doc.output('blob');
};
