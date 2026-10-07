import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ensurePdfUnicodeFont } from './pdfUnicodeFont';
import { shareOrDownloadPdf } from './shareInvoice';
import { formatCurrency, formatMoneyInput } from './moneyMask';
import { computeProjectMetrics, lineTotal } from './projectMetrics';
import type {
  Project,
  ProjectExpense,
  ProjectPrepayment,
  ProjectWorkItem,
} from './projectsApi';

export type ProjectPdfMode = 'client' | 'internal';

type CompanyProfile = {
  company_name?: string | null;
  company_address?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  company_tax_number?: string | null;
  company_iban?: string | null;
  company_bic?: string | null;
  company_bank?: string | null;
  logo_url?: string | null;
};

export type PdfLabels = {
  estimateTitle: string;
  internalTitle?: string;
  client: string;
  address: string;
  works: string;
  qty: string;
  unit: string;
  unitPrice: string;
  total: string;
  estimateTotal: string;
  received: string;
  balanceDue: string;
  overpayment?: string;
  expenses: string;
  projectedProfit: string;
  margin: string;
  prepayments: string;
  ungrouped: string;
  date: string;
  note: string;
  category?: string;
  bank?: string;
};

function money(n: number, currency?: string): string {
  if (currency) return formatCurrency(n, currency);
  return formatMoneyInput(n, 2);
}

function formatDate(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('de-DE');
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  if (dataUrl.includes('iVBORw0KGgo')) return 'PNG';
  if (dataUrl.includes('/9j/')) return 'JPEG';
  return 'PNG';
}

async function loadLogo(
  url?: string | null
): Promise<{ data: string; format: 'PNG' | 'JPEG' | 'WEBP' } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!data) return null;
    const format = detectImageFormat(data);
    if (!format) return null;
    return { data, format };
  } catch {
    return null;
  }
}

function groupWorks(items: ProjectWorkItem[]): Array<{ key: string; items: ProjectWorkItem[] }> {
  const map = new Map<string, ProjectWorkItem[]>();
  for (const item of items) {
    const key = (item.group_key || '').trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([key, groupItems]) => ({ key, items: groupItems }));
}

export async function generateProjectEstimatePdf(options: {
  project: Project;
  workItems: ProjectWorkItem[];
  expenses: ProjectExpense[];
  prepayments: ProjectPrepayment[];
  company: CompanyProfile;
  labels: PdfLabels;
  /** client = commercial (no expenses). internal = cost report with expenses. */
  mode?: ProjectPdfMode;
}): Promise<jsPDF> {
  const {
    project,
    workItems,
    expenses,
    prepayments,
    company,
    labels,
    mode = 'client',
  } = options;
  const isInternal = mode === 'internal';
  const metrics = computeProjectMetrics(
    workItems,
    expenses,
    prepayments,
    Number(project.expense_budget) || 0
  );

  const doc = new jsPDF('p', 'mm', 'a4');
  const font = await ensurePdfUnicodeFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 16;
  const right = pageWidth - 16;
  let y = 14;

  doc.setFillColor(30, 39, 46);
  doc.rect(0, 0, pageWidth, 36, 'F');

  const logo = await loadLogo(company.logo_url);
  let logoOk = false;
  if (logo) {
    try {
      doc.addImage(logo.data, logo.format, left, 8, 22, 22);
      logoOk = true;
    } catch {
      try {
        doc.addImage(logo.data, 'JPEG', left, 8, 22, 22);
        logoOk = true;
      } catch {
        logoOk = false;
      }
    }
  }

  const textX = logoOk ? left + 26 : left;
  doc.setTextColor(255, 255, 255);
  doc.setFont(font, 'bold');
  doc.setFontSize(14);
  doc.text(company.company_name || 'SCB Light', textX, 14);
  doc.setFont(font, 'normal');
  doc.setFontSize(8);
  const companyLines = [
    company.company_address,
    [company.company_phone, company.company_email].filter(Boolean).join(' · '),
    company.company_tax_number ? `Tax: ${company.company_tax_number}` : '',
  ].filter(Boolean) as string[];
  let cy = 19;
  for (const line of companyLines.slice(0, 3)) {
    doc.text(line, textX, cy);
    cy += 3.5;
  }

  const title = isInternal
    ? labels.internalTitle || labels.estimateTitle
    : labels.estimateTitle;

  doc.setFont(font, 'bold');
  doc.setFontSize(13);
  doc.text(title, right, 14, { align: 'right' });
  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  doc.text(project.name, right, 20, { align: 'right' });
  doc.text(formatDate(new Date().toISOString()), right, 25, { align: 'right' });
  if (project.status) {
    doc.text(String(project.status).replace('_', ' '), right, 30, { align: 'right' });
  }

  y = 44;
  doc.setTextColor(30, 39, 46);

  doc.setFillColor(245, 247, 249);
  doc.roundedRect(left, y, pageWidth - 32, 22, 2, 2, 'F');
  doc.setFont(font, 'bold');
  doc.setFontSize(9);
  doc.text(labels.client, left + 4, y + 6);
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  doc.text(project.client_name || '—', left + 4, y + 12);
  if (project.address) {
    doc.setFont(font, 'bold');
    doc.setFontSize(8);
    doc.text(labels.address, left + 70, y + 6);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    const addrLines = doc.splitTextToSize(project.address, pageWidth - left - 78);
    doc.text(addrLines, left + 70, y + 12);
  }
  y += 28;

  doc.setFont(font, 'bold');
  doc.setFontSize(11);
  doc.text(labels.works, left, y);
  y += 3;

  const body: string[][] = [];
  for (const group of groupWorks(workItems)) {
    if (group.key) {
      body.push([`▸ ${group.key}`, '', '', '', '']);
    } else if (workItems.some((w) => (w.group_key || '').trim())) {
      body.push([`▸ ${labels.ungrouped}`, '', '', '', '']);
    }
    for (const item of group.items) {
      body.push([
        item.title,
        String(item.quantity).replace('.', ','),
        item.unit,
        formatMoneyInput(Number(item.unit_price) || 0, 2),
        formatMoneyInput(lineTotal(item.quantity, item.unit_price), 2),
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [[labels.works, labels.qty, labels.unit, labels.unitPrice, labels.total]],
    body: body.length ? body : [['—', '', '', '', '']],
    styles: { font, fontSize: 9, cellPadding: 2.2, textColor: [30, 39, 46] },
    headStyles: { fillColor: [30, 39, 46], textColor: 255, font, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 28 },
    },
    margin: { left, right: 16 },
    didParseCell(data) {
      const raw = data.row.raw;
      const first = Array.isArray(raw) ? String(raw[0] ?? '') : '';
      if (data.section === 'body' && first.startsWith('▸')) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 236, 240];
      }
    },
  });

  y = ((doc as any).lastAutoTable?.finalY || y) + 8;

  if (prepayments.length > 0) {
    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.text(labels.prepayments, left, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [[labels.date, labels.note, labels.total]],
      body: prepayments.map((p) => [
        formatDate(p.paid_at),
        p.note || '—',
        formatMoneyInput(Number(p.amount) || 0, 2),
      ]),
      styles: { font, fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 39, 46], textColor: 255, font },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 100 },
        2: { halign: 'right', cellWidth: 40 },
      },
      margin: { left, right: 16 },
    });
    y = ((doc as any).lastAutoTable?.finalY || y) + 8;
  }

  // Internal-only: expenses table (never on client commercial PDF)
  if (isInternal && expenses.length > 0) {
    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.text(labels.expenses, left, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [[labels.date, labels.works, labels.category || '', labels.total]],
      body: expenses.map((e) => [
        formatDate(e.expense_date),
        e.title,
        String(e.category || ''),
        formatMoneyInput(Number(e.amount) || 0, 2),
      ]),
      styles: { font, fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [120, 40, 40], textColor: 255, font },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 78 },
        2: { cellWidth: 32 },
        3: { halign: 'right', cellWidth: 32 },
      },
      margin: { left, right: 16 },
    });
    y = ((doc as any).lastAutoTable?.finalY || y) + 8;
  }

  const cur = project.currency || 'EUR';
  const summary: Array<[string, string]> = [
    [labels.estimateTotal, money(metrics.estimateTotal, cur)],
    [labels.received, money(metrics.received, cur)],
    [labels.balanceDue, money(metrics.balanceDue, cur)],
  ];
  if (metrics.overpayment > 0 && labels.overpayment) {
    summary.push([labels.overpayment, money(metrics.overpayment, cur)]);
  }
  // Client PDF must NOT leak internal cost / profit
  if (isInternal) {
    summary.push(
      [labels.expenses, money(metrics.expenses, cur)],
      [labels.projectedProfit, money(metrics.projectedProfit, cur)],
      [labels.margin, `${formatMoneyInput(metrics.marginPct, 1)} %`]
    );
  }

  autoTable(doc, {
    startY: y,
    body: summary,
    theme: 'plain',
    styles: { font, fontSize: 10, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 55, halign: 'right' },
    },
    margin: { left: pageWidth - 16 - 110 },
  });

  const bankBits = [
    company.company_bank,
    company.company_iban ? `IBAN ${company.company_iban}` : '',
    company.company_bic ? `BIC ${company.company_bic}` : '',
  ].filter(Boolean);
  if (bankBits.length) {
    const footerY = doc.internal.pageSize.getHeight() - 14;
    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(bankBits.join(' · '), left, footerY);
  }

  return doc;
}

export async function shareProjectEstimatePdf(options: {
  project: Project;
  workItems: ProjectWorkItem[];
  expenses: ProjectExpense[];
  prepayments: ProjectPrepayment[];
  company: CompanyProfile;
  labels: PdfLabels;
  mode?: ProjectPdfMode;
}): Promise<'shared' | 'downloaded'> {
  const mode = options.mode || 'client';
  const doc = await generateProjectEstimatePdf({ ...options, mode });
  const blob = doc.output('blob');
  const prefix = mode === 'internal' ? 'cost' : 'estimate';
  const fileName = `${prefix}-${options.project.name.replace(/[^\w\-]+/g, '_').slice(0, 40)}.pdf`;
  const title =
    mode === 'internal'
      ? options.labels.internalTitle || options.labels.estimateTitle
      : options.labels.estimateTitle;
  return shareOrDownloadPdf({
    blob,
    fileName,
    title,
    text: options.project.name,
  });
}
